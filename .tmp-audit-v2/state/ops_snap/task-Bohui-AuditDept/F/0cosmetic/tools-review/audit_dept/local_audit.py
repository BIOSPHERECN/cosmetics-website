# 审核部 · 本机每日审核(计划任务 Bohui-AuditDept,每天北京 08:37,经 run-hidden.vbs 启动 audit_local.cmd)
# 只查本机才看得到的东西:
#   代码科:两站仓库 24 小时内改动的文件跑 Semgrep(tools-review/rules.yml)、未推送提交查密钥(gitleaks 有就用,
#          没装就退到 sk- 串 grep,记「无法审计」)、公开仓推送锁、deploy_audit.py 绕闸对账(到位前记「无法审计」)
#   数据科:Cloudflare D1 查询画像(GraphQL d1QueriesAdaptiveGroups,等同 wrangler d1 insights,一行 D1 都不读)、快照新鲜度
#   财务科(本机补位):d1_budget.py 快照(两账号)、GitHub Actions 分钟估算
#   流程科:残留锁、计划任务状态、闸门日志、五步法留痕、云端审核有没有按时出日报
#   交付物:24 小时内 助手交付/ 下带「已核实/已验证/✅」的行 → 能机器验的(文件路径)先验,其余交 Claude 审核流水线
# 产出:助手交付/审核部/本机-YYYYMMDD.{json,md}、云端-YYYYMMDD.md(从 Issue 拉回);红项开整改单(与云端共用 audit_tickets.py)。
# 铁令:不读写 D1;密钥只从 .env / gh keyring 读进内存,不写文件不打印;gitleaks 一律 --redact。
# 用法:python local_audit.py [--dry]   --dry 不动 Issue
import datetime as dt, glob, hashlib, io, json, os, re, shutil, subprocess, sys, time

BASE = 'F:/0cosmetic'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{BASE}/助手交付/审核部'
sys.path[:0] = [f'{BASE}/bohui-automation/tools', f'{BASE}/bohui-automation/local']
import audit_tickets as tk
import d1_budget as b

SEMGREP = f'{BASE}/_venv/review/Scripts/semgrep.exe'
RULES = f'{BASE}/tools-review/rules.yml'
DEPLOY_AUDIT = f'{BASE}/tools-review/deploy_audit.py'
REPOS = {'cosmetic-sites': '帛卉站线', 'skin2oem': 'BEAUTY2AI线'}
PUBLIC_REPO = 'cosmetic-sites'          # 推到公开仓 BIOSPHERECN/cosmetics-website 的那个,有 pre-push 锁
ACCTS = {'公司': '帛卉站线', '平台': 'BEAUTY2AI线'}
PLATFORM_ACC = 'b7362ed77d212bab298a9ae8736c9868'
CLAIM_RX = re.compile(r'已核实|已验证|✅')
AGG_RX = re.compile(r'(?i)count\s*\(|group\s+by|\blike\b')
CODE_EXT = ('.ts', '.tsx', '.js', '.mjs', '.cjs', '.astro', '.py', '.sql', '.toml', '.jsonc', '.sh', '.ps1', '.yml', '.yaml')
PATH_RX = re.compile(r'(?<![A-Za-z])[A-Za-z]:[\\/][^\s`\'"<>|,,。;;)）」\]]+')

F, AUDITED, UNAUDITED, KEYS, CAND = [], set(), [], {}, []
CHECKS = 0
NOW = dt.datetime.now(dt.timezone.utc)
TODAY = (NOW + dt.timedelta(hours=8)).date().isoformat()


def add(dept, rule, obj, level, title, evidence, owner='主线', **kw):
    F.append(dict(dept=dept, rule=rule, obj=obj, level=level, title=title, evidence=evidence, owner=owner, **kw))


def unaudited(dept, why):
    UNAUDITED.append(f'{dept}:{why}')


def run(args, cwd=None, timeout=120):
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout,
                       env=dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8'))   # semgrep 在中文 Windows 上按 GBK 读规则会崩
    return p.stdout


def git(repo, *a):
    return run(['git', '-C', f'{BASE}/{repo}', *a])


def env_cred():
    e = dict(re.findall(r'^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"\r\n]+)"?', io.open(f'{BASE}/cosmetic-sites/.env', encoding='utf-8').read(), re.M))
    return e['CLOUDFLARE_ACCOUNT_ID'], e['CLOUDFLARE_API_TOKEN']


