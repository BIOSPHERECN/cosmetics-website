#!/usr/bin/env python3
"""补写 product_i18n —— 1468 个 is_showcase=1 的产品缺少 i18n 记录导致详情页 302 跳转"""
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
SITE_ID = "biosphere-ai"

# 获取所有 is_showcase=1 但没有 i18n 的产品
products = d1("""
    SELECT p.id, p.slug, p.category
    FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_i18n i WHERE i.product_id = p.id)
    ORDER BY p.id
""")
print(f"需要补写 i18n 的产品: {len(products)}")

if not products:
    print("无需补写")
    sys.exit(0)

# 从目录名推断中英文名（和 product-ai-images-v2.py 的 parse_dirname 逻辑一致）
import re

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

# 从 slug 反推产品名（slug 是 slugify(en_name) 的结果，无法完全反推）
# 更好的方式：直接从 D1 已有的 product 目录名匹配
# 但我们没有存目录名。用 slug 做产品名（去掉 - 分隔符，首字母大写）
def slug_to_name(slug, lang):
    if lang == 'zh-cn':
        # 中文：用 slug 做占位（后续运营可改）
        return slug.replace('-', ' ')
    else:
        # 英文：slug 转标题
        words = slug.replace('-', ' ').split()
        return ' '.join(w.capitalize() for w in words)

# 生成 SQL
sql_lines = []
for p in products:
    pid = p['id']
    slug = p['slug']
    en_name = slug_to_name(slug, 'en')
    zh_name = slug_to_name(slug, 'zh-cn')

    for lang, name_val in (('zh-cn', zh_name), ('en', en_name)):
        summary = "AI 生成产品图" if lang == 'zh-cn' else "AI generated product image"
        desc = f"产品:{zh_name}。" if lang == 'zh-cn' else f"Product: {en_name}."
        sql_lines.append(
            f"INSERT INTO product_i18n (product_id, lang, name, summary, description, "
            f"specs_json, highlights_json, mt) VALUES "
            f"({pid}, {_q(lang)}, {_q(name_val)}, {_q(summary)}, {_q(desc)}, '[]', '[]', 0) "
            f"ON CONFLICT(product_id, lang) DO UPDATE SET name=excluded.name, "
            f"summary=excluded.summary, description=excluded.description")

print(f"生成 SQL 语句: {len(sql_lines)} 条")

# 分片灌库（每批 30 条）
batch_size = 30
total_ok = 0
total_fail = 0
for bi in range(0, len(sql_lines), batch_size):
    batch = sql_lines[bi:bi+batch_size]
    bpath = os.path.join(HERE, f"_fix_i18n_batch_{bi//batch_size}.sql")
    with io.open(bpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(";\n".join(batch) + ";\n")
    rows = bh.d1_exec(bpath)
    if rows > 0:
        total_ok += len(batch)
    else:
        # 单条重试
        for stmt in batch:
            sp = bpath + ".s.sql"
            with io.open(sp, "w", encoding="utf-8", newline="\n") as f:
                f.write(stmt + ";\n")
            r2 = bh.d1_exec(sp)
            if r2 > 0:
                total_ok += 1
            else:
                total_fail += 1
    if (bi // batch_size) % 20 == 0:
        print(f"  batch {bi//batch_size}/{len(sql_lines)//batch_size} · 累计 {total_ok}", flush=True)

print(f"\n灌库完成: 成功 {total_ok}/{len(sql_lines)} · 失败 {total_fail}")

# 验证
no_i18n = d1("""
    SELECT COUNT(*) n FROM products p
    WHERE p.site_id='biosphere-ai' AND p.is_showcase=1
    AND NOT EXISTS (SELECT 1 FROM product_i18n i WHERE i.product_id = p.id)
""")
total_i18n = d1("SELECT COUNT(*) n FROM product_i18n")
print(f"验证: is_showcase=1 但无 i18n: {no_i18n[0]['n']} (应为 0)")
print(f"product_i18n 总记录数: {total_i18n[0]['n']}")
