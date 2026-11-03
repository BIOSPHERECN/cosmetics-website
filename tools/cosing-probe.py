#!/usr/bin/env python3
"""CosIng 接口探路 —— 用无头浏览器把真实的后端地址挖出来。

由来:CosIng(欧盟官方化妆品成分库,约 3 万条)整站是 Angular SPA,
`/api/*` 全部返回外壳 HTML,把 2.6MB 的主 JS 拉下来也找不到后端地址 ——
它走的是同源代理转发。盲猜路径试了七八个全是 200 text/html,再猜没意义。

创始人 2026-09-10 10:5x:「browsers use browsers act,这方面的浏览器爬虫应用非常多,
你可以多发挥下」。对 —— 本机已装 python playwright + chromium。
让浏览器把页面正常跑一遍,监听它自己发的 XHR,真实端点自己就出来了。

**先探路再抓取,不要一上来就 DOM 扒。**
DOM 扒一页 25 条、3 万条要翻 1200 页,慢且脆(改版即废)。
探到 JSON 端点之后直接分页拉,几分钟的事,而且拿到的是结构化字段。

用法:
    python tools/cosing-probe.py            打开首页,记录 30 秒内的 XHR
    python tools/cosing-probe.py --search glycerin   再跑一次搜索,看搜索走哪个接口
"""
import argparse
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://ec.europa.eu/growth/tools-databases/cosing/"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--search", default="")
    ap.add_argument("--wait", type=int, default=25)
    ap.add_argument("--url", default="")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    seen = []

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        ctx = br.new_context(viewport={"width": 1440, "height": 900},
                             user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                         "AppleWebKit/537.36 (KHTML, like Gecko) "
                                         "Chrome/131.0.0.0 Safari/537.36"))
        page = ctx.new_page()

        def on_req(rq):
            # 只盯后端主机 —— 401 说明缺鉴权头,而头就在这些请求里
            if "api.tech.ec.europa.eu" in rq.url or "search-api" in rq.url:
                seen.append(("REQ", rq.method, rq.url[:220], json.dumps(dict(rq.headers), ensure_ascii=False)[:600]))

        def on_resp(r):
            ct = (r.headers or {}).get("content-type", "")
            if "json" in ct.lower() and ("api.tech" in r.url or "search-api" in r.url):
                body = ""
                try:
                    body = r.text()[:300]
                except Exception:
                    pass
                seen.append((str(r.status), r.request.method, r.url[:220], body))

        page.on("request", on_req)
        page.on("response", on_resp)
        page.goto(a.url or BASE, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_timeout(a.wait * 1000)

        if a.search:
            # 搜索框的选择器随改版会变,所以按角色/占位符多试几种,试不到就跳过
            for sel in ['input[type="search"]', 'input[placeholder*="earch"]',
                        'input[name*="search"]', 'input']:
                try:
                    el = page.locator(sel).first
                    if el.count():
                        el.fill(a.search, timeout=5000)
                        el.press("Enter")
                        page.wait_for_timeout(8000)
                        break
                except Exception:
                    continue

        title = page.title()
        html_len = len(page.content())
        br.close()

    print(f"页面标题:{title} · DOM {html_len:,} 字节")
    print(f"捕获 JSON 响应 {len(seen)} 条:")
    for st, m, u, extra in seen[:40]:
        print(f"  {st:<4} {m:<5} {u}")
        if extra:
            print(f"        {extra[:400]}")
    if not seen:
        print("  (一条 JSON 都没有 —— 说明数据可能是服务端直出或走 SSE/GraphQL,换个抓法)")


if __name__ == "__main__":
    main()
