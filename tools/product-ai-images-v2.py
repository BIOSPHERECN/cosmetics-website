#!/usr/bin/env python3
"""AI 图 → WEBP → R2(AI产品图/) → 产品库。

把 A:\0产品库\0帛卉产品集\AI图 里的产品图片(按目录分产品)
转成 WEBP 存到 A:\0产品库\0帛卉产品集\AI图webp,
用 boto3(S3 兼容)并发上传到 R2 的 media/product/AI产品图/ 目录,
写入 D1 产品库(is_showcase=1 → 前台 /portfolio/ 展示)。

用法:
  python tools/product-ai-images-v2.py           只扫描+预览
  python tools/product-ai-images-v2.py --apply   转换+上传+写库
"""
import argparse
import io
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import E, d1, d1_exec, _q  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = r"A:\0产品库\0帛卉产品集\AI图"
OUT = r"A:\0产品库\0帛卉产品集\AI图webp"
PREFIX = "media/product/aip/"   # 纯英文路径:R2 KEY 与 D1 r2_key 完全一致, 避免中文编码不一致
BUCKET = "bohui-photo"
SITE_ID = "biosphere-ai"

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
    if "｜" in name:
        parts = name.split("｜")
        en = parts[0].strip()
        zh = parts[1].strip() if len(parts) > 1 else en
        return en, zh
    m = re.match(r"^(.*?)([㐀-鿿].*)$", name)
    if m:
        en = m.group(1).strip()
        zh = m.group(2).strip()
        if len(en) < 3:
            en = zh
        return en, zh
    return name.strip(), name.strip()


def to_webp(src_path, out_path):
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


