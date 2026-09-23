import sys, re, json; sys.stdout.reconfigure(encoding='utf-8')
from _bohui import d1
IDS = '100,125,126,157,158,196,254,288,29,30,349,358,361,365,366,370,371,388,397,400,407,414,416,420,432,434,61,62,94'
RX = re.compile(r'Tangerang|唐格朗|印尼(工厂|基地|厂|生产基地)|second plant|双基地|第二(基地|工厂)|海外基地|Indonesian? (factory|plant|base)|(plant|factory) in Indonesia|two bases|dual base|two plants', re.I)
meta = {r['id']: r for r in d1(f"SELECT b.id, b.type, b.is_visible, p.id pid, p.slug, p.site_id, p.is_published FROM blocks b JOIN pages p ON p.id=b.page_id WHERE b.id IN ({IDS})")}
for r in d1(f"SELECT block_id, lang, data_json FROM block_i18n WHERE block_id IN ({IDS}) AND lang IN ('en','zh-cn')"):
    m = meta.get(r['block_id'], {})
    for x in RX.finditer(r['data_json']):
        s = r['data_json']; print(m.get('site_id'), m.get('slug'), 'pub', m.get('is_published'), 'vis', m.get('is_visible'), r['block_id'], m.get('type'), r['lang'], '|', s[max(0, x.start()-70):x.end()+50].replace('\n', ' '))
print('page_i18n:', d1("SELECT page_id, lang, seo_desc, (SELECT slug FROM pages WHERE id=page_id) slug, (SELECT site_id FROM pages WHERE id=page_id) site FROM page_i18n WHERE page_id IN (36,38) AND lang IN ('en','zh-cn')"))
