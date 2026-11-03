import sys, re, json; sys.stdout.reconfigure(encoding='utf-8')
from _bohui import d1
RX = re.compile(r'Tangerang|唐格朗|印尼|印度尼西亚|Indonesia|双基地|two plants|two sites|two bases|dual', re.I)
def walk(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from walk(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from walk(v, f'{path}[{i}]')
    elif isinstance(o, str): yield path, o
rows = d1("SELECT bi.block_id, bi.lang, bi.data_json, p.slug FROM block_i18n bi JOIN blocks b ON b.id=bi.block_id JOIN pages p ON p.id=b.page_id WHERE p.site_id='biosphere-ai' AND b.is_visible=1 AND bi.lang IN ('en','zh-cn') AND (bi.data_json LIKE '%Indonesia%' OR bi.data_json LIKE '%印尼%' OR bi.data_json LIKE '%two sites%' OR bi.data_json LIKE '%two plants%' OR bi.data_json LIKE '%双基地%' OR bi.data_json LIKE '%ual base%')")
for r in rows:
    for p, v in walk(json.loads(r['data_json'])):
        if RX.search(v): print(r['block_id'], r['slug'] or '/', r['lang'], p, '=>', v[:260])
