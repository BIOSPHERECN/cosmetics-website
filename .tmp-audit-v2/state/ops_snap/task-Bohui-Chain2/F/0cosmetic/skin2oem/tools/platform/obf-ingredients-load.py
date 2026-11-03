# -*- coding: utf-8 -*-
r"""P 线 09-22:Open Beauty Facts 官方 ingredients 明细 → product_ingredients(行级「产品 × 成分」)。
素材 F:\0cosmetic\助手交付\obf_probe\raw\ingredients_raw.csv(WorkBuddy 交付,371,092 行,20,756 barcode)。
  python tools/platform/obf-ingredients-load.py --dry     # 只算不写
  python tools/platform/obf-ingredients-load.py           # 建表 + 灌 product_ingredients
  python tools/platform/obf-ingredients-load.py --freq    # 再按明细回补 ingredient_todo.freq(只改已有行)
OBF 自己在位号逗号处切碎(「1」+「2-Hexanediol」),灌库前按 splitInci 的逆规则接回去。"""
import io, os, re, sys, csv, json, time, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from _pd1 import pq, fact_key, q
import crawl_kit as ck   # d1 / parse_d1 / d1_import:批 ≤1000 行·批间 sleep·7500 歇 90 重试同批·连败 3 次停
ROOT = os.path.dirname(os.path.dirname(HERE))
CSVF = r'F:\0cosmetic\助手交付\obf_probe\raw\ingredients_raw.csv'
DRY, FREQ = '--dry' in sys.argv, '--freq' in sys.argv
_SPLIT = re.compile(r'[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))')   # = decoder.ts splitInci
# 09-22 老板拍的 inci_key 长度闸:OBF 标签常把整段说明文(使用方法 / 警告 / 多语言宣传)混进成分位,
# 最长的一条 5,188 字符。抽查 80–200 区间没有一个真成分名,而真 INCI 最长的共聚物也就 50 上下,
# 200 是两倍余量。闸掉的不丢 —— 原文在 market_products.inci,完整 key 落 TOOLONG 清单可回补。
MAXKEY = 200
TOOLONG = os.path.join(ROOT, 'data', '_pi_toolong_20260922.jsonl')

_STARTED = [False]   # 第一批写成功之前 = 还在排队抢导入锁
_PROBED = [False]    # 探活过且之后没失败过 —— 为真就跳过探活,直接写
STALL = ('7500', 'already', 'cannot start another import')   # 真·排队:别人占着锁 / 整库挂,歇久点


def _wait(err, i, tries):
    """退避分两档。09-22 S 线带回的新模式:
         {"error": {"text": "Not currently importing anything."}}
         {"error": {"text": "Not currently import at bookmark 0000037d-..."}}
       报在 `Uploading complete.` **之后** —— 文件已传上去,是 D1 侧导入会话在两步之间掉了,
       不是排队。crawl_kit 的「Total queries executed == 本批语句数」能准确判失败并重跑同一批,
       没出现过半批入库。这种歇 30 秒就够(S 线 6 次全一把过),套 7500 那 90 秒是白等一分钟。"""
    s = str(err).lower()
    wait = 90 if any(k in s for k in STALL) else 30
    tag = '排队' if not _STARTED[0] else ('等锁' if wait == 90 else '会话掉了,重跑同批')
    print(f'   {tag} {i + 1}/{tries}:{str(err)[:80]},睡 {wait} 秒', flush=True)
    time.sleep(wait)


def probed_runner(path, n):
    """crawl_kit._run_file 外面套一层探活:09-22 夜里七八条线同时写,D1 会 7500 /「Cannot start
       another import」。写之前先 SELECT 1,不通就睡 90 秒再来。
       结果判定交给 _run_file(校验 Total queries executed == 本批语句数),不自己数 rows_written ——
       N 线今晚就是被 out.find('[') 那套误判成失败、把写成功的批重试到停机。

       **排队不是故障**:起跑那一下别的线还占着导入锁,第一批愿意等 30 × 90 秒 ≈ 45 分钟;
       一旦写成功过一次,就说明锁到手了,之后恢复严格的 3 次(真出事要早停,别闷头灌)。"""
    tries = 3 if _STARTED[0] else 30
    err = ''
    for i in range(tries):
        # 09-22 23:2x 实测:探活是一次完整的 npx wrangler 冷启动,**跟一次写一样贵**(各约 10 秒)。
        # 每批都探 = 728 × 10 秒 ≈ 2 小时,而它并没多给一层保护 —— 写失败本来就会走下面的
        # 90 秒退避。所以只在两种真正有用的场合探:① 冷启动第一批之前(确认库活着);
        # ② 上一批刚失败(别硬冲)。其余直接写。批大小与批间间隔一个字不动。
        if not _PROBED[0] or i > 0:
            if not ck.d1('--command', 'SELECT 1'):
                err = 'SELECT 1 不通(整库 7500 或网络)'
                if i < tries - 1: _wait(err, i, tries)
                continue
            _PROBED[0] = True
        ok, err = ck._run_file(path, n)
        if ok:
            _STARTED[0] = True
            return True, ''
        _PROBED[0] = False   # 这一批失败了,下一次进来重新探活
        if i < tries - 1: _wait(err, i, tries)
    return False, err or '连败'

