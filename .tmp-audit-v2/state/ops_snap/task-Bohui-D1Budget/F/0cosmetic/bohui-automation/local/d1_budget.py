# D1 读量预算看门狗(计划任务 Bohui-D1Budget,每小时 :10 跑;09-24 D2 线)
# 只读 Cloudflare GraphQL,取两库当天(UTC 日)与本计费周期的读行数 →
#   写公司库 pulse 表 k='d1_budget' 一行(拿 _LOCK_D1_COMPANY,拿不到就只写本机)+ 本机 logs/d1_budget.json / .jsonl
# 阈值(零付费口径,见 judge()):账号本周期超包含额度或推算 > 80% 红,推算 > 60% 黄;单库当天 > 8 亿红、> 5 亿黄;取数失败红。
# 红灯:禁用本机读库批处理计划任务(描述前加原因)、禁用 w8848 云端工人、写告警文件;
#       只恢复自己暂停的那些,到下一个 UTC 日(每天 00:10 UTC = 北京 08:10 那一跑)自动恢复。
# 用法:python d1_budget.py            正常一跑(取数失败也写红灯结果,不留旧绿灯)
#       python d1_budget.py --check-batch  批处理闸(旧写法 --check / --check batch 同义):红灯 exit 2
#       python d1_budget.py --check-deploy --note "<部署说明>" --semgrep-new <N>   部署闸(--check deploy 同义):
#           红灯时只放行 说明带【降读】或【安全】且 N==0 的部署,并记 logs/deploy_override.log;否则 exit 2
#       两种闸都出错即拦:结果文件缺失/读不了、at 缺失或超过 2 小时(或在未来)、结果里带取数错误 → exit 2
#       python d1_budget.py --dry      只取数、打印,不写库、不动任务
#       python d1_budget.py --selftest 断言自检(不联网、不碰真结果文件;含 edge_guard 熔断自检)
# 09-24:每次正式跑后调 edge_guard.run() 做 L4 边缘熔断(见 edge_guard.py 头注释;要 logs/edge_guard.armed 在才真改 Cloudflare)
import io, json, os, re, subprocess, sys, time, datetime as dt, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LOGD = os.path.join(HERE, 'logs')
LATEST = os.path.join(LOGD, 'd1_budget.json')
STATE = os.path.join(LOGD, 'd1_budget_state.json')
OVERRIDE_LOG = os.path.join(LOGD, 'deploy_override.log')
MAX_AGE = dt.timedelta(hours=2)    # 结果超过 2 小时未更新 = 看门狗没在跑,按红灯拦
MARK = '【降读】'
MARKS = (MARK, '【安全】')
ZERO_MARK = '【零读】'   # 09-24 21:1x:纯文案/样式改动,闸门机械核过「新增查库语句 0」才放行(gate.sh 传 --new-queries)        # 09-24 W1:安全修复不增加读量,红灯时与【降读】同样放行(仍要求 Semgrep 新增 0)
ALERT_DIR = 'F:/0cosmetic/助手交付'
LOCK = 'F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY'
YELLOW, RED = 500_000_000, 800_000_000
INCLUDED = 25_000_000_000          # Workers Paid 每月含读行数(账号级)
PRICE_PER_M = 0.001                # 超出部分每百万行美元
# 本机读库批处理(只暂停当时处于启用状态的;GhDispatch 三个是 w8848 工人的本机保底触发器,工人停了它们也要停,否则报错)
LOCAL_TASKS = ['Bohui-HeavyLocal', 'Bohui-I18nLocal', 'Beauty2aiSummaries', 'BohuiI18nBackfill', 'Bohui-I18nJudge',
               'Bohui-NightChain', 'Bohui-Chain2',
               'Bohui-GhDispatch-packjob', 'Bohui-GhDispatch-news-cn', 'Bohui-GhDispatch-trend-media']
GH_REPO = 'w8848/bohui-automation'
GH_WF = ['packjob', 'news-cn', 'trend-media', 'html-i18n', 'catalog-i18n', 'summaries', 'ingredient-facts',
         'lit-refs', 'cat-jev', 'ai-batch', 'deep-report']      # health 是监控,不停
