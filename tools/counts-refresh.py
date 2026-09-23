#!/usr/bin/env python3
"""把各库存量算一遍,写成 pulse 表里的一行 counts(JSON),前台页面只读这一行。

由来:2026-09-11 罗盘实测 `SELECT COUNT(*) FROM kg_nodes` 一天跑了 36,619 次、每次扫 8,235 行 = 3 亿行,
占当天 D1 读量六成 —— 六站总览页每次渲染都现算计数,而 GPTBot 一周抓这些页 20 万次。
SQLite 的 COUNT(*) 是全表扫,数字又一天变不了几次,所以改成:这里算好 → 写一行 → 页面读一行(1 行 vs 8,235 行)。
灌完数据(品牌、古方、法规、目录…)顺手跑一下;tools/pulse-collect.py 也会带着跑。
    python tools/counts-refresh.py"""
import io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__))
Q = {
    "bases": "SELECT COUNT(*) n FROM herb_bases", "classics": "SELECT COUNT(*) n FROM classics", "inci": "SELECT COUNT(*) n FROM inci_catalog",
    "graph": "SELECT COUNT(*) n FROM kg_nodes",
    "paper": "SELECT COUNT(*) n FROM packaging WHERE status='active' AND type IN ('rigid-box','leaflet','overwrap-film','shrink-sleeve','seal-sticker')",
    "qc": "SELECT COUNT(*) n FROM qc_items", "regs": "SELECT COUNT(*) n FROM regulations", "trends": "SELECT COUNT(*) n FROM ecom_items",
    "reports": "SELECT COUNT(*) n FROM trend_reports", "brands": "SELECT COUNT(*) n FROM brand_leads",
    "weeks": "SELECT COUNT(DISTINCT strftime('%Y-%W', date)) n FROM trend_reports", "answers": "SELECT COUNT(*) n FROM geo_answers",
    "news": "SELECT COUNT(*) n FROM news WHERE is_published = 1",
    # 配方实验室(0080):专家席 / 维基页 / 需求单
    "experts": "SELECT COUNT(*) n FROM expert_skills", "wiki": "SELECT COUNT(*) n FROM wiki_pages",
    "lab_projects": "SELECT COUNT(*) n FROM formula_projects",
    # 09-21 工厂版首页(照 beauty2ai 六屏版式):全成分产品 / 已解读 / 在库配方基底 / 包材
    "products": "SELECT COUNT(*) n FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30",
    "summaries": "SELECT COUNT(*) n FROM market_products WHERE summary_zh IS NOT NULL AND summary_zh <> ''",
    "formulas": "SELECT COUNT(*) n FROM formulas WHERE status IN ('sample','active')",
    "packaging": "SELECT COUNT(*) n FROM packaging WHERE status='active'",
}


def main():
    out = {}
    for k, sql in Q.items():
        try: out[k] = int(d1(sql)[0]["n"])
        except Exception: pass
    try: out["registry"] = {str(r["registry"]): int(r["n"]) for r in d1("SELECT registry, COUNT(*) n FROM inci_catalog GROUP BY registry")}
    except Exception: pass
    js = json.dumps(out, ensure_ascii=False).replace("'", "''")
    f = os.path.join(HERE, "_counts.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write(
        "CREATE TABLE IF NOT EXISTS pulse (k TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));\n"
        f"INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('counts', '{js}', datetime('now'));\n")
    d1_exec(f); print("counts 已写:", {k: v for k, v in out.items() if k != "registry"}, "· 目录", len(out.get("registry", {})))


if __name__ == "__main__":
    main()
