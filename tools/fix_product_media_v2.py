#!/usr/bin/env python3
"""补写 product_media v2 —— 一次性读取 media 表, Python 分组, 避免 D1 LIKE 复杂模式报错"""
import sys, os, io, importlib.util
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('bh', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_bohui.py'))
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1
HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = "media/product/AI产品图/"

# 1) 一次性读取所有 AI 产品图 media 记录 (前缀 LIKE, 通配符在末尾, D1 可处理)
print("读取 media 表 AI 产品图记录...")
all_media = d1(f"SELECT id, r2_key FROM media WHERE r2_key LIKE '{PREFIX}%' ORDER BY id")
print(f"  media 表 AI 图记录: {len(all_media)}")

# 2) Python 里按 slug 分组
# r2_key 格式: PREFIX + {slug}.webp 或 PREFIX + {slug}-2.webp 等
media_by_slug = {}
for m in all_media:
    key = m['r2_key']
    rel = key[len(PREFIX):]           # 去掉前缀
    base = rel[:-5]                    # 去掉 .webp
    # 分离 slug 和序号: xxx 或 xxx-2 或 xxx-3
    if base.endswith('-2') or base.endswith('-3') or base.endswith('-4') or base.endswith('-5') or base.endswith('-6'):
        slug = base[:-2]
        seq = int(base[-1])
    else:
        slug = base
        seq = 0
    media_by_slug.setdefault(slug, []).append((seq, m['id']))

print(f"  分组后的产品数: {len(media_by_slug)}")

# 3) 获取需要补写的产品
products = d1("""
    SELECT p.id, p.slug
    FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
    ORDER BY p.id
""")
print(f"需要补写 product_media 的产品: {len(products)}")

if not products:
    print("无需补写")
    sys.exit(0)

# 4) 生成 SQL
sql_lines = []
cover_updates = []
found = 0
missing = 0
for p in products:
    pid = p['id']
    slug = p['slug']
    meds = media_by_slug.get(slug)
    if not meds:
        missing += 1
        continue
    found += 1
    meds.sort()  # 按 (seq, id) 排序, 封面(seq=0)在前
    for i, (seq, mid) in enumerate(meds):
        sql_lines.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"VALUES ({pid}, {mid}, {i})")
    cover_updates.append(
        f"UPDATE products SET cover_media = {meds[0][1]}, updated_at = datetime('now') "
        f"WHERE id = {pid}")

print(f"找到图片: {found} · 无图片: {missing}")
print(f"product_media SQL: {len(sql_lines)} 条 · cover UPDATE: {len(cover_updates)} 条")

all_sql = sql_lines + cover_updates
print(f"总 SQL: {len(all_sql)}")

# 5) 分片灌库
batch_size = 30
total_ok = 0
total_fail = 0
for bi in range(0, len(all_sql), batch_size):
    batch = all_sql[bi:bi+batch_size]
    bpath = os.path.join(HERE, f"_fpm2_{bi//batch_size}.sql")
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
        print(f"  batch {bi//batch_size}/{len(all_sql)//batch_size} · 累计 {total_ok}", flush=True)

print(f"\n灌库: 成功 {total_ok}/{len(all_sql)} · 失败 {total_fail}")

# 6) 验证
no_pm = d1("""
    SELECT COUNT(*) n FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
""")
total_pm = d1("SELECT COUNT(*) n FROM product_media")
multi = d1("""
    SELECT COUNT(*) n FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND (SELECT COUNT(*) FROM product_media WHERE product_id=p.id) > 1
""")
print(f"\n验证:")
print(f"  is_showcase=1 无 product_media: {no_pm[0]['n']} (应为 0)")
print(f"  product_media 总记录: {total_pm[0]['n']}")
print(f"  有 >1 张图的产品: {multi[0]['n']}")
