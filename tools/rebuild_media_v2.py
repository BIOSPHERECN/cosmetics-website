#!/usr/bin/env python3
"""系统性修复: 从 R2 实际对象重建 D1 media + product_media + cover_media

根因: 两次脚本运行产生 key 不一致
  - 第一次: D1 写入 r2_key (slug 不带-2), R2 上传失败
  - 第二次: R2 上传成功 (slug 带-2), D1 没灌库
  - 结果: D1 media r2_key 指向的 R2 对象不存在 → 图片 404

修复: 以 R2 实际对象为准, 重建 D1 media + product_media + cover_media
"""
import sys, os, io, importlib.util, boto3
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, r'F:\0cosmetic\cosmetic-sites\tools')
os.chdir(r'F:\0cosmetic\cosmetic-sites')
spec = importlib.util.spec_from_file_location('bh', r'F:\0cosmetic\cosmetic-sites\tools\_bohui.py')
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1
E = bh.E
_q = bh._q
HERE = r'F:\0cosmetic\cosmetic-sites\tools'
PREFIX = "media/product/AI产品图/"

s3 = boto3.client("s3",
    endpoint_url="https://" + E["R2_ACCOUNT_ID"] + ".r2.cloudflarestorage.com",
    aws_access_key_id=E["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"])

# ── 1. 读取 R2 所有对象 ──
print("1. 读取 R2 对象...")
r2_objects = []
for page in s3.get_paginator("list_objects_v2").paginate(Bucket="bohui-photo", Prefix=PREFIX):
    for obj in page.get("Contents", []):
        r2_objects.append({"key": obj["Key"], "size": obj["Size"]})
print(f"   R2 对象: {len(r2_objects)}")

# ── 2. 解析 slug + seq ──
print("2. 解析 slug + seq...")
def parse_key(key):
    rel = key[len(PREFIX):]
    base = rel[:-5]  # 去 .webp
    seq = 0
    slug = base
    for postfix in ['-2', '-3', '-4', '-5', '-6']:
        if base.endswith(postfix):
            slug = base[:-len(postfix)]
            seq = int(postfix[1:])
            break
    return slug, seq

by_slug = {}
for obj in r2_objects:
    slug, seq = parse_key(obj["key"])
    by_slug.setdefault(slug, []).append({"seq": seq, "key": obj["key"], "size": obj["size"]})
print(f"   产品 slug 数: {len(by_slug)}")

# ── 3. 获取 D1 产品 (is_showcase=1) ──
products = d1("SELECT id, slug FROM products WHERE site_id='biosphere-ai' AND is_showcase=1 ORDER BY id")
print(f"3. D1 is_showcase=1 产品: {len(products)}")

# ── 4. 生成重建 SQL ──
print("4. 生成重建 SQL...")

# 4a. 删除旧的 AI 产品 media + product_media
sql_clean = [
    "DELETE FROM product_media WHERE media_id IN (SELECT id FROM media WHERE r2_key LIKE 'media/product/AI%')",
    "DELETE FROM media WHERE r2_key LIKE 'media/product/AI%'",
]

# 4b. 从 R2 对象生成新的 media 记录
sql_media = []
for obj in r2_objects:
    key = obj["key"]
    rel = key[len(PREFIX):]
    filename = rel
    sql_media.append(
        f"INSERT INTO media (r2_key, filename, mime, bytes, width, height, "
        f"folder, alt_zh, alt_en, driver, creator, created_at) VALUES "
        f"({_q(key)}, {_q(filename)}, 'image/webp', {obj['size']}, 0, 0, "
        f"'AI图产品库 2026-10', 'AI产品图', 'AI product image', 'r2', 'AI图产品库', datetime('now')) "
        f"ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes")

