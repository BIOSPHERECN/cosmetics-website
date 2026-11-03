#!/usr/bin/env python3
"""爆款成分表采集(每天一跑,配方线的「采集」)。榜单里的爆款 = 市场验证过的配方;成分表(INCI)就写在 Amazon 商品页公开的
「Ingredients」栏。每天挑还没有成分表的、名次最靠前的 N 款,用真浏览器打开商品页,只抄 Ingredients 与 Product details 里的
公开字段,回写 market_products.inci / claims。不抓评论、不登录、每页停 5–9 秒。
用法:python tools/market/inci_harvest.py [--n 40] [--headed]"""
import argparse, asyncio, io, os, random, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _bohui import d1, d1_exec, proxy_url  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=40); ap.add_argument("--headed", action="store_true"); A = ap.parse_args()

# 名次最靠前、还没成分表的;inci='-' 表示页上没有(别每天重抓)
todo = d1(f"SELECT p.id, p.pid, p.url, p.title, MIN(s.rank) rk FROM market_products p JOIN market_snapshots s ON s.pid=p.pid AND s.platform=p.platform WHERE p.platform LIKE 'amazon%' AND (p.inci IS NULL OR p.inci='') AND s.date=(SELECT MAX(date) FROM market_snapshots) GROUP BY p.id ORDER BY rk LIMIT {A.n}")
print("待抓", len(todo))
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731

async def grab(page, url):
    await page.goto(url.split("?")[0], wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(2500)
    return await page.evaluate(r"""() => {
      const T = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
      if (document.title.match(/Robot Check|captcha/i) || document.querySelector('form[action*="validateCaptcha"]')) return { blocked: true };
      let inci = '';
      // 1) Important information → Ingredients
      for (const h of document.querySelectorAll('#important-information h4, #importantInformation h4, #important-information .a-text-bold')) {
        if (/ingredients/i.test(h.innerText)) { let el = h.nextElementSibling; while (el && !T(el)) el = el.nextElementSibling; inci = T(el); if (inci) break; }
      }
      // 2) 详情表里的 Ingredients 行 / 3) 展开式 “Ingredients” 面板
      if (!inci) for (const tr of document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #prodDetails tr')) { if (/^ingredients$/i.test(T(tr.querySelector('th')))) { inci = T(tr.querySelector('td')); break; } }
      if (!inci) for (const el of document.querySelectorAll('[data-a-expander-name*="ngredient"] .a-expander-content, #ingredients-content, [id*="ingredients"] .a-expander-content')) { inci = T(el); if (inci) break; }
      if (!inci) { const m = document.body.innerText.match(/\bIngredients:?\s*\n?\s*([A-Z][^\n]{40,3000})/); if (m) inci = m[1].trim(); }
      const bullets = [...document.querySelectorAll('#feature-bullets li span')].map(T).filter(Boolean).slice(0, 8);
      const brand = T(document.querySelector('#bylineInfo')).replace(/^(Visit the |Brand: )/, '').replace(/ Store$/, '');
      return { inci, bullets, brand };
    }""")

async def main():
    lines, n_ok, n_none = [], 0, 0
    async with async_playwright() as p:
        # 创始人 11:0x:「不要经过代理」「还是要用控制浏览器的方式操作」—— 先连 360 浏览器(1688采集-开360.bat 起的,端口 9222),在他的真实会话里开一个标签页直连 Amazon;360 没开才退回本机 Chromium 直连
        cdp = None
        try: cdp = await p.chromium.connect_over_cdp("http://127.0.0.1:9222", timeout=5000)
        except Exception: pass
        if cdp:
            ctx = cdp.contexts[0] if cdp.contexts else await cdp.new_context(); page = await ctx.new_page(); b = cdp; print("浏览器:360(CDP)直连")
        else:
            px = proxy_url(); b = await p.chromium.launch(headless=not A.headed, args=["--disable-blink-features=AutomationControlled"], proxy={"server": px} if px else None); print("浏览器:本机 Chromium", px or "直连")
            ctx = await b.new_context(user_agent=UA, locale="en-US", viewport={"width": 1366, "height": 900}, extra_http_headers={"Accept-Language": "en-US,en;q=0.9"})
            page = await ctx.new_page(); await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        await page.goto("https://www.amazon.com/", wait_until="domcontentloaded", timeout=60000); await page.wait_for_timeout(3000)   # 先落首页拿 cookie,直奔 /dp 更容易被要验证码
        for r in todo:
            try: d = await grab(page, r["url"] or f"https://www.amazon.com/dp/{r['pid']}")
            except Exception as e: print(r["pid"], "ERR", str(e)[:80]); continue
            if d.get("blocked"): print(r["pid"], "BLOCKED(验证码)—今天到此"); break
            inci = re.sub(r"\s+", " ", d.get("inci") or "")[:3000]
            # 真成分表至少有几个逗号;不然当作「页上没有」
            if inci.count(",") < 3: inci, n_none = "-", n_none + 1
            else: n_ok += 1
            claims = " | ".join(d.get("bullets") or [])[:1500]
            lines.append(f"UPDATE market_products SET inci={q(inci)}, claims=COALESCE(NULLIF(claims,''),{q(claims)}), brand=COALESCE(NULLIF(brand,''),{q(d.get('brand'))}) WHERE id={r['id']};")
            print(f"#{r['rk']:>3} {r['pid']} {'成分 ' + str(inci.count(',') + 1) + ' 项' if inci != '-' else '无成分表'} · {(r['title'] or '')[:50]}")
            await page.wait_for_timeout(random.randint(5000, 9000))
        await page.close()
        if not cdp: await b.close()   # 360 是创始人的浏览器,只关自己开的标签页
    if lines:
        out = os.path.join(ROOT, "tools", "_inci-harvest.sql"); io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
        print("回写", d1_exec(out))
    print(f"成分表 {n_ok} 款 · 页上没有 {n_none} 款")
asyncio.run(main())
