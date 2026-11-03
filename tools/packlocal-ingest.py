#!/usr/bin/env python3
"""本地图片目录 → 包材库。

创始人用 Fatkun 从 1688 批量下图,存成
  D:\\360安全浏览器下载\\{供应商全名}\\{商品标题} - 阿里巴巴\\主图-01.jpg
这个结构比我从 PDF 里抠好太多,原因有三:
  · 文件名已经把「主图」和「详情」分开了 —— 详情长图正是我们要丢的那类(别家排版与文案),
    这一刀不用写任何判别逻辑就有了;
  · 主图基本是 800×800 白底或浅底摆拍,本来就接近我们要的形态;
  · 商品标题里带着容量与类型(「现货30ml50ml60ml茶色便携旅行小样喷雾瓶」),
    能直接解析出规格骨架,精确口径再由浏览器抓属性表补。

创始人 2026-09-07:「所有的瓶子工厂都是我们的供应商!」——所以这些图进我们的包材库是常规做法。
但呈现纪律不变:对外只出现我们自己的编码,供应商名只留在内部表。
今晚 819 页整页扫描出事,栽的就是图上印着别家的名字。

两段式,顺序不能反(今晚的教训):
  --probe   只出联系表,人看过再说。
  --commit  上传 R2 + 生成 SQL。
"""
import io
import os
import re
import sys
import json
import math
import glob
import argparse

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("PACKLOCAL_SRC", r"D:\360安全浏览器下载")

# 供应商中文全名 → 编码前缀。新供应商必须先在这里登记,不自动生成 ——
# 前缀要长期印在编码里,乱生成会出现两家撞前缀。
PREFIX = {"广州市顺旭塑料科技有限公司": ("SX", "shunxu")}

SKIP_DIRS = {"店铺首页"}     # 店铺首页是 banner 与促销图,不是商品


def parse_title(title: str) -> dict:
    """从商品标题里解析规格骨架。标题是卖家为了搜索堆出来的,
       所以容量和类型基本都在里面 —— 拿来当骨架够用,精确口径另外补。"""
    t = re.sub(r"\s*-\s*阿里巴巴\s*$", "", title).strip()
    caps = re.findall(r"(\d+(?:\.\d+)?)\s*(ml|ML|g|G|克|毫升)", t)
    caps = sorted({f"{c[0]}{'ml' if c[1].lower() in ('ml', '毫升') else 'g'}" for c in caps},
                  key=lambda x: float(re.match(r"[\d.]+", x).group()))
    TYPES = [
        ("喷雾瓶", "spray-bottle"), ("喷瓶", "spray-bottle"), ("起泡瓶", "foam-pump"),
        ("慕斯瓶", "foam-pump"), ("按压", "pump-bottle"), ("真空", "airless-bottle"),
        ("膏霜瓶", "jar"), ("面霜瓶", "jar"), ("泥膜罐", "jar"), ("广口瓶", "jar"),
        ("发膜瓶", "jar"), ("罐", "jar"), ("软管", "tube"), ("洗发水瓶", "pump-bottle"),
        ("沐浴露瓶", "pump-bottle"), ("洗护瓶", "pump-bottle"), ("身体乳瓶", "pump-bottle"),
        ("乳液瓶", "pump-bottle"), ("分装瓶", "press-bottle"), ("挤压瓶", "press-bottle"),
        ("翻盖", "press-bottle"), ("瓶", "press-bottle"),
    ]
    typ = next((v for k, v in TYPES if k in t), "press-bottle")
    MATS = [("PET", "PET"), ("pet", "PET"), ("HDPE", "HDPE"), ("PP", "PP"), ("玻璃", "玻璃"),
            ("亚克力", "亚克力"), ("PCR", "PCR")]
    mat = next((v for k, v in MATS if k in t), "")
    return {"title": t, "capacities": caps, "type": typ, "material": mat}


_FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def screen(im: Image.Image) -> str:
    """返回否决原因;空串表示留下。
       只做机器判得准的几件,剩下的交给人 —— 今晚规则替人拍板,
       放过了带 SHUNXU logo 的和一张英雄牌钢笔礼盒。"""
    w, h = im.size
    if min(w, h) < 500:
        return "太小"
    ar = w / h
    if ar < 0.7 or ar > 1.45:
        return f"长宽比 {ar:.2f}(主图应接近方图)"
    a = np.asarray(im.convert("RGB"))
    g = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    if len(np.unique((a[::4, ::4] // 32).reshape(-1, 3), axis=0)) < 45:
        return "色阶太少(多半是纯色块或文字图)"
    if len(_FACE.detectMultiScale(g, 1.1, 5, minSize=(30, 30))) > 0:
        return "画面里有人"
    if red_promo(im):
        return "红框促销图"
    # 文字密度:促销图与「细节展示」拼版满屏小字,商品摆拍不会
    e = cv2.Canny(g, 80, 180)
    n, _, st, _ = cv2.connectedComponentsWithStats((e > 0).astype(np.uint8), 8)
    small = sum(1 for k in range(1, n) if 8 < st[k, 4] < 400)
    if small > 900:
        return f"碎片 {small}(多半是促销图或拼版详情)"
    return ""


def red_promo(im: Image.Image) -> bool:
    """整张红框促销图。顺旭这批里「源头工厂 1000个起印刷/喷涂」就是这种:
       四周一圈饱和红边 + 底部红条。判据是边框区域的高饱和红占比,
       比认字稳 —— 促销语会换,红框不会。"""
    a = np.asarray(im.convert("RGB").resize((240, 240))).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 130) & (r - g > 60) & (r - b > 60)
    edge = np.zeros_like(red)
    edge[:14, :] = edge[-30:, :] = edge[:, :14] = edge[:, -14:] = True
    return float(red[edge].mean()) > 0.30


def logo_box(im: Image.Image):
    """量出厂标的实际外接框,而不是猜一个百分比。

    猜百分比已经错过三次:图册那批猜「右上角 16%×7%」十一家里只对两三家;
    这批猜 15%、又猜 17%,擦出来都是半截的(「JIIJNXU」「顺旭塑业」还留着)。
    半截擦除比不擦更难看。

    改成量:在左上角一块里找接近纯白、大小像笔画的连通域,取它们的并集外接框,
    四周留一点余量。标多大就擦多大,不多不少。找不到就返回 None,整张不动。
    """
    a = np.asarray(im.convert("RGB"))
    h, w = a.shape[:2]
    ph, pw = int(h * 0.20), int(w * 0.42)      # 搜索区放宽,免得标本身超出去
    g = cv2.cvtColor(a[:ph, :pw], cv2.COLOR_RGB2GRAY)
    bright = (g > 220).astype(np.uint8)
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((5, 25), np.uint8))  # 把字连成行
    n, _, st, _ = cv2.connectedComponentsWithStats(bright, 8)
    boxes = [st[k] for k in range(1, n) if 60 < st[k, 4] < pw * ph * 0.35]
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes); y1 = max(b[1] + b[3] for b in boxes)
    if (x1 - x0) < w * 0.04 or (y1 - y0) < h * 0.015:
        return None                              # 太小,多半是高光不是字
    m = max(6, int(min(w, h) * 0.012))
    return (max(0, x0 - m), max(0, y0 - m), min(pw, x1 + m), min(ph, y1 + m))


def has_logo(im: Image.Image) -> float:
    """左上角厂标的分数,越高越可能有标。
       顺旭的标是白色字母加白色中文小字,压在渐变棚拍背景上 ——
       所以判据是「左上角有没有一簇接近纯白、又成笔画状的像素」。

       为什么不再走修补:实测把遮盖框放到 17%×10% 之后,擦出来是半截的
       (「JIIJNXU」「顺旭塑业」还在),而半截擦除比不擦更难看。
       每个商品有五到九张主图,其中通常有不带标的版本 —— 挑一张比修一张稳得多。
       今晚在图册那批上,同一个错我已经犯过两次。"""
    a = np.asarray(im.convert("RGB"))
    h, w = a.shape[:2]
    box = a[: int(h * 0.13), : int(w * 0.30)]
    if box.size == 0:
        return 0.0
    g = cv2.cvtColor(box, cv2.COLOR_RGB2GRAY)
    bright = (g > 225).astype(np.uint8)
    if bright.mean() < 0.004:
        return 0.0
    n, _, st, _ = cv2.connectedComponentsWithStats(bright, 8)
    strokes = sum(1 for k in range(1, n) if 12 < st[k, 4] < 2500)
    return float(strokes) + bright.mean() * 100


def logo_removable(im: Image.Image) -> tuple[bool, float]:
    """判断量到的那块能不能干净修掉:看它右边与下边紧邻的背景是否平坦。
       平坦(纯色或缓渐变)就修得掉;紧邻处本身有瓶子或硬边,修了会糊,宁可留着让人看。"""
    box = logo_box(im)
    if box is None:
        return False, 0.0
    a = np.asarray(im.convert("RGB"))
    h, w = a.shape[:2]
    x0, y0, x1, y1 = box
    ring = np.concatenate([
        a[y0:y1, x1:min(w, x1 + (x1 - x0))].reshape(-1, 3),
        a[y1:min(h, y1 + (y1 - y0)), x0:x1].reshape(-1, 3),
    ]) if x1 < w and y1 < h else np.zeros((1, 3))
    flat = float(ring.std(axis=0).mean())
    # 阈值一开始定 14,结果一次都没触发:这些是棚拍渐变背景带阴影,实测 16–36 全部超标。
    # 渐变对 TELEA 修补其实很友好(它就是按邻域推),真正修不了的是紧邻处有瓶身或硬边。
    # 所以放到 48,只挡住「logo 压在物体上」这种情况。
    return flat < 48.0, flat


