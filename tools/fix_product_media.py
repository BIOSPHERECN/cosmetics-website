#!/usr/bin/env python3
"""补写 product_media —— 1468 个产品缺少图片关联导致详情页只显示 1 张图"""
import sys, os, io, importlib.util
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('bh', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_bohui.py'))
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1
_q = bh._q
HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = "media/product/AI产品图/"

# 获取所有 is_showcase=1 但没有 product_media 的产品
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

# 对每个产品，查找 media 表里对应的图片记录
sql_lines = []
cover_updates = []
found_count = 0
missing_count = 0

for p in products:
    pid = p['id']
    slug = p['slug']
    
    # 查找该产品的所有图片: r2_key 以 PREFIX + slug 开头
    medias = d1(f"SELECT id, r2_key FROM media WHERE r2_key LIKE '{PREFIX}{slug}%' ORDER BY r2_key")
    
    if not medias:
        missing_count += 1
        continue
    
    found_count += 1
    
    # 按 r2_key 排序: 封面(slug.webp)在前, 附加图(slug-2.webp, slug-3.webp...)在后
    def sort_key(m):
        key = m['r2_key']
        # 封面: slug.webp (sort=0)
        # 附加: slug-2.webp (sort=1), slug-3.webp (sort=2), slug-4.webp (sort=3)
        if key == f"{PREFIX}{slug}.webp":
            return (0, key)
        return (1, key)
    
    medias_sorted = sorted(medias, key=sort_key)
    
    for i, m in enumerate(medias_sorted):
        sql_lines.append(
            f"INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) "
            f"VALUES ({pid}, {m['id']}, {i})")
    
    # 更新 cover_media 指向封面图
    cover_media = medias_sorted[0]  # 封面
    cover_updates.append(
        f"UPDATE products SET cover_media = {cover_media['id']}, updated_at = datetime('now') "
        f"WHERE id = {pid}")

print(f"找到图片的产品: {found_count}")
print(f"没有图片的产品: {missing_count}")
print(f"生成 product_media SQL: {len(sql_lines)} 条")
print(f"生成 cover_media UPDATE: {len(cover_updates)} 条")

# 合并所有 SQL
all_sql = sql_lines + cover_updates
print(f"总 SQL 语句: {len(all_sql)}")

# 分片灌库
batch_size = 30
total_ok = 0
total_fail = 0
for bi in range(0, len(all_sql), batch_size):
    batch = all_sql[bi:bi+batch_size]
    bpath = os.path.join(HERE, f"_fix_pm_batch_{bi//batch_size}.sql")
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
    if (bi // batch_size) % 50 == 0:
        print(f"  batch {bi//batch_size}/{len(all_sql)//batch_size} · 累计 {total_ok}", flush=True)

print(f"\n灌库完成: 成功 {total_ok}/{len(all_sql)} · 失败 {total_fail}")

# 验证
no_pm = d1("""
    SELECT COUNT(*) n FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
""")
total_pm = d1("SELECT COUNT(*) n FROM product_media")
has_cover = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND is_showcase=1 AND cover_media IS NOT NULL")
print(f"\n验证:")
print(f"  is_showcase=1 但无 product_media: {no_pm[0]['n']} (应为 0)")
print(f"  product_media 总记录: {total_pm[0]['n']}")
print(f"  有 cover_media 的 is_showcase=1 产品: {has_cover[0]['n']}")

# 抽样验证
sample = d1(f"SELECT pm.sort_order, m.r2_key FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id={products[0]['id']} ORDER BY pm.sort_order")
print(f"\n抽样产品 {products[0]['slug']} (id={products[0]['id']}):")
for s in sample:
    print(f"  sort={s['sort_order']} r2_key={s['r2_key'][:60]}")
