#!/usr/bin/env python3
"""规格图 → 结构化尺寸。

把 stnewwave-specs.py 下回来的规格表图逐张送去读图,拿到
货号 / 尺寸(长宽高)/ 裸瓶高 / 口径(含配套内塞)/ 参考容量。

读图走云端接口 /api/admin/ocr-spec:模型 key 在 D1 里,不落到本地环境。
本地只负责把图变成 data URL 传上去、把结果收下来。

两段式:
  --probe   先跑十几张,把「原图 + 读出来的字段」拼成对照表,人核对准确率。
  --run     全量跑,产出 JSON。

读不出来的字段留空 —— 一个猜出来的口径会让客户按错的泵头开模。
所以宁可这一款缺尺寸,也不要填一个像模像样的错数。
"""
import io
import os
import re
import sys
import json
import time
import base64
import hashlib
import argparse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_CACHE = os.path.join(ROOT, "tools", ".stnw-spec")
SPECS = os.path.join(ROOT, "tools", "stnewwave-specs.json")
OUT = os.path.join(ROOT, "tools", "stnewwave-ocr.json")
API = "https://biosphere-ai.com/api/admin/ocr-spec"


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()
KEY = E.get("CRON_KEY", "")


def cached_path(url: str):
    p = os.path.join(SPEC_CACHE, hashlib.sha1(url.encode()).hexdigest()[:20] + ".bin")
    return p if os.path.exists(p) and os.path.getsize(p) > 400 else None


def to_data_url(path: str, max_side=900) -> str:
    """规格表是文字图,放大不必要,但太小会读错。压到 900 边长足够看清数字,
       同时把请求体控制在几百 KB —— Workers 对请求体有上限,传原图会失败。"""
    im = Image.open(path).convert("RGB")
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def ocr(path: str):
    body = json.dumps({"image": to_data_url(path)}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Content-Type": "application/json", "x-cron-key": KEY})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    if not (a.probe or a.run):
        a.probe = True
    if not KEY:
        print("找不到 CRON_KEY,读 .env 失败"); return

    rows = json.load(open(SPECS, encoding="utf-8"))
    rows = [r for r in rows if cached_path(r["spec_img"])]
    print(f"有本地规格图的:{len(rows)} 款")

    todo = rows[:a.n] if a.probe else rows
    got, fail = [], []
    t0 = time.time()

    def one(r):
        p = cached_path(r["spec_img"])
        try:
            res = ocr(p)
        except Exception as e:
            fail.append((r["model_raw"], str(e)[:50])); return
        if not res.get("ok"):
            fail.append((r["model_raw"], str(res.get("error"))[:50])); return
        got.append({**r, "spec": res["spec"], "model": res.get("model", "")})
        if len(got) % 50 == 0:
            el = time.time() - t0
            print(f"  {len(got)}/{len(todo)}  {el/60:.1f} 分钟  "
                  f"预计还需 {(el/len(got)*(len(todo)-len(got)))/60:.0f} 分钟", flush=True)

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(one, todo))

    print(f"\n读出 {len(got)} 张,失败 {len(fail)} 张,用时 {(time.time()-t0)/60:.1f} 分钟")
    for m, w in fail[:6]:
        print(f"  ✗ {m[:30]:<32} {w}")

    filled = {k: sum(1 for g in got if g["spec"].get(k)) for k in
              ("item_no", "size_mm", "bare_height_mm", "caliber", "capacity")}
    if got:
        print("字段命中率:", "  ".join(f"{k} {v}/{len(got)}" for k, v in filled.items()))

    if a.probe and got:
        # 原图 + 读出来的字段并排,人一眼能核
        cell_w, cell_h, cols = 560, 300, 2
        rows_n = (len(got) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell_w, rows_n * cell_h), "white")
        d = ImageDraw.Draw(sheet)
        for i, g in enumerate(got):
            im = Image.open(cached_path(g["spec_img"])).convert("RGB")
            im.thumbnail((cell_w - 200, cell_h - 20), Image.LANCZOS)
            x, y = (i % cols) * cell_w, (i // cols) * cell_h
            sheet.paste(im, (x + 6, y + 10))
            s = g["spec"]
            lines = [g["model_raw"][:26],
                     f"货号 {s['item_no']}", f"尺寸 {s['size_mm']}",
                     f"裸瓶高 {s['bare_height_mm']}", f"口径 {s['caliber'][:24]}",
                     f"容量 {s['capacity']}", f"备注 {s['note'][:18]}"]
            for k, ln in enumerate(lines):
                d.text((x + cell_w - 190, y + 16 + k * 16), ln[:30], fill=(40, 40, 40))
            d.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline=(226, 226, 226))
        out = os.path.join(ROOT, "tools", "stnewwave-ocr-probe.jpg")
        sheet.save(out, quality=88)
        print(f"对照表:{out}")

    json.dump(got, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"结果:{OUT}")


if __name__ == "__main__":
    main()