# OBF 把位号逗号也当分隔符切了(`1,2-Hexanediol` → `1` + `2-Hexanediol`,对账里 2,218 条 / 1,028 款)。
# 与 tools/market/inci_index.py join_locants() / decoder.ts joinLocants() 逐字同一套,改一处要同步全部 8 份。
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

def load_csv():
    per = collections.defaultdict(list)
    for r in csv.DictReader(io.open(CSVF, encoding='utf-8', newline='')):
        x = (r['ingredient_raw'] or '').strip()
        if x: per[r['barcode']].append(x)
    # OBF 不切中文顿号 / 分号:25 款中日产品整张配方表挤成一条,落库前再过一遍我们自己的 splitInci
    return {b: [y for x in join_locants(v) for y in ([z.strip() for z in _SPLIT.split(x) if z.strip()] or [x])] for b, v in per.items()}

MAP = os.path.join(HERE, '_obf_pid_map.json')
def obf_pid_map():
    """barcode → market_products.id。翻 16 页 d1 偶发 fetch failed,缓存一份,下次直接用(--remap 重拉)。"""
    if os.path.exists(MAP) and '--remap' not in sys.argv:
        return json.load(io.open(MAP, encoding='utf-8'))
    m, last = {}, 0
    while True:
        page = pq(f"SELECT id, pid FROM market_products WHERE platform='openbeautyfacts' AND id > {last} ORDER BY id LIMIT 5000")
        if not page: break
        for r in page: m[r['pid']] = r['id']
        last = page[-1]['id']
        if len(page) < 5000: break
    json.dump(m, io.open(MAP, 'w', encoding='utf-8'), separators=(',', ':'))
    return m

def main():
    per = load_csv(); pid2id = obf_pid_map()
    print(f'明细 {len(per)} 个 barcode(接回位号碎片后 {sum(len(v) for v in per.values())} 段);市场库 OBF 产品 {len(pid2id)}')
    rows, toolong, skip_bc, skip_seg, dup = [], [], 0, 0, 0
    for bc, segs in per.items():
        pid = pid2id.get(bc)
        if pid is None: skip_bc += 1; skip_seg += len(segs); continue
        seen = set()
        for i, raw in enumerate(segs, 1):
            k = fact_key(raw)
            if not k: continue
            if k in seen: dup += 1; continue
            seen.add(k)
            if len(k) > MAXKEY:   # 整段说明文被当成一个成分(最长 5,188 字符)。不给垃圾建索引。
                toolong.append({'product_id': pid, 'barcode': bc, 'chars': len(k), 'inci_key': k})
                continue
            rows.append((pid, k, raw[:200], i))
    # 可回滚:闸掉的全量落盘(带完整原始 key),以后想放宽阈值直接从它补灌,不用重跑全库
    os.makedirs(os.path.dirname(TOOLONG), exist_ok=True)
    io.open(TOOLONG, 'w', encoding='utf-8', newline='\n').write(
        ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in toolong))
    print(f'落库 {len(rows)} 行 = 原 {len(rows) + len(toolong)} − 超长闸掉 {len(toolong)}'
          f'(inci_key > {MAXKEY} 字符,原文仍在 market_products.inci,清单 {os.path.relpath(TOOLONG, ROOT)});'
          f'barcode 对不上跳过 {skip_bc} 款 / {skip_seg} 条;同一产品重复成分合并 {dup} 条')
    if DRY: return
    mig = io.open(os.path.join(ROOT, 'db', 'migrations', '0128_product_ingredients.sql'), encoding='utf-8').read()
    ddl = [l for l in mig.splitlines() if l.strip() and not l.strip().startswith('--')]   # 按行去注释(多行 CREATE TABLE 不能按 ; 切)
    io.open(os.path.join(HERE, '_pi_migrate.sql'), 'w', encoding='utf-8', newline='\n').write('\n'.join(ddl) + '\n')
    assert ck.d1('--file', os.path.join(HERE, '_pi_migrate.sql')), '建表失败'
    res = ck.d1('--command', 'SELECT COUNT(*) n FROM product_ingredients')   # 断点续灌:rows 顺序固定,已写 n 行就从第 n 行接着来
    done = int((res[0]['results'][0]['n']) if res else 0)
    rows = rows[done:]
    print(f'已在库 {done} 行,本轮还要灌 {len(rows)} 行(批 500 · 批间 10 秒,约 {len(rows) // 500 * 16 // 60} 分钟)', flush=True)
    ck.d1_import([{'product_id': p, 'inci_key': k, 'raw': r, 'position': i, 'source': 'obf'} for p, k, r, i in rows],
                 'product_ingredients', mode='INSERT OR REPLACE', tag='pi', batch=500, pause=10, runner=probed_runner)
    print('表:', pq('SELECT COUNT(*) n, COUNT(DISTINCT product_id) p, COUNT(DISTINCT inci_key) k FROM product_ingredients'))

