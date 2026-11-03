# 审核部 v2.1 · 定时程序 / 单个脚本 / 生产配置变更 / 闸门自身 的审核入口(设计 §6.3、§7)。主线经 ship_ops.sh 调。
#   python ops.py register --all                               基线登记全部 Bohui*/Beauty2ai* 计划任务(只读系统;写 state/tasks.json + 脚本副本)
#   python ops.py register <任务名> --xml <定义.xml> [--files …] 先按 §7.2 审脚本,过了才注册任务(注册在本进程里执行,hook 看不到)
#   python ops.py task <任务名> --note "…"                       审某个已登记任务的脚本改动 → 审核单 kind=task → 更新登记与副本
#   python ops.py script <路径> --note "…"                       审不挂在任务上的单个脚本
#   python ops.py prod --worker <名> --note "…" -- <原命令…>     生产配置变更(secret / 远程迁移 / d1 写 / kv 写 / r2 delete),审过后本进程执行
#   python ops.py gate --note "…" [--data]                       闸门自身改动:红队全过 + 至少 L2 审核单 kind=gate → 本地 git 提交 → 切换已批准副本
#   python ops.py gate --bootstrap                               只在批准清单为空时可用一次:第一版闸门(红队 + Laya/Jev,Claude 审核 24 小时内追审)
#   python ops.py unlock-guard --reason "…"                      settings 保护临时解锁 30 分钟(记台账、开单、推送)
#   python ops.py notify --title … --body …                      红项出口(开 Issue + Server酱)
# 登记表放在 state/tasks.json(不放代码目录:每次批准都要改它,放代码目录会让闸门哈希跟着变)。
import argparse, glob, io, json, os, re, shlex, shutil, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, gate1, judges, ticket
from lib import GateError

EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
PS_TASKS = r'''[Console]::OutputEncoding=[Text.Encoding]::UTF8
$o = Get-ScheduledTask | ? { $_.TaskName -match '^(Bohui|Beauty2ai)' } | % { [pscustomobject]@{n=$_.TaskName; p=$_.TaskPath; s="$($_.State)"; x=[string](Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath)} }
$o | ConvertTo-Json -Compress -Depth 3'''
SCRIPT_RX = re.compile(r'[A-Za-z]:[\\/][^"<>|\r\n]*?\.(?:cmd|bat|py|ps1|vbs|mjs|js|sh)\b', re.I)


def tasks_path():
    return lib.rt('state', 'tasks.json')


def snap_dir(key):
    return lib.rt('state', 'ops_snap', re.sub(r'[^\w.-]', '_', key), 'x').rsplit('/', 1)[0]


def snap_of(key, f):
    return snap_dir(key) + '/' + f.replace('\\', '/').replace(':', '').lstrip('/')


def xml_sha(x):
    x = re.sub(r'<(Date|Author|URI)>.*?</\1>', '', x or '', flags=re.S)
    return lib.sha256(re.sub(r'\s+', ' ', x).strip())


def files_sha(files):
    h = lib.hashlib.sha256()
    for f in sorted(files):
        h.update(f.replace('\\', '/').lower().encode() + b'\0' + (open(f, 'rb').read() if os.path.exists(f) else b'<missing>') + b'\0')
    return h.hexdigest()


def list_tasks():
    if not lib.LIVE:
        return lib.load(lib.rt('state', 'fixture_tasks.json'), [])
    p = lib.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS_TASKS], timeout=600)
    t = json.loads(p.stdout or '[]')
    return [t] if isinstance(t, dict) else t


