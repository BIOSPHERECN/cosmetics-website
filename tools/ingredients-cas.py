#!/usr/bin/env python3
"""把 inci_catalog 抓到的 CAS 回填进 ingredients。

由来:原料档案里 105/149 条写着「CAS 未确认」。而 tools/cas-enrich.py 已经从
PubChem 抓到 2,104 个 CAS,两张表用 inci_key 就能对上 —— 同一个号,不该一张表有、
另一张表还写「未确认」。

**只回填,不覆盖**:ingredients.cas 里有些是人工核过的、带说明的写法
(例:「84775-66-6(对应 Glycyrrhiza glabra, ext. 的常见登记号;实际以供应商 COA 标注为准)」),
那种比裸号有用,不能被机器抓来的号顶掉。只动「未确认 / 空」这两种。

用法:
    python tools/ingredients-cas.py            体检
    python tools/ingredients-cas.py --apply    写库
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


# 这些词出现在 INCI 名里 = 多组分植物原料,不存在单一 CAS 号
BOTANICAL = re.compile(
    r"EXTRACT|OIL|WATER|JUICE|POWDER|FLOWER|LEAF|ROOT|SEED|FRUIT|BARK|STEM|"
    r"CALLUS|FERMENT|SAP|RESIN|WAX|BUTTER|HYDROLYSATE|FILTRATE")
NO_SINGLE = "无单一 CAS 号(多组分植物提取物,登记号随提取工艺与溶剂而变,以供应商 COA 标示为准)"


def inci_key(s: str) -> str:
    """和 tools/nmpa-catalog.py 同一套归一:去掉括号里的俗名,再大写去空白。"""
    s = re.sub(r"[（(][^）)]*[）)]", " ", str(s or ""))
    return re.sub(r"\s+", " ", s).strip().upper()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    ing = d1("SELECT id, slug, inci, cas FROM ingredients ORDER BY id")
    cat = d1("SELECT inci_key, cas, pubchem_cid FROM inci_catalog WHERE cas IS NOT NULL AND cas <> ''")
    by_key = {r["inci_key"]: r for r in cat if r["inci_key"]}
    print(f"原料 {len(ing)} 条 · 目录里有 CAS 的 {len(by_key)} 个 INCI 名")

    hit, keep, miss = [], 0, 0
    for r in ing:
        cur = (r["cas"] or "").strip()
        if cur and "未确认" not in cur:
            keep += 1
            continue
        m = by_key.get(inci_key(r["inci"]))
        if m:
            hit.append((r["id"], r["slug"], m["cas"]))
        elif BOTANICAL.search((r["inci"] or "").upper()):
            # 植物提取物本来就**没有**单一 CAS —— 它是多组分体系,
            # 登记号随供应商的提取工艺与溶剂而变。写「未确认」看着像我们没查,
            # 其实是这一类物质的性质。照 CAS 查询站的做法直说,比留个空强。
            hit.append((r["id"], r["slug"], NO_SINGLE))
        else:
            miss += 1
    print(f"  已有可信 CAS 保留 {keep} 条 · 本次可写 {len(hit)} 条 · 仍留空 {miss} 条")
    for x in hit[:8]:
        print(f"    {x[1][:44]:<46} {x[2]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_ingredients-cas.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for pid, _slug, cas in hit:
            fh.write(f"UPDATE ingredients SET cas={q(cas)} WHERE id={pid};\n")
    print(f"  写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()
