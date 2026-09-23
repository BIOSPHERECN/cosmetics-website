#!/usr/bin/env python3
"""CosDNA 定向撒网抓取(主线 2026-09-20)。站点没有全量入口:产品 ID 带校验前缀不能枚举,搜索每词最多 12 页 × 25 条,
成分页只露 10 个产品,「更多」要登录。所以用「关键词 × 5 种排序 × 12 页」撒网,按产品 ID 去重,再逐个产品页取成分表。

走 WorkBuddy 的抓取实例(D:\\ie\\Chrome,--remote-debugging-port=9222,已过 Cloudflare 验证),开新标签取渲染后的 HTML,读完即关。
原文落本地 SQLite(data/cosdna/raw.sqlite):search_pages / product_pages / ingredient_pages 三张表,URL+抓取时间+原文;进 D1 与改写另起脚本。

    python tools/market/cosdna_sweep.py --keywords data/cosdna/keywords.txt        # 撒网:每行一个词(品牌/品类/成分)
    python tools/market/cosdna_sweep.py --products                                  # 逐个抓已发现但没抓过的产品页
    python tools/market/cosdna_sweep.py --ingredients                               # 逐个抓产品页里出现的成分页
    python tools/market/cosdna_sweep.py --stats
    选项:--delay 8(秒/页,站方对搜索引擎要求 10 秒,别低于 6)--max-pages 12 --sorts featured,date,name,click,review --limit N

铁令:单标签串行;遇到「Just a moment」/验证页立刻停 1 小时;CPU 30% 以下;夜间跑。
"""
import os, sys, re, json, time, sqlite3, subprocess, argparse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "cosdna"); os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "raw.sqlite")
CDP_GET = os.path.join(ROOT, "tools", "market", "cdp_get.mjs")
BASE = "https://www.cosdna.com/eng/"
NODE = os.environ.get("NODE", "node")

def db():
    c = sqlite3.connect(DB, timeout=120)   # 与 cc_cosdna_fetch 同库并发写:等锁 120 秒
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript("""
    CREATE TABLE IF NOT EXISTS search_pages(url TEXT PRIMARY KEY, keyword TEXT, sort TEXT, page INT, fetched_at TEXT, n_products INT, html TEXT);
    CREATE TABLE IF NOT EXISTS products(pid TEXT PRIMARY KEY, prefix TEXT, name TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    CREATE TABLE IF NOT EXISTS ingredients(slug TEXT PRIMARY KEY, name TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    CREATE TABLE IF NOT EXISTS keywords_done(keyword TEXT, sort TEXT, pages INT, products INT, done_at TEXT, PRIMARY KEY(keyword, sort));
    """)
    return c

def fetch(url, wait_ms=3500):
    """经 9222 实例取渲染后 HTML;返回 (title, url, html)。验证页/异常抛错。"""
    out = subprocess.run([NODE, CDP_GET, url, str(wait_ms), "html"], capture_output=True, text=True, encoding="utf-8", timeout=90)
    if out.returncode != 0: raise RuntimeError(out.stderr[-200:])
    j = json.loads(out.stdout)
    if "Just a moment" in j.get("title", "") or "请稍候" in j.get("title", "") or "安全验证" in j.get("html", "")[:3000]:
        raise RuntimeError("cloudflare-challenge")
    return j["title"], j["url"], j["html"]

PROD_RE = re.compile(r'href="/eng/cosmetic_([0-9a-f]{4})(\d+)\.html"[^>]*>\s*([^<]{1,200}?)\s*<', re.S)
ING_RE = re.compile(r'href="/eng/([0-9a-f]{5,}\d)\.html"[^>]*>\s*([^<]{1,120}?)\s*<', re.S)
now = lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def sweep(c, keywords, sorts, max_pages, delay, limit):
    n_new = 0; done = 0
    for kw in keywords:
        for s in sorts:
            if c.execute("SELECT 1 FROM keywords_done WHERE keyword=? AND sort=?", (kw, s)).fetchone(): continue
            total = 0; pages = 0; seen_first = None
            for p in range(1, max_pages + 1):
                url = f"{BASE}product.php?q={kw}&sort={s}&p={p}"
                try: title, real, html = fetch(url)
                except RuntimeError as e:
                    if "cloudflare" in str(e): print(now(), "被验证页挡住,停 1 小时"); time.sleep(3600); continue
                    print(now(), "失败", url, str(e)[:80]); time.sleep(delay); continue
                found = PROD_RE.findall(html)
                ids = [pid for _, pid, _ in found]
                if not ids or (seen_first and ids[0] == seen_first):   # 超过末页会回到第 1 页的内容
                    break
                if p == 1: seen_first = ids[0]
                c.execute("INSERT OR REPLACE INTO search_pages VALUES(?,?,?,?,?,?,?)", (url, kw, s, p, now(), len(ids), html))
                for prefix, pid, name in found:
                    if c.execute("INSERT OR IGNORE INTO products(pid,prefix,name,first_seen) VALUES(?,?,?,?)", (pid, prefix, name.strip(), now())).rowcount: n_new += 1
                c.commit(); total += len(ids); pages = p
                print(now(), f"{kw} [{s}] p{p} {len(ids)} 条 · 新产品累计 {n_new}")
                time.sleep(delay)
                if len(ids) < 25: break
            c.execute("INSERT OR REPLACE INTO keywords_done VALUES(?,?,?,?,?)", (kw, s, pages, total, now())); c.commit()
            done += 1
            if s == sorts[0] and pages <= 1:   # 第一种排序就不满一页:结果集已全拿到,其余排序不用跑
                for s2 in sorts[1:]: c.execute("INSERT OR IGNORE INTO keywords_done VALUES(?,?,?,?,?)", (kw, s2, 0, 0, now()))
                c.commit(); break
            if limit and done >= limit: return n_new
    return n_new