def derive_files(xml):
    """入口脚本 + 它一层之内调用的脚本(python x.py / node x.mjs / call x.bat)。推导不到的登记时手动补。"""
    ex = ' '.join(re.findall(r'<(?:Command|Arguments|WorkingDirectory)>(.*?)</', xml or '', re.S))
    ex = ex.replace('&quot;', '"').replace('&amp;', '&')
    wd = (re.search(r'<WorkingDirectory>(.*?)</', xml or '') or [None, ''])[1]
    first = [p for p in SCRIPT_RX.findall(ex) if os.path.exists(p)]
    out = []
    for p in first:
        out.append(p)
        if re.search(r'\.(cmd|bat|ps1|sh|vbs)$', p, re.I):
            try:
                txt = io.open(p, encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            base = os.path.dirname(p)
            m = re.search(r'cd\s+(?:/d\s+)?"?([A-Za-z]:[^"\r\n&]+)', txt, re.I)
            cands = SCRIPT_RX.findall(txt) + [os.path.join(m.group(1).strip() if m else base, x) for x in
                                             re.findall(r'(?:python|py|node|call|bash|powershell\s+-File)\S*\s+(?:-\S+\s+)*"?([\w./\\-]+\.(?:py|mjs|js|cmd|bat|ps1|sh))', txt, re.I)]
            out += [os.path.normpath(c) for c in cands if os.path.exists(os.path.normpath(c))]
    if wd and not out:
        out += [f for f in glob.glob(os.path.join(wd, '*.py'))[:3]]
    return sorted({o.replace('\\', '/') for o in out})


def save_snap(key, files):
    d = snap_dir(key)
    shutil.rmtree(d, ignore_errors=True)
    for f in files:
        if os.path.exists(f):
            dst = snap_of(key, f)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(f, dst)


def register_all(a):
    reg = lib.load(tasks_path(), {}) or {}
    if reg:
        raise GateError('登记表已有基线;--all 只在第一次用(再跑会把没审的改动一起洗成基线)。单个任务走 task / register')
    ts = list_tasks()
    if not ts:
        raise GateError('计划任务列表为空(取数失败或超时),不登记')
    for t in ts:
        files = derive_files(t['x'])
        reg[t['n']] = {'enabled_expected': t['s'] != 'Disabled', 'enforce': 'report', 'path': t.get('p', '\\'), 'xml_sha256': xml_sha(t['x']),
                       'entry': files[0] if files else None, 'files': files, 'files_sha256': files_sha(files), 'ticket': '基线-' + f'{lib.now():%Y%m%d}',
                       'owner': '主线', 'note': '基线登记(存量,历史不追审)', 'state_at_baseline': t['s']}
        save_snap(f"task-{t['n']}", files)
    lib.dump(tasks_path(), reg)
    lib.ledger_append('ops.jsonl', {'action': 'tasks_baseline', 'count': len(ts), 'enabled': sum(t['s'] != 'Disabled' for t in ts)})
    print(f"登记 {len(ts)} 个任务(启用 {sum(t['s'] != 'Disabled' for t in ts)}、停用 {sum(t['s'] == 'Disabled' for t in ts)})→ {tasks_path()}")
    return 0


def baseline_task(a):
    """只登记一个任务的现状(审核部自己的巡查任务首次注册用;别的任务改动走 task/register 审核)。"""
    if len(re.sub(r'\s', '', a.reason or '')) < 6:
        raise GateError('登记理由去空白后至少 6 个字')
    if a.name != 'Bohui-AuditWatch':          # 别的任务改动一律走 task / register 审核,不许「直接登记现状」洗掉改动
        raise GateError('baseline-task 只用于审核部自己的巡查任务 Bohui-AuditWatch')
    t = next((x for x in list_tasks() if x['n'] == a.name), None)
    if not t:
        raise GateError(f'计划任务 {a.name} 不存在')
    reg = lib.load(tasks_path(), {}) or {}
    files = derive_files(t['x'])
    reg[a.name] = {'enabled_expected': True, 'enforce': 'report', 'path': t.get('p', '\\'), 'xml_sha256': xml_sha(t['x']), 'entry': files[0] if files else None,
                   'files': files, 'files_sha256': files_sha(files), 'ticket': '登记-' + f'{lib.now():%Y%m%d}', 'owner': '审核部', 'note': a.reason}
    lib.dump(tasks_path(), reg)
    save_snap(f'task-{a.name}', files)
    lib.ledger_append('ops.jsonl', {'action': 'task_baseline_one', 'task': a.name, 'reason': a.reason, 'files': files})
    print(f'已登记 {a.name}:{files}')
    return 0


# ---------------- 文件型审核(定时脚本 / 单脚本 / 生产命令)----------------
def review_files(key, kind, files, base_key, note, target, min_tier='L1'):
    base_dir = snap_dir(base_key) if base_key else None
    common = os.path.commonpath([f.replace('\\', '/') for f in files]) if len(files) > 1 else os.path.dirname(files[0])
    bd = (snap_dir(base_key) + '/' + common.replace('\\', '/').replace(':', '').lstrip('/')) if base_key else None
    g1 = gate1.check_files(key, files, bd)
    print(gate1.summary(g1))
    if g1['block']:
        return 3 if g1.get('hard') else 1
    if not g1['changes']:
        print('没有改动,不用审')
        return 0
    tree = g1['tree']
    old = lib.load(ticket.tpath(key, tree))
    if old and old.get('verdict') == '过' and ticket.content_sha(old) == old.get('content_sha256') and lib.parse_iso(old['expires_at']) > lib.now():
        print(f"已有有效审核单 {old['id']}")
        return 0
    d = lib.load(ticket.dpath(key, tree))
    if not d or d.get('note') != note:
        doubts = [x for x in g1['doubt'] if x['rule'] not in ('R11', 'K2')]
        tier = 'L1' if g1['lines'] <= 80 and not doubts and min_tier == 'L1' else 'L2'
        angles = list(ticket.TIER_ANGLES[tier])
        if any(re.search(r'prospect|outreach|mail|send|crm', f, re.I) for f in files) and not any('合规' in x for x in angles):
            angles.append('合规')
        dd = ticket.ddir(key, tree)
        os.makedirs(dd, exist_ok=True)
        io.open(f'{dd}/all.diff', 'w', encoding='utf-8', newline='\n').write(g1['udiff'])
        fmap = {}
        for an in angles:
            io.open(f'{dd}/{an}.diff', 'w', encoding='utf-8', newline='\n').write(g1['udiff'])
            fmap[an] = {'diff': f'{dd}/{an}.diff', 'files': [c[1] for c in g1['changes']], 'lines': g1['lines']}
        head = f'Kind: {kind}. Key: {key}. Tier: {tier}. Note: {ticket.note_line(note)}\nFiles: ' + ', '.join(c[1] for c in g1['changes'])[:600] + '\nChanged lines:\n'
        mat, partial = judges.material(head, [(key, g1['udiff'])])
        print('-- 机审:Laya(本机约 2 分钟)+ Jev 并行…', flush=True)
        jd = judges.run(mat, partial, tier)
        items = [{'ref': f'G{i}', 'kind': '第一关存疑', 'rule': x['rule'], 'id': x['id'], 'file': x.get('file'), 'line': x.get('line'), 'text': x.get('text', '')[:200]}
                 for i, x in enumerate(g1['doubt'], 1)]
        items += [{'ref': f'E{i}', 'kind': '行内豁免', 'rule': x['rule'], 'file': x['file'], 'line': x['line'], 'text': x['reason']} for i, x in enumerate(g1['exceptions'], 1)]
        for k in ('jev', 'laya'):
            v = jd[k]
            if v.get('status') == '判了' and v.get('verdict') in ('存疑', '拦'):
                items.append({'ref': k.upper(), 'kind': f'{k} {v["verdict"]}', 'text': json.dumps({x: v.get(x) for x in ('decision', 'conf', 'noul', 'reason')}, ensure_ascii=False)})
        d = {'schema': 'bohui-draft/2', 'worker': key, 'kind': kind, 'tree': tree, 'target': target, 'scope_sha256': lib.sha256(lib.canon(sorted(files))),
             'base': {'commit': None, 'tree': base_key, 'first_ship': base_key is None}, 'note': note, 'tier': tier, 'tier_reasons': [f"{g1['lines']} 行"],
             'angles': angles, 'files': fmap, 'all_diff': f'{dd}/all.diff',
             'gate1': {k: g1[k] for k in ('result', 'block', 'doubt', 'exceptions', 'risks', 'lines', 'files', 'seconds')}, 'judges': jd,
             'budget': {'level': 'n/a'}, 'items': items, 'refute_needed': ['JEV'] if jd['jev'].get('verdict') == '拦' else [],
             'reports_expected': [ticket.rpath(key, tree, an) for an in angles], 'created_at': lib.iso(), 'skills': ticket.SKILLS}
        lib.dump(ticket.dpath(key, tree), d)
    rc, _ = ticket.issue(key, tree)
    return rc


def task_review(a):
    reg = lib.load(tasks_path(), {}) or {}
    t = reg.get(a.name)
    if not t:
        raise GateError(f'{a.name} 没登记(先 ops.py register --all)')
    files = sorted(set(t['files']) | set(derive_files(next((x['x'] for x in list_tasks() if x['n'] == a.name), ''))))
    rc = review_files(f'task-{a.name}', 'task', files, f'task-{a.name}', a.note, {'task': a.name})
    if rc == 0:
        tk = latest_ticket(f'task-{a.name}')
        t.update(files=files, files_sha256=files_sha(files), ticket=tk, note=ticket.note_line(a.note))
        reg[a.name] = t
        lib.dump(tasks_path(), reg)
        save_snap(f'task-{a.name}', files)
        lib.ledger_append('ops.jsonl', {'action': 'task_approved', 'task': a.name, 'ticket': tk, 'files_sha256': t['files_sha256']})
        print(f'登记已更新:{a.name} → {tk}')
    return rc


def script_review(a):
    f = os.path.abspath(a.path).replace('\\', '/')
    key = 'script-' + re.sub(r'[^\w.-]', '_', os.path.basename(f)) + '-' + lib.sha256(f.lower())[:6]
    reg = lib.load(tasks_path(), {}) or {}
    rc = review_files(key, 'script', [f], key if os.path.exists(snap_of(key, f)) else None, a.note, {'script': f})
    if rc == 0:
        reg.setdefault('_scripts', {})[f] = {'files_sha256': files_sha([f]), 'ticket': latest_ticket(key)}
        lib.dump(tasks_path(), reg)
        save_snap(key, [f])
        lib.ledger_append('ops.jsonl', {'action': 'script_approved', 'script': f, 'ticket': latest_ticket(key)})
    return rc


def latest_ticket(key):
    tks = [lib.load(p) or {} for p in glob.glob(lib.rp('tickets', key, '*.json')) if '.superseded-' not in p]
    tks = [t for t in tks if t.get('verdict') == '过']
    return max(tks, key=lambda t: t['issued_at'])['id'] if tks else None


def register_one(a):
    reg = lib.load(tasks_path(), {}) or {}
    xml = io.open(a.xml, encoding='utf-16' if open(a.xml, 'rb').read(2) in (b'\xff\xfe', b'\xfe\xff') else 'utf-8').read()
    files = sorted(set(a.files or []) | set(derive_files(xml)))
    key = f'task-{a.name}'
    rc = review_files(key, 'task', files + [os.path.abspath(a.xml)], key if a.name in reg else None, a.note or f'注册/修改计划任务 {a.name}', {'task': a.name})
    if rc != 0:
        return rc
    if not lib.LIVE:
        print('(测试副本:不真注册)')
    else:
        p = lib.run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
                     f"Register-ScheduledTask -TaskName '{a.name}' -Xml (Get-Content -Raw -LiteralPath '{a.xml}') -Force | Out-Null; 'ok'"], timeout=120)
        if 'ok' not in p.stdout:
            raise GateError(f'注册失败:{p.stderr[-300:]}')
    reg[a.name] = {'enabled_expected': True, 'enforce': 'report', 'xml_sha256': xml_sha(xml), 'entry': files[0] if files else None, 'files': files,
                   'files_sha256': files_sha(files), 'ticket': latest_ticket(key), 'owner': '主线', 'note': a.note or ''}
    lib.dump(tasks_path(), reg)
    save_snap(key, files)
    lib.ledger_append('ops.jsonl', {'action': 'task_registered', 'task': a.name, 'ticket': reg[a.name]['ticket']})
    print(f'已注册并登记 {a.name}')
    return 0


