#!/usr/bin/env python3
"""草本原料与种植基地配图 —— 从 Wikimedia Commons 取。

创始人 2026-09-06:「基地也需要搜索网络图,不要怕版权!那都是我们下端的供应链」。
版权这一条按他说的办,不再纠结。但今晚烧过的另一条要保留:
**图上不能出现别家的 logo、水印或文字排版** —— 那跟版权无关,是我们的页面上不该挂别人的牌子
(他自己也说了要去掉工厂 logo)。

为什么选 Commons 而不是随便搜:
  · 物种名准确。植物图最怕张冠李戴 —— 客户里有配方师,把积雪草配成天胡荽是要被当场识破的。
    Commons 的文件名与分类就是按学名组织的,搜「Centella asiatica」拿到的就是积雪草。
  · 天然没有水印与商家标识,不用再去做那件我今晚失败过两次的事。
  · 无需 API key,1200px 直出,速度快。
  · 许可清楚(CC BY-SA / 公有领域),署名信息一并存下来,将来要标注随时能标。

流程和包材那条一样,顺序不能反:
  --probe   下载 + 拼联系表,人看过再说。
  --commit  裁成统一比例、转 webp、上传 R2、生成 SQL。
"""
import io
import os
import re
import sys
import json
import math
import time
import argparse
import urllib.parse
import urllib.error
import urllib.request

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".commons-cache")
UA = {"User-Agent": "BiosphereBot/1.0 (botanical library; biosphere-ai.com)"}
API = "https://commons.wikimedia.org/w/api.php?"


def search(term: str, n: int = 4, width: int = 1400):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {term}", "gsrnamespace": "6", "gsrlimit": n,
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": str(width),
    })
    req = urllib.request.Request(API + q, headers=UA)
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=30))
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(2 ** attempt)   # 1s → 2s → 4s
    time.sleep(0.4)                    # 常规节流:别把免费接口当自家的
    out = []
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata", {}) or {}
        val = lambda k: re.sub(r"<[^>]+>", "", str((md.get(k, {}) or {}).get("value", "")))[:120]
        out.append({
            "file": p.get("title", "")[5:],
            "url": ii.get("thumburl") or ii.get("url"),
            "page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p.get('title', ''))}",
            "license": val("LicenseShortName"),
            "author": val("Artist"),
            "w": ii.get("thumbwidth"), "h": ii.get("thumbheight"),
        })
        time.sleep(0.05)
    return out


def fetch(url: str) -> bytes:
    os.makedirs(CACHE, exist_ok=True)
    key = re.sub(r"[^A-Za-z0-9]", "_", url)[-90:] + ".bin"
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and os.path.getsize(path) > 2000:
        return open(path, "rb").read()
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        body = r.read()
    open(path, "wb").write(body)
    time.sleep(0.2)
    return body


WIDE_MIN = float(os.environ.get("BOT_WIDE_MIN", "1.25"))

_FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def has_face(im: Image.Image) -> bool:
    """排除有人的照片。
       第一轮实测:搜「Rosa damascena field harvest」,三张全是保加利亚玫瑰节上
       穿民族服装的姑娘 —— 民俗照,不是原料图。植物类关键词很容易带出这种场景照,
       而人脸检测是最省事的一刀:原料图里本来就不该有人。"""
    a = np.asarray(im.convert("RGB"))
    g = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    sc = 900 / max(g.shape)
    if sc < 1:
        g = cv2.resize(g, (int(g.shape[1] * sc), int(g.shape[0] * sc)))
    return len(_FACE.detectMultiScale(g, 1.1, 5, minSize=(28, 28))) > 0


def greenness(im: Image.Image) -> float:
    """植物图的绿色占比。用来兜住「艾草搜出端午门框」这类:画面里几乎没有植物的直接降权。
       只作为排序参考,不做硬性淘汰 —— 甘草切片、干货、根茎本来就不绿。"""
    a = np.asarray(im.convert("RGB").resize((120, 120))).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return float(((g > r + 12) & (g > b + 12)).mean())


# 标本与古书插画:Commons 上植物学名的搜索结果里混着大量这两类。
# 实测「Panax ginseng」搜出 1900 年的植物图谱插画和贴着标签的腊叶标本,
# 「Artemisia argyi」两张都是白底压干叶 —— 放在工厂网站上很怪,像博物馆不像原料。
# 用文件名关键词判最准:Commons 的命名和分类里几乎一定带这些词,而照片不会带。
BLOCK = re.compile(
    r"herbarium|specimen|botany|botanical\s*(plate|illustration)|illustration|drawing|"
    r"engraving|lithograph|woodcut|plate\s*\d|\bmap\b|diagram|logo|watermark|"
    r"museum|catalogue|manuscript|stamp|coin|banknote",
    re.I)


