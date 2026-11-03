#!/usr/bin/env python3
"""分批删除 media 表残留的 AI 记录（避免 CPU 超时）"""
import sys, os, importlib.util
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, r'F:\0cosmetic\cosmetic-sites\tools')
os.chdir(r'F:\0cosmetic\cosmetic-sites')
spec = importlib.util.spec_from_file_location('bh', r'F:\0cosmetic\cosmetic-sites\tools\_bohui.py')
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)
d1 = bh.d1

# 分批删除，每次删 500 条
batch_size = 500
total_deleted = 0
while True:
    # 查一批 id
    ids = d1("SELECT id FROM media WHERE r2_key LIKE 'media/product/AI%' LIMIT 500")
    if not ids:
        break
    id_list = ",".join(str(r["id"]) for r in ids)
    d1(f"DELETE FROM media WHERE id IN ({id_list})")
    total_deleted += len(ids)
    print(f"  已删除 {total_deleted} 条", flush=True)
    if len(ids) < batch_size:
        break

print(f"\n完成，共删除 {total_deleted} 条 media 记录")

# 验证
n = d1("SELECT COUNT(*) n FROM media WHERE r2_key LIKE 'media/product/AI%'")[0]['n']
print(f"残留 media(AI) 记录: {n} (应为 0)")