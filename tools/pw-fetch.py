#!/usr/bin/env python3
"""用无头浏览器取页面 —— curl 拿不到的官方站点走这条。

由来:加拿大 Health Canada 与美国 FDA 的清单页,本机 curl 一律 `000`(超时/被挡),
而 playwright 起真实 Chromium 走一遍就正常。创始人 2026-09-10:
「browsers use browsers act,这方面的浏览器爬虫应用非常多,你可以多发挥下」。

只做一件事:把渲染完的 HTML 存下来,解析交给各自的脚本。
分开是有道理的 —— 官方站改版时,要改的是解析,不该连取页面的部分一起重写。

用法:
    python tools/pw-fetch.py <url> <输出文件> [--wait 8] [--sel "table"]
"""
import argparse
import io
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("out")
    ap.add_argument("--wait", type=int, default=8)
    ap.add_argument("--sel", default="")
    ap.add_argument("--direct", action="store_true", help="绕开系统代理直连(国内 gov 站)")
    ap.add_argument("--headed", action="store_true", help="开真窗口(NMPA 这类对无头浏览器回空页的站)")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        # Windows 上 Chromium 读的是系统代理,清环境变量没用;--direct 用 --no-proxy-server 硬关。
        br = pw.chromium.launch(headless=not a.headed, args=(["--no-proxy-server"] if a.direct else []))
        ctx = br.new_context(
            viewport={"width": 1440, "height": 1000},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"))
        page = ctx.new_page()
        # fda.gov 这类挂了 Akamai 的站,goto 会在 domcontentloaded 前卡很久;
        # 用 commit(拿到响应就算)再自己等,页面内容拿到手先落盘,关浏览器出错也不影响结果。
        try:
            page.goto(a.url, wait_until="commit", timeout=90_000)
        except Exception as e:
            print(f"goto 未完成({str(e)[:60]}),继续取已渲染内容")
        if a.sel:
            try:
                page.wait_for_selector(a.sel, timeout=30_000)
            except Exception:
                pass
        page.wait_for_timeout(a.wait * 1000)
        html = page.content()
        title = page.title()
        io.open(a.out, "w", encoding="utf-8", newline="\n").write(html)
        try:
            br.close()
        except Exception:
            pass
    print(f"{title} · {len(html):,} 字节 -> {a.out}")


if __name__ == "__main__":
    main()
