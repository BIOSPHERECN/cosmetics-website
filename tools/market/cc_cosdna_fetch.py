#!/usr/bin/env python3
"""从 Common Crawl 的 WARC 里直接取 cosdna 页面正文(不碰 cosdna 站点)。

输入 data/cosdna/cc-index.jsonl(cc_cosdna_index.py 产出);只取 status 200 的产品页 /cosmetic_<4hex><id>.html 与成分页 /<hex+id>.html,
同一 ID 优先 /eng/ 版本、其次最新时间戳。写入 data/cosdna/raw.sqlite(与 cosdna_sweep.py 同库):products(pid,prefix,name,html,fetched_at,src) / ingredients。

    python tools/market/cc_cosdna_fetch.py [--limit N] [--workers 3]

WARC 取法:GET https://data.commoncrawl.org/<filename>,Range: bytes=<offset>-<offset+length-1>,gzip 解开后是 WARC 记录(头 + HTTP 头 + 正文)。
每条约 5–10KB;3 并发、失败退避,别把人家的公共资源当 CDN 用。
"""
import os, sys, re, json, gzip, time, sqlite3, argparse, datetime, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "cosdna"); IDX = os.path.join(DATA, "cc-index.jsonl"); DB = os.path.join(DATA, "raw.sqlite")
now = lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
PROXY = os.environ.get("BOHUI_PROXY", "")   # 直连 data.commoncrawl.org 实测可通;不通时 export BOHUI_PROXY=http://127.0.0.1:7890

def opener():
    h = [urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})] if PROXY else []
    return urllib.request.build_opener(*h)

def pick(records):
    """同 ID 多条捕获:先 /eng/,再时间戳新的"""
    return sorted(records, key=lambda j: (0 if "/eng/" in j["url"] else 1, -int(j["timestamp"])))[0]

def load_targets(c):
    prod, ing = {}, {}
    for l in open(IDX, encoding="utf-8"):
        j = json.loads(l)
        if j.get("status") != "200": continue
        u = j["url"]
        m = re.search(r"cosdna\.com/\w+/cosmetic_([0-9a-f]{4})(\d+)\.html$", u)
        if m: prod.setdefault(m.group(2), []).append(j); continue
        m = re.search(r"cosdna\.com/\w+/([0-9a-f]{5,}\d)\.html$", u)
        if m: ing.setdefault(m.group(1), []).append(j)
    have_p = {r[0] for r in c.execute("SELECT pid FROM products WHERE html IS NOT NULL AND html<>''")}
    have_i = {r[0] for r in c.execute("SELECT slug FROM ingredients WHERE html IS NOT NULL AND html<>''")}
    P = [(pid, pick(v)) for pid, v in prod.items() if pid not in have_p]
    I = [(slug, pick(v)) for slug, v in ing.items() if slug not in have_i]
    return P, I

def fetch_warc(j, op):
    off, ln = int(j["offset"]), int(j["length"])
    req = urllib.request.Request("https://data.commoncrawl.org/" + j["filename"], headers={"Range": f"bytes={off}-{off + ln - 1}", "user-agent": "bohui-cc-fetch/1"})
    for i in range(4):
        try:
            with op.open(req, timeout=120) as r: raw = r.read()
            txt = gzip.decompress(raw).decode("utf-8", "replace")
            # WARC 记录:WARC 头 \r\n\r\n HTTP 头 \r\n\r\n 正文
            parts = txt.split("\r\n\r\n", 2)
            return parts[2] if len(parts) == 3 else txt
        except Exception as e:
            if i == 3: raise
            time.sleep(2 * (i + 1))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    c = sqlite3.connect(DB, check_same_thread=False, timeout=120); c.execute("PRAGMA journal_mode=WAL")
    c.executescript("""
    CREATE TABLE IF NOT EXISTS products(pid TEXT PRIMARY KEY, prefix TEXT, name TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    CREATE TABLE IF NOT EXISTS ingredients(slug TEXT PRIMARY KEY, name TEXT, first_seen TEXT, fetched_at TEXT, html TEXT);
    """)
    for col in ("src",):
        for t in ("products", "ingredients"):
            try: c.execute(f"ALTER TABLE {t} ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError: pass
    P, I = load_targets(c)
    if a.limit: P, I = P[:a.limit], I[:a.limit]
    print(now(), "待取 产品", len(P), "成分", len(I))
    lock = threading.Lock(); op = opener(); done = [0, 0]
    def work(kind, key, j):
        html = fetch_warc(j, op)
        m = re.search(r"<title>(.*?)</title>", html, re.S); title = (m.group(1).strip() if m else "")
        src = "cc:" + j["filename"].split("/")[1] + " " + j["url"]
        with lock:
            if kind == "p":
                prefix = re.search(r"cosmetic_([0-9a-f]{4})", j["url"]).group(1)
                c.execute("INSERT INTO products(pid,prefix,name,first_seen,fetched_at,html,src) VALUES(?,?,?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET html=excluded.html, fetched_at=excluded.fetched_at, src=excluded.src, name=COALESCE(products.name, excluded.name), prefix=excluded.prefix",
                          (key, prefix, title.replace(" Ingredient Analysis | CosDNA", ""), now(), now(), html, src))
            else:
                c.execute("INSERT INTO ingredients(slug,name,first_seen,fetched_at,html,src) VALUES(?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET html=excluded.html, fetched_at=excluded.fetched_at, src=excluded.src, name=COALESCE(ingredients.name, excluded.name)",
                          (key, title.replace(" | CosDNA", ""), now(), now(), html, src))
            done[0 if kind == "p" else 1] += 1
            c.commit()   # 每条即提交,别长时间占锁
            if sum(done) % 200 == 0: print(now(), "产品", done[0], "成分", done[1])
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(work, "p", k, j) for k, j in P] + [ex.submit(work, "i", k, j) for k, j in I]
        fails = 0
        for f in as_completed(futs):
            try: f.result()
            except Exception as e:
                fails += 1
                if fails <= 20: print(now(), "失败", str(e)[:100])
    c.commit(); print(now(), "完成 产品", done[0], "成分", done[1], "失败", fails)

if __name__ == "__main__":
    main()
