# 审核部 v2.1 · 公用小件(gate1 / ticket / judges / smoke / watch / ops 共用)。
# hook_guard.py、bg_log.py 故意不 import 本文件:它们用系统 Python -I -S 跑,只靠标准库。
# 运行位置:执行点一律跑已批准副本 cache/gate_approved/audit_v2/(急-8);运行时数据(tickets/ledger/state/…)
# 永远在工作副本 F:/0cosmetic/tools-review/audit_v2/ 下。代码不在 tools-review 里(红队临时副本)时,运行时目录 = 代码目录,
# 且一律不联网:不推送、不开 Issue、不调 Jev/wrangler,夹具从 state/fixture_* 读。
import datetime as dt, glob, hashlib, io, json, os, re, shutil, subprocess, sys, time, urllib.request

TR = 'F:/0cosmetic/tools-review'
REAL = TR + '/audit_v2'
CODE = os.path.dirname(os.path.abspath(__file__)).replace('\\', '/')
LIVE = CODE.lower().startswith(TR.lower() + '/') and '/cache/tmp/' not in CODE.lower()   # 红队临时副本放在 cache/tmp/ 下,不算正式
RT = REAL if LIVE else CODE
APPROVED_ROOT = REAL + '/cache/gate_approved'
APPROVED = APPROVED_ROOT + '/audit_v2'
SYS_PY = 'C:/Users/Administrator/AppData/Local/Programs/Python/Python312/python.exe'
VENV_PY = 'F:/0cosmetic/_venv/review/Scripts/python.exe'
SEMGREP = 'F:/0cosmetic/_venv/review/Scripts/semgrep.exe'
BASH = 'C:/Program Files/Git/bin/bash.exe'        # 别用 PATH 上的 bash:System32 那个是 WSL,看不见 F: 盘路径
PROXY = 'http://127.0.0.1:7890'
BJ = dt.timezone(dt.timedelta(hours=8))
GIT_C = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=NUL',
         '-c', 'core.excludesFile=', '-c', 'core.quotepath=off', '-c', 'core.safecrlf=false']
MARKS_RED_OK = ('【降读】', '【安全】', '【急修】')
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


class GateError(Exception):
    pass


def now():
    return dt.datetime.now(BJ).replace(microsecond=0)


def iso(t=None):
    return (t or now()).isoformat()


def parse_iso(s):
    return dt.datetime.fromisoformat(s)


def enabled():
    return os.path.exists(RT + '/ENABLED')


def rt(*parts):
    p = os.path.join(RT, *parts).replace('\\', '/')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def rp(*parts):
    """运行时目录下的路径(不建目录;glob 用,路径里可以带 *)。"""
    return os.path.join(RT, *parts).replace(os.sep, '/')


def load(path, default=None):
    try:
        with io.open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f'{path}.tmp{os.getpid()}'
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def sha256(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode('utf-8')).hexdigest()


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def cfg():
    c = load(CODE + '/sites.json')
    if not c:
        raise GateError(f'读不了 {CODE}/sites.json')
    return c


def wcfg(worker):
    c = cfg()
    w = c['workers'].get(worker) or c.get('gates', {}).get(worker)
    if not w:
        raise GateError(f'sites.json 里没有 Worker「{worker}」')
    w = dict(w, name=worker)
    w.setdefault('exclude', c.get('exclude_default', []))
    return w


def repo_workers(repo):
    return {k: v for k, v in cfg()['workers'].items() if v['repo'].lower() == repo.replace('\\', '/').rstrip('/').lower()}


def clean_env(**extra):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('GIT_')}
    env.update(PYTHONUTF8='1', PYTHONIOENCODING='utf-8', LC_ALL='C.UTF-8')
    env.update({k: v for k, v in extra.items() if v is not None})
    return env


def run(args, cwd=None, env=None, input=None, timeout=600, check=False, text=True):
    # 输入一律按字节送:Windows 上 text 模式会把 \n 写成 \r\n,git --stdin 读到的路径就多了 \r(check-attr 因此漏报过 filter)
    p = subprocess.run(args, cwd=cwd, env=env or clean_env(), input=input.encode('utf-8') if isinstance(input, str) else input,
                       capture_output=True, timeout=timeout)
    if text:
        p.stdout, p.stderr = p.stdout.decode('utf-8', 'replace'), p.stderr.decode('utf-8', 'replace')
    if check and p.returncode:
        raise GateError(f'{" ".join(map(str, args))[:200]} 失败 exit {p.returncode}:{(p.stderr or p.stdout or "")[-400:]}')
    return p


