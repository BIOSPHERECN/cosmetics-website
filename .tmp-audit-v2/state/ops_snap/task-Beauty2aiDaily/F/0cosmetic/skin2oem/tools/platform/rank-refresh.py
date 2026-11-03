"""平台版:market_products 排序分 —— 创始人 09-22:「成分排序,按照 1 大品牌优先,2 爆款,3 更新」。列表页只按 rank_score 排(idx_mp_rank),不现算。
每天跑一次,可重复(只写有变化的行):
  brand_tier  3 = 下面写死的国际大牌清单 ∪ brand_leads 月流量前 100;2 = brand_leads 其余有流量(visits_month)的;0 = 其他
  hot         1 = 品牌上过 ecom_items 榜(每天 15 个美妆畅销榜快照);2 = 榜单标题的英文词也全在产品标题里(榜单同款)
  rank_score  brand_tier*1000 + hot(2→500 / 1→300) + 有图 50 + 有 summary_zh 30 —— hot 最高 580 分,永远压不过一级 tier(大品牌优先于爆款)
品牌名匹配:去重音 → 小写 → 去撇号/点 → 其它符号当分隔;等于 key,或 key 是前几个词(L'Oréal / loreal / L'OREAL NORGE AS / loreal-professionnel 都归 loreal)。
  key ≤3 个字母(mac / nyx / elf)与 EXACT 里的通用词只精确匹配(Natura 别吃掉 natura-siberica、Fresh 别吃掉 fresh-skinlab)。
写法便宜(09-22 并发写把 D1 压出 7500):品牌级 500 个品牌一条 UPDATE … WHERE brand IN (…)、批间 sleep 3,只写 tier/hot 变了的品牌;
  rank_score 按 id 段 5 万一条、只写 rank_score <> 新值的行;榜单同款只在上榜品牌的产品里比标题(拉几千行,不拉全表)。
    python tools/platform/rank-refresh.py          # 算 + 写 + 报 tier/hot 覆盖
    python tools/platform/rank-refresh.py --dry    # 只算不写
"""
import os, re, sys, time, unicodedata
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _pd1 import pq, pexec, q

# 国际大牌(tier 3)。"L Oreal" 是给 OBF 里 l-oreal / l-oreal-paris 这种连字符写法的别名。
BIG = """L'Oréal, L Oreal, Nivea, Dove, Garnier, Neutrogena, Olay, Estée Lauder, Lancôme, Shiseido, SK-II, SKII, Clinique, La Roche-Posay, CeraVe, The Ordinary,
Innisfree, Laneige, Sulwhasoo, COSRX, Colgate, Sensodyne, Maybelline, MAC, Kiehl's, Eucerin, Vichy, Avène, Bioderma, La Mer, Dior, Chanel, YSL, Yves Saint Laurent,
Givenchy, Guerlain, Clarins, Kérastase, Redken, Pantene, Head & Shoulders, Herbal Essences, Aveeno, Cetaphil, Vaseline, Johnson's, Gillette, Old Spice, Axe, Rexona,
Nars, Bobbi Brown, Urban Decay, Benefit, Fenty Beauty, Rare Beauty, Glossier, Drunk Elephant, Paula's Choice, Tatcha, Origins, Aesop, Jo Malone, Oral-B, Crest,
Listerine, Elmex, e.l.f., NYX, Revlon, Rimmel, Bourjois, Catrice, St. Ives, Palmer's, Burt's Bees, Bioré, Hada Labo, Senka, Shu Uemura, Etude, Missha, Mediheal,
Dr. Jart+, Anua, Beauty of Joseon, Skin1004, Some By Mi, TonyMoly, Tony Moly, Banila Co, Amorepacific, Curél, Elixir, Anessa, Kosé, DHC, Fancl, Lush, The Body Shop,
Weleda, Natura, O Boticário, Avon, Mary Kay, Oriflame, Artistry, Nu Skin, Pond's, Lux, Sunsilk, TRESemmé, Schwarzkopf, Wella, Syoss, Unilever,
Proya, Winona, Chando, Pechoin, Florasis, Perfect Diary, Kans, Herborist, 珀莱雅, 薇诺娜, 自然堂, 百雀羚, 花西子, 完美日记, 韩束, 佰草集"""
TOP_N = 100                      # brand_leads 月流量前 100 → tier 3
STOP = {'the', 'and', 'for', 'with', 'pcs', 'pack', 'set', 'oz', 'ml', 'fl', 'new', 'original', 'women', 'men'}
EXACT = {'natura', 'fresh', 'clear', 'simple', 'essence', 'origins', 'elixir', 'moon', 'three', 'bite', 'pure', 'glow'}   # 通用词品牌:只精确匹配,不吃前缀
EXPR = ("brand_tier*1000 + CASE hot WHEN 2 THEN 500 WHEN 1 THEN 300 ELSE 0 END"
        " + (img IS NOT NULL AND img <> '')*50 + (summary_zh IS NOT NULL AND summary_zh <> '')*30")

