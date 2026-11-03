#!/usr/bin/env python3
"""图册页 → 单品块(一款一块,一个系列也算一块)。

创始人要的是"一个个瓶子",不是整页。但也不是逐个抠出孤零零的瓶子 ——
他补了一句关键的:「多款瓶子一个块就放一起,一个系列一个块也切成一块」。
所以切的单位是**版面块**:一款单独成块就切一块,一个系列挤在一起就整块切下来,
连带它的型号与规格表 —— 客户看的就是这个组合,拆开反而没法认。

怎么切:X-Y 递归切(版面分析的老办法)。沿着"整行/整列都没内容"的空白槽劈开,
劈不动了就是一块。它跟着设计师排版的空白走,比逐个抠物体稳得多 ——
之前用形态学抠单品,白瓶白底根本抠不出来,试过两版都失手。

过滤:纯文字块(如「DISCHARGE RATE 0.80」)、纯色块、太小的块一律丢掉。
编码:{厂前缀}{册号}-P{页}-{块号},例 FLD-P024-3。整页那份仍在,两者并存。
"""
import io
import os
import re
import sys
import glob
import time

import boto3
import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC = os.environ.get("PACKCAT_SRC", r"A:\0F\产品库\瓶子工厂")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCALE = float(os.environ.get("ITEM_SCALE", "2.6"))
MIN_SIDE = int(os.environ.get("ITEM_MINSIDE", "260"))
MAX_W = int(os.environ.get("ITEM_MAXW", "1400"))
QUALITY = int(os.environ.get("ITEM_Q", "86"))
ONLY = os.environ.get("ITEM_ONLY", "")          # 逗号分隔的目录名片段
SHARD = os.environ.get("ITEM_SHARD", "")
SKIP = [x for x in os.environ.get("ITEM_SKIP", "Reference image").split(",") if x]

SUPPLIER = {
    "世捷包装": "SJ", "余姚富兰德": "FLD", "富麒": "FQ", "广州九圆": "JY",
    "广州合创": "HC", "广州名创": "MC", "惠州艾儿克": "AEK", "时凯": "SK", "汕头嘉雅": "JIA",
}


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def prefix_of(sup):
    if sup in SUPPLIER:
        return SUPPLIER[sup]
    ts = [t for t in re.split(r"[^A-Za-z0-9]+", sup) if t]
    p = ("".join(t[0] for t in ts[:3]).upper() or "X")[:4]
    return p if len(p) >= 2 else (ts[0][:3].upper() if ts else "X")


def _gaps(proj, minlen, tol):
    z = proj <= tol
    runs, s = [], None
    for i, v in enumerate(z):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= minlen:
                runs.append((s, i))
            s = None
    if s is not None and len(z) - s >= minlen:
        runs.append((s, len(z)))
    return runs


def _xy(ink, x0, y0, depth, out, min_gap=0.012, edge=0.02):
    h, w = ink.shape
    if h < 50 or w < 50 or depth > 8:
        out.append((x0, y0, w, h))
        return
    rows, cols = (ink > 0).sum(axis=1), (ink > 0).sum(axis=0)
    gy = [g for g in _gaps(rows, int(h * min_gap), max(1, int(0.005 * w))) if g[0] > h * edge and g[1] < h * (1 - edge)]
    gx = [g for g in _gaps(cols, int(w * min_gap), max(1, int(0.005 * h))) if g[0] > w * edge and g[1] < w * (1 - edge)]
    wy = max((b - a for a, b in gy), default=0)
    wx = max((b - a for a, b in gx), default=0)
    if wy == 0 and wx == 0:
        out.append((x0, y0, w, h))
        return
    if wy >= wx:
        a, b = max(gy, key=lambda g: g[1] - g[0])
        _xy(ink[:a], x0, y0, depth + 1, out); _xy(ink[b:], x0, y0 + b, depth + 1, out)
    else:
        a, b = max(gx, key=lambda g: g[1] - g[0])
        _xy(ink[:, :a], x0, y0, depth + 1, out); _xy(ink[:, b:], x0 + b, y0, depth + 1, out)


