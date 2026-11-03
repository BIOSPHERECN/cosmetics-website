# -*- coding: utf-8 -*-
"""
包材图库 · 中国制造网(made-in-china.com)线 —— 纯 HTTP,无需浏览器。

背景:阿里国际站/1688 对自动化访问设墙(punish/登录),真浏览器通道待创始人配合;
中国制造网类目页服务端渲染、开放可抓 —— 先用它把图库灌起来,「看看谁家的更好」。

组织纪律(创始人:「按工厂名建文件夹和名字,要不然抓太多分不清谁是谁」):
  F:/0cosmetic/包材图库/mic-{工厂名}/{类目}-{序号}-{品名片段}.webp
  每厂 manifest.csv:文件名,平台,工厂,标题,店铺链接,图片链接,类目,抓取日

用法:python tools/pack-scrape-mic.py [--cap 30]
"""
import csv, html as htmlmod, re, sys, time, urllib.request
from datetime import datetime
from pathlib import Path

LIB = Path(r"F:/0cosmetic/包材图库")
LOG = Path(r"F:/0cosmetic/cosmetic-sites/node_modules/.cache/pack-scrape.log")
CAP = int(sys.argv[sys.argv.index("--cap") + 1]) if "--cap" in sys.argv else 30
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36"}

CATS = [
    ("airless-bottle", "Airless_Bottle"),
    ("cream-jar",      "Cosmetic_Jar"),
    ("tube",           "Cosmetic_Tube"),
    ("dropper",        "Dropper_Bottle"),
    ("pump-bottle",    "Lotion_Pump_Bottle"),
    ("lipstick-tube",  "Lipstick_Tube"),
    ("compact-case",   "Compact_Powder_Case"),
    ("paper-box",      "Cosmetic_Paper_Box"),
]

def log(msg):
    line = f"{datetime.now():%m-%d %H:%M}  {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def clean(s, n=46):
    s = htmlmod.unescape(s)          # T&amp;E → T&E,别把转义串带进文件夹名
    s = re.sub(r"[\\/:*?\"<>|&\r\n\t]", " ", s)
    return re.sub(r"\s+", " ", s).strip()[:n].strip() or "unknown"

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read()

def parse(html):
    """图卡(data-original 大图 + alt 品名)与最近的公司锚点(title=公司名)配对。"""
    items = []
    anchors = [(m.start(), m.group(2), m.group(1)) for m in re.finditer(
        r'href="(https://[a-z0-9-]+\.en\.made-in-china\.com)"[^>]*title="([^"]{4,90})"', html)]
    for m in re.finditer(r'data-original="(https://image\.made-in-china\.com/[^"]+\.(?:webp|jpg|png))"[^>]*alt="([^"]{8,120})"', html):
        pos, img, title = m.start(), m.group(1), m.group(2)
        near = min(anchors, key=lambda a: abs(a[0] - pos), default=None)
        if near and abs(near[0] - pos) < 12000:   # 卡片模板肥,4000 窗漏配了大半
            items.append({"img": img, "title": clean(title), "supplier": clean(near[1]), "shop": near[2]})
    # 同一供应商同名图去重
    seen, out = set(), []
    for it in items:
        k = (it["supplier"], it["img"])
        if k not in seen:
            seen.add(k); out.append(it)
    return out

def main():
    LIB.mkdir(parents=True, exist_ok=True)
    total = 0
    for slug, kw in CATS:
        url = f"https://www.made-in-china.com/products-search/hot-china-products/{kw}.html"
        try:
            html = fetch(url).decode("utf-8", "ignore")
        except Exception as e:
            log(f"mic [{slug}] 页面失败:{str(e)[:50]}")
            continue
        items = parse(html)[:CAP]
        got = 0
        for i, it in enumerate(items):
            folder = LIB / f"mic-{it['supplier']}"
            folder.mkdir(parents=True, exist_ok=True)
            ext = it["img"].rsplit(".", 1)[-1]
            fn = f"{slug}-{i+1:02d}-{it['title'][:34]}.{ext}"
            try:
                data = fetch(it["img"])
                if len(data) < 5000:
                    continue
                (folder / fn).write_bytes(data)
                mf = folder / "manifest.csv"
                new = not mf.exists()
                with open(mf, "a", newline="", encoding="utf-8-sig") as f:
                    w = csv.writer(f)
                    if new:
                        w.writerow(["文件名", "平台", "工厂", "标题", "店铺链接", "图片链接", "类目", "抓取日"])
                    w.writerow([fn, "made-in-china", it["supplier"], it["title"], it["shop"], it["img"], slug, f"{datetime.now():%Y-%m-%d}"])
                got += 1
            except Exception:
                pass
            time.sleep(0.35)
        log(f"mic [{slug}] 卡片{len(items)} 存图{got}")
        total += got
        time.sleep(1.2)
    sup = len([d for d in LIB.iterdir() if d.is_dir() and d.name.startswith("mic-")])
    log(f"本轮入库 {total} 张,覆盖 {sup} 家工厂 → {LIB}")

if __name__ == "__main__":
    main()