def git(repo, *args, idx=None, input=None, check=True, text=True, timeout=600):
    env = clean_env(GIT_INDEX_FILE=idx) if idx else clean_env()
    p = run(['git', *GIT_C, *args], cwd=repo, env=env, input=input, check=False, text=text, timeout=timeout)
    if check and p.returncode:
        err = p.stderr if text else p.stderr.decode('utf-8', 'replace')
        raise GateError(f'git {" ".join(args)[:160]} 失败:{err[-300:]}')
    return p.stdout if check else p


# ---------------- 版本哈希(§2.1) ----------------
def scope_specs(repo, w):
    """sites.json 的 scope 里现在存在的路径;exclude 写成 :(glob,exclude) pathspec(只给 ls-files 用)。"""
    specs = []
    for s in w['scope']:
        if glob.glob(os.path.join(repo, s)):
            specs.append(s)
    return specs, [f':(glob,exclude){e}' for e in w['exclude']]


def glob_rx(pat):
    """git :(glob) 口径:**/ 任意层目录,/** 目录下一切,* 不跨 /。"""
    i, out = 0, ''
    while i < len(pat):
        if pat.startswith('**/', i):
            out, i = out + '(?:.*/)?', i + 3
        elif pat.startswith('/**', i) and i + 3 == len(pat):
            out, i = out + '/.*', i + 3
        elif pat[i] == '*':
            out, i = out + '[^/]*', i + 1
        elif pat[i] == '?':
            out, i = out + '[^/]', i + 1
        elif pat[i] == '[' and ']' in pat[i:]:
            j = pat.index(']', i)
            out, i = out + pat[i:j + 1], j + 1
        else:
            out, i = out + re.escape(pat[i]), i + 1
    return re.compile(out + r'\Z')


def scope_files(repo, w):
    """审核范围内的文件(相对路径)。自己遍历磁盘、自己按 exclude 过滤,不交给 git add:
    git 2.55 在「空索引 + 目录 pathspec + 某些 exclude pathspec」组合下会一个文件都不加(tools/ 下的 Worker 实测为空树)。
    不看 .gitignore(绕-3:src/data/ 被公司仓 .gitignore 误吃)。"""
    rx = [glob_rx(e) for e in w['exclude']]
    hit = lambda rel: any(r.match(rel) for r in rx)
    out, links = set(), []
    for s in w['scope']:
        for p in glob.glob(os.path.join(repo, s)):
            rel = os.path.relpath(p, repo).replace('\\', '/')
            if os.path.islink(p):
                links.append(rel)
                continue
            if os.path.isfile(p):
                if not hit(rel):
                    out.add(rel)
                continue
            for dp, ds, fs in os.walk(p):
                rd = os.path.relpath(dp, repo).replace('\\', '/')
                links += [f'{rd}/{x}' for x in ds + fs if os.path.islink(os.path.join(dp, x)) and not hit(f'{rd}/{x}')]
                ds[:] = [d for d in ds if d != '.git' and not os.path.islink(os.path.join(dp, d)) and not hit(f'{rd}/{d}/\x01')]
                out.update(f'{rd}/{f}' for f in fs if not hit(f'{rd}/{f}') and not os.path.islink(os.path.join(dp, f)))
    return sorted(out), links


def scope_sha(w):
    return sha256(canon({'scope': sorted(w['scope']), 'exclude': sorted(w['exclude'])}))