# 4c. 生成 product_media + cover_media
sql_pm = []
sql_cover = []
matched = 0
unmatched = 0
for p in products:
    pid = p['id']
    slug = p['slug']
    meds = by_slug.get(slug)
    if not meds:
        unmatched += 1
        continue
    matched += 1
    meds.sort(key=lambda x: x["seq"])
    for i, m in enumerate(meds):
        sql_pm.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"SELECT {pid}, id, {i} FROM media WHERE r2_key = {_q(m['key'])}")
    # cover_media 指向封面
    cover_key = meds[0]["key"]
    sql_cover.append(
        f"UPDATE products SET cover_media = (SELECT id FROM media WHERE r2_key = {_q(cover_key)}), "
        f"updated_at = datetime('now') WHERE id = {pid}")

print(f"   匹配: {matched} · 未匹配: {unmatched}")
print(f"   clean SQL: {len(sql_clean)} · media SQL: {len(sql_media)} · pm SQL: {len(sql_pm)} · cover SQL: {len(sql_cover)}")

all_sql = sql_clean + sql_media + sql_pm + sql_cover
print(f"   总 SQL: {len(all_sql)}")

# ── 5. 分片灌库 ──
print("5. 灌库...")
batch_size = 20
total_ok = 0
total_fail = 0
for bi in range(0, len(all_sql), batch_size):
    batch = all_sql[bi:bi+batch_size]
    bpath = os.path.join(HERE, f"_rebuild_{bi//batch_size}.sql")
    with io.open(bpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(";\n".join(batch) + ";\n")
    rows = bh.d1_exec(bpath)
    if rows > 0:
        total_ok += len(batch)
    else:
        for stmt in batch:
            sp = bpath + ".s.sql"
            with io.open(sp, "w", encoding="utf-8", newline="\n") as f:
                f.write(stmt + ";\n")
            r2 = bh.d1_exec(sp)
            if r2 > 0:
                total_ok += 1
            else:
                total_fail += 1
    if (bi // batch_size) % 100 == 0:
        print(f"   batch {bi//batch_size}/{len(all_sql)//batch_size} · 累计 {total_ok}", flush=True)

print(f"\n灌库: 成功 {total_ok}/{len(all_sql)} · 失败 {total_fail}")

# ── 6. 端到端验证 ──
print("\n6. 端到端验证...")
no_pm = d1("SELECT COUNT(*) n FROM products p WHERE p.site_id='biosphere-ai' AND p.is_showcase=1 AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id=p.id)")[0]['n']
total_pm = d1("SELECT COUNT(*) n FROM product_media")[0]['n']
total_media = d1("SELECT COUNT(*) n FROM media WHERE r2_key LIKE 'media/product/AI%'")[0]['n']
multi = d1("SELECT COUNT(*) n FROM products p WHERE p.site_id='biosphere-ai' AND p.is_showcase=1 AND (SELECT COUNT(*) FROM product_media WHERE product_id=p.id) > 1")[0]['n']
print(f"   media(AI): {total_media} (应 = R2 对象数 {len(r2_objects)})")
print(f"   product_media: {total_pm}")
print(f"   无 pm 的产品: {no_pm} (应 0)")
print(f"   >1 张图的产品: {multi}")

# 抽样: 验证 r2_key 在 R2 里存在
print("\n   抽样验证 (r2_key → R2):")
sample = d1("SELECT pm.sort_order, m.r2_key FROM product_media pm JOIN media m ON m.id=pm.media_id JOIN products p ON p.id=pm.product_id WHERE p.site_id='biosphere-ai' AND p.is_showcase=1 AND p.slug='5x-acne-clear-cream-2' ORDER BY pm.sort_order LIMIT 4")
for s in sample:
    try:
        head = s3.head_object(Bucket="bohui-photo", Key=s['r2_key'])
        print(f"     sort={s['sort_order']} {s['r2_key'][-40:]} → OK ({head['ContentLength']}B)")
    except Exception as e:
        print(f"     sort={s['sort_order']} {s['r2_key'][-40:]} → 缺失!")
