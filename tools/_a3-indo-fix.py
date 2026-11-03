"""09-23 18:0x 创始人:印尼工厂对外忽略、别提。biosphere-ai 可见版块与页面描述里「帛卉在印尼有工厂 / 基地 / 双基地」的提法改掉(18 语)。
印尼作为目标市场 / 法规 / BPOM / HALAL 准入的句子保留。顺手把被改句子里的旧错一并修正(英文法人名 Biosphere→Bohui、打样 3–7 天→通常 5–14 天)。
非 en / zh 语种:只改「原值里提到印尼 / 唐格朗」的(mode=ind)或全部(mode=all),新句由英文正本经免费舰队翻译。
用法:python tools/_a3-indo-fix.py [--apply]   (不带 --apply 只打印将改哪些)"""
import io, json, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from _bohui import d1, d1_exec, chat, fleet

IND = re.compile(r'Indon[eéè]si|インドネシア|인도네시아|Индонез|إندونيسيا|इंडोनेशिया|Endonezya|อินโดนีเซีย|印尼|印度尼西|Tangerang|唐格朗|タンゲラン|탕그랑|탕에랑|Тангеранг|تانجيرانج|तंगेरांग|ตังเกอรัง|雙基地|双基地', re.I)
LANG = {"zh-tw": "Traditional Chinese (Taiwan)", "jp": "Japanese", "kr": "Korean", "fr": "French", "de": "German", "ru": "Russian", "id": "Indonesian", "my": "Malay",
        "th": "Thai", "vn": "Vietnamese", "ph": "Filipino (Tagalog)", "es": "Spanish", "pt": "Portuguese (Brazil)", "ar": "Arabic (Modern Standard)", "tr": "Turkish", "in": "Hindi"}
# (block, path, mode, en, zh) —— en / zh 为 None 表示用 sub 规则从原值改;'DEL' 表示删掉该数组元素
SET = [
    (93, 'lead', 'ind', ('sub', [(', with an investment site in development in Indonesia,', ',')]), ('sub', [(',印尼为投资布局中的基地;', ';')])),
    (434, 'paragraphs.0', 'ind', 'BIOSPHERE (Guangzhou Bohui Cosmetics Co., Ltd.) is based in Guangzhou — a herbal beauty platform uniting data insight, smart R&D, flexible manufacturing, brand incubation and global service.',
     '帛卉化妆品(BIOSPHERE)立足广州,是一家集「数据洞察、智能研发、柔性智造、品牌孵化、全球服务」于一体的草本美妆产业平台。'),
    (434, 'paragraphs.2', 'ind', 'Production base: Baiyun, Guangzhou. 20,000+ m² of production floor, 15 smart lines, 13,000+ proven formulations and 300+ strategic suppliers; ISO 22716, GMPC and HALAL certification, plus US FDA facility registration and EU CPNP notification per product, support entry into global markets.',
     '生产基地:广州白云。20,000+ ㎡ 生产面积、15 条智能生产线、13,000+ 个成熟配方储备、300+ 家战略供应商;ISO 22716、GMPC、HALAL 认证,以及美国 FDA 设施注册、欧盟 CPNP 按产品通报,支撑全球市场准入。'),
    (100, 'paragraphs.2', 'ind', 'All manufacturing is in Guangzhou; orders for Southeast Asia and the Middle East are produced and shipped from Guangzhou as well.',
     '生产全部在广州;面向东南亚与中东的订单同样由广州工厂生产与交付。'),
    (288, 'items.3.note', 'all', 'Class 100,000 GMP · 20,000+ m²', '10 万级 GMP · 20,000+ ㎡'),
    (414, 'answer', 'ind', ('sub', [('Guangzhou Biosphere Cosmetics', 'Guangzhou Bohui Cosmetics'), (' of land across two sites in Guangzhou and Indonesia, with all production in Guangzhou,', ' of production floor in Guangzhou,'), ('supports 3–7 day sampling', 'supports sampling in usually 5–14 days')]),
     ('sub', [('3–7 天', '通常 5–14 天')])),
    (414, 'faqs.5.a', 'ind', 'All orders are produced and shipped from Guangzhou, including those for Southeast Asia and the Middle East; HALAL and local compliance documents are prepared in Guangzhou.',
     '全部订单由广州工厂生产与交付,包括东南亚与中东;HALAL 与本地合规资料由广州工厂配合完成。'),
    (416, 'items.0.label', 'all', 'Production floor area', '生产基地总面积'),
    (420, 'eyebrow', 'all', 'PRODUCTION BASE', '生产基地'),
    (420, 'title', 'all', 'Made in Guangzhou', '广州生产'),
    (420, 'intro', 'all', 'Production sits in Guangzhou: 15 smart lines and a Class-100,000 GMP cleanroom.', '生产集中在广州:15 条智能产线、10 万级 GMP 洁净车间。'),
    (420, 'items.1', 'del', None, None),
    (432, 'items.0.desc', 'ind', 'Made in Guangzhou and shipped with HALAL certification; destination-market compliance is prepared before production.',
     '广州生产出口,持 HALAL 认证;目的地合规资料在生产前备好。'),
]
PAGES = [
    (36, 'AI-driven herbal beauty maker in Guangzhou: 20,000+ m² of production floor, 15 automated lines, 13,000+ formulas, GMPC / ISO 22716 / HALAL certified.', ('sub', [('(印尼为投资布局中的基地)', '')])),
    (38, 'How a Guangzhou factory grew order by order: 20,000+ m² of production floor, 15 automated lines and four category lines running in parallel.',
     '从广州起步的发展历程:产能一直跟着订单走 —— 20,000+㎡ 生产基地、15 条自动化产线与四线并行的品类体系是怎么一步步建起来的。'),
]