def added_lines(repo):
    """{文件: 24 小时内新增的行号集合};基线取 24 小时前最后一个提交,仓库更年轻就对空树比。"""
    base = git(repo, 'rev-list', '-1', '--before=24.hours', 'HEAD').strip() or '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    out, cur = {}, None
    for l in git(repo, 'diff', '-U0', '--no-color', '--no-renames', base, 'HEAD', '--', *('*' + e for e in CODE_EXT), ':(exclude,glob)**/data/**').splitlines():
        if l.startswith('+++ '):
            cur = l[6:] if l.startswith('+++ b/') else None
        elif l.startswith('@@') and cur:
            m = re.search(r'\+(\d+)(?:,(\d+))?', l)
            out.setdefault(cur, set()).update(range(int(m.group(1)), int(m.group(1)) + int(m.group(2) or 1)))
    return out


def upstream(repo):
    u = git(repo, 'rev-parse', '--abbrev-ref', '@{u}').strip()
    return u or ('origin/main' if git(repo, 'rev-parse', '--verify', '-q', 'origin/main').strip() else '')


# ---------------- 代码科 ----------------
def code():
    global CHECKS
    ok = True
    KEYS['代码'] = []
    for repo, owner in REPOS.items():
        added = added_lines(repo)       # 只审 24 小时内新增的行,历史违例不算(与闸门「只拦新增」同口径)
        files = sorted(f for f in added if f.endswith(CODE_EXT) and '/data/' not in '/' + f and os.path.isfile(f'{BASE}/{repo}/{f}'))
        CHECKS += 1
        if files:
            try:
                res = []
                for i in range(0, len(files), 60):   # Windows 命令行长度有上限,分批
                    res += json.loads(run([SEMGREP, 'scan', '--config', RULES, '--metrics=off', '--json', '--quiet', '--disable-version-check',
                                           '--jobs', '1', *files[i:i + 60]], cwd=f'{BASE}/{repo}', timeout=600))['results']
            except Exception as e:
                ok = False
                unaudited('代码', f'{repo} semgrep 失败:{str(e)[:100]}')
                continue
            hits = {}
            for h in res:
                path = h['path'].replace(os.sep, '/')
                if h['start']['line'] in added.get(path, ()):
                    hits.setdefault((h['check_id'].split('.')[-1], path), [h['extra']['severity'], h['extra']['message'], []])[2].append(h['start']['line'])
            by_rule = {}   # 按 (仓, 规则) 归并成一张单;证据列前 12 个文件和行号
            for (rule, path), (sev, msg, lines) in hits.items():
                by_rule.setdefault(rule, [sev, msg, []])[2].append(f'{path}:{",".join(map(str, sorted(set(lines))[:5]))}')
            for rule, (sev, msg, locs) in by_rule.items():
                add('代码', rule, f'{repo}:{rule}', 'red' if sev == 'ERROR' else 'yellow', f'{repo} 24 小时内新增代码命中 {rule}({len(locs)} 个文件)',
                    f'{msg} 文件:行 → {";".join(locs[:12])}{" 等" if len(locs) > 12 else ""}', owner,
                    recheck='下一次审核时 24 小时内新增行不再命中该规则(存量违例请另立整改计划)')
        KEYS['代码'].append(f'{repo} 24h 改动 {len(files)} 个文件')
        # 未推送提交里的密钥
        up = upstream(repo)
        if not up:
            continue
        ahead = int(git(repo, 'rev-list', '--count', f'{up}..HEAD').strip() or 0)
        KEYS['代码'].append(f'{repo} 未推送 {ahead}')
        if ahead and shutil.which('gitleaks'):
            rep = os.path.join(os.environ.get('TEMP', HERE), f'gl-{repo}.json')
            run(['gitleaks', 'git', '--redact', '--no-banner', '--exit-code', '0', '--log-opts', f'{up}..HEAD', '--report-format', 'json',
                 '--report-path', rep, f'{BASE}/{repo}'], timeout=180)
            for l in json.load(open(rep, encoding='utf-8')) or []:
                add('安全', 'gitleaks-unpushed', l.get('Fingerprint', ''), 'red', f"{repo} 未推送提交有密钥命中 {l['RuleID']}",
                    f"gitleaks(已脱敏)文件 {l['File']} 第 {l['StartLine']} 行,提交 {l.get('Commit', '')[:8]}", owner, founder=True)
            os.remove(rep)
        elif ahead:
            unaudited('安全', f'{repo} 本机没装 gitleaks(下载待创始人同意),未推送提交只做 sk- 串 grep')
            added = [l for l in git(repo, 'log', '-p', '--no-color', f'{up}..HEAD').splitlines() if l.startswith('+')]
            n = sum(bool(re.search(r'\bsk-[A-Za-z0-9_\-]{20,}', l)) for l in added)
            if n and repo == PUBLIC_REPO and not os.path.exists(f'{BASE}/{repo}/.git/hooks/pre-push'):
                add('安全', 'push-lock-missing', f'{repo}/pre-push', 'red', f'{repo} 推送锁不在,而未推送提交含 sk- 串',
                    f'{up}..HEAD 共 {ahead} 个提交,新增行里 {n} 处 sk- 串(不列内容);pre-push 锁缺失,一推就泄', '主线', founder=True)
            elif n:
                add('安全', 'unpushed-sk', f'{repo}:{up}..HEAD', 'yellow', f'{repo} 未推送提交含 sk- 串({n} 处)',
                    f'{up}..HEAD 共 {ahead} 个提交;推送锁在,推之前必须改写历史', owner)
        if repo == PUBLIC_REPO:
            CHECKS += 1
            AUDITED.add('安全')
            if not os.path.exists(f'{BASE}/{repo}/.git/hooks/pre-push'):
                add('安全', 'push-lock-missing', f'{repo}/pre-push', 'red', f'{repo} 公开仓推送锁不在', '.git/hooks/pre-push 不存在', '主线')
            elif ahead > 20:
                add('安全', 'push-backlog', f'{repo}:{up}..HEAD', 'yellow', f'{repo} 本地超前 {ahead} 个提交未推(积压越多越容易误推)',
                    f'{up}..HEAD 共 {ahead} 个;锁在', owner)
    # 明文密钥文件:只看在不在,不读内容
    for n in ('密码.txt', '后台登录信息.txt'):
        CHECKS += 1
        if os.path.exists(f'{BASE}/{n}'):
            add('安全', 'plaintext-secret-file', f'{BASE}/{n}', 'yellow', f'工作区根目录有明文密钥文件 {n}',
                '只查存在与否,未读内容;建议移进密码管理器后删除(需创始人)', '创始人', founder=True)
    if os.path.exists(DEPLOY_AUDIT):
        # 复用另一条线的 deploy_audit.py(文本输出):「名 worker:since 之后部署 N 次,未过闸 M 次」+ 缩进的未过闸版本行
        try:
            out, worker = run([sys.executable, DEPLOY_AUDIT], cwd=os.path.dirname(DEPLOY_AUDIT), timeout=400), '?'
            for l in out.splitlines():
                m = re.match(r'\S+ (\S+):.*之后部署 (\d+) 次,未过闸 (\d+) 次', l)
                if m:
                    worker = m.group(1)
                    CHECKS += 1
                    KEYS['代码'].append(f'{worker} 闸门上线后部署 {m.group(2)} 次、未过闸 {m.group(3)} 次')
                elif re.match(r'\s{2}\S', l):
                    ver = (re.search(r'[0-9a-f-]{36}', l) or [''])[0]
                    add('代码', 'deploy-bypass-gate', f'{worker}:{ver}', 'red', f'绕闸部署:{worker} {l.strip()[:19]}',
                        f'部署版本 {ver} 在 助手交付/上线闸门日志.md 里找不到「已部署」放行记录', '主线', founder=True)
                elif re.match(r'\S+ \S+:', l):
                    ok = False
                    unaudited('代码', f'部署对账查询失败:{l[:120]}')
        except Exception as e:
            ok = False
            unaudited('代码', f'deploy_audit.py 运行失败:{str(e)[:100]}')
    else:
        unaudited('代码', 'deploy_audit.py 未到位(另一条线在建),绕闸对账暂缺')
    if ok:
        AUDITED.add('代码')
    AUDITED.add('安全')
    KEYS['代码'] = ';'.join(KEYS.get('代码', []))


