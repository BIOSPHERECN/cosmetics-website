#!/usr/bin/env python3
"""AI 图 → 产品库(R2 + D1)。

按时间最早的顺序,把 A:\\0产品库\\0帛卉产品集\\AI图 里的产品图片
上传到 biosphere-ai.com 产品库。

每款:
  1. 从文件夹名解析中英双语名称
  2. 第一张图转 webp → R2(bohui-photo/media/product/{slug}.webp)
  3. 写 media 表(r2_key, alt_zh, alt_en)
  4. 写 products 表(moq='3,000', status='published')
  5. 写 product_i18n 表(中英双语)
  6. 关联 cover_media

纪律:
  · MOQ 统一 3,000(创始人 2026-10-20 要求)
  · 预留价格(不写死,后台填)
  · status='published'(直接上架)
  · 第一张图做封面,其余图也传上去(product_media)
  · 可重跑(已存在的 slug 跳过)

用法:
  python tools/product-ai-images.py           只扫描+预览,不上传
  python tools/product-ai-images.py --apply   上传 R2 + 写 D1
"""
import argparse
import io
import json
import os
import re
import sys
import subprocess
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import E, d1, d1_exec, _q, _wenv  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = r"A:\0产品库\0帛卉产品集\AI图"
PREFIX = "media/product/"
BUCKET = "bohui-photo"
SITE_ID = "biosphere-ai"

# 品类推断(从产品名关键词)
CAT_RULES = [
    (r"sun|spf|防晒", "suncare"),
    (r"toothpaste|牙膏|牙片|漱口|oral|口腔", "oral"),
    (r"shampoo|洗发|hair|护发|头皮", "haircare"),
    (r"lip|唇", "makeup"),
    (r"foot|足|足膜|足霜", "body"),
    (r"hand|手|护手", "body"),
    (r"bath|浴盐|磨砂|scrub|peeling", "body"),
    (r"cream|lotion|serum|essence|面霜|精华|乳|oil|润肤|collagen|胶原|acne|祛痘|whitening|亮肤|美白|hydrating|保湿|repair|修护", "skincare"),
    (r"hair.*removal|脱毛", "body"),
]
DEFAULT_CAT = "skincare"


def guess_category(name):
    n = name.lower()
    for pat, cat in CAT_RULES:
        if re.search(pat, n, re.I):
            return cat
    return DEFAULT_CAT


def slugify(text, used):
    """英文产品名 → slug。"""
    s = re.sub(r"[^a-zA-Z0-9-]+", "-", text.strip().lower()).strip("-")
    if not s:
        s = "product"
    base, i = s, 1
    while s in used:
        i += 1
        s = f"{base}-{i}"
    used.add(s)
    return s


def parse_dirname(name):
    """从文件夹名解析中英双语名称。

    命名模式:
      "5X Acne Clear Cream"  (纯英文)
      "3X Sport Ultra Protection Sun Block SPF90 120g 3X 户外运动高倍防晒霜 120g" (英+中)
      "4X Cherry Lip Serum 10g｜4X 樱桃润唇精华" (｜分隔)
      "7X VC Underarm Whitening Cream 25g 金色棱面高盖便携装" (英+中文描述)
    """
    # 先试 ｜ 分隔
    if "｜" in name:
        parts = name.split("｜")
        en = parts[0].strip()
        zh = parts[1].strip() if len(parts) > 1 else en
        return en, zh

    # 找中文开始的位置
    m = re.match(r"^(.*?)([㐀-鿿].*)$", name)
    if m:
        en = m.group(1).strip()
        zh = m.group(2).strip()
        # 如果英文部分太短(只有数字+X),从中文里提取
        if len(en) < 3:
            en = zh  # fallback
        return en, zh

    # 纯英文
    return name.strip(), name.strip()


def to_webp(src_path, out_path):
    """转 webp,长边压到 1600。"""
    from PIL import Image
    im = Image.open(src_path)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > 1600:
        s = 1600 / max(w, h)
        im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
    im.save(out_path, "WEBP", quality=82, method=5)
    return im.size


