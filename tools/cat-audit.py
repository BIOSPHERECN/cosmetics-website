#!/usr/bin/env python3
"""分类对照体检 —— 库里存的取值,页面上有没有对应的中英文名。

由来(创始人 2026-09-10 12:2x:「各个分类还是要审核下,是不是都匹配到位」)。

**为什么会不匹配:** 词表(`apps/web/src/lib/catalog.ts` 里的 PACK_TYPE_LABEL、
PACK_USE_LABEL、FMT_LABEL、BEN_LABEL…)是手写的,而库里的取值是一批批导进来的。
新导一批包材、新加一个剂型,词表没跟上,页面上就露出一个英文 slug 给客户看 ——
筛选栏里蹦出 `use-other`、`shrink-sleeve` 这种,一眼就知道是没做完的站。
反过来,词表里有、库里一条都没有的键,是删数据留下的死项,会让筛选栏出现点了没结果的选项。

体检两个方向都查:
    库里有 → 词表没有   = 页面露 slug(必须补)
    词表有 → 库里没有   = 死选项(可删,但不急)

用法:
    python tools/cat-audit.py
"""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.join(os.path.dirname(HERE), "apps", "web", "src", "lib", "catalog.ts")


def keys_of(src: str, name: str) -> set:
    """从 catalog.ts 里抠出某张对照表的键。正则够用,别为这个引 TS 解析器。"""
    i = src.find(f"export const {name}")
    if i < 0:
        return set()
    j = src.find("};", i)
    body = src[i:j]
    out = set()
    # 一行里常放好几个键(`skincare: [...], cleansing: [...]`),按行首抓只拿得到第一个,
    # 第一版就是这么把 body / oral / lotion 全报成「缺」的 —— 误报比漏报更浪费时间。
    for m in re.finditer(r"(?:^\s*|[,{]\s*)'?([A-Za-z0-9_+-]+)'?\s*:\s*\[", body, re.M):
        out.add(m.group(1))
    return out


def check(title: str, used: dict, known: set, note: str = ""):
    miss = {k: v for k, v in used.items() if k and k not in known}
    dead = sorted(known - set(used))
    print(f"\n== {title}  库内取值 {len(used)} 种 · 词表 {len(known)} 项")
    if note:
        print(f"   {note}")
    if miss:
        print(f"   ✗ 页面会露 slug 的 {len(miss)} 种:")
        for k, v in sorted(miss.items(), key=lambda kv: -kv[1]):
            print(f"       {k:<26} {v} 条")
    else:
        print("   ✓ 库内取值全部有对照名")
    if dead:
        print(f"   · 词表里有、库里没有的 {len(dead)} 项(死选项,可删):{', '.join(dead[:12])}"
              + (" …" if len(dead) > 12 else ""))


def counts(table: str, col: str, where: str = "") -> dict:
    rows = d1(f"SELECT {col} k, COUNT(*) n FROM {table} {where} GROUP BY {col}")
    return {str(r["k"]): int(r["n"]) for r in rows if r["k"] not in (None, "")}


def main():
    src = io.open(CAT, encoding="utf-8").read()
    check("包材结构类型 packaging.type", counts("packaging", "type"), keys_of(src, "PACK_TYPE_LABEL"),
          "露 slug 的会直接出现在包材库筛选栏与详情页标题上")
    check("包材用途 packaging.use_type", counts("packaging", "use_type"), keys_of(src, "PACK_USE_LABEL"))
    check("配方品类 formulas.category", counts("formulas", "category"), keys_of(src, "CAT_LABEL") | keys_of(src, "FORMULA_CAT_LABEL"))
    check("配方剂型 formulas.format", counts("formulas", "format"), keys_of(src, "FMT_LABEL"))
    check("产品品类 products.category", counts("products", "category", "WHERE site_id='biosphere-ai'"),
          keys_of(src, "CAT_LABEL") | keys_of(src, "PROD_CAT_LABEL"))
    check("原料科属 ingredients.family", counts("ingredients", "family"), keys_of(src, "FAMILY_LABEL"))

    # 功效标签是逗号分隔的多值,单独拆
    ben = {}
    for r in d1("SELECT benefits FROM formulas WHERE benefits IS NOT NULL AND benefits <> ''"):
        for x in str(r["benefits"]).split(","):
            x = x.strip()
            if x:
                ben[x] = ben.get(x, 0) + 1
    check("配方功效 formulas.benefits(多值)", ben, keys_of(src, "BEN_LABEL"))

    fun = {}
    for r in d1("SELECT functions FROM ingredients WHERE functions IS NOT NULL AND functions <> ''"):
        for x in str(r["functions"]).split(","):
            x = x.strip()
            if x:
                fun[x] = fun.get(x, 0) + 1
    check("原料功效 ingredients.functions(多值)", fun, keys_of(src, "BEN_LABEL") | keys_of(src, "FUNC_LABEL"))

    print("\n词表文件:", CAT)
    print("发现的对照表:", ", ".join(sorted(set(re.findall(r"export const ([A-Z_]+_LABEL)", src)))))


if __name__ == "__main__":
    main()
