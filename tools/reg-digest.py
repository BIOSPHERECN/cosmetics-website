#!/usr/bin/env python3
"""法规变化速览(每月一期)+ GEO 可引用数据 —— 算好写进 pulse,页面只读一行。

2026-09-23 GEO 第 2 / 4 条。每月 1 号由计划任务 Bohui-RegDigest 跑一次(同月重跑覆盖同一期):
  pulse 'regdigest:YYYY-MM' —— /[lang]/regulations/changes/<YYYY-MM>/ 的全部内容:
      recent   近 120 天的法规动态(regulation_updates + regulations.latest_*,按市场 + 日期去重)
      upcoming 日期在今天之后的
      lists    ingredient_market_status 按市场 × 状态计数(平台库,15 个目录),与上一期比的增减
  pulse 'geo_facts' —— llms.txt「可引用数据表」里的非计数项:禁限用目录行数 / 市场数、广东牙膏备案集合运算
两个库都写(公司库给 biosphere-ai,平台库给 beauty2ai;内容不含任何工厂信息)。
证据等级 C(咨询机构摘要 + 官方目录转录),页面写明「以目标市场官方最新公告为准」。文字是我们自己的摘要,不存原文。

用法:python tools/reg-digest.py [--month 2026-09] [--only company|platform] [--dry]
自检:python tools/reg-digest.py --selftest"""
import argparse, datetime as dt, importlib.util, io, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
PLAT = r'F:/0cosmetic/skin2oem/tools/platform'
LOCKDIR = {'company': r'F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY', 'platform': r'F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_PLATFORM'}
NMPA = r'F:/0cosmetic/skin2oem/tools/prospect/from_nmpa.py'
TZ = dt.timezone(dt.timedelta(hours=8))
WINDOW_DAYS = 120


def prev_month(m):
    y, mo = map(int, m.split('-'))
    return f'{y - 1}-12' if mo == 1 else f'{y}-{mo - 1:02d}'


