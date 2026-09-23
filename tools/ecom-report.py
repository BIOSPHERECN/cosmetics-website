#!/usr/bin/env python3
"""把《跨境美妆爆款监控日报》导入站点 —— 这才是爆款调研该有的样子。

由来(创始人 2026-09-10 11:1x,发来 `官网素材/爆款化妆品监控日报-2026-09-05.md`:
「这才是爆款监控日报啊,你现在收集的好像不对吧」)。

他是对的。我之前那版 `/trends/` 是拿搜索引擎索引层(Exa)找了一批公开链接,
每条只有标题 + 链接 —— 客户看完不知道**卖了多少、什么价、涨了多少、谁家的店**。
而这份日报是真的调研:8 平台 × 4 大类 × 21 细分类目,每个细分出「销量最高 Top100」
与「增长最快 Top100」双榜,单品行带品牌、价格(本币 + 美元)、销量、环比、评分、
评论数、排名变化、店铺、链接。2,236 行。

**数字的出处必须挂住。** 这份报告是帛卉自己的采集口径(平台官方榜 + FastMoss /
FindNiche / EchoTik / 蓝鲸BI 等),不是我们凭空生成的,也不是平台官方授权数据。
页面上必须写明「数据来源:帛卉跨境美妆爆款监控日报(报告日期)」并保留报告的采集口径说明 ——
少了这句,客户会以为是平台官方数字。

用法:
    python tools/ecom-report.py <日报.md>            体检
    python tools/ecom-report.py <日报.md> --apply    写库
"""
import argparse
import glob
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
BOARD = re.compile(r"\*\*(.+?)\s*·\s*(销量最高|增长最快)\s*Top\s*\d+\*\*")
DATE = re.compile(r"\*\*报告日期\*\*[::]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})")


def clean(s: str) -> str:
    s = s.strip()
    if s in ("—", "-", "–", "N/A", ""):
        return ""
    m = LINK.search(s)
    if m and s.startswith("["):
        return m.group(1).strip()
    return s


def parse(path: str):
    txt = io.open(path, encoding="utf-8", errors="replace").read()
    m = DATE.search(txt)
    rep = m.group(1) if m else ""
    if not rep:
        # 正文里的「报告日期」有时用全角冒号、有时带星期后缀,匹配不到就退回文件名里的日期
        fm = re.search(r"(20\d{2}-\d{2}-\d{2})", os.path.basename(path))
        rep = fm.group(1) if fm else ""
    region = platform = cat = sub = board = ""
    rows, seen = [], set()
    for ln in txt.split("\n"):
        t = ln.strip()
        if t.startswith("## "):
            # 「一、东南亚区域」这类大节 = 区域
            region = re.sub(r"^[一二三四五六七八九十]+、", "", t[3:]).replace("区域", "").strip()
            platform = cat = sub = board = ""
            continue
        if t.startswith("### "):
            platform = t[4:].strip()
            cat = sub = board = ""
            continue
        if t.startswith("#### "):
            cat = t[5:].strip()
            sub = board = ""
            continue
        m = BOARD.search(t)
        if m:
            sub, board = m.group(1).strip(), m.group(2).strip()
            continue
        if not t.startswith("|") or not board:
            continue
        cells = [c.strip() for c in t.strip("|").split("|")]
        if len(cells) < 8:
            continue
        if cells[0] in ("排名", "---") or set(cells[0]) <= {"-", " "}:
            continue
        if not re.match(r"^\d+$", cells[0]):
            continue
        g = lambda i: clean(cells[i]) if i < len(cells) else ""  # noqa: E731
        r = {
            "report_date": rep, "region": region, "platform": platform,
            "category": cat, "subcategory": sub, "board": board,
            "rank": int(cells[0]), "title": g(1), "brand": g(2),
            "price": g(4), "price_note": g(5), "sales": g(6), "delta": g(7),
            "rating": g(8), "reviews": g(9), "rank_change": g(10), "shop": g(11),
            "url": g(12), "image": g(13),
        }
        if not r["title"]:
            continue
        k = (r["platform"], r["subcategory"], r["board"], r["rank"], r["title"])
        if k in seen:
            continue
        seen.add(k)
        rows.append(r)
    return rep, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    rep, rows = parse(a.path)
    from collections import Counter
    print(f"报告日期 {rep} · 解析单品 {len(rows):,} 行")
    print("  区域:", Counter(r["region"] for r in rows).most_common())
    print("  平台:", Counter(r["platform"] for r in rows).most_common(8))
    print("  大类:", Counter(r["category"] for r in rows).most_common())
    print("  榜别:", Counter(r["board"] for r in rows).most_common())
    print(f"  有销量数字 {sum(1 for r in rows if r['sales']):,} · 有价格 {sum(1 for r in rows if r['price']):,}"
          f" · 有链接 {sum(1 for r in rows if r['url'].startswith('http')):,}")
    for r in rows[:4]:
        print(f"    [{r['platform']}] {r['subcategory']} #{r['rank']} {r['title'][:34]} | "
              f"{r['brand'][:14]} | {r['price'][:20]} | {r['sales'][:12]} | {r['delta'][:8]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    cols = ("report_date,region,platform,category,subcategory,board,rank_no,title,brand,price,"
            "price_note,sales,delta,rating,reviews,rank_change,shop,url,image")
    lines = [
        "CREATE TABLE IF NOT EXISTS ecom_items (id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " report_date TEXT, region TEXT, platform TEXT, category TEXT, subcategory TEXT, board TEXT,"
        " rank_no INTEGER, title TEXT, brand TEXT, price TEXT, price_note TEXT, sales TEXT, delta TEXT,"
        " rating TEXT, reviews TEXT, rank_change TEXT, shop TEXT, url TEXT, image TEXT);",
        "CREATE INDEX IF NOT EXISTS idx_ecom_items_k ON ecom_items(report_date, region, category, board);",
        f"DELETE FROM ecom_items WHERE report_date = '{rep}';",
    ]
    vals = []
    for r in rows:
        vals.append("(" + ",".join([
            q(r["report_date"]), q(r["region"]), q(r["platform"]), q(r["category"]), q(r["subcategory"]),
            q(r["board"]), str(r["rank"]), q(r["title"][:300]), q(r["brand"][:120]), q(r["price"][:120]),
            q(r["price_note"][:120]), q(r["sales"][:80]), q(r["delta"][:60]), q(r["rating"][:30]),
            q(r["reviews"][:40]), q(r["rank_change"][:60]), q(r["shop"][:160]), q(r["url"][:400]),
            q(r["image"][:400]),
        ]) + ")")
    for i in range(0, len(vals), 40):
        lines.append(f"INSERT INTO ecom_items ({cols}) VALUES " + ",".join(vals[i:i + 40]) + ";")

    for old in glob.glob(os.path.join(HERE, "_ecom-report-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_ecom-report-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f)
            print(f"    片 {part}: {os.path.getsize(f):,} 字节 · 累计 {total:,} 行", flush=True)
            buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_ecom-report-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
        print(f"    片 {part}: {os.path.getsize(f):,} 字节 · 累计 {total:,} 行", flush=True)
    n = d1("SELECT COUNT(*) n FROM ecom_items")
    print(f"完成:ecom_items 共 {n[0]['n'] if n else '?'} 行")


if __name__ == "__main__":
    main()
