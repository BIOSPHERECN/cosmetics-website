#!/usr/bin/env python3
"""把整个包材库编成一份随 Worker 发布的快照,让货架页不再查 D1。

为什么要这一步(2026-09-07 第二次打爆 D1 之后):
  货架页每次请求都查库。表只有 3,716 行,但排序里那条相关子查询让单次查询
  读了 392 万行 —— 补索引 + 改 EXISTS 之后降到一万一(实测,353 倍)。
  可即便如此,17 个语种 × 62 页 × 若干筛选组合被爬一轮,仍然是几百万行。
  免费档每天五百万行,货架页不该占这个额度的大头。

  这份快照把「列表页要的字段」整库编进 Worker 包里:
    · 列表、筛选、翻页、计数全部在内存里算,零 D1 读;
    · 数据层挂了货架照常显示 —— 免费档上数据层不可用是常态,不是意外;
    · 单品详情页仍走 D1(一次一行,便宜),后台改动也仍然实时。

代价说清楚:包材入库后要跑一次这个脚本再发布,否则货架上看不到新款。
这批数据来自爬取与整理,不是人工逐条编辑,批量入库本来就跟着一次发布走。

编码上做了字典压缩:type / material / price_unit 三列重复度极高,
存下标不存字符串。原始 JSON 621 KB,压完约 170 KB。
"""
import io
import os
import re
import sys
import json
import subprocess

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "core", "src", "generated", "pack-shelf.ts")
CACHE = os.path.join(ROOT, "tools", "pack-all.json")

SQL = ("SELECT code,type,material,capacity,moq,lead_days,price_ref,price_unit,"
       "compat_formats,status,use_type,"
       "EXISTS (SELECT 1 FROM pack_assets a WHERE a.our_code=packaging.code AND a.reviewed=1) img "
       "FROM packaging WHERE status IN ('sample','active') "
       "ORDER BY img DESC, type, code")


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def pull():
    """从 D1 拉一次。拉不动就用上次缓存 —— 额度耗尽的那天也要能重新生成。"""
    e = os.environ.copy()
    e.update(env())
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json",
         "--command", SQL],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env=e, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
    try:
        d = json.loads(raw[raw.index("["):raw.rindex("]") + 1])
        rows = d[0]["results"]
        print(f"从 D1 拉到 {len(rows)} 行(读 {d[0]['meta']['rows_read']} 行)")
        json.dump(rows, io.open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
        return rows
    except Exception as ex:
        if os.path.exists(CACHE):
            rows = json.load(io.open(CACHE, encoding="utf-8"))
            print(f"D1 拉取失败({str(ex)[:60]}),用上次缓存的 {len(rows)} 行")
            return rows
        raise


def main():
    rows = pull()

    types, mats, units, fmts, sts, uses = {}, {}, {}, {}, {}, {}
    def idx(d, v):
        v = v or ""
        if v not in d:
            d[v] = len(d)
        return d[v]

    packed = []
    for r in rows:
        packed.append([
            r["code"],
            idx(types, r.get("type")),
            idx(mats, r.get("material")),
            r.get("capacity") or "",
            r.get("moq") or 0,
            r.get("lead_days") or 0,
            # 参考价存的是**区间字符串**(例如 "$0.20-0.32"),不是数字 ——
            # 供应商给的本来就是区间,压成一个数是假精确。
            r.get("price_ref") or "",
            idx(units, r.get("price_unit")),
            1 if r.get("img") else 0,
            idx(fmts, r.get("compat_formats")),
            idx(sts, r.get("status")),
            # 用途分类(膏霜瓶/乳液瓶/洗护瓶…),与结构分类 type 是两个维度
            idx(uses, r.get("use_type")),
        ])

    inv = lambda d: [k for k, _ in sorted(d.items(), key=lambda kv: kv[1])]
    body = {
        "types": inv(types), "mats": inv(mats), "units": inv(units),
        "fmts": inv(fmts), "sts": inv(sts), "uses": inv(uses),
        "rows": packed,
    }
    js = json.dumps(body, ensure_ascii=False, separators=(",", ":"))

    head = f'''/* 自动生成,请勿手改 —— 跑 `python tools/pack-shelf-snapshot.py` 重新生成。
 *
 * 整个包材库的列表字段({len(rows):,} 款),随 Worker 一起发布。
 * 货架页的列表、筛选、翻页、计数全部在内存里算,零 D1 读。
 *
 * 为什么不放 JSON 文件:JSON 导入在 Workers 打包时没被内联,
 * 页面运行时拿到 undefined,整页 500(2026-09-06 踩过)。必须是 .ts 模块。
 *
 * type / material / price_unit 三列重复度极高,存下标不存字符串。
 * 行的顺序就是货架默认顺序(有实拍的在前),运行时直接切片,不再排序。
 */
export interface PackShelfRow {{
  code: string; type: string; material: string; capacity: string;
  moq: number; leadDays: number; priceRef: string; priceUnit: string; hasImg: boolean;
  compatFormats: string; status: string; useType: string;
}}

const D = {js} as {{
  types: string[]; mats: string[]; units: string[]; fmts: string[]; sts: string[]; uses: string[];
  rows: [string, number, number, string, number, number, number, number, number, number, number, number][];
}};

export const PACK_SHELF: PackShelfRow[] = D.rows.map((r) => ({{
  code: r[0], type: D.types[r[1]], material: D.mats[r[2]], capacity: r[3],
  moq: r[4], leadDays: r[5], priceRef: r[6], priceUnit: D.units[r[7]], hasImg: r[8] === 1,
  compatFormats: D.fmts[r[9]], status: D.sts[r[10]], useType: D.uses[r[11]],
}}));

export const PACK_SHELF_TOTAL = {len(rows)};
'''
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(head)
    kb = os.path.getsize(OUT) / 1024
    print(f"写出 {OUT}")
    print(f"  {len(rows):,} 款 · {kb:.0f} KB · 类型 {len(types)} 种 · 材质 {len(mats)} 种")
    print(f"  有实拍 {sum(1 for r in packed if r[8])} 款")


if __name__ == "__main__":
    main()
