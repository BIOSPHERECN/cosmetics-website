#!/usr/bin/env python3
"""新潮塑胶目录图 → R2 + 包材库记录。

配套 stnewwave-scrape.py:那一步抓了 3,958 款的目录(型号、容量、类别、图链接),
这一步把图取回来、洗干净、上云、编码入库。

编码规则:ST-{型号}。型号是他们的料号(A3650、B2529),我们前面加自己的厂前缀 ——
对外只出现 ST-A3650,不出现厂名;对内 supplier_ref 记着是谁。
一张图对应多个型号时(B2529-35ML/B2530-50ML/B2531-150ML 共用一张合影),
按型号各建一条记录,共用同一张图,并在 sku_raw 里记下它原本是一组的。

三段式,顺序不能反(今晚三次翻车换来的):
  --probe   抽样下载 + 联系表,人先看。
  --fetch   全量下载到本地缓存,不上传(可反复调参不重复打人家服务器)。
  --commit  清洗 + 上传 R2 + 产出 SQL。
"""
import io
import os
import re
import sys
import json
import math
import time
import random
import hashlib
import argparse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".stnw-img")
CATALOG = os.path.join(ROOT, "tools", "stnewwave-catalog.json")
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
      "Referer": "https://www.gdstnewwave.com/product"}

PREFIX = "ST"
SUPPLIER = "新潮塑胶"

# 中文类别 → (形态, 用途)。两条轴分开存 ——
# 「膏霜护肤类」说的是装什么,「真空瓶」说的是长什么样,硬塞进一个字段会互相打架。
CAT_MAP = {
    "膏霜护肤类": ("jar", "护肤"), "洗发沐浴类": ("pump-bottle", "洗护"),
    "婴童类": ("press-bottle", "婴童"), "彩妆类": ("compact", "彩妆"),
    "护发美发类": ("pump-bottle", "洗护"), "洗涤瓶": ("press-bottle", "家清"),
    "赠品类": ("travel-kit", "礼赠"), "其他": ("press-bottle", ""),
    "走珠瓶": ("roll-on", ""), "PET瓶": ("press-bottle", ""), "PETG瓶": ("press-bottle", ""),
    "真空瓶": ("airless-bottle", ""), "玻璃瓶": ("glass-bottle", ""),
}
MAT_BY_CAT = {"PET瓶": "PET", "PETG瓶": "PETG", "玻璃瓶": "玻璃"}


def fetch(url: str) -> bytes:
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()[:20] + ".bin"
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and os.path.getsize(path) > 900:
        return open(path, "rb").read()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        body = r.read()
    open(path, "wb").write(body)
    time.sleep(0.15 + random.random() * 0.15)      # 八路并发,单路短延时,合起来相当于几个人同时浏览
    return body


def screen(im: Image.Image) -> str:
    """返回否决原因,空串表示留下。这个源本来就干净,所以只挡明显不能用的。"""
    w, h = im.size
    if min(w, h) < 260:
        return "太小"
    ar = w / h
    if ar < 0.55 or ar > 1.9:
        return f"长宽比 {ar:.2f}"
    a = np.asarray(im.convert("RGB"))
    # 门槛从 20 降到 8:这个源是白底拍白瓶,色阶天生就少,
    # 抽样里被 20 判掉的那几张(B2092、D118、A368…)全是干净可用的白瓶。
    # 反过来说,真正的纯色块会低于 8。
    if len(np.unique((a[::5, ::5] // 32).reshape(-1, 3), axis=0)) < 8:
        return "色阶太少"
    return ""


def square(im: Image.Image, size: int) -> Image.Image:
    """补白成方图,不裁。裁会把瓶口或底座切掉,而采购看的正是整支的比例。"""
    im = im.convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), (255, 255, 255))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def sheet(items, out_path, cell=230, cols=10):
    rows = math.ceil(len(items) / cols)
    s = Image.new("RGB", (cols * cell, rows * (cell + 24)), "white")
    d = ImageDraw.Draw(s)
    for i, (im, lines) in enumerate(items):
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        s.paste(square(im, cell - 6), (x + 3, y + 3))
        d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(226, 226, 226))
        for k, ln in enumerate(lines[:2]):
            d.text((x + 4, y + cell + 2 + k * 10), ln[:36], fill=(70, 70, 70))
    s.save(out_path, quality=85)
    return s.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--n", type=int, default=60, help="probe 抽样张数")
    ap.add_argument("--size", type=int, default=1000)
    ap.add_argument("--limit", type=int, default=0, help="fetch/commit 只处理前 N 条(0=全部)")
    a = ap.parse_args()
    if not (a.probe or a.fetch or a.commit):
        a.probe = True

    rows = json.load(open(CATALOG, encoding="utf-8"))
    if a.limit:
        rows = rows[:a.limit]

    if a.probe:
        pick = random.Random(11).sample(rows, min(a.n, len(rows)))
        items, drops, bytes_total = [], [], 0
        for r in pick:
            try:
                b = fetch(r["img"])
            except Exception as e:
                drops.append((r["model_raw"], str(e)[:30])); continue
            bytes_total += len(b)
            im = Image.open(io.BytesIO(b))
            why = screen(im)
            if why:
                drops.append((r["model_raw"], why)); continue
            items.append((im, [f"{PREFIX}-{r['variants'][0]['model']}", f"{r['cat_zh']} · {r['model_raw'][:22]}"]))
        avg = bytes_total / max(1, len(pick))
        print(f"抽样 {len(pick)} 张:可用 {len(items)},判掉 {len(drops)}")
        for m, w in drops[:8]:
            print(f"  ✗ {m[:26]:<28} {w}")
        print(f"平均原图 {avg/1024:.0f} KB → 估算全量下载 {avg*len(rows)/1024/1024/1024:.2f} GB")
        out = os.path.join(ROOT, "tools", "stnewwave-probe.jpg")
        if items:
            print(f"联系表:{out}  {sheet(items, out)}")
        return

    if a.fetch:
        """并发下载。

        串行实测 27 张/分钟 —— 每张要等对方 2.2 秒,时间全花在等网络上,不是在算。
        实测 8 路并发是 211 张/分钟,而且单张耗时没有变差(2.20s → 1.97s),
        说明对方完全接得住。3,958 张从 2.5 小时降到 20 分钟以内。
        单路仍保留短延时,合起来的压力和几个人同时浏览差不多。
        """
        t0 = time.time()
        st = {"ok": 0, "bad": 0, "size": 0}

        def one(r):
            try:
                st["size"] += len(fetch(r["img"])); st["ok"] += 1
            except Exception:
                st["bad"] += 1
            k = st["ok"] + st["bad"]
            if k % 300 == 0:
                el = time.time() - t0
                print(f"  {k}/{len(rows)}  成功 {st['ok']} 失败 {st['bad']}  "
                      f"{st['size']/1024/1024:.0f} MB  {el/60:.1f} 分钟  "
                      f"预计还需 {(el / k * (len(rows) - k)) / 60:.0f} 分钟", flush=True)

        with ThreadPoolExecutor(max_workers=int(os.environ.get("STNW_WORKERS", "8"))) as ex:
            list(ex.map(one, rows))
        print(f"\n下载完成:{st['ok']} 张 / 失败 {st['bad']},共 {st['size']/1024/1024:.0f} MB,"
              f"用时 {(time.time()-t0)/60:.1f} 分钟")
        return

    print("[commit] 见 stnewwave-commit.py")


if __name__ == "__main__":
    main()