# ---------------- 生产配置变更(§7.5)----------------
def prod(a):
    w = lib.wcfg(a.worker)
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == '--' else a.cmd
    if not cmd:
        raise GateError('用法:ops.py prod --worker <名> --note "…" -- <原命令…>')
    text = ' '.join(shlex.quote(x) for x in cmd)
    related = [os.path.abspath(os.path.join(w['repo'], w.get('wrangler_cwd', '.'), x)) for x in cmd if re.search(r'\.(sql|json|txt|js|mjs)$', x)]
    related = [r for r in related if os.path.exists(r)]
    tmpd = lib.rt('cache', 'tmp', 'prod-' + lib.sha256(text)[:12], 'x').rsplit('/', 1)[0]
    os.makedirs(tmpd, exist_ok=True)
    cf = tmpd + '/command.txt'
    io.open(cf, 'w', encoding='utf-8', newline='\n').write(f'worker: {a.worker}\ncwd: {w.get("wrangler_cwd", ".")}\ncommand: {text}\n')
    rc = review_files(f'prod-{a.worker}', 'prod', [cf] + related, None, a.note, {'worker': a.worker, 'command': text, 'account': w['account']})
    if rc != 0:
        return rc
    tk = latest_ticket(f'prod-{a.worker}')
    if not lib.LIVE:
        print(f'(测试副本:不执行)命令 {text}')
        ex = 0
    else:
        p = subprocess.run(text, shell=True, cwd=os.path.join(w['repo'], w.get('wrangler_cwd', '.')), env=lib.wr_env(w['account']), timeout=1800)
        ex = p.returncode
    lib.ledger_append('ops.jsonl', {'action': 'prod', 'worker': a.worker, 'command': re.sub(r'(--\w*(key|token|secret|password)\w*[= ])\S+', r'\1[密钥]', text, flags=re.I),
                                    'exit': ex, 'ticket': tk})
    if ex == 0 and re.search(r'\bsecret\s+(put|delete|bulk)\b', text):
        v = None
        try:
            v, _ = lib.live_version(a.worker)
        except Exception:
            pass
        lib.ledger_append('ship.jsonl', {'worker': a.worker, 'action': 'secret', 'status': 'ok', 'version_id': v, 'ticket': tk, 'note': ticket.note_line(a.note)})
    print(f'执行完毕 exit {ex}(已记 ledger/ops.jsonl)')
    return ex


