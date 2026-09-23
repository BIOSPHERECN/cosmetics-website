#!/usr/bin/env python3
"""EWG Skin Deep(ewg.org/skindeep)全量抓取(主线 2026-09-20 实测结构后写;给 WorkBuddy 或主线跑)。

结构:类目页 /skindeep/browse/category/<Cat>/?page=N(每页 12 个,分页完整;首页列出全部类目)→ 产品页 /skindeep/products/<数字ID>/(slug 可省)
      → 成分页 /skindeep/ingredients/<数字ID>-<NAME>/。Cloudflare 挡 curl,走 9222 抓取实例(已过验证)。robots.txt 未禁 skindeep,自律 6 秒/页。
原文落本地 SQLite data/ewg/raw.sqlite:categories / list_pages / products / ingredients(URL+抓取时间+原文);进 D1 与改写另起脚本。EWG 分数是私有体系,不对外搬。

    python tools/market/ewg_crawl.py --categories            # 从首页取全部类目
    python tools/market/ewg_crawl.py --lists [--limit N]     # 逐类目翻页,收产品 ID
    python tools/market/ewg_crawl.py --products [--limit N]  # 逐产品页(成分表+分数)
    python tools/market/ewg_crawl.py --ingredients [--limit N]
    python tools/market/ewg_crawl.py --stats
"""
import os, re, json, time, sqlite3, subprocess, argparse, datetime, html as H

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "ewg"); os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "raw.sqlite"); CDP_GET = os.path.join(ROOT, "tools", "market", "cdp_get.mjs")
BASE = "https://www.ewg.org"; NODE = os.environ.get("NODE", "node")
now = lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def db():
    c = sqlite3.connect(DB, timeout=120)   # 与 cc_cosdna_fetch 同库并发写:等锁 120 秒
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript("""
    CREATE TABLE IF NOT EXISTS categories(slug TEXT PRIMARY KEY, name TEXT, pages INT, done_at TEXT);
    CREATE TABLE IF NOT EXISTS list_pages(url TEXT PRIMARY KEY, category TEXT, page INT, fetched_at TEXT, n INT, html TEXT);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, slug TEXT, category TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    CREATE TABLE IF NOT EXISTS ingredients(id INTEGER PRIMARY KEY, slug TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    """); return c

def fetch(url, wait_ms=4000):
    out = subprocess.run([NODE, CDP_GET, url, str(wait_ms), "html"], capture_output=True, text=True, encoding="utf-8", timeout=90)
    if out.returncode != 0: raise RuntimeError(out.stderr[-200:])
    j = json.loads(out.stdout)
    if "Just a moment" in j.get("title", "") or "请稍候" in j.get("title", ""): raise RuntimeError("cloudflare-challenge")
    return j["title"], j["url"], j["html"]

CAT_RE = re.compile(r'href="/skindeep/browse/category/([^/"]+)/"')
PROD_RE = re.compile(r'href="(?:https?://www\.ewg\.org)?/skindeep/products/(\d+)-([^/"]*)/"')   # 列表页是绝对链接,产品页是相对链接
ING_RE = re.compile(r'href="(?:https?://www\.ewg\.org)?/skindeep/ingredients/(\d+)-([^/"]*)/"')

def guard(e, delay):
    if "cloudflare" in str(e): print(now(), "被验证页挡住,停 1 小时"); time.sleep(3600)
    else: print(now(), "失败", str(e)[:100]); time.sleep(delay)

def categories(c):
    _, _, h = fetch(BASE + "/skindeep/")
    slugs = sorted(set(CAT_RE.findall(h)) - {"brands"})
    for s in slugs: c.execute("INSERT OR IGNORE INTO categories(slug,name) VALUES(?,?)", (s, H.unescape(s).replace("_", " ")))
    c.commit(); print("类目", len(slugs))