def get(o, path):
    for k in path.split('.'): o = o[int(k)] if isinstance(o, list) else o[k]
    return o
def put(o, path, v):
    ks = path.split('.');
    for k in ks[:-1]: o = o[int(k)] if isinstance(o, list) else o[k]
    k = ks[-1]
    if isinstance(o, list): o[int(k)] = v
    else: o[k] = v
def resolve(spec, old):
    if isinstance(spec, tuple) and spec[0] == 'sub':
        s = old
        for a, b in spec[1]:
            if a not in s: raise SystemExit(f'sub 未命中: {a!r} in {old[:120]!r}')
            s = s.replace(a, b)
        return s
    return spec

APPLY = '--apply' in sys.argv
blocks = sorted({b for b, *_ in SET})
data = {}   # (block, lang) → obj
for r in d1(f"SELECT block_id, lang, data_json FROM block_i18n WHERE block_id IN ({','.join(map(str, blocks))})"):
    data[(r['block_id'], r['lang'])] = json.loads(r['data_json'])
pages = {(r['page_id'], r['lang']): r['seo_desc'] for r in d1(f"SELECT page_id, lang, seo_desc FROM page_i18n WHERE page_id IN ({','.join(str(p) for p, *_ in PAGES)})")}
langs = sorted({l for _, l in data})
print('块', blocks, '语种', len(langs))

todo = {l: {} for l in LANG}   # lang → {key: english}
new_en = {}
changed = set()
for b, path, mode, en, zh in SET:
    if mode == 'del':
        ref = data[(b, 'en')]; n_en = len(get(ref, path.rsplit('.', 1)[0]))
        for l in langs:
            arr = get(data[(b, l)], path.rsplit('.', 1)[0]); i = int(path.rsplit('.', 1)[1])
            if len(arr) != n_en or not IND.search(json.dumps(arr[i], ensure_ascii=False)): raise SystemExit(f'删除核对失败 {b} {l}')
            del arr[i]; changed.add((b, l))
        print(f'  删 {b}.{path}(全部 {len(langs)} 语)'); continue
    e = resolve(en, get(data[(b, 'en')], path)); z = resolve(zh, get(data[(b, 'zh-cn')], path))
    put(data[(b, 'en')], path, e); put(data[(b, 'zh-cn')], path, z); changed |= {(b, 'en'), (b, 'zh-cn')}
    key = f'{b}:{path}'; new_en[key] = e
    for l in LANG:
        if (b, l) not in data: continue
        if mode == 'all' or IND.search(str(get(data[(b, l)], path))): todo[l][key] = e
for pid, en, zh in PAGES:
    e = en; z = resolve(zh, pages.get((pid, 'zh-cn')) or '')
    pages[(pid, 'en')] = e; pages[(pid, 'zh-cn')] = z
    for l in LANG:
        if IND.search(pages.get((pid, l)) or ''): todo[l][f'page:{pid}'] = e
print('待译:', {l: len(v) for l, v in todo.items() if v})
if not APPLY: sys.exit(0)

provs = [p for p in fleet() if p['id'].startswith(('agnes', 'sensenova'))]
RULES = ("Translate the JSON values from English into {lang} for a B2B cosmetics manufacturer's website. Keep the keys. Do not translate BIOSPHERE, GMPC, ISO 22716, HALAL, FDA, EU CPNP, GMP; "
         "keep numbers and units (20,000+ m², 15, 5–14) exactly. Business register. Output only JSON.")
for l, items in todo.items():
    if not items: continue
    out, prov, err = chat(provs, [{'role': 'system', 'content': RULES.format(lang=LANG[l])}, {'role': 'user', 'content': json.dumps(items, ensure_ascii=False)}], max_tokens=3000, want_json=True)
    if not isinstance(out, dict) or set(out) != set(items): raise SystemExit(f'{l} 翻译失败 {prov} {err}')
    for k, t in out.items():
        if k.startswith('page:'): pages[(int(k[5:]), l)] = t
        else:
            b, path = k.split(':', 1); put(data[(int(b), l)], path, t); changed.add((int(b), l))
    print(f'  {l} {len(items)} 条 ({prov})', flush=True)
sql = [f"UPDATE block_i18n SET data_json = '{json.dumps(data[k], ensure_ascii=False).replace(chr(39), chr(39) * 2)}' WHERE block_id = {k[0]} AND lang = '{k[1]}';" for k in sorted(changed)]
for (pid, l), v in pages.items():
    if l in ('en', 'zh-cn') or f'page:{pid}' in todo.get(l, {}):
        sql.append(f"UPDATE page_i18n SET seo_desc = '{(v or '').replace(chr(39), chr(39) * 2)}' WHERE page_id = {pid} AND lang = '{l}';")
left = [k for k in sorted(changed) if IND.search(json.dumps(data[k], ensure_ascii=False)) and k[0] in (100, 288, 414, 416, 420, 434)]
print('改后仍含印尼字样(应只剩市场/法规句):', left)
io.open('_a3-indo-fix.sql', 'w', encoding='utf-8', newline='\n').write('\n'.join(sql) + '\n')
print(len(sql), '条 SQL → tools/_a3-indo-fix.sql(执行另行拿锁)')
