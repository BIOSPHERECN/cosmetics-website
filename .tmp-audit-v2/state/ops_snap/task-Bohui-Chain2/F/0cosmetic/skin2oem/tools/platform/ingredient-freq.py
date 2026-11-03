"""成分出现频率 → 解读待办表。G 线 09-22:facts 只覆盖几千个 key,market_products 16 万款全成分里不同 key 有几万个,按出现频率补长尾。
① 流式翻平台库 market_products.inci(按 id 分页 5000,不一次拉全表),用与解读页同一套切分 + fact_key,数每个 key 出现在多少款产品里
   → tools/platform/_ingredient_freq.json({key: freq},按 freq 降序);
② 还没有 ingredient_facts 的 key 写进 ingredient_todo(freq ≥ MIN_FREQ;已有 facts 的标 done=1),可重复跑(刷新 freq、补新 key)。
    python tools/platform/ingredient-freq.py            # 全跑
    python tools/platform/ingredient-freq.py --todo-only # 不重扫,用上次的 json 刷 todo"""
import io, os, re, sys, json, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); from _pd1 import pq, pexec, fact_key, q
OUT = os.path.join(HERE, '_ingredient_freq.json')
MIN_FREQ = 2   # ponytail: 只出现在 1 款产品里的 key 多半是错字 / 半截 / 非英文名,先不派;要补长尾把它改成 1 再跑
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
_DIRTY_PROBE = re.compile(r'[*„†‡+\\\[\]{}\u2060\u00ad\ufeff\u200b\ufffc]')
def split_inci(s):
    return join_locants([x for x in (re.sub(r'\s+', ' ', _PAREN.sub(' ', p)).strip() for p in _SPLIT.split(str(s or ''))) if x])

def scan():
    freq, last, n, occ, dirty = {}, 0, 0, 0, 0
    while True:
        page = pq(f"SELECT id, inci FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 AND id > {last} ORDER BY id LIMIT 5000")
        if not page: break
        for r in page:
            names = split_inci(r['inci'])[:120]   # 解读页只看前 120 个
            dirty += sum(1 for x in names if _DIRTY_PROBE.search(x))
            keys = {k for k in map(fact_key, names) if k}
            for k in keys: freq[k] = freq.get(k, 0) + 1
            occ += len(keys)
        n += len(page); last = page[-1]['id']
        print(f'  扫到 id {last},{n} 款,{len(freq)} 个 key', flush=True)
        if len(page) < 5000: break
    freq = dict(sorted(freq.items(), key=lambda kv: -kv[1]))
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(freq, ensure_ascii=False, separators=(',', ':')))
    print(f'扫完 {n} 款:不同 key {len(freq)},产品-成分出现 {occ},带脏字符的成分名 {dirty}({dirty / max(1, occ):.2%})')
    return freq

def report(freq):
    vals = list(freq.values()); tot = sum(vals)
    for top in (5000, 15000):
        print(f'  前 {top} 个 key 覆盖 {sum(vals[:top]) / tot:.1%} 的产品-成分出现')
    print(f'  freq ≥ 2 的 key {sum(1 for v in vals if v >= 2)} 个,freq = 1 的 {sum(1 for v in vals if v == 1)} 个')

def todo(freq):
    pexec([l for l in io.open(os.path.join(HERE, '..', '..', 'db', 'migrations', '0122_ingredient_todo.sql'), encoding='utf-8').read().split('\n') if l.strip() and not l.startswith('--')], label='migrate')
    have, last = set(), ''
    while True:
        page = pq(f"SELECT inci_key FROM ingredient_facts WHERE inci_key > {q(last)} ORDER BY inci_key LIMIT 3000")
        have |= {fact_key(r['inci_key']) for r in page} | {r['inci_key'] for r in page}
        if len(page) < 3000: break
        last = page[-1]['inci_key']
    miss = [(k, v) for k, v in freq.items() if v >= MIN_FREQ and k not in have]
    print(f'facts 已有 {len(have)} 个 key;待办 {len(miss)} 个(freq ≥ {MIN_FREQ}),前 5000 待办覆盖 {sum(v for _, v in miss[:5000]) / max(1, sum(freq.values())):.1%} 出现', flush=True)

    # 09-22 P 线:位号切词修好后这一轮会带进一批**新** key。老板放开了 INSERT,条件是可回滚 ——
    # ① 真正新增(库里原来没有)的 key 单独落一份清单,发现不对能一键删;
    # ② 新增行打来源标记 src,别和解读工人自己加的混成一锅(ON CONFLICT 时不覆盖已有行的 src)。
    src_tag = 'freq-rescan-' + time.strftime('%Y%m%d')
    cols = {r['name'] for r in (pq('PRAGMA table_info(ingredient_todo)') or [])}
    if 'src' not in cols:
        pexec(['ALTER TABLE ingredient_todo ADD COLUMN src TEXT;'], label='addcol')
    exist, last = set(), ''
    while True:
        page = pq(f"SELECT inci_key FROM ingredient_todo WHERE inci_key > {q(last)} ORDER BY inci_key LIMIT 3000")
        exist |= {r['inci_key'] for r in page}
        if len(page) < 3000: break
        last = page[-1]['inci_key']
    added = [k for k, _ in miss if k not in exist]
    roll = os.path.join(HERE, '..', '..', 'data', f'_freq_inserted_{time.strftime("%Y%m%d")}.txt')
    os.makedirs(os.path.dirname(roll), exist_ok=True)
    io.open(roll, 'w', encoding='utf-8', newline='\n').write(
        f'-- {src_tag}:本轮新增 {len(added)} 个 key。回滚:\n'
        f"-- DELETE FROM ingredient_todo WHERE src = '{src_tag}' AND done = 0;\n" + '\n'.join(added) + '\n')
    print(f'本轮新增 {len(added)} 个 key(库里原有 {len(exist)}),清单 → {os.path.relpath(roll, os.path.join(HERE, "..", ".."))}', flush=True)

    lines = [f"INSERT INTO ingredient_todo (inci_key, freq, src) VALUES ({q(k)}, {v}, {q(src_tag)}) "
             f"ON CONFLICT(inci_key) DO UPDATE SET freq = excluded.freq;" for k, v in miss]   # 不动已有行的 src
    lines.append("UPDATE ingredient_todo SET done = 1 WHERE done = 0 AND inci_key IN (SELECT inci_key FROM ingredient_facts);")
    pexec(lines, label='todo')
    print('todo 表:', pq('SELECT COUNT(*) n, SUM(done) d FROM ingredient_todo'))
    print('本轮来源标记行数:', pq(f"SELECT COUNT(*) n FROM ingredient_todo WHERE src = {q(src_tag)}"))

if __name__ == '__main__':
    assert split_inci('Water (Aqua), 1,2-Hexanediol, CI 17200, Glycerin*; Parfum') == ['Water', '1,2-Hexanediol', 'CI 17200', 'Glycerin*', 'Parfum']
    freq = json.load(io.open(OUT, encoding='utf-8')) if '--todo-only' in sys.argv else scan()
    report(freq); todo(freq)
