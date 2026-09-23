#!/usr/bin/env python3
"""知识图谱语料 —— 把库里的结构化数据导成长文本,喂给 Hyper-Extract。

由来(创始人 2026-09-10 03:0x:「hyper-extract 更好的知识图谱,你看下怎么样重构系统。
化妆品很多方面的知识,你需要去网上建立一套完整的知识库了」)。

**为什么分两层做,而不是全部丢给 LLM 抽:**

  · **确定层**(`tools/kg-build.py`)—— 原料↔配方↔包材↔产品↔基地↔法规 这些关系,
    库里本来就是外键和 INCI 对得上的,用 SQL join 直接生成 n 元超边:
    准确、免费、可复算,而且不会幻觉。让 LLM 去"抽"我们自己数据库里已经有的东西,
    是花钱买不确定性。
  · **抽取层**(本文件 + Hyper-Extract)—— 只处理**非结构化的长文本**:
    作用机理、配伍禁忌、稳定性、工厂投料要点、合规办理路径、公司介绍。
    这些是自然语言写的因果与条件,SQL 抽不出来,正是 LLM 该干的活。

模型:实测 `deepseek-v4-pro`(商汤网关)节点抽得出、**超边一条不出**;
换 `glm-5.2` 后 1,737 字出 41 节点 / 43 边,关系类型是中文的(功效/来源于/含有/适用于)。
所以 `he config llm` 必须是 glm-5.2,换回去就白跑。
Embedding 走 Cloudflare Workers AI 的 OpenAI 兼容端点(bge-m3,1024 维),
商汤网关没有 embeddings。

用法:
    python tools/kg-corpus.py            导出全部语料到 tools/.kg-src/
    python tools/kg-corpus.py --part ing 只导某一部分
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, ".kg-src")


def w(name: str, text: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    io.open(p, "w", encoding="utf-8", newline="\n").write(text)
    print(f"  {name:<24}{len(text):>8,} 字")


def ingredients() -> None:
    """原料:机理、配伍、稳定性、投料 —— 全库最厚的一层自然语言。"""
    rows = d1("SELECT name_zh, inci, family, functions, mechanism_zh, use_level, formats, "
              "ph_range, incompatible, stability, factory_note, market_cn, market_eu, "
              "cost_band, confidence FROM ingredients WHERE status='published' ORDER BY slug")
    parts = []
    for r in rows:
        seg = [f"## {r['name_zh']}({r['inci']})", ""]
        seg.append(f"类别:{r['family']}。功效方向:{r['functions']}。"
                   f"成本档:{r['cost_band']}。依据强度:{r['confidence']}。")
        if r["mechanism_zh"]:
            seg.append(f"\n作用机理:{r['mechanism_zh']}")
        if r["use_level"] or r["formats"] or r["ph_range"]:
            seg.append(f"\n配方应用:常见添加区间 {r['use_level'] or '—'};"
                       f"适用剂型 {r['formats'] or '—'};体系 pH {r['ph_range'] or '—'}。")
        if r["incompatible"]:
            seg.append(f"\n配伍禁忌:{r['incompatible']}")
        if r["stability"]:
            seg.append(f"\n稳定性:{r['stability']}")
        if r["factory_note"]:
            seg.append(f"\n工厂投料要点:{r['factory_note']}")
        if r["market_cn"]:
            seg.append(f"\n中国法规口径:{r['market_cn']}")
        if r["market_eu"]:
            seg.append(f"\n欧盟法规口径:{r['market_eu']}")
        parts.append("\n".join(seg))
    # 分片:一次喂几十万字既慢又容易中途断,按 20 味一片,断了只重跑一片
    for i in range(0, len(parts), 20):
        w(f"ingredients-{i // 20 + 1:02d}.md", "\n\n".join(parts[i:i + 20]))
    print(f"  原料 {len(rows)} 味 · {(len(parts) + 19) // 20} 片")


def formulas() -> None:
    """配方:剂型工艺窗口 + 活性物 + 监管类别。"""
    rows = d1("SELECT code, category, format, benefits, actives_json, texture, ph, viscosity, "
              "fill_temp, shelf_life_m, preservative, moq, sample_days, bulk_days, markets, "
              "reg_class, reg_note, ai_summary FROM formulas WHERE status IN ('active','sample') "
              "ORDER BY category, code")
    import json as J
    parts = []
    for r in rows:
        try:
            acts = J.loads(r["actives_json"] or "[]")
        except Exception:
            acts = []
        a = "、".join(f"{x.get('name')}({x.get('inci')}) {x.get('pct')}" for x in acts)
        parts.append(
            f"## 配方 {r['code']}\n\n"
            f"品类 {r['category']},剂型 {r['format']},功效方向 {r['benefits']}。\n"
            f"关键活性物:{a or '—'}。\n"
            f"肤感:{r['texture'] or '—'}。\n"
            f"工艺窗口:pH {r['ph'] or '—'},黏度 {r['viscosity'] or '—'},"
            f"灌装 {r['fill_temp'] or '—'},保质期 {r['shelf_life_m'] or '—'} 个月,"
            f"防腐体系 {r['preservative'] or '—'}。\n"
            f"起订 {r['moq']},打样 {r['sample_days']} 天,大货 {r['bulk_days']} 天,"
            f"可售市场 {r['markets']}。\n"
            f"监管类别:{r['reg_class']}。{r['reg_note'] or ''}")
    for i in range(0, len(parts), 40):
        w(f"formulas-{i // 40 + 1:02d}.md", "\n\n".join(parts[i:i + 40]))
    print(f"  配方 {len(rows)} 支 · {(len(parts) + 39) // 40} 片")


def origins() -> None:
    """原料溯源:产区、部位、学名。从页面块里取,不重复原料库那份。"""
    import json as J
    rows = d1("SELECT p.slug slug, bi.data_json dj FROM block_i18n bi "
              "JOIN blocks b ON b.id=bi.block_id AND b.type='matrix' AND b.sort_order=30 "
              "JOIN pages p ON p.id=b.page_id "
              "WHERE p.site_id='biosphere-ai' AND p.slug LIKE 'origin/%' AND bi.lang='zh-cn'")
    parts = []
    for r in rows:
        d = J.loads(r["dj"] or "{}")
        items = d.get("items") or []
        if not items:
            continue
        body = "。".join(f"{x.get('title')}:{x.get('desc')}" for x in items if x.get("desc"))
        parts.append(f"## 原料溯源 {r['slug'].split('/')[-1]}\n\n{body}。")
    w("origins.md", "\n\n".join(parts))
    print(f"  溯源 {len(parts)} 条")


def products() -> None:
    rows = d1("SELECT p.slug, p.category, i.name, i.summary, i.description "
              "FROM products p JOIN product_i18n i ON i.product_id=p.id AND i.lang='zh-cn' "
              "WHERE p.site_id='biosphere-ai' AND p.status='published' ORDER BY p.category")
    parts = [f"## 产品 {r['name']}\n\n品类 {r['category']}。{r['summary']}\n\n{r['description']}"
             for r in rows]
    w("products.md", "\n\n".join(parts))
    print(f"  产品 {len(rows)} 款")


def compliance() -> None:
    """六国通报办理索引 —— 从页面源码里取那份结构化数据,不再手抄一遍。"""
    p = os.path.join(os.path.dirname(HERE), "apps", "web", "src", "pages",
                     "[lang]", "compliance", "index.astro")
    if not os.path.exists(p):
        print("  合规页不在,跳过")
        return
    src = io.open(p, encoding="utf-8").read()
    a = src.index("const ROWS: Row[] = [")
    b = src.index("\n];", a)
    w("compliance.md", "# 东南亚六国化妆品通报账号门槛与办理路径\n\n"
                       "以下为各国监管系统、账号资质、硬件电子签要求与分步办理路径。\n\n"
                       "```\n" + src[a:b] + "\n```\n")


PARTS = {"ing": ingredients, "fml": formulas, "org": origins,
         "prd": products, "cmp": compliance}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=list(PARTS) + ["all"], default="all")
    a = ap.parse_args()
    for k, fn in PARTS.items():
        if a.part in ("all", k):
            print(f"── {k}")
            fn()
    print(f"\n语料目录:{OUT}")


if __name__ == "__main__":
    main()
