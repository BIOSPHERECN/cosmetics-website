#!/usr/bin/env python3
"""货架快照 —— 数据层不可用时的兜底。

起因(2026-09-07 凌晨的真实事故):把三千六百款包材接进来那一夜,
我用 ?cb=随机数 绕过边缘缓存反复验证,而当时的货架页每次未缓存加载要扫全表算筛选计数,
把 D1 免费档 500 万行/天的读额度烧穿。结果三个库同时变成空货架 ——
页面照常返回 200,一件商品都没有,而且要等 UTC 零点才恢复。

暴露出的问题不是「额度不够」,是**站点把数据层当成了不可失败的东西**。
一个跑在免费档上的站,数据层不可用是常态而不是意外,首屏必须还能看。

所以做这份快照:第一页的条目与筛选计数烘焙成常量,随 Worker 一起发布。
D1 正常时一切照旧(快照不参与);D1 挂了就用快照渲染,并在页面上说明
「筛选与翻页暂不可用」—— 不假装一切正常,也不给客户一片空白。

数据来源全部是本地已有的产物,不依赖 D1:
  包材  tools/stnewwave-committed.json(抓取管线的产出)
  原料  db/migrations/0034_ingredients_seed.sql(入库用的那份)
  配方  packages/cms/seed-formulas.sql
"""
import io
import os
import re
import sys
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "core", "src", "generated", "shelf-snapshot.json")

CAT_TYPE = {
    "膏霜护肤类": "use-skincare", "洗发沐浴类": "use-wash", "婴童类": "use-baby",
    "彩妆类": "use-makeup", "护发美发类": "use-wash", "洗涤瓶": "use-home",
    "赠品类": "use-gift", "其他": "use-other",
    "走珠瓶": "roll-on", "PET瓶": "press-bottle", "PETG瓶": "press-bottle",
    "真空瓶": "airless-bottle", "玻璃瓶": "glass-bottle",
}
MAT_BY_CAT = {"PET瓶": "PET", "PETG瓶": "PETG", "玻璃瓶": "玻璃"}


def parse_inserts(path: str, table: str, cols_hint: list[str]):
    """从 INSERT 语句里把值抠出来。写得笨一点没关系 —— 这个脚本一年跑不了几次,
       但它产出的东西要在数据层挂掉时顶上,所以宁可直白也不要聪明。"""
    rows = []
    if not os.path.exists(path):
        return rows
    txt = io.open(path, encoding="utf-8", errors="replace").read()
    pat = re.compile(r"INSERT[^(]*INTO\s+" + table + r"\s*\(([^)]*)\)\s*VALUES\s*\((.*?)\);\s*$",
                     re.I | re.M | re.S)
    for m in pat.finditer(txt):
        cols = [c.strip() for c in m.group(1).split(",")]
        vals, cur, q, esc = [], "", False, False
        for ch in m.group(2):
            if esc:
                cur += ch; esc = False; continue
            if ch == "'" and not q:
                q = True; continue
            if ch == "'" and q:
                q = False; continue
            if ch == "," and not q:
                vals.append(cur.strip()); cur = ""; continue
            cur += ch
        vals.append(cur.strip())
        if len(vals) != len(cols):
            continue
        rows.append({c: (None if v.upper() == "NULL" else v) for c, v in zip(cols, vals)})
    return rows


def main():
    snap = {}

    # ── 包材:抓取管线的产出里已经有编码、类型、容量,不必回查 D1
    p = os.path.join(ROOT, "tools", "stnewwave-committed.json")
    if os.path.exists(p):
        items = json.load(open(p, encoding="utf-8"))
        # 用途类要按 0038 的口径重映射,否则快照的分类和线上对不上
        #(线上「按用途 2129 / 瓶 1469」,快照却是「瓶 2707」)。
        USE = {"护肤": "use-skincare", "洗护": "use-wash", "婴童": "use-baby",
               "彩妆": "use-makeup", "家清": "use-home", "礼赠": "use-gift"}
        def real_type(r):
            u = (r.get("use") or "").strip()
            if u in USE:
                return USE[u]
            if not r.get("material") and r.get("type") == "press-bottle":
                return "use-other"
            return r["type"]
        types, mats, fmts = {}, {}, {}
        for r in items:
            r["type"] = real_type(r)
            types[r["type"]] = types.get(r["type"], 0) + 1
            if r.get("material"):
                mats[r["material"]] = mats.get(r["material"], 0) + 1
            for f in str(r.get("compat", "")).split(","):
                f = f.strip()
                if f:
                    fmts[f] = fmts.get(f, 0) + 1
        first = [{"code": r["code"], "type": r["type"], "material": r.get("material") or "",
                  "capacity": r.get("capacity") or "", "has_img": 1}
                 for r in items[:60]]
        snap["packaging"] = {
            "total": len(items),
            "types": [{"type": k, "n": v} for k, v in sorted(types.items(), key=lambda x: -x[1])],
            "mats": [{"material": k, "n": v} for k, v in sorted(mats.items(), key=lambda x: -x[1])[:60]],
            "fmts": [{"compat_formats": k, "n": v} for k, v in sorted(fmts.items(), key=lambda x: -x[1])[:40]],
            "items": first,
        }

    # ── 原料与配方:读 D1,不读 seed 文件
    #
    # 2026-09-09 发现的坑:这两段原本解析 0034_ingredients_seed.sql 与 seed-formulas.sql,
    # 也就是**第一版种子**。库早就长到 276 支配方,兜底快照里却还是那 30 条,
    # 而且 SR-1001 这些编码现在库里根本不存在 —— D1 一挂,客户看到的是一屏不存在的货。
    # 兜底数据比没有数据更危险,因为它看起来是对的。
    #
    # 包材那段仍旧读本地抓取产物:三千多条走 D1 要翻页,而抓取产物本来就是它的来源。
    from _bohui import d1
    rows = d1("SELECT slug, inci, name_zh, family, functions, confidence FROM ingredients "
              "WHERE status='published' ORDER BY slug LIMIT 60")
    tot = d1("SELECT COUNT(*) n FROM ingredients WHERE status='published'")
    if rows:
        snap["ingredients"] = {"total": (tot[0]["n"] if tot else len(rows)), "items": rows}

    frows = d1("SELECT code, category, format, benefits, moq, lead_days, markets, cost_band, status "
               "FROM formulas WHERE status IN ('active','sample') ORDER BY category, code LIMIT 60")
    ftot = d1("SELECT COUNT(*) n FROM formulas WHERE status IN ('active','sample')")
    if frows:
        snap["formulas"] = {"total": (ftot[0]["n"] if ftot else len(frows)), "items": frows}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    body = json.dumps(snap, ensure_ascii=False)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(body)
    # 页面 import 的是 .ts。只写 .json 的话这个脚本跑一百遍线上也不会变 ——
    # 2026-09-09 之前就是这样:.ts 是当初手工从 .json 抄过去的,此后再没同步过。
    ts = OUT[:-5] + ".ts"
    head = (io.open(ts, encoding="utf-8").read().split("export const SHELF_SNAPSHOT")[0]
            if os.path.exists(ts) else "")
    io.open(ts, "w", encoding="utf-8", newline="\n").write(
        head + "export const SHELF_SNAPSHOT = " + body + " as const;\n")
    size = os.path.getsize(OUT)
    print(f"快照:{OUT}  {size/1024:.0f} KB")
    for k, v in snap.items():
        print(f"  {k:<12} 总数 {v.get('total', 0):>5}  首页条目 {len(v.get('items', []))}")


if __name__ == "__main__":
    main()