# ---------- R2 上传 ----------
def _r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{E['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
    )

_R2 = _r2_client()


def _put_one(local, key):
    """用 put_object 显式指定 Bucket，避免 upload_fileobj 参数位置混淆"""
    try:
        with open(local, "rb") as f:
            _R2.put_object(Bucket=BUCKET, Key=key, Body=f, ContentType="image/webp")
        return True, None
    except Exception as e:
        return False, str(e)[:120]


def upload_all(local_keys, max_workers=8):
    """并发上传 (local, key) 列表。返回 (成功数, 失败[(key,err)])"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    ok, fail = 0, []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(_put_one, l, k): k for l, k in local_keys}
        for fut in as_completed(futs):
            k = futs[fut]
            success, err = fut.result()
            if success:
                ok += 1
            else:
                fail.append((k, err))
    return ok, fail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    if not os.path.isdir(SRC):
        print(f"目录不存在: {SRC}")
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)

    # 扫描产品文件夹
    products = []
    used_slugs = {r["slug"] for r in d1("SELECT slug FROM products WHERE site_id='biosphere-ai'")}

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
            "dir": name, "slug": slug, "en": en_name, "zh": zh_name,
            "category": cat, "files": files, "earliest": earliest,
        })

    products.sort(key=lambda p: p["earliest"])
    print(f"扫描完成: {len(products)} 款产品, {sum(len(p['files']) for p in products)} 张图")
    print()

    if not a.apply:
        print("加 --apply 才转换+上传+写库")
        return

    from concurrent.futures import ThreadPoolExecutor, as_completed

    # 1) 全量转码 webp(多线程并发,跳过已存在)
    conv_tasks = []  # (src, out)
    for p in products:
        conv_tasks.append((p["files"][0], os.path.join(OUT, f"{p['slug']}.webp")))
        for j, img in enumerate(p["files"][1:], 1):
            conv_tasks.append((img, os.path.join(OUT, f"{p['slug']}-{j+1}.webp")))
    print(f"转码任务: {len(conv_tasks)} 张 ...", flush=True)

    def _conv(src_out):
        src, out = src_out
        if os.path.exists(out) and os.path.getsize(out) > 0:
            return True
        try:
            to_webp(src, out)
            return True
        except Exception as e:
            print(f"  转码失败 {os.path.basename(out)}: {str(e)[:60]}")
            return False

    ok_c = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for r in ex.map(_conv, conv_tasks):
            ok_c += 1 if r else 0
    print(f"转码完成: {ok_c}/{len(conv_tasks)}", flush=True)

    # 2) 并发上传 R2
    up_tasks = []  # (local, key)
    for p in products:
        up_tasks.append((os.path.join(OUT, f"{p['slug']}.webp"), f"{PREFIX}{p['slug']}.webp"))
        for j in range(1, len(p['files'])):
            up_tasks.append((os.path.join(OUT, f"{p['slug']}-{j+1}.webp"),
                            f"{PREFIX}{p['slug']}-{j+1}.webp"))
    up_tasks = [(l, k) for l, k in up_tasks if os.path.exists(l)]
    print(f"上传 R2: {len(up_tasks)} 张 ...", flush=True)
    up_ok, up_fail = upload_all(up_tasks, max_workers=8)
    print(f"R2 上传: 成功 {up_ok} · 失败 {len(up_fail)}", flush=True)
    for k, why in up_fail[:5]:
        print(f"    ✗ {k}: {why}")

    # 3) 生成 SQL(products 带 is_showcase=1)
    max_id_rows = d1("SELECT MAX(id) m FROM products WHERE site_id='biosphere-ai'")
    base_id = (max_id_rows[0]["m"] if max_id_rows and max_id_rows[0]["m"] else 0) + 1
    sort_base = 3000

    all_sql = []
    for i, p in enumerate(products):
        pid = base_id + i
        sort_order = sort_base + i * 10
        cover_key = f"{PREFIX}{p['slug']}.webp"
        cover_out = os.path.join(OUT, f"{p['slug']}.webp")
        if not os.path.exists(cover_out):
            continue
        sz = os.path.getsize(cover_out)
        # 从已转好的 webp 读尺寸(转码跳过时 w/h 未赋值)
        try:
            from PIL import Image
            _im = Image.open(cover_out)
            w, h = _im.size
        except Exception:
            w, h = 0, 0

        # products (is_showcase=1)
        all_sql.append(
            f"INSERT INTO products (id, site_id, slug, category, moq, is_featured, is_showcase, "
            f"sort_order, status, updated_at, internal_note) VALUES "
            f"({pid}, {_q(SITE_ID)}, {_q(p['slug'])}, {_q(p['category'])}, '3,000', 0, 1, "
            f"{sort_order}, 'published', datetime('now'), 'AI图产品库 2026-10-20') "
            f"ON CONFLICT(site_id, slug) DO UPDATE SET category=excluded.category, "
            f"moq=excluded.moq, is_showcase=excluded.is_showcase, status=excluded.status, updated_at=datetime('now')")

        # media cover
        all_sql.append(
            f"INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, "
            f"folder, alt_zh, alt_en, driver, creator, created_at) VALUES "
            f"({_q(cover_key)}, {_q(p['slug'] + '.webp')}, 'image/webp', {sz}, {w}, {h}, "
            f"'AI图产品库 2026-10', {_q(p['zh'])}, {_q(p['en'])}, 'r2', 'AI图产品库', datetime('now'))")

        # cover_media
        all_sql.append(
            f"UPDATE products SET cover_media = (SELECT id FROM media WHERE r2_key = "
            f"{_q(cover_key)}), updated_at = datetime('now') WHERE site_id='biosphere-ai' "
            f"AND slug = {_q(p['slug'])}")

        # product_media cover
        all_sql.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"SELECT p.id, m.id, 0 FROM products p, media m WHERE p.site_id='biosphere-ai' "
            f"AND p.slug = {_q(p['slug'])} AND m.r2_key = {_q(cover_key)}")

        # i18n
        for lang, name_val in (("zh-cn", p["zh"]), ("en", p["en"])):
            summary = p["zh"] if lang == "zh-cn" else p["en"]
            desc = f"产品名:{p['zh']}。" if lang == "zh-cn" else f"Product: {p['en']}."
            all_sql.append(
                f"INSERT INTO product_i18n (product_id, lang, name, summary, description, "
                f"specs_json, highlights_json, mt) VALUES "
                f"((SELECT id FROM products WHERE slug={_q(p['slug'])} AND site_id='biosphere-ai'), "
                f"{_q(lang)}, {_q(name_val)}, {_q(summary)}, {_q(desc)}, '[]', '[]', 0) "
                f"ON CONFLICT(product_id, lang) DO UPDATE SET name=excluded.name, "
                f"summary=excluded.summary, description=excluded.description")

        # 附加图 media + product_media
        for j in range(1, len(p['files'])):
            eslug = f"{p['slug']}-{j+1}"
            ekey = f"{PREFIX}{eslug}.webp"
            eout = os.path.join(OUT, f"{eslug}.webp")
            if not os.path.exists(eout):
                continue
            all_sql.append(
                f"INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, "
                f"folder, alt_zh, alt_en, driver, creator, created_at) VALUES "
                f"({_q(ekey)}, {_q(eslug + '.webp')}, 'image/webp', {os.path.getsize(eout)}, 0, 0, "
                f"'AI图产品库 2026-10', {_q(p['zh'])}, {_q(p['en'])}, 'r2', 'AI图产品库', datetime('now'))")
            all_sql.append(
                f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
                f"SELECT p.id, m.id, {j} FROM products p, media m WHERE p.site_id='biosphere-ai' "
                f"AND p.slug = {_q(p['slug'])} AND m.r2_key = {_q(ekey)}")

    print(f"\nSQL 语句: {len(all_sql)} 条", flush=True)

    # 4) 分片灌库(每批 20 条,避免 D1_RESET_DO)
    batch_size = 10
    total_ok = 0
    total_fail = 0
    for bi in range(0, len(all_sql), batch_size):
        batch = all_sql[bi:bi+batch_size]
        bpath = os.path.join(HERE, f"_pai_batch_{bi//batch_size}.sql")
        with io.open(bpath, "w", encoding="utf-8", newline="\n") as f:
            f.write(";\n".join(batch) + ";\n")
        rows = d1_exec(bpath)
        if rows > 0:
            total_ok += len(batch)
        else:
            # 单条重试
            for stmt in batch:
                sp = bpath + ".s.sql"
                with io.open(sp, "w", encoding="utf-8", newline="\n") as f:
                    f.write(stmt + ";\n")
                r2 = d1_exec(sp)
                if r2 > 0:
                    total_ok += 1
                else:
                    total_fail += 1
                    print(f"  FAIL: {stmt[:70]}")
        if (bi // batch_size) % 50 == 0:
            print(f"  batch {bi//batch_size}/{len(all_sql)//batch_size} · 累计 {total_ok}", flush=True)
    print(f"灌库: 成功 {total_ok}/{len(all_sql)} · 失败 {total_fail}", flush=True)

    # 5) 统计校验
    n_total = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai'")
    n_ai = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND internal_note LIKE '%AI%'")
    n_show = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND is_showcase=1")
    n_cover = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND cover_media IS NOT NULL")
    print(f"\nD1 校验: 总 {n_total[0]['n']} · AI图 {n_ai[0]['n']} · is_showcase=1 {n_show[0]['n']} · 有封面 {n_cover[0]['n']}")


if __name__ == "__main__":
    main()
