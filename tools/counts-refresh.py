#!/usr/bin/env python3
"""把各库存量算一遍,写成 pulse 表里的一行 counts(JSON),前台页面只读这一行。

由来:2026-09-11 罗盘实测 `SELECT COUNT(*) FROM kg_nodes` 一天跑了 36,619 次、每次扫 8,235 行 = 3 亿行,
占当天 D1 读量六成 —— 六站总览页每次渲染都现算计数,而 GPTBot 一周抓这些页 20 万次。
SQLite 的 COUNT(*) 是全表扫,数字又一天变不了几次,所以改成:这里算好 → 写一行 → 页面读一行(1 行 vs 8,235 行)。
灌完数据(品牌、古方、法规、目录…)顺手跑一下;tools/pulse-collect.py 也会带着跑。
    python tools/counts-refresh.py          # 全部计数 + BEAUTY2OEM 快照
    python tools/counts-refresh.py --b2o    # 只导 BEAUTY2OEM 快照(机会卡有没有 + 公开预判台账)"""
import io, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, _wenv  # noqa: E402
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
    # 09-24 货架口径(对外用这个):与 /packaging/ 列表页同一谓词,客户点进去翻到的就是这个数
    "pack_shelf": "SELECT COUNT(*) n FROM packaging WHERE status IN ('sample','active')",
    # 09-24 安全架构 C5:站内 AI 检索页、AI 工作台首屏的库存量(原来每次渲染现算 COUNT)
    "ingredients": "SELECT COUNT(*) n FROM ingredients WHERE status='published'",
    "trend_active": "SELECT COUNT(*) n FROM trends WHERE status='active'",
    "kb": "SELECT COUNT(*) n FROM kb_entries WHERE is_published=1",
    "pack_pages": "SELECT COUNT(*) n FROM pack_assets WHERE kind='page'",
}


def b2o_snap():
    """09-24 图文版零查库:BEAUTY2OEM 的「有没有已发布的机会卡」和公开预判台账(≤60 行、只取公开字段)导成静态 JSON,
    随构建打包,页面(components/B2oBlock.astro)只读它。查询带 -c apps/web/wrangler.toml 写明库名,失败就报错退出、不覆盖旧快照。"""
    def q(sql):
        p = subprocess.run(["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "-c", "apps/web/wrangler.toml", "--command", sql],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=os.path.dirname(HERE), env=_wenv(),
                           shell=(os.name == "nt"), timeout=180)
        return json.loads(p.stdout)[0]["results"]
    snap = {
        "has_cards": bool(q("SELECT 1 AS x FROM b2o_opp_cards WHERE status = 'published' LIMIT 1")),
        "ledger": q("SELECT id, made_at, title, invalidation, outcome, r30, r60, r90 FROM b2o_predictions WHERE is_public = 1 ORDER BY made_at DESC, id DESC LIMIT 60"),
        "updated_at": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    f = os.path.join(os.path.dirname(HERE), "apps", "web", "src", "data", "b2o-snap.json")
    io.open(f, "w", encoding="utf-8", newline="\n").write(json.dumps(snap, ensure_ascii=False, indent=1))
    print("BEAUTY2OEM 快照已写:", f, "· 有卡", snap["has_cards"], "· 台账", len(snap["ledger"]), "行(重新构建部署后生效)")


def main():
    b2o_snap()
    if "--b2o" in sys.argv: return
    out = {}
    for k, sql in Q.items():
        try: out[k] = int(d1(sql)[0]["n"])
        except Exception: pass
    try: out["registry"] = {str(r["registry"]): int(r["n"]) for r in d1("SELECT registry, COUNT(*) n FROM inci_catalog GROUP BY registry")}
    except Exception: pass
    # 09-24 主线:图谱页分类计数(原来每次 GROUP BY kg_nodes 全表),前 14 类
    try: out["graph_types"] = {str(r["type"]): int(r["n"]) for r in d1("SELECT type, COUNT(*) n FROM kg_nodes GROUP BY type ORDER BY n DESC LIMIT 14")}
    except Exception: pass
    # 09-24 D2:/decoder/ 不带搜索时的总数与市场/类目分面({市场或 '-': {COALESCE(cat_zh,cat) 或 '': 款数}},约 118 格)。
    # 页面原来每次 GROUP BY 全表 29.5 万行;这里一天算一次。键口径与页面筛选 `COALESCE(cat_zh, cat) = ?` 一致。
    try:
        mpf = {}
        for r in d1("SELECT COALESCE(NULLIF(country,''),'-') c, COALESCE(cat_zh, cat, '') k, COUNT(*) n FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 GROUP BY c, k"):
            mpf.setdefault(str(r["c"]), {})[str(r["k"])] = int(r["n"])
        if mpf: out["mpf"] = mpf
    except Exception: pass
    # 09-24 创始人:「定时把统计好的数字写到首页,前端就只是一个静态固定的数字」。
    # 同一份结果写成静态文件,随网站构建打进包里;页面读它不碰 D1(静态资源不计费)。pulse 那一行留作兜底。
    out["updated_at"] = __import__("datetime").datetime.now().strftime("%Y-%m-%d")
    static = os.path.join(os.path.dirname(HERE), "apps", "web", "src", "data", "site-counts.json")
    os.makedirs(os.path.dirname(static), exist_ok=True)
    io.open(static, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=0))
    print("静态文件已写:", static, "(重新构建部署后生效)")
    js = json.dumps(out, ensure_ascii=False).replace("'", "''")
    f = os.path.join(HERE, "_counts.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write(
        "CREATE TABLE IF NOT EXISTS pulse (k TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));\n"
        f"INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('counts', '{js}', datetime('now'));\n")
    d1_exec(f); print("counts 已写:", {k: v for k, v in out.items() if k not in ("registry", "mpf")}, "· 目录", len(out.get("registry", {})))


if __name__ == "__main__":
    main()