def scope_tree(worker, fresh=True, repo=None):
    """只含审核范围文件的 git 树(40 位)。fresh=True 用全新空索引(ship/verify,防 assume-unchanged/伪 stat);
    fresh=False 借本 Worker 的私有持久索引的 stat 缓存(构建期,只求快)。返回 (tree, problems)。"""
    w = wcfg(worker)
    repo = repo or w['repo']
    files, links = scope_files(repo, w)
    if not files:
        raise GateError(f'{worker} 的审核范围在 {repo} 里一个文件都没有')
    tmp = rt('cache', 'tmp', f'idx-{worker}.{os.getpid()}.{time.time_ns()}')
    keep = rt('cache', f'idx-{worker}')
    if not fresh and os.path.exists(keep):
        shutil.copyfile(keep, tmp)
        gone = set(git(repo, 'ls-files', '-z', idx=tmp).split('\0')) - set(files) - {''}
        if gone:
            git(repo, 'update-index', '--force-remove', '-z', '--stdin', input='\0'.join(sorted(gone)) + '\0', idx=tmp)
    try:
        git(repo, 'update-index', '--add', '-z', '--stdin', input='\0'.join(files) + '\0', idx=tmp)
        problems = [f'范围内有符号链接(哈希看不见链接指向的内容):{links[:5]}'] if links else []
        ls = git(repo, 'ls-files', '-s', idx=tmp)
        links = [l.split('\t', 1)[1] for l in ls.splitlines() if l.startswith('120000 ')]
        if links:
            problems.append(f'范围内有符号链接:{links[:5]}')
        files = [l.split('\t', 1)[1] for l in ls.splitlines() if '\t' in l]
        attrs = git(repo, 'check-attr', '--stdin', 'filter', input='\n'.join(files) + '\n', idx=tmp)
        bad = [l for l in attrs.splitlines() if l and not l.endswith(': unspecified')]
        if bad:
            problems.append(f'范围内文件带 filter 属性(clean 过滤器会让哈希和磁盘不一致):{bad[:5]}')
        loc = git(repo, 'config', '--local', '--get-regexp', r'^filter\.', check=False)
        if loc.returncode == 0 and loc.stdout.strip():
            problems.append('仓库本地配置了 filter.* 过滤器:' + loc.stdout.strip()[:200])
        tree = git(repo, 'write-tree', idx=tmp).strip()
        if not fresh:
            os.replace(tmp, keep)
        return tree, problems
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def env_sha(worker):
    """范围内 .env* 不进 git 对象,另算 sha256 记进审核单(§2.1)。"""
    w = wcfg(worker)
    h = hashlib.sha256()
    for s in w['scope']:
        for base in glob.glob(os.path.join(w['repo'], s)):
            cands = [base] if os.path.isfile(base) else [
                os.path.join(d, f) for d, ds, fs in os.walk(base)
                if not re.search(r'node_modules|[\\/]dist[^\\/]*|[\\/]\.astro|[\\/]\.wrangler', d) for f in fs]
            for p in sorted(cands):
                if re.match(r'\.env', os.path.basename(p)):
                    h.update(os.path.relpath(p, w['repo']).replace('\\', '/').encode() + b'\0' + open(p, 'rb').read() + b'\0')
    return h.hexdigest()


def ship_ref(worker):
    return f'refs/ship/{worker}'


def ref_commit(repo, ref):
    p = git(repo, 'rev-parse', '-q', '--verify', ref + '^{commit}', check=False)
    return p.stdout.strip() if p.returncode == 0 else None


def base_of(worker):
    """(基准提交, 基准树, 是否首次上线)。refs/ship/<w> 在就用它,不在用 first_base(adopt-baseline 之前)。"""
    w = wcfg(worker)
    c = ref_commit(w['repo'], ship_ref(worker))
    if c:
        return c, git(w['repo'], 'rev-parse', c + '^{tree}').strip(), False
    fb = w.get('first_base')
    if not fb:
        raise GateError(f'{worker} 没有 refs/ship 也没有 first_base')
    fbc = git(w['repo'], 'rev-parse', fb + '^{commit}').strip()
    return fbc, scoped_tree_of_commit(worker, fbc), True


