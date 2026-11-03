#!/usr/bin/env python3
"""重排版包材图 —— 裁掉白边,让内容在画布里占同样的比例。

创始人 2026-09-07:「新潮的图片都小,1688 的就大很多」。

量出来的实况(不是感觉):
    新潮 stnewwave  内容边长中位 305px / 900 画布
    顺旭 shunxu     内容边长中位 811px / 900 画布
同一个货架上并排放,新潮那批瓶子小一圈、还发白,像是没货或图没做好。

根因不在源图分辨率上 —— 源站就只有 360×360,试过 _800x800 与 oss resize 都拿不到大图。
根因在处理:上一版只做 `thumbnail(900) + 居中贴白底`,而 thumbnail **只缩不放**,
360px 的图原样贴进 900 画布,四周全是白边。顺旭那批源图本来就大,所以撑满了。

做法:
  1. 找出非白像素的外接框(阈值 245,允许轻微灰底与阴影);
  2. 按外接框裁掉白边;
  3. 等比放大到占画布 82%(和顺旭的 811/900 = 90% 略留余地,避免边缘顶死);
  4. 居中贴回白底,输出 WEBP。

纪律:
  · **只动画面构图,不动像素内容** —— 不锐化、不调色、不去背,只裁与缩放。
  · 内容框异常的跳过:占比已经够大(>70%)不动;找不到内容框(纯白图)不动;
    外接框贴边(说明本来就裁过头)不动。宁可少改几张,不要把好图弄坏。
  · 逐条落盘,可中断续跑;先出本地文件,确认后再上传。

用法:
  python tools/pack-recanvas.py --probe 6        看几张前后对比数字
  python tools/pack-recanvas.py --run            重排本地文件
  python tools/pack-recanvas.py --upload         把重排过的传回 R2
"""
import io
import os
import sys
import json
import time
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, api, preflight   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

IMG_ROOT = r"F:\0cosmetic\_r2迁移中转\media\pack"
LEDGER = os.path.join(ROOT, "tools", "pack-recanvas.json")
CANVAS = 900
FILL = 0.82          # 内容占画布的目标比例
WHITE = 245          # 高于这个亮度算白底
MIN_GAIN = 1.25      # 放大不到这个倍数就不值得动


def load():
    if os.path.exists(LEDGER):
        try:
            return json.load(io.open(LEDGER, encoding="utf-8"))
        except Exception:
            pass
    return {"items": {}}


def save(led):
    tmp = LEDGER + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        json.dumps(led, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, LEDGER)


_lock = threading.Lock()


def content_box(im):
    """非白像素的外接框。用 point 阈值而不是 getbbox() ——
       后者只认纯白,而实拍图的白底常带一点灰。"""
    g = im.convert("L").point(lambda x: 0 if x > WHITE else 255)
    return g.getbbox()


def recanvas(path):
    """返回 (新图 or None, 说明)。不该动的一律返回 None —— 宁可少改。"""
    im = Image.open(path).convert("RGB")
    bb = content_box(im)
    if not bb:
        return None, "纯白图"
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    side = max(w, h)
    if side <= 0:
        return None, "内容框为零"
    ratio = side / max(im.width, im.height)
    if ratio > 0.70:
        return None, f"已占 {ratio:.0%},不必动"
    # 外接框贴到原图边缘 = 本来就被裁过,再放大会切到内容
    if bb[0] <= 1 and bb[1] <= 1 and bb[2] >= im.width - 1 and bb[3] >= im.height - 1:
        return None, "内容贴边"
    target = int(CANVAS * FILL)
    if target / side < MIN_GAIN:
        return None, f"放大仅 {target/side:.2f}×,不值得"

    crop = im.crop(bb)
    scale = target / side
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGB", (CANVAS, CANVAS), (255, 255, 255))
    out.paste(crop, ((CANVAS - nw) // 2, (CANVAS - nh) // 2))
    return out, f"{ratio:.0%} → {FILL:.0%}(放大 {scale:.2f}×)"


def targets(dirs):
    out = []
    for d in dirs:
        p = os.path.join(IMG_ROOT, d)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            if f.endswith(".webp"):
                out.append((d, f[:-5], os.path.join(p, f)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", default="stnewwave", help="处理哪些目录,逗号分隔")
    ap.add_argument("--probe", type=int, default=0)
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--limit", type=int, default=100000)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()

    preflight(need_keys=("CRON_KEY",))
    dirs = [d.strip() for d in a.dirs.split(",") if d.strip()]
    tg = targets(dirs)
    led = load()
    print(f"目录 {', '.join(dirs)} · 本地 {len(tg):,} 张 · 已重排 "
          f"{sum(1 for v in led['items'].values() if v.get('done')):,}")

    if a.upload:
        todo = [(d, c, p) for d, c, p in tg
                if led["items"].get(c, {}).get("done") and not led["items"][c].get("up")]
        print(f"待上传 {len(todo):,} 张")
        ok = fail = 0
        for i, (d, code, p) in enumerate(todo[:a.limit], 1):
            try:
                r = api("/api/cron/r2-copy/", data=io.open(p, "rb").read(),
                        params={"key": f"media/pack/{d}/{code}.webp"},
                        method="POST", content_type="image/webp")
                if r.get("ok"):
                    with _lock:
                        led["items"][code]["up"] = True
                        save(led)
                    ok += 1
                else:
                    fail += 1
            except Exception:
                fail += 1
            if i % 100 == 0:
                print(f"  {i}/{len(todo)} · 成功 {ok} · 失败 {fail}", flush=True)
        print(f"上传:成功 {ok} · 失败 {fail}")
        return

    todo = [(d, c, p) for d, c, p in tg if c not in led["items"]][:(a.probe or a.limit)]
    if not todo:
        print("没有待处理的了")
        return

    t0, n_fix, n_skip = time.time(), 0, 0

    def one(item):
        d, code, p = item
        try:
            img, note = recanvas(p)
        except Exception as e:
            return code, None, f"打不开:{str(e)[:40]}"
        if img is None:
            return code, None, note
        if not a.probe:
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=86, method=4)
            io.open(p, "wb").write(buf.getvalue())
        return code, True, note

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for i, (code, fixed, note) in enumerate(ex.map(one, todo), 1):
            with _lock:
                led["items"][code] = {"done": bool(fixed), "why": note}
                if not a.probe:
                    save(led)
            if fixed:
                n_fix += 1
            else:
                n_skip += 1
            if a.probe:
                print(f"  {code:<24} {'重排' if fixed else '跳过'}  {note}")
            elif i % 200 == 0:
                print(f"  {i}/{len(todo)} · 重排 {n_fix} · 跳过 {n_skip} "
                      f"· {time.time()-t0:.0f} 秒", flush=True)

    print(f"\n本批:重排 {n_fix} · 跳过 {n_skip} · {time.time()-t0:.0f} 秒")
    if a.run:
        print("下一步:python tools/pack-recanvas.py --upload")


if __name__ == "__main__":
    main()
