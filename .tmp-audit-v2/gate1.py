# 审核部 v2.1 · 第一关·机器初审(设计-v2.1.md §1)
# 用法:python gate1.py --repo <仓库> [--worker <名>] [--mode build|ship|gate|prepush] [--tree T --base-tree B] [--json]
#       python gate1.py --mode ops --name <任务名> --files <绝对路径…> --base-dir <上次批准的副本目录>
# 退出码:0 过;1 拦;2 闸门自身出错(按拦处理);3 硬规则(S1/S2/R1–R4/C5)未过,破窗也不放。
# 「新增违例」= 当前指纹 − 基准指纹(多重集;指纹 = 规则|路径|sha1(命中行去首尾空白)),按 (规则哈希, 路径, blob) 缓存(§1.3)。
import argparse, collections, difflib, hashlib, io, json, math, os, re, shutil, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: F401,F403
import lib

V_RX = re.compile(r'^(apps/web/src/(pages|components|layouts|lib)/|apps/web/src/middleware\.ts$|packages/[^/]+/src/)')
ADMIN_RX = re.compile(r'^apps/web/src/pages/(bohui/|[^/]+/bohui/|hosonzuo/|api/admin/|api/cron/)')
PUB_RX = re.compile(r'^apps/web/public/.*\.(txt|xml|json|html|webmanifest)$', re.I)
SCRIPT_RX = re.compile(r'\.(sh|py|ps1|bat|cmd|mjs|js|cjs|ts)$', re.I)
CFG_RX = re.compile(r'(^|/)(wrangler[\w.-]*\.(toml|jsonc?|json)|package\.json)$')
WRANGLER_CFG = re.compile(r'(^|/)wrangler[\w.-]*\.(toml|jsonc?)$')
V1_MAP = {'visitor-live-aggregate': ('C1', 'block', '费用'), 'render-path-db-write': ('C2', 'block', '费用'),
          'search-count-cap': ('C3', 'block', '费用'), 'secret-literal': ('S1', 'block', '安全'), 'tmp-path': ('V1-tmp', 'block', '正确性')}
STRICT_V1 = {'secret-literal'}
HARD = {'S1', 'S2', 'R1', 'R2', 'R3', 'R4', 'C5'}
SENS_RX = re.compile(r'middleware\.ts|/lib/db\.ts|auth|guard|session|login|member/|mail|outreach|send|smtp|resend|wrangler|astro\.config|deploy|mkconfig|ship[\w-]*\.sh|package\.json|pnpm-lock\.yaml|migrations/|/api/|/bohui/|/hosonzuo/|canon\.ts|searchGate|turnstile|cost|price', re.I)
NS_OK = re.compile(r'nosemgrep:\s*([\w.-]+(?:\s*,\s*[\w.-]+)*)\s+\S')
GO_OK = re.compile(r'gate-ok:\s*([\w.-]+(?:\s*,\s*[\w.-]+)*)\s+\S')
TERMS_KW = r'起订量|最小起订|MOQ|出样|打样|样品周期|交期|货期|lead\s*time|sampl\w*\s+time|production\s+time'
INTERNAL_ZH = r'创始人|老板|大哥|股东|成本|底价|毛利|利润|返点|回扣|采购价|进价|客户名单|内部|拍板|铁令|对外不提|不要提|机密|密码|hosonzuo|w8848|印尼工厂|SueAI'
INJECT_RX = re.compile(r'(审核员|审核|reviewer|auditor|AI|模型|LLM|Claude|Jev|Laya)[^\n]{0,20}(忽略|ignore|已批准|已审核|approved|放行|allow)|ignore\s+(all\s+|the\s+)?(previous|above)|忽略(以上|上面|之前)', re.I)


def is_v(p):
    return bool(V_RX.match(p)) and not ADMIN_RX.match(p)


def is_p(p):
    return is_v(p) or bool(PUB_RX.match(p))


def fp_of(rule, path, text):
    return f"{rule}|{path}|{hashlib.sha1(text.strip().encode('utf-8', 'replace')).hexdigest()[:16]}"


