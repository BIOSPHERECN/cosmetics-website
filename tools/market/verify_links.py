"""核对榜单链接是否真能打开且是商品榜单页(经本机 Chrome 调试口 9333,带登录与出海能力)。
用法:python tools/market/verify_links.py <输入.txt> <输出.txt>
输入每行「市场<Tab>类目<Tab>榜单名<Tab>URL」;输出同格式追加「状态<Tab>标题<Tab>商品数估计」,并另存一份只含通过的行(<输出>.ok.txt)。
判定:HTTP 200 且最终 URL 没被打回首页/404 页、正文里能数到 ≥8 个价格串(货币符号或 ¥/₩/円/Rp/RM/฿/₫/€/£/$)才算「榜单页」。
"""
import io, re, sys, time
from playwright.sync_api import sync_playwright

src, dst = sys.argv[1], sys.argv[2]
rows = [l.rstrip("\n").split("\t") for l in io.open(src, encoding="utf-8") if l.strip()]
PRICE = re.compile(r"(?:[$€£¥₩₫฿]|Rp|RM|円|USD|EUR|GBP)\s?\d[\d,.]*")
out, ok = [], []
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    ctx = b.contexts[0]
    for i, r in enumerate(rows, 1):
        url = r[-1]; status = "ERR"; title = ""; n = 0; final = url
        pg = ctx.new_page()
        try:
            resp = pg.goto(url, timeout=45000, wait_until="domcontentloaded")
            pg.wait_for_timeout(2500)
            status = str(resp.status if resp else "?"); title = (pg.title() or "")[:60].replace("\t", " "); final = pg.url
            txt = pg.inner_text("body")[:200000]
            n = len(PRICE.findall(txt))
        except Exception as e:
            title = ("ERR " + str(e)[:50]).replace("\t", " ")
        finally:
            pg.close()
        passed = status == "200" and n >= 8 and not re.search(r"404|not found|page cannot|页面不存在|见つかりません", title, re.I) and final.rstrip("/") != re.sub(r"^(https?://[^/]+).*", r"\1", url)
        line = "\t".join(r + [status, title, str(n), "通过" if passed else "不通过"])
        out.append(line)
        if passed: ok.append("\t".join(r))
        print(f"{i}/{len(rows)} {status} n={n} {'OK' if passed else '--'} {url}", flush=True)
        time.sleep(1.0)
io.open(dst, "w", encoding="utf-8").write("\n".join(out) + "\n")
io.open(dst + ".ok.txt", "w", encoding="utf-8").write("\n".join(ok) + "\n")
print(f"done: {len(ok)}/{len(rows)} 通过 → {dst}.ok.txt")