def scoped_tree_of_commit(worker, commit):
    """把某个提交里审核范围内的文件单独取成一棵树(adopt-baseline、首次基准用)。"""
    w = wcfg(worker)
    tmp = rt('cache', 'tmp', f'idxc-{worker}.{os.getpid()}.{time.time_ns()}')
    try:
        git(w['repo'], 'read-tree', commit, idx=tmp)
        ex = [glob_rx(e) for e in w['exclude']]
        sc = [glob_rx(s) if re.search(r'[*?\[]', s) else s.rstrip('/') for s in w['scope']]
        in_scope = lambda f: any((s.match(f) if hasattr(s, 'match') else (f == s or f.startswith(s + '/'))) for s in sc)
        allf = [f for f in git(w['repo'], 'ls-files', '-z', idx=tmp).split('\0') if f]
        drop = [f for f in allf if not in_scope(f) or any(r.match(f) for r in ex)]
        if drop:
            git(w['repo'], 'update-index', '--force-remove', '-z', '--stdin', input='\0'.join(drop) + '\0', idx=tmp)
        return git(w['repo'], 'write-tree', idx=tmp).strip()
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def cache_v_only(repo, a, b):
    """两棵树只差 middleware.ts 里 const CACHE_V 这一行(平台 deploy.sh 每次上线自动换)。"""
    ns = git(repo, 'diff', '--numstat', a, b).strip().splitlines()
    if len(ns) != 1 or not ns[0].endswith('apps/web/src/middleware.ts') or not ns[0].startswith('1\t1\t'):
        return False
    d = git(repo, 'diff', '-U0', a, b, '--', 'apps/web/src/middleware.ts')
    ch = [l for l in d.splitlines() if l[:1] in '+-' and not l.startswith(('+++', '---'))]
    return len(ch) == 2 and all(re.match(r"^[+-]\s*(export\s+)?const CACHE_V = '[^']*';\s*$", l) for l in ch)


# ---------------- 台账(链式 jsonl,§2.6) ----------------
def _lines(path):
    if not os.path.exists(path):
        return []
    return open(path, 'rb').read().split(b'\n')


def repair_tail(name):
    """最后一行半行(断电/磁盘满/被杀)→ 原样存 torn-<时间>.txt,截掉,另记一行「截断修复」(急-7)。"""
    path = rt('ledger', name)
    raw = open(path, 'rb').read() if os.path.exists(path) else b''
    if not raw or raw.endswith(b'\n'):
        return False
    cut = raw.rfind(b'\n') + 1
    torn = raw[cut:]
    tp = rt('ledger', f'torn-{now():%Y%m%d-%H%M%S}-{name}.txt')
    open(tp, 'wb').write(torn)
    with open(path, 'r+b') as f:
        f.truncate(cut)
    ledger_append(name, {'action': 'torn_repair', 'torn_file': os.path.basename(tp), 'torn_sha256': sha256(torn)}, _repaired=True)
    return True


