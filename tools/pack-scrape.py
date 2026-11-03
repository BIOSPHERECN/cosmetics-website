# -*- coding: utf-8 -*-
"""
包材图库采集器(创始人 2026-08-31:「派个小弟去国际站、1688抓包材图片」
「要按照工厂名字建文件夹和名字,要不然抓太多之后就无法分辨谁是谁了」)。

组织纪律(防「分不清谁是谁」):
  F:/0cosmetic/包材图库/{平台}-{工厂名}/{类目}-{序号}-{标题片段}.jpg
  每个工厂文件夹一份 manifest.csv:文件名,平台,工厂,标题,商品链接,图片链接,类目,抓取日
  —— 图再多,看文件夹就知道是哪家厂,翻 manifest 就能回到原商品页。

抓取纪律:
  - 逐页间隔 1.5s,单类目单平台上限 24 条 —— 礼貌抓取;
  - 1688 常有登录/滑块墙:检测到就如实记日志跳过,**绝不绕验证**;
  - 图片仅存本地作选品参考,不直接上官网(供应商图版权在人家手里)。

用法:python tools/pack-scrape.py                # 全类目
     python tools/pack-scrape.py --pilot        # 试跑(每平台 1 类目)
"""
import asyncio, csv, re, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime
from pathlib import Path

LIB = Path(r"F:/0cosmetic/包材图库")
LOG = Path(r"F:/0cosmetic/cosmetic-sites/node_modules/.cache/pack-scrape.log")
PORT = 9341
PILOT = "--pilot" in sys.argv
LOGIN = "--login" in sys.argv          # 弹可见窗口给创始人登录 1688/阿里,登录态存进常驻档案
# 常驻档案:创始人登录一次,以后每轮复用(创始人:「登录可以我」)
PROFILE = LIB / ".chrome-profile"

# 类目关键词:阿里国际站(英文)与 1688(中文)一一对应
CATS = [
    ("airless-bottle",  "airless pump bottle cosmetic", "真空瓶 化妆品"),
    ("cream-jar",       "cosmetic cream jar",           "膏霜瓶"),
    ("tube",            "cosmetic squeeze tube",        "化妆品软管"),
    ("dropper",         "serum dropper bottle",         "精华 滴管瓶"),
    ("pump-bottle",     "lotion pump bottle",           "乳液泵瓶"),
    ("lipstick-tube",   "empty lipstick tube",          "口红管"),
    ("compact-case",    "compact powder case",          "气垫盒 粉盒"),
    ("paper-box",       "cosmetic paper box packaging", "化妆品纸盒"),
]
if PILOT:
    CATS = CATS[:1]

def log(msg):
    line = f"{datetime.now():%m-%d %H:%M}  {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def clean_name(s, maxlen=40):
    s = re.sub(r"[\\/:*?\"<>|\r\n\t]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:maxlen].strip() or "unknown"

def save_img(url, path, referer):
    if url.startswith("//"):
        url = "https:" + url
    url = re.sub(r"_\d+x\d+\.(jpg|png|webp).*$", "", url)  # 阿里缩略图后缀去掉拿原图
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
        "Referer": referer})
    data = urllib.request.urlopen(req, timeout=25).read()
    if len(data) < 6000:      # 太小的是占位图,不要
        return False
    path.write_bytes(data)
    return True

def record(folder, row):
    mf = folder / "manifest.csv"
    new = not mf.exists()
    with open(mf, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["文件名", "平台", "工厂", "标题", "商品链接", "图片链接", "类目", "抓取日"])
        w.writerow(row)

def parse_alibaba(html):
    """搜索页卡片:product-detail 链接窗口内找 图 + 供应商名。结构常变,窗口式正则最耐造。"""
    items, seen = [], set()
    for m in re.finditer(r'href="(//www\.alibaba\.com/product-detail/[^"]+)"', html):
        url = "https:" + m.group(1).split("?")[0]
        if url in seen:
            continue
        seen.add(url)
        win = html[max(0, m.start() - 3000): m.start() + 3000]
        img = re.search(r'(?:src|data-src)="((?://s\.alicdn\.com|https://s\.alicdn\.com)[^"]+\.(?:jpg|png|webp)[^"]*)"', win)
        sup = re.search(r'(?:supplier|company)[^>]*>([^<]{4,60})<', win, re.I) \
           or re.search(r'title="([^"]{6,60}(?:Co\.|Ltd|Factory|Technology|Packaging)[^"]{0,30})"', win)
        title = re.search(r'product-detail/([A-Za-z0-9-]{10,90})', url)
        if img:
            items.append({
                "url": url,
                "img": img.group(1),
                "supplier": clean_name(sup.group(1)) if sup else "未识别工厂",
                "title": clean_name((title.group(1) if title else "item").replace("-", " "), 50),
            })
    return items

