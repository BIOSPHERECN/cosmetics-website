#!/usr/bin/env python3
"""新潮塑胶详情页 → 规格表图。

发现的过程值得记一笔:列表页每张卡片只给「型号-容量」,详情页正文也只有这两样,
一度以为尺寸拿不到。但详情页有**两张图** —— 第一张是产品照,
第二张是规格表,内容长这样:

    ITEM NO. 货号     A3650
    SIZE(mm) 尺寸     长(L)×宽(W)×高(H)  91×81×65   裸瓶高:63(不含盖)
    CALIBER  口径     68mm(配 A1782 内塞)
    CAPACITY 参考容量  250ml(瓶身侧面带有指槽)
    注:表中全部示意参数,均为手工测量,仅供参考。

这正是采购真正要的那一层 —— 一个笼统的「250ml 膏霜罐」没法下单,
尺寸、口径、配套内塞才对得上模具与泵头。同行的包材详情页把盖与瓶分开列参数,
我们有了这张表就能做到同样的粒度,而且是三千九百多款全都有。

这一步只负责**取回来**:抓详情页 → 认出规格图 → 下载。
认图靠一条简单规律:详情页的两张图里,不是列表缩略图的那张就是规格表。
OCR 另做,因为那一步要打模型,失败了不该连累下载。
"""
import io
import os
import re
import sys
import json
import time
import random
import hashlib
import argparse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "tools", "stnewwave-catalog.json")
PAGE_CACHE = os.path.join(ROOT, "tools", ".stnw-page")
SPEC_CACHE = os.path.join(ROOT, "tools", ".stnw-spec")
OUT = os.path.join(ROOT, "tools", "stnewwave-specs.json")
BASE = "https://www.gdstnewwave.com"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")}
IMG = re.compile(r"/public/storage/admin/product/[^\"'&) ]+")


def _get(url: str, cache_dir: str, binary=False):
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()[:20] + (".bin" if binary else ".html")
    path = os.path.join(cache_dir, key)
    if os.path.exists(path) and os.path.getsize(path) > 400:
        return open(path, "rb").read() if binary else open(path, encoding="utf-8", errors="replace").read()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=35) as r:
        body = r.read()
    if binary:
        open(path, "wb").write(body)
        out = body
    else:
        out = body.decode("utf-8", "replace")
        open(path, "w", encoding="utf-8").write(out)
    time.sleep(0.12 + random.random() * 0.12)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--pages-only", action="store_true", help="只抓详情页,不下规格图")
    a = ap.parse_args()

    rows = json.load(open(CATALOG, encoding="utf-8"))
    if a.limit:
        rows = rows[:a.limit]

    t0 = time.time()
    st = {"ok": 0, "nospec": 0, "bad": 0, "img": 0}
    found = []

    def one(r):
        try:
            html = _get(r["url"], PAGE_CACHE)
        except Exception:
            st["bad"] += 1
            return
        imgs = [x for x in dict.fromkeys(IMG.findall(html))]
        thumb = r["img"].replace(BASE, "")
        # 规格表 = 两张图里不是列表缩略图的那张
        spec = next((x for x in imgs if x != thumb), None)
        if not spec:
            st["nospec"] += 1
            return
        rec = {"uid": r["uid"], "model_raw": r["model_raw"],
               "variants": r["variants"], "cat_zh": r["cat_zh"],
               "spec_img": BASE + spec, "url": r["url"]}
        if not a.pages_only:
            try:
                _get(rec["spec_img"], SPEC_CACHE, binary=True)
                st["img"] += 1
            except Exception:
                pass
        found.append(rec)
        st["ok"] += 1
        k = st["ok"] + st["nospec"] + st["bad"]
        if k % 250 == 0:
            el = time.time() - t0
            print(f"  {k}/{len(rows)}  有规格图 {st['ok']}  无 {st['nospec']}  失败 {st['bad']}  "
                  f"已下图 {st['img']}  {el/60:.1f} 分钟  "
                  f"预计还需 {(el/k*(len(rows)-k))/60:.0f} 分钟", flush=True)

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(one, rows))

    json.dump(found, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n完成:{st['ok']} 款有规格图,{st['nospec']} 款没有,{st['bad']} 个页面失败")
    print(f"规格图已下 {st['img']} 张,用时 {(time.time()-t0)/60:.1f} 分钟")
    print(f"清单:{OUT}")


if __name__ == "__main__":
    main()