# ---------------- 闸门自身(§6.3)----------------
def redteam():
    rt = os.path.join(lib.CODE, 'redteam', 'run.sh')
    if not os.path.exists(rt):
        rt = os.path.join(lib.REAL, 'redteam', 'run.sh')
    print(f'-- 红队全套:{rt}', flush=True)
    p = subprocess.run([lib.BASH, rt], env=lib.clean_env(), timeout=3600)
    return p.returncode


def approve(tree_or_none, tk_id, note):
    tr = lib.TR
    env = lib.clean_env(GIT_AUTHOR_NAME='审核部', GIT_AUTHOR_EMAIL='audit@local', GIT_COMMITTER_NAME='审核部', GIT_COMMITTER_EMAIL='audit@local')
    lib.run(['git', *lib.GIT_C, 'add', '-A'], cwd=tr, env=env, check=True)
    st = lib.run(['git', *lib.GIT_C, 'status', '--porcelain'], cwd=tr, env=env).stdout.strip()
    if st:
        lib.run(['git', *lib.GIT_C, 'commit', '-q', '-m', f'gate approve {tk_id}\n\n{note}'], cwd=tr, env=env, check=True)
    c = lib.git(tr, 'rev-parse', 'HEAD').strip()
    if tree_or_none:
        now_tree, _ = lib.scope_tree('gate', fresh=True)
        if now_tree != tree_or_none:
            raise GateError(f'批准时的闸门树 {now_tree[:12]} ≠ 审核单 {tree_or_none[:12]}(审完又改过)')
    wt = lib.APPROVED_ROOT
    if os.path.isdir(wt + '/.git') or os.path.isfile(wt + '/.git'):
        lib.run(['git', *lib.GIT_C, 'checkout', '-q', '--detach', '--force', c], cwd=wt, env=env, check=True)
    else:
        lib.run(['git', *lib.GIT_C, 'worktree', 'add', '--detach', wt, c], cwd=tr, env=env, check=True)
    old = lib.ref_commit(tr, 'refs/ship/gate')
    lib.git(tr, 'update-ref', '--create-reflog', '-m', f'ship gate {c[:12]}', 'refs/ship/gate', c, old or '')
    h = lib.gate_hash(lib.APPROVED)
    lst = lib.gate_approved_list()
    lst.append({'gate_hash': h, 'ticket': tk_id, 'commit': c, 'at': lib.iso()})
    lib.dump(lib.rt('state', 'gate_approved.json'), lst)
    return c, h


