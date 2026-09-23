#!/usr/bin/env python3
"""抽样量线上包材图的「内容占画布比例」。

创始人 2026-09-07:「新潮的图片都小,1688 的就大很多」。
那句话背后是一个可量的东西:同一张 900×900 白底画布上,
新潮那批瓶子的外接框只有 305px,顺旭那批是 811px —— 并排放就是一大一小。
这个脚本把它变成数字,重排版跑完之后拿它验收,不靠眼睛。

用法:python tools/img-audit.py [抽样张数,默认 12]
"""
import io
import sys
import json
import random
import urllib.parse

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from _bohui import ROOT, http          # noqa: E402
from PIL import Image                  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SNAP = ROOT + "/tools/pack-all.json"
GROUPS = [("新潮 ST", ("ST",)), ("顺旭 SX", ("SX",)), ("1688 MZ/AL/MX", ("MZ", "AL", "MX"))]


def fill_ratio(code):
    """内容外接框的长边 ÷ 画布长边。编码里有中文和括号 ——
       直接拼进 URL 会抛 UnicodeEncodeError,必须先百分号编码。"""
    url = "https://biosphere-ai.com/pack/" + urllib.parse.quote(code, safe="")
    im = Image.open(io.BytesIO(http(url, timeout=30, retries=2))).convert("RGB")
    bb = im.convert("L").point(lambda x: 0 if x > 245 else 255).getbbox()
    if not bb:
        return None, im.size
    return max(bb[2] - bb[0], bb[3] - bb[1]) / max(im.size), im.size


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    rows = json.load(io.open(SNAP, encoding="utf-8"))
    random.seed(20260908)
    for name, pre in GROUPS:
        pool = [r["code"] for r in rows if r["code"].startswith(pre) and r.get("img")]
        vals = []
        for c in random.sample(pool, min(n, len(pool))):
            try:
                r, sz = fill_ratio(c)
                if r:
                    vals.append((r, c, sz))
            except Exception as e:
                print(f"  × {c}  {str(e)[:60]}")
        if not vals:
            print(f"{name:<16} 一张都没取到")
            continue
        vals.sort()
        med = vals[len(vals) // 2]
        print(f"{name:<16} 抽 {len(vals)} 张 · 中位 {med[0]:.0%} · 画布 {med[2][0]}×{med[2][1]}"
              f" · 最小 {vals[0][0]:.0%}({vals[0][1]}) · 最大 {vals[-1][0]:.0%}({vals[-1][1]})")


if __name__ == "__main__":
    main()