def ledger_append(name, rec, _repaired=False):
    path = rt('ledger', name)
    if not _repaired:
        repair_tail(name)
    ls = [l for l in _lines(path) if l.strip()]
    rec = dict(rec, ts=rec.get('ts') or iso(), prev=hashlib.sha256(ls[-1]).hexdigest() if ls else 'genesis')
    with open(path, 'ab') as f:
        f.write(json.dumps(rec, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n')
    return rec


def ledger_records(name):
    repair_tail(name)
    out = []
    for l in _lines(rt('ledger', name)):
        if l.strip():
            try:
                out.append(json.loads(l))
            except ValueError:
                out.append({'_bad': l[:200].decode('utf-8', 'replace')})
    return out


def ledger_verify(name):
    """重算 prev 链。中间断链 → (False, 原因);被 reseal 行确认过的断点不算。"""
    repair_tail(name)
    ls = [l for l in _lines(rt('ledger', name)) if l.strip()]
    breaks, acked = [], set()
    for i, l in enumerate(ls):
        try:
            r = json.loads(l)
        except ValueError:
            breaks.append(i)
            continue
        want = 'genesis' if i == 0 else hashlib.sha256(ls[i - 1]).hexdigest()
        if r.get('prev') != want:
            breaks.append(i)
        if r.get('action') == 'reseal' and r.get('upto_sha256') == hashlib.sha256(b'\n'.join(ls[:i]) + b'\n').hexdigest():
            acked.update(r.get('breaks', []))
    bad = [i for i in breaks if i not in acked]
    return (not bad, f'{name} 第 {[i + 1 for i in bad]} 行断链' if bad else 'ok')


def ledger_breaks(name):
    ls = [l for l in _lines(rt('ledger', name)) if l.strip()]
    out = []
    for i, l in enumerate(ls):
        try:
            ok = json.loads(l).get('prev') == ('genesis' if i == 0 else hashlib.sha256(ls[i - 1]).hexdigest())
        except ValueError:
            ok = False
        if not ok:
            out.append(i)
    return out, hashlib.sha256(b'\n'.join(ls) + b'\n').hexdigest() if ls else None


def ledger_head(name):
    ls = [l for l in _lines(rt('ledger', name)) if l.strip()]
    return hashlib.sha256(ls[-1]).hexdigest() if ls else 'genesis'


# ---------------- 闸门哈希(§6.3) ----------------
GATE_EXT = ('.py', '.sh', '.cmd', '.json', '.yml', '.txt')


def gate_files(code_dir=None):
    code_dir = (code_dir or CODE).replace('\\', '/')
    root = os.path.dirname(code_dir)
    fs = [f'{code_dir}/{n}' for n in sorted(os.listdir(code_dir)) if n.endswith(GATE_EXT) and os.path.isfile(f'{code_dir}/{n}')]
    fs += [f'{root}/{n}' for n in ('rules.yml', 'laya_judge.py') if os.path.isfile(f'{root}/{n}')]
    return root, fs


def gate_hash(code_dir=None):
    root, fs = gate_files(code_dir)
    h = hashlib.sha256()
    for p in fs:
        h.update(os.path.relpath(p, root).replace('\\', '/').encode() + b'\0' + open(p, 'rb').read() + b'\0')
    return 'sha256:' + h.hexdigest()


def gate_approved_list():
    return load(rt('state', 'gate_approved.json'), []) or []


def gate_ok(code_dir=None):
    h = gate_hash(code_dir)
    return any(x.get('gate_hash') == h for x in gate_approved_list()), h


def rules_hash():
    h = hashlib.sha256()
    for n in ('rules-v2.yml', 'rules-v2-strict.yml', 'paid_domains.txt', 'allow_domains.txt', 'terms_whitelist.json', 'gate1.py'):
        p = f'{CODE}/{n}'
        if os.path.exists(p):
            h.update(n.encode() + b'\0' + open(p, 'rb').read())
    v1 = os.path.dirname(CODE) + '/rules.yml'
    if os.path.exists(v1):
        h.update(b'rules.yml\0' + open(v1, 'rb').read())
    return 'sha256:' + h.hexdigest()


# ---------------- 报警出口(§4.5) ----------------
def alert_md(title, body):
    p = f'F:/0cosmetic/助手交付/审核部/告警-{now():%Y%m%d}.md' if LIVE else rt('logs', 'alerts.md')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, 'a', encoding='utf-8', newline='\n') as f:
        f.write(f'\n## {now():%H:%M} {title}\n\n{body}\n')
    return p


def push(title, body, fp=None):
    """Server酱,只推红项;免费档每天 5 条:按指纹去重,第 5 条改推汇总。LIVE 以外只落本地。"""
    alert_md('[红] ' + title, body)
    st = load(rt('state', 'push.json'), {}) or {}
    day = f'{now():%Y-%m-%d}'
    if st.get('day') != day:
        st = {'day': day, 'n': 0, 'fps': [], 'held': 0}
    fp = fp or sha256(title)[:12]
    if fp in st['fps']:
        return 'dup'
    st['fps'].append(fp)
    if st['n'] >= 5:
        st['held'] += 1
        dump(rt('state', 'push.json'), st)
        return 'held'
    if st['n'] == 4:
        title, body = f'今天第 5 条红项:{title}', body + '\n\n(今天推送额度用完,后面的红项只进 Issue 和 助手交付/审核部/告警-*.md)'
    st['n'] += 1
    dump(rt('state', 'push.json'), st)
    if not LIVE:
        return 'local'
    try:
        keys = load('F:/0cosmetic/_secrets/model-keys.json', {}).get('serverchan', {}).get('keys') or []
        if not keys:
            return 'nokey'
        data = urllib.parse.urlencode({'title': title[:90], 'desp': body[:3000]}).encode()
        for px in (None, PROXY):
            try:
                op = urllib.request.build_opener(urllib.request.ProxyHandler({'https': px} if px else {}))
                op.open(urllib.request.Request(f'https://sctapi.ftqq.com/{keys[0]}.send', data=data), timeout=15).read()
                return 'sent'
            except Exception:
                continue
        return 'fail'
    except Exception as e:
        return f'fail {type(e).__name__}'


import urllib.parse  # noqa: E402


def gh_token():
    if not os.environ.get('GH_TOKEN'):
        os.environ['GH_TOKEN'] = run(['gh', 'auth', 'token', '--user', 'w8848'], timeout=30).stdout.strip()
    return os.environ['GH_TOKEN']


def tickets_mod():
    sys.path[:0] = ['F:/0cosmetic/bohui-automation/tools']
    import audit_tickets
    return audit_tickets


def issue(title, body, labels=('审核部', '审核部/红', '科:上线')):
    """事件型红单(破窗、回退、冒烟失败):一次一张,直接开。持续型问题走 watch 的 audit_tickets.sync。"""
    alert_md('[Issue] ' + title, body)
    if not LIVE:
        return None
    try:
        gh_token()
        tk = tickets_mod()
        return tk.api('POST', f'/repos/{tk.REPO}/issues', {'title': title[:240], 'labels': list(labels), 'body': body[:60000]})['number']
    except Exception as e:
        with io.open(rt('state', 'issue_pending.jsonl'), 'a', encoding='utf-8') as f:
            f.write(json.dumps({'ts': iso(), 'title': title, 'body': body, 'labels': list(labels), 'err': str(e)[:200]}, ensure_ascii=False) + '\n')
        return None


def anchor(text, defer=False):
    """外部锚点:往 w8848/bohui-automation「审核部台账」Issue 追加一条评论;失败不挡,记 anchor_pending,watch 补发。"""
    rec = {'ts': iso(), 'text': text}
    if defer or not LIVE:
        with io.open(rt('state', 'anchor_pending.jsonl'), 'a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        return False
    try:
        gh_token()
        tk = tickets_mod()
        it = next((i for i in tk._issues('审核部台账', 'open') if i['title'] == '审核部台账'), None)
        if not it:
            it = tk.api('POST', f'/repos/{tk.REPO}/issues', {'title': '审核部台账', 'labels': ['审核部台账'],
                        'body': '审核部 v2.1 外部锚点:每签一张审核单、每批准一版闸门,在这里追加一条评论(单号、content_sha256 前 12 位、台账链头)。不要关。'})
        tk.api('POST', f"/repos/{tk.REPO}/issues/{it['number']}/comments", {'body': text})
        return True
    except Exception as e:
        rec['err'] = str(e)[:200]
        with io.open(rt('state', 'anchor_pending.jsonl'), 'a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        return False


# ---------------- wrangler 取数(只读) ----------------
def wr_env(account):
    env = {k: v for k, v in clean_env().items() if not k.startswith('CLOUDFLARE_')}
    if account == 'company':
        txt = io.open('F:/0cosmetic/cosmetic-sites/.env', encoding='utf-8').read()
        env.update(re.findall(r'^\s*(?:export\s+)?(CLOUDFLARE_\w+)\s*=\s*"?([^"\r\n]+)"?', txt, re.M))
    for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'):
        env.pop(k, None)
    try:
        urllib.request.build_opener(urllib.request.ProxyHandler({})).open('https://api.cloudflare.com/client/v4/', timeout=6)
    except urllib.error.HTTPError:
        pass
    except Exception:
        env['HTTPS_PROXY'] = env['HTTP_PROXY'] = PROXY
    return env


import urllib.error  # noqa: E402


def wrangler(worker, args, timeout=180):
    w = wcfg(worker)
    cmd = w.get('wrangler_cmd', 'npx wrangler')
    cwd = os.path.join(w['repo'], w.get('wrangler_cwd', '.'))
    return subprocess.run(f'{cmd} {args}', shell=True, cwd=cwd, env=wr_env(w['account']), capture_output=True,
                          text=True, encoding='utf-8', errors='replace', timeout=timeout)


def deployments(worker):
    """线上部署列表(新→旧)。测试副本读 state/fixture_deployments_<w>.json。"""
    if not LIVE:
        d = load(rt('state', f'fixture_deployments_{worker}.json'))
        if d is None:
            raise GateError(f'夹具缺 fixture_deployments_{worker}.json')
    else:
        r = wrangler(worker, f'deployments list --name {worker} --json')
        m = re.search(r'\[.*\]', r.stdout, re.S)
        if r.returncode != 0 or not m:
            raise GateError(f'{worker} deployments list 失败:{(r.stderr or r.stdout)[-300:]}')
        d = json.loads(m.group(0))
    return sorted(d, key=lambda x: x.get('created_on', ''), reverse=True)


def live_version(worker):
    """当前线上 100% 流量的版本 id。"""
    ds = deployments(worker)
    if not ds:
        return None, None
    vs = ds[0].get('versions') or []
    top = max(vs, key=lambda v: v.get('percentage', 0)) if vs else {}
    return top.get('version_id'), ds[0]