def lists(c, delay, limit):
    cats = [r[0] for r in c.execute("SELECT slug FROM categories WHERE done_at IS NULL ORDER BY slug").fetchall()]
    if limit: cats = cats[:limit]
    for cat in cats:
        # 断点续翻;超过末页 EWG 会一直回最后一页(Foundation 实测 812 页后重复),所以「本页没有新 ID」即停
        p = (c.execute("SELECT COALESCE(MAX(page),0) FROM list_pages WHERE category=?", (cat,)).fetchone()[0] or 0) + 1
        seen = {r[0] for r in c.execute("SELECT id FROM products WHERE category=?", (cat,))}
        while True:
            url = f"{BASE}/skindeep/browse/category/{cat}/?page={p}"
            try: _, real, h = fetch(url)
            except RuntimeError as e: guard(e, delay); continue
            found = PROD_RE.findall(h); ids = [int(i) for i, _ in found]
            if not ids or not (set(ids) - seen): break
            seen |= set(ids)
            c.execute("INSERT OR REPLACE INTO list_pages VALUES(?,?,?,?,?,?)", (url, cat, p, now(), len(set(ids)), h))
            for i, slug in found: c.execute("INSERT OR IGNORE INTO products(id,slug,category,first_seen) VALUES(?,?,?,?)", (int(i), slug, cat, now()))
            c.commit(); print(now(), f"{cat} p{p} {len(set(ids))} 个"); p += 1; time.sleep(delay)
            if len(set(ids)) < 12: break
        c.execute("UPDATE categories SET pages=?, done_at=? WHERE slug=?", (p - 1, now(), cat)); c.commit()

def products(c, delay, limit):
    rows = c.execute("SELECT id FROM products WHERE fetched_at IS NULL ORDER BY id").fetchall()
    if limit: rows = rows[:limit]
    for n, (pid,) in enumerate(rows, 1):
        try: title, real, h = fetch(f"{BASE}/skindeep/products/{pid}/")
        except RuntimeError as e: guard(e, delay); continue
        c.execute("UPDATE products SET fetched_at=?, html=? WHERE id=?", (now(), h if f"/products/{pid}" in real or "Rating" in title else "", pid))
        for i, slug in ING_RE.findall(h): c.execute("INSERT OR IGNORE INTO ingredients(id,slug,first_seen) VALUES(?,?,?)", (int(i), slug, now()))
        c.commit(); print(now(), f"产品 {n}/{len(rows)} {pid} {title[:60]}"); time.sleep(delay)

def ingredients(c, delay, limit):
    rows = c.execute("SELECT id, slug FROM ingredients WHERE fetched_at IS NULL ORDER BY id").fetchall()
    if limit: rows = rows[:limit]
    for n, (iid, slug) in enumerate(rows, 1):
        try: title, real, h = fetch(f"{BASE}/skindeep/ingredients/{iid}-{slug}/")
        except RuntimeError as e: guard(e, delay); continue
        c.execute("UPDATE ingredients SET fetched_at=?, html=? WHERE id=?", (now(), h, iid)); c.commit()
        print(now(), f"成分 {n}/{len(rows)} {iid} {title[:60]}"); time.sleep(delay)

def stats(c):
    q = lambda s: c.execute(s).fetchone()[0]
    print("类目", q("SELECT count(*) FROM categories"), "已翻完", q("SELECT count(*) FROM categories WHERE done_at IS NOT NULL"),
          "| 列表页", q("SELECT count(*) FROM list_pages"), "| 产品 ID", q("SELECT count(*) FROM products"), "已抓", q("SELECT count(*) FROM products WHERE fetched_at IS NOT NULL AND html<>''"),
          "| 成分", q("SELECT count(*) FROM ingredients"), "已抓", q("SELECT count(*) FROM ingredients WHERE fetched_at IS NOT NULL"))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for f in ("categories", "lists", "products", "ingredients", "stats"): ap.add_argument("--" + f, action="store_true")
    ap.add_argument("--delay", type=float, default=6); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args(); c = db()
    if a.categories: categories(c)
    if a.lists: lists(c, a.delay, a.limit)
    if a.products: products(c, a.delay, a.limit)
    if a.ingredients: ingredients(c, a.delay, a.limit)
    stats(c)