# ---------------- 数据科 + 财务(本机补位) ----------------
QQ = '''query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){
 q: d1QueriesAdaptiveGroups(limit:20,filter:{date_geq:$d},orderBy:[sum_rowsRead_DESC]){count sum{rowsRead} dimensions{query databaseId}}}}}'''


def data():
    global CHECKS
    day = (NOW - dt.timedelta(days=1)).date().isoformat()
    worst, done = [], 0
    for acct, owner in ACCTS.items():
        try:
            acc, tok = env_cred() if acct == '公司' else (PLATFORM_ACC, b.platform_token())
            r = b.cf(tok, 'https://api.cloudflare.com/client/v4/graphql', {'query': QQ, 'variables': {'a': acc, 'd': day}})
            if r.get('errors'):
                raise RuntimeError(r['errors'][0].get('message'))
            qs = r['data']['viewer']['accounts'][0]['q']
        except Exception as e:
            unaudited('数据', f'{acct}账号查询画像失败:{str(e)[:100]}')
            continue
        done += 1
        groups = {}   # 按 (账号, 主表) 归并开单:同一张表的重查询一张单,证据列最重的 3 条
        for x in qs:
            CHECKS += 1
            per = x['sum']['rowsRead'] / max(x['count'], 1)
            sql = re.sub(r'\s+', ' ', x['dimensions']['query'])
            worst.append(per)
            if per > 1000:
                t = (re.search(r'(?i)\bFROM\s+([A-Za-z_]\w*)', sql) or [None, '?'])[1]
                groups.setdefault(t, []).append((per, x['count'], x['sum']['rowsRead'], sql))
        for t, xs in groups.items():
            xs.sort(reverse=True)
            ev = ';'.join(f"每次 {p:,.0f} 行 × {c:,} 次{'(含 COUNT/GROUP BY/LIKE)' if AGG_RX.search(q) else ''}:{q[:110]}" for p, c, _, q in xs[:3])
            add('数据', 'd1-heavy-query', f'{acct}:{t}', 'red' if xs[0][0] > 10000 else 'yellow',
                f'{acct}账号 {t} 表高频重查询 {len(xs)} 条(最重每次 {xs[0][0]:,.0f} 行)',
                f'自 {day} 起前 20 高频查询里 {len(xs)} 条落在 {t},共读 {sum(r for _, _, r, _ in xs):,} 行。{ev}', owner,
                recheck=f'{t} 表的查询每次读行数都降到 1,000 以下或不再进前 20')
    if done:
        AUDITED.add('数据')
    KEYS['数据'] = f'两账号前 20 高频查询,单次最大读 {max(worst or [0]):,.0f} 行'
    # 快照新鲜度
    snaps = {f'{BASE}/bohui-automation/local/logs/d1_budget.json': 3, f'{BASE}/skin2oem/data/counts-refresh.log': 48}
    for p, hrs in snaps.items():
        CHECKS += 1
        age = (time.time() - os.path.getmtime(p)) / 3600 if os.path.exists(p) else 1e9
        if age > hrs:
            add('数据', 'snapshot-stale', p, 'yellow', f'快照超过 {hrs} 小时没更新:{os.path.basename(p)}',
                f'{p} 距今 {"不存在" if age >= 1e9 else f"{age:.0f} 小时"}', '主线')
    # 财务:d1_budget 快照(两账号)
    try:
        d = json.load(io.open(f'{BASE}/bohui-automation/local/logs/d1_budget.json', encoding='utf-8'))
        if d.get('errors'):   # 某账号没取到数就不算审到,否则缺席账号的单会被当「自然消失」误关
            unaudited('财务', f"d1_budget 快照有账号取数失败({len(d['errors'])} 个),缺席账号不判")
        else:
            AUDITED.add('财务')
        for x in d['dbs']:
            CHECKS += 1
            if x['level'] != 'green':
                add('财务', 'd1-cycle', f"D1·{x['name']}账号", x['level'], f"D1 读行数超标({x['name']}账号本账期)",
                    f"看门狗快照 {d['at']}:本账期(自 {x['cycle_start']})账号累计 {x['acct_cycle'] / 1e8:,.1f} 亿行 / 包含 250 亿,推算 {x['acct_cycle_proj'] / 1e8:,.1f} 亿;"
                    f"超额 {x['over_included'] / 1e8:,.1f} 亿行 ≈ {x['over_usd']} 美元", 'D2看门狗线', founder=x['over_usd'] > 0,
                    recheck='推算 < 80% 包含额度且本账期无新增超额')
        KEYS['财务'] = ';'.join(f"{x['name']} {x['acct_cycle'] / 1e8:,.1f}/250 亿(超额 {x['over_usd']} 美元)" for x in d['dbs'])
    except Exception as e:
        unaudited('财务', f'd1_budget 快照读不到:{str(e)[:80]}')
    # Actions 分钟(w8848 私有仓;精确账单要 user 权限,这里按 run 时长估)
    try:
        m0 = NOW.date().replace(day=1).isoformat()
        used = 0
        for repo in json.loads(gh('repo', 'list', 'w8848', '--visibility', 'private', '--json', 'name', '--limit', '50')):
            for page in range(1, 11):
                rs = json.loads(gh('api', f"repos/w8848/{repo['name']}/actions/runs?created=>={m0}&per_page=100&page={page}"))['workflow_runs']
                for r in rs:
                    if r.get('run_started_at') and r['status'] == 'completed':
                        sec = (dt.datetime.fromisoformat(r['updated_at'][:-1]) - dt.datetime.fromisoformat(r['run_started_at'][:-1])).total_seconds()
                        used += max(1, -(-int(sec) // 60))
                if len(rs) < 100:
                    break
        dim = ((NOW.date().replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)).day
        proj = used / max(NOW.day - 1 + NOW.hour / 24, 0.5) * dim
        CHECKS += 1
        if proj > 1500:
            add('财务', 'actions-minutes', 'Actions·w8848', 'red' if proj > 1800 else 'yellow', 'GitHub Actions 分钟推算逼近免费 2,000',
                f'本月按 run 时长估已用 {used} 分钟,推算 {proj:.0f}(账单页为准)', '主线')
        KEYS['财务'] = KEYS.get('财务', '') + f';Actions 本月估 {used} 分钟(推算 {proj:.0f}/2,000,不含已删 run,账单页为准)'
        unaudited('财务', 'Actions 精确账单要 gh 的 user 权限(改授权需创始人),现为按 run 时长估算')
    except Exception as e:
        unaudited('财务', f'Actions 分钟估算失败:{str(e)[:80]}')


def gh(*a):
    return b.gh(*a)


# ---------------- 流程科 ----------------
PS_TASKS = r'''[Console]::OutputEncoding=[Text.Encoding]::UTF8
Get-ScheduledTask | ? { $_.TaskName -match '^(Bohui|Beauty2ai)' } | % { $i = $_ | Get-ScheduledTaskInfo
 [pscustomobject]@{n=$_.TaskName; s="$($_.State)"; d="$($_.Description)"; r=$i.LastTaskResult} } | ConvertTo-Json -Compress'''


def process():
    global CHECKS
    AUDITED.add('流程')
    # 残留锁
    locks = [p for p in glob.glob(f'{BASE}/*/tools/**/_LOCK_*', recursive=True) + glob.glob(f'{BASE}/*/_LOCK_*') if os.path.isdir(p)]
    for p in locks:
        CHECKS += 1
        own = ''
        try:
            own = io.open(os.path.join(p, 'owner.txt'), encoding='utf-8').read().strip()
            t = dt.datetime.strptime(re.search(r'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d', own).group(0), '%Y-%m-%d %H:%M:%S').timestamp()
        except Exception:
            t = os.path.getmtime(p)
        hrs = (time.time() - t) / 3600
        if hrs > 2:
            add('流程', 'stale-lock', p, 'red' if hrs > 12 else 'yellow', f'残留锁 {os.path.basename(p)} 已 {hrs:.0f} 小时',
                f'{p};owner:{own[:80] or "无 owner.txt"}', own.split()[0] if own else '主线')
    # 计划任务
    try:
        exp = set(json.load(io.open(os.path.join(HERE, 'expected_tasks.json'), encoding='utf-8'))['enabled'])
        tasks = json.loads(run(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS_TASKS], timeout=300) or '[]')   # 实测偶尔超过 120 秒
        tasks = [tasks] if isinstance(tasks, dict) else tasks
        # 本机常年有 40 多个 Bohui*/Beauty2ai* 任务;列表为空只可能是取数失败或超时(09-24 验收时误开 #25–#30),
        # 这时判「应启任务全部不存在」就是假红 —— 记无法审计
        if not tasks:
            raise RuntimeError('计划任务列表为空(取数失败或超时),不判缺失')
        utc_today = NOW.date().isoformat()
        dis = 0
        for t in tasks:
            CHECKS += 1
            tag = re.match(r'\[D1预算红灯暂停 (\d{4}-\d\d-\d\d) UTC', t['d'] or '')
            if t['s'] == 'Disabled':
                dis += 1
                if tag and tag.group(1) < utc_today:
                    add('流程', 'd1-pause-not-resumed', t['n'], 'red', f"{t['n']} D1 红灯暂停过期未恢复", f"暂停标签日期 {tag.group(1)} UTC,已过下一个 UTC 日", 'D2看门狗线')
                elif t['n'] in exp and not tag:
                    add('流程', 'expected-task-disabled', t['n'], 'red', f"应启任务 {t['n']} 被停用", '在 expected_tasks.json 应启清单里,描述里没有登记停用原因')
            elif t['r'] not in (0, 267009, 267011):
                add('流程', 'task-nonzero', t['n'], 'yellow', f"{t['n']} 上次运行结果 {t['r']}", f"LastTaskResult={t['r']}(非 0)")
        missing = exp - {t['n'] for t in tasks}
        for n in missing:
            add('流程', 'expected-task-missing', n, 'red', f'应启任务 {n} 不存在', 'expected_tasks.json 里有,计划任务里找不到')
        KEYS['流程'] = f'计划任务 {len(tasks)} 个(停用 {dis});残留锁 {len(locks)}'
    except Exception as e:
        unaudited('流程', f'读计划任务失败:{str(e)[:80]}')
    # 闸门日志
    gate_log = f'{BASE}/助手交付/上线闸门日志.md'      # tools-review/gate.sh 写的;「没过闸就部署」由代码科 deploy_audit 对账
    CHECKS += 1
    if not os.path.exists(gate_log):
        unaudited('流程', '闸门日志 助手交付/上线闸门日志.md 不存在')
    else:
        KEYS['流程'] = KEYS.get('流程', '') + f';闸门日志最近更新 {(time.time() - os.path.getmtime(gate_log)) / 3600:.0f} 小时前'
    # 五步法留痕:24h 内改了 src / migrations / wrangler 配置的提交
    n = 0
    for repo in REPOS:
        n += sum(1 for c in git(repo, 'log', '--since=24.hours', '--pretty=format:%h', '--', '*src/*', '*migrations/*', '*wrangler*').split() if c)
    CHECKS += 1
    since = time.time() - 86400
    traces = [p for p in glob.glob(f'{BASE}/助手交付/**/*', recursive=True) + glob.glob(f'{BASE}/tools-review/**/*', recursive=True)
              if re.search(r'审核|review|计划|plan', os.path.basename(p), re.I) and os.path.isfile(p) and os.path.getmtime(p) > since]
    if n and not traces:
        add('流程', 'five-step-trace', f'{TODAY}', 'yellow', f'24 小时内 {n} 个提交改了代码/迁移/wrangler,没找到当天的计划或审核记录',
            '按五步法第 3、4 步应留计划稿与审核记录(交 Claude 判断)', '主线', judge=True)
    KEYS['流程'] = KEYS.get('流程', '') + f';24h 关键改动提交 {n},当天计划/审核记录 {len(traces)} 份'


# ---------------- 交付物候选 ----------------
def deliverables():
    global CHECKS
    AUDITED.add('交付物')
    since = time.time() - 86400
    for p in glob.glob(f'{BASE}/助手交付/**/*.md', recursive=True):
        if '审核部' in p or os.path.getmtime(p) < since:
            continue
        for i, line in enumerate(io.open(p, encoding='utf-8', errors='replace'), 1):
            if not CLAIM_RX.search(line):
                continue
            CHECKS += 1
            bad = [x for x in PATH_RX.findall(line) if not os.path.exists(x.rstrip('.:'))]
            obj = f"{p.replace(BASE + '/', '')}:{i}"
            if bad:
                add('交付物', 'claim-path-missing', obj, 'red', f'「已核实」引用的文件不存在:{obj}', f'行内路径不存在:{bad[:3]};原句:{line.strip()[:120]}', '写这份报告的线')
            if len(CAND) < 40:
                CAND.append({'file': p, 'line': i, 'text': line.strip()[:240]})
    KEYS['交付物'] = f'24h 内带「已核实/已验证/✅」的行 {CHECKS and len(CAND)} 条候选(上限 40)交 Claude 抽查'


def cloud_report():
    """把云端当天日报拉回本机,给 Claude 审核流水线读;云端没出日报 → 流程科记黄/红。"""
    try:
        iss = [i for i in tk._issues('审核部日报', 'open') if i['title'] == '审核部日报·云端']
        if not iss or not iss[0]['comments']:
            raise RuntimeError('云端日报单还没有任何评论')
        c = tk.api('GET', f"/repos/{tk.REPO}/issues/{iss[0]['number']}/comments?per_page=1&page={iss[0]['comments']}")[0]
        day = (dt.datetime.fromisoformat(c['created_at'][:-1]) + dt.timedelta(hours=8)).date()
        lag = (dt.date.fromisoformat(TODAY) - day).days
        if lag == 0:
            io.open(f"{OUT}/云端-{TODAY.replace('-', '')}.md", 'w', encoding='utf-8', newline='\n').write(c['body'])
        else:
            add('流程', 'cloud-audit-missing', 'audit-dept.yml', 'red' if lag >= 2 else 'yellow', f'云端审核 {lag} 天没出日报',
                f'最近一条云端日报 {day};先查 audit-dept.yml 是没触发还是被取消(watchdog 第五条)')
    except Exception as e:
        add('流程', 'cloud-audit-missing', 'audit-dept.yml', 'yellow', '拉不到云端日报', str(e)[:120])


# ---------------- 上线科(审核部 v2.1 的台账,只读)----------------
AV2 = f'{BASE}/tools-review/audit_v2'


def ship_dept():
    """七个数:今日上线 · 审核单签发/拦/存疑 · 机审被推翻 · 急修/破窗 · 未审部署 · 追审逾期 · Jev 今日 token 与上限;另查巡查心跳。"""
    global CHECKS
    AUDITED.add('上线')

    def jl(name):
        p = f'{AV2}/ledger/{name}'
        out = []
        for l in (io.open(p, encoding='utf-8', errors='replace') if os.path.exists(p) else []):
            try:
                out.append(json.loads(l))
            except ValueError:
                pass
        return out
    ship, tks = jl('ship.jsonl'), jl('tickets.jsonl')
    ships = [r for r in ship if r.get('ts', '').startswith(TODAY) and r.get('status') == 'ok' and r.get('action') in ('deploy', 'urgent', 'breakglass')]
    today_tk = [r for r in tks if r.get('ts', '').startswith(TODAY)]
    verdicts = {v: sum(r.get('verdict') == v for r in today_tk) for v in ('过', '拦', '存疑')}
    overrides = 0
    for r in today_tk:
        t = json.load(io.open(f"{AV2}/{r['file']}", encoding='utf-8')) if os.path.exists(f"{AV2}/{r['file']}") else {}
        overrides += sum(o.get('kind') == '推翻机审' for o in t.get('overrides', []))
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    done = {r.get('of') for r in ship if r.get('action') == 'followup_done' and r.get('verdict') == '过'}
    overdue = [r for r in ship if r.get('followup_due') and r.get('ts') not in done and dt.datetime.fromisoformat(r['followup_due']) < now]
    unaudited_n = 0
    wl = f"{AV2}/logs/watch-{TODAY.replace('-', '')}.jsonl"
    for l in (io.open(wl, encoding='utf-8', errors='replace') if os.path.exists(wl) else []):
        try:
            unaudited_n = max(unaudited_n, sum(f.get('rule') in ('unaudited-deploy', 'unaudited-version', 'deploy-message') for f in json.loads(l).get('findings', [])))
        except ValueError:
            pass
    jb = {}
    try:
        jb = json.load(io.open(f'{AV2}/state/jev_budget.json', encoding='utf-8'))
    except Exception:
        pass
    used = jb.get('used_in', 0) if jb.get('day') == TODAY else 0
    CHECKS += 7
    KEYS['上线'] = (f"今日上线 {len(ships)} · 审核单 过{verdicts['过']}/拦{verdicts['拦']}/存疑{verdicts['存疑']} · 机审被推翻 {overrides} · "
                  f"急修 {sum(r['action'] == 'urgent' for r in ships)}/破窗 {sum(r['action'] == 'breakglass' for r in ships)} · 未审部署 {unaudited_n} · "
                  f"追审逾期 {len(overdue)} · Jev 今日 {used:,}/2,000,000 token")
    for r in overdue:
        add('上线', 'followup-overdue', f"{r.get('worker')}:{r.get('ts')}", 'red', f"追审逾期:{r.get('worker')} {r.get('action')}", f"到期 {r['followup_due']};ticket.py followup --worker {r.get('worker')}")
    if not os.path.exists(f'{AV2}/ENABLED'):
        add('上线', 'audit-v2-disabled', 'ENABLED', 'yellow', '审核部 v2.1 开关 ENABLED 不在(观察模式,不拦)', f'{AV2}/ENABLED')
    try:
        hb = json.load(io.open(f'{AV2}/state/watch_heartbeat.json', encoding='utf-8'))
        lag = (now - dt.datetime.fromisoformat(hb['at'])).total_seconds() / 3600
        KEYS['上线'] += f" · 巡查心跳 {hb['at'][5:16]}(红 {hb.get('red', 0)})"
        if lag > 2:
            add('上线', 'watch-heartbeat', 'Bohui-AuditWatch', 'red', f'每小时巡查 {lag:.0f} 小时没跑', f"最后心跳 {hb['at']};查计划任务 Bohui-AuditWatch")
    except Exception:
        add('上线', 'watch-heartbeat', 'Bohui-AuditWatch', 'red', '每小时巡查没有心跳', f'{AV2}/state/watch_heartbeat.json 不在;计划任务 Bohui-AuditWatch 可能没注册(register_watch_task.ps1)')


def report():
    rows = []
    for d in ('财务', '代码', '安全', '数据', '交付物', '流程', '上线'):
        r = sum(f['dept'] == d and f['level'] == 'red' for f in F)
        y = sum(f['dept'] == d and f['level'] == 'yellow' for f in F)
        un = any(u.startswith(d + ':') for u in UNAUDITED)
        concl = '无法审计' if d not in AUDITED else '红' if r else '黄' if y or un else '绿'
        rows.append(f'| {d} | {concl} | {r} | {y} | {KEYS.get(d, "—")} |')
    return rows


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    os.environ['GH_TOKEN'] = subprocess.run(['gh', 'auth', 'token', '--user', 'w8848'], capture_output=True, text=True).stdout.strip()
    for name, fn in (('代码', code), ('数据', data), ('流程', process), ('交付物', deliverables), ('流程', cloud_report), ('上线', ship_dept)):
        try:
            fn()
        except Exception as e:
            AUDITED.discard(name)
            unaudited(name, f'脚本异常 {type(e).__name__}: {str(e)[:120]}')
    s = {}
    if '--dry' not in sys.argv:
        try:
            s = tk.sync(F, AUDITED, '本机', f'https://github.com/{tk.REPO}/issues?q=label%3A审核部日报', TODAY)
        except Exception as e:
            unaudited('流程', f'整改单同步失败:{str(e)[:120]}')
    stamp = TODAY.replace('-', '')
    red_n = sum(f['level'] == 'red' for f in F)
    md = '\n'.join([f'## 审核部日报·本机 {TODAY}(用时 {int(time.time() - t0)} 秒)', '',
                    f"七个数:检查项 {CHECKS} · 新红 {len(s.get('opened', []))}(今日红项 {red_n})· 在办整改单 {len(s.get('open', []))} · 今日关单 {len(s.get('closed', []))}"
                    f" · 逾期 0(截止天数待创始人拍板)· 无法审计 {len(UNAUDITED)} · 需创始人 {sum(bool(f.get('founder')) for f in F if f['level'] == 'red')}", '',
                    '| 科 | 结论 | 红 | 黄 | 关键数字 |', '|---|---|---|---|---|', *report(), '',
                    '**红项**', *(f"- [{f['dept']}] {f['title']}:{f['evidence']}" for f in F if f['level'] == 'red'), '',
                    '**黄项**', *(f"- [{f['dept']}] {f['title']}:{f['evidence']}" for f in F if f['level'] == 'yellow'), '',
                    '**整改单(未关)**', *(f'- {x}' for x in s.get('open', [])), '', '**今日关单**', *(f'- {x}' for x in s.get('closed', [])), '',
                    '**无法审计(不算绿)**', *(f'- {u}' for u in UNAUDITED), '',
                    f'交付物候选 {len(CAND)} 条见 本机-{stamp}.json 的 candidates,由 Claude 审核流水线(audit-dept)抽查。'])
    io.open(f'{OUT}/本机-{stamp}.md', 'w', encoding='utf-8', newline='\n').write(md + '\n')
    json.dump({'date': TODAY, 'findings': F, 'unaudited': UNAUDITED, 'audited': sorted(AUDITED), 'keys': KEYS, 'candidates': CAND, 'tickets': s},
              io.open(f'{OUT}/本机-{stamp}.json', 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    if s.get('daily'):
        tk.post_daily(s['daily'], md)
    print(md)
    return 0


if __name__ == '__main__':
    sys.exit(main())