def gate(a):
    if a.bootstrap:
        return bootstrap(a)
    if not lib.gate_approved_list():
        raise GateError('还没有任何批准记录:第一版用 ops.py gate --bootstrap')
    note = (a.note or '') + ('【数据表】' if a.data else '')
    if a.data:
        base = lib.ref_commit(lib.TR, 'refs/ship/gate')
        now_tree, _ = lib.scope_tree('gate', fresh=True)
        ch = lib.git(lib.TR, 'diff', '--name-only', base + '^{tree}', now_tree).split()
        bad = [p for p in ch if not re.search(r'\.txt$|terms_whitelist\.json$|sites\.json$', p)]
        if 'audit_v2/sites.json' in ch:
            old = json.loads(lib.git(lib.TR, 'show', f'{base}:audit_v2/sites.json'))
            new = lib.load(lib.REAL + '/sites.json')
            strip = lambda c: {k: ({w: {kk: vv for kk, vv in v.items() if kk != 'smoke'} for w, v in c[k].items()} if k == 'workers' else c[k]) for k in c}
            if strip(old) != strip(new):
                bad.append('sites.json(除 smoke 段以外也改了)')
        if bad:
            raise GateError(f'--data 只许改数据表(*.txt、terms_whitelist.json、sites.json 的 smoke 段),这次还改了:{bad}')
    elif redteam() != 0:
        print('红队没全过:不批准(见上)')
        return 1
    rc = ticket.prepare(argparse.Namespace(worker='gate', note=note, repo=None, urgent=False, incident=None, patch=None))
    if rc != 0:
        return rc
    now_tree, _ = lib.scope_tree('gate', fresh=True)
    tk = lib.load(ticket.tpath('gate', now_tree))
    c, h = approve(now_tree, tk['id'], note)
    lib.ledger_append('ship.jsonl', {'worker': 'gate', 'action': 'deploy', 'status': 'ok', 'version_id': c, 'snapshot': c, 'tree_shipped': now_tree,
                                     'ticket': tk['id'], 'ticket_sha256': tk['content_sha256'], 'note': ticket.note_line(note)})
    lib.anchor(f'闸门批准 {tk["id"]} · 提交 {c[:12]} · gate_hash {h[7:19]}', defer=a.defer_anchor)
    print(f'闸门已批准:提交 {c[:12]},已批准副本切到这一版,gate_hash {h[7:19]}')
    return 0


