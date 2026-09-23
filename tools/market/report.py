#!/usr/bin/env python3
"""爆款周报:榜单快照 → 结构化统计 + 模型洞察(OEM 工厂视角)→ D1 market_reports → 后台 /bohui/market/。
创始人 2026-09-15:「爆款分析报告,你有隔几天就调研吗」「最好可以生成一个图表展现,有销量走向数据分析」。
统计层不靠模型(可复核):各类目 Top10 / 新进榜 / 上升最快 / 价格带 / 品牌集中度 / 标题里的成分与宣称词频(卖点风向)。
模型只写「洞察」:三个机会 · 两个风险 · 给研发与业务各一条行动,并注明依据来自哪个数字。
用法:python tools/market/report.py [--date 2026-09-16] [--prev 2026-09-09]   (默认最新快照 vs 最近的上一份;不足两份就只出静态分析)"""
import argparse, collections, datetime as dt, io, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))); sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, fleet, chat  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# 标题里的卖点词:成分 / 功效 / 形态 / 人群。词频本身就是「市场在为什么买单」——工厂选品与研发立项最直接的输入
KW = {
  "成分": ["hyaluronic", "niacinamide", "retinol", "vitamin c", "peptide", "collagen", "ceramide", "snail", "centella|cica", "salicylic", "glycolic", "azelaic", "squalane", "rice", "mugwort", "tea tree", "rosemary", "biotin", "keratin", "argan", "castor", "shea", "aloe", "green tea", "probiotic", "bakuchiol", "tranexamic", "caffeine", "zinc", "sulfur"],
  "功效": ["brighten|dark spot", "acne|blemish", "anti-aging|wrinkle|anti aging", "firming|lifting", "hydrat|moistur", "barrier|repair", "pore", "exfoliat", "soothing|calming", "dandruff|scalp", "hair growth|thicken", "frizz|smooth", "curl", "heat protect", "volume", "damage", "whitening|lightening", "oil control|matte", "glow|dewy|radian"],
  "形态": ["serum", "toner", "essence", "mist", "sheet mask|face mask|mask", "eye cream|eye", "lip oil", "lip balm", "lip mask", "sunscreen|spf", "tinted", "stick", "gel", "foam|cleanser", "balm", "oil", "cream", "lotion", "shampoo", "conditioner", "hair mask", "leave-in", "powder", "patch", "roller"],
  "人群与主张": ["sensitive", "fragrance-free|unscented", "vegan", "cruelty", "korean|k-beauty", "japanese", "clean", "organic|natural", "dermatologist", "men|for him", "kids|baby", "travel|mini", "refill", "halal", "pregnancy"],
}
def kw_count(titles):
    out = []
    for grp, kws in KW.items():
        for kw in kws:
            rx = re.compile(r"\b(" + kw + r")", re.I); n = sum(1 for t in titles if rx.search(t))
            if n: out.append({"group": grp, "kw": kw.split("|")[0], "n": n})
    return sorted(out, key=lambda x: -x["n"])

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--date", default=""); ap.add_argument("--prev", default=""); ap.add_argument("--no-llm", action="store_true"); A = ap.parse_args()
    dates = [r["date"] for r in d1("SELECT DISTINCT date FROM market_snapshots ORDER BY date DESC LIMIT 10")]
    date = A.date or dates[0]; prev = A.prev or next((d for d in dates if d < date), None)
    rows = d1(f"""SELECT s.cat, s.rank, s.price, s.rating, s.reviews, p.title, p.brand, p.pid FROM market_snapshots s JOIN market_products p ON p.pid=s.pid AND p.platform=s.platform
                  WHERE s.date='{date}' AND s.platform LIKE 'amazon%' ORDER BY s.cat, s.rank""")
    prow = {(r["cat"], r["pid"]): r["rank"] for r in d1(f"SELECT cat, pid, rank FROM market_snapshots WHERE date='{prev}' AND platform LIKE 'amazon%'")} if prev else {}
    cats = []
    for cat, grp in ((k, list(g)) for k, g in __import__("itertools").groupby(rows, key=lambda r: r["cat"])):
        prices = [float(r["price"]) for r in grp if r["price"]]
        bands = collections.Counter("<$10" if p < 10 else "$10–20" if p < 20 else "$20–35" if p < 35 else "$35+" for p in prices)
        brands = collections.Counter((r["brand"] or "?") for r in grp)
        new = [r for r in grp if prev and (cat, r["pid"]) not in prow]
        climb = sorted([(prow[(cat, r["pid"])] - r["rank"], r) for r in grp if (cat, r["pid"]) in prow and prow[(cat, r["pid"])] - r["rank"] > 0], key=lambda x: -x[0])[:5]
        cats.append({"key": cat, "n": len(grp), "top": [{"rank": r["rank"], "title": r["title"][:90], "price": r["price"], "rating": r["rating"], "reviews": r["reviews"]} for r in grp[:10]],
                     "price_bands": dict(bands), "median_price": sorted(prices)[len(prices) // 2] if prices else None,
                     "top_brands": [{"brand": b, "n": n} for b, n in brands.most_common(5)], "brand_top5_share": round(sum(n for _, n in brands.most_common(5)) / max(1, len(grp)), 2),
                     "avg_rating": round(sum(float(r["rating"]) for r in grp if r["rating"]) / max(1, sum(1 for r in grp if r["rating"])), 2),
                     "most_reviewed": [{"title": r["title"][:80], "reviews": r["reviews"]} for r in sorted(grp, key=lambda r: -(int(r["reviews"] or 0)))[:3]],
                     "new": [{"rank": r["rank"], "title": r["title"][:80]} for r in new[:8]], "climbers": [{"up": up, "rank": r["rank"], "title": r["title"][:80]} for up, r in climb]})
    kws = kw_count([r["title"] for r in rows])
    rep = {"date": date, "prev": prev, "platform": "amazon", "n": len(rows), "cats": cats, "keywords": kws[:60]}
    md = ""
    if not A.no_llm:
        facts = {"date": date, "prev": prev, "总商品数": len(rows), "卖点词频Top30": [(k["group"], k["kw"], k["n"]) for k in kws[:30]],
                 "各类目": [{"类目": c["key"], "中位价": c["median_price"], "价格带": c["price_bands"], "前五品牌占比": c["brand_top5_share"], "前五品牌": [b["brand"] for b in c["top_brands"]],
                            "新进榜": [x["title"] for x in c["new"][:5]], "上升最快": [(x["up"], x["title"]) for x in c["climbers"][:3]], "Top3": [t["title"] for t in c["top"][:3]]} for c in cats]}
        prompt = """你是广州一家化妆品 OEM/ODM 工厂(15 条产线,GMPC/ISO22716/HALAL,主做护肤、身体护理、洗护、面膜;客户在印尼、中东、东南亚、欧美)的市场总监。
下面是 Amazon 美国美妆畅销榜的统计(全部是真实数字,不要编造榜单之外的信息)。写一份给老板和研发/业务看的中文周报,Markdown,600 字内:
## 一句话结论
## 三个机会(每条:现象 → 数字依据 → 我们能做什么产品/找谁卖)
## 两个风险(红海类目 / 价格带下压 / 巨头集中度)
## 行动
- 研发:一条(立项什么剂型+成分,为什么)
- 业务:一条(找哪类品牌谈代工,用什么切入点)
引用数字时写清来源类目。不要空话,不要「持续关注」这类废话。"""
        j, prov, err = chat(fleet(), [{"role": "system", "content": prompt}, {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}], max_tokens=1800, want_json=False)
        md = j if isinstance(j, str) else ""; rep["model"] = prov
        if err: print("llm err", err[:100])
    q = lambda v: "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'" if not isinstance(v, str) else "'" + v.replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(ROOT, "tools", "_market_report.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write(f"INSERT OR REPLACE INTO market_reports (date, platform, json, md) VALUES ('{date}', 'amazon', {q(rep)}, {q(md)});\n")
    os.makedirs(os.path.join(ROOT, "data", "market"), exist_ok=True)
    io.open(os.path.join(ROOT, "data", "market", f"report-{date}.md"), "w", encoding="utf-8").write(md)
    print("写入", d1_exec(sql), "·", date, "vs", prev, "· 类目", len(cats), "· 关键词", len(kws)); print(md[:600])
main()
