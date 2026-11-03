#!/usr/bin/env python3
"""新潮塑胶目录 → R2 + packaging 表。

前两步:scrape 抓目录(3,958 款)、images --fetch 下图到本地缓存。
这一步把图洗干净上云,并生成入库 SQL。

粒度的选择(想清楚再定的):
  目录里 3,958 张卡片对应 5,522 个型号 —— 因为一张合影常带三个型号
  (B2529-35ML/B2530-50ML/B2531-150ML 是同一支瓶的三个容量)。
  **按卡片建一条,不按型号建 5,522 条。** 理由:
    · 源站自己就是这么组织的,一张卡片就是采购眼里的「一款」;
    · 5,522 条里有一半是同一支瓶的不同容量,拆开会让货架页出现大量近似重复;
    · 容量存成多值(35ml/50ml/150ml),客户要某个容量时用 LIKE 就能筛到。
  型号原文进 sku_raw,跟单时能原样报给供应商。

编码:ST-{首个型号}。ST 是我们给这家的前缀,对外只出现编码,不出现厂名 ——
这条纪律是 2026-09-06 那 819 页图册翻车换来的。
"""
import io
import os
import re
import sys
import json
import time
import hashlib
import argparse
from concurrent.futures import ThreadPoolExecutor

import boto3
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".stnw-img")
CATALOG = os.path.join(ROOT, "tools", "stnewwave-catalog.json")
PREFIX, SUPPLIER, SLUG = "ST", "新潮塑胶", "stnewwave"

CAT_MAP = {
    "膏霜护肤类": ("jar", "护肤"), "洗发沐浴类": ("pump-bottle", "洗护"),
    "婴童类": ("press-bottle", "婴童"), "彩妆类": ("compact", "彩妆"),
    "护发美发类": ("pump-bottle", "洗护"), "洗涤瓶": ("press-bottle", "家清"),
    "赠品类": ("travel-kit", "礼赠"), "其他": ("press-bottle", ""),
    "走珠瓶": ("roll-on", ""), "PET瓶": ("press-bottle", ""), "PETG瓶": ("press-bottle", ""),
    "真空瓶": ("airless-bottle", ""), "玻璃瓶": ("glass-bottle", ""),
}
MAT_BY_CAT = {"PET瓶": "PET", "PETG瓶": "PETG", "玻璃瓶": "玻璃", "真空瓶": "PP+PET"}
# 适配剂型:按用途反推,让包材库和配方库能互相跳
FIT_BY_CAT = {
    "膏霜护肤类": "cream,balm,gel", "洗发沐浴类": "foam,gel", "护发美发类": "foam,gel",
    "婴童类": "lotion,foam", "彩妆类": "powder,cushion", "洗涤瓶": "foam",
    "走珠瓶": "serum,essence", "真空瓶": "serum,essence,cream", "玻璃瓶": "serum,essence,oil",
    "PET瓶": "toner,essence,lotion", "PETG瓶": "toner,essence,lotion", "赠品类": "lotion,foam",
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


def cached(url: str):
    p = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:20] + ".bin")
    return p if os.path.exists(p) and os.path.getsize(p) > 900 else None