def blocked_by_title(title: str) -> str:
    m = BLOCK.search(title or "")
    return f"标题命中「{m.group(0)}」(多半是标本或插画)" if m else ""


def usable(im: Image.Image) -> tuple[bool, str]:
    """几何 + 有没有人。内容好不好看人来定 —— 今晚的教训就是别让规则替人拍板。"""
    w, h = im.size
    if min(w, h) < 420:
        return False, "太小"
    ar = w / h
    if ar < WIDE_MIN:
        return False, f"竖图/方图 {ar:.2f}(要的是远景横幅)"
    if ar > 3.2:
        return False, f"长宽比 {ar:.2f} 太极端"
    if has_face(im):
        return False, "画面里有人"
    return True, ""


def crop_16_9(im: Image.Image, w=1400):
    """裁成 16:9 横幅。基地与原料页用的是通栏图,统一比例才不会一页一个高度。
       居中裁 —— 植物照的主体基本都在中间。"""
    im = im.convert("RGB")
    tw, th = w, round(w * 9 / 16)
    sc = max(tw / im.width, th / im.height)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    x, y = (im.width - tw) // 2, (im.height - th) // 2
    return im.crop((x, y, x + tw, y + th))


def sheet(items, out_path, cell=340, cols=5):
    rows = math.ceil(len(items) / cols)
    ch = round(cell * 9 / 16)
    s = Image.new("RGB", (cols * cell, rows * (ch + 30)), "white")
    d = ImageDraw.Draw(s)
    for i, (im, label) in enumerate(items):
        th = crop_16_9(im, cell - 6)
        x, y = (i % cols) * cell, (i // cols) * (ch + 30)
        s.paste(th, (x + 3, y + 3))
        d.rectangle([x, y, x + cell - 1, y + ch - 1], outline=(225, 225, 225))
        for k, ln in enumerate(label[:2]):
            d.text((x + 5, y + ch + 4 + k * 11), ln[:52], fill=(70, 70, 70))
    s.save(out_path, quality=87)
    return s.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", help='JSON:[{"slug":"centella","zh":"积雪草","query":"Centella asiatica plant"}]')
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--per", type=int, default=3, help="每个目标取几张备选")
    a = ap.parse_args()
    if not (a.probe or a.commit):
        a.probe = True

    targets = json.load(open(a.targets, encoding="utf-8"))
    picked, meta = [], []
    for t in targets:
        queries = t.get("queries") or [t["query"]]
        cands, seen, drops = [], set(), []
        for q in queries:
            if len(cands) >= a.per:
                break
            try:
                hits = search(q, n=a.per + 3)
            except Exception as e:
                drops.append(f"搜索失败 {str(e)[:30]}")
                continue
            for h in hits:
                if not h["url"] or h["file"] in seen or len(cands) >= a.per:
                    continue
                seen.add(h["file"])
                why0 = blocked_by_title(h["file"])
                if why0:
                    drops.append(f"{h['file'][:24]} — {why0}")
                    continue
                try:
                    im = Image.open(io.BytesIO(fetch(h["url"])))
                except Exception:
                    continue
                ok, why = usable(im)
                if not ok:
                    drops.append(f"{h['file'][:24]} — {why}")
                    continue
                cands.append((greenness(im), im, h))
        # 绿一点的排前面:植物图优先于干货与背景照,但都留着让人挑
        cands.sort(key=lambda x: -x[0])
        for gr, im, h in cands:
            picked.append((im, [f"{t['zh']} · {t['slug']}", f"{h['license']} · {h['file'][:34]}"]))
            meta.append({**t, **h, "greenness": round(gr, 3)})
        print(f"  {t['zh']:<10} 取到 {len(cands)} 张" + (f"  丢掉:{'; '.join(drops[:2])}" if drops else ""))

    if a.probe:
        out = os.path.join(ROOT, "tools", "botanical-probe.jpg")
        if picked:
            print(f"\n联系表:{out}  {sheet(picked, out)}")
            json.dump(meta, open(os.path.join(ROOT, "tools", "botanical-picked.json"), "w",
                                 encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"备选清单(含许可与作者):tools/botanical-picked.json  共 {len(meta)} 条")
        else:
            print("一张都没取到")
        return

    print("[commit] 等联系表确认后再开")


if __name__ == "__main__":
    main()