TAG = '[D1预算红灯暂停'
TAG_RX = r'^\[D1预算红灯暂停[^\]]*\] ?'
PROXIES = [None, 'http://127.0.0.1:7890', 'http://127.0.0.1:1082']


def company_cred():
    env = dict(re.findall(r'^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"\r\n]+)"?', io.open('F:/0cosmetic/cosmetic-sites/.env', encoding='utf-8').read(), re.M))
    return env['CLOUDFLARE_ACCOUNT_ID'], env['CLOUDFLARE_API_TOKEN']


def platform_token():
    """平台账号:先用 skin2oem/.env.founder 的 CF_API_TOKEN(09-24 W1:能查 GraphQL、不会过期;OAuth 刷新常超时 → 401 红灯拦全部部署)。
    没有才走 wrangler OAuth;过期先用 wrangler whoami 刷新(必须去掉公司 token 环境变量,否则落错账号)。"""
    try:
        t = dict(re.findall(r'^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"\r\n]+)"?', io.open('F:/0cosmetic/skin2oem/.env.founder', encoding='utf-8').read(), re.M)).get('CF_API_TOKEN')
        if t:
            return t
    except OSError:
        pass
    p = os.path.expanduser('~/AppData/Roaming/xdg.config/.wrangler/config/default.toml')
    txt = io.open(p, encoding='utf-8').read()
    exp = re.search(r'expiration_time\s*=\s*"([^"]+)"', txt).group(1)
    if dt.datetime.fromisoformat(exp.replace('Z', '+00:00')) < dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
        env = {k: v for k, v in os.environ.items() if not k.startswith('CLOUDFLARE_')}
        for px in PROXIES:
            e = dict(env, **({'HTTPS_PROXY': px, 'HTTP_PROXY': px} if px else {}))
            subprocess.run('npx wrangler whoami', shell=True, cwd='F:/0cosmetic/skin2oem', env=e, capture_output=True, timeout=120)
            txt = io.open(p, encoding='utf-8').read()
            if re.search(r'expiration_time\s*=\s*"([^"]+)"', txt).group(1) != exp:
                break
    return re.search(r'oauth_token\s*=\s*"([^"]+)"', txt).group(1)