def screen(im: Image.Image) -> str:
    w, h = im.size
    if min(w, h) < 260:
        return "太小"
    ar = w / h
    if ar < 0.55 or ar > 1.9:
        return f"长宽比 {ar:.2f}"
    a = np.asarray(im.convert("RGB"))
    if len(np.unique((a[::5, ::5] // 32).reshape(-1, 3), axis=0)) < 8:
        return "色阶太少"
    return ""


def square(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), (255, 255, 255))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=900)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry", action="store_true", help="只算不传,看看有多少能用、多大")
    a = ap.parse_args()

    rows = json.load(open(CATALOG, encoding="utf-8"))
    if a.limit:
        rows = rows[:a.limit]

    s3 = None
    have = set()
    bucket = E.get("R2_BUCKET", "bohui-photo")
    if not a.dry:
        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{E.get('R2_ACCOUNT_ID') or E['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=E["R2_ACCESS_KEY_ID"], aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
            region_name="auto")
        tok = None
        while True:
            kw = {"Bucket": bucket, "Prefix": f"media/pack/{SLUG}/", "MaxKeys": 1000}
            if tok:
                kw["ContinuationToken"] = tok
            r = s3.list_objects_v2(**kw)
            for o in r.get("Contents", []):
                have.add(o["Key"])
            if not r.get("IsTruncated"):
                break
            tok = r.get("NextContinuationToken")
        print(f"R2 已有 {len(have)} 个对象,跳过重复")

    out, stat = [], {"ok": 0, "nofile": 0, "drop": 0, "skip": 0, "bytes": 0}
    codes = set()
    t0 = time.time()

    def one(r):
        vs = r.get("variants") or []
        if not vs or not vs[0].get("model"):
            stat["drop"] += 1
            return
        code = f"{PREFIX}-{vs[0]['model']}"
        if code in codes:
            stat["skip"] += 1
            return
        codes.add(code)
        p = cached(r["img"])
        if not p:
            stat["nofile"] += 1
            return
        try:
            im = Image.open(p)
        except Exception:
            stat["drop"] += 1
            return
        why = screen(im)
        if why:
            stat["drop"] += 1
            return
        key = f"media/pack/{SLUG}/{code}.webp"
        if not a.dry and key not in have:
            buf = io.BytesIO()
            square(im, a.size).save(buf, "WEBP", quality=a.quality, method=4)
            blob = buf.getvalue()
            s3.put_object(Bucket=bucket, Key=key, Body=blob, ContentType="image/webp")
            stat["bytes"] += len(blob)
        elif a.dry:
            buf = io.BytesIO()
            square(im, a.size).save(buf, "WEBP", quality=a.quality, method=4)
            stat["bytes"] += buf.tell()
        typ, use = CAT_MAP.get(r["cat_zh"], ("press-bottle", ""))
        out.append({
            "code": code,
            "type": typ,
            "material": MAT_BY_CAT.get(r["cat_zh"], ""),
            "capacity": "/".join(v["capacity"] for v in vs if v.get("capacity")),
            "compat": FIT_BY_CAT.get(r["cat_zh"], ""),
            "use": use,
            "sku_raw": r["model_raw"],
            "src": r["url"],
            "uid": r["uid"],
            "key": key,
        })
        stat["ok"] += 1
        n = stat["ok"] + stat["drop"] + stat["nofile"]
        if n % 400 == 0:
            print(f"  {n}/{len(rows)}  可用 {stat['ok']}  判掉 {stat['drop']}  "
                  f"缺图 {stat['nofile']}  {stat['bytes']/1024/1024:.0f} MB  "
                  f"{(time.time()-t0)/60:.1f} 分钟", flush=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(one, rows))

    print(f"\n可用 {stat['ok']} 款,判掉 {stat['drop']},缺图 {stat['nofile']},重复编码 {stat['skip']}")
    print(f"图片总量 {stat['bytes']/1024/1024:.0f} MB,用时 {(time.time()-t0)/60:.1f} 分钟")
    if a.dry:
        print("(dry run,没有上传)")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"
    sql = os.path.join(ROOT, "db", "migrations", "0036_packaging_stnewwave.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"-- 0036(2026-09-07):{SUPPLIER}目录 {len(out)} 款入包材库。\n"
                 "--\n"
                 "-- 来源是这家工厂自己的目录站,图是他们自拍的白底方图,没有促销角标与厂标 ——\n"
                 "-- 这正是 2026-09-06 那 819 页供应商图册翻车之后要找的东西。\n"
                 "-- 粒度按卡片而不是按型号:一张合影常带三个型号(同一支瓶的三个容量),\n"
                 "-- 拆开会让货架页出现大量近似重复;容量存成多值,要某个容量时用 LIKE 筛。\n"
                 "-- 对外只出现 ST-xxxx 编码,供应商名只进 supplier_ref。\n\n")
        for r in out:
            fh.write(
                "INSERT OR REPLACE INTO packaging "
                "(code,type,material,capacity,compat_formats,sku_raw,source_url,source_offer_id,"
                "supplier_ref,sourced_at,status,notes_zh) VALUES ("
                f"{q(r['code'])},{q(r['type'])},{q(r['material'])},{q(r['capacity'])},"
                f"{q(r['compat'])},{q(r['sku_raw'])},{q(r['src'])},{q(r['uid'])},"
                f"{q(SUPPLIER)},date('now'),'active',{q(r['use'])});\n")
        fh.write("\n")
        for r in out:
            fh.write(
                "INSERT OR IGNORE INTO pack_assets "
                "(supplier,supplier_s,kind,r2_key,our_code,source_url,source_offer_id,reviewed) VALUES ("
                f"{q(SUPPLIER)},{q(SLUG)},'item',{q(r['key'])},{q(r['code'])},"
                f"{q(r['src'])},{q(r['uid'])},1);\n")
    print(f"SQL:{sql}")
    json.dump(out, open(os.path.join(ROOT, "tools", "stnewwave-committed.json"), "w",
                        encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main()
