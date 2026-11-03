"""市场结构性指标 → market_stats(K 线:把「一周一个爆款榜」扩成能对比的结构数)。

创始人 09-22:「市场调研不能只有每周一个爆款分析,需要更多分析数据」。
指标全部只从库里已有的行算,**每条必带样本量 n**;算不出样本量的不做、不编。
evidence_level 一律 'D'(市场观察)—— 这是频率,**不是销量**。

指标 / 口径 / 来源
  price_band       各市场 × 品类的美元价格带分布 + 中位价(dim='p50')
                   ← market_snapshots(amazon-us,取最新一期)+ ecom_items(价格文本里读得出美元的行)
                   market_products 没有价格列,所以价格只能来自这两张榜单表。
  ingredient_freq  各品类 TOP 成分出现频率 ← market_products.inci,切词与归一用 decoder.ts 同一套(_pd1.fact_key)
  claim_freq       各市场 × 品类 TOP 宣称词 ← market_products.claims 里**词条型**的行(带「·」分隔);
                   inkeedecoder / spacenk 那种整段营销文案不是宣称清单,一律不算。dim 前缀 zh:/en: 把中英分开。
  brand_hhi        品牌集中度(赫芬达尔指数,0–10000)← market_products.brand,按品类
  new_sku_rate     近 30 / 90 天新增 SKU 占比 ← market_products.first_seen
                   ⚠ first_seen 现在是**入库日**不是上架日,全库挤在 2026-09-16..22,占比恒等于 1 ——
                   这种退化值不落表(见 DEGENERATE 判定),等真正的上架日源。
  board_turnover   同一榜相邻两期的换榜率 ← market_snapshots(有 09-16 / 09-17 两期)+ ecom_items(只有 1 期 → 0 行)
                   cat 存榜单标识,dim = new(新上榜占比)/ out(掉榜占比)/ stay / rank_move(存活项平均名次位移)
  complaint_topic  评论痛点聚类 —— **库里没有评论正文**(ecom_items.reviews 只是评论条数),不做、不编。

    python tools/platform/market-stats.py            # 全量跑,写库
    python tools/platform/market-stats.py --dry      # 只算不写
    python tools/platform/market-stats.py --date 2026-09-22
"""
import os, re, sys, json, datetime, unicodedata
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from _pd1 import pq, pexec, fact_key, q

PAGE = 4000          # 一页 4000 行约 9 秒、2MB;再大 wrangler 的 JSON 会慢得不值
TOP_ING, TOP_CLM = 30, 15
MIN_ING, MIN_CLM, MIN_BRD, MIN_PRICE, MIN_BOARD = 50, 30, 50, 15, 10
METRICS = ('price_band', 'ingredient_freq', 'claim_freq', 'brand_hhi', 'new_sku_rate', 'board_turnover', 'complaint_topic')
DEGENERATE = 0.95    # 近 30 天占比超过它就说明日期列是入库日不是上架日,不落表

# ── 类目归一 ──────────────────────────────────────────────────────────────
# cat / cat_zh / cat_jev 三列混着中文、英文 slug、荷兰语,只认下面这批规范中文名;
# 其余(open-beauty-facts / cosmetic-products / beauty / 其他 …)是分类树根节点或垃圾桶,不进统计。
CANON = set('''面霜 精华 洁面 面膜 防晒 护肤 洗发 粉底 护发素 身体乳 爽肤水 口红 沐浴露 眼霜 眼妆 彩妆 卸妆 身体
洗发护发 牙膏 香水 护发 手霜 漱口水 唇膏 止汗 染发 乳液 眼影 睫毛膏 腮红 气垫 遮瑕 散粉 精油 发膜 口腔 男士 儿童 喷雾'''.split())
SLUG = {'shampoos': '洗发', 'shampoo': '洗发', 'sunscreen': '防晒', 'sunscreens': '防晒', 'toothpastes': '牙膏',
        'toothpaste': '牙膏', 'deodorants': '止汗', 'shower-gels': '沐浴露', 'skincare': '护肤', 'skin care': '护肤',
        'parfum': '香水', 'perfumes': '香水', 'make-up': '彩妆', 'makeup': '彩妆', 'hair-care': '护发',
        'hair-masks': '发膜', 'hand-creams': '手霜', 'mouthwash': '漱口水', 'lip-balms': '唇膏', 'haarverf': '染发',
        'face-creams': '面霜', 'body-lotions': '身体乳', 'conditioners': '护发素',
        # OBF 自己那套多语言 slug,只补含义唯一的(soaps / savons 到底是洗手还是洁面不清楚,就不猜)
        'cremes-douche': '沐浴露', 'shower-gel': '沐浴露', 'roll-on-deodorants': '止汗', 'deodorant': '止汗',
        'anti-dandruff-shampoos': '洗发', 'body-milks': '身体乳', 'body-creams': '身体乳', 'body-lotion': '身体乳',
        'hair-conditioners': '护发素', 'hair-dyes': '染发', 'dentifrice': '牙膏', 'mouthwashes': '漱口水',
        'lip-cosmetics': '唇膏', 'lip-balm': '唇膏', 'visage': '护肤'}

