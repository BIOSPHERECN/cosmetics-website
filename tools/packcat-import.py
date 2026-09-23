#!/usr/bin/env python3
"""瓶厂图册 → 包材仓素材(逐张提取产品图 → 去水印 → R2 → 媒体库)。

做什么:把 A:\\0F\\产品库\\瓶子工厂 下各家瓶厂的 PDF 图册拆成**单张产品图**,
不是整页截图 —— 整页里十几个瓶子挤一起,选型时根本没法用。

为什么这样能拿到高清:PDF 内嵌的是印刷用原图(常见 1000–3000px),
直接提取比"渲染整页再裁剪"清楚得多,也不会把旁边的排版文字带进来。

流程:
  ① 逐页枚举图像对象,按原始分辨率取出
  ② 过滤:太小的(图标、装饰线)、几乎纯色的(色块背景)、重复的(同图多页复用)
  ③ 去水印:同一本册子里反复出现在同一位置的图形(厂标/角标)识别后抹掉
  ④ 命名带工厂简写:{厂简写}-{册}-p{页}-{序}.webp,一眼知道来自哪家
  ⑤ 传 R2 的 media/packcat/{厂简写}/,再写媒体表

提取库用 pypdfium2(Apache-2.0),不用 PyMuPDF —— 后者 AGPL,商用会传染整个仓库。
断点续跑:已存在的键跳过,中途断了直接重跑。
"""
import hashlib
import io
import os
import re
import sys
import glob
import time

import boto3
import numpy as np
import pypdfium2 as pdfium
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC = os.environ.get("PACKCAT_SRC", r"A:\0F\产品库\瓶子工厂")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_W = int(os.environ.get("PACKCAT_MAXW", "2400"))   # 高清:超过这个宽度才缩
MIN_PX = int(os.environ.get("PACKCAT_MINPX", "300"))  # 短边小于此值的当装饰件丢掉
QUALITY = int(os.environ.get("PACKCAT_Q", "88"))
ONLY = os.environ.get("PACKCAT_ONLY", "")             # 只跑某一家(调试用)
LIMIT = int(os.environ.get("PACKCAT_LIMIT", "0"))     # 每家最多取多少张,0=不限

SUPPLIER = {
    "世捷包装": "shijie", "余姚富兰德": "fulande", "富麒": "fuqi",
    "广州九圆": "jiuyuan", "广州合创": "hechuang", "广州名创": "mingchuang",
    "惠州艾儿克": "aierke", "时凯": "shikai", "汕头嘉雅": "jiaya",
}
SLUG_RX = re.compile(r"[^a-z0-9]+")


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def slug(s, n=28):
    s2 = SLUG_RX.sub("-", s.lower()).strip("-")
    return s2[:n] if len(s2) >= 3 else "b" + hashlib.md5(s.encode("utf-8")).hexdigest()[:6]


def interesting(pil):
    """丢掉两类没用的图:几乎纯色的色块、细长的分隔条。
       用标准差判而不是颜色数 —— 渐变背景颜色很多但标准差很低。"""
    w, h = pil.size
    if w < MIN_PX or h < MIN_PX:
        return False
    if max(w, h) / max(1, min(w, h)) > 6:
        return False
    a = np.asarray(pil.convert("L").resize((64, 64)), dtype=np.float32)
    return float(a.std()) >= 12


