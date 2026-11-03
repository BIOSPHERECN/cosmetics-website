#!/usr/bin/env python3
"""瓶厂图册 → 整页图上传 R2 + 自动分类(泵头/瓶身/软管/膏霜罐/盖/喷雾器)。

为什么先做整页:自动裁单品在这批图册上不可靠 —— 每家排版不同,白瓶白底、
表格与产品混排,规则切法漏得多。整页图配上**类别标签**先解决真问题:
"我要找泵头"能直接翻到页,而不是从头翻 366 页。单品裁剪改用视觉模型另做。

分类怎么判(便宜的先来):
  ① 页面文字层(九圆那几本有):按关键词命中,准且免费
  ② 没文字层的(富兰德、富麒是纯图):留空,交给后面的视觉模型补
  ③ 图册名与目录页的关键词作为兜底

产出:R2 media/packcat/{厂简写}/p{页}.webp + pack_assets 表一行,
      并生成 SQL 一次性入库(D1 每日写次数有限,不逐条调用)。
断点续跑:R2 已存在的键跳过。
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
SCALE = float(os.environ.get("PACKCAT_SCALE", "2.2"))     # 2.2 ≈ 1800px 宽,看得清型号
MAX_W = int(os.environ.get("PACKCAT_MAXW", "1800"))
QUALITY = int(os.environ.get("PACKCAT_Q", "82"))
ONLY = os.environ.get("PACKCAT_ONLY", "")
SKIP = [x for x in os.environ.get("PACKCAT_SKIP", "Reference image").split(",") if x]
SHARD = os.environ.get("PACKCAT_SHARD", "")     # "i/n":分片并行,i 从 0 起

SUPPLIER = {
    "世捷包装": "shijie", "余姚富兰德": "fulande", "富麒": "fuqi",
    "广州九圆": "jiuyuan", "广州合创": "hechuang", "广州名创": "mingchuang",
    "惠州艾儿克": "aierke", "时凯": "shikai", "汕头嘉雅": "jiaya",
}
# 分类关键词:中英都收,英文关键词按小写匹配
CATS = [
    ("泵头", ["泵头", "螺纹泵", "乳液泵", "泡沫泵", "真空泵", "按压泵", "开关泵", "甲油泵",
             "lotion pump", "foam pump", "screw pump", "treatment pump", "dispenser pump"]),
    ("喷雾器", ["喷雾", "喷头", "手扣式", "细雾", "持续喷雾", "trigger", "sprayer", "mist"]),
    ("瓶身", ["瓶", "真空瓶", "厚壁", "分装瓶", "滴管瓶", "尖嘴瓶", "bottle", "airless", "dropper"]),
    ("软管", ["软管", "铝塑管", "圆管", "扁管", "牙膏管", "tube", "laminated tube"]),
    ("膏霜罐", ["膏霜", "面霜罐", "广口瓶", "膏霜瓶", "面膜罐", "jar", "cream jar", "wide mouth"]),
    ("盖", ["盖子", "内塞", "封口", "cap", "closure", "lid"]),
]
SLUG_RX = re.compile(r"[^a-z0-9]+")
CODE_RX = re.compile(r"\b[A-Z]{2,4}[-]?\d{2,4}[-]?[A-Z0-9]{0,3}\b")
SPEC_RX = re.compile(r"[ØΦφ]\s?\d{2,3}\s?/\s?\d{2,3}|\b\d{2,4}\s?ml\b", re.I)


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def slug(s, n=14):
    s2 = SLUG_RX.sub("-", s.lower()).strip("-")
    return s2[:n] if len(s2) >= 3 else "b" + str(abs(hash(s)))[:6]


def classify(text, book):
    """按关键词命中数判类别。命中都为零就留空,交给视觉模型补 —— 不瞎猜。"""
    t = (text or "").lower()
    best, score = None, 0
    for cat, kws in CATS:
        s = sum(t.count(k.lower()) for k in kws)
        if s > score:
            best, score = cat, s
    if best:
        return best, "text"
    b = (book or "").lower()
    for cat, kws in CATS:
        if any(k.lower() in b for k in kws):
            return cat, "book"
    return None, "none"


def logo_mask(doc, npages, scale=0.55, samples=14):
    """自动识别在这批图册上不成立(十家版式差太多,试过方差法与交集法都失手),
       改用确定性遮盖 —— 看过十一本图册后确认:厂标基本都在**右上角**,
       页脚是网址与页码。所以固定抹这两块:右上角 16%×7%,页脚整条 4.5%。
       代价是极少数页的右上角内容一起被补掉,换来的是公开时不带别家 logo。"""
    return "corner"


def corner_mask(w, h):
    m = np.zeros((h, w), np.uint8)
    m[0:int(h * 0.07), int(w * 0.84):w] = 1      # 右上角厂标
    m[int(h * 0.955):h, :] = 1                    # 页脚:网址、页码
    return m


def strip_logo(pil, _mask=None):
    """把厂标与页脚按周围内容补掉。不是打码 —— 打码比 logo 还难看。"""
    arr = np.asarray(pil.convert("RGB"))
    m = corner_mask(arr.shape[1], arr.shape[0])
    return Image.fromarray(cv2.inpaint(arr, m, 4, cv2.INPAINT_TELEA))


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

    rows, t0, up, skip, nbytes = [], time.time(), 0, 0, 0
    # 递归找:展会目录下按厂分了 60 个子文件夹,只扫一层会漏掉
    allpdfs = sorted(glob.glob(os.path.join(SRC, "**", "*.pdf"), recursive=True))
    allpdfs = [x for x in allpdfs if not any(sk and sk in x for sk in SKIP)]
    if SHARD:
        i, n = (int(v) for v in SHARD.split("/"))
        allpdfs = [x for j, x in enumerate(allpdfs) if j % n == i]
    for f in allpdfs:
        sup = os.path.basename(os.path.dirname(f))
        if ONLY and ONLY not in sup:
            continue
        book = os.path.splitext(os.path.basename(f))[0]
        sup_s = SUPPLIER.get(sup) or slug(sup)
        if not sup_s or len(sup_s) < 2:          # 纯中文名 slug 会退化,用哈希兜底保证键名稳定
            sup_s = "s" + str(abs(hash(sup)))[:6]
        book_s = slug(book, 20)
        try:
            doc = pdfium.PdfDocument(f)
        except Exception as e:
            print(f"  ✗ {sup}: {str(e)[:50]}")
            continue
        n = len(doc)
        mask = logo_mask(doc, n)
        print(f"[{sup}·{sup_s}] {book[:34]} —— {n} 页"
              + ",右上角厂标与页脚逐页抹除",
              flush=True)
        for pi in range(n):
            key = f"media/packcat/{sup_s}/{book_s}-p{pi + 1:03d}.webp"
            page = doc[pi]
            try:
                text = page.get_textpage().get_text_bounded() or ""
            except Exception:
                text = ""
            cat, how = classify(text, book)
            codes = ",".join(sorted(set(CODE_RX.findall(text)))[:12])
            specs = ",".join(sorted(set(m.group(0) for m in SPEC_RX.finditer(text)))[:12])
            if key in have:
                skip += 1
                page.close()
                rows.append((sup, sup_s, book, pi + 1, cat, codes, specs, key, 0, 0, 0, how))
                continue
            try:
                pil = page.render(scale=SCALE).to_pil().convert("RGB")
            finally:
                page.close()
            if mask is not None:
                pil = strip_logo(pil, mask)
            if pil.width > MAX_W:
                pil = pil.resize((MAX_W, round(pil.height * MAX_W / pil.width)), Image.LANCZOS)
            buf = io.BytesIO()
            pil.save(buf, "WEBP", quality=QUALITY, method=4)
            blob = buf.getvalue()
            s3.put_object(Bucket=bucket, Key=key, Body=blob, ContentType="image/webp")
            rows.append((sup, sup_s, book, pi + 1, cat, codes, specs, key, pil.width, pil.height, len(blob), how))
            up += 1
            nbytes += len(blob)
            if up % 50 == 0:
                print(f"    …{up} 页 / {nbytes // 1024 // 1024} MB / {int(time.time() - t0)} 秒", flush=True)
        doc.close()
    # 一次性入库的 SQL(D1 每日写次数有限,不逐条调用)
    out = os.path.join(ROOT, "tools", f"packcat-assets{SHARD.replace(chr(47), chr(45)) or ''}.sql")
    q = lambda s: "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("-- 瓶厂图册整页(pack_assets),分类来自文字层关键词;没有文字层的留空待视觉模型补\n")
        for sup, sup_s, book, pg, cat, codes, specs, key, w, h, b, how in rows:
            fh.write("INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,category,codes,specs,r2_key,width,height,bytes,source) VALUES ("
                     f"{q(sup)},{q(sup_s)},{q(book)},{pg},'page',{q(cat)},{q(codes)},{q(specs)},{q(key)},{w},{h},{b},{q(how)});\n")
    cats = {}
    for r in rows:
        cats[r[4] or "待补"] = cats.get(r[4] or "待补", 0) + 1
    print(f"\n完成:上传 {up} 页 / 跳过 {skip} 页,{nbytes // 1024 // 1024} MB,{int(time.time() - t0)} 秒")
    print("分类分布:", "  ".join(f"{k} {v}" for k, v in sorted(cats.items(), key=lambda x: -x[1])))
    print("SQL:", out)


if __name__ == "__main__":
    main()