def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFKD', str(s or '')) if unicodedata.category(c) != 'Mn').lower()
    s = re.sub(r"['’`´.]", '', s)                      # 撇号与点不当分隔:l'oreal→loreal · e.l.f.→elf · kiehl's→kiehls
    return ' '.join(re.sub(r'[^\w]+|_', ' ', s).split())

def add_key(keys, name, value):
    """keys: norm → (value, 允许前缀);同 key 取大 value。"""
    k = norm(name)
    if not k: return
    prefix = len(k) > 3 and k not in EXACT
    old = keys.get(k)
    if old is None or value > old[0]: keys[k] = (value, prefix if old is None else (prefix or old[1]))

def find(keys, name):
    """命中的 key:精确,或允许前缀的最长前缀("loreal paris" → loreal);没有 → None。"""
    n = norm(name)
    if not n: return None
    if n in keys: return n
    w = n.split()
    for i in range(len(w) - 1, 0, -1):
        k = ' '.join(w[:i])
        if k in keys and keys[k][1]: return k
    return None

def lookup(keys, name):
    k = find(keys, name); return keys[k][0] if k else 0

def visits(s):
    m = re.match(r'\s*([\d.]+)\s*([KkMm]?)', str(s or ''))
    if not m: return 0.0
    v = float(m.group(1)) * {'k': 1e3, 'm': 1e6}.get(m.group(2).lower(), 1)
    return v / 3 if '3-mo' in s else v

def title_words(brand, title):
    """榜单标题去掉品牌词后的英文词(≥3 字母)前 3 个;不足 2 个词就不比(太泛)。"""
    bw = set(norm(brand).split())
    ws = [w for w in re.findall(r'[a-z][a-z0-9]{2,}', norm(title)) if w not in bw and w not in STOP]
    return tuple(ws[:3]) if len(ws) >= 2 else ()

def mp_brands():
    out, off = [], 0
    while True:
        rows = pq("SELECT brand, COUNT(*) n, MAX(brand_tier) t, MAX(CASE WHEN hot > 0 THEN 1 ELSE 0 END) h FROM market_products"
                  f" WHERE brand IS NOT NULL AND brand <> '' GROUP BY brand ORDER BY brand LIMIT 8000 OFFSET {off}")
        out += rows; off += 8000
        if len(rows) < 8000: return out

def mp_products(brand_values):
    out = []
    for i in range(0, len(brand_values), 400):
        chunk, last = brand_values[i:i + 400], 0
        while True:
            rows = pq(f"SELECT id, brand, title, title_en, hot FROM market_products WHERE brand IN ({','.join(q(b) for b in chunk)}) AND id > {last} ORDER BY id LIMIT 5000")
            out += rows
            if len(rows) < 5000: break
            last = rows[-1]['id']
    return out

