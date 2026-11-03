#!/usr/bin/env python3
"""Amazon 美区 Beauty 榜单快照(公开页,Playwright 真浏览器)。每天跑一次 → data/market/amazon-YYYY-MM-DD.json。
用法:python tools/market/amazon_bestsellers.py [--cats skin-care,hair-care] [--pages 2] [--headed]
只抓榜单页公开字段:名次、ASIN、标题、价格、评分、评论数、链接、图;不抓评论正文。限速:每页停 4–8 秒。"""
import argparse, asyncio, datetime as dt, io, json, os, random, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CATS = {  # Amazon Best Sellers 节点(公开链接)
    "beauty": "https://www.amazon.com/Best-Sellers-Beauty-Personal-Care/zgbs/beauty/",
    "skin-care": "https://www.amazon.com/Best-Sellers-Beauty-Personal-Care-Skin-Care-Products/zgbs/beauty/11060451/",
    "face": "https://www.amazon.com/gp/bestsellers/beauty/11060711/",
    "face-cleansers": "https://www.amazon.com/gp/bestsellers/beauty/11060901/",
    "sunscreen": "https://www.amazon.com/gp/bestsellers/beauty/11062651/",
    "hair-care": "https://www.amazon.com/Best-Sellers-Beauty-Personal-Care-Hair-Care-Products/zgbs/beauty/11057241/",
    "makeup": "https://www.amazon.com/Best-Sellers-Beauty-Personal-Care-Makeup/zgbs/beauty/11058281/",
    "lip-care": "https://www.amazon.com/gp/bestsellers/beauty/3761351/",
    "shampoo-conditioner": "https://www.amazon.com/gp/bestsellers/beauty/17911764011/",
    "hair-masks": "https://www.amazon.com/gp/bestsellers/beauty/10666437011/",
    "hair-oils": "https://www.amazon.com/gp/bestsellers/beauty/10666439011/",
    "scalp": "https://www.amazon.com/gp/bestsellers/beauty/23561814011/",
    "makeup-face": "https://www.amazon.com/gp/bestsellers/beauty/11058691/",
    "makeup-eyes": "https://www.amazon.com/gp/bestsellers/beauty/11058331/",
    "makeup-lips": "https://www.amazon.com/gp/bestsellers/beauty/11059031/",
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

async def scrape(page, url):
    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(2500)
    html = await page.content()
    if "Type the characters you see" in html or "api-services-support@amazon.com" in html:
        return None, "captcha"
    # 榜单页把商品放在 div[id=gridItemRoot];滚动触发懒加载
    for _ in range(6):
        await page.mouse.wheel(0, 1800); await page.wait_for_timeout(600)
    items = await page.evaluate(r"""() => [...document.querySelectorAll('#gridItemRoot')].map(el => {
        const t = s => (el.querySelector(s)?.textContent || '').trim();
        const a = el.querySelector('a.a-link-normal[href*="/dp/"]');
        const href = a ? a.getAttribute('href') : '';
        const asin = (href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || '';
        const img = el.querySelector('img')?.getAttribute('src') || '';
        const title = t('div[class*="p13n-sc-css-line-clamp"]') || (el.querySelector('img')?.getAttribute('alt') || '');
        const brand = ((href.split('/')[1] || '').split('-')[0] || '');
        const rank = t('.zg-bdg-text').replace('#','');
        const price = t('span._cDEzb_p13n-sc-price_3mJ9Z') || t('.p13n-sc-price') || t('span.a-color-price');
        const rating = (el.querySelector('.a-icon-alt')?.textContent || '').split(' ')[0];
        const reviews = t('span.a-size-small');
        return { rank, asin, title, brand, price, rating, reviews, url: href ? 'https://www.amazon.com' + href.split('?')[0] : '', img };
    })""")
    return [i for i in items if i.get("asin")], None

async def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cats", default=",".join(CATS)); ap.add_argument("--pages", type=int, default=2); ap.add_argument("--headed", action="store_true")
    A = ap.parse_args(); today = dt.date.today().isoformat(); out = []
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=not A.headed)
        ctx = await b.new_context(user_agent=UA, locale="en-US", viewport={"width": 1366, "height": 900}, extra_http_headers={"Accept-Language": "en-US,en;q=0.9"})
        page = await ctx.new_page()
        for cat in A.cats.split(","):
            base = CATS[cat]
            for pg in range(1, A.pages + 1):
                url = base if pg == 1 else base + f"?pg={pg}"
                items, err = await scrape(page, url)
                if err: print(cat, pg, "BLOCKED", err); break
                for it in items: it.update({"cat": cat, "date": today, "platform": "amazon-us"})
                out += items; print(cat, pg, len(items)); await page.wait_for_timeout(random.randint(4000, 8000))
        await b.close()
    os.makedirs(os.path.join(ROOT, "data", "market"), exist_ok=True)
    f = os.path.join(ROOT, "data", "market", f"amazon-{today}.json")
    if os.path.exists(f):
        old = json.load(io.open(f, encoding="utf-8")); done = {c["cat"] for c in out}; out = [o for o in old if o["cat"] not in done] + out
    io.open(f, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=0))
    print("saved", len(out), f)
asyncio.run(main())