def cf(tok, url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    err = None
    for px in PROXIES:
        try:
            op = urllib.request.build_opener(urllib.request.ProxyHandler({'https': px} if px else {}))
            return json.loads(op.open(req, timeout=60).read())
        except Exception as e:
            err = e
    raise err


def cycle_start(today, day):
    if today.day >= day:
        return today.replace(day=day)
    m = today.replace(day=1) - dt.timedelta(days=1)
    return m.replace(day=day)


Q = '''query($a:String!,$c:Date!,$h:Time!,$db:String!){viewer{accounts(filter:{accountTag:$a}){
 c: d1AnalyticsAdaptiveGroups(limit:5000,filter:{date_geq:$c},orderBy:[date_ASC]){sum{rowsRead} dimensions{date databaseId}}
 h: d1AnalyticsAdaptiveGroups(limit:48,filter:{databaseId:$db,datetimeHour_geq:$h},orderBy:[datetimeHour_ASC]){sum{rowsRead readQueries} dimensions{datetimeHour}}}}}'''


def judge(acct_cycle, proj, db_day):
    # 09-24 零付费口径(创始人:不许产生任何费用):看整个账号本计费周期累计,而不是单日绝对值。
    #   红:已超包含额度(此后每读一行都收钱)或按当前速度推算本周期会超 80% 包含额度;黄:推算超 60%;单日仍保留 5/8 亿兜底。
    if acct_cycle >= INCLUDED or proj > INCLUDED * 0.8 or db_day > RED:
        return 'red'
    return 'yellow' if proj > INCLUDED * 0.6 or db_day > YELLOW else 'green'


def measure(name, acc, tok, db, cstart_day, now):
    today = now.date()
    cs = cycle_start(today, cstart_day)
    r = cf(tok, 'https://api.cloudflare.com/client/v4/graphql',
           {'query': Q, 'variables': {'a': acc, 'c': cs.isoformat(), 'db': db,
                                      'h': (now - dt.timedelta(hours=now.hour + 1)).strftime('%Y-%m-%dT%H:00:00Z')}})
    if r.get('errors'):
        raise RuntimeError(f'{name} GraphQL: {r["errors"][0].get("message")}')
    a = r['data']['viewer']['accounts'][0]
    t = today.isoformat()
    db_day = sum(x['sum']['rowsRead'] for x in a['c'] if x['dimensions']['databaseId'] == db and x['dimensions']['date'] == t)
    acct_day = sum(x['sum']['rowsRead'] for x in a['c'] if x['dimensions']['date'] == t)
    db_cycle = sum(x['sum']['rowsRead'] for x in a['c'] if x['dimensions']['databaseId'] == db)
    acct_cycle = sum(x['sum']['rowsRead'] for x in a['c'])
    hours = {x['dimensions']['datetimeHour']: x['sum']['rowsRead'] for x in a['h']}
    last_h = (now.replace(minute=0, second=0, microsecond=0) - dt.timedelta(hours=1)).strftime('%Y-%m-%dT%H:00:00Z')
    days_in = (today - cs).days + 1
    nxt = cycle_start(today + dt.timedelta(days=32), cstart_day)   # 下个周期起点
    cycle_len = (nxt - cs).days if nxt > cs else 30
    proj = acct_cycle / max(days_in - 1 + now.hour / 24 + now.minute / 1440, 0.1) * cycle_len
    return {'name': name, 'db': db[:8], 'level': judge(acct_cycle, proj, db_day), 'day': db_day, 'acct_day': acct_day,
            'last_hour': hours.get(last_h, 0), 'last_hour_at': last_h, 'cycle_start': cs.isoformat(),
            'cycle_end': nxt.isoformat(), 'days_left': (nxt - today).days, 'db_cycle': db_cycle, 'acct_cycle': acct_cycle,
            'acct_cycle_proj': int(proj), 'over_included': max(0, acct_cycle - INCLUDED),
            'over_usd': round(max(0, acct_cycle - INCLUDED) / 1e6 * PRICE_PER_M, 2)}


def ps(script, **env):
    p = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script], capture_output=True, text=True,
                       encoding='utf-8', errors='replace', env=dict(os.environ, **env), timeout=120)
    return (p.stdout or '').strip() or ('ERR ' + (p.stderr or '').strip()[:200])


PAUSE_PS = r'''$t = Get-ScheduledTask -TaskName $env:BT -ErrorAction Stop
if ($t.State -eq 'Disabled') { 'skip'; exit }
$run = $t.State -eq 'Running'
$t.Description = $env:BTAG + ' ' + $t.Description
$t.Settings.Enabled = $false
Set-ScheduledTask -InputObject $t | Out-Null
if ($run) { 'paused-running' } else { 'paused' }'''
RESUME_PS = r'''$t = Get-ScheduledTask -TaskName $env:BT -ErrorAction Stop
$t.Description = $t.Description -replace $env:BRX, ''
$t.Settings.Enabled = $true
Set-ScheduledTask -InputObject $t | Out-Null
'resumed' '''


def gh(*args):
    tok = subprocess.run(['gh', 'auth', 'token', '--user', 'w8848'], capture_output=True, text=True).stdout.strip()
    for px in PROXIES:
        env = dict(os.environ, GH_TOKEN=tok, GH_PROMPT_DISABLED='1', HTTPS_PROXY=px or '')
        p = subprocess.run(['gh', *args], capture_output=True, text=True, encoding='utf-8', errors='replace', env=env, timeout=90)
        if p.returncode == 0:
            return p.stdout.strip()
    raise RuntimeError(f'gh {args[0]} 三条网络都不通:{p.stderr.strip()[:150]}')


