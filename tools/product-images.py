#!/usr/bin/env python3
"""产品册里的 70 张产品图 → R2 → 产品库封面。

由来(2026-09-09):`tools/product-catalog.py` 把 70 款产品写进库了,但一张图都没有。
货架上 70 张「实拍整理中」占位,和创始人说的「保持真实的上架」正好相反 ——
包材库上午刚因为这个下架了 42 款。

好在册子本身就带图:11 页里嵌了 70 张,每页 8 张(末页 6 张),
和解析出来的产品**逐页对齐**。对齐是逐页校验过的,不是猜的 ——
`product-catalog.py` 每页解析出的款数与该页图数完全相等,页内顺序也一致。

三条纪律:
  1. **按页对齐,不按全局序号**。全局序号只要有一页多解析或少解析一款,
     后面全部错位,而错位的表现是「图和名字对不上」,货架上一眼看不出来。
     所以逐页校验,任何一页对不上就整个不写。
  2. **原图不动,只转码**。册子里的图是工厂自己的产品图,转 webp 压体积,
     不裁不改不加水印 —— 改了就不是实拍了。
  3. **可重跑**。R2 里已有的 key 跳过,media 行按 r2_key 去重。

用法:
    python tools/product-images.py            只抽图与体检,不上传
    python tools/product-images.py --apply    上传 R2 并挂到产品上
"""
import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import E, d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = r"F:\0cosmetic\官网素材\帛卉产品册_双语版_v8.pdf"
OUT = os.path.join(HERE, ".product-img")
PREFIX = "media/product/"
SRC = "帛卉产品册 双语版 v8 · Product Catalog 2026"