def norm_cat(*vals):
    for v in vals:
        s = str(v or '').strip()
        if s in CANON: return s
        if SLUG.get(s.lower()): return SLUG[s.lower()]
    return None

def norm_market(country):
    s = str(country or '').strip().upper()
    return 'GLOBAL' if s == 'GL' else (s if len(s) == 2 else None)

def norm_brand(b):
    s = unicodedata.normalize('NFKD', str(b or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', re.sub(r"[^\w\s&'-]", ' ', s)).strip().upper() or None

# ── 切词 ──────────────────────────────────────────────────────────────────
_SPLIT = re.compile(r'[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))')   # = decoder.ts splitInci
# 09-22 P 线实测:位号逗号后带空格时(`Aqua, 1, 2-Hexanediol`)上面的 lookahead 失效,切出 `1`/`3-DIOL`
# 这类碎片(全库 667 个碎片键、10,385 次出现)。不改正则(消融过,加任何分隔符与 OBF 一致率都降),切完接回去:
# 后一段 `2-` 开头 + 前一段结尾数字串 ≤2 位 = 同一个名字;`CI 17200, 12-Hydroxystearic` 不误接(17200 是 5 位)。
# 与 decoder.ts joinLocants() 同一套,回归断言在 tools/market/test_split_inci.py。
_LOCANT_HEAD = re.compile(r"^\d{1,2}\s*[-–－]")
_LOCANT_TAIL = re.compile(r"(?:^|\D)\d{1,2}$")


def join_locants(parts):
    out = []
    for p in parts:
        if out and _LOCANT_HEAD.match(p) and _LOCANT_TAIL.search(out[-1]):
            out[-1] = out[-1] + "," + p
        else:
            out.append(p)
    return out


_PAREN = re.compile(r'[（(][^）)]*[）)]')
_CJK = re.compile(r'[一-鿿]')

def split_inci(s):
    return join_locants([x for x in (re.sub(r'\s+', ' ', _PAREN.sub(' ', p)).strip() for p in _SPLIT.split(str(s or ''))) if x])

_SLUG_ONLY = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
_META = ('来源', '采集', '价 ', '价格', '评论', '评分', '排名', '榜单', '成分来源')
def claim_tokens(s):
    """只认词条型 claims(「·」分隔的标签串),整段营销文案返回空。

    09-22 踩过的坑:inkeedecoder 全部 11.3 万行的 claims 都是「一段营销文案 · 来源 INCIDecoder」,
    末尾那截是采集出处不是宣称;短文案(「Tinted lip balm」)剥掉出处后长得就像标签,会被算成宣称词。
    所以:先砍掉 ‖ 之后的采集元数据 → 去掉出处 / 价 / 评论这类元数据段 →
    剩两段以上才算标签串;只剩一段的必须是纯 slug(bio / made-in-france)才收。宁可少算,不能把文案当宣称。
    """
    head = str(s or '').split('‖')[0]
    parts = [re.sub(r'\s+', ' ', p).strip(' .,;:') for p in head.split('·')]
    parts = [p for p in parts if p and not p.startswith(_META)]
    # 剩一段的:只认纯 slug(OBF 的 bio / made-in-france / green-dot 这类,5,326 行),
    # 其余单段一律丢 —— 「Tinted lip balm」剥掉出处后也只剩一段,但它是文案不是标签。
    if len(parts) == 1 and not _SLUG_ONLY.match(parts[0]): return []
    if not parts: return []
    out = []
    for p in parts:
        if len(p) > 40 or len(p.split()) > 5: return []   # 有一段像句子 → 整行当文案丢掉
        out.append(('zh:' if _CJK.search(p) else 'en:') + p.lower())
    return out

# ── 价格 ──────────────────────────────────────────────────────────────────
BANDS = [(5, '<$5'), (10, '$5-10'), (20, '$10-20'), (35, '$20-35'), (60, '$35-60'), (float('inf'), '$60+')]
def band(usd): return next(l for hi, l in BANDS if usd < hi)
def median(xs):
    xs = sorted(xs); m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2

_USD = re.compile(r'\$\s*([\d,]+(?:\.\d+)?)')
def prices():
    """→ (market, cat, usd, source);只取能直接读出美元的行,不做汇率换算。"""
    rows = pq("SELECT date, cat, price FROM market_snapshots WHERE price IS NOT NULL AND currency = 'USD'")
    if rows:
        last = max(r['date'] for r in rows)                     # 同一款两天都在榜,只算最新一期,别重复计数
        rs = [r for r in rows if r['date'] == last]
        # ponytail: 抓取端 price 的单位在 09-16(分)与 09-17(元)之间漂过,按当期中位数判,统一后可删这行
        cents = median([float(r['price']) for r in rs]) > 200
        print(f'  market_snapshots 最新一期 {last},{len(rs)} 行,单位判定={"分" if cents else "元"}')
        for r in rs:
            v = float(r['price']) / (100 if cents else 1)
            if 0.2 < v < 2000: yield ('US', str(r['cat']), v, 'market_snapshots')
    for r in pq("SELECT region, category, price FROM ecom_items WHERE price LIKE '%$%'"):
        m = _USD.search(str(r['price'] or ''))
        if m and r['region'] and r['category']:
            v = float(m.group(1).replace(',', ''))
            if 0.2 < v < 2000: yield (str(r['region']), str(r['category']), v, 'ecom_items')

# ── 榜单换榜率 ────────────────────────────────────────────────────────────
def boards():
    """→ (market, 榜单标识, [(date, {item: rank}), …], source);只有 1 期的榜自然出不了行。"""
    out = {}
    for r in pq("SELECT date, platform, cat, pid, rank FROM market_snapshots WHERE rank IS NOT NULL"):
        out.setdefault(('US', f"{r['platform']}·{r['cat']}", 'market_snapshots'), {}) \
           .setdefault(r['date'], {})[r['pid']] = int(r['rank'])
    for r in pq("SELECT report_date, region, platform, category, board, rank_no, url, brand, title FROM ecom_items WHERE rank_no IS NOT NULL"):
        key = str(r['url'] or '') or f"{r['brand']}|{r['title']}"
        out.setdefault((str(r['region']), f"{r['platform']}·{r['category']}·{r['board']}", 'ecom_items'), {}) \
           .setdefault(r['report_date'], {})[key] = int(r['rank_no'])
    for (mk, bd, src), dates in out.items():
        if len(dates) >= 2: yield mk, bd, sorted(dates.items())[-2:], src

# ── 主扫描 ────────────────────────────────────────────────────────────────
def hhi(counts):
    tot = sum(counts.values())
    return round(sum((c / tot * 100) ** 2 for c in counts.values()), 1) if tot else 0.0

def scan(today):
    d30 = (datetime.date.fromisoformat(today) - datetime.timedelta(days=30)).isoformat()
    d90 = (datetime.date.fromisoformat(today) - datetime.timedelta(days=90)).isoformat()
    ing, ing_n, clm, clm_n, brd, new = {}, {}, {}, {}, {}, {}
    last, seen = 0, 0
    while True:
        page = pq("SELECT id, brand, country, cat, cat_zh, cat_jev, first_seen, substr(inci, 1, 2400) inci,"
                  f" substr(claims, 1, 220) claims FROM market_products WHERE id > {last} ORDER BY id LIMIT {PAGE}")
        if not page: break
        for r in page:
            cat = norm_cat(r['cat_jev'], r['cat_zh'], r['cat'])
            if not cat: continue
            fs = str(r['first_seen'] or '')
            if fs:
                a = new.setdefault(cat, [0, 0, 0]); a[0] += 1; a[1] += fs >= d30; a[2] += fs >= d90
            b = norm_brand(r['brand'])
            if b: brd.setdefault(cat, {})[b] = brd.setdefault(cat, {}).get(b, 0) + 1
            if r['inci'] and len(r['inci']) > 30:
                ing_n[cat] = ing_n.get(cat, 0) + 1
                d = ing.setdefault(cat, {})
                for k in {k for k in map(fact_key, split_inci(r['inci'])[:120]) if k}: d[k] = d.get(k, 0) + 1
            toks = claim_tokens(r['claims'])
            mk = norm_market(r['country'])
            if toks and mk:
                clm_n[(mk, cat)] = clm_n.get((mk, cat), 0) + 1
                d = clm.setdefault((mk, cat), {})
                for tk in set(toks): d[tk] = d.get(tk, 0) + 1
        seen += len(page); last = page[-1]['id']
        print(f'  扫到 id {last},{seen} 行,{len(ing)} 个品类', flush=True)
        if len(page) < PAGE: break
    return ing, ing_n, clm, clm_n, brd, new

# ── 出表 ──────────────────────────────────────────────────────────────────
def build(today):
    rows = []   # (market, cat, metric, dim, value, n, source)
    ing, ing_n, clm, clm_n, brd, new = scan(today)

    for cat, d in sorted(ing.items()):
        n = ing_n.get(cat, 0)
        if n < MIN_ING: continue
        for k, c in sorted(d.items(), key=lambda kv: -kv[1])[:TOP_ING]:
            rows.append(('GLOBAL', cat, 'ingredient_freq', k, round(c / n, 4), n, 'market_products'))

    for (mk, cat), d in sorted(clm.items()):
        n = clm_n.get((mk, cat), 0)
        if n < MIN_CLM: continue
        for k, c in sorted(d.items(), key=lambda kv: -kv[1])[:TOP_CLM]:
            rows.append((mk, cat, 'claim_freq', k, round(c / n, 4), n, 'market_products'))

    for cat, d in sorted(brd.items()):
        n = sum(d.values())
        if n < MIN_BRD: continue
        top = sorted(d.values(), reverse=True)
        rows.append(('GLOBAL', cat, 'brand_hhi', 'hhi', hhi(d), n, 'market_products'))
        rows.append(('GLOBAL', cat, 'brand_hhi', 'brands', float(len(d)), n, 'market_products'))
        rows.append(('GLOBAL', cat, 'brand_hhi', 'top5_share', round(sum(top[:5]) / n, 4), n, 'market_products'))

    tot = [sum(a[i] for a in new.values()) for i in range(3)]
    if tot[0] and tot[1] / tot[0] >= DEGENERATE:
        print(f'⚠ new_sku_rate 不落表:近 30 天占比 {tot[1] / tot[0]:.1%} —— first_seen 是入库日不是上架日,'
              f'全库 {tot[0]} 行挤在一个导入窗口里,写出来只会是 100%。等真正的上架日源(见文件头)。')
    else:
        for cat, a in sorted(new.items()):
            if a[0] < MIN_ING: continue
            rows.append(('GLOBAL', cat, 'new_sku_rate', 'd30', round(a[1] / a[0], 4), a[0], 'market_products'))
            rows.append(('GLOBAL', cat, 'new_sku_rate', 'd90', round(a[2] / a[0], 4), a[0], 'market_products'))

    px = {}
    for mk, cat, v, src in prices(): px.setdefault((mk, cat, src), []).append(v)
    for (mk, cat, src), vs in sorted(px.items()):
        if len(vs) < MIN_PRICE: continue
        cnt = {}
        for v in vs: cnt[band(v)] = cnt.get(band(v), 0) + 1
        for _, lb in BANDS:
            rows.append((mk, cat, 'price_band', lb, round(cnt.get(lb, 0) / len(vs), 4), len(vs), src))
        rows.append((mk, cat, 'price_band', 'p50', round(median(vs), 2), len(vs), src))

    nb = 0
    for mk, bd, two, src in boards():
        (_, prev), (_, cur) = two
        if len(cur) < MIN_BOARD: continue
        stay = set(cur) & set(prev)
        move = [abs(cur[k] - prev[k]) for k in stay]
        rows.append((mk, bd, 'board_turnover', 'new', round(1 - len(stay) / len(cur), 4), len(cur), src))
        rows.append((mk, bd, 'board_turnover', 'out', round(1 - len(stay) / max(1, len(prev)), 4), len(prev), src))
        rows.append((mk, bd, 'board_turnover', 'stay', round(len(stay) / len(cur), 4), len(cur), src))
        rows.append((mk, bd, 'board_turnover', 'rank_move', round(sum(move) / len(move), 2) if move else 0.0, len(move), src))
        nb += 1
    if not nb:
        print('⚠ board_turnover 0 行:没有任何一个榜拿到 ≥2 期快照,等 BohuiMarketDaily 再抓几天。')
    print('⚠ complaint_topic 0 行:库里没有评论正文(ecom_items.reviews 只是条数),不编。缺的源见文件头。')
    return rows

def main():
    today = sys.argv[sys.argv.index('--date') + 1] if '--date' in sys.argv else None
    if not today:
        d = datetime.date.today(); today = (d - datetime.timedelta(days=d.weekday())).isoformat()   # 表口径:周一
    print(f'stat_date = {today}')
    rows = build(today)
    tally = {}
    for r in rows: tally[r[2]] = tally.get(r[2], 0) + 1
    print('\n指标行数:', json.dumps(tally, ensure_ascii=False))
    for m in sorted(tally):
        for r in [x for x in rows if x[2] == m][:3]: print(f'   {m} | {r[0]} | {r[1]} | {r[3]} = {r[4]} | n = {r[5]} | {r[6]}')
    if '--dry' in sys.argv or not rows:
        print('\n--dry 或无行,不写库'); return
    sql = [f"DELETE FROM market_stats WHERE stat_date = {q(today)} AND metric IN ({','.join(map(q, METRICS))});"]
    sql += [f"INSERT INTO market_stats (stat_date, market, cat, metric, dim, value, n, source, evidence_level)"
            f" VALUES ({q(today)}, {q(mk)}, {q(cat)}, {q(me)}, {q(dm)}, {v}, {n}, {q(sr)}, 'D')"
            f" ON CONFLICT(stat_date, market, cat, metric, dim) DO UPDATE SET value = excluded.value,"
            f" n = excluded.n, source = excluded.source;" for mk, cat, me, dm, v, n, sr in rows]
    print(f'\n写库 {len(sql)} 条 …')
    pexec(sql, label='market_stats')
    print('库内合计:', pq(f"SELECT metric, COUNT(*) n, MIN(n) mn, MAX(n) mx FROM market_stats WHERE stat_date = {q(today)} GROUP BY metric"))

if __name__ == '__main__':
    assert norm_cat('', None, 'shampoos') == '洗发' and norm_cat(None, None, 'open-beauty-facts') is None
    assert norm_cat('面霜', 'x', 'y') == '面霜' and norm_market('gl') == 'GLOBAL' and norm_market('FR') == 'FR' and norm_market('') is None
    assert norm_brand("L'Oréal Paris") == norm_brand("L'Oreal  paris") == "L'OREAL PARIS"
    assert claim_tokens('vegetarian · vegan · Contiene fluoro') == ['en:vegetarian', 'en:vegan', 'en:contiene fluoro']
    assert claim_tokens('Power charge your skin with this super concentrated serum · with a light gliding gel texture') == []
    assert claim_tokens('Brightening primer with SPF 50 pa++. · 来源 INCIDecoder') == []
    assert claim_tokens('Tinted lip balm. · 来源 INCIDecoder') == []
    assert claim_tokens('made-in-france · 来源 X') == ['en:made-in-france']
    assert claim_tokens('bio') == ['en:bio'] and claim_tokens('Mask · 来源 INCIDecoder') == []
    assert claim_tokens('A rich moisturizing cream for dry skin') == [] and claim_tokens('') == []
    assert claim_tokens('Mask ‖ 价 15.00 · 评论 174 · 来源 INCIDecoder') == []
    assert claim_tokens('自由清洁产品 · vegan') == ['zh:自由清洁产品', 'en:vegan']
    assert split_inci('Water (Aqua), 1,2-Hexanediol, CI 17200, Glycerin*; Parfum') == ['Water', '1,2-Hexanediol', 'CI 17200', 'Glycerin*', 'Parfum']
    assert band(4.99) == '<$5' and band(5) == '$5-10' and band(999) == '$60+' and median([3, 1, 2]) == 2
    assert hhi({'a': 1}) == 10000.0 and hhi({'a': 1, 'b': 1}) == 5000.0
    assert _USD.search('149000 VND（≈$5.96）').group(1) == '5.96' and _USD.search('$1,234.5').group(1) == '1,234.5'
    main()
