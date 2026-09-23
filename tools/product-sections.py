#!/usr/bin/env python3
"""产品页升级成「一页说清为什么这支能卖」的结构。

由来(创始人 2026-09-10 04:00,发来 `2026.07-现货介绍-广州市渝崧精细化工有限公司.pdf`:
「你看下这个文档对产品的介绍,这个非常的优秀!」)。

那份 62 页的现货册,每支产品都是同一套骨架:

    产品名(中英)
    产品功效   —— 一句话说清它解决什么
    产品特点   —— 2–4 个**命名技术块**,每块带**量化机理**
                 (渗透深度 200μm;1g 稻壳硅石吸 1.7g 皮脂;
                  粒径 20–100nm 对比传统矿物硅石 1–10μm;5000ppm PDRN;0.1% 视黄醛)
    销售情况   —— 平台销量 + 热销区域
    竞品分析 / 本品优势 —— 两栏对照
    产品定位   —— 目标市场 + 目标人群
    产品优势   —— 工艺可行性(超细雾化喷头、体系稳定、支持小批量定制)

我们原来只有「核心成分 + 卖点」两句话。差的不是字数,是**为什么这支能卖**:
买手看的是"它凭什么打得过货架上已有的",不是"它含什么"。

**哪些能自动填、哪些必须人填** —— 这条比结构本身更要紧:
  · 功效、特点、定位:从产品册 v8 已解析的核心成分与卖点里拆,是我们自己的资料,能填。
  · **销售情况(销量、热销区域)绝对不能生成**。渝崧那份写的是他们自己的真实销量,
    我们没有对应数字。编一个"月销 2W 支"是对客户撒谎,而且一问就穿。
    这一栏建成后台字段,运营按实填,填了才显示。
  · 竞品分析同理:要说"竞品只控油不修护",得真看过那支竞品。留给运营。

用法:
    python tools/product-sections.py            体检
    python tools/product-sections.py --apply    写库
"""
import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SPLIT = re.compile(r"[;;]")

# 品类 → 默认目标人群。只写能从品类推出来的,推不出来的留空让运营填。
AUDIENCE = {
    "skincare": "护肤线品牌方与跨境卖家",
    "oral": "口腔护理品牌方与商超渠道",
    "body": "身体护理与香氛线品牌方",
    "suncare": "防晒线品牌方,热带与高紫外市场",
    "haircare": "洗护线品牌方",
    "makeup": "彩妆品牌方",
    "kids": "母婴与儿童护理品牌方",
    "cleansing": "清洁线品牌方",
}


def tech_blocks(summary: str, desc: str) -> list:
    """把「核心成分:A、B、C」与卖点拆成命名技术块。

    带数字的卖点排在前面 —— 渝崧那份之所以好读,是因为每一条都落到一个可核对的数,
    而不是形容词。我们手上有数的就是成分名与规格,先把它们顶上去。
    """
    out = []
    m = re.search(r"核心成分[::](.+?)(?:。|$)", summary or "")
    if m:
        acts = [x.strip() for x in re.split(r"[、,,]", m.group(1)) if x.strip()]
        if acts:
            out.append({"title": "核心成分体系",
                        "body": "、".join(acts) + "。各成分的作用机理、常见添加区间与配伍禁忌,"
                                                  "见站内原料溯源档案。"})
    sell = ""
    m2 = re.search(r"卖点[^::]*[::](.+)$", desc or "", re.S)
    if m2:
        sell = m2.group(1).strip()
    for seg in [x.strip() for x in SPLIT.split(sell) if x.strip()]:
        has_num = bool(re.search(r"\d", seg))
        out.append({"title": ("量化卖点" if has_num else "产品卖点"), "body": seg, "_num": has_num})
    out.sort(key=lambda x: (not x.get("_num", False)))
    for x in out:
        x.pop("_num", None)
    return out[:6]


def build():
    rows = d1("SELECT p.id pid, p.slug, p.category, p.internal_note, i.name, i.summary, i.description "
              "FROM products p JOIN product_i18n i ON i.product_id=p.id AND i.lang='zh-cn' "
              "WHERE p.site_id='biosphere-ai' ORDER BY p.id")
    out = []
    for r in rows:
        blocks = tech_blocks(r["summary"] or "", r["description"] or "")
        eff = (r["summary"] or "").strip()
        pos = {"market": "全球", "audience": AUDIENCE.get(r["category"], "")}
        out.append({
            "pid": r["pid"], "slug": r["slug"], "name": r["name"],
            "sections": {
                "efficacy": eff,
                "tech": blocks,
                # 这三块**留给运营**,不生成:销量与竞品结论必须是真的
                "sales": {"_pending": "销售情况由运营按实填写:平台、销量区间、热销区域。"
                                      "没有真实数据就不显示这一块。"},
                "versus": {"_pending": "竞品分析由运营按实填写:要写「竞品只控油不修护」,"
                                       "得真看过那支竞品。"},
                "position": pos,
            },
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = build()
    withtech = sum(1 for r in rows if r["sections"]["tech"])
    numed = sum(1 for r in rows if any("量化" in b["title"] for b in r["sections"]["tech"]))
    print(f"产品 {len(rows)} 款 · 拆出技术块 {withtech} 款 · 其中有量化卖点 {numed} 款")
    for r in rows[:3]:
        print(f"  {r['name'][:22]}")
        for b in r["sections"]["tech"][:3]:
            print(f"     [{b['title']}] {b['body'][:56]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_product-sections.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            js = json.dumps(r["sections"], ensure_ascii=False).replace("\n", " ")
            fh.write(f"UPDATE product_i18n SET specs_json={q(js)} "
                     f"WHERE product_id={r['pid']} AND lang='zh-cn';\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()