def upload_r2(local_path, key):
    """上传到 R2。"""
    web = os.path.join(ROOT, "apps", "web")
    r = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
         "--file", local_path, "--content-type", "image/webp", "--remote"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=web, env=_wenv(), shell=(os.name == "nt"))
    return "Upload complete" in (r.stdout or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="上传 R2 + 写 D1")
    a = ap.parse_args()

    if not os.path.isdir(SRC):
        print(f"目录不存在: {SRC}")
        sys.exit(1)

    # 扫描产品文件夹
    products = []
    used_slugs = {r["slug"] for r in d1(
        "SELECT slug FROM products WHERE site_id='biosphere-ai'")} if d1(
        "SELECT slug FROM products WHERE site_id='biosphere-ai' LIMIT 1") else set()

    for name in os.listdir(SRC):
        full = os.path.join(SRC, name)
        if not os.path.isdir(full):
            continue
        files = sorted([os.path.join(full, f) for f in os.listdir(full)
                       if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))])
        if not files:
            continue
        earliest = min(os.path.getmtime(f) for f in files)
        en_name, zh_name = parse_dirname(name)
        slug = slugify(en_name, used_slugs)
        cat = guess_category(en_name + " " + zh_name)
        products.append({
            "dir": name,
            "slug": slug,
            "en": en_name,
            "zh": zh_name,
            "category": cat,
            "files": files,
            "earliest": earliest,
        })

    products.sort(key=lambda p: p["earliest"])

    print(f"扫描完成: {len(products)} 款产品, {sum(len(p['files']) for p in products)} 张图")
    print()
    for i, p in enumerate(products):
        tstr = datetime.fromtimestamp(p["earliest"]).strftime("%m-%d %H:%M")
        print(f"  {i+1:3d}. [{tstr}] {p['category']:10} {p['zh'][:30]:30} | {p['en'][:45]} | {len(p['files'])}张")
    print()

    if not a.apply:
        print("加 --apply 才上传 R2 并写 D1")
        return

    # 上传 + 写库
    tmp = os.path.join(HERE, ".product-ai")
    os.makedirs(tmp, exist_ok=True)

    # 先获取当前最大 id
    max_id_rows = d1("SELECT MAX(id) m FROM products WHERE site_id='biosphere-ai'")
    base_id = (max_id_rows[0]["m"] if max_id_rows and max_id_rows[0]["m"] else 0) + 1
    sort_base = 3000  # 新产品从 3000 开始排

    sql_lines = []
    up_ok, up_fail = 0, []

    for i, p in enumerate(products):
        pid = base_id + i
        sort_order = sort_base + i * 10
        cover_key = f"{PREFIX}{p['slug']}.webp"

        # 转码第一张图
        cover_src = p["files"][0]
        cover_local = os.path.join(tmp, f"{p['slug']}.webp")
        try:
            w, h = to_webp(cover_src, cover_local)
        except Exception as e:
            print(f"  ✗ 转码失败 {p['slug']}: {str(e)[:60]}")
            up_fail.append((p["slug"], f"转码: {str(e)[:60]}"))
            continue

        # 上传到 R2
        if upload_r2(cover_local, cover_key):
            up_ok += 1
        else:
            up_fail.append((p["slug"], "R2 上传失败"))
            continue

        # SQL: products
        sql_lines.append(
            f"INSERT INTO products (id, site_id, slug, category, moq, is_featured, "
            f"sort_order, status, updated_at, internal_note) VALUES "
            f"({pid}, {_q(SITE_ID)}, {_q(p['slug'])}, {_q(p['category'])}, '3,000', 0, "
            f"{sort_order}, 'published', datetime('now'), 'AI图产品库 2026-10-20') "
            f"ON CONFLICT(site_id, slug) DO UPDATE SET category=excluded.category, "
            f"moq=excluded.moq, status=excluded.status, updated_at=datetime('now');")

        # SQL: media
        sql_lines.append(
            f"INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, "
            f"folder, alt_zh, alt_en, driver, creator, created_at) VALUES "
            f"({_q(cover_key)}, {_q(p['slug'] + '.webp')}, 'image/webp', "
            f"{os.path.getsize(cover_local)}, {w}, {h}, 'AI图产品库 2026-10', "
            f"{_q(p['zh'])}, {_q(p['en'])}, 'r2', 'AI图产品库', datetime('now'));")

        # SQL: cover_media
        sql_lines.append(
            f"UPDATE products SET cover_media = (SELECT id FROM media WHERE r2_key = "
            f"{_q(cover_key)}), updated_at = datetime('now') WHERE site_id='biosphere-ai' "
            f"AND slug = {_q(p['slug'])};")

        # SQL: product_media
        sql_lines.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"SELECT p.id, m.id, 0 FROM products p, media m WHERE p.site_id='biosphere-ai' "
            f"AND p.slug = {_q(p['slug'])} AND m.r2_key = {_q(cover_key)};")

        # SQL: product_i18n (中英双语)
        for lang, name_val in (("zh-cn", p["zh"]), ("en", p["en"])):
            summary = f"AI 生成产品图" if lang == "zh-cn" else "AI generated product image"
            desc = (f"产品名:{p['zh']}。" if lang == "zh-cn"
                   else f"Product: {p['en']}.")
            sql_lines.append(
                f"INSERT INTO product_i18n (product_id, lang, name, summary, description, "
                f"specs_json, highlights_json, mt) VALUES "
                f"((SELECT id FROM products WHERE slug={_q(p['slug'])} AND site_id='biosphere-ai'), "
                f"{_q(lang)}, {_q(name_val)}, {_q(summary)}, {_q(desc)}, '[]', '[]', 0) "
                f"ON CONFLICT(product_id, lang) DO UPDATE SET name=excluded.name, "
                f"summary=excluded.summary, description=excluded.description;")

        # 其余图也上传(作为 product_media)
        for j, img_path in enumerate(p["files"][1:], 1):
            extra_slug = f"{p['slug']}-{j+1}"
            extra_key = f"{PREFIX}{extra_slug}.webp"
            extra_local = os.path.join(tmp, f"{extra_slug}.webp")
            try:
                ew, eh = to_webp(img_path, extra_local)
                if upload_r2(extra_local, extra_key):
                    sql_lines.append(
                        f"INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, "
                        f"folder, alt_zh, alt_en, driver, creator, created_at) VALUES "
                        f"({_q(extra_key)}, {_q(extra_slug + '.webp')}, 'image/webp', "
                        f"{os.path.getsize(extra_local)}, {ew}, {eh}, 'AI图产品库 2026-10', "
                        f"{_q(p['zh'])}, {_q(p['en'])}, 'r2', 'AI图产品库', datetime('now'));")
                    sql_lines.append(
                        f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
                        f"SELECT p.id, m.id, {j} FROM products p, media m WHERE p.site_id='biosphere-ai' "
                        f"AND p.slug = {_q(p['slug'])} AND m.r2_key = {_q(extra_key)};")
            except Exception:
                pass  # 非封面图失败不阻断

        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(products)} · R2 成功 {up_ok} · 失败 {len(up_fail)}", flush=True)

    print(f"\nR2 上传完成: 成功 {up_ok} · 失败 {len(up_fail)}")
    for slug, why in up_fail[:5]:
        print(f"    ✗ {slug}: {why}")

    if up_fail:
        print("有失败的不写库")
        sys.exit(1)

    # 写 SQL 文件并灌库
    sql_path = os.path.join(HERE, "_product-ai-images.sql")
    with io.open(sql_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(";\n".join(sql_lines) + ";\n")
    print(f"\nSQL {os.path.getsize(sql_path):,} 字节")
    rows = d1_exec(sql_path)
    print(f"写入 {rows:,} 行")

    # 统计
    n_total = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai'")
    n_cover = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND cover_media IS NOT NULL")
    n_pub = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND status='published'")
    print(f"\n完成: 共 {n_total[0]['n'] if n_total else '?'} 款 · "
          f"有封面 {n_cover[0]['n'] if n_cover else '?'} 款 · "
          f"已上架 {n_pub[0]['n'] if n_pub else '?'} 款")


if __name__ == "__main__":
    main()