def parse_1688(html):
    if re.search(r"login\.1688\.com|验证码|滑动验证|captcha|亲,请登录", html):
        return None  # 登录/验证墙:如实上报,不硬闯
    items, seen = [], set()
    for m in re.finditer(r'href="(https://detail\.1688\.com/offer/\d+\.html)[^"]*"', html):
        url = m.group(1)
        if url in seen:
            continue
        seen.add(url)
        win = html[max(0, m.start() - 3000): m.start() + 3000]
        img = re.search(r'(?:src|data-src)="((?:https?:)?//cbu01\.alicdn\.com/img/[^"]+\.(?:jpg|png)[^"]*)"', win)
        sup = re.search(r'(?:companyName|company-name|memberName)[^>]*>([^<]{4,50})<', win) \
           or re.search(r'title="([^"]{4,50}(?:厂|公司|包装|包材)[^"]{0,20})"', win)
        if img:
            items.append({"url": url, "img": img.group(1),
                          "supplier": clean_name(sup.group(1)) if sup else "未识别工厂",
                          "title": "item"})
    return items

async def crawl():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    bc = BrowserConfig(cdp_url=f"http://127.0.0.1:{PORT}", verbose=False)
    run = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=50000,
                           delay_before_return_html=3.0, verbose=False)
    got_total = 0
    async with AsyncWebCrawler(config=bc) as c:
        for slug, kw_en, kw_cn in CATS:
            # ── 阿里国际站 ──
            u = "https://www.alibaba.com/trade/search?SearchText=" + urllib.request.quote(kw_en)
            try:
                r = await c.arun(u, config=run)
                items = parse_alibaba(r.html or "")[:24]
                got = 0
                for i, it in enumerate(items):
                    folder = LIB / f"alibaba-{it['supplier']}"
                    folder.mkdir(parents=True, exist_ok=True)
                    fn = f"{slug}-{i+1:02d}-{it['title'][:30]}.jpg"
                    try:
                        if save_img(it["img"], folder / fn, u):
                            record(folder, [fn, "alibaba", it["supplier"], it["title"], it["url"], it["img"], slug, f"{datetime.now():%Y-%m-%d}"])
                            got += 1
                    except Exception:
                        pass
                    time.sleep(0.4)
                log(f"alibaba [{slug}] 卡片{len(items)} 存图{got}")
                got_total += got
            except Exception as e:
                log(f"alibaba [{slug}] 失败:{str(e)[:60]}")
            time.sleep(1.5)

            # ── 1688 ──
            u2 = "https://s.1688.com/selloffer/offer_search.htm?keywords=" + urllib.request.quote(kw_cn)
            try:
                r2 = await c.arun(u2, config=run)
                items2 = parse_1688(r2.html or "")
                if items2 is None:
                    log(f"1688 [{slug}] 登录/验证墙,跳过(不绕)")
                else:
                    got2 = 0
                    for i, it in enumerate(items2[:24]):
                        folder = LIB / f"1688-{it['supplier']}"
                        folder.mkdir(parents=True, exist_ok=True)
                        fn = f"{slug}-{i+1:02d}.jpg"
                        try:
                            if save_img(it["img"], folder / fn, u2):
                                record(folder, [fn, "1688", it["supplier"], it["title"], it["url"], it["img"], slug, f"{datetime.now():%Y-%m-%d}"])
                                got2 += 1
                        except Exception:
                            pass
                        time.sleep(0.4)
                    log(f"1688 [{slug}] 卡片{len(items2)} 存图{got2}")
                    got_total += got2
            except Exception as e:
                log(f"1688 [{slug}] 失败:{str(e)[:60]}")
            time.sleep(1.5)
    return got_total

def main():
    LIB.mkdir(parents=True, exist_ok=True)
    PROFILE.mkdir(parents=True, exist_ok=True)
    # 创始人纪律:1688 不走代理 —— Chrome 一律直连(--no-proxy-server 压掉系统代理)
    base_args = [r"D:/ie/Chrome/App/chrome.exe",
                 f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
                 "--no-proxy-server", "--no-first-run", "--no-default-browser-check"]
    if LOGIN:
        # 可见窗口:创始人自己登录(滑块也由本人完成),关窗即存档
        subprocess.Popen(base_args + ["https://login.1688.com/"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log("登录窗已弹出:请在窗口里登录 1688(及需要时的 alibaba.com),登录完成后直接关窗即可。")
        return
    # 抓取也用可见窗(不加 --headless):无头指纹会被阿里识别,
    # 真窗口 + 创始人登录态 = 正常访问;窗口可最小化,跑完自动关。
    chrome = subprocess.Popen(base_args + ["--window-size=1400,900", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    try:
        n = asyncio.run(crawl())
        log(f"本轮入库 {n} 张 → {LIB}")
    finally:
        chrome.kill()

if __name__ == "__main__":
    main()