def our_keys(inci):
    parts = [re.sub(r'\s+', ' ', re.sub(r'[（(][^）)]*[）)]', ' ', p)).strip() for p in _SPLIT.split(inci)]
    return {k for k in (fact_key(x) for x in [p for p in parts if p][:120]) if k}

def freq_backfill():
    """ingredient_todo.freq 回补:把「我们从 inci 字符串切出来的 OBF 那一段」换成官方明细算的真频次。
       freq_new = 全库旧频次(_ingredient_freq.json) - 我们在 OBF 产品上数的 + OBF 官方明细数的。
       只 UPDATE 已有行,不 INSERT —— 云端解读工人正在按 (done, freq DESC) 取货,不能往队列里塞新行。"""
    per = load_csv(); pid2id = obf_pid_map()
    inci, last = {}, 0
    while True:   # 只拿有明细的那批产品的 inci,用来扣掉我们自己数的那一份
        page = pq(f"SELECT id, pid, inci FROM market_products WHERE platform='openbeautyfacts' AND id > {last} ORDER BY id LIMIT 4000")
        if not page: break
        for r in page:
            if r['pid'] in per: inci[r['pid']] = r['inci'] or ''
        last = page[-1]['id']
        if len(page) < 4000: break
    official, ours = collections.Counter(), collections.Counter()
    for bc, segs in per.items():
        official.update({k for k in map(fact_key, segs) if k})
        if len(inci.get(bc, '')) > 30: ours.update(our_keys(inci[bc]))   # 与 _ingredient_freq.json 同一道 length>30 过滤
    allf = json.load(io.open(os.path.join(HERE, '_ingredient_freq.json'), encoding='utf-8'))
    new = {k: max(0, allf.get(k, 0) - ours.get(k, 0)) + official.get(k, 0) for k in set(allf) | set(official)}
    cur, last = {}, ''
    while True:
        page = pq(f"SELECT inci_key, freq FROM ingredient_todo WHERE inci_key > {q(last)} ORDER BY inci_key LIMIT 3000")
        for r in page: cur[r['inci_key']] = r['freq']
        if len(page) < 3000: break
        last = page[-1]['inci_key']
    chg = {k: new[k] for k in cur if k in new and new[k] != cur[k]}
    print(f'队列 {len(cur)} 行,频次要改的 {len(chg)} 行(新频率表覆盖 {sum(1 for k in cur if k in new)} 行)')
    rank_old = {k: i for i, k in enumerate(sorted(cur, key=lambda k: (-cur[k], k)), 1)}
    nf = {k: new.get(k, cur[k]) for k in cur}
    rank_new = {k: i for i, k in enumerate(sorted(nf, key=lambda k: (-nf[k], k)), 1)}
    movers = sorted(cur, key=lambda k: -abs(rank_old[k] - rank_new[k]))[:10]
    print('排名变化最大的 10 个:')
    for k in movers:
        print(f"  {rank_old[k]:6d} → {rank_new[k]:6d}  ({rank_old[k]-rank_new[k]:+6d} 名)  freq {cur[k]} → {nf[k]}  {k[:60]}")
    if chg and not DRY:   # 只 UPDATE,不 INSERT;走 crawl_kit 的批/退避,runner 带探活
        io.open(os.path.join(HERE, '_pi_freq.sql'), 'w', encoding='utf-8', newline='\n').write(
            '\n'.join(f"UPDATE ingredient_todo SET freq = {v} WHERE inci_key = {q(k)};" for k, v in chg.items()) + '\n')
        ok, err = probed_runner(os.path.join(HERE, '_pi_freq.sql'), len(chg))
        print('freq 回补', '成功' if ok else '失败:' + err)
        print('队列:', pq('SELECT COUNT(*) n, SUM(done) d, MAX(freq) mx FROM ingredient_todo'))

if __name__ == '__main__':
    assert join_locants(['Dimethicone', '1', '2-Hexanediol', 'Alcohol']) == ['Dimethicone', '1,2-Hexanediol', 'Alcohol']
    assert join_locants(['Toluene-2', '5-Diamine Sulfate']) == ['Toluene-2,5-Diamine Sulfate']
    assert join_locants(['Aqua', 'Glycerin']) == ['Aqua', 'Glycerin']            # 正常相邻不乱接
    assert join_locants(['CI 17200', 'Methylisothiazolinone']) == ['CI 17200', 'Methylisothiazolinone']
    assert join_locants(['CI 17200', '12-Hydroxystearic Acid']) == ['CI 17200', '12-Hydroxystearic Acid']   # 17200 是 5 位,不许接
    freq_backfill() if FREQ else main()