def products(c, delay, limit):
    rows = c.execute("SELECT pid, prefix FROM products WHERE fetched_at IS NULL ORDER BY pid").fetchall()
    if limit: rows = rows[:limit]
    for i, (pid, prefix) in enumerate(rows, 1):
        url = f"{BASE}cosmetic_{prefix}{pid}.html"
        try: title, real, html = fetch(url)
        except RuntimeError as e:
            if "cloudflare" in str(e): print(now(), "被验证页挡住,停 1 小时"); time.sleep(3600); continue
            print(now(), "失败", url, str(e)[:80]); time.sleep(delay); continue
        if "product.php" in real:   # 前缀错或已下架:跳回搜索页
            c.execute("UPDATE products SET fetched_at=?, html='' WHERE pid=?", (now(), pid)); c.commit(); time.sleep(delay); continue
        c.execute("UPDATE products SET name=?, fetched_at=?, html=? WHERE pid=?", (title.replace(" Ingredient Analysis | CosDNA", ""), now(), html, pid))
        for slug, name in ING_RE.findall(html):
            c.execute("INSERT OR IGNORE INTO ingredients(slug,name,first_seen) VALUES(?,?,?)", (slug, name.strip(), now()))
        c.commit(); print(now(), f"产品 {i}/{len(rows)} {pid} {title[:50]}")
        time.sleep(delay)

def ingredients(c, delay, limit):
    rows = c.execute("SELECT slug FROM ingredients WHERE fetched_at IS NULL ORDER BY slug").fetchall()
    if limit: rows = rows[:limit]
    for i, (slug,) in enumerate(rows, 1):
        url = f"{BASE}{slug}.html"
        try: title, real, html = fetch(url)
        except RuntimeError as e:
            if "cloudflare" in str(e): print(now(), "被验证页挡住,停 1 小时"); time.sleep(3600); continue
            print(now(), "失败", url, str(e)[:80]); time.sleep(delay); continue
        c.execute("UPDATE ingredients SET name=?, fetched_at=?, html=? WHERE slug=?", (title.replace(" | CosDNA", ""), now(), html, slug))
        for prefix, pid, name in PROD_RE.findall(html):   # 成分页顺带露出 10 个产品
            c.execute("INSERT OR IGNORE INTO products(pid,prefix,name,first_seen) VALUES(?,?,?,?)", (pid, prefix, name.strip(), now()))
        c.commit(); print(now(), f"成分 {i}/{len(rows)} {title[:50]}")
        time.sleep(delay)

def stats(c):
    q = lambda s: c.execute(s).fetchone()[0]
    print("产品 ID", q("SELECT count(*) FROM products"), "已抓正文", q("SELECT count(*) FROM products WHERE fetched_at IS NOT NULL AND html<>''"),
          "| 成分页", q("SELECT count(*) FROM ingredients"), "已抓", q("SELECT count(*) FROM ingredients WHERE fetched_at IS NOT NULL"),
          "| 搜索页", q("SELECT count(*) FROM search_pages"), "| 词×排序 已完成", q("SELECT count(*) FROM keywords_done"))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords"); ap.add_argument("--products", action="store_true"); ap.add_argument("--ingredients", action="store_true"); ap.add_argument("--stats", action="store_true")
    ap.add_argument("--delay", type=float, default=8); ap.add_argument("--max-pages", type=int, default=12); ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sorts", default="featured,date,name,click,review")
    a = ap.parse_args(); c = db()
    if a.keywords:
        kws = [l.strip() for l in open(a.keywords, encoding="utf-8") if l.strip() and not l.startswith("#")]
        print("新发现产品", sweep(c, kws, a.sorts.split(","), a.max_pages, a.delay, a.limit))
    if a.products: products(c, a.delay, a.limit)
    if a.ingredients: ingredients(c, a.delay, a.limit)
    stats(c)