def bootstrap(a):
    if lib.gate_approved_list():
        raise GateError('批准清单已有记录,--bootstrap 只能用一次;以后改闸门走 ship_ops.sh gate')
    if not os.path.isdir(lib.TR + '/.git'):
        raise GateError('tools-review 还不是 git 仓(先 git init,设 core.autocrlf=false)')
    rc = redteam()
    if rc != 0:
        print('红队没全过:不启用')
        return 1
    tree, probs = lib.scope_tree('gate', fresh=True)
    if probs:
        raise GateError(';'.join(probs))
    g1 = gate1.check_tree('gate', tree, EMPTY_TREE, 'gate')
    print(gate1.summary(g1))
    if g1['block']:
        return 1
    head = f'Kind: gate bootstrap. Note: {ticket.note_line(a.note)}\nFiles: ' + ', '.join(c[1] for c in g1['changes'])[:800] + '\nCode (truncated):\n'
    fd = [(p, lib.git(lib.TR, 'diff', '--no-color', EMPTY_TREE, tree, '--', p)) for p in [c[1] for c in g1['changes']] if p.endswith(('.py', '.sh', '.cmd'))]
    mat, partial = judges.material(head, fd)
    print('-- 机审:Laya + Jev 并行…', flush=True)
    jd = judges.run(mat, partial, 'L3')
    for k, v in jd.items():
        print(f"   {k}: {v.get('status')} {v.get('verdict') or ''} {v.get('reason') or ''} conf={v.get('conf')}")
    now = lib.now()
    tk = {'schema': 'bohui-ticket/2', 'id': f'RT-{now:%Y%m%d-%H%M}-gate-{tree[:8]}', 'kind': 'gate', 'target': {'worker': 'gate', 'repo': lib.TR, 'account': 'none'},
          'tree': tree, 'scope_sha256': lib.scope_sha(lib.wcfg('gate')), 'gate_hash': lib.gate_hash(), 'rules_hash': lib.rules_hash(), 'env_sha256': None,
          'base': {'ref': 'refs/ship/gate', 'commit': None, 'tree': EMPTY_TREE, 'first_ship': True}, 'prev_ticket': None,
          'diff': {'files': g1['files'], 'lines': g1['lines']}, 'note': a.note or '审核部 v2.1 第一版闸门(引导批准)', 'tier': '引导',
          'tier_reasons': ['批准清单为空,第一版闸门只能引导批准:红队全过 + Laya/Jev 机审留痕;Claude 审核员 24 小时内追审(ticket.py followup --worker gate)'],
          'gate1': {'result': g1['result'], 'block': 0, 'doubt': len(g1['doubt']), 'exceptions': len(g1['exceptions']), 'seconds': g1['seconds'].get('total')},
          'budget': {'level': 'n/a'}, 'judges': jd, 'reports': [], 'resolved': [], 'overrides': [], 'exceptions': g1['exceptions'],
          'risks': {'费用': ['Jev 按量付费(每天 200 万 token 硬上限,约 0.084 美元)'], '安全': ['同一 Windows 用户下本地签名防不了蓄意伪造(§6.4),靠每小时对账兜底'],
                    '合规': ['已查:本批不含对外文案'], '正确性': ['急修 worktree 的 pnpm install --offline 未在真仓实测'], '回归': ['两站 ship.sh 切到 v2 后首次上线是 L3 大审']},
          'smoke_extra': [], 'verdict': '过', 'why': ['引导批准'], 'issued_at': lib.iso(now), 'expires_at': lib.iso(now + lib.dt.timedelta(hours=24)),
          'followup_due': lib.iso(now + lib.dt.timedelta(hours=24)), 'followup': [], 'incident': None, 'degraded': True, 'issuer': ticket.ISSUER}
    tk['content_sha256'] = ticket.content_sha(tk)
    p = ticket.tpath('gate', tree)
    lib.dump(p, tk)
    lib.ledger_append('tickets.jsonl', {'id': tk['id'], 'worker': 'gate', 'tree': tree, 'verdict': '过', 'kind': 'gate',
                                        'file': os.path.relpath(p, lib.RT).replace('\\', '/'), 'content_sha256': tk['content_sha256']})
    c, h = approve(tree, tk['id'], '审核部 v2.1 第一版闸门(引导批准)')
    lib.ledger_append('ship.jsonl', {'worker': 'gate', 'action': 'baseline', 'status': 'ok', 'version_id': c, 'snapshot': c, 'tree_shipped': tree,
                                     'ticket': tk['id'], 'ticket_sha256': tk['content_sha256'], 'followup_due': tk['followup_due'],
                                     'note': '第一版闸门引导批准:Claude 审核员 24 小时内追审'})
    lib.anchor(f"闸门引导批准 {tk['id']} · 提交 {c[:12]} · gate_hash {h[7:19]} · 台账链头 {lib.ledger_head('tickets.jsonl')[:12]}", defer=a.defer_anchor)
    print(f'第一版闸门已批准:{tk["id"]},提交 {c[:12]},已批准副本 {lib.APPROVED_ROOT},gate_hash {h[7:19]}')
    return 0


