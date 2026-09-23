#!/usr/bin/env python3
"""把 data/market/<platform>-<date>.json 灌进 D1(market_products upsert + market_snapshots 当日快照)。
用法:python tools/market/load.py [文件...];不给文件则装今天的全部。"""
import datetime as dt, glob, io, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
num = lambda s: (re.sub(r"[^\d.]", "", str(s or "")) or None)  # noqa: E731
files = sys.argv[1:] or glob.glob(os.path.join(ROOT, "data", "market", f"*-{dt.date.today().isoformat()}.json"))
lines = []
for f in files:
    rows = json.load(io.open(f, encoding="utf-8"))
    for r in rows:
        pf, pid, date = r.get("platform"), r.get("asin") or r.get("pid"), r.get("date")
        if not (pf and pid and date): continue
        lines.append(f"INSERT INTO market_products (platform, pid, title, brand, cat, url, img, first_seen, last_seen) VALUES ({q(pf)}, {q(pid)}, {q((r.get('title') or '')[:300])}, {q(r.get('brand'))}, {q(r.get('cat'))}, {q(r.get('url'))}, {q(r.get('img'))}, {q(date)}, {q(date)}) ON CONFLICT(platform, pid) DO UPDATE SET title = COALESCE(NULLIF(excluded.title, ''), market_products.title), last_seen = excluded.last_seen;")
        lines.append(f"INSERT INTO market_snapshots (date, platform, pid, cat, rank, price, currency, rating, reviews, sold) VALUES ({q(date)}, {q(pf)}, {q(pid)}, {q(r.get('cat'))}, {q(num(r.get('rank')))}, {q(num(r.get('price')))}, {q('USD' if pf.startswith('amazon-us') else r.get('currency'))}, {q(num(r.get('rating')))}, {q(num(r.get('reviews')))}, {q(r.get('sold'))}) ON CONFLICT(date, platform, pid, cat) DO UPDATE SET rank = excluded.rank, price = excluded.price, rating = excluded.rating, reviews = excluded.reviews, sold = excluded.sold;")
    print(f, len(rows))
if lines:
    out = os.path.join(ROOT, "tools", "_market.sql"); io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("写入", d1_exec(out), "· products", d1("SELECT COUNT(*) n FROM market_products")[0]["n"], "· snapshots", d1("SELECT COUNT(*) n FROM market_snapshots")[0]["n"])