def pause(res, today, errs=()):
    why = '、'.join([f"{d['name']}库当天 {d['day'] / 1e8:.2f} 亿行、账号周期 {d['acct_cycle'] / 1e8:.0f} 亿行" for d in res if d['level'] == 'red']
                   + [f'取数失败({e[:60]})' for e in errs])
    tag = f'{TAG} {today} UTC:{why} 触发红灯(零付费口径);D1 看门狗自动暂停,下个 UTC 日 00:10(北京 08:10)自动恢复]'
    st = {'date': today, 'reason': why, 'tasks': [], 'running': [], 'workflows': [], 'errors': []}
    for n in LOCAL_TASKS:
        o = ps(PAUSE_PS, BT=n, BTAG=tag)
        if o.startswith('paused'):
            st['tasks'].append(n)
            if o == 'paused-running':
                st['running'].append(n)
        elif o != 'skip':
            st['errors'].append(f'{n}: {o}')
    try:
        states = dict(l.split('\t') for l in gh('api', f'repos/{GH_REPO}/actions/workflows', '--jq',
                                               '.workflows[]|[(.path|split("/")|last|rtrimstr(".yml")),.state]|@tsv').splitlines())
        for w in GH_WF:
            if states.get(w) == 'active':
                gh('workflow', 'disable', f'{w}.yml', '-R', GH_REPO)
                st['workflows'].append(w)
    except Exception as e:
        st['errors'].append(f'GitHub: {e}')
    return st, tag


def resume(st):
    out = []
    for n in st.get('tasks', []):
        out.append(f'{n}: ' + ps(RESUME_PS, BT=n, BRX=TAG_RX))
    for w in st.get('workflows', []):
        try:
            gh('workflow', 'enable', f'{w}.yml', '-R', GH_REPO); out.append(f'{w}: enabled')
        except Exception as e:
            out.append(f'{w}: {e}')
    return out


def write_pulse(acc, tok, db, js):
    """公司库 pulse 一行;按规矩拿写锁,占着就等最多 2 分钟,拿不到只写本机。"""
    for i in range(3):
        try:
            os.mkdir(LOCK)
            break
        except FileExistsError:
            if i == 2:
                return 'lock-busy'
            time.sleep(60)
    try:
        io.open(os.path.join(LOCK, 'owner.txt'), 'w', encoding='utf-8').write(f'D2-看门狗 d1_budget.py {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n')
        r = cf(tok, f'https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{db}/query',
               {'sql': "INSERT INTO pulse (k, json, updated_at) VALUES ('d1_budget', ?1, datetime('now')) "
                       "ON CONFLICT(k) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at", 'params': [js]})
        return 'ok' if r.get('success') else f"fail {r.get('errors')}"
    finally:
        for f in os.listdir(LOCK):
            os.remove(os.path.join(LOCK, f))
        os.rmdir(LOCK)


