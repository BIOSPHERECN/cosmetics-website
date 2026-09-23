import sys, re, json; sys.stdout.reconfigure(encoding='utf-8')
from _bohui import d1
IDS = '100,125,126,157,158,196,254,288,29,30,349,358,361,365,366,370,371,388,397,400,407,414,416,420,432,434,61,62,94'
RX = re.compile(r'Tangerang|唐格朗|印尼|Indonesia|双基地|two plants|dual base|second plant|海外基地', re.I)
cols = [r['name'] for r in d1("PRAGMA table_info(pages)")]; print('pages cols:', cols)
meta = d1(f"SELECT b.id, b.type, b.is_visible, p.id pid, p.slug, p.site_id FROM blocks b JOIN pages p ON p.id=b.page_id WHERE b.id IN ({IDS})")
for m in meta: print('META', m)
bio = [str(m['id']) for m in meta if m['site_id'] == 'biosphere-ai']
def walk(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from walk(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from walk(v, f'{path}[{i}]')
    elif isinstance(o, str): yield path, o
for r in d1(f"SELECT block_id, lang, data_json FROM block_i18n WHERE block_id IN ({','.join(bio)}) AND lang IN ('en','zh-cn') ORDER BY block_id, lang"):
    for p, v in walk(json.loads(r['data_json'])):
        if RX.search(v): print(r['block_id'], r['lang'], p, '=>', v[:400])
print('LANGS', d1(f"SELECT block_id, COUNT(*) n FROM block_i18n WHERE block_id IN ({','.join(bio)}) GROUP BY block_id"))
