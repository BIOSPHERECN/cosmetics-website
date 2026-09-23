#!/usr/bin/env python3
"""CosDNA 解析结果 → D1(market_products platform='cosdna' + market_product_raw pid='cosdna:<pid>')。

    python tools/market/cosdna_to_d1.py [--limit N]

market_products:pid=cosdna 数字 ID,title=产品名,brand=名称首词(弱,后续 AI 改写时校正),url=/eng/cosmetic_<prefix><pid>.html,inci=成分名按顺序用 ", " 连接,country 留空。
market_product_raw:raw_json=解析后的 JSON(含每成分的功能/致痘/刺激/安全分,不含 HTML),src_file='cosdna:<来源>'。
按字节切批(≤60KB/语句,D1 单语句上限约 100KB);INSERT OR IGNORE,可重跑。成分页(CAS/安全/功能)暂不入 D1,等定成分库合并口径。
"""
import os, sys, json, sqlite3, argparse, io
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools")); from _bohui import d1_exec, d1   # noqa
P = os.path.join(ROOT, "data", "cosdna", "parsed.sqlite"); R = os.path.join(ROOT, "data", "cosdna", "raw.sqlite")
q = lambda s: "'" + str(s if s is not None else "").replace("'", "''") + "'"

def flush(rows, sql_head, path):
    if not rows: return 0
    with io.open(path, "w", encoding="utf-8") as w: w.write(sql_head + ",".join(rows) + ";")
    return d1_exec(path) or 0

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--missing", action="store_true"); a = ap.parse_args()
    o = sqlite3.connect(P); r = sqlite3.connect(R, timeout=120)
    prefix = {pid: pf for pid, pf in r.execute("SELECT pid, prefix FROM products")}
    src = {pid: s for pid, s in r.execute("SELECT pid, src FROM products")}
    ings = {}
    for pid, pos, slug, name, fn, acne, irr, saf in o.execute("SELECT pid,pos,slug,name,function,acne,irritant,safety FROM product_ingredients ORDER BY pid,pos"):
        ings.setdefault(pid, []).append({"pos": pos, "slug": slug, "name": name, "function": fn, "acne": acne, "irritant": irr, "safety": saf})
    prods = o.execute("SELECT pid, lang, name, brand_guess, posted, source, n_ingredients, reviews FROM products_p WHERE n_ingredients > 0").fetchall()
    if a.missing:   # 补漏:只写 D1 里还没有的(某几批 wrangler 超时会漏)
        have = {r["pid"] for r in (d1("SELECT pid FROM market_products WHERE platform='cosdna'") or [])}
        have_raw = {r["pid"][7:] for r in (d1("SELECT pid FROM market_product_raw WHERE pid LIKE 'cosdna:%'") or [])}
        prods = [x for x in prods if x[0] not in have or x[0] not in have_raw]
    if a.limit: prods = prods[:a.limit]
    print("待入库", len(prods))
    tmp1, tmp2 = os.path.join(ROOT, "tools", "_cosdna_p.sql"), os.path.join(ROOT, "tools", "_cosdna_raw.sql")
    h1 = "INSERT OR IGNORE INTO market_products (platform, pid, title, brand, cat, url, inci, first_seen, last_seen) VALUES "
    h2 = "INSERT OR IGNORE INTO market_product_raw (pid, raw_json, scraped_at, src_file) VALUES "
    b1, b2, s1, s2, n1, n2 = [], [], 0, 0, 0, 0
    for pid, lang, name, brand, posted, source, n, reviews in prods:
        L = ings.get(pid, [])
        inci = ", ".join(x["name"] for x in L)
        url = f"https://www.cosdna.com/{lang or 'eng'}/cosmetic_{prefix.get(pid, '')}{pid}.html"
        row1 = f"('cosdna',{q(pid)},{q(name[:300])},{q((brand or '')[:80])},'',{q(url)},{q(inci[:6000])},{q(posted)},datetime('now'))"
        raw = json.dumps({"pid": pid, "lang": lang, "name": name, "posted": posted, "source": source, "reviews": reviews, "ingredients": L}, ensure_ascii=False)
        row2 = f"({q('cosdna:' + pid)},{q(raw[:20000])},{q(posted)},{q('cosdna:' + (src.get(pid) or ''))[:400]})"
        b1.append(row1); s1 += len(row1); b2.append(row2); s2 += len(row2)
        if s1 > 60_000 or len(b1) >= 40: n1 += flush(b1, h1, tmp1); b1, s1 = [], 0
        if s2 > 60_000 or len(b2) >= 12: n2 += flush(b2, h2, tmp2); b2, s2 = [], 0
    n1 += flush(b1, h1, tmp1); n2 += flush(b2, h2, tmp2)
    print("完成:market_products 写入", n1, "行;market_product_raw 写入", n2, "行")

if __name__ == "__main__":
    main()
