#!/usr/bin/env python3
"""包材按**用途**分十类 —— 膏霜瓶 / 乳液瓶 / 洗护瓶 / 真空瓶 / 滴管瓶 /
防晒瓶 / 泡沫瓶 / 试用装瓶 / 玻璃瓶 / 精华瓶。

由来(创始人 2026-09-09:「膏霜瓶乳液瓶洗护瓶真空瓶滴管瓶防晒瓶泡沫瓶试用装瓶玻璃瓶精华瓶,
瓶子也要分类了」)。

**为什么另开一列而不是改 `type`**:
现有的 22 个 `type` 是**结构分类**(泵头瓶 / 螺旋瓶 / 翻盖瓶 / 喷雾瓶 / 真空瓶 / 滴管瓶…),
创始人要的十类是**用途分类**。同一支 100ml PET 泵头瓶,结构上永远是 pump-bottle,
用途上可以是乳液瓶也可以是防晒瓶。把用途写进 `type` 会毁掉结构维度,
两个维度都要留,货架上才能一个筛结构、一个筛用途。

**判定只用手上有的真信号**,不猜:
  · `compat_formats` —— 抓取时供应商自己标的适配膏体(3,524 条有值)
  · `capacity` —— 容量(4,259 条有值)
  · `type` —— 结构本身就决定了一部分用途(真空瓶、滴管瓶、泡沫泵、玻璃瓶)
  · `notes_zh` —— 抓取时带回来的用途标注(「婴童」这类)

判不出来的**留空**,不硬分。货架上宁可少一个筛选值,
也不要把一支洗护瓶标成精华瓶让客户按错样。

用法:
    python tools/pack-usetype.py            体检:各类命中多少、覆盖率多少
    python tools/pack-usetype.py --apply    写库
"""
import argparse
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# 十类用途。顺序即优先级 —— 一支瓶可能同时像两类,先命中的算数。
# 结构决定的四类放最前(真空/滴管/泡沫/玻璃),它们是硬信号,不靠推断。
USE = [
    ("airless", "真空瓶"),
    ("dropper", "滴管瓶"),
    ("foam", "泡沫瓶"),
    ("glass", "玻璃瓶"),
    ("sample", "试用装瓶"),
    ("wash", "洗护瓶"),
    ("cream", "膏霜瓶"),
    ("serum", "精华瓶"),
    ("suncare", "防晒瓶"),
    ("lotion", "乳液瓶"),
]

ML = re.compile(r"(\d+(?:\.\d+)?)\s*(ml|g|ML|G|毫升|克)")


def caps(s: str):
    """一条记录常带多个容量(「35ml/50ml/150ml」),全取出来。"""
    return [float(m.group(1)) for m in ML.finditer(s or "")]


def classify(r: dict):
    t = (r["type"] or "").strip()
    fmts = {x.strip() for x in (r["compat_formats"] or "").split(",") if x.strip()}
    note = r["notes_zh"] or ""
    cs = caps(r["capacity"] or "")
    lo = min(cs) if cs else None
    hi = max(cs) if cs else None

    # ① 结构即用途 —— 这四类不需要推断
    if t == "airless-bottle":
        return "airless"
    if t == "dropper-bottle":
        return "dropper"
    if t == "foam-pump":
        return "foam"
    if t == "glass-bottle":
        return "glass"

    # ② 试用装:最大容量也在 20ml 以内。用最大值判,
    #    因为「5ml/10ml/30ml」这种多规格里有正装,不能算试用装。
    if hi is not None and hi <= 20:
        return "sample"

    # ③ 洗护:大容量 + 洗护类膏体。两个条件都要,
    #    只看容量会把 500ml 的身体乳也划进来。
    if ("shampoo" in fmts or "body-wash" in fmts or "foam" in fmts or "洗" in note) \
            and lo is not None and lo >= 200:
        return "wash"
    if t == "use-wash":
        return "wash"

    # ④ 膏霜:广口罐,或适配膏霜类
    if t == "jar" or (fmts & {"cream", "balm"}) and t in ("jar", "screw-bottle", ""):
        return "cream"

    # ⑤ 精华:小容量 + 精华/安瓶类
    if (fmts & {"serum", "essence", "ampoule"}) and hi is not None and hi <= 60:
        return "serum"

    # ⑥ 防晒:`compat_formats` 里根本没有 sunscreen 这个取值 ——
    #    抓回来的供应商标注只有 toner/essence/lotion/cream/foam 那几种,
    #    所以防晒只能靠 notes_zh / sku_raw 里明写「防晒」的那 41 条。
    #    **不按容量猜**:50ml 翻盖瓶既可能是防晒也可能是乳液,猜错了客户按错样。
    if "防晒" in note or "防晒" in (r.get("sku_raw") or "") or "sunscreen" in (r.get("sku_raw") or "").lower():
        return "suncare"
    if fmts & {"sunscreen", "spf", "sun"}:
        return "suncare"

    # ⑦ 乳液:泵头/翻盖 + 乳液或水类,常规正装容量
    if (fmts & {"lotion", "toner", "essence", "gel"}) and t in ("pump-bottle", "flip-bottle", "screw-bottle") \
            and lo is not None and 20 < lo < 400:
        return "lotion"

    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    rows = d1("SELECT code, type, capacity, compat_formats, notes_zh, sku_raw FROM packaging "
              "WHERE status='active'")
    hit = {}
    out = []
    for r in rows:
        u = classify(r)
        if u:
            hit[u] = hit.get(u, 0) + 1
            out.append((r["code"], u))
    zh = dict(USE)
    print(f"在架包材 {len(rows)} 款 · 判出用途 {len(out)} 款 "
          f"({len(out) / max(1, len(rows)):.0%})· 留空 {len(rows) - len(out)} 款")
    for k, name in USE:
        print(f"  {name:<8}{hit.get(k, 0):>6}")
    empty = [k for k, name in USE if not hit.get(k)]
    if empty:
        print(f"  ⚠ 计数为 0 的类:{[zh[k] for k in empty]} —— 判据要求每类 > 0")

    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_pack-usetype.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("ALTER TABLE packaging ADD COLUMN use_type TEXT;\n")
        fh.write("CREATE INDEX IF NOT EXISTS idx_packaging_use ON packaging(use_type);\n")
        for i in range(0, len(out), 200):
            chunk = out[i:i + 200]
            for u in {x[1] for x in chunk}:
                codes = [c for c, uu in chunk if uu == u]
                fh.write(f"UPDATE packaging SET use_type={q(u)} WHERE code IN "
                         f"({','.join(q(c) for c in codes)});\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    for x in d1("SELECT use_type, COUNT(*) n FROM packaging WHERE status='active' "
                "AND use_type IS NOT NULL GROUP BY use_type ORDER BY n DESC"):
        print(f"  {zh.get(x['use_type'], x['use_type']):<8}{x['n']:>6}")


if __name__ == "__main__":
    main()
