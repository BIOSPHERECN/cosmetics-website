#!/usr/bin/env python3
"""把 data/cosdna/raw.sqlite 里的 CosDNA 原文解析成结构化表(仍在本地 SQLite:data/cosdna/parsed.sqlite)。

products_p(pid, lang, name, brand_guess, posted, source, n_ingredients, reviews)  · product_ingredients(pid, pos, slug, name, function, acne, irritant, safety)
ingredients_p(slug, lang, name, aliases, cas, safety, functions)
只解析、不改写、不出站;入 D1 与 AI 改写另起脚本。

    python tools/market/cosdna_parse.py [--limit N]
"""
import re, html as H, sqlite3, argparse, os, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "data", "cosdna", "raw.sqlite"); OUT = os.path.join(ROOT, "data", "cosdna", "parsed.sqlite")
now = lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
clean = lambda s: H.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ").strip()
sp = lambda s: re.sub(r"\s+", " ", clean(s))

ROW_RE = re.compile(r'<tr class="tr-i[^"]*">(.*?)</tr>', re.S)         # 2020–2025 表格版式(CC 存档;class 后来带 hover:)
MLI_RE = re.compile(r'<li class="list-group-item[^"]*">(.*?)</li>', re.S)   # m.cosdna.com 手机版式
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
LI_RE = re.compile(r'<li class="grid md:grid-cols-12[^"]*">(.*?)</li>', re.S)   # 2026 现网 grid 版式
DIV_RE = re.compile(r'<div class="(?:md:)?col-span-\d[^"]*"[^>]*>(.*?)</div>\s*(?=<div class="(?:md:)?col-span|$)', re.S)

def parse_product(pid, html, src):
    lang = (re.search(r"cosdna\.com/(\w+)/", src or "") or [None, "eng"])[1]
    title = sp((re.search(r"<title>(.*?)</title>", html, re.S) or [None, ""])[1])
    name = re.sub(r"\s*(Ingredient Analysis|成分分析|成分表|成分列表)?\s*\|\s*CosDNA.*$", "", title)
    m = re.search(r"Posted on\s*([\d\-/]+)\s*,\s*Source:\s*([^<\n]+)", clean(html[:20000]))
    posted, source = (m.group(1), m.group(2).strip()) if m else ("", "")
    rows = []
    blocks = [CELL_RE.findall(tr) for tr in ROW_RE.findall(html)] or [DIV_RE.findall(li) for li in LI_RE.findall(html)]
    if not blocks and "list-group-item" in html:   # 手机版:只有名称/功能/三格分数
        for li in MLI_RE.findall(html):
            a = re.search(r'href="/\w+/([0-9a-f]{5,}\d)\.html', li)
            if not a: continue
            nm = sp((re.search(r'<span class="colors">(.*?)</span>', li, re.S) or [None, ""])[1])
            fn = sp((re.search(r'text-vampire[^>]*>(.*?)</div>', li, re.S) or [None, ""])[1])
            sc = lambda k: (re.search(r'class="[^"]*' + k + r'[^"]*"[^>]*>\s*(\d+(?:-\d+)?)\s*<', li) or [None, ""])[1]
            blocks.append(['<a ' + a.group(0) + '">' + nm + "</a>", fn, ">" + sc("acne") + "<", ">" + sc("irritant") + "<", ">" + sc("safety") + "<"])
    for k, cells in enumerate(blocks, 1):
        if len(cells) < 5: continue
        a = re.search(r'href="/\w+/([0-9a-f]{5,}\d)\.html', cells[0]); slug = a.group(1) if a else ""
        nm = sp(re.sub(r'<div class="small[^"]*">.*?</div>', "", cells[0], flags=re.S))
        num = lambda s: (re.search(r">\s*(\d+(?:-\d+)?)\s*<", s) or [None, ""])[1]
        rows.append((pid, k, slug, nm, sp(cells[1]), num(cells[2]), num(cells[3]), num(cells[4])))
    reviews = (re.search(r"(\d+)\s*Reviews?", clean(html[:30000])) or [None, "0"])[1]
    brand = name.split(" ")[0] if name else ""
    return (pid, lang, name, brand, posted, source, len(rows), int(reviews)), rows