def is_product(patch):
    """留下有产品照的块,丢掉纯文字标签与纯色块。
       文字块的特征:二值化后一堆小碎片、颜色阶数少;产品照:色阶多、碎片少。"""
    if patch.size == 0:
        return False
    q = (patch // 32).reshape(-1, 3)
    uniq = len(np.unique(q, axis=0))
    if uniq < 30:
        return False
    if patch.reshape(-1, 3).std(axis=0).mean() < 11:
        return False
    g = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n, _, st, _ = cv2.connectedComponentsWithStats(bw, 8)
    frags = sum(1 for k in range(1, n) if 15 < st[k, 4] < 600)
    ink = float((bw > 0).mean())
    return not (frags > 70 and ink < 0.22)      # 碎片多且墨少 = 一段文字


def blocks(a):
    h, w = a.shape[:2]
    S = 1600
    sc = S / w
    small = cv2.resize(a, (S, int(h * sc)))
    g = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    bg = np.median(np.concatenate([g[:15, :15].ravel(), g[:15, -15:].ravel(),
                                   g[-15:, :15].ravel(), g[-15:, -15:].ravel()]))
    ink = ((np.abs(g.astype(np.int16) - bg) > 16) * 255).astype(np.uint8)
    H, W = ink.shape
    # 跨页图册先按中缝劈成左右页,再各自递归 —— 中缝是最可靠的一刀
    parts = [(0, 0, ink[:, :W // 2]), (W // 2, 0, ink[:, W // 2:])] if W > H * 1.25 else [(0, 0, ink)]
    raw = []
    for ox, oy, p in parts:
        _xy(p, ox, oy, 0, raw)
    out = []
    for x, y, bw_, bh in raw:
        if bw_ < W * 0.05 or bh < H * 0.05:
            continue
        sub = small[y:y + bh, x:x + bw_]
        if not is_product(sub):
            continue
        pad = int(min(bw_, bh) * 0.02)
        X, Y = max(0, int((x - pad) / sc)), max(0, int((y - pad) / sc))
        out.append((X, Y, min(w - X, int((bw_ + 2 * pad) / sc)), min(h - Y, int((bh + 2 * pad) / sc))))
    return out


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{E.get('R2_ACCOUNT_ID') or E['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"], aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
        region_name="auto")
    bucket = E.get("R2_BUCKET", "bohui-photo")
    have, tok = set(), None
    while True:
        kw = {"Bucket": bucket, "Prefix": "media/packitem/", "MaxKeys": 1000}
        if tok:
            kw["ContinuationToken"] = tok
        r = s3.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            have.add(o["Key"])
        if not r.get("IsTruncated"):
            break
        tok = r.get("NextContinuationToken")

    pdfs = sorted(glob.glob(os.path.join(SRC, "**", "*.pdf"), recursive=True))
    pdfs = [p for p in pdfs if not any(sk and sk in p for sk in SKIP)]
    if ONLY:
        keys = [k for k in ONLY.split(",") if k]
        pdfs = [p for p in pdfs if any(k in p for k in keys)]
    if SHARD:
        i, n = (int(v) for v in SHARD.split("/"))
        pdfs = [p for j, p in enumerate(pdfs) if j % n == i]

    rows, t0, up, skip = [], time.time(), 0, 0
    bybook = {}
    for f in pdfs:
        sup = os.path.basename(os.path.dirname(f))
        bybook.setdefault(sup, []).append(f)
    for f in pdfs:
        sup = os.path.basename(os.path.dirname(f))
        book = os.path.splitext(os.path.basename(f))[0]
        pre = prefix_of(sup)
        bno = bybook[sup].index(f) + 1
        tag = f"{pre}{'' if len(bybook[sup]) == 1 else bno}"
        slug = re.sub(r"[^a-z0-9]+", "-", sup.lower()).strip("-")[:22] or pre.lower()
        try:
            doc = pdfium.PdfDocument(f)
        except Exception as e:
            print(f"  ✗ {sup}: {str(e)[:40]}")
            continue
        print(f"[{sup}] {book[:32]} —— {len(doc)} 页", flush=True)
        nb = 0
        for pi in range(len(doc)):
            try:
                pg = doc[pi]
                a = np.asarray(pg.render(scale=SCALE).to_pil().convert("RGB"))
                pg.close()
            except Exception:
                continue
            for j, (x, y, bw_, bh) in enumerate(blocks(a), 1):
                if min(bw_, bh) < MIN_SIDE:
                    continue
                code = f"{tag}-P{pi + 1:03d}-{j}"
                key = f"media/packitem/{slug}/{code}.webp"
                if key in have:
                    skip += 1
                    continue
                crop = Image.fromarray(a[y:y + bh, x:x + bw_])
                if crop.width > MAX_W:
                    crop = crop.resize((MAX_W, round(crop.height * MAX_W / crop.width)), Image.LANCZOS)
                buf = io.BytesIO()
                crop.save(buf, "WEBP", quality=QUALITY, method=4)
                blob = buf.getvalue()
                s3.put_object(Bucket=bucket, Key=key, Body=blob, ContentType="image/webp")
                rows.append((sup, slug, book, pi + 1, code, key, crop.width, crop.height, len(blob)))
                up += 1
                nb += 1
                if up % 100 == 0:
                    print(f"    …{up} 块 / {int(time.time() - t0)} 秒", flush=True)
        doc.close()
        print(f"    → 本册 {nb} 块", flush=True)

    out = os.path.join(ROOT, "tools", f"packitems{SHARD.replace('/', '-') or ''}.sql")
    q = lambda s: "NULL" if s in (None, "") else "'" + str(s).replace("'", "''") + "'"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("-- 图册单品块(kind='item'):一款一块,一个系列也算一块\n")
        for sup, slug, book, pg, code, key, w, h, b in rows:
            fh.write("INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,width,height,bytes,source,our_code,supplier_id) VALUES ("
                     f"{q(sup)},{q(slug)},{q(book)},{pg},'item',{q(key)},{w},{h},{b},'xycut',{q(code)},"
                     f"(SELECT id FROM suppliers WHERE name_zh={q(sup)}));\n")
    print(f"\n完成:新切 {up} 块 / 跳过 {skip},用时 {int(time.time() - t0)} 秒\nSQL: {out}")


if __name__ == "__main__":
    main()