def main(dry=False):
    t0 = time.time()
    # 1) 大品牌 key 表:清单 → 3;brand_leads 前 100 → 3,其余有流量 → 2
    tier_keys = {}
    for name in BIG.replace('\n', ' ').split(','): add_key(tier_keys, name.strip(), 3)
    leads = [r for r in pq("SELECT name, visits_month FROM brand_leads WHERE visits_month IS NOT NULL AND visits_month <> ''") if visits(r['visits_month']) > 0]
    leads.sort(key=lambda r: -visits(r['visits_month']))
    for i, r in enumerate(leads): add_key(tier_keys, r['name'], 3 if i < TOP_N else 2)
    # 2) 榜单:品牌 → hot 1;(品牌, 标题词) → 候选同款
    board = pq("SELECT brand, title FROM ecom_items WHERE brand IS NOT NULL AND brand <> '' GROUP BY brand, title")
    hot_keys = {}; same = defaultdict(set)                  # same[norm(brand)] = {标题词组}
    for r in board:
        add_key(hot_keys, r['brand'], 1)
        ws = title_words(r['brand'], r['title'])
        if ws: same[norm(r['brand'])].add(ws)
    # 3) 库里每个品牌算 tier / hot,对比现值
    brands = mp_brands()
    changed = defaultdict(list); cover = defaultdict(lambda: [set(), 0]); hot_values = []
    for r in brands:
        t, h = lookup(tier_keys, r['brand']), lookup(hot_keys, r['brand'])
        if t: cover[f'tier{t}'][0].add(norm(r['brand'])); cover[f'tier{t}'][1] += r['n']
        if h: cover['hot'][0].add(norm(r['brand'])); cover['hot'][1] += r['n']; hot_values.append(r['brand'])
        if (t, h) != (int(r['t'] or 0), int(r['h'] or 0)): changed[(t, h)].append(r['brand'])
    changed_values = {b for lst in changed.values() for b in lst}
    print(f"品牌 {len(brands):,} 个 · tier3 {len(cover['tier3'][0])} 牌/{cover['tier3'][1]:,} 款 · tier2 {len(cover['tier2'][0])} 牌/{cover['tier2'][1]:,} 款"
          f" · 上榜品牌 {len(cover['hot'][0])} 牌/{cover['hot'][1]:,} 款 · 本次品牌级变动 {len(changed_values):,} 个品牌值", flush=True)
    # 4) 榜单同款:只在上榜品牌的产品里比标题
    prods = mp_products(hot_values) if hot_values else []
    up2, down1 = [], []
    for p in prods:
        tn = norm(p['title']) + ' ' + norm(p['title_en'])
        new = 2 if any(all(w in tn for w in ws) for ws in same.get(find(hot_keys, p['brand']), ())) else 1
        old = 1 if p['brand'] in changed_values else int(p['hot'] or 0)   # 品牌级 UPDATE 会先把这些行刷成 1
        if new == 2 and old != 2: up2.append(p['id'])
        elif new == 1 and old == 2: down1.append(p['id'])
    up2s, down1s = set(up2), set(down1)
    n2 = sum(1 for p in prods if p['id'] in up2s or (int(p['hot'] or 0) == 2 and p['id'] not in down1s and p['brand'] not in changed_values))
    print(f"上榜品牌产品 {len(prods):,} 款 · 榜单同款 hot=2 共 {n2:,} 款(本次 +{len(up2)} / -{len(down1)})", flush=True)
    if dry: print('--dry 不写'); return
    # 5) 写:品牌级(500 个品牌一条)→ 产品级 hot=2 → rank_score 按 id 段
    lines = []
    for (t, h), lst in changed.items():
        for i in range(0, len(lst), 500):
            lines.append(f"UPDATE market_products SET brand_tier = {t}, hot = {h} WHERE brand IN ({','.join(q(b) for b in lst[i:i + 500])});")
    for ids, v in ((up2, 2), (down1, 1)):
        for i in range(0, len(ids), 500): lines.append(f"UPDATE market_products SET hot = {v} WHERE id IN ({','.join(str(x) for x in ids[i:i + 500])});")
    if lines: print('  品牌/同款写入', pexec(lines, batch=1, gap=3, label='tier/hot'), '行', flush=True)
    maxid = int(pq('SELECT MAX(id) m FROM market_products')[0]['m'] or 0)
    step = 50000
    lines = [f"UPDATE market_products SET rank_score = {EXPR} WHERE id BETWEEN {a} AND {a + step - 1} AND rank_score <> {EXPR};" for a in range(1, maxid + 1, step)]
    print('  rank_score 写入', pexec(lines, batch=1, gap=3, label='rank_score'), '行', flush=True)
    top = pq("SELECT brand, rank_score FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 ORDER BY rank_score DESC, last_seen DESC, id DESC LIMIT 10")
    print('列表首页前 10:', ' · '.join(f"{r['brand']}({r['rank_score']})" for r in top))
    print(f'耗时 {time.time() - t0:.0f}s')

if __name__ == '__main__':
    assert norm("L'Oréal Paris") == 'loreal paris' and norm('L’OREAL NORGE AS') == 'loreal norge as' and norm('e.l.f.') == 'elf' and norm('Dr. Jart+') == 'dr jart'
    ks = {}; add_key(ks, "L'Oréal", 3); add_key(ks, 'MAC', 3); add_key(ks, 'Natura', 3)
    assert lookup(ks, 'loreal-professionnel') == 3 and lookup(ks, 'L Oreal') == 0 and lookup(ks, 'mac') == 3 and lookup(ks, 'macadamia') == 0
    assert lookup(ks, 'natura') == 3 and lookup(ks, 'natura-siberica') == 0
    assert visits('1.3M') == 1300000 and visits('307K (3-mo total)') == 307000 / 3 and visits('—') == 0
    assert title_words('CeraVe', 'CeraVe Foaming Facial Cleanser 泡沫洁面乳 473ml') == ('foaming', 'facial', 'cleanser') and title_words('Aveeno', 'Aveeno 身体乳') == ()
    main(dry='--dry' in sys.argv)
