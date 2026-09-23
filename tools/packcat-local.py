#!/usr/bin/env python3
"""瓶厂图册 → 单个瓶型图(只落本地,不上云)。

为什么不上 R2:账号里别的项目已经占了几十 G,再堆几百 M 就是往付费区推
(创始人 2026-09-04 指示)。所以切好的图放本地 F 盘,按厂分文件夹,
需要哪张再单独传 —— 素材底库本来就不必上云。

做什么:
  ① 逐页渲染(scale 2.6,兼顾清晰与速度)
  ② 按背景色分割出页面上的每一个物体(瓶、泵、盖),连通域 + 彩色方差判"是不是照片"
  ③ 每个物体多留 4% 边距裁下来 —— 型号标注常在瓶子正下方,留边才带得上
  ④ 存 F:\\0cosmetic\\包材图库\\{厂简写}\\{厂简写}-{册}-p{页}-{序}.webp
  ⑤ 同时写一份 index.csv:文件名、来自哪本册子哪一页、尺寸,方便检索

断点续跑:已存在的文件跳过。
"""
import csv
import os
import re
import sys
import glob
import time

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC = os.environ.get("PACKCAT_SRC", r"A:\0F\产品库\瓶子工厂")
OUT = os.environ.get("PACKCAT_OUT", r"F:\0cosmetic\包材图库")
SCALE = float(os.environ.get("PACKCAT_SCALE", "2.6"))
QUALITY = int(os.environ.get("PACKCAT_Q", "88"))
MIN_SIDE = int(os.environ.get("PACKCAT_MINSIDE", "220"))   # 裁出来短边小于此值的丢掉
ONLY = os.environ.get("PACKCAT_ONLY", "")
MAXPAGE = int(os.environ.get("PACKCAT_MAXPAGE", "0"))

SUPPLIER = {
    "世捷包装": "shijie", "余姚富兰德": "fulande", "富麒": "fuqi",
    "广州九圆": "jiuyuan", "广州合创": "hechuang", "广州名创": "mingchuang",
    "惠州艾儿克": "aierke", "时凯": "shikai", "汕头嘉雅": "jiaya",
}
SLUG_RX = re.compile(r"[^a-z0-9]+")


def slug(s, n=24):
    s2 = SLUG_RX.sub("-", s.lower()).strip("-")
    return s2[:n] if len(s2) >= 3 else "b" + str(abs(hash(s)))[:6]


def segment(a):
    """在缩略图上找物体,再把坐标映射回原图。
       缩略图上做形态学又快又稳:文字笔画细,开运算一抹就掉;瓶子是实心块,留得住。"""
    h, w = a.shape[:2]
    S = 1400
    sc = S / w
    small = cv2.resize(a, (S, int(h * sc)))
    g = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    corners = np.concatenate([g[:20, :20].ravel(), g[:20, -20:].ravel(),
                              g[-20:, :20].ravel(), g[-20:, -20:].ravel()])
    bg = np.median(corners)
    m = (np.abs(g.astype(np.int16) - bg) > 18).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    H, W = m.shape
    out = []
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        if not (0.0015 < area / (H * W) < 0.30):
            continue
        if min(cw, ch) < 55 or not (0.15 < cw / ch < 5):
            continue
        patch = small[y:y + ch, x:x + cw]
        if patch.size == 0 or patch.reshape(-1, 3).std(axis=0).mean() < 14:
            continue
        # 留 4% 边距:型号与口径标注常在正下方
        px, py = int(cw * 0.04 / sc), int(ch * 0.04 / sc)
        X, Y = max(0, int(x / sc) - px), max(0, int(y / sc) - py)
        CW, CH = min(w - X, int(cw / sc) + 2 * px), min(h - Y, int(ch / sc) + 2 * py)
        out.append((X, Y, CW, CH))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, "index.csv")
    new_index = not os.path.exists(idx_path)
    idx = open(idx_path, "a", encoding="utf-8-sig", newline="")
    wr = csv.writer(idx)
    if new_index:
        wr.writerow(["文件", "供应商", "厂简写", "图册", "页码", "宽", "高", "KB"])

    pdfs = sorted(glob.glob(os.path.join(SRC, "*", "*.pdf")))
    t0, total, skipped = time.time(), 0, 0
    for f in pdfs:
        sup = os.path.basename(os.path.dirname(f))
        if ONLY and ONLY not in sup:
            continue
        book = os.path.splitext(os.path.basename(f))[0]
        sup_s, book_s = SUPPLIER.get(sup) or slug(sup, 12), slug(book, 22)
        d = os.path.join(OUT, sup_s)
        os.makedirs(d, exist_ok=True)
        try:
            doc = pdfium.PdfDocument(f)
        except Exception as e:
            print(f"  ✗ 打不开 {sup}:{str(e)[:50]}")
            continue
        npages = len(doc) if not MAXPAGE else min(len(doc), MAXPAGE)
        print(f"[{sup}·{sup_s}] {book[:36]} —— {npages} 页", flush=True)
        n_book = 0
        for pi in range(npages):
            try:
                page = doc[pi]
                a = np.asarray(page.render(scale=SCALE).to_pil().convert("RGB"))
                page.close()
            except Exception as e:
                print(f"    ✗ 第 {pi + 1} 页渲染失败:{str(e)[:40]}")
                continue
            for j, (x, y, cw, ch) in enumerate(segment(a), 1):
                if min(cw, ch) < MIN_SIDE:
                    continue
                name = f"{sup_s}-{book_s}-p{pi + 1:03d}-{j}.webp"
                p = os.path.join(d, name)
                if os.path.exists(p):
                    skipped += 1
                    continue
                crop = Image.fromarray(a[y:y + ch, x:x + cw])
                crop.save(p, "WEBP", quality=QUALITY, method=4)
                wr.writerow([name, sup, sup_s, book, pi + 1, crop.width, crop.height,
                             os.path.getsize(p) // 1024])
                total += 1
                n_book += 1
            if (pi + 1) % 20 == 0:
                print(f"    …{pi + 1}/{npages} 页,已切 {n_book} 张,{int(time.time() - t0)} 秒", flush=True)
        doc.close()
        idx.flush()
        print(f"    → 本册切出 {n_book} 张", flush=True)
    idx.close()
    print(f"\n完成:新切 {total} 张,跳过 {skipped} 张,用时 {int(time.time() - t0)} 秒")
    print(f"输出目录:{OUT}(按厂分文件夹,index.csv 可检索)")


if __name__ == "__main__":
    main()
