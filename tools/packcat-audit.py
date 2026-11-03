#!/usr/bin/env python3
"""包材库自审:从 R2 抽样已上传的图册页,拼成联系表让人一眼看出哪些根本不该进库。

起因(2026-09-06 晚,创始人):「别人工厂的资料你也放进去?那是多余的啊」「切的很多都不对」。
他是对的。我当初图省事,把十一本供应商 PDF 的**每一页**都渲染上传了 819 页 ——
其中封面、公司简介、展会合影、纯文字参数表、目录页、联系方式页一个没筛。
客户打开包材库看到的是别家工厂的宣传册,不是瓶子。

这个脚本只做一件事:抽样 + 拼图 + 打上编码,让我自己先看,而不是继续凭想像判断。
只读 R2,不写不删。
"""
import io
import os
import sys
import math
import random

import boto3
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = int(os.environ.get("AUDIT_N", "48"))
COLS = int(os.environ.get("AUDIT_COLS", "8"))
CELL = int(os.environ.get("AUDIT_CELL", "260"))
SEED = int(os.environ.get("AUDIT_SEED", "7"))
PREFIX = os.environ.get("AUDIT_PREFIX", "media/packcat/")
OUT = os.environ.get("AUDIT_OUT", os.path.join(ROOT, "tools", "packcat-audit.jpg"))


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{E.get('R2_ACCOUNT_ID') or E['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"], aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
        region_name="auto")
    bucket = E.get("R2_BUCKET", "bohui-photo")

    keys, tok = [], None
    while True:
        kw = {"Bucket": bucket, "Prefix": PREFIX, "MaxKeys": 1000}
        if tok:
            kw["ContinuationToken"] = tok
        r = s3.list_objects_v2(**kw)
        keys += [o["Key"] for o in r.get("Contents", [])]
        if not r.get("IsTruncated"):
            break
        tok = r.get("NextContinuationToken")
    print(f"{PREFIX} 下共 {len(keys)} 个对象")

    random.Random(SEED).shuffle(keys)
    pick = keys[:N]

    rows = math.ceil(len(pick) / COLS)
    sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, k in enumerate(pick):
        try:
            body = s3.get_object(Bucket=bucket, Key=k)["Body"].read()
            im = Image.open(io.BytesIO(body)).convert("RGB")
        except Exception as e:
            print("  ✗", k, str(e)[:40])
            continue
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        x, y = (i % COLS) * CELL, (i // COLS) * (CELL + 22)
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        d.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline=(220, 220, 220))
        name = os.path.basename(k).replace(".webp", "")
        d.text((x + 4, y + CELL + 4), f"{i + 1:02d} {name[:34]}", fill=(70, 70, 70))
    sheet.save(OUT, quality=88)
    print(f"联系表:{OUT}  ({sheet.width}×{sheet.height},{len(pick)} 张)")


if __name__ == "__main__":
    main()