def check(mode, note='', sg_new=None, now=None, new_q=None):
    """闸:读本机最新结果。出错一律 exit 2(fail-closed)。mode = 'batch' | 'deploy'。"""
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        d = json.load(io.open(LATEST, encoding='utf-8'))
        at = dt.datetime.strptime(d['at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
        level = d['level']
        dbs = ';'.join(f"{x['name']} 当天 {x['day'] / 1e8:.2f} 亿" for x in d.get('dbs') or [])
    except Exception as e:
        print(f'D1 预算:结果文件缺失或读不了({type(e).__name__}: {e}),按红灯拦'); return 2
    if not (now - MAX_AGE <= at <= now + dt.timedelta(minutes=5)):
        print(f'D1 预算:结果时间 {d["at"]} 不在最近 2 小时内(看门狗没在跑?),按红灯拦'); return 2
    if d.get('errors') or level not in ('green', 'yellow', 'red'):
        print(f"D1 预算:上次取数出错 {d.get('errors')} / level={level},按红灯拦"); return 2
    print(f'D1 预算 {level}(截至 {d["at"]},{mode}):{dbs}')
    if level != 'red':
        return 0
    if mode == 'deploy' and ZERO_MARK in (note or ''):
        if sg_new == 0 and new_q == 0:
            io.open(OVERRIDE_LOG, 'a', encoding='utf-8').write(
                f"{now:%Y-%m-%dT%H:%M:%SZ}\t红灯放行{ZERO_MARK}部署(新增查库 0)\t结果 {d['at']}\t{dbs}\t说明:{' '.join((note or '').split())[:200]}\n")
            print(f'  红灯,但说明带{ZERO_MARK}、新增查库 0、Semgrep 新增 0 → 放行(已记 {OVERRIDE_LOG})'); return 0
        print(f'  红灯:{ZERO_MARK}要求新增查库为 0 且 Semgrep 新增为 0(本次 新增查库={new_q},Semgrep 新增={sg_new})→ 拦'); return 2
    mk = next((m for m in MARKS if m in (note or '')), None)
    if mode == 'deploy' and mk and sg_new == 0:
        io.open(OVERRIDE_LOG, 'a', encoding='utf-8').write(
            f"{now:%Y-%m-%dT%H:%M:%SZ}\t红灯放行{mk}部署\t结果 {d['at']}\t{dbs}\t说明:{' '.join((note or '').split())[:200]}\n")
        print(f'  红灯,但部署说明带{mk}且 Semgrep 新增违例 0 → 放行(已记 {OVERRIDE_LOG})'); return 0
    if mode == 'deploy':
        print(f'  红灯:部署只放行 说明带{"或".join(MARKS)} 且 Semgrep 新增违例为 0(本次 新增={sg_new})→ 拦')
    return 2


def selftest():
    """断言覆盖:①两种模式 ②fail-closed ③at 时间 ④平台 19 日周期 ⑤零付费口径。全在临时目录,不联网、不动计划任务。"""
    import tempfile
    g = globals()
    keep = {k: g[k] for k in ('LOGD', 'LATEST', 'STATE', 'OVERRIDE_LOG', 'ALERT_DIR', 'cf', 'company_cred', 'platform_token', 'pause', 'resume')}
    tmp = tempfile.mkdtemp(prefix='d1b_selftest_')
    g.update(LOGD=tmp, LATEST=os.path.join(tmp, 'r.json'), STATE=os.path.join(tmp, 's.json'),
             OVERRIDE_LOG=os.path.join(tmp, 'ov.log'), ALERT_DIR=tmp)
    now = dt.datetime(2026, 9, 24, 3, 0, tzinfo=dt.timezone.utc)
    ts = lambda h: (now - dt.timedelta(hours=h)).strftime('%Y-%m-%dT%H:%M:%SZ')

    def put(level, at, errors=()):
        json.dump({'at': at, 'level': level, 'errors': list(errors), 'dbs': [{'name': '公司', 'day': 1}]}, io.open(LATEST, 'w', encoding='utf-8'))
    try:
        # ⑤ 零付费口径
        assert judge(INCLUDED, 0, 0) == 'red'                  # 已超包含额度
        assert judge(0, INCLUDED * 0.81, 0) == 'red'           # 推算超 80%
        assert judge(0, INCLUDED * 0.7, 0) == 'yellow'
        assert judge(0, 0, RED + 1) == 'red' and judge(0, 0, 0) == 'green'
        # ④ 平台周期 19 日起算,累计与剩余天数进结果
        assert cycle_start(dt.date(2026, 9, 24), 19) == dt.date(2026, 9, 19)
        assert cycle_start(dt.date(2026, 10, 5), 19) == dt.date(2026, 9, 19)
        rows = [{'sum': {'rowsRead': 7}, 'dimensions': {'date': '2026-09-19', 'databaseId': 'P'}},
                {'sum': {'rowsRead': 5}, 'dimensions': {'date': '2026-09-24', 'databaseId': 'P'}},
                {'sum': {'rowsRead': 3}, 'dimensions': {'date': '2026-09-24', 'databaseId': 'X'}}]
        g['cf'] = lambda tok, url, body: {'data': {'viewer': {'accounts': [{'c': rows, 'h': []}]}}}
        m = measure('平台', 'a', 't', 'P', 19, now)
        assert (m['cycle_start'], m['cycle_end'], m['days_left']) == ('2026-09-19', '2026-10-19', 25), m
        assert (m['acct_cycle'], m['db_cycle'], m['day'], m['level']) == (15, 12, 5, 'green'), m
        # ② fail-closed:文件缺失 / 读不了
        for mode in ('batch', 'deploy'):
            assert check(mode, MARK, 0, now) == 2
        io.open(LATEST, 'w', encoding='utf-8').write('{坏')
        assert check('deploy', MARK, 0, now) == 2
        # ③ at 时间:3 小时前、未来、缺失都拦;1 小时前的绿灯放行
        put('green', ts(3)); assert check('batch', now=now) == 2 and check('deploy', MARK, 0, now) == 2
        put('green', ts(-1)); assert check('batch', now=now) == 2
        put('green', ''); assert check('batch', now=now) == 2
        put('green', ts(1)); assert check('batch', now=now) == 0 and check('deploy', now=now) == 0
        put('yellow', ts(1)); assert check('batch', now=now) == 0
        put('green', ts(1), ['平台: 超时']); assert check('batch', now=now) == 2 and check('deploy', MARK, 0, now) == 2
        # ① 两种模式:红灯 batch 一律拦;deploy 只放【降读】+ Semgrep 新增 0,并记 override 日志
        put('red', ts(1))
        assert check('batch', MARK, 0, now) == 2
        assert check('deploy', '普通改版', 0, now) == 2
        assert check('deploy', MARK + ' 修 sitemap', None, now) == 2
        assert check('deploy', MARK + ' 修 sitemap', 1, now) == 2
        assert not os.path.exists(OVERRIDE_LOG)
        assert check('deploy', MARK + ' 修 sitemap', 0, now) == 0
        assert check('deploy', ZERO_MARK + ' 改文案', 0, now, new_q=0) == 0
        assert check('deploy', ZERO_MARK + ' 改文案', 0, now, new_q=1) == 2
        assert check('deploy', ZERO_MARK + ' 改文案', 0, now) == 2
        assert check('deploy', ZERO_MARK + ' 改文案', 1, now, new_q=0) == 2
        assert '修 sitemap' in io.open(OVERRIDE_LOG, encoding='utf-8').read()
        # W1:【安全】同口径 —— Semgrep 新增 0 放行并记日志;有新增 / 不知道新增数都拦
        assert check('deploy', '【安全】 searchGate', 1, now) == 2 and check('deploy', '【安全】 searchGate', None, now) == 2
        assert check('deploy', '【安全】 searchGate', 0, now) == 0
        assert '红灯放行【安全】部署' in io.open(OVERRIDE_LOG, encoding='utf-8').read()
        # ② 取数失败:旧绿灯被覆盖成带错误的红灯,正式跑 exit 2,随后两种闸都拦
        put('green', ts(0))
        def boom(*a):
            raise OSError('断网')
        paused = []
        g.update(company_cred=boom, platform_token=boom, pause=lambda res, today, errs=(): (paused.append(errs) or {'date': today, 'reason': 'x', 'tasks': [], 'running': [], 'workflows': [], 'errors': []}, 't'),
                 resume=lambda st: [])
        import edge_guard
        seen, eg_run = [], edge_guard.run
        edge_guard.run = lambda res, dry=False: seen.append(res) or []        # 别碰真 state;只断言「取数失败时交给熔断的读数为空」
        argv, sys.argv = sys.argv, ['d1_budget.py']
        try:
            assert main() == 2
        finally:
            sys.argv, edge_guard.run = argv, eg_run
        assert seen == [[]], seen                                              # 没读数 → 熔断不降档不恢复(edge_guard 自检里断言)
        d = json.load(io.open(LATEST, encoding='utf-8'))
        assert d['level'] == 'red' and len(d['errors']) == 2 and paused, d
        assert check('batch') == 2 and check('deploy', MARK, 0) == 2
        # ⑥ 边缘熔断:触发 / 重复触发不叠加 / 恢复 / API 失败不误恢复(假 API,不联网,不写 Cloudflare)
        import edge_guard
        assert edge_guard.selftest() == 0
    finally:
        g.update(keep)
        __import__('shutil').rmtree(tmp, ignore_errors=True)
    print('selftest 全部通过(①两模式+【安全】口径 ②出错即拦 ③at 时间 ④平台周期 ⑤零付费口径 ⑥边缘熔断)')
    return 0


def _arg(name):
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else None


def main():
    a = sys.argv
    if '--selftest' in a:
        return selftest()
    if '--check-deploy' in a or ('--check' in a and _arg('--check') == 'deploy'):
        n, q = _arg('--semgrep-new'), _arg('--new-queries')
        return check('deploy', _arg('--note') or '', int(n) if n and n.isdigit() else None, new_q=int(q) if q and q.isdigit() else None)
    if '--check-batch' in a or '--check' in a:
        return check('batch')
    dry = '--dry' in a
    os.makedirs(LOGD, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)
    today = now.date().isoformat()
    CDB = 'ea5b0da4-7f96-48bf-8fca-dc7193a9596d'
    res, errs = [], []
    for name, get in (('公司', lambda: measure('公司', *company_cred(), CDB, 7, now)),       # 公司账期 09-07→10-07
                      ('平台', lambda: measure('平台', 'b7362ed77d212bab298a9ae8736c9868', platform_token(),
                                             'f5010e65-8c6d-419f-8bf0-3e41762463f6', 19, now))):  # 平台账期 09-19→10-18(创始人 09-24 截图)
        try:
            res.append(get())
        except Exception as e:                      # 取数失败 = 红灯,不能留旧绿灯
            errs.append(f'{name}: {type(e).__name__}: {e}'[:300])
    level = 'red' if errs or any(d['level'] == 'red' for d in res) else 'yellow' if any(d['level'] == 'yellow' for d in res) else 'green'
    try:
        st = json.load(io.open(STATE, encoding='utf-8'))
    except Exception:
        st = None
    actions = []
    try:                                                    # 09-24 L4 边缘熔断(edge_guard.py):单独 try,出错不影响原逻辑
        import edge_guard
        actions += edge_guard.run(res, dry=dry)
    except Exception as e:
        actions.append(f'边缘熔断出错:{type(e).__name__}: {str(e)[:200]}')
    if not dry and st and st.get('date') != today:          # 新的 UTC 日:恢复上次红灯暂停的
        actions += ['恢复:' + '; '.join(resume(st))]
        os.remove(STATE); st = None
    if not dry and level == 'red' and not st:
        st, tag = pause(res, today, errs)
        json.dump(st, io.open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        actions.append(f"暂停本机任务 {st['tasks']}(运行中未杀:{st['running']});禁用云端工人 {st['workflows']};错误 {st['errors']}")
        alert = f'{ALERT_DIR}/!!D1读量红灯-{today.replace("-", "")}.txt'
        io.open(alert, 'a', encoding='utf-8').write(
            f"!!!! D1 读量红灯 {now:%Y-%m-%d %H:%M} UTC !!!!\n原因:{st['reason']}(红:账号周期超包含额度或推算超 80%,或单库当天 > 8 亿;取数失败也按红)\n"
            f"已暂停本机计划任务:{', '.join(st['tasks']) or '无'}\n暂停时仍在运行(没杀,会跑完本轮):{', '.join(st['running']) or '无'}\n"
            f"已禁用 w8848 云端工人:{', '.join(st['workflows']) or '无'}\n出错:{st['errors'] or '无'}\n"
            f"下个 UTC 日 00:10(北京 08:10)由 Bohui-D1Budget 自动恢复;手动恢复:删 {STATE} 前先按其中清单逐个启用。\n"
            f"读量明细:{json.dumps(res, ensure_ascii=False)}\n\n")
        actions.append(f'告警文件 {alert}')
    out = {'at': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'utc_day': today, 'level': level, 'errors': errs,
           'thresholds': {'yellow': YELLOW, 'red': RED, 'included_month': INCLUDED}, 'dbs': res,
           'paused': ({k: st[k] for k in ('date', 'reason', 'tasks', 'workflows')} if st else None), 'actions': actions}
    js = json.dumps(out, ensure_ascii=False)
    if not dry:
        out['pulse'] = 'skip:公司账号已超包含额度,零付费期间不写库'  # 09-24:连 1 行也不读写公司库
        json.dump(out, io.open(LATEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        io.open(os.path.join(LOGD, 'd1_budget.jsonl'), 'a', encoding='utf-8').write(json.dumps(out, ensure_ascii=False) + '\n')
    for d in res:
        print(f"{d['name']}库 {d['db']} [{d['level']}] 当天 {d['day']:,} 行(账号当天 {d['acct_day']:,});上一整点 {d['last_hour_at'][11:16]}Z {d['last_hour']:,};"
              f"周期 {d['cycle_start']}→{d['cycle_end']}(剩 {d['days_left']} 天)账号 {d['acct_cycle']:,}(本库 {d['db_cycle']:,}),"
              f"整周期推算 {d['acct_cycle_proj']:,},超额 {d['over_included']:,} ≈ ${d['over_usd']}")
    for e in errs:
        print('取数失败(按红灯):', e)
    print('总灯', level, '| 动作', actions or '无', '| pulse', out.get('pulse', 'dry'))
    return 2 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
