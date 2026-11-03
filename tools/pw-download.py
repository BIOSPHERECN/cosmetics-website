#!/usr/bin/env python3
"""用浏览器的网络栈下载文件 —— curl 对 gov 站点一律 000 时走这条。

pw-fetch.py 存的是渲染后的 HTML,对 PDF 不适用(存下来是浏览器的 PDF 查看器外壳)。
这里用 playwright 的 request 上下文直接 GET,拿到的是原始字节:
浙江药监的技术规范 PDF、NPRA 的东盟附录 PDF、ANVISA 的 RDC PDF 都是这一类。

用法:
    python tools/pw-download.py <url> <输出文件> [--referer URL]
"""
import argparse
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("out")
    ap.add_argument("--referer", default="")
    ap.add_argument("--direct", action="store_true", help="绕开系统代理直连(国内 gov 站)")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        # Windows 上 Chromium 读的是系统代理,清环境变量没用;--direct 用 --no-proxy-server 硬关。
        br = pw.chromium.launch(headless=True, args=(["--no-proxy-server"] if a.direct else []))
        ctx = br.new_context(user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                         "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"))
        # 先用真页面访问一次站点根,让 WAF 发的 cookie 落到上下文里,再拿 request 取文件
        page = ctx.new_page()
        try:
            root = a.url.split("/", 3)
            page.goto(root[0] + "//" + root[2] + "/", wait_until="commit", timeout=60_000)
            page.wait_for_timeout(2500)
        except Exception as e:
            print(f"预热失败({str(e)[:60]}),直接取")
        headers = {"Referer": a.referer} if a.referer else {}
        r = ctx.request.get(a.url, headers=headers, timeout=180_000)
        body = r.body()
        with open(a.out, "wb") as fh:
            fh.write(body)
        print(f"{r.status} {r.headers.get('content-type', '')} {len(body):,} 字节 -> {a.out}")
        br.close()


if __name__ == "__main__":
    main()
