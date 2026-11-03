#!/usr/bin/env python3
"""彻底清理 D1 中所有 AI 产品相关数据 (products, product_i18n, product_media, media)"""
import sys, os, io, importlib.util
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, r'F:\0cosmetic\cosmetic-sites\tools')
os.chdir(r'F:\0cosmetic\cosmetic-sites')
spec = importlib.util.spec_from_file_location('bh', r'F:\0cosmetic\cosmetic-sites\tools\_bohui.py')
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1

print("开始清理 D1 中所有 AI 产品相关数据...")

sql_commands = [
    "DELETE FROM product_media WHERE media_id IN (SELECT id FROM media WHERE r2_key LIKE 'media/product/AI%')",
    "DELETE FROM product_i18n WHERE product_id IN (SELECT id FROM products WHERE site_id='biosphere-ai' AND internal_note LIKE '%AI%')",
    "DELETE FROM products WHERE site_id='biosphere-ai' AND internal_note LIKE '%AI%'",
    "DELETE FROM media WHERE r2_key LIKE 'media/product/AI%'",
]

for cmd in sql_commands:
    try:
        d1(cmd)
        print(f"  ✅ 执行成功: {cmd[:80]}...")
    except Exception as e:
        print(f"  ❌ 执行失败: {cmd[:80]}... 错误: {str(e)[:80]}")

print("清理完成。验证数据状态...")

# 验证清理结果
n_products = d1("SELECT COUNT(*) n FROM products WHERE site_id='biosphere-ai' AND internal_note LIKE '%AI%'")[0]['n']
n_media = d1("SELECT COUNT(*) n FROM media WHERE r2_key LIKE 'media/product/AI%'")[0]['n']
n_product_media = d1("SELECT COUNT(*) n FROM product_media WHERE media_id IN (SELECT id FROM media WHERE r2_key LIKE 'media/product/AI%')")[0]['n']
n_product_i18n = d1("SELECT COUNT(*) n FROM product_i18n WHERE product_id IN (SELECT id FROM products WHERE site_id='biosphere-ai' AND internal_note LIKE '%AI%')")[0]['n']

print(f"验证结果:\n  AI Products: {n_products} (应为 0)\n  AI Media: {n_media} (应为 0)\n  AI Product_Media: {n_product_media} (应为 0)\n  AI Product_I18n: {n_product_i18n} (应为 0)")

if n_products == 0 and n_media == 0 and n_product_media == 0 and n_product_i18n == 0:
    print("✅ D1 已彻底清理 AI 产品相关数据。可以重新导入。")
else:
    print("❌ 清理不彻底，请检查日志并手动处理。")