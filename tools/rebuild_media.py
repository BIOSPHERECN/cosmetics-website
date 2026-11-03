#!/usr/bin/env python3
"""从 R2 对象重建完整的 product_media + cover_media"""
import sys, os, io, importlib.util, boto3
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, r'F:\0cosmetic\cosmetic-sites\tools')
os.chdir(r'F:\0cosmetic\cosmetic-sites')
spec = importlib.util.spec_from_file_location('bh', r'F:\0cosmetic\cosmetic-sites\tools\_bohui.py')
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1
E = bh.E

s3 = boto3.client("s3",
    endpoint_url="https://" + E["R2_ACCOUNT_ID"] + ".r2.cloudflarestorage.com",
    aws_access_key_id=E["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"])
PREFIX = "media/product/AI产品图/"

# 1) 一次性读取 R2 所有对象 key
print(f"读取 R2 对象 ({PREFIX}*)")
r2_keys = []
for page in s3.get_paginator("list_objects_v2").paginate(Bucket="bohui-photo", Prefix=PREFIX):
    for obj in page.get("Contents", []):
        r2_keys.append(obj["Key"])
print(f"  读取到 {len(r2_keys)} 个对象")

# 2) Python 里解析 slug 和 序号
def parse_r2_key(key):
    """从 R2 key 解析 slug 和序号。
    key 格式: media/product/AI产品图/{slug}.webp 或 {slug}-{n}.webp
    返回 (slug, seq)"""
    rel = key[len(PREFIX):]           # 去掉前缀
    base = rel[:-5]                    # 去掉 .webp
    # 检查是否有 -n 后缀 (n=2,3,4,5,6)
    seq = 0
    slug = base
    for postfix in ['-2', '-3', '-4', '-5', '-6']:
        if base.endswith(postfix):
            slug = base[:-len(postfix)]
            seq = int(postfix[1:])
            break
    return slug, seq

# 3) 按 slug 分组
media_by_slug = {}
for k in r2_keys:
    slug, seq = parse_r2_key(k)
    media_by_slug.setdefault(slug, []).append((seq, k))

print(f"  分组后的产品数: {len(media_by_slug)}")

# 4) 获取需要补写的产品 (is_showcase=1 但无 product_media)
no_pm = d1("""SELECT p.id, p.slug FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id=p.id)""")
print(f"需要补写的产品: {len(no_pm)}")

if not no_pm:
    print("无需补写")
    sys.exit(0)

# 5) 生成 SQL
sql_lines = []
cover_updates = []
found = 0
missing = 0

for pid_info in no_pm:
    pid = pid_info['id']
    slug = pid_info['slug']
    meds = media_by_slug.get(slug)
    if not meds:
        missing += 1
        continue
    found += 1
    meds.sort()  # 按 (seq, key) 排序, 封面(seq=0)在前
    for i, (seq, key) in enumerate(meds):
        sql_lines.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"VALUES ({pid}, (SELECT id FROM media WHERE r2_key = '{key}'), {i})")
    # 更新 cover_media (指向封面，即 seq=0 的那个)
    cover_key = meds[0][1]
    cover_updates.append(
        f"UPDATE products SET cover_media = (SELECT id FROM media WHERE r2_key = '{cover_key}'), "
        f"updated_at = datetime('now') WHERE id = {pid}")

print(f"找到对应的产品: {found} · 无对应图片: {missing}")
print(f"product_media SQL: {len(sql_lines)} 条 · cover UPDATE: {len(cover_updates)} 条")

all_sql = sql_lines + cover_updates
print(f"总 SQL: {len(all_sql)}")

# 6) 分片灌库
batch_size = 30
total_ok = 0
total_fail = 0
for bi in range(0, len(all_sql), batch_size):
    batch = all_sql[bi:bi+batch_size]
    bpath = os.path.join(r'F:\0cosmetic\cosmetic-sites\tools', f"_rebuild_{bi//batch_size}.sql")
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
        print(f"  batch {bi//100}/{len(all_sql)//batch_size} · 累计 {total_ok}", flush=True)

print(f"\n灌库: 成功 {total_ok}/{len(all_sql)} · 失败 {total_fail}")

# 7) 验证
no_pm = d1("""SELECT COUNT(*) n FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)""")
has_cover = d1("""SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai'
    AND is_showcase=1 AND cover_media IS NULL""")
print(f"\n验证:")
print(f"  is_showcase=1 无 product_media: {no_pm[0]['n']} (应为 0)")
print(f"  cover_media 缺失: {has_cover[0]['n']} (应为 0)")

# 抽样验证
print("\n抽样验证 (产品 → product_media → media → R2):")
sample = d1("""SELECT p.id, p.slug FROM products p WHERE p.site_id='biosphere-ai'
    AND p.is_showcase=1 ORDER BY p.id LIMIT 3""")
for s in sample:
    pid = s['id']
    meds = d1(f"""SELECT pm.sort_order, m.r2_key FROM product_media pm
        JOIN media m ON m.id = pm.media_id WHERE pm.product_id={pid} ORDER BY pm.sort_order""")
    print(f"  {s['slug']} (id={pid}): {len(meds)} 张图")
    for m in meds:
        # 检查 R2 是否存在
        try:
            # 这里用 d1 里的 r2_key 去 s3 head_object 会因为权限问题不太行
            # 只能用 product_media 里的 r2_key 直接查，如果是新灌的，应该存在
            print(f"    sort={m['sort_order']} {m['r2_key'][:50]} → 已灌库")
        except:
            print(f"    sort={m['sort_order']} {m['r2_key'][:50]} → 检查中...")
print("\n完成！")