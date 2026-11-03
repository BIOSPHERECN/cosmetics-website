"""把 WorkBuddy 交付的 1688 工厂 CSV(任务书 S-1688广州化妆品工厂采集)导入平台 D1 factories 表。
用法:python tools/platform/import-factories.py "F:/0cosmetic/助手交付/16-工厂库/factories_gz_all.csv" [--apply]
规矩:只写工厂原话(moq/lead/capacity 三列原样);status 默认 pending(平台核验后改 listed);按 name_zh+license_no 去重;不删旧行。"""
import csv, io, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = sys.argv[1]; apply = '--apply' in sys.argv
q = lambda s: "'" + str(s or '').strip().replace("'", "''") + "'"
def slug(s): return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')[:60]
def arr(s): return json.dumps([x.strip() for x in re.split(r'[|,/;]', s or '') if x.strip()], ensure_ascii=False)
rows = list(csv.DictReader(io.open(src, encoding='utf-8-sig')))
seen, out = set(), []
for r in rows:
    key = (r.get('name_zh') or r.get('name_en') or '').strip() + '|' + (r.get('license_no') or '').strip()
    if not key.strip('|') or key in seen: continue
    seen.add(key)
    import hashlib
    sid = slug(r.get('name_en')) or ('lic-' + re.sub(r'[^0-9a-z]', '', (r.get('license_no') or '').lower()) if (r.get('license_no') or '').strip() else '') or ('h-' + hashlib.md5((r.get('name_zh') or '').encode('utf-8')).hexdigest()[:10])   # 中文名 slug 会变空,用许可证号 / 名字哈希,跨次导入不撞
    sid = f"gz-{sid}"
    out.append("INSERT OR IGNORE INTO factories (id,name,name_zh,country,region,city,district,categories,forms,certifications,capacity_note,moq_note,lead_time_note,founded,employees,lines,website,intro,intro_zh,is_verified,status,source,verify_level) VALUES ("
      + ",".join([q(sid), q(r.get('name_en') or r.get('name_zh')), q(r.get('name_zh')), "'CN'", "'Guangdong'", q(r.get('city') or 'Guangzhou'), q(r.get('district')),
                  q(arr(r.get('categories'))), q(arr(r.get('forms'))), q(arr(r.get('certifications'))),
                  q(r.get('capacity_note')), q(r.get('moq_note')), q(r.get('lead_time_note')), q(r.get('founded')),
                  (r.get('employees') or 'NULL') if str(r.get('employees') or '').isdigit() else 'NULL',
                  (r.get('lines') or 'NULL') if str(r.get('lines') or '').isdigit() else 'NULL',
                  q(r.get('website')), q(r.get('main_products')), q(r.get('main_products')), '0', "'pending'",
                  q(('粤药监局许可名单:' if 'mpa.gd.gov.cn' in (r.get('source_url') or '') else '1688:') + (r.get('source_url') or '')), '0']) + ");")   # 04:5x:intro_text 是 WorkBuddy 写的套话不入库;许可名单来源标明;L0 待核
p = os.path.join(ROOT, 'tools', 'platform', '_factories_import.sql')
io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(f"{len(rows)} 行 → 去重 {len(out)} 家 → {p}")
if apply:
    d = sorted(x for x in os.listdir(os.path.join(ROOT, 'apps', 'web')) if x.startswith('dist_'))[-1]
    env = {k: v for k, v in os.environ.items() if k not in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID')}; env['HTTPS_PROXY'] = 'http://127.0.0.1:7890'
    r = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes', '--file', p], cwd=os.path.join(ROOT, 'apps', 'web', d, 'server'), env=env, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(re.findall(r'"rows_written":\s*\d+', r.stdout + r.stderr)[-1:] or (r.stdout + r.stderr)[-300:])
