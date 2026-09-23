#!/usr/bin/env python3
"""海外电商爆款调研 —— 分国家、分平台,全自动。

由来(创始人 2026-09-10 04:1x:「新闻版块加 1 个各大海外电商平台爆款调研,
分国家分开执行,这样区分满足客户需求,这个需要制定一个全自动任务完成!
也就是爬虫技术需要干的!」)。

**为什么不直接爬平台页面:**
Amazon / Shopee / Lazada / Coupang / Noon 全都有强反爬(指纹、验证码、行为检测)。
硬爬三件事必然发生:① 当天被封 IP;② 拿回来的是验证码页面而不是数据,
脚本还以为成功;③ 违反平台条款,给公司留隐患。
所以走**搜索引擎索引层**(Exa):它已经把这些平台的公开榜单与测评抓过一遍,
我们检索它的索引,拿到的是可核对的公开链接 —— 每条都带原始 URL,客户能自己点开验。
这不是退而求其次,是把「会不会被堵」这个变量从流程里去掉。

**分国家的意义**(创始人的原话是「这样区分满足客户需求」):
同一支产品在美国和印尼卖不动的原因完全不同 —— 气候、肤质、宗教合规、价格带、
渠道结构都不一样。给客户看「全球爆款」是没用的,给他看「印尼 Shopee 上什么在卖」
才是他下单前真正要的。

三条纪律:
  1. **每条必须带可点开的原始链接**。没有 URL 的条目不入库 —— 不能拿一句
     「据了解某某在东南亚很火」当调研。
  2. **不编销量数字**。搜索结果里有的照录并注明出处,没有就留空。
  3. **限速与退避**。Exa 有配额,批量跑要控速;失败退避重试,不硬顶。

用法:
    python tools/ecom-trends.py --dry            只跑一个国家看效果
    python tools/ecom-trends.py                  跑全部国家
    python tools/ecom-trends.py --apply          写入 D1
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_ecom-cache.json")

# 国家 × 主流平台。按帛卉实际出货的市场排,不是按平台大小排。
MARKETS = [
    ("us", "美国", "United States", ["Amazon US", "TikTok Shop US", "Sephora US"]),
    ("id", "印尼", "Indonesia", ["Shopee Indonesia", "Tokopedia", "TikTok Shop Indonesia"]),
    ("th", "泰国", "Thailand", ["Shopee Thailand", "Lazada Thailand", "TikTok Shop Thailand"]),
    ("my", "马来西亚", "Malaysia", ["Shopee Malaysia", "Lazada Malaysia"]),
    ("vn", "越南", "Vietnam", ["Shopee Vietnam", "TikTok Shop Vietnam"]),
    ("ph", "菲律宾", "Philippines", ["Shopee Philippines", "Lazada Philippines"]),
    ("sg", "新加坡", "Singapore", ["Shopee Singapore", "Lazada Singapore"]),
    ("br", "巴西", "Brazil", ["Mercado Livre Brazil", "Amazon Brazil", "Beleza na Web"]),
    ("jp", "日本", "Japan", ["Amazon Japan", "Rakuten", "@cosme"]),
    ("kr", "韩国", "South Korea", ["Coupang", "Olive Young"]),
    ("ae", "中东", "Middle East", ["Noon", "Amazon UAE"]),
    ("de", "欧洲", "Europe", ["Amazon Germany", "Douglas", "Notino"]),
]

# 品类按我们做得了的排 —— 调研的用处是接单,不是看热闹
CATS = [
    ("skincare", "护肤", "skincare serum moisturizer"),
    ("suncare", "防晒", "sunscreen SPF"),
    ("oral", "口腔护理", "toothpaste mouthwash oral care"),
    ("body", "身体护理", "body lotion body wash"),
    ("haircare", "洗护", "shampoo conditioner hair mask"),
]


def exa(query: str, n: int = 6, tries: int = 3):
    """走 mcporter 调 Exa。失败退避重试 —— 配额抖动是常态,不是错误。"""
    call = f'exa.web_search_exa(query: "{query}", numResults: {n})'
    for i in range(tries):
        p = subprocess.run(["mcporter", "call", call], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=180,
                           shell=(os.name == "nt"))
        out = p.stdout or ""
        if "URL:" in out:
            return out
        time.sleep(2.5 * (i + 1))
    return ""


def parse(out: str, cc: str, cname: str, cat: str, plat: str):
    """把 Exa 的文本结果拆成条目。没有 URL 的丢掉 —— 不可核对的不入库。"""
    rows, cur = [], {}
    for ln in out.split("\n"):
        if ln.startswith("Title: "):
            if cur.get("url"):
                rows.append(cur)
            cur = {"title": ln[7:].strip()}
        elif ln.startswith("URL: "):
            cur["url"] = ln[5:].strip()
        elif ln.startswith("Published: ") and ln[11:].strip() not in ("N/A", ""):
            cur["pub"] = ln[11:].strip()[:10]
    if cur.get("url"):
        rows.append(cur)
    out_rows = []
    for r in rows:
        t = (r.get("title") or "").strip()
        if not t or t == "N/A" or not r.get("url", "").startswith("http"):
            continue
        out_rows.append({
            "country": cc, "country_zh": cname, "category": cat, "platform": plat,
            "title": t[:300], "url": r["url"][:600], "published": r.get("pub", ""),
        })
    return out_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只跑第一个国家")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--pause", type=float, default=1.2)
    a = ap.parse_args()

    markets = MARKETS[:1] if a.dry else MARKETS
    cache = json.loads(io.open(CACHE, encoding="utf-8").read()) if os.path.exists(CACHE) else {}
    got = []
    for cc, czh, cen, plats in markets:
        for cat, cat_zh, kw in CATS:
            plat = plats[0]
            key = f"{cc}/{cat}"
            if key in cache:
                got += cache[key]
                continue
            q = f"best selling {kw} {cen} {plat} bestseller 2026 top products"
            out = exa(q, 6)
            rows = parse(out, cc, czh, cat, plat)
            cache[key] = rows
            got += rows
            print(f"  {czh:<6} {cat_zh:<6} {plat:<24} {len(rows)} 条", flush=True)
            io.open(CACHE, "w", encoding="utf-8", newline="\n").write(
                json.dumps(cache, ensure_ascii=False))
            time.sleep(a.pause)

    print(f"\n合计 {len(got)} 条 · 覆盖 {len({r['country'] for r in got})} 个市场")
    if not a.apply:
        print("加 --apply 才写库")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_ecom-trends.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("CREATE TABLE IF NOT EXISTS ecom_trends ("
                 "id INTEGER PRIMARY KEY AUTOINCREMENT, country TEXT, country_zh TEXT,"
                 " category TEXT, platform TEXT, title TEXT, url TEXT UNIQUE,"
                 " published TEXT, captured_at TEXT);\n")
        fh.write("CREATE INDEX IF NOT EXISTS idx_ecom_country ON ecom_trends(country, category);\n")
        for i in range(0, len(got), 30):
            vals = ",".join(
                "(" + ",".join([q(r["country"]), q(r["country_zh"]), q(r["category"]),
                                q(r["platform"]), q(r["title"]), q(r["url"]),
                                q(r["published"]), "datetime('now')"]) + ")"
                for r in got[i:i + 30])
            fh.write("INSERT OR IGNORE INTO ecom_trends "
                     "(country,country_zh,category,platform,title,url,published,captured_at) "
                     f"VALUES {vals};\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    n = d1("SELECT COUNT(*) n FROM ecom_trends")
    print(f"完成:ecom_trends 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