def unlock_guard(a):
    if len(re.sub(r'\s', '', a.reason or '')) < 6:
        raise GateError('解锁理由去空白后至少 6 个字')
    until = lib.now() + lib.dt.timedelta(minutes=30)
    lib.dump(lib.rt('state', 'guard_unlock.json'), {'until': lib.iso(until), 'reason': a.reason, 'at': lib.iso()})
    lib.ledger_append('ops.jsonl', {'action': 'unlock_guard', 'until': lib.iso(until), 'reason': a.reason})
    lib.issue('[审核部/红][上线] settings 保护临时解锁 30 分钟', f'理由:{a.reason}\n到期:{lib.iso(until)}\n改完的 settings 会在下一轮巡查里对照批准清单。')
    lib.push('settings 保护临时解锁', a.reason)
    print(f'已解锁到 {until:%H:%M}(记台账、开单、推送)')
    return 0


def notify(a):
    lib.issue(f'[审核部/红][上线] {a.title}', a.body or a.title)
    print(lib.push(a.title, a.body or a.title))
    return 0


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='op', required=True)   # 09-25:原来叫 cmd,和 prod 的位置参数 cmd 撞名 → a.cmd 变成列表,prod 从没跑通
    r = sp.add_parser('register'); r.add_argument('name', nargs='?'); r.add_argument('--all', action='store_true'); r.add_argument('--xml'); r.add_argument('--files', nargs='*'); r.add_argument('--note')
    t = sp.add_parser('task'); t.add_argument('name'); t.add_argument('--note', required=True)
    s = sp.add_parser('script'); s.add_argument('path'); s.add_argument('--note', required=True)
    p = sp.add_parser('prod'); p.add_argument('--worker', required=True); p.add_argument('--note', required=True); p.add_argument('cmd', nargs=argparse.REMAINDER)
    g = sp.add_parser('gate'); g.add_argument('--note', default=''); g.add_argument('--data', action='store_true'); g.add_argument('--bootstrap', action='store_true'); g.add_argument('--defer-anchor', action='store_true')
    u = sp.add_parser('unlock-guard'); u.add_argument('--reason', required=True)
    n = sp.add_parser('notify'); n.add_argument('--title', required=True); n.add_argument('--body', default='')
    b = sp.add_parser('baseline-task'); b.add_argument('name'); b.add_argument('--reason', required=True)
    a = ap.parse_args()
    try:
        if a.op == 'register':
            return register_all(a) if a.all else register_one(a)
        return {'task': task_review, 'script': script_review, 'prod': prod, 'gate': gate, 'unlock-guard': unlock_guard, 'notify': notify,
                'baseline-task': baseline_task}[a.op](a)
    except GateError as e:
        print(f'[ops] 拒绝:{e}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