def git_blob_id(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def _lines(data):
    return data.decode('utf-8', 'replace').splitlines()


def _domains(name):
    p = f'{lib.CODE}/{name}'
    return [l.strip().lower() for l in io.open(p, encoding='utf-8') if l.strip() and not l.startswith('#')] if os.path.exists(p) else []


# ---------------- 逐文件内容规则(Python 写的那几条;与 semgrep 结果一起按 blob 缓存) ----------------
def py_rules(path, data):
    out, ls = [], _lines(data)
    low = path.lower()
    if low.endswith('.md'):
        return out
    paid = _domains('paid_domains.txt')
    terms = (lib.load(f'{lib.CODE}/terms_whitelist.json', {}) or {}).get('allowed', [])

    def add(gid, rid, i, text, level, cat, **kw):
        out.append(dict(rule=gid, id=rid, line=i, text=text.strip()[:240], level=level, cat=cat, **kw))
    for i, l in enumerate(ls, 1):
        ll = l.lower()
        for d in paid:
            if re.search(r'(?<![\w.-])' + re.escape(d) + r'(?![\w-])', ll):
                if path == 'apps/web/src/lib/fleet.ts' or path.startswith('tools/gateway/') or (d == 'api.typesafe.ai' and path.startswith('audit_v2/')):
                    break      # 例外路径:模型目录声明处由网关硬上限管;Jev 只许审核部自己调
                add('C7', 'C7-paid-api', i, l, 'block' if is_v(path) else 'doubt', '费用', domain=d)
                break
        if is_v(path) and re.search(r'\bfetch\(\s*(?![\'"`]|new\s+Request)', l) and not re.match(r'\s*(//|\*|/\*)', l):
            add('C7', 'C7-dynamic-fetch', i, l, 'doubt', '费用')
        if re.search(r'\b(sk-|ghp_|github_pat_)[A-Za-z0-9_-]*[\'"]\s*\+', l):
            add('S1', 'S1-split-secret', i, l, 'doubt', '安全')
        if re.search(r'nosemgrep', l, re.I) and not NS_OK.search(l):
            add('K6', 'K6-bare-nosemgrep', i, l, 'block', '正确性', strict=True)
        if re.search(r'gate-ok', l, re.I) and not GO_OK.search(l):
            add('K6', 'K6-bare-gate-ok', i, l, 'block', '正确性', strict=True)
        if INJECT_RX.search(l):
            add('S9', 'S9-reviewer-injection', i, l, 'doubt', '安全')
        if re.search(r'ea5b0da4|"bohui-web"', l) and (CFG_RX.search(path) or SCRIPT_RX.search(path)):
            add('S5', 'S5-cross-account', i, l, 'block', '安全', repos=['skin2oem'])
        if re.search(r'f5010e65', l) and (CFG_RX.search(path) or SCRIPT_RX.search(path)):
            add('S5', 'S5-cross-account', i, l, 'block', '安全', repos=['cosmetic-sites'])
        if is_p(path) and re.search(r'帛卉|BIOSPHERE|biosphere-ai\.com|白云区|龙兴东路', l):
            add('R6', 'R6-platform-factory', i, l, 'doubt', '合规', repos=['skin2oem'])
        if (is_p(path) or re.search(r'(^|/)lib/[^/]*prompt|(^|/)tools/prospect/', path)) and re.search(TERMS_KW, l, re.I):
            for m in re.finditer(TERMS_KW, l, re.I):
                win = l[max(0, m.start() - 20): m.end() + 20]
                nums = set(re.findall(r'\d+', win))
                ok = set()
                for t in terms:
                    if re.search(t['kw'], m.group(0), re.I):
                        ok |= set(t['numbers'])
                if nums - ok:
                    add('R7', 'R7-invented-terms', i, l, 'doubt', '合规', numbers=sorted(nums - ok))
                    break
    # C10:先把 \ 续行拼成一行再匹配(急-19);strict
    if low.startswith('tools/') or re.search(r'\.(sh|py|ps1|bat|cmd)$', low):
        joined, start = '', None
        for i, l in enumerate(ls + [''], 1):
            if start is None:
                start = i
            joined += l.rstrip('\\') + ' ' if l.rstrip().endswith('\\') else l
            if l.rstrip().endswith('\\'):
                continue
            if (re.search(r'\bwrangler\s+d1\s+(execute|migrations\s+apply)\b', joined) and not re.search(r'\s(-c|--config)\b', joined)) or \
               (re.search(r'["\']wrangler["\']\s*,\s*["\']d1["\']\s*,\s*["\'](execute|migrations)["\']', joined) and not re.search(r'["\'](-c|--config)["\']', joined)):
                if not re.match(r'\s*(#|//|rem\s|::)', joined):
                    add('C10', 'C10-d1-no-config', start, joined, 'block', '费用', strict=True)
            joined, start = '', None
    return out


# ---------------- semgrep(一次调用,--disable-nosem;豁免由本文件判,strict 规则不认豁免) ----------------
def semgrep(items):
    """items: [(path, data)] → {(path, blob): [finding]}。同一路径不同内容分组各扫一次。"""
    res = {}
    groups = []
    for p, d in items:
        g = next((g for g in groups if p not in g), None)
        if g is None:
            g = {}
            groups.append(g)
        g[p] = d
    cfgs = [os.path.dirname(lib.CODE) + '/rules.yml', lib.CODE + '/rules-v2.yml', lib.CODE + '/rules-v2-strict.yml']
    for gi, g in enumerate(groups):
        d = lib.rt('cache', 'tmp', f'sg-{os.getpid()}-{gi}-{time.time_ns()}', 'x')
        root = os.path.dirname(d)
        try:
            for p, data in g.items():
                fp = os.path.join(root, p)
                os.makedirs(os.path.dirname(fp), exist_ok=True)
                open(fp, 'wb').write(data)
            args = [lib.SEMGREP, 'scan', *sum([['--config', c] for c in cfgs if os.path.exists(c)], []), '--metrics=off', '--json', '-q',
                    '--disable-nosem', '--no-git-ignore', '-j', '2', *g.keys()]
            env = lib.clean_env(SEMGREP_ENABLE_VERSION_CHECK='0', SEMGREP_SEND_METRICS='off')
            p = subprocess.run(args, cwd=root, env=env, capture_output=True, timeout=600,
                               creationflags=getattr(subprocess, 'BELOW_NORMAL_PRIORITY_CLASS', 0))
            try:
                out = json.JSONDecoder().raw_decode(p.stdout.decode('utf-8', 'replace').lstrip())[0]
            except ValueError:
                raise GateError(f'semgrep 输出解析失败 exit {p.returncode}:{p.stderr.decode("utf-8", "replace")[-400:]}')
            errs = [e for e in out.get('errors', []) if e.get('level', 'error') == 'error' and 'Syntax' not in str(e.get('type', ''))]
            if errs:
                raise GateError(f'semgrep 报错:{str(errs[0])[:300]}')
            for pth, data in g.items():
                res[(pth, git_blob_id(data))] = []
            seen = set()
            for r in out.get('results', []):
                pth = r['path'].replace('\\', '/')
                rid = r['check_id'].split('.')[-1]
                line = r['start']['line']
                if (pth, rid, line) in seen or pth not in g:
                    continue
                seen.add((pth, rid, line))
                md = r['extra'].get('metadata') or {}
                if rid in V1_MAP:
                    gid, lvl, cat = V1_MAP[rid]
                    md = dict(gid=gid, level=lvl, cat=cat, strict=rid in STRICT_V1, hard=rid in STRICT_V1)
                ls = _lines(g[pth])
                text = ls[line - 1] if 0 < line <= len(ls) else ''
                f = dict(rule=md.get('gid', rid), id=rid, line=line, text=text.strip()[:240], level=md.get('level', 'block'),
                         cat=md.get('cat', ''), strict=bool(md.get('strict')))
                if md.get('repos'):
                    f['repos'] = md['repos']
                res[(pth, git_blob_id(g[pth]))].append(f)
        finally:
            shutil.rmtree(root, ignore_errors=True)
    return res


def scan(items):
    """带缓存的逐文件扫描:[(path, data)] → {(path, blob): findings}。缓存键 = 规则哈希:路径:blob(§1.3)。"""
    rh = lib.rules_hash()[7:23]
    cp = lib.rt('cache', 'sg-blobs.json')
    cache = lib.load(cp, {}) or {}
    out, miss = {}, []
    for p, d in items:
        k = f'{rh}:{p}:{git_blob_id(d)}'
        if k in cache:
            out[(p, git_blob_id(d))] = cache[k]
        elif (p, d) not in miss:
            miss.append((p, d))
    sem = [(p, d) for p, d in miss if not p.lower().endswith('.md')]
    got = semgrep(sem) if sem else {}
    for p, d in miss:
        b = git_blob_id(d)
        fs = got.get((p, b), []) + py_rules(p, d)
        out[(p, b)] = fs
        cache[f'{rh}:{p}:{b}'] = fs
    if miss:
        lib.dump(cp, cache)
    return out


# ---------------- diff 规则 + 风险清单 ----------------
def added_by_file(udiff):
    """unified diff(-U0)→ {新路径: [(新行号, 文本)]}, {路径: [删掉的文本]}, hunk 列表。"""
    add, rem, hunks, cur, ln, hk = collections.defaultdict(list), collections.defaultdict(list), [], None, 0, None
    for l in udiff.splitlines():
        if l.startswith('+++ '):
            cur = None if l[4:] == '/dev/null' else l[6:] if l.startswith('+++ b/') else l[4:]
        elif l.startswith('--- '):
            continue
        elif l.startswith('@@'):
            m = re.search(r'\+(\d+)', l)
            ln = int(m.group(1)) if m else 0
            hk = {'file': cur, 'add': [], 'rem': []}
            hunks.append(hk)
        elif cur is not None and l.startswith('+'):
            add[cur].append((ln, l[1:]))
            hk and hk['add'].append(l[1:])
            ln += 1
        elif cur is not None and l.startswith('-'):
            rem[cur].append(l[1:])
            hk and hk['rem'].append(l[1:])
    return add, rem, hunks


def diff_rules(repo_name, changes, udiff, stats, mode, count_maxw, tree_problems, public_files, note=''):
    """changes: [(status, path, oldpath)];返回 (findings, risks)。"""
    F, R = [], []
    add, rem, hunks = added_by_file(udiff)
    allow = _domains('allow_domains.txt')
    paid = _domains('paid_domains.txt')

    def f(gid, rid, path, line, text, level, cat, **kw):
        F.append(dict(rule=gid, id=rid, file=path, line=line, text=(text or '').strip()[:240], level=level, cat=cat, **kw))

    def risk(rk, cat, level, item, mit=''):
        R.append(dict(rule=rk, cat=cat, level=level, item=item, mitigation=mit))
    paths = [c[1] for c in changes]
    for st, p, old in changes:
        base = os.path.basename(p)
        if st != 'D' and (re.search(r'(^|/)\.env(\.|$)', p) or (re.search(r'\.(sqlite\d?|db|sql|dump|pem|key|pfx)$', p, re.I) and not re.match(r'^db/migrations/[^/]+\.sql$', p))
                          or re.search(r'\.agnes-image\.json$|_KEYS|密码|登录信息|model-keys\.json', p)):
            f('S2', 'S2-secret-file', p, 0, base, 'block', '安全', hard=True)
        if st == 'A' and re.match(r'^apps/web/src/pages/(api/|bohui/|hosonzuo/|[^/]+/bohui/)', p):
            risk('RK5', '安全', '中', f'新增 API/后台路由 {p}(S8)', '鉴权逐条核(x-bohui-dept、canCost)')
        if st == 'D' and re.match(r'^apps/web/src/pages/', p):
            risk('RK13', '回归', '中', f'删除页面 {p}', '会出 404、影响 sitemap 与 SEO')
        if re.search(r'\[\.\.\.(path|slug)\]\.astro$', p):
            risk('K3', '回归', '高', f'改了 catch-all 路由 {p}', 'catch-all 会把渲染异常吞成 404,上线后 wrangler tail 看异常')
    for p, lines in add.items():
        for ln, t in lines:
            m = re.search(r'\b(fetch\(|requests\.(get|post)|urlopen\(|httpx|axios)', t)
            if m:
                for host in re.findall(r'https?://([^/\s\'"`?#:]+)', t):
                    h = host.lower()
                    if not any(h == a or h.endswith('.' + a) for a in allow) and not any(d in h for d in paid) and '${' not in h:
                        f('C8', 'C8-new-endpoint', p, ln, t, 'doubt', '费用', host=h)
            if WRANGLER_CFG.search(p) and re.search(r'crons?', t):
                if re.search(r'\*/[1-9]\b|"\* \* \* \* \*"|\'\* \* \* \* \*\'', t):
                    f('C9', 'C9-cron-cost', p, ln, t, 'doubt', '费用')
                risk('RK10', '费用', '中', f'{p} 定时触发变更:{t.strip()[:80]}', '说明频率;回退不会回滚 crons')
            if re.search(r'(^|/)\.github/workflows/', p):
                if re.search(r'runs-on:\s*\[?\s*["\']?(macos|windows)', t, re.I):
                    f('C9', 'C9-runner-cost', p, ln, t, 'block', '费用')
                if re.search(r'cron:\s*["\'](0|\*)\s', t):
                    f('C9', 'C9-cron-top-of-hour', p, ln, t, 'doubt', '费用')
            if WRANGLER_CFG.search(p):
                m2 = re.match(r'\s*"?([A-Za-z_][\w]*?(_API_KEY|_SECRET|_TOKEN|PASSWORD))"?\s*[:=]\s*["\']([^"\']+)["\']', t)
                if m2 and not m2.group(1).startswith('PUBLIC_'):
                    f('S4', 'S4-vars-secret', p, ln, t, 'block', '安全')
            if repo_name == 'cosmetic-sites' and re.search(INTERNAL_ZH, t):
                comment = re.match(r'\s*(//|/\*|\*|#|<!--)', t)
                nonsite = re.match(r'^(tools|data|docs)/', p) or ('/' not in p and p.endswith('.md'))
                if (comment or nonsite) and not re.search(r'gate-ok:\s*R11\s+\S', t):
                    f('R11', 'R11-public-repo-zh', p, ln, t, 'block' if mode == 'prepush' else 'risk', '合规')
            if is_v(p) and re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b|\.prepare\(', t):
                risk('RK6', '费用', '中', f'访客路径新增 SQL {p}:{ln}', '按「查询先量行数」估读行数,上线后看 d1 insights')
    # K1 版心 1800(急-19)
    for h in hunks:
        if any('112.5rem' in x for x in h['rem']) and any(re.search(r'max-width\s*:\s*(?!112\.5rem)[\d.]+rem', x) for x in h['add']):
            f('K1', 'K1-maxw-1800', h['file'], 0, next(x for x in h['add'] if 'max-width' in x), 'block', '正确性')
    b_cnt, c_cnt = count_maxw
    if b_cnt and c_cnt == 0:
        f('K1', 'K1-maxw-gone', '-', 0, f'112.5rem 从 {b_cnt} 处降到 0', 'block', '正确性')
    elif c_cnt < b_cnt and not any(x['rule'] == 'K1' for x in F):
        f('K1', 'K1-maxw-less', '-', 0, f'112.5rem 从 {b_cnt} 处降到 {c_cnt}(挪进 token 可以,审核员确认版心仍是 112.5rem)', 'doubt', '正确性')
    # CACHE_V / 导航 / 依赖 / 配置 / 迁移 / 鉴权 / 上线脚本
    mw = [x for x in add.get('apps/web/src/middleware.ts', []) if re.search(r'const CACHE_V', x[1])]
    if mw:
        risk('RK1', '费用', '高', f'CACHE_V 改成 {mw[0][1].strip()[:60]}:全站缓存失效', '上线后 1–2 小时 D1 读量尖峰;D1 灯不绿时说明须带【降读】【安全】【急修】')
    if 'apps/web/src/middleware.ts' in paths:
        risk('RK2', '回归', '高', 'middleware.ts 变了:所有请求都经过它', '冒烟跑全表')
    nav = [p for p in paths if re.search(r'components/[^/]*(Nav|Header|Footer|Menu)[^/]*$|(^|/)lib/nav|Stage(Nav|Bar|Header)', p)]
    if nav and not mw:
        f('K2', 'K2-nav-cache', nav[0], 0, '改导航没 bump CACHE_V', 'doubt', '正确性', files=nav)
    pk = [p for p in paths if p.endswith('package.json')]
    lock = 'pnpm-lock.yaml' in paths
    dep_changed = any(re.search(r'"(dependencies|devDependencies|peerDependencies|optionalDependencies)"|"[@\w./-]+"\s*:\s*"(workspace:|[\^~]?\d|\*|latest|npm:)', t) for p in pk for _, t in add.get(p, [])) or \
        any(re.search(r'"[@\w./-]+"\s*:\s*"(workspace:|[\^~]?\d|\*|latest|npm:)', t) for p in pk for t in rem.get(p, []))
    if dep_changed != lock and (dep_changed or lock):
        f('K4', 'K4-lockfile-drift', 'pnpm-lock.yaml', 0, f'依赖字段{"变了" if dep_changed else "没变"}、锁文件{"变了" if lock else "没变"}', 'doubt', '正确性')
    if dep_changed or lock:
        risk('RK4', '安全', '中', '依赖或锁文件变了', '供应链风险;看 pnpm allowBuilds 有没有新放行;L3 上线前 pnpm install --offline --frozen-lockfile')
    for p in paths:
        if WRANGLER_CFG.search(p):
            risk('RK3', '安全', '高', f'wrangler 配置变了 {p}:绑定/路由/vars/crons 逐项看', '回退不会回滚这些')
        if re.match(r'^db/(migrations/)?', p):
            risk('RK8', '回归', '高', f'迁移目录变了 {p}', '迁移要先于代码上线;回退不会回滚迁移')
        if re.search(r'auth|session|member|login|guard', p, re.I):
            risk('RK11', '安全', '高', f'碰到鉴权/会话 {p}', '')
        if re.search(r'(^|/)(ship[\w-]*\.sh|deploy[\w.-]*\.(sh|py)|mkconfig\.py|astro\.config\.mjs)$|b2o-split/', p):
            risk('RK12', '安全', '高', f'碰到部署或上线脚本 {p}', '闸门完整性问题,L3')
        if re.search(r'i18n|locales?/|/content/.*\.json$', p) and stats.get(p, 0) > 50:
            risk('RK9', '正确性', '中', f'i18n 表大改 {p}({stats[p]} 行)', '缺的译文回退到 en')
        if is_p(p) and p not in [r.get('file') for r in R]:
            risk('RK7', '合规', '中', f'对外文案/页面变了 {p}', '合规审核员看语种与页面')
    for prob in tree_problems:
        f('S10', 'S10-git-filter-symlink', '-', 0, prob, 'block', '安全')
    for p, size in public_files:
        if re.search(r'\.(bak\w*|env|sql|sqlite|log|py|sh|ps1|jsonl|md)$', p, re.I):
            f('S3', 'S3-public-junk', p, 0, os.path.basename(p), 'block', '安全')
        elif size > 25 * 1024 * 1024:
            f('S3', 'S3-public-too-big', p, 0, f'{size / 1048576:.1f} MiB > 25 MiB', 'block', '安全')
        elif size > 5 * 1024 * 1024:
            f('S3', 'S3-public-big', p, 0, f'{size / 1048576:.1f} MiB', 'doubt', '安全')
    return F, R


# ---------------- 主流程 ----------------
def exempt(f, lines_of):
    """行内豁免:命中行或上一行有 nosemgrep:<id> 理由 / gate-ok:<id> 理由,且 id 对得上本规则(规则 id 或 C4 这类编号)。"""
    ls = lines_of(f['file'])
    for j in (f['line'] - 1, f['line'] - 2):
        if 0 <= j < len(ls):
            m = NS_OK.search(ls[j]) or GO_OK.search(ls[j])
            if m:
                ids = [x.strip() for x in m.group(1).split(',')]
                if f['id'] in ids or f['rule'] in ids:
                    return ls[j][m.end(1):].strip()[:160]
    return None


def evaluate(repo_name, pairs_cur, pairs_base, rename_map, lines_of):
    """pairs_*: {path: data};返回新增违例列表(带 file)。"""
    got = scan([(p, d) for p, d in list(pairs_cur.items()) + list(pairs_base.items())])
    new = []
    for p, d in pairs_cur.items():
        cur = [x for x in got[(p, git_blob_id(d))] if repo_name in x.get('repos', [repo_name])]
        bp = rename_map.get(p, p)
        base = [x for x in got.get((bp, git_blob_id(pairs_base[bp])), [])] if bp in pairs_base else []
        cnt = collections.Counter(fp_of(x['rule'] + ':' + x['id'], p, x['text']) for x in base if repo_name in x.get('repos', [repo_name]))
        for x in cur:
            k = fp_of(x['rule'] + ':' + x['id'], p, x['text'])
            if cnt[k] > 0:
                cnt[k] -= 1
                continue
            new.append(dict(x, file=p))
    return new


def finish(res, block, doubt, exceptions, risks, t0, secs):
    res.update(block=block, doubt=doubt, exceptions=exceptions, risks=risks)
    res['seconds'] = dict(secs, total=round(time.time() - t0, 1))
    hard = [b for b in block if b['rule'] in HARD or b.get('hard')]
    res['result'] = '拦' if block else '过'
    res['hard'] = bool(hard)
    return res


def split(findings, lines_of, mode):
    block, doubt, exc, risks = [], [], [], []
    for x in findings:
        if x['level'] == 'risk':
            risks.append(dict(cat=x['cat'] or '回归', level='中', rule=x['rule'], item=f"{x['file']}:{x['line']} {x['text'][:80]}", mitigation=''))
            continue
        if x['rule'] == 'K6':
            block.append(x)
            continue
        why = None if x.get('strict') else exempt(x, lines_of)
        if why:
            exc.append(dict(rule=x['rule'], id=x['id'], file=x['file'], line=x['line'], reason=why))
        elif x['level'] == 'block':
            block.append(x)
        else:
            doubt.append(x)
    return block, doubt, exc


def check_tree(worker, tree=None, base_tree=None, mode='ship', note=''):
    t0, secs = time.time(), {}
    w = lib.wcfg(worker)
    repo = w['repo']
    if w.get('kind') == 'gate':
        mode = 'gate'
    repo_name = os.path.basename(repo.rstrip('/'))
    problems = []
    if not tree:
        tree, problems = lib.scope_tree(worker, fresh=(mode != 'build'))
    secs['tree'] = round(time.time() - t0, 1)
    if not base_tree:
        _, base_tree, _ = lib.base_of(worker)
    key = lib.sha256(f'{repo}|{worker}|{mode}|{tree}|{base_tree}|{lib.rules_hash()}|{lib.gate_hash()}|{problems}')[:24]
    cp = lib.rt('cache', f'gate1-{key}.json')
    hit = lib.load(cp)
    if hit:
        hit['cached'] = True
        return with_s3(hit, repo)
    t1 = time.time()
    ns = lib.git(repo, 'diff', '--name-status', '-M', '-z', base_tree, tree).split('\0')
    changes, i = [], 0
    while i < len(ns) - 1:
        st = ns[i]
        if st.startswith(('R', 'C')):
            changes.append((st[0], ns[i + 2], ns[i + 1]))
            i += 3
        else:
            changes.append((st[0], ns[i + 1], None))
            i += 2
    stats, raw, i = {}, lib.git(repo, 'diff', '--numstat', '-M', '-z', base_tree, tree).split('\0'), 0
    while i < len(raw) - 1:
        a, d, p = raw[i].split('\t', 2)
        if p == '':                      # 改名:-z 下旧名、新名各占一段
            p, i = raw[i + 2], i + 3
        else:
            i += 1
        stats[p] = 0 if a == '-' else int(a) + int(d)
    udiff = lib.git(repo, 'diff', '-U0', '-M', '--no-color', base_tree, tree)
    secs['diff'] = round(time.time() - t1, 1)

    def blobs(tr, paths):
        if not paths:
            return {}
        spec = '\n'.join(f'{tr}:{p}' for p in paths) + '\n'
        raw = lib.git(repo, 'cat-file', '--batch', input=spec.encode('utf-8'), text=False)
        out, pos = {}, 0
        for p in paths:
            nl = raw.index(b'\n', pos)
            hdr = raw[pos:nl].split()
            if len(hdr) < 3 or hdr[1] != b'blob':
                pos = nl + 1
                continue
            n = int(hdr[2])
            out[p] = raw[nl + 1: nl + 1 + n]
            pos = nl + 1 + n + 1
        return out
    textish = lambda p: not re.search(r'\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf|mp4|webm|mp3|zip|gz|wasm|bin)$', p, re.I)
    # 闸门自身(--mode gate):红队夹具、规则文件、数据表里本来就写着违例样例,不扫(急-20)
    skip = (lambda p: bool(re.search(r'^audit_v2/redteam/|(^|/)rules[\w-]*\.yml$|\.txt$|\.md$', p))) if mode == 'gate' else (lambda p: False)
    cur_paths = [c[1] for c in changes if c[0] != 'D' and textish(c[1]) and not skip(c[1])]
    base_paths = [(c[2] or c[1]) for c in changes if c[0] in 'MRC' and textish(c[1]) and not skip(c[1])]
    t2 = time.time()
    cur, base = blobs(tree, cur_paths), blobs(base_tree, base_paths)
    rename = {c[1]: c[2] for c in changes if c[2]}
    new = evaluate(repo_name, cur, base, rename, lambda p: _lines(cur.get(p, b'')))
    if mode == 'gate':          # 闸门自己的代码里本来就写着部署词、红线词、nosemgrep 这些规则字面量;它不对外发布。密钥(S1)照查
        new = [x for x in new if not (x['rule'] in ('C12', 'C10', 'S9', 'K6') or x['rule'].startswith('R'))]
    secs['semgrep'] = round(time.time() - t2, 1)
    t3 = time.time()

    def cnt(tr):
        p = lib.git(repo, 'grep', '-c', '-F', '112.5rem', tr, '--', 'apps/web/src', 'packages', check=False)
        return sum(int(l.rsplit(':', 1)[1]) for l in (p.stdout or '').splitlines() if ':' in l)
    dF, dR = diff_rules(repo_name, changes, udiff, stats, mode, (cnt(base_tree), cnt(tree)), problems, [], note)
    block, doubt, exc = split(new + dF, lambda p: _lines(cur.get(p, b'')), mode)
    risks = dR + [dict(cat=x['cat'], level='中', rule=x['rule'], item=f"{x['file']} {x['text'][:80]}", mitigation='') for x in dF if x['level'] == 'risk']
    secs['rules'] = round(time.time() - t3, 1)
    lines = sum(stats.values())
    # 09-24 23:2x【零读】:代码文件新增行里的查库写法条数(与 v1 gate.sh 同一口径,含封装函数、换行 .prepare、大写 SQL 关键词)。
    # 费用灯红时,说明带【零读】且这里为 0 才放行(ticket.budget)
    qrx = re.compile(r'\.(prepare|batch)\b|\.(all|first|run|exec|raw)\s*\(|\b(SELECT|INSERT|UPDATE|DELETE|REPLACE|UPSERT)\b'
                     r'|\bWITH\s+[a-z_]+\s+AS\b|\b(d1|many|one|q|query|sql|dbq)\s*\(|env\.DB\b|locals\.db\b')
    codeext = re.compile(r'\.(ts|tsx|js|mjs|cjs|astro|py|sql|sh)$', re.I)
    nq, curf = 0, ''
    for ln in udiff.splitlines():
        if ln.startswith('+++ '):
            curf = ln[6:] if ln.startswith('+++ b/') else ''
        elif ln.startswith('+') and codeext.search(curf) and not re.match(r'^\+\s*(//|#|\*|/\*)', ln) and qrx.search(ln):
            nq += 1
    res = dict(tree=tree, base_tree=base_tree, worker=worker, mode=mode, repo=repo, rules_hash=lib.rules_hash(), gate_hash=lib.gate_hash(),
               files=len(changes), lines=lines, changes=[list(c) for c in changes], stats=stats, new_queries=nq,
               binaries=[c[1] for c in changes if c[0] != 'D' and not textish(c[1])])
    res = finish(res, block, doubt, exc, risks, t0, secs)
    lib.dump(cp, res)
    return with_s3(res, repo)


def with_s3(res, repo):
    """S3 目录巡检不走缓存,每次都查磁盘上的 public/(.bak 等被 exclude 排出了树,但会原样公开发布)。"""
    res = dict(res, block=[b for b in res['block'] if b['rule'] != 'S3'], doubt=[d for d in res['doubt'] if d['rule'] != 'S3'])
    root = os.path.join(repo, 'apps', 'web', 'public')
    for dp, ds, fs in os.walk(root):
        for fn in fs:
            p = os.path.relpath(os.path.join(dp, fn), repo).replace('\\', '/')
            size = os.path.getsize(os.path.join(dp, fn))
            if re.search(r'\.(bak\w*|env|sql|sqlite|log|py|sh|ps1|jsonl|md)$|\.bak[\w-]*\.|\.env\.', fn, re.I):
                res['block'].append(dict(rule='S3', id='S3-public-junk', file=p, line=0, text=fn, level='block', cat='安全'))
            elif size > 25 * 1024 * 1024:
                res['block'].append(dict(rule='S3', id='S3-public-too-big', file=p, line=0, text=f'{size / 1048576:.1f} MiB > 25 MiB', level='block', cat='安全'))
            elif size > 5 * 1024 * 1024:
                res['doubt'].append(dict(rule='S3', id='S3-public-big', file=p, line=0, text=f'{size / 1048576:.1f} MiB', level='doubt', cat='安全'))
    res['result'] = '拦' if res['block'] else '过'
    res['hard'] = any(b['rule'] in HARD or b.get('hard') for b in res['block'])
    return res


def check_files(name, files, base_dir, repo_name='ops', mode='ops'):
    """定时脚本 / 单个脚本(§7.2):当前文件 vs 上次批准时拷的副本。files 是绝对路径,副本按同样的相对路径放在 base_dir。"""
    t0 = time.time()
    common = os.path.commonpath([f.replace('\\', '/') for f in files]) if len(files) > 1 else os.path.dirname(files[0])
    rel = lambda f: os.path.relpath(f, common).replace('\\', '/')
    cur, base, changes, udiff = {}, {}, [], []
    for f in files:
        r = rel(f)
        c = open(f, 'rb').read() if os.path.exists(f) else None
        bpath = os.path.join(base_dir, r) if base_dir else None
        b = open(bpath, 'rb').read() if bpath and os.path.exists(bpath) else None
        if c == b:
            continue
        if c is None:
            changes.append(('D', r, None))
        else:
            cur[r] = c
            changes.append(('A' if b is None else 'M', r, None))
        if b is not None:
            base[r] = b
        udiff += list(difflib.unified_diff(_lines(b or b''), _lines(c or b''), f'a/{r}', f'b/{r}', n=0, lineterm=''))
    new = evaluate(repo_name, cur, base, {}, lambda p: _lines(cur.get(p, b'')))
    stats = {}
    for st, r, _ in changes:
        sm = difflib.SequenceMatcher(None, _lines(base.get(r, b'')), _lines(cur.get(r, b'')))
        stats[r] = sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != 'equal')
    dF, dR = diff_rules(repo_name, changes, '\n'.join(udiff), stats, mode, (0, 0), [], [])
    block, doubt, exc = split(new + dF, lambda p: _lines(cur.get(p, b'')), mode)
    res = dict(tree=lib.sha256(b''.join(sorted(r.encode() + b'\0' + cur.get(r, b'') for r in [c[1] for c in changes]))), base_tree=None,
               worker=name, mode=mode, files=len(changes), lines=sum(stats.values()), changes=[list(c) for c in changes], stats=stats,
               udiff='\n'.join(udiff), rules_hash=lib.rules_hash(), gate_hash=lib.gate_hash(), binaries=[])
    return finish(res, block, doubt, exc, dR, t0, {})


def summary(res):
    out = [f"== 第一关 {res['worker']}({res['mode']}):{res['files']} 个文件 {res['lines']} 行 · "
           f"拦 {len(res['block'])} · 存疑 {len(res['doubt'])} · 豁免 {len(res['exceptions'])} · 风险 {len(res['risks'])} · "
           f"{res['seconds'].get('total', 0)}s{'(缓存)' if res.get('cached') else ''} → {res['result']}"]
    for x in res['block'][:20]:
        out.append(f"   拦 {x['rule']}({x['id']}) {x.get('file', '-')}:{x.get('line', 0)}  {x['text'][:110]}")
    for x in res['doubt'][:20]:
        out.append(f"   疑 {x['rule']}({x['id']}) {x.get('file', '-')}:{x.get('line', 0)}  {x['text'][:110]}")
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo')
    ap.add_argument('--worker')
    ap.add_argument('--mode', default='ship', choices=['build', 'ship', 'ops', 'gate', 'prepush'])
    ap.add_argument('--tree')
    ap.add_argument('--base-tree')
    ap.add_argument('--name')
    ap.add_argument('--files', nargs='*')
    ap.add_argument('--base-dir')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    try:
        if a.mode == 'ops':
            res = check_files(a.name or 'ops', a.files or [], a.base_dir)
        else:
            worker = a.worker
            if not worker:
                ws = lib.repo_workers(a.repo or '.')
                worker = next((k for k, v in ws.items() if v.get('primary')), None) or next(iter(ws), None)
                if not worker:
                    raise GateError(f'sites.json 里没有仓库 {a.repo} 的 Worker')
            res = check_tree(worker, a.tree, a.base_tree, a.mode)
    except Exception as e:
        print(f'[第一关] 闸门自身出错,按拦处理:{type(e).__name__}: {e}')
        return 2
    print(json.dumps(res, ensure_ascii=False) if a.json else summary(res))
    return 0 if res['result'] == '过' else 3 if res.get('hard') else 1


if __name__ == '__main__':
    sys.exit(main())