def parse_ingredient(slug, html, src):
    lang = (re.search(r"cosdna\.com/(\w+)/", src or "") or [None, "eng"])[1]
    title = sp((re.search(r"<title>(.*?)</title>", html, re.S) or [None, ""])[1]); name = re.sub(r"\s*\|\s*CosDNA.*$", "", title)
    body = clean(html)
    body = re.sub(r"\s+", " ", body)
    cas = (re.search(r"Cas No[:：]?\s*([0-9][0-9\-; ]*)", body) or [None, ""])[1].strip(" ;")
    safety = (re.search(r"Safety\s*(\d+(?:\s*-\s*\d+)?)", body) or [None, ""])[1].replace(" ", "")
    m = re.search(re.escape(name) + r"\s+(.+?)\s+(?:Formula:|Cas No|Safety)", body); aliases = m.group(1).strip() if m and len(m.group(1)) < 200 and "CosDNA" not in m.group(1) else ""
    m2 = re.search(r"Safety\s*\d+(?:\s*-\s*\d+)?\s+(.+?)\s+(?:\[1\]|Ingredient supplier|Products with|Leave a comment|Sign up)", body); functions = m2.group(1).strip() if m2 and len(m2.group(1)) < 200 else ""
    return (slug, lang, name, aliases, cas, safety, functions)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); a = ap.parse_args()
    r = sqlite3.connect(RAW, timeout=120); o = sqlite3.connect(OUT)
    o.executescript("""
    CREATE TABLE IF NOT EXISTS products_p(pid TEXT PRIMARY KEY, lang TEXT, name TEXT, brand_guess TEXT, posted TEXT, source TEXT, n_ingredients INT, reviews INT, parsed_at TEXT);
    CREATE TABLE IF NOT EXISTS product_ingredients(pid TEXT, pos INT, slug TEXT, name TEXT, function TEXT, acne TEXT, irritant TEXT, safety TEXT, PRIMARY KEY(pid,pos));
    CREATE TABLE IF NOT EXISTS ingredients_p(slug TEXT PRIMARY KEY, lang TEXT, name TEXT, aliases TEXT, cas TEXT, safety TEXT, functions TEXT, parsed_at TEXT);
    """)
    done = {x[0] for x in o.execute("SELECT pid FROM products_p")}
    q = "SELECT pid, html, src FROM products WHERE html IS NOT NULL AND html<>''"
    n = 0
    for pid, html, src in r.execute(q):
        if pid in done: continue
        head, rows = parse_product(pid, html, src)
        o.execute("INSERT OR REPLACE INTO products_p VALUES(?,?,?,?,?,?,?,?,?)", head + (now(),))
        o.execute("DELETE FROM product_ingredients WHERE pid=?", (pid,)); o.executemany("INSERT OR REPLACE INTO product_ingredients VALUES(?,?,?,?,?,?,?,?)", rows)
        n += 1
        if n % 1000 == 0: o.commit(); print(now(), "产品", n)
        if a.limit and n >= a.limit: break
    o.commit()
    donei = {x[0] for x in o.execute("SELECT slug FROM ingredients_p")}; m = 0
    for slug, html, src in r.execute("SELECT slug, html, src FROM ingredients WHERE html IS NOT NULL AND html<>''"):
        if slug in donei: continue
        o.execute("INSERT OR REPLACE INTO ingredients_p VALUES(?,?,?,?,?,?,?,?)", parse_ingredient(slug, html, src) + (now(),)); m += 1
        if a.limit and m >= a.limit: break
    o.commit()
    g = lambda s: o.execute(s).fetchone()[0]
    print(now(), "本次 产品", n, "成分", m, "| 累计 产品", g("SELECT count(*) FROM products_p"), "成分行", g("SELECT count(*) FROM product_ingredients"),
          "成分页", g("SELECT count(*) FROM ingredients_p"), "| 无成分表的产品", g("SELECT count(*) FROM products_p WHERE n_ingredients=0"))