def build(month, asof, upd, regs, ims_rows, prev):
    """纯函数:输入库里读出的行 → 一期速览的 dict(selftest 直接测它)。"""
    names = {str(r['id']): (r.get('country_en') or r['id'], r.get('country_zh') or r.get('country_en') or r['id']) for r in regs}
    items, seen = [], set()
    for u in upd:
        key = (str(u['market_id']), str(u['date'])[:10])
        if key in seen: continue
        seen.add(key); items.append(dict(u, date=str(u['date'])[:10]))
    for r in regs:   # 市场表里的「最近一次修订」也算一条动态,和动态表同市场同日的去重
        d = str(r.get('latest_date') or '')[:10]
        if len(d) != 10 or (str(r['id']), d) in seen: continue
        seen.add((str(r['id']), d))
        items.append(dict(date=d, market_id=r['id'], title_en=None, title_zh=None,
                          summary_en=r.get('latest_what_en'), summary_zh=r.get('latest_what_zh'), source=r.get('latest_src')))
    for it in items:
        it['market_en'], it['market_zh'] = names.get(str(it['market_id']), (it['market_id'], it['market_id']))
    lo = (dt.date.fromisoformat(asof) - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    recent = sorted([i for i in items if lo <= i['date'] <= asof], key=lambda i: i['date'], reverse=True)
    upcoming = sorted([i for i in items if i['date'] > asof], key=lambda i: i['date'])
    by = {}
    for r in ims_rows:
        m = by.setdefault(str(r['market']), {'prohibited': 0, 'restricted': 0, 'permitted': 0, 'listed': 0, 'total': 0})
        m[str(r['status'])] = m.get(str(r['status']), 0) + int(r['n']); m['total'] += int(r['n'])
    pb = ((prev or {}).get('lists') or {}).get('by_market') or {}
    delta = {k: v['total'] - pb[k]['total'] for k, v in by.items() if k in pb} if pb else None
    return dict(month=month, asof=asof, window_from=lo, evidence='C', prev=(prev or {}).get('month'),
                recent=recent, upcoming=upcoming,
                lists=dict(rows=sum(v['total'] for v in by.values()), markets=len(by), by_market=by, delta=delta),
                n_markets_recent=len({i['market_id'] for i in recent}))


def toothpaste():
    """广东省药监局牙膏备案公示的集合运算(复用 from_nmpa.load,口径一致)。文件不在就不写这一项。"""
    try:
        spec = importlib.util.spec_from_file_location('from_nmpa', NMPA); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        if not os.path.exists(m.SRC): return None
        agg, bars, facs, _ = m.load(m.SRC)
        pure = bars - facs
        rec = sum(1 for _ in io.open(m.SRC, encoding='utf-8'))
        return dict(records=rec, filers=len(bars), brand_only=len(pure), makers=len(facs),
                    brand_only_skus=sum(len(agg[b]['skus']) for b in pure),
                    scope_zh=m.SCOPE, scope_en='Guangdong Medical Products Administration public toothpaste filing register, since toothpaste filing began in 2023 (data as of 2026-09-22)',
                    source_url='https://mpa.gd.gov.cn/')
    except Exception as e:
        print('  牙膏集合运算跳过:', e); return None


def upsert_sql(k, obj):
    js = json.dumps(obj, ensure_ascii=False).replace("'", "''")
    return f"INSERT INTO pulse (k, json, updated_at) VALUES ('{k}', '{js}', datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at;"


class Lock:
    """并行开跑规则 §二:mkdir 拿锁、写 owner、写完即删;占着就每 60 秒重试,最多等 60 分钟。"""
    def __init__(self, which): self.p = LOCKDIR[which]
    def __enter__(self):
        for _ in range(60):
            try:
                os.mkdir(self.p)
                io.open(os.path.join(self.p, 'owner.txt'), 'w', encoding='utf-8').write(f'A3 reg-digest {dt.datetime.now(TZ):%Y-%m-%d %H:%M}\n')
                return self
            except FileExistsError:
                time.sleep(60)
        raise RuntimeError(f'等了 60 分钟仍拿不到 {self.p}')
    def __exit__(self, *a):
        try: os.remove(os.path.join(self.p, 'owner.txt')); os.rmdir(self.p)
        except OSError: pass


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--month'); ap.add_argument('--only'); ap.add_argument('--dry', action='store_true'); A = ap.parse_args()
    from _bohui import d1, d1_exec
    sys.path.append(PLAT)
    from _pd1 import pq, pexec
    now = dt.datetime.now(TZ); month = A.month or now.strftime('%Y-%m'); asof = now.date().isoformat()
    assert 5000 <= int(d1('SELECT COUNT(*) n FROM ingredient_facts')[0]['n']) <= 7000, '公司库认错了(ingredient_facts 应在 5,000–7,000)'
    upd = d1('SELECT date, market_id, title_en, title_zh, summary_en, summary_zh, source FROM regulation_updates ORDER BY date DESC')
    regs = d1('SELECT id, country_en, country_zh, latest_date, latest_what_en, latest_what_zh, latest_src FROM regulations')
    try: ims = pq('SELECT market, status, COUNT(*) n FROM ingredient_market_status GROUP BY market, status')
    except Exception as e:   # 平台库在灌库时整库只读也会 7500:退回本月已写过的那期目录计数(只重算动态部分),都没有才停
        old = next((json.loads(r['json']) for r in d1(f"SELECT json FROM pulse WHERE k = 'regdigest:{month}'")), None)
        if not old: raise
        print('  平台库读不到,目录计数沿用本月已写的那期:', str(e)[:80])
        ims = [dict(market=mk, status=st, n=v[st]) for mk, v in old['lists']['by_market'].items() for st in ('prohibited', 'restricted', 'permitted', 'listed') if v.get(st)]
    if not (upd and regs and ims): raise SystemExit(f'读库不全(动态 {len(upd)} / 市场 {len(regs)} / 目录 {len(ims)}),不写')
    prev = next((json.loads(r['json']) for r in d1(f"SELECT json FROM pulse WHERE k = 'regdigest:{prev_month(month)}'")), None)
    dg = build(month, asof, upd, regs, ims, prev)
    facts = dict(asof=asof, ims=dict(rows=dg['lists']['rows'], markets=dg['lists']['markets']), gd_toothpaste=toothpaste())
    print(f"{month}:近 {WINDOW_DAYS} 天 {len(dg['recent'])} 条 / 未来 {len(dg['upcoming'])} 条;目录 {dg['lists']['rows']:,} 行 / {dg['lists']['markets']} 市场;上一期 {dg['prev']}")
    print('牙膏:', {k: v for k, v in (facts['gd_toothpaste'] or {}).items() if not k.startswith('scope')})
    sql = [upsert_sql(f'regdigest:{month}', dg), upsert_sql('geo_facts', facts)]
    if A.dry: print(f'dry:{sum(map(len, sql)):,} 字节,不写'); return
    if A.only in (None, 'company'):
        with Lock('company'):
            p = os.path.join(HERE, '_reg-digest.sql'); io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(sql) + '\n')
            n = d1_exec(p); print('公司库写入', n)
            if n < 2: raise SystemExit('公司库写入失败(应为 2 行)')   # 真故障才给红叉
    if A.only in (None, 'platform'):
        with Lock('platform'):
            print('平台库写入', pexec(sql, label='reg-digest'))


def selftest():
    regs = [dict(id='eu', country_en='European Union', country_zh='欧盟', latest_date='2026-07-31', latest_what_en='x', latest_what_zh='x', latest_src='s'),
            dict(id='uk', country_en='United Kingdom', country_zh='英国', latest_date='2026-08-20', latest_what_en='y', latest_what_zh='y', latest_src='t'),
            dict(id='kr', country_en='Korea', country_zh='韩国', latest_date='2025-01-01', latest_what_en='z', latest_what_zh='z', latest_src='u')]
    upd = [dict(date='2026-07-31', market_id='eu', title_en='a', title_zh='甲', summary_en='', summary_zh='', source='s'),
           dict(date='2027-03-23', market_id='uk', title_en='b', title_zh='乙', summary_en='', summary_zh='', source='t')]
    ims = [dict(market='EU', status='prohibited', n=10), dict(market='EU', status='restricted', n=5), dict(market='UK', status='prohibited', n=3)]
    d = build('2026-09', '2026-09-23', upd, regs, ims, dict(month='2026-08', lists=dict(by_market={'EU': dict(total=12)})))
    assert [i['market_id'] for i in d['recent']] == ['uk', 'eu'], d['recent']          # eu 07-31 动态与市场表同日去重;kr 超窗
    assert [i['date'] for i in d['upcoming']] == ['2027-03-23']
    assert d['lists']['rows'] == 18 and d['lists']['markets'] == 2 and d['lists']['delta'] == {'EU': 3}
    assert d['recent'][0]['market_zh'] == '英国' and prev_month('2026-01') == '2025-12'
    assert build('2026-09', '2026-09-23', upd, regs, ims, None)['lists']['delta'] is None
    assert "''" in upsert_sql('k', {'a': "it's"})
    print('selftest ok')


if __name__ == '__main__':
    selftest() if '--selftest' in sys.argv else main()
