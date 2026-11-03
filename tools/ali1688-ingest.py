#!/usr/bin/env python3
"""1688 商品 → 包材库条目。

创始人 2026-09-06:「你不可以用浏览器控制插件,用爬虫技术去抓取吗?」——可以,而且比插件强。
Fatkun 与店小秘只解决「把图搬下来」;我们真正缺的是**规格**,而规格就写在商品属性表里。
实测一个页面(顺旭 559766155506)一次拿到:材质 pet、工艺 吹瓶、表面处理 喷色、产地 广州,
以及十个 SKU 的口径与容量(68牙-200ml … 47牙-30ml)。这是从 PDF 图册里抠一整天都抠不出来的粒度。

分工:浏览器只负责**读**(用创始人自己的登录态,不点按钮、不提交任何东西);
图片从 CDN 直下,不带登录态也能取(实测 HTTP 200),所以整个下载过程不碰他的账号。

两种模式,顺序不能反 —— 这是今晚翻车换来的教训:
  --probe   只下载 + 拼联系表,不清洗、不上传、不入库。先看图。
  --commit  确认之后才清洗、上传 R2、生成 SQL。

为什么必须先 probe:上一批包材图我凭规则「自动去水印」,连试两版都失手,
最后 819 页里带着别家 logo 和公司全名就那么公开了。凡是「机器判断图好不好」的环节,
一律先出联系表给人看,不看不动手。

呈现纪律(与包材库一致):
  · 只收商品主图,详情长图一概丢弃 —— 长图是别家的排版与文案。
  · 长宽比偏离方图太多的丢弃(那基本就是长图)。
  · 统一补白成方图,尺寸对齐,货架上才不会参差。
  · 卡片与文件名只出现我们自己的编码。
"""
import io
import os
import re
import sys
import json
import math
import time
import hashlib
import argparse
import urllib.request

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".ali1688-cache")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# 供应商中文名 → 编码前缀。新供应商在这里登记,不自动生成 ——
# 前缀是要长期印在编码里的东西,乱生成会出现两家撞前缀。
PREFIX = {
    "顺旭": "SX", "广州市顺旭塑料科技有限公司": "SX",
}


def fetch(url: str) -> bytes:
    """下过的不再下。1688 的图 URL 是稳定的,缓存能让反复调参不重复打人家服务器。"""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()[:16] + ".bin"
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return open(path, "rb").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://detail.1688.com/"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    open(path, "wb").write(body)
    time.sleep(0.25)          # 不急,别把人家服务器当自家的
    return body


def is_product_shot(im: Image.Image) -> tuple[bool, str]:
    """留下商品主图,丢掉详情长图与小图标。判据只用几何与色阶,不猜内容。"""
    w, h = im.size
    if min(w, h) < 300:
        return False, "太小"
    ar = w / h
    if ar < 0.6 or ar > 1.7:
        return False, f"长宽比 {ar:.2f}(多半是详情长图)"
    a = np.asarray(im.convert("RGB"))
    if len(np.unique((a // 32).reshape(-1, 3), axis=0)) < 40:
        return False, "色阶太少(多半是纯色块或文字图)"
    return True, ""


def square_pad(im: Image.Image, size: int, bg=(255, 255, 255)) -> Image.Image:
    """补白成方图。不裁 —— 裁瓶子会把瓶口或底座切掉,采购看的就是整支的比例。"""
    im = im.convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), bg)
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def contact_sheet(items, out_path, cell=300, cols=6):
    from PIL import ImageDraw
    rows = math.ceil(len(items) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 24)), "white")
    d = ImageDraw.Draw(sheet)
    for i, (im, label) in enumerate(items):
        th = square_pad(im, cell - 8)
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        sheet.paste(th, (x + 4, y + 4))
        d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(225, 225, 225))
        d.text((x + 6, y + cell + 5), label[:44], fill=(60, 60, 60))
    sheet.save(out_path, quality=88)
    return sheet.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("offers", help="提取器产出的 JSON(单个对象或数组)")
    ap.add_argument("--probe", action="store_true", help="只下载 + 拼联系表,不上传不入库")
    ap.add_argument("--commit", action="store_true", help="清洗 + 上传 R2 + 生成 SQL")
    ap.add_argument("--size", type=int, default=1000)
    a = ap.parse_args()
    if not (a.probe or a.commit):
        a.probe = True

    data = json.load(open(a.offers, encoding="utf-8"))
    offers = data if isinstance(data, list) else [data]

    for off in offers:
        title = off.get("title", "")
        brand = off.get("brand") or off.get("attrs", {}).get("品牌", "")
        pre = PREFIX.get(brand) or PREFIX.get(off.get("supplier", "")) or "XX"
        oid = str(off.get("offerId", ""))
        print(f"\n[{brand or '未知供应商'}·{pre}] {title[:44]}  offer={oid}")
        print(f"  材质={off.get('material') or off.get('attrs',{}).get('材质','')}  "
              f"工艺={off.get('process') or off.get('attrs',{}).get('工艺','')}  "
              f"SKU={len(off.get('skus', []))} 个  图={len(off.get('images', []))} 张")

        kept, dropped = [], []
        for url in off.get("images", []):
            try:
                im = Image.open(io.BytesIO(fetch(url)))
            except Exception as e:
                dropped.append((url, f"下载失败 {str(e)[:30]}")); continue
            ok, why = is_product_shot(im)
            name = url.rsplit("/", 1)[-1][:30]
            (kept if ok else dropped).append((im, name) if ok else (name, why))

        print(f"  留下 {len(kept)} 张,丢掉 {len(dropped)} 张")
        for n, why in dropped[:6]:
            print(f"    ✗ {str(n)[:38]:<40} {why}")

        if a.probe:
            out = os.path.join(ROOT, "tools", f"ali1688-probe-{pre}-{oid[-6:]}.jpg")
            if kept:
                sz = contact_sheet(kept, out, cell=a.size // 3)
                print(f"  联系表:{out}  {sz[0]}×{sz[1]}")
            else:
                print("  没有可用图,不出联系表")
            continue

        # --commit 分支在创始人看过联系表、确认这批图能公开之后再启用
        print("  [commit] 尚未启用 —— 先看 probe 的联系表,确认后再开")


if __name__ == "__main__":
    main()