def strip_logo(im: Image.Image) -> Image.Image:
    """按周围内容补掉量到的那块。不是打码 —— 打码比 logo 还难看。"""
    box = logo_box(im)
    if box is None:
        return im
    a = np.asarray(im.convert("RGB")).copy()
    h, w = a.shape[:2]
    x0, y0, x1, y1 = box
    m = np.zeros((h, w), np.uint8)
    m[y0:y1, x0:x1] = 1
    return Image.fromarray(cv2.inpaint(a, m, 7, cv2.INPAINT_NS))


def square(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), (255, 255, 255))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def sheet(items, out_path, cell=250, cols=8):
    rows = math.ceil(len(items) / cols)
    s = Image.new("RGB", (cols * cell, rows * (cell + 26)), "white")
    d = ImageDraw.Draw(s)
    for i, (im, lines) in enumerate(items):
        x, y = (i % cols) * cell, (i // cols) * (cell + 26)
        s.paste(square(im, cell - 6), (x + 3, y + 3))
        d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(224, 224, 224))
        for k, ln in enumerate(lines[:2]):
            d.text((x + 4, y + cell + 3 + k * 11), ln[:40], fill=(70, 70, 70))
    s.save(out_path, quality=86)
    return s.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--supplier", default="广州市顺旭塑料科技有限公司")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--per", type=int, default=2, help="每个商品进联系表几张")
    a = ap.parse_args()
    if not (a.probe or a.commit):
        a.probe = True

    pre, slug = PREFIX.get(a.supplier, ("XX", "unknown"))
    base = os.path.join(SRC, a.supplier)
    if not os.path.isdir(base):
        print(f"找不到目录:{base}")
        return

    dirs = sorted(d for d in os.listdir(base)
                  if os.path.isdir(os.path.join(base, d)) and d not in SKIP_DIRS)
    print(f"[{a.supplier}·{pre}] {len(dirs)} 个商品\n")

    picked, index, nkept, ndrop = [], [], 0, 0
    for i, d in enumerate(dirs, 1):
        info = parse_title(d)
        mains = sorted(glob.glob(os.path.join(base, d, "主图*.*")))
        details = glob.glob(os.path.join(base, d, "详情*.*"))
        code = f"{pre}-{i:03d}"
        kept, drops = [], []
        for f in mains:
            try:
                im = Image.open(f)
            except Exception:
                continue
            why = screen(im)
            (drops if why else kept).append((os.path.basename(f), why) if why else (im, os.path.basename(f)))
        nkept += len(kept); ndrop += len(drops)
        caps = "/".join(info["capacities"]) or "—"
        nclean = sum(1 for im, _ in kept if has_logo(im) < 6)
        print(f"  {code}  {info['type']:<14} {caps:<26} 主图 {len(mains)} → 可用 {len(kept)}"
              f"(其中干净 {nclean})  详情 {len(details)}(丢)"
              + ("  ← 无干净图" if nclean == 0 and kept else ""))
        for nm, why in drops[:2]:
            print(f"          ✗ {nm:<14} {why}")
        scored = sorted(((has_logo(im), im, nm) for im, nm in kept), key=lambda x: x[0])
        clean = [x for x in scored if x[0] < 6]
        info["clean_shots"] = [nm for _, _, nm in clean]
        info["logo_shots"] = [nm for sc, _, nm in scored if sc >= 6]
        dirty = [x for x in scored if x[0] >= 6]
        if dirty:
            sc, im, nm = dirty[0]
            box = logo_box(im)
            picked.append((im, [f"{code} 原图(有厂标)", f"{nm} · {caps}"]))
            picked.append((strip_logo(im),
                           [f"{code} 擦除后", f"框 {box}" if box else "没量到标,未动"]))
        elif clean:
            sc, im, nm = clean[0]
            picked.append((im, [f"{code} · 本来就干净", f"{nm} · {caps}"]))
        index.append({"code": code, "dir": d, **info,
                      "kept": [nm for _, nm in kept], "dropped": [n for n, _ in drops]})

    print(f"\n合计:主图留 {nkept} 张,判掉 {ndrop} 张,详情图一律不取")
    if a.probe:
        out = os.path.join(ROOT, "tools", f"packlocal-probe-{pre}.jpg")
        print(f"联系表:{out}  {sheet(picked, out)}")
        json.dump(index, open(os.path.join(ROOT, "tools", f"packlocal-{pre}.json"), "w",
                              encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"清单:tools/packlocal-{pre}.json")
        return
    print("[commit] 等联系表确认后再开")


if __name__ == "__main__":
    main()