def watermark_mask(imgs):
    """同一本册子里反复出现在同一位置、内容一模一样的小图形 = 厂标/水印。
       缩到同尺寸求逐像素方差:方差极低且不是白底的区域判为水印。
       只在面积很小(<8%)时才动手 —— 大面积雷同通常是产品本身,不能乱抹。"""
    if len(imgs) < 6:
        return None
    S = 256
    stack = np.stack([np.asarray(im.convert("L").resize((S, S)), dtype=np.float32) for im in imgs[:24]])
    var, mean = stack.var(axis=0), stack.mean(axis=0)
    mask = ((var < 8) & (mean < 235)).astype(np.uint8)
    frac = float(mask.mean())
    if frac > 0.08 or frac < 0.0005:
        return None
    return mask


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{E.get('R2_ACCOUNT_ID') or E['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = E.get("R2_BUCKET", "bohui-photo")

    have, tok = set(), None
    while True:
        kw = {"Bucket": bucket, "Prefix": "media/packcat/", "MaxKeys": 1000}
        if tok:
            kw["ContinuationToken"] = tok
        r = s3.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            have.add(o["Key"])
        if not r.get("IsTruncated"):
            break
        tok = r.get("NextContinuationToken")
    print(f"R2 已有 {len(have)} 张,重复的跳过\n")

    pdfs = sorted(glob.glob(os.path.join(SRC, "*", "*.pdf")))
    manifest, total_new, total_skip, total_bytes = [], 0, 0, 0
    t0 = time.time()
    IMG_TYPE = pdfium.raw.FPDF_PAGEOBJ_IMAGE

    for f in pdfs:
        sup = os.path.basename(os.path.dirname(f))
        if ONLY and ONLY not in sup:
            continue
        book = os.path.splitext(os.path.basename(f))[0]
        sup_s = SUPPLIER.get(sup) or slug(sup, 12)
        book_s = slug(book, 24)
        try:
            doc = pdfium.PdfDocument(f)
        except Exception as e:
            print(f"  ✗ 打不开 {sup}: {str(e)[:50]}")
            continue

        seen, picked = set(), []
        print(f"[{sup}·{sup_s}] {book[:38]} —— {len(doc)} 页")
        for pi in range(len(doc)):
            page = doc[pi]
            idx = 0
            try:
                objs = list(page.get_objects())
            except Exception:
                objs = []
            for ob in objs:
                if getattr(ob, "type", None) != IMG_TYPE:
                    continue
                try:
                    pil = ob.get_bitmap(render=False).to_pil()
                except Exception:
                    continue
                if pil.mode not in ("RGB", "L"):
                    pil = pil.convert("RGB")
                if not interesting(pil):
                    continue
                h = hashlib.md5(pil.convert("L").resize((32, 32)).tobytes()).hexdigest()
                if h in seen:          # 同一张图在多页复用,只留一份
                    continue
                seen.add(h)
                idx += 1
                picked.append((pi + 1, idx, pil))
            page.close()
            if LIMIT and len(picked) >= LIMIT:
                break
        doc.close()

        wm = watermark_mask([p[2] for p in picked])
        if wm is not None:
            print(f"    检出重复水印区域(占版面 {wm.mean() * 100:.1f}%),逐张抹除")

        n_new = 0
        for pg, idx, pil in picked:
            key = f"media/packcat/{sup_s}/{sup_s}-{book_s}-p{pg:03d}-{idx}.webp"
            if key in have:
                total_skip += 1
                continue
            try:
                if pil.width > MAX_W:
                    pil = pil.resize((MAX_W, round(pil.height * MAX_W / pil.width)), Image.LANCZOS)
                if wm is not None:
                    import cv2
                    arr = np.asarray(pil.convert("RGB"))
                    m = cv2.resize(wm, (arr.shape[1], arr.shape[0]), interpolation=cv2.INTER_NEAREST)
                    arr = cv2.inpaint(arr, m, 3, cv2.INPAINT_TELEA)
                    pil = Image.fromarray(arr)
                buf = io.BytesIO()
                pil.save(buf, "WEBP", quality=QUALITY, method=4)
                blob = buf.getvalue()
                s3.put_object(Bucket=bucket, Key=key, Body=blob, ContentType="image/webp")
                manifest.append((key, len(blob), sup, sup_s, book, pg, pil.width, pil.height))
                total_bytes += len(blob)
                total_new += 1
                n_new += 1
            except Exception as e:
                print(f"    ✗ p{pg}-{idx}: {str(e)[:60]}")
        print(f"    → 提取 {len(picked)} 张,新传 {n_new} 张,累计 {total_bytes // 1024 // 1024} MB,"
              f"{int(time.time() - t0)} 秒")

    out = os.path.join(ROOT, "tools", "packcat-media.sql")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("-- 瓶厂图册里的单张产品图(包材仓素材,folder='packcat',按厂简写分组)\n")
        for key, size, sup, sup_s, book, pg, w, h in manifest:
            alt = f"{sup} 瓶型图 · {book} p{pg}".replace("'", "''")
            fh.write("INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, folder, alt_zh, alt_en, driver) VALUES ("
                     f"'{key}','{key.split('/')[-1]}','image/webp',{size},'packcat','{alt}',"
                     f"'{sup_s} bottle {w}x{h} p{pg}','r2');\n")
    print(f"\n完成:新传 {total_new} 张 / 跳过 {total_skip} 张,{total_bytes // 1024 // 1024} MB,"
          f"用时 {int(time.time() - t0)} 秒\nSQL: {out}")


if __name__ == "__main__":
    main()
