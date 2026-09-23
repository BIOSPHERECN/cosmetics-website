"""09-23 A3:公司库里「帛卉在印尼有工厂 / 基地」的提法扫描(只读)。"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
from _bohui import d1
PAT = ['%Tangerang%', '%唐格朗%', '%印尼工厂%', '%印尼基地%', '%印尼厂%', '%second plant%', '%Second plant%', '%双基地%', '%第二基地%', '%第二工厂%', '%海外基地%',
       '%Indonesia factory%', '%Indonesian factory%', '%Indonesia plant%', '%Indonesian plant%', '%Indonesia base%', '%plant in Indonesia%', '%factory in Indonesia%',
       '%two bases%', '%Two bases%', '%dual base%', '%two plants%', '%印尼生产基地%', '%印度尼西亚工厂%']
TABLES = {'block_i18n': ('block_id', 'data_json'), 'pages': ('id', 'seo_desc'), 'page_i18n': ('page_id', 'seo_desc'), 'news': ('id', 'body'),
          'geo_answers': ('slug', 'a_en'), 'playbooks': ('slug', 'body'), 'sites': ('id', 'tagline')}
for t, (idc, col) in TABLES.items():
    cols = [r['name'] for r in d1(f"PRAGMA table_info({t})")]
    if not cols: print(t, '无表'); continue
    txt = [c for c in cols if any(k in c for k in ('json', 'body', 'desc', 'text', 'title', 'summary', 'tagline', 'a_', 'q_', 'content', 'lede', 'name'))]
    where = ' OR '.join(f"{c} LIKE '{p}'" for c in txt for p in PAT)
    rows = d1(f"SELECT {idc} AS id FROM {t} WHERE {where}") if txt else []
    print(t, len(rows), sorted({str(r['id']) for r in rows})[:40])
