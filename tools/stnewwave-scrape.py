#!/usr/bin/env python3
"""新潮塑胶(gdstnewwave.com)产品目录 → 帛卉包材库。

创始人 2026-09-07:「这个相对来说干净很多」「可以批量抓取,是我的朋友工厂」。

为什么这个源比 1688 好一个量级:
  · 是工厂自己的目录站,服务端渲染,132 页 × 30 = 约 3,960 款,一次抓全;
  · 图是工厂自己拍的白底方图,没有促销角标、没有店铺水印、没有模特;
  · 每张卡片自带**型号-容量**(B2550-250ML)和**中英双语类别**,
    我们要的编码骨架和分类它已经给好了 —— 不用从标题里猜;
  · 没有价格与起订量,不会诱导我们把上游报价搬到对外页面上。

对照一下 1688 那条:一个商品页要单独打开、属性表要一个个键去凑、
主图里混着「源头工厂 1000个起印刷」的红框和厂标,还得逐张判。
两条都留着 —— 1688 那条用来补这家没有的款式,这条是主力。

结构(实测,规整到不需要 DOM 解析器):
  <li><a class="thumb" href="/product/{uuid}" style="background-image:url(&quot;{img}&quot;);"></a>
      <p class="category showZHCN">护发美发类</p>
      <p class="category showENUS">Hair care</p>
      <div class="product_title"><div class="product_title_wrap">
        <a href="/product/{uuid}">B2550-250ML</a></div></div></li>

两段式,顺序不能反(这是今晚三次翻车换来的):
  --list    只抓目录、出统计与分类分布,不下一张图。先看盘子有多大、分类对不对。
  --probe   下采样图片、拼联系表。人看过再说。
  --commit  上传 R2 + 生成 SQL。
"""
import io
import os
import re
import sys
import json
import time
import math
import random
import argparse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://www.gdstnewwave.com"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")}
CACHE = os.path.join(ROOT, "tools", ".stnw-cache")

# 他们的中文类别 → 我们的 PACK_TYPE / 大类。
# 有几个是「用途类」而不是「形态类」(膏霜护肤类、洗发沐浴类、婴童类),
# 这类不硬塞成某个瓶型 —— 留给型号前缀与图片去判,先按用途存着。
CAT_MAP = {
    "膏霜护肤类": ("jar", "skincare-use"), "洗发沐浴类": ("pump-bottle", "wash-use"),
    "婴童类": ("press-bottle", "baby-use"), "彩妆类": ("compact", "makeup-use"),
    "护发美发类": ("pump-bottle", "hair-use"), "洗涤瓶": ("press-bottle", "detergent-use"),
    "赠品类": ("travel-kit", "gift-use"), "其他": ("press-bottle", "other"),
    "走珠瓶": ("roll-on", ""), "PET瓶": ("press-bottle", ""), "PETG瓶": ("press-bottle", ""),
    "真空瓶": ("airless-bottle", ""), "玻璃瓶": ("glass-bottle", ""),
}
MAT_BY_CAT = {"PET瓶": "PET", "PETG瓶": "PETG", "玻璃瓶": "玻璃"}

CARD = re.compile(
    r'<li><a class="thumb" href="(/product/[0-9a-f-]+)"[^>]*background-image:url\(&quot;([^&]+)&quot;\)'
    r'.*?<p class="category showZHCN">([^<]*)</p>'
    r'.*?<p class="category showENUS">([^<]*)</p>'
    r'.*?product_title_wrap"><a[^>]*>([^<]*)</a>', re.S)


def get(url: str, ttl_days=7) -> str:
    os.makedirs(CACHE, exist_ok=True)
    key = re.sub(r"[^A-Za-z0-9]", "_", url)[-100:] + ".html"
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and (time.time() - os.path.getmtime(path)) < ttl_days * 86400:
        return open(path, encoding="utf-8", errors="replace").read()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    open(path, "w", encoding="utf-8").write(body)
    time.sleep(0.6 + random.random() * 0.5)     # 朋友的站也不能当自家的刷
    return body


def parse_model(s: str):
    """「B2550-250ML」→ [{model:B2550, capacity:250ml}]
       「A2987-200ML/A2804-250ML」→ 两条。型号是他们的料号,我们自己的编码另发。"""
    out = []
    for part in re.split(r"[/、,,]", s or ""):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^([A-Za-z]{1,3}\d{2,5}[A-Za-z]?)\s*[-–]\s*([\d.]+)\s*(ML|ml|G|g)\s*$", part)
        if m:
            out.append({"model": m.group(1).upper(), "capacity": f"{m.group(2)}{m.group(3).lower()}"})
        else:
            out.append({"model": part.upper()[:24], "capacity": ""})
    return out


def scrape_list(pages: int):
    rows, seen = [], set()
    for p in range(1, pages + 1):
        url = f"{BASE}/product" + (f"?page={p}" if p > 1 else "")
        try:
            html = get(url)
        except Exception as e:
            print(f"  ✗ 第 {p} 页:{str(e)[:50]}")
            continue
        hits = CARD.findall(html)
        for href, img, czh, cen, model in hits:
            uid = href.rsplit("/", 1)[-1]
            if uid in seen:
                continue
            seen.add(uid)
            rows.append({"uid": uid, "url": BASE + href, "img": BASE + img,
                         "cat_zh": czh.strip(), "cat_en": cen.strip(),
                         "model_raw": model.strip(), "variants": parse_model(model)})
        if p % 20 == 0 or p == pages:
            print(f"    …第 {p}/{pages} 页,累计 {len(rows)} 款", flush=True)
        if not hits:
            print(f"    第 {p} 页没有卡片,提前停")
            break
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=132)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    if not (a.list or a.probe or a.commit):
        a.list = True

    t0 = time.time()
    rows = scrape_list(a.pages)
    out = os.path.join(ROOT, "tools", "stnewwave-catalog.json")
    json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    cats, caps, models = {}, {}, set()
    for r in rows:
        cats[r["cat_zh"]] = cats.get(r["cat_zh"], 0) + 1
        for v in r["variants"]:
            models.add(v["model"])
            if v["capacity"]:
                caps[v["capacity"]] = caps.get(v["capacity"], 0) + 1
    print(f"\n共 {len(rows)} 款,{len(models)} 个型号,用时 {int(time.time() - t0)} 秒")
    print(f"目录:{out}\n")
    print("类别分布:")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        typ, use = CAT_MAP.get(k, ("?", ""))
        print(f"  {k:<10} {v:>5} 款   → {typ}{'  用途:' + use if use else ''}")
    print("\n容量分布(前 18):")
    print("  " + "  ".join(f"{k}({v})" for k, v in sorted(caps.items(), key=lambda x: -x[1])[:18]))

    if a.list:
        return
    print("\n[probe/commit] 先看 --list 的分布,确认分类映射对了再往下走")


if __name__ == "__main__":
    main()