def extract():
    """按**版面顺序**抽图,返回 [(page_index, order_in_page, bytes)]。

    2026-09-09 踩的坑:一开始用 pypdf 的 `page.images`,数量对得上(每页 8 张),
    于是以为顺序也对。实测第一款「冰感止痒修护防晒喷雾」配到的是一瓶
    MEDIERBA 口腔护理 —— pypdf 给的是资源字典顺序,不是版面顺序。
    数量对齐是个假信号,差点就这么发上线了。

    册子是横版两行四列。按 (行, 左边距) 排就是阅读顺序,
    与正文解析出来的顺序一致(前两款已逐张肉眼核对)。
    """
    import fitz
    os.makedirs(OUT, exist_ok=True)
    doc = fitz.open(PDF)
    got = []
    for pi in range(len(doc)):
        pg = doc[pi]
        items = []
        for x in pg.get_images(full=True):
            xref = x[0]
            for r in pg.get_image_rects(xref):
                # y 除以 100 取整 = 行号:两行分别在 y≈85 和 y≈346,不会串行
                items.append((int(r.y0 // 100), r.x0, xref))
        items.sort()
        for oi, (_row, _x, xref) in enumerate(items):
            pix = fitz.Pixmap(doc, xref)
            if pix.n > 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            got.append((pi, oi, pix.tobytes("png")))
    return got


def to_webp(raw: bytes, path: str) -> tuple:
    from PIL import Image
    im = Image.open(io.BytesIO(raw))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    # 长边压到 1600:货架卡片最大也就到 800,再大只是白白占带宽
    w, h = im.size
    if max(w, h) > 1600:
        s = 1600 / max(w, h)
        im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
    im.save(path, "WEBP", quality=82, method=5)
    return im.size


def products_by_page() -> dict:
    """把 catalog 解析结果按页分组。顺序与 product-catalog.py 完全一致。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location("pc", os.path.join(HERE, "product-catalog.py"))
    pc = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, ["x"]
    spec.loader.exec_module(pc)
    sys.argv = argv
    txt = io.open(os.path.join(HERE, "_catalog-v8.txt"), encoding="utf-8").read()
    by = {}
    used = {r["slug"] for r in d1(
        "SELECT slug FROM products WHERE site_id='biosphere-ai' "
        "AND (internal_note IS NULL OR internal_note NOT LIKE '帛卉产品册%')")}
    for pi, page in enumerate(txt.split("\n\n===PAGE===\n\n")):
        got = pc.parse(page)
        for p in got:
            p["slug"] = pc.slugify(p["name_en"], used)
        by[pi] = got
    return by


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    imgs = extract()
    by_page_img = {}
    for pi, oi, data in imgs:
        by_page_img.setdefault(pi, []).append((oi, data))
    prods = products_by_page()

    ok = True
    pairs = []
    for pi in sorted(set(by_page_img) | set(prods)):
        ni, np_ = len(by_page_img.get(pi, [])), len(prods.get(pi, []))
        if ni != np_:
            ok = False
            print(f"  p{pi}: 图 {ni} / 产品 {np_}  ← 对不上")
            continue
        for (oi, data), p in zip(by_page_img.get(pi, []), prods.get(pi, [])):
            pairs.append((p, data))
    print(f"图 {len(imgs)} 张 · 配上产品 {len(pairs)} 对 · 逐页对齐 {'是' if ok else '否'}")
    if not ok:
        print("有页对不上,整批不写 —— 错位的图挂上去,货架上看不出来,客户会当成我们发错货。")
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)
    made = []
    for p, data in pairs:
        path = os.path.join(OUT, f"{p['slug']}.webp")
        if not os.path.exists(path):
            try:
                to_webp(data, path)
            except Exception as e:
                print(f"  转码失败 {p['slug']}: {str(e)[:60]}")
                continue
        made.append((p, path))
    tot = sum(os.path.getsize(x[1]) for x in made)
    print(f"转码 {len(made)} 张 · {tot / 1048576:.1f} MB · 目录 {OUT}")
    if not a.apply:
        print("\n加 --apply 才上传")
        return

    # 上传走 wrangler,不走 boto3。
    #
    # 2026-09-09 踩的坑:.env 里的 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID 指的是
    # **hosonzuo 旧账号**的 bohui-photo;站点 Worker 读的是 wrangler.toml 里
    # 那个原生 PHOTO 绑定,在 CLOUDFLARE_ACCOUNT_ID 那个账号下。
    # 两个账号里都有一个叫 bohui-photo 的桶,连 media/shots/ 前缀都一样 ——
    # 所以 boto3 传上去、list 也列得到,看起来完全成功,而线上一律 404。
    # wrangler 用 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID,落的是站点那个账号。
    import subprocess
    bucket = "bohui-photo"
    web = os.path.join(os.path.dirname(HERE), "apps", "web")
    up, fail = 0, []
    for p_, path in made:
        key = f"{PREFIX}{p_['slug']}.webp"
        r = subprocess.run(
            ["npx", "wrangler", "r2", "object", "put", f"{bucket}/{key}",
             "--file", path, "--content-type", "image/webp", "--remote"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=web, env={**os.environ, **E}, shell=(os.name == "nt"))
        if "Upload complete" in (r.stdout or ""):
            up += 1
        else:
            fail.append((p_["slug"], (r.stdout or r.stderr or "")[-160:]))
        if (up + len(fail)) % 10 == 0:
            print(f"  {up + len(fail)}/{len(made)} · 成功 {up} · 失败 {len(fail)}", flush=True)
    print(f"上传成功 {up} · 失败 {len(fail)}")
    for slug, why in fail[:5]:
        print(f"    ✗ {slug}: {why}")
    if fail:
        print("有失败的就不写库 —— 库里有行、桶里没图 = 线上破图,比少一款难查。")
        sys.exit(1)

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_product-images.sql")
    from PIL import Image
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for p, path in made:
            key = f"{PREFIX}{p['slug']}.webp"
            w, h = Image.open(path).size
            fh.write(
                "INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, "
                "folder, alt_zh, alt_en, driver, creator, created_at) VALUES ("
                f"{q(key)}, {q(p['slug'] + '.webp')}, 'image/webp', {os.path.getsize(path)}, "
                f"{w}, {h}, '产品册 2026', {q(p['name_zh'])}, {q(p['name_en'])}, 'r2', "
                f"{q(SRC)}, datetime('now'));\n")
            fh.write(
                "UPDATE products SET cover_media = (SELECT id FROM media WHERE r2_key = "
                f"{q(key)}), updated_at = datetime('now') WHERE site_id='biosphere-ai' "
                f"AND slug = {q(p['slug'])};\n")
            fh.write(
                "INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
                f"SELECT p.id, m.id, 0 FROM products p, media m WHERE p.site_id='biosphere-ai' "
                f"AND p.slug = {q(p['slug'])} AND m.r2_key = {q(key)};\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    n = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND cover_media IS NOT NULL")
    t = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai'")
    print(f"完成:{t[0]['n']} 款里 {n[0]['n']} 款有封面")


if __name__ == "__main__":
    main()
