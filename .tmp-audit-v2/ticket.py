# 审核部 v2.1 · 第二关·审核单 + 存版 / 回退 / 追审(设计-v2.1.md §2、§3、§5)
# 主线不直接调本文件,一律经 ship.sh(ship_lib.sh);单独可用的只读命令:status、hash、ledger check。
#   prepare  算树 → 第一关 → 费用灯 → 定级 → 有效审核单就用;没有就出草稿 + Laya/Jev 机审 → 报告齐了就签单
#   issue    合并三家(第一关 + 机审 + Claude 审核员报告)→ 过 / 拦 / 存疑 / 待审
#   verify   部署前 11 步校验(--stage ship|deploysh|wrangler 三处)
#   nonce / seal / record / rollback / followup / adopt-baseline / adopt-live / ledger / selfcheck
# 退出码:0 过;1 拦;2 待审(或取数失败);3 存疑;4 闸门出错。
import argparse, glob, io, json, math, os, re, shutil, subprocess, sys, time, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, gate1, judges
from lib import GateError

ISSUER = 'audit_v2/ticket.py v2.1'
EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
WF = 'F:/0cosmetic/.claude/workflows/review-ticket.js'
TIER_ANGLES = {'急修': ['综合'], 'L1': ['综合'], 'L2': ['成本+正确性', '安全+合规'], 'L3': ['成本', '安全', '合规', '正确性']}
BUMP = {'L1': 'L2', 'L2': 'L3', 'L3': 'L3', '急修': '急修'}
L3_PATH = re.compile(r'(^|/)(wrangler[\w.-]*\.(toml|jsonc?)|pnpm-lock\.yaml|middleware\.ts|lib/db\.ts)$|(^|/)db/migrations/|auth|session|login|guard'
                     r'|(^|/)(ship[\w-]*\.sh|deploy[\w.-]*\.(sh|py)|mkconfig\.py|astro\.config\.mjs)$|b2o-split/', re.I)
COST_TXT = re.compile(r'\b(SELECT|INSERT|UPDATE|DELETE|JOIN|LIMIT|OFFSET)\b|\.prepare\(|\.(list|put|get|delete)\(|AI\.run|VECTORIZE|fetch\(|crons?\b|triggers|CACHE_V', re.I)
SEC_PATH = re.compile(r'pages/(api|[^/]+/bohui|bohui|hosonzuo)/|middleware\.ts|auth|session|member|login|guard|wrangler|package\.json|pnpm-lock|^apps/web/public/|turnstile|searchGate|canon\.ts', re.I)
COMP_PATH = re.compile(r'i18n|locales?/|/content/|prompt|mail|outreach|^tools/prospect/', re.I)
CODE_EXT = re.compile(r'\.(ts|tsx|js|mjs|cjs|astro|py|sh|ps1|bat|cmd|toml|jsonc?|ya?ml|sql|css|html)$', re.I)
REPORT_KEYS = {'angle': str, 'tree': str, 'worker': str, 'run_label': str, 'skills_loaded': list, 'verdict': str,
               'checked': list, 'findings': list, 'addressed': list, 'risks': list}
CATS = ['费用', '安全', '合规', '正确性', '回归']


SFX = ''          # 追审单用 '-followup',与原单的草稿/报告/单据分开放


def t12(t):
    return t[:12] + SFX


def dpath(w, t):
    return lib.rt('drafts', f'{w}-{t12(t)}.json')


def ddir(w, t):
    return os.path.dirname(lib.rt('drafts', f'{w}-{t12(t)}', 'x'))


def rpath(w, t, angle):
    return lib.rt('reports', w, t12(t), f'{angle}.json')


def tpath(w, t):
    return lib.rt('tickets', w, f'{t12(t)}.json')


def note_line(n):
    return (n or '').strip().splitlines()[0][:200] if (n or '').strip() else ''


def content_sha(tk):
    return lib.sha256(lib.canon({k: v for k, v in tk.items() if k != 'content_sha256'}))


def repo_of(w, override=None):
    wc = lib.wcfg(w)
    if override:
        o = override.replace('\\', '/')
        if not o.lower().startswith((lib.RT + '/cache/urgent/').lower()):
            raise GateError('--repo 只允许急修 worktree(cache/urgent/ 下)')
        return o
    return wc['repo']


# ---------------- 费用灯(§2.8 第 8 步) ----------------
def budget(note, g1=None):
    now = lib.dt.datetime.now(lib.dt.timezone.utc)
    src = 'd1_budget'
    d = lib.load('F:/0cosmetic/bohui-automation/local/logs/d1_budget.json') if lib.LIVE else lib.load(lib.rt('state', 'fixture_budget.json'))
    level = None
    try:
        at = lib.dt.datetime.strptime(d['at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=lib.dt.timezone.utc)
        if now - lib.dt.timedelta(hours=2) <= at <= now + lib.dt.timedelta(minutes=5) and not d.get('errors') and d.get('level') in ('green', 'yellow', 'red'):
            level = d['level']
            lib.dump(lib.rt('state', 'budget_cache.json'), {'level': level, 'at': d['at']})
    except Exception:
        pass
    if level is None:            # 取不到数不拦:2 小时内缓存,没有按黄(急-14)
        c = lib.load(lib.rt('state', 'budget_cache.json'), {}) or {}
        try:
            at = lib.dt.datetime.strptime(c['at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=lib.dt.timezone.utc)
            level, src = (c['level'], 'cache') if now - at <= lib.dt.timedelta(hours=2) else ('yellow', 'default')
        except Exception:
            level, src = 'yellow', 'default'
    ok = level != 'red' or any(m in (note or '') for m in lib.MARKS_RED_OK)
    # 09-24 23:2x【零读】:纯文案/样式/图片改动,第一关数出新增查库写法为 0,红灯也放行(旧缓存 g1 没有这个字段 → 不放)
    zero = level == 'red' and '【零读】' in (note or '') and isinstance(g1, dict) and g1.get('new_queries') == 0
    return {'level': level, 'src': src + ('·零读' if zero else ''), 'at': lib.iso(), 'ok': ok or zero}


# ---------------- 定级与分角度(§2.2、§2.4) ----------------
def diff_sizes(repo, a, b):
    """每个文件改动字节数、单行最长(判压缩文件)。"""
    sz, longest, cur = {}, {}, None
    for l in lib.git(repo, 'diff', '-U0', '-M', '--no-color', a, b).splitlines():
        if l.startswith('+++ '):
            cur = l[6:] if l.startswith('+++ b/') else None
        elif l.startswith('--- '):
            continue
        elif cur and l[:1] in '+-':
            sz[cur] = sz.get(cur, 0) + len(l.encode('utf-8'))
            longest[cur] = max(longest.get(cur, 0), len(l))
    return sz, longest


def tier_of(w, g1, note, first, urgent, repo, base_tree, tree):
    stats, changes = g1['stats'], g1['changes']
    sz, longest = diff_sizes(repo, base_tree, tree)
    lines = sum(max(stats.get(p, 0), math.ceil(sz.get(p, 0) / 120)) for p in stats)
    paths = [c[1] for c in changes]
    reasons, force_sec = [], False
    mw_only = 'apps/web/src/middleware.ts' in paths and cache_v_only_path(repo, base_tree, tree, 'apps/web/src/middleware.ts')
    trig = []
    for p in paths:
        if p == 'apps/web/src/middleware.ts' and mw_only:
            continue                                   # 急-9:只改 CACHE_V 一行不算 L3 触发
        if L3_PATH.search(p) or (p.endswith('package.json') and any(r['rule'] == 'RK4' for r in g1['risks'])):
            trig.append(p)
    if any(c[0] == 'A' and re.match(r'^apps/web/src/pages/api/', c[1]) for c in changes):
        trig.append('新增 pages/api/**')
    if first:
        trig.append('首次上线')
    if g1.get('binaries') or any(v > 1000 for v in longest.values()):
        force_sec = True
        reasons.append('范围内有二进制或单行超 1,000 字符的压缩文件 → 至少 L2 并加安全角度')
    sens = [p for p in paths if gate1.SENS_RX.search(p) and not (p == 'apps/web/src/middleware.ts' and mw_only)]
    doubts = [d for d in g1['doubt'] if d['rule'] not in ('R11', 'K2')]
    if urgent:
        if '【急修】' not in (note or ''):
            raise GateError('急修的说明里必须带【急修】')
        soft = [p for p in trig if re.search(r'middleware\.ts|lib/db\.ts', p) or (re.search(r'wrangler', p) and crons_only(repo, base_tree, tree, p))]
        hard = [p for p in trig if p not in soft]
        if lines > 30 or len(paths) > 3:
            raise GateError(f'急修只许 ≤30 行、≤3 个文件,这次 {lines} 行、{len(paths)} 个文件 → 走常规或破窗')
        if hard or (soft and not re.search(r'【降读】|【安全】', note or '')):
            raise GateError(f'急修不许碰 L3 触发文件 {hard or soft}(middleware/db.ts/crons 仅在说明带【降读】或【安全】时可以)')
        return '急修', [f'急修 {lines} 行 {len(paths)} 文件'], (['成本+安全'] if soft else ['综合']), lines, bool(soft)
    if lines > 400:
        trig.append(f'{lines} 行 > 400')
    if trig:
        tier, reasons = 'L3', reasons + [f'L3 触发:{x}' for x in trig[:8]]
    elif lines > 80 or sens or doubts or force_sec:
        tier = 'L2'
        reasons += ([f'{lines} 行 > 80'] if lines > 80 else []) + ([f'碰敏感文件 {sens[:5]}'] if sens else []) + \
                   ([f'第一关存疑 {len(doubts)} 条'] if doubts else [])
    else:
        tier, reasons = 'L1', reasons + [f'{lines} 行,无敏感文件,第一关无存疑']
    if lib.wcfg(w).get('kind') == 'gate' and tier == 'L1' and '【数据表】' not in (note or ''):
        tier, force_sec = 'L2', True
        reasons.append('改闸门至少 L2(安全、正确性两名审核员必审);只改数据表用 ship_ops.sh gate --data')
    angles = list(TIER_ANGLES[tier])
    if force_sec and tier == 'L1':
        tier, angles = 'L2', list(TIER_ANGLES['L2'])
    return tier, reasons, angles, lines, False


def _changed(repo, a, b, p):
    d = lib.git(repo, 'diff', '-U0', a, b, '--', p)
    return [l for l in d.splitlines() if l[:1] in '+-' and not l.startswith(('+++', '---'))]


def cache_v_only_path(repo, a, b, p):
    ch = _changed(repo, a, b, p)
    return bool(ch) and all(re.match(r"^[+-]\s*(export\s+)?const CACHE_V = '[^']*';\s*$", l) for l in ch)


def crons_only(repo, a, b, p):
    ch = _changed(repo, a, b, p)
    return bool(ch) and all(re.search(r'cron|^[+-]\s*[\]\[,]?\s*$|"\S+ \S+ \S+ \S+ \S+"', l) for l in ch)


def assign(g1, angles, repo, base_tree, tree):
    """按路径 + 改动内容把文件分给各角度;并集必须覆盖全部改动,漏掉的归综合/安全(绕-19)。"""
    stats = g1['stats']
    paths = [c[1] for c in g1['changes']]
    udiff = lib.git(repo, 'diff', '-U0', '-M', '--no-color', base_tree, tree)
    add, rem, _ = gate1.added_by_file(udiff)
    hit_s = {x.get('file') for x in g1['block'] + g1['doubt'] + g1['exceptions'] if x.get('rule', '').startswith('S')}
    hit_r = {x.get('file') for x in g1['block'] + g1['doubt'] + g1['exceptions'] if x.get('rule', '').startswith('R')}
    hit_c = {x.get('file') for x in g1['block'] + g1['doubt'] + g1['exceptions'] if x.get('rule', '').startswith('C')}
    sets = {'成本': set(), '安全': set(), '合规': set(), '正确性': set()}
    for p in paths:
        txt = '\n'.join(t for _, t in add.get(p, [])) + '\n'.join(rem.get(p, []))
        if COST_TXT.search(txt) or p in hit_c or re.search(r'middleware\.ts|wrangler', p):
            sets['成本'].add(p)
        if SEC_PATH.search(p) or p in hit_s:
            sets['安全'].add(p)
        if gate1.is_p(p) or COMP_PATH.search(p) or p in hit_r:
            sets['合规'].add(p)
        if CODE_EXT.search(p) and not re.search(r'(i18n|locales?)/.*\.json$', p):
            sets['正确性'].add(p)
    out = {}
    for a in angles:
        core = a.split('-', 1)[1] if a.startswith('追审-') else a
        if core in ('综合', '复核'):
            out[a] = set(paths)
        else:
            out[a] = set().union(*[sets[x] for x in core.split('+') if x in sets])
    left = set(paths) - set().union(*out.values()) if out else set()
    if left:
        tgt = '综合' if '综合' in out else '安全+合规' if '安全+合规' in out else '安全' if '安全' in out else angles[0]
        out[tgt] |= left
    return {a: sorted(v) for a, v in out.items()}


def slice_angles(assign_map, stats, note):
    """L3 大 diff 分片:某角度 >1,500 行按文件切片,每片 ≤1,500 行,每角度最多 4 片;超了要【整批】。"""
    out = {}
    for a, fs in assign_map.items():
        total = sum(stats.get(f, 0) for f in fs)
        if total <= 1500:
            out[a] = fs
            continue
        cur, n, parts = [], 0, []
        for f in sorted(fs):
            if cur and n + stats.get(f, 0) > 1500:
                parts.append(cur)
                cur, n = [], 0
            cur.append(f)
            n += stats.get(f, 0)
        parts.append(cur)
        if len(parts) > 4 and '【整批】' not in (note or ''):
            raise GateError(f'{a} 角度 {total} 行,切 {len(parts)} 片超过 4 片:请拆批上线,或在说明里写【整批】加理由硬上')
        for i, part in enumerate(parts, 1):
            out[f'{a}#{i}'] = part
    return out


# ---------------- 草稿 + 机审 ----------------
def judge_material(w, tier, note, g1, repo, base_tree, tree):
    stat = lib.git(repo, 'diff', '--stat=160', '-M', base_tree, tree).splitlines()[-40:]
    hits = g1['block'] + g1['doubt'] + g1['exceptions']
    head = (f'Site worker: {w}. Tier: {tier}. Note: {note_line(note)}\n' + 'diff --stat:\n' + '\n'.join(stat) +
            '\nGate-1 hits: ' + '; '.join(f"{x['rule']} {x.get('file', '-')}:{x.get('line', 0)} {x.get('text', '')[:60]}" for x in hits[:12]) +
            '\nRisks: ' + '; '.join(f"{r['rule']} {r['item'][:60]}" for r in g1['risks'][:12]) + '\nChanged lines:\n')
    paths = [c[1] for c in g1['changes'] if c[0] != 'D']
    hitf = [x.get('file') for x in hits]
    order = sorted(paths, key=lambda p: (0 if p in hitf else 1 if gate1.SENS_RX.search(p) else 2, p))
    fd = []
    for p in order:
        d = lib.git(repo, 'diff', '-U1', '-M', '--no-color', base_tree, tree, '--', p)
        d = '\n'.join(l for l in d.splitlines() if l[:1] in '+-@' or l.startswith('diff'))
        fd.append((p, d))
    return judges.material(head, fd)


def make_draft(w, tree, base, g1, note, tier, reasons, angles, bud, extra, repo):
    base_commit, base_tree, first = base
    dd = ddir(w, tree)
    os.makedirs(dd, exist_ok=True)
    amap = slice_angles(assign(g1, angles, repo, base_tree, tree), g1['stats'], note) if tier == 'L3' else assign(g1, angles, repo, base_tree, tree)
    alld = lib.git(repo, 'diff', '-M', '--no-color', base_tree, tree)
    io.open(f'{dd}/all.diff', 'w', encoding='utf-8', newline='\n').write(alld)
    files = {}
    for a, fs in amap.items():
        d = lib.git(repo, 'diff', '-M', '--no-color', base_tree, tree, '--', *fs) if fs else ''
        io.open(f'{dd}/{a}.diff', 'w', encoding='utf-8', newline='\n').write(d)
        files[a] = {'diff': f'{dd}/{a}.diff', 'files': fs, 'lines': sum(g1['stats'].get(f, 0) for f in fs)}
    mat, partial = judge_material(w, tier, note, g1, repo, base_tree, tree)
    io.open(f'{dd}/judges-material.txt', 'w', encoding='utf-8', newline='\n').write(mat)
    print(f'-- 机审:Laya(本机约 2 分钟)+ Jev(几秒)并行…', flush=True)
    jd = judges.run(mat, partial, tier)
    if tier != '急修' and all(jd[k].get('status') == '缺席' for k in jd):
        nt = BUMP[tier]
        reasons.append(f'两家机审都缺席 → Claude 审核员升一档({tier}→{nt} 的人数)')
        if nt != tier:
            pre = '追审-' if angles and angles[0].startswith('追审-') else ''
            angles = [pre + x for x in TIER_ANGLES[nt]]
            amap = assign(g1, angles, repo, base_tree, tree)
            files = {}
            for a, fs in amap.items():
                d = lib.git(repo, 'diff', '-M', '--no-color', base_tree, tree, '--', *fs) if fs else ''
                io.open(f'{dd}/{a}.diff', 'w', encoding='utf-8', newline='\n').write(d)
                files[a] = {'diff': f'{dd}/{a}.diff', 'files': fs, 'lines': sum(g1['stats'].get(f, 0) for f in fs)}
    items = []
    for i, x in enumerate(g1['doubt'], 1):
        items.append({'ref': f'G{i}', 'kind': '第一关存疑', 'rule': x['rule'], 'id': x['id'], 'file': x.get('file'), 'line': x.get('line'), 'text': x.get('text', '')[:200]})
    for i, x in enumerate(g1['exceptions'], 1):
        items.append({'ref': f'E{i}', 'kind': '行内豁免', 'rule': x['rule'], 'file': x['file'], 'line': x['line'], 'text': x['reason']})
    for k in ('jev', 'laya'):
        v = jd[k]
        if v.get('status') == '判了' and v.get('verdict') in ('存疑', '拦'):
            items.append({'ref': k.upper(), 'kind': f'{k} {v["verdict"]}', 'text': json.dumps({x: v.get(x) for x in ('decision', 'conf', 'noul', 'correctness', 'reason')}, ensure_ascii=False)})
    for i, f in enumerate(extra.get('prev_blocks', []), 1):
        items.append({'ref': f'P{i}', 'kind': '上一张单的拦(须标「已修」)', 'text': f.get('claim', '')[:200], 'file': f.get('file'), 'line': f.get('line'), 'need': '已修'})
    angles_final = list(files.keys())
    draft = {'schema': 'bohui-draft/2', 'worker': w, 'tree': tree, 'repo': repo, 'base': {'commit': base_commit, 'tree': base_tree, 'first_ship': first},
             'prev_ticket': extra.get('prev_ticket'), 'note': note, 'tier': tier, 'tier_reasons': reasons, 'angles': angles_final, 'files': files,
             'all_diff': f'{dd}/all.diff', 'gate1': {k: g1[k] for k in ('result', 'block', 'doubt', 'exceptions', 'risks', 'lines', 'files', 'seconds')},
             'judges': jd, 'budget': bud, 'items': items, 'refute_needed': (['JEV'] if jd['jev'].get('verdict') == '拦' else []),
             'reports_expected': [rpath(w, tree, a) for a in angles_final], 'urgent': extra.get('urgent'), 'kind': extra.get('kind', 'worker'),
             'created_at': lib.iso(), 'skills': SKILLS}
    lib.dump(dpath(w, tree), draft)
    return draft


SKILLS = {'成本': ['zero-r2-move', 'karpathy-coder'], '安全': ['security-review', 'claude-guard:guard-rules', 'bohui-data-security-formula-confidentiality'],
          '合规': ['bohui-legal-advertising-claims', 'bohui-label-claims-review'], '正确性': ['code-reviewer', 'karpathy-coder'],
          '综合': ['code-reviewer', 'security-review'], '反驳': [], '复核': ['code-reviewer']}


def workflow_hint(d):
    args = {'draft': dpath(d['worker'], d['tree']), 'worker': d['worker'], 'tree': d['tree'], 'tier': d['tier'], 'angles': d['angles']}
    lines = ['====== 待审:请跑 Claude 审核员工作流(报告写进 reports/,再跑同一条 ship)======',
             f"Workflow({{name:'review-ticket', args:{json.dumps(args, ensure_ascii=False)}}})"]
    if d['tier'] in ('L1', 'L2', '急修'):
        lines.append('工作流失败(额度/API)时的备份审核员(只限 L1/L2/急修,单子记「降级审核」,24 小时内 Claude 补审):')
        lines.append(f"  codex exec \"按 {WF} 里 RULES 与报告 schema 审 {d['files'][d['angles'][0]]['diff']},只写 {d['reports_expected'][0]},reviewer 写 codex\"")
    return '\n'.join(lines)


# ---------------- 合并三态(§2.5) ----------------
def load_report(p, tree, worker, angle):
    r = lib.load(p)
    if not isinstance(r, dict):
        return None, '读不了或不是 JSON'
    if angle.startswith('refute-'):
        need = {'tree': str, 'worker': str, 'ref': str, 'refuted': bool, 'why': str, 'evidence': str, 'run_label': str}
    else:
        need = REPORT_KEYS
    for k, t in need.items():
        if not isinstance(r.get(k), t) or (t in (str, list) and k not in ('findings', 'addressed', 'risks', 'skills_loaded') and not r.get(k)):
            return None, f'缺字段或类型不对:{k}'
    if r['tree'] != tree:
        return None, f"报告 tree {r['tree'][:12]} ≠ {tree[:12]}"
    if r['worker'] != worker:
        return None, f"报告 worker {r['worker']} ≠ {worker}"
    if not angle.startswith('refute-') and r['verdict'] not in ('过', '拦', '存疑'):
        return None, f"verdict 只能是 过/拦/存疑"
    if not angle.startswith('refute-') and not r['checked']:
        return None, 'checked 为空(空壳报告)'
    return r, None


def merge(d):
    w, tree, tier = d['worker'], d['tree'], d['tier']
    g1 = d['gate1']
    if g1['block']:
        return '拦', ['第一关有拦:只能改代码或写带理由的豁免'], [], [], []
    reps, bad = {}, []
    for a in d['angles']:
        r, err = load_report(rpath(w, tree, a), tree, w, a)
        if r:
            reps[a] = r
        else:
            bad.append(f'{a}:{err}')
    if bad:
        return '待审', bad, [], [], []
    refutes = {}
    for p in glob.glob(lib.rp('reports', w, t12(tree), 'refute-*.json')):
        a = os.path.basename(p)[:-5]
        r, err = load_report(p, tree, w, a)
        if r:
            refutes[r['ref']] = r
    rechecks = {}
    for p in glob.glob(lib.rp('reports', w, t12(tree), '复核-*.json')):
        r, err = load_report(p, tree, w, os.path.basename(p)[:-5])
        if r:
            rechecks[os.path.basename(p)[3:-5]] = r
    addressed = {}
    for a, r in list(reps.items()) + [(f'复核-{k}', v) for k, v in rechecks.items()]:
        for x in r.get('addressed', []):
            if isinstance(x, dict) and x.get('ref'):
                addressed.setdefault(x['ref'], []).append(dict(x, by=a))
    resolved, overrides, why, followup = [], [], [], []
    jv = d['judges'].get('jev', {})

    def answered(ref, need=None):
        for x in addressed.get(ref, []):
            res = x.get('result', '')
            if need and res != need and res != '不成立':
                continue
            if res == '不成立' or res == need or (res.startswith('成立但可接受') and (x.get('why') or x.get('mitigation'))):
                return x
        return None
    if tier == '急修':                                    # 急-11:只判三件事,其余进 followup
        q = reps[d['angles'][0]]
        if q['verdict'] != '过':
            return ('拦' if q['verdict'] == '拦' else '存疑'), [f"快审员判「{q['verdict']}」"], [], [], []
        if jv.get('verdict') == '拦':
            x = answered('JEV')
            if not x:
                return '拦', ['Jev 机审拦,快审员没有书面回应'], [], [], []
            resolved.append(dict(ref='JEV', by=x['by'], result=x.get('result'), why=x.get('why', '')))
        followup = [i for i in d['items'] if i['ref'] != 'JEV']
        return '过', ['急修:第一关过 + 快审员过 + 机审拦已回应;其余存疑进 followup'], resolved, overrides, followup
    # 3. 审核员的拦,没被反驳员拿证据推翻 → 拦
    for a, r in reps.items():
        if r['verdict'] == '拦':
            fs = [f for f in r.get('findings', []) if f.get('level') == '高'] or r.get('findings', []) or [{'id': a}]
            for f in fs:
                fid = f.get('id') or a
                rf = refutes.get(fid)
                if rf and rf.get('refuted') and rf.get('evidence'):
                    overrides.append(dict(ref=fid, by='反驳员', why=rf['why'], evidence=rf['evidence']))
                else:
                    why.append(f'{a} 判拦的发现 {fid} 没被推翻(可派反驳员:reports/{w}/{t12(tree)}/refute-{fid}.json)')
    if why:
        return '拦', why, resolved, overrides, []
    # 4. 机审拦:要一名审核员判不成立 + 一名反驳员推翻
    if jv.get('verdict') == '拦':
        x, rf = answered('JEV', '不成立'), refutes.get('JEV')
        if not (x and x.get('result') == '不成立' and rf and rf.get('refuted') and rf.get('evidence')):
            return '拦', ['Jev 机审拦(置信 ≥0.8):需要一名审核员在 addressed 判「不成立」并且反驳员(refute-JEV.json)推翻'], resolved, overrides, []
        overrides.append(dict(ref='JEV', by='反驳员', why=rf['why'], evidence=rf['evidence'], kind='推翻机审'))
    # 5. 存疑项都要回应(判官缺席不在此列)
    miss = []
    for it in d['items']:
        if it['ref'] == 'JEV' and jv.get('verdict') == '拦':
            continue
        x = answered(it['ref'], it.get('need'))
        if x:
            resolved.append(dict(ref=it['ref'], by=x['by'], result=x.get('result'), why=x.get('why') or x.get('mitigation', '')))
        else:
            miss.append(f"{it['ref']}({it['kind']} {it.get('file') or ''}:{it.get('line') or ''} {it.get('text', '')[:50]})")
    if miss:
        return '存疑', ['下列存疑没有审核员逐条回应:' + ';'.join(miss)], resolved, overrides, []
    # 6. 报告判存疑 → 同角度复核员判过才继续
    for a, r in reps.items():
        if r['verdict'] == '存疑':
            rc = rechecks.get(a)
            if not (rc and rc['verdict'] == '过'):
                return '存疑', [f'{a} 判存疑:派同角度复核员写 reports/{w}/{t12(tree)}/复核-{a}.json 判「过」并回应存疑点'], resolved, overrides, []
    return '过', ['三家合并:第一关过、审核员无未推翻的拦、存疑逐条回应'], resolved, overrides, []


def risk_list(d, reps):
    out = {c: [] for c in CATS}
    seen = set()
    for r in d['gate1']['risks'] + [x for rep in reps for x in rep.get('risks', []) if isinstance(x, dict)]:
        c = r.get('cat') if r.get('cat') in out else '回归'
        k = (c, r.get('item', '')[:80])
        if k in seen:
            continue
        seen.add(k)
        out[c].append({k2: r.get(k2) for k2 in ('rule', 'level', 'item', 'mitigation') if r.get(k2)})
    checks = {'费用': 'C1–C11、RK1/6/10', '安全': 'S1–S10、RK3/4/5/11/12', '合规': 'R1–R11、RK7', '正确性': 'K1–K6、RK9', '回归': 'K3、RK2/8/13'}
    for c in CATS:
        if not out[c]:
            out[c] = [f'已查:{checks[c]},未发现']
    return out


def issue(w, tree, repo=None):
    d = lib.load(dpath(w, tree))
    if not d:
        raise GateError(f'没有草稿 {dpath(w, tree)},先跑 ship.sh')
    verdict, why, resolved, overrides, followup = merge(d)
    print(f'== 合并三态:{verdict}')
    for x in why:
        print('   ' + x)
    if verdict == '待审':
        print(workflow_hint(d))
        return 2, None
    reps = []
    for a in d['angles']:
        p = rpath(w, tree, a)
        r = lib.load(p)
        reps.append({'angle': a, 'file': os.path.relpath(p, lib.RT).replace('\\', '/'), 'sha256': lib.sha256(open(p, 'rb').read()),
                     'verdict': r['verdict'], 'findings': len(r.get('findings', [])), 'reviewer': r.get('reviewer', 'claude')})
    for p in sorted(glob.glob(lib.rp('reports', w, t12(tree), 'refute-*.json')) + glob.glob(lib.rp('reports', w, t12(tree), '复核-*.json'))):
        reps.append({'angle': os.path.basename(p)[:-5], 'file': os.path.relpath(p, lib.RT).replace('\\', '/'), 'sha256': lib.sha256(open(p, 'rb').read())})
    full = [lib.load(rpath(w, tree, a)) for a in d['angles']]
    degraded = any(r.get('reviewer') in ('codex', 'opencode') for r in full)
    if degraded and d['tier'] == 'L3':
        print('   L3 不许降级审核(codex/opencode),必须等 Claude 审核员')
        return 3, None
    try:
        wc = lib.wcfg(w)
        target = {'worker': w, 'repo': d.get('repo', wc['repo']), 'account': wc['account']}
        ssha, esha = lib.scope_sha(wc), lib.env_sha(w)
    except GateError:                       # 定时脚本 / 生产配置变更这类非 Worker 审核:草稿里自带
        target, ssha, esha = d['target'], d.get('scope_sha256'), None
    basis = lib.sha256(lib.canon([tree, d['base'], d['tier'], [r['sha256'] for r in reps], verdict]))
    old = lib.load(tpath(w, tree))
    if old and old.get('basis') == basis and old.get('verdict') == verdict and lib.parse_iso(old['expires_at']) > lib.now():
        print(f"   审核单未变,沿用 {old['id']}")
        return (0 if verdict == '过' else 1 if verdict == '拦' else 3), tpath(w, tree)
    now = lib.now()
    urgent = d['tier'] == '急修'
    tk = {'schema': 'bohui-ticket/2', 'id': f"RT-{now:%Y%m%d-%H%M}-{w}-{t12(tree)[:8]}", 'kind': d.get('kind', 'worker'),
          'target': target, 'tree': tree, 'scope_sha256': ssha, 'gate_hash': lib.gate_hash(), 'rules_hash': lib.rules_hash(),
          'env_sha256': esha, 'base': {'ref': lib.ship_ref(w), **d['base']}, 'prev_ticket': d.get('prev_ticket'),
          'diff': {'file': os.path.relpath(d['all_diff'], lib.RT).replace('\\', '/'), 'sha256': lib.sha256(open(d['all_diff'], 'rb').read()),
                   'files': d['gate1']['files'], 'lines': d['gate1']['lines']},
          'note': d['note'], 'tier': d['tier'], 'tier_reasons': d['tier_reasons'],
          'gate1': {'result': d['gate1']['result'], 'block': len(d['gate1']['block']), 'doubt': len(d['gate1']['doubt']),
                    'exceptions': len(d['gate1']['exceptions']), 'seconds': d['gate1']['seconds'].get('total')},
          'budget': d['budget'], 'judges': d['judges'], 'reports': reps, 'resolved': resolved, 'overrides': overrides,
          'exceptions': [dict(x, reviewed_by=next((r['by'] for r in resolved if r['ref'] == f'E{i}'), None)) for i, x in enumerate(d['gate1']['exceptions'], 1)],
          'risks': risk_list(d, full), 'smoke_extra': sorted({u for r in full for u in r.get('smoke_extra', []) if isinstance(u, str)}),
          'verdict': verdict, 'why': why, 'issued_at': lib.iso(now),
          'expires_at': lib.iso(now + lib.dt.timedelta(hours=2 if urgent else 24)),
          'followup_due': None, 'followup': followup, 'incident': (d.get('urgent') or {}).get('incident'),
          'degraded': degraded, 'issuer': ISSUER, 'basis': basis}
    if degraded:
        tk['followup_due'] = lib.iso(now + lib.dt.timedelta(hours=24))
    tk['content_sha256'] = content_sha(tk)
    p = tpath(w, tree)
    if os.path.exists(p):
        os.replace(p, p[:-5] + f'.superseded-{now:%Y%m%d-%H%M%S}.json')
    lib.dump(p, tk)
    rec = lib.ledger_append('tickets.jsonl', {'id': tk['id'], 'worker': w, 'tree': tree, 'verdict': verdict, 'kind': tk['kind'],
                                              'file': os.path.relpath(p, lib.RT).replace('\\', '/'), 'content_sha256': tk['content_sha256']})
    lib.anchor(f"审核单 {tk['id']} · {verdict} · content {tk['content_sha256'][:12]} · 台账链头 {lib.ledger_head('tickets.jsonl')[:12]}")
    print(f"   签单:{tk['id']} → {p}")
    return (0 if verdict == '过' else 1 if verdict == '拦' else 3), p


# ---------------- prepare(ship 第 1–5 步) ----------------
def prev_chain(w, tree, base_commit, repo):
    """链式复审(§2.9):同一基准下最近一张过/拦的单,和新树差 ≤80 行,链长 ≤3 → 只审增量。"""
    best = None
    for p in glob.glob(lib.rp('tickets', w, '*.json')):
        if '.superseded-' in p:
            continue
        tk = lib.load(p) or {}
        if tk.get('base', {}).get('commit') != base_commit or tk.get('verdict') not in ('过', '拦') or tk.get('tree') == tree or tk.get('kind') != 'worker':
            continue
        if content_sha(tk) != tk.get('content_sha256') or tk['tree'] in revoked_trees(w):
            continue
        if not best or tk['issued_at'] > best['issued_at']:
            best = tk
    if not best:
        return None
    depth, cur = 1, best
    while cur.get('prev_ticket'):
        depth += 1
        cur = lib.load(lib.rt(*cur['prev_ticket']['file'].split('/'))) or {}
    if depth >= 3:
        return None
    ns = lib.git(repo, 'diff', '--numstat', best['tree'], tree).splitlines()
    n = sum(int(a) + int(b) for a, b, _ in (l.split('\t', 2) for l in ns) if a != '-')
    if n > 80 or any(l.startswith('-') for l in ns):
        return None
    return best


def revoked_trees(w):
    out = set()
    for r in [x for x in lib.ledger_records('revoke.jsonl') if x.get('worker') == w]:
        out |= set(r.get('trees', []))
    return out


def valid_ticket(w, tree, base_commit):
    tk = lib.load(tpath(w, tree))
    if not tk or tk.get('verdict') != '过' or tk.get('tree') != tree or content_sha(tk) != tk.get('content_sha256'):
        return None
    if tk['base'].get('commit') != base_commit or lib.parse_iso(tk['expires_at']) <= lib.now() or tree in revoked_trees(w):
        return None
    return tk


def prepare(a):
    w = a.worker
    repo = repo_of(w, a.repo)
    tree, probs = lib.scope_tree(w, fresh=True, repo=repo)
    if a.urgent:
        bc = lib.ref_commit(repo, lib.ship_ref(w))
        if not bc:
            raise GateError('急修要有 refs/ship 基准(先 adopt-baseline)')
        base = (bc, lib.git(repo, 'rev-parse', bc + '^{tree}').strip(), False)
    else:
        base = lib.base_of(w)
    print(f'== {w} 审核范围树 {tree[:12]} · 基准 {base[0][:10]}(树 {base[1][:12]}{",首次上线" if base[2] else ""})')
    g1 = gate1.check_tree(w, tree, base[1], 'ship', a.note) if not probs else None
    if probs:
        print('   拦:' + ';'.join(probs))
        return 1
    print(gate1.summary(g1))
    if g1['block']:
        return 3 if g1.get('hard') else 1
    bud = budget(a.note, g1) if lib.wcfg(w).get('kind') != 'gate' else {'level': 'n/a', 'src': '闸门自身不看 D1 灯', 'at': lib.iso(), 'ok': True}
    print(f"-- 费用灯 {bud['level']}({bud['src']})· 新增查库写法 {g1.get('new_queries', '?')} 条" + ('' if bud['ok'] else ' → 红灯:说明里要带【降读】【安全】【急修】,或带【零读】且新增查库为 0 才放行'))
    if not bud['ok']:
        return 1
    tk = valid_ticket(w, tree, base[0])
    if tk:
        print(f"-- 已有有效审核单 {tk['id']}({tk['tier']},{tk['verdict']},到期 {tk['expires_at']})")
        return 0
    d = lib.load(dpath(w, tree))
    if not d or d['base']['commit'] != base[0] or d.get('note') != a.note:
        extra = {'urgent': {'incident': a.incident, 'patch': a.patch} if a.urgent else None}
        prev = None if a.urgent else prev_chain(w, tree, base[0], repo)
        dbase = base
        if prev:
            extra['prev_ticket'] = {'id': prev['id'], 'file': f"tickets/{w}/{t12(prev['tree'])}.json", 'tree': prev['tree'], 'content_sha256': prev['content_sha256']}
            extra['prev_blocks'] = [f for r in prev.get('reports', []) for f in ((lib.load(lib.rt(*r['file'].split('/'))) or {}).get('findings', []) if r.get('verdict') == '拦' else [])]
            dbase = (base[0], prev['tree'], base[2])
            g1 = gate1.check_tree(w, tree, prev['tree'], 'ship', a.note)
            print(f"-- 链式复审:以上一张单 {prev['id']} 的树为基准,只审增量 {g1['lines']} 行")
            if g1['block']:
                print(gate1.summary(g1))
                return 3 if g1.get('hard') else 1
        tier, reasons, angles, lines, soft = tier_of(w, g1, a.note, base[2], a.urgent, repo, dbase[1], tree)
        print(f'-- 定级 {tier}:' + ';'.join(reasons))
        if a.urgent:
            check_urgent_quota(w, a.incident)
        d = make_draft(w, tree, dbase, g1, a.note, tier, reasons, angles, bud, extra, repo)
        for k, v in d['judges'].items():
            print(f"   {k}: {v.get('status')} {v.get('verdict') or ''} {v.get('reason') or ''} {('conf ' + str(v.get('conf'))) if v.get('conf') is not None else ''}")
    rc, _ = issue(w, tree)
    return rc


def check_urgent_quota(w, incident):
    if not incident:
        raise GateError('急修要带 --incident <事故id>')
    now = lib.now()
    recs = [r for r in lib.ledger_records('ship.jsonl') if r.get('worker') == w and r.get('action') == 'urgent' and r.get('status') == 'ok']
    day = [r for r in recs if now - lib.parse_iso(r['ts']) < lib.dt.timedelta(hours=24)]
    if len(day) >= 5:
        raise GateError(f'{w} 24 小时内急修已 {len(day)} 次(>5 要求破窗)')
    mine = sorted(lib.parse_iso(r['ts']) for r in recs if r.get('incident') == incident)
    groups, last = 0, None
    for t in mine:
        if not last or t - last > lib.dt.timedelta(hours=6):
            groups += 1
            last = t
    if groups >= 3 and (not last or now - last > lib.dt.timedelta(hours=6)):
        raise GateError(f'事故 {incident} 已急修 {groups} 次(6 小时内合并计 1 次,每个事故最多 3 次)')


# ---------------- verify(§2.8,三处)----------------
def dist_sha(d):
    h = lib.hashlib.sha256()
    root = os.path.dirname(d.rstrip('/\\')) if os.path.basename(d.rstrip('/\\')) == 'server' else d
    for dp, ds, fs in os.walk(root):
        ds[:] = sorted(x for x in ds if x != '.wrangler')
        for f in sorted(fs):
            if re.match(r'wrangler[\w.-]*\.json$', f):
                continue
            p = os.path.join(dp, f)
            h.update(os.path.relpath(p, root).replace('\\', '/').encode() + b'\0' + open(p, 'rb').read() + b'\0')
    return h.hexdigest()


def config_problems(w, cfgfile):
    wc = lib.wcfg(w)
    dc = wc.get('dist_check') or {}
    try:
        raw = io.open(cfgfile, encoding='utf-8').read()
        c = json.loads(raw)
    except Exception as e:
        return [f'产物配置读不了 {cfgfile}:{e}']
    errs = []
    if dc.get('name') and c.get('name') != dc['name']:
        errs.append(f"产物配置 name={c.get('name')} ≠ {dc['name']}(K5)")
    for m in dc.get('must', []):
        if m not in raw:
            errs.append(f'产物配置缺 {m}(K5)')
    for m in dc.get('forbid', []):
        if m in raw:
            errs.append(f'产物配置出现禁用串 {m}(K5 / 跨账号)')
    cmd = ((c.get('build') or {}).get('command') or '').replace('\\', '/')
    want = f'{lib.APPROVED}/verify_or_bg.cmd {w}' if lib.LIVE else f'{lib.CODE}/verify_or_bg.cmd {w}'
    if cmd != want:
        errs.append(f'产物配置 build.command 不是已批准闸门的 verify_or_bg.cmd({cmd[:120] or "缺"})')
    return errs


def nonce_file():
    return lib.rt('state', 'ship_nonce.json')


def verify(a):
    w, stage = a.worker, a.stage
    errs, warn = [], []
    wc = lib.wcfg(w)
    n = lib.load(nonce_file(), {}) or {}
    if stage in ('deploysh', 'wrangler'):
        env_n = os.environ.get('BOHUI_SHIP_NONCE', '')
        if not env_n or env_n != n.get('nonce') or n.get('worker') != w or lib.parse_iso(n.get('expires', '2000-01-01T00:00:00+08:00')) <= lib.now():
            return fail(['BOHUI_SHIP_NONCE 缺失/不符/过期:部署只能由 ship.sh 在校验后发起'], stage)
    repo = n.get('repo') if (stage != 'ship' and n.get('repo')) else repo_of(w, a.repo)
    ok, gh = lib.gate_ok()
    if not ok:
        errs.append(f'执行中的闸门代码 {gh[:19]} 不在批准清单 state/gate_approved.json(改闸门走 ship_ops.sh gate)')
    T, probs = lib.scope_tree(w, fresh=True, repo=repo)
    errs += probs
    tp = a.ticket or (n.get('ticket') if stage != 'ship' else None) or tpath(w, T)
    tk = lib.load(tp)
    if not tk:
        return fail(errs + [f'没有审核单 {tp}(树 {T[:12]}):先跑 ship.sh 审核'], stage)
    # 1 树
    if T != tk['tree'] and not (stage == 'wrangler' and wc.get('cache_v_bump') and lib.cache_v_only(repo, tk['tree'], T)):
        errs.append(f"第 1 步:现在的树 {T[:12]} ≠ 审核单的树 {tk['tree'][:12]}(审完又改过,要重审)")
    # 2 单据自洽 + 台账
    if content_sha(tk) != tk.get('content_sha256'):
        errs.append('第 2 步:审核单内容被改过(content_sha256 不符)')
    recs = [r for r in lib.ledger_records('tickets.jsonl') if r.get('id') == tk.get('id')]
    if not recs or recs[-1].get('content_sha256') != tk.get('content_sha256') or recs[-1].get('worker') != w:
        errs.append('第 2 步:审核单与台账 tickets.jsonl 对不上(不在台账、sha 不符或 Worker 不符)')
    for name in ('tickets.jsonl', 'ship.jsonl'):
        good, msg = lib.ledger_verify(name)
        if not good:
            errs.append(f'第 2 步:台账断链 {msg}(ticket.py ledger reseal --reason 追认)')
    # 3 结论与有效期
    if tk.get('verdict') != '过':
        errs.append(f"第 3 步:审核单结论是「{tk.get('verdict')}」")
    if lib.parse_iso(tk['expires_at']) <= lib.now():
        errs.append(f"第 3 步:审核单 {tk['expires_at']} 已过期")
    # 4 基准 / refs / 目标 / 作废
    cur = lib.ref_commit(repo, lib.ship_ref(w))
    b = tk.get('base', {})
    if cur:
        if b.get('commit') != cur:
            errs.append(f"第 4 步:refs/ship/{w} 已是 {cur[:10]},审核单的基准是 {str(b.get('commit'))[:10]}(中间有人上线或回退过)")
        last = last_success(w)
        if not last or last.get('snapshot') != cur:
            errs.append(f'第 4 步:refs/ship/{w} 与 ship.jsonl 最后一条成功记录的快照对不上(refs 只能由 ticket.py 改)')
        rl = lib.git(repo, 'reflog', 'show', '--format=%gs', '-n', '1', lib.ship_ref(w), check=False)
        # 09-25:record(第 910 行)写的是 f'{a.action} {w} …',正常上线 action=deploy → 原来这里不认 deploy,每次上线后下一次必拦
        if rl.returncode or not re.match(rf'^(ship|deploy|rollback|baseline|urgent|breakglass) {re.escape(w)} ', rl.stdout.strip()):
            errs.append(f'第 4 步:refs/ship/{w} 的 reflog 说明不是 ship/rollback/baseline:{rl.stdout.strip()[:80]}')
    elif not b.get('first_ship'):
        errs.append(f'第 4 步:refs/ship/{w} 不存在,但审核单不是首次上线单')
    if tk.get('target', {}).get('worker') != w:
        errs.append(f"第 4 步:审核单是给 {tk.get('target', {}).get('worker')} 的,不是 {w}")
    if tk['tree'] in revoked_trees(w):
        errs.append('第 4 步:这棵树的审核单已随回退作废(revoke.jsonl)')
    chain_err = check_chain(w, tk, cur)
    errs += chain_err
    # 5 报告
    for r in tk.get('reports', []):
        p = lib.rt(*r['file'].split('/'))
        if not os.path.exists(p) or lib.sha256(open(p, 'rb').read()) != r['sha256']:
            errs.append(f"第 5 步:报告 {r['file']} 缺失或被改过")
        else:
            rr = lib.load(p) or {}
            if rr.get('tree') != tk['tree']:
                errs.append(f"第 5 步:报告 {r['angle']} 的 tree 对不上")
    if not tk.get('reports'):
        errs.append('第 5 步:审核单里没有审核员报告')
    # 6 闸门 / 范围
    if not any(x.get('gate_hash') == tk.get('gate_hash') for x in lib.gate_approved_list()):
        errs.append('第 6 步:签这张单的闸门版本不在批准清单')
    if tk.get('scope_sha256') != lib.scope_sha(wc):
        errs.append('第 6 步:sites.json 的审核范围改过,审核单作废')
    # 7 第一关(按当前规则,命中缓存)
    if T == tk['tree']:
        g1 = gate1.check_tree(w, T, lib.git(repo, 'rev-parse', cur + '^{tree}').strip() if cur else b.get('tree'), 'ship')
        if g1['block']:
            errs.append(f"第 7 步:第一关按当前规则不过({len(g1['block'])} 条拦)")
    # 8 费用灯
    bud = budget(tk.get('note'), g1 if T == tk['tree'] else None)
    if not bud['ok']:
        errs.append(f"第 8 步:费用灯红,说明没带【降读】【安全】【急修】,也不是新增查库为 0 的【零读】")
    # 9 逾期追审
    if tk.get('tier') != '急修':
        od = overdue(w)
        if od:
            errs.append(f'第 9 步:{w} 有逾期未追审的急修/破窗/降级:{od[:3]}(ticket.py followup 补审)')
    # 11 env
    if tk.get('env_sha256') != lib.env_sha(w):
        errs.append('第 11 步:范围内 .env* 与审核时不一致')
    # 10 线上版本在台账里(只在 ship 阶段查一次)
    if stage == 'ship':
        try:
            v, dep = lib.live_version(w)
            lib.dump(lib.rt('state', f'live_{w}.json'), {'version': v, 'at': lib.iso(), 'deployment': (dep or {}).get('id')})
            if v and not any(r.get('version_id') == v for r in lib.ledger_records('ship.jsonl') if r.get('worker') == w):
                errs.append(f'第 10 步:当前线上版本 {v} 不在 ship.jsonl(未审部署):先 ticket.py adopt-live --worker {w} --reason "…" 登记并挂 24 小时追审')
        except Exception as e:
            if errs:
                return fail(errs, stage)
            print(f'第 10 步:取不到线上部署列表({e}),按网络异常退出,不当作通过')
            return 2
    if stage == 'wrangler':
        cwd = os.getcwd().replace('\\', '/')
        if n.get('dist_dir', '').lower() != cwd.lower():
            errs.append(f"wrangler 阶段:部署目录 {cwd} 不是 ship 封存的 {n.get('dist_dir')}")
        elif dist_sha(cwd) != n.get('dist_sha256'):
            errs.append('wrangler 阶段:产物 dist_sha256 与构建后封存的不一致(先用坏源码构建再改回去?)')
        errs += config_problems(w, os.path.join(cwd, n.get('config') or wc.get('config', 'wrangler.json')))
    if errs:
        return fail(errs, stage)
    print(f"[verify {stage}] 通过:{tk['id']}({tk['tier']})树 {T[:12]}")
    return 0


def fail(errs, stage):
    print(f'[verify {stage}] 拒绝:')
    for e in errs:
        print('   ' + e)
    return 1


def check_chain(w, tk, cur):
    errs, depth, t = [], 0, tk
    while t.get('prev_ticket'):
        depth += 1
        pv = lib.load(lib.rt(*t['prev_ticket']['file'].split('/')))
        if depth > 3 or not pv or content_sha(pv) != pv.get('content_sha256') or pv['content_sha256'] != t['prev_ticket']['content_sha256']:
            return [f'第 4 步:链式复审的上一张单缺失、被改或链长超 3']
        if pv['tree'] != t['base']['tree'] or pv.get('verdict') not in ('过', '拦') or pv['base'].get('commit') != t['base'].get('commit'):
            return ['第 4 步:链式复审的上一张单与本单基准对不上']
        t = pv
    return errs


def last_success(w):
    recs = [r for r in lib.ledger_records('ship.jsonl') if r.get('worker') == w and r.get('status') == 'ok' and r.get('snapshot')]
    return recs[-1] if recs else None


def overdue(w=None):
    now = lib.now()
    recs = lib.ledger_records('ship.jsonl')
    done = {r.get('of') for r in recs if r.get('action') == 'followup_done' and r.get('verdict') == '过'}
    out = []
    for r in recs:
        if (w is None or r.get('worker') == w) and r.get('followup_due') and r.get('ts') not in done and lib.parse_iso(r['followup_due']) < now:
            out.append(f"{r.get('worker')} {r.get('action')} {r.get('version_id') or ''} 到期 {r['followup_due']}")
    for p in glob.glob(lib.rp('tickets', '*', '*.json')):
        tk = lib.load(p) or {}
        if (w is None or tk.get('target', {}).get('worker') == w) and tk.get('followup_due') and tk.get('id') not in done \
                and lib.parse_iso(tk['followup_due']) < now and '.superseded-' not in p:
            out.append(f"{tk['id']} 降级审核待 Claude 补审 到期 {tk['followup_due']}")
    return out


# ---------------- nonce / seal / message ----------------
def nonce(a):
    w = a.worker
    repo = repo_of(w, a.repo)
    T, _ = lib.scope_tree(w, fresh=True, repo=repo)
    tk = lib.load(tpath(w, T))
    if not tk or tk.get('verdict') != '过':
        raise GateError('没有「过」的审核单,不发 nonce')
    n = {'nonce': uuid.uuid4().hex, 'worker': w, 'ticket': tpath(w, T), 'ticket_id': tk['id'], 'tree': T, 'repo': repo,
         'created': lib.iso(), 'expires': lib.iso(lib.now() + lib.dt.timedelta(minutes=15)), 'dist_sha256': None, 'dist_dir': None,
         'config': (lib.wcfg(w).get('dist_check') or {}).get('config') or lib.wcfg(w).get('config', 'wrangler.json')}
    lib.dump(nonce_file(), n)
    print(n['nonce'])
    return 0


def seal(a):
    """构建后:树仍等于审核单(平台允许只差 CACHE_V)→ 算 dist_sha256 → 产物配置核对 + 补 build.command → 写进 nonce(绕-4)。"""
    w = a.worker
    n = lib.load(nonce_file(), {}) or {}
    if os.environ.get('BOHUI_SHIP_NONCE') != n.get('nonce') or n.get('worker') != w:
        raise GateError('seal 只能在 ship 流程里(nonce 不符)')
    wc = lib.wcfg(w)
    T, probs = lib.scope_tree(w, fresh=True, repo=n['repo'])
    if probs or (T != n['tree'] and not (wc.get('cache_v_bump') and lib.cache_v_only(n['repo'], n['tree'], T))):
        raise GateError(f"构建后树 {T[:12]} ≠ 审核单 {n['tree'][:12]}(构建期间源码被改)")
    d = os.path.abspath(a.dist).replace('\\', '/')
    cfgf = os.path.join(d, n['config'])
    c = lib.load(cfgf)
    if not c:
        raise GateError(f'产物配置不存在 {cfgf}')
    want = f'{lib.APPROVED if lib.LIVE else lib.CODE}/verify_or_bg.cmd {w}'
    if (c.get('build') or {}).get('command') != want:
        c['build'] = {'command': want}
        io.open(cfgf, 'w', encoding='utf-8', newline='\n').write(json.dumps(c, ensure_ascii=False, indent=2))
    errs = config_problems(w, cfgf)
    if errs:
        raise GateError(';'.join(errs))
    n.update(dist_sha256=dist_sha(d), dist_dir=d, tree_built=T)
    lib.dump(nonce_file(), n)
    tk = lib.load(n['ticket'])
    print(f"{tk['id']} t:{tk['content_sha256'][:12]} dist:{n['dist_sha256'][:12]} gate:{lib.gate_hash()[7:19]}")
    return 0


# ---------------- 台账 + 快照(§5.1、§5.2)----------------
def snapshot(w, repo, tree, msg, parent=None):
    env = lib.clean_env(GIT_AUTHOR_NAME='审核部', GIT_AUTHOR_EMAIL='audit@local', GIT_COMMITTER_NAME='审核部', GIT_COMMITTER_EMAIL='audit@local')
    args = ['git', *lib.GIT_C, 'commit-tree', tree] + (['-p', parent] if parent else []) + ['-F', '-']
    p = subprocess.run(args, cwd=repo, env=env, input=msg.encode('utf-8'), capture_output=True)
    if p.returncode:
        raise GateError('commit-tree 失败:' + p.stderr.decode('utf-8', 'replace')[-200:])
    return p.stdout.decode().strip()


def move_ref(w, repo, new, reflog_msg, old):
    lib.git(repo, 'update-ref', '--create-reflog', '-m', reflog_msg, lib.ship_ref(w), new, old or '')


def record(a):
    w = a.worker
    wc = lib.wcfg(w)
    n = lib.load(nonce_file(), {}) or {}
    if a.action in ('deploy', 'urgent') and a.status == 'ok' and (os.environ.get('BOHUI_SHIP_NONCE') != n.get('nonce') or n.get('worker') != w):
        raise GateError('record 只能由 ship.sh 在部署后调用(nonce 不符)')
    if a.action == 'breakglass' and len(''.join(os.environ.get('BOHUI_BREAKGLASS', '').split())) < 6:
        raise GateError('breakglass 记录只能由 ship.sh --breakglass 写')
    repo = n.get('repo') if (n.get('worker') == w and n.get('repo')) else wc['repo']
    T2, _ = lib.scope_tree(w, fresh=True, repo=repo)
    tk = lib.load(n['ticket']) if (a.action in ('deploy', 'urgent') and n.get('ticket')) else None
    old = lib.ref_commit(repo, lib.ship_ref(w))
    ok = a.status == 'ok' and bool(a.version)
    snap = None
    if ok:
        parent = old
        if not parent and wc.get('first_base'):
            parent = lib.git(repo, 'rev-parse', wc['first_base'] + '^{commit}').strip()
        msg = (f"ship {w} {a.version}\nticket: {tk['id'] if tk else '-'} sha256:{tk['content_sha256'] if tk else '-'}\n"
               f"tier: {tk['tier'] if tk else a.action}\n"
               f"tree: {T2}{'' if not tk or tk['tree'] == T2 else '(审核的是 ' + tk['tree'] + ';两者只差 CACHE_V 一行)'}\n"
               f"note: {note_line(a.note)}\ntime: {lib.iso()}\n")
        snap = snapshot(w, repo, T2, msg, parent)
        move_ref(w, repo, snap, f'{a.action} {w} {a.version}', old)
    due = None
    if a.action in ('urgent', 'breakglass') and ok:
        hrs = 12 if (tk and '成本+安全' in json.dumps(tk.get('reports', []), ensure_ascii=False)) else 24
        due = lib.iso(lib.now() + lib.dt.timedelta(hours=hrs))
    rec = lib.ledger_append('ship.jsonl', {'worker': w, 'action': a.action, 'status': 'ok' if ok else 'fail', 'version_id': a.version or None,
                                           'prev_live_version': a.prev_live or None, 'tree_reviewed': (tk or {}).get('tree'), 'tree_shipped': T2,
                                           'ticket': (tk or {}).get('id'), 'ticket_sha256': (tk or {}).get('content_sha256'), 'snapshot': snap,
                                           'smoke': a.smoke, 'note': note_line(a.note), 'dist_sha256': n.get('dist_sha256'),
                                           'message': a.message, 'followup_due': due, 'incident': (tk or {}).get('incident') or a.incident,
                                           'tier': (tk or {}).get('tier'), 'reason': a.reason})
    print(json.dumps({'ts': rec['ts'], 'snapshot': snap, 'status': rec['status']}, ensure_ascii=False))
    if ok:
        lib.dump(nonce_file(), {})
    return 0 if ok else 1


def set_smoke(a):
    """冒烟结果补一条(不改历史行)。"""
    lib.ledger_append('ship.jsonl', {'worker': a.worker, 'action': 'smoke', 'status': 'info', 'of_version': a.version, 'smoke': a.smoke})
    return 0


# ---------------- 回退(§5.3)----------------
def rollback(a):
    w = a.worker
    wc = lib.wcfg(w)
    if len((a.reason or '').replace(' ', '')) < 4:
        raise GateError('回退要写 --reason')
    recs = [r for r in lib.ledger_records('ship.jsonl') if r.get('worker') == w and r.get('status') == 'ok' and r.get('version_id')]
    good = []
    for r in recs:
        if r['action'] == 'baseline':
            good.append(r)
        elif r['action'] in ('deploy', 'urgent') and r.get('ticket'):
            tr = [x for x in lib.ledger_records('tickets.jsonl') if x.get('id') == r['ticket'] and x.get('content_sha256') == r.get('ticket_sha256')]
            if tr and r.get('tree_reviewed') not in revoked_trees(w):
                good.append(r)
        elif r['action'] == 'rollback':
            src = next((x for x in good if x.get('version_id') == r['version_id']), None)
            if src:
                good.append(dict(src, ts=r['ts']))
    try:
        live, _ = lib.live_version(w)
    except Exception as e:
        raise GateError(f'取不到线上版本:{e}')
    if a.to:
        tgt = next((r for r in reversed(good) if r['version_id'] == a.to), None)
        if not tgt:
            raise GateError(f'{a.to} 不是审核过的版本或登记过的基线,不能当回退目标(绕-15)')
    else:
        tgt = next((r for r in reversed(good) if r['version_id'] != live), None)
        if not tgt:
            raise GateError('台账里没有可回退的版本')
    if tgt['version_id'] == live:
        raise GateError(f'{live} 已经是线上版本')
    print(f"== 回退 {w}:{live} → {tgt['version_id']}(理由:{a.reason})")
    if lib.LIVE:
        r = lib.wrangler(w, f'rollback {tgt["version_id"]} --name {w} -m "{a.reason[:100].replace(chr(34), " ")}" -y', timeout=300)
        out = (r.stdout or '') + (r.stderr or '')
        okr = r.returncode == 0
    else:
        fx = lib.load(lib.rt('state', f'fixture_rollback_{w}.json'), {'exit': 0})
        okr, out = fx.get('exit', 0) == 0, 'fixture'
        if okr:
            ds = lib.load(lib.rt('state', f'fixture_deployments_{w}.json'), [])
            ds.insert(0, {'id': uuid.uuid4().hex, 'created_on': lib.iso(), 'source': 'wrangler', 'versions': [{'version_id': tgt['version_id'], 'percentage': 100}],
                          'annotations': {'workers/message': a.reason, 'workers/triggered_by': 'rollback'}})
            lib.dump(lib.rt('state', f'fixture_deployments_{w}.json'), ds)
    if not okr:
        print(out[-600:])
        lib.push(f'{w} 回退失败', out[-600:])
        return 1
    bad = [r for r in recs if r.get('version_id') == live]
    trees = sorted({t for r in bad for t in (r.get('tree_reviewed'), r.get('tree_shipped')) if t})
    lib.ledger_append('revoke.jsonl', {'worker': w, 'trees': trees, 'version': live, 'reason': a.reason})
    repo = wc['repo']
    old = lib.ref_commit(repo, lib.ship_ref(w))
    if tgt.get('snapshot'):
        move_ref(w, repo, tgt['snapshot'], f"rollback {w} {tgt['version_id']}", old)
    lib.ledger_append('ship.jsonl', {'worker': w, 'action': 'rollback', 'status': 'ok', 'version_id': tgt['version_id'], 'prev_live_version': live,
                                     'snapshot': tgt.get('snapshot'), 'tree_shipped': tgt.get('tree_shipped'), 'reason': a.reason, 'auto': bool(a.auto)})
    lib.issue(f"[审核部/红][上线] {w} 已回退 {live[:8]} → {tgt['version_id'][:8]}",
              f"理由:{a.reason}\n自动回退:{bool(a.auto)}\n作废的树:{trees}\n回退只回代码:D1 迁移、secret、绑定不会跟着回。")
    lib.push(f'{w} 已回退', f"{live} → {tgt['version_id']}:{a.reason}")
    print(f"   已回退;refs/ship/{w} → {str(tgt.get('snapshot'))[:10]};作废树 {len(trees)} 棵")
    return 0


# ---------------- 基线 / 线上登记 / 追审 ----------------
def adopt_baseline(a):
    w = a.worker
    wc = lib.wcfg(w)
    repo = wc['repo']
    if lib.ref_commit(repo, lib.ship_ref(w)):
        print(f'refs/ship/{w} 已存在,不重复登记')
        return 0
    c = lib.git(repo, 'rev-parse', (a.commit or wc.get('first_base') or 'HEAD') + '^{commit}').strip()
    if a.worktree:                        # 其他 Worker:当前工作区范围树
        tree, _ = lib.scope_tree(w, fresh=True)
    else:
        tree = lib.scoped_tree_of_commit(w, c)
    v = a.version
    if not v:
        v, _ = lib.live_version(w)
    snap = snapshot(w, repo, tree, f'baseline {w} {v}\nsource: {c}{" + 工作区" if a.worktree else ""}\ntime: {lib.iso()}\n')
    move_ref(w, repo, snap, f'baseline {w} {v}', None)
    lib.ledger_append('ship.jsonl', {'worker': w, 'action': 'baseline', 'status': 'ok', 'version_id': v, 'snapshot': snap, 'tree_shipped': tree,
                                     'note': f'v2 启用基线:来源 {c[:10]}', 'reason': a.reason or '审核部 v2.1 启用登记'})
    print(f'baseline {w}:refs/ship/{w} = {snap[:10]}(树 {tree[:12]},线上版本 {v})')
    return 0


def ref_reseal(a):
    """refs/ship/<w> 被手动挪过又挪回(reflog 留了非 ticket.py 的记录)→ verify 第 4 步会一直拦。
    值必须仍等于台账最后一条成功记录的快照,才允许追认:补一条 reflog、记台账、推送。"""
    w = a.worker
    repo = lib.wcfg(w)['repo']
    if len(re.sub(r'\s', '', a.reason or '')) < 6:
        raise GateError('追认理由去空白后至少 6 个字')
    cur, last = lib.ref_commit(repo, lib.ship_ref(w)), last_success(w)
    if not last or cur != last.get('snapshot'):
        raise GateError(f'refs/ship/{w}={str(cur)[:10]} 与台账最后成功快照 {str((last or {}).get("snapshot"))[:10]} 不一致,不能追认(要么回退要么查清谁动的)')
    tmp = snapshot(w, repo, lib.git(repo, 'rev-parse', cur + '^{tree}').strip(), f'reseal {w}\n', cur)   # 同值 update-ref 不记 reflog:先挪到临时提交再挪回
    move_ref(w, repo, tmp, f'reseal-tmp {w}', cur)
    move_ref(w, repo, cur, f"baseline {w} {last.get('version_id')} 追认:{a.reason[:60]}", tmp)
    lib.ledger_append('ship.jsonl', {'worker': w, 'action': 'ref_reseal', 'status': 'info', 'snapshot': cur, 'reason': a.reason})
    lib.push(f'refs/ship/{w} 追认', a.reason)
    print(f'已追认 refs/ship/{w} = {cur[:10]}')
    return 0


def adopt_live(a):
    w = a.worker
    v, dep = lib.live_version(w)
    if any(r.get('version_id') == v for r in lib.ledger_records('ship.jsonl') if r.get('worker') == w):
        print(f'{v} 已在台账')
        return 0
    lib.ledger_append('ship.jsonl', {'worker': w, 'action': 'adopt_live', 'status': 'info', 'version_id': v, 'reason': a.reason,
                                     'followup_due': lib.iso(lib.now() + lib.dt.timedelta(hours=24)), 'deployment': (dep or {}).get('id')})
    lib.issue(f'[审核部/红][上线] {w} 登记未审线上版本 {v[:8]}', f'理由:{a.reason}。24 小时内追审;追审前不能当回退目标。')
    print(f'已登记 {v},24 小时内追审')
    return 0


def followup(a):
    """追审(§3.3):对当时上线的那棵树补一张常规审核单。急修/破窗的基准 = 那次上线前的快照;
    第一版闸门(引导批准)= 全量;adopt-live 登记的线上版本代码不可知 → 审当前工作区相对 refs/ship。"""
    global SFX
    SFX = '-followup'
    w = a.worker
    wc = lib.wcfg(w)
    repo = wc['repo']
    recs = lib.ledger_records('ship.jsonl')
    done = {r.get('of') for r in recs if r.get('action') == 'followup_done' and r.get('verdict') == '过'}
    rec = next((r for r in reversed(recs) if r.get('worker') == w and r.get('followup_due') and r['ts'] not in done
                and (not a.tree or a.tree in (r.get('tree_shipped'), r.get('tree_reviewed')))), None)
    if not rec:
        raise GateError('台账里没有待追审的记录')
    note = f"【追审】{rec.get('note') or rec.get('reason') or ''}"
    if wc.get('kind') == 'gate' and rec.get('action') == 'baseline':
        tree, base_commit, base_tree = rec['tree_shipped'], None, EMPTY_TREE
        note = '【追审】【整批】第一版闸门全量追审(引导批准)'
    elif rec.get('tree_shipped'):
        tree = rec['tree_shipped']
        parent = lib.git(repo, 'rev-parse', '-q', '--verify', f"{rec['snapshot']}^", check=False).stdout.strip() if rec.get('snapshot') else ''
        base_commit = parent or None
        base_tree = lib.git(repo, 'rev-parse', parent + '^{tree}').strip() if parent else lib.base_of(w)[1]
    else:
        tree = a.tree or lib.scope_tree(w, fresh=True)[0]
        base_commit, base_tree, _ = lib.base_of(w)
    d = lib.load(dpath(w, tree))
    if not d or d.get('kind') != 'followup':
        g1 = gate1.check_tree(w, tree, base_tree, 'ship', note)
        tier, reasons, angles, _, _ = tier_of(w, g1, note, False, False, repo, base_tree, tree)
        angles = ['追审-' + x for x in angles]
        d = make_draft(w, tree, (base_commit, base_tree, False), g1, note, tier, reasons, angles, budget(''), {'kind': 'followup'}, repo)
    rc, tp = issue(w, tree)
    if rc in (0, 1, 3) and tp:
        tk = lib.load(tp)
        lib.ledger_append('ship.jsonl', {'worker': w, 'action': 'followup_done', 'status': 'info', 'of': rec['ts'], 'verdict': tk['verdict'], 'ticket': tk['id']})
        if tk['verdict'] == '拦':
            lib.issue(f'[审核部/红][上线] {w} 线上存在未审问题', f"追审 {tk['id']} 结论:拦。主线必须修复或回退。原上线:{rec.get('action')} {rec.get('version_id')}")
    return rc


# ---------------- 其他 ----------------
def status(a):
    w = a.worker
    T, probs = lib.scope_tree(w, fresh=False)
    bc, bt, first = lib.base_of(w)
    tk = lib.load(tpath(w, T))
    d = lib.load(dpath(w, T))
    print(f'Worker {w} · 当前树 {T[:12]} · 基准 {bc[:10]}{"(首次)" if first else ""}')
    print(f"审核单:{(tk or {}).get('id', '无')} {(tk or {}).get('verdict', '')} 到期 {(tk or {}).get('expires_at', '')}")
    if d and not tk:
        have = [a for a in d['angles'] if os.path.exists(rpath(w, T, a))]
        print(f"草稿 {d['tier']}:报告 {len(have)}/{len(d['angles'])},还差 {[a for a in d['angles'] if a not in have]}")
    print(f'逾期追审:{overdue(w) or "无"}')
    return 0


def selfcheck(a):
    ok, h = lib.gate_ok()
    print(f"闸门 {h[:19]} {'在' if ok else '不在'}批准清单")
    if lib.LIVE and lib.CODE.lower() == lib.APPROVED.lower():
        wh = lib.gate_hash(lib.REAL)
        if wh != h:
            print('[黄] 工作副本有未审改动(批准前不会被执行;改完走 ship_ops.sh gate)')
    return 0 if ok else 1


def ledger_cmd(a):
    if a.op == 'check':
        bad = 0
        for n in ('tickets.jsonl', 'ship.jsonl', 'ops.jsonl', 'revoke.jsonl', 'jev_calls.jsonl'):
            ok, msg = lib.ledger_verify(n)
            print(f"{n}: {'ok' if ok else msg}")
            bad += not ok
        return 1 if bad else 0
    if len(re.sub(r'\s', '', a.reason or '')) < 6:
        raise GateError('reseal 理由去空白后至少 6 个字')
    br, upto = lib.ledger_breaks(a.name)
    rec = lib.ledger_append(a.name, {'action': 'reseal', 'breaks': br, 'upto_sha256': upto, 'reason': a.reason})
    lib.push(f'台账 {a.name} 断链确认', f'断点 {br};理由:{a.reason}')
    lib.anchor(f"台账 {a.name} reseal · 断点 {br} · 新链头 {lib.ledger_head(a.name)[:12]} · 理由:{a.reason}")
    print(f'已追认断点 {br}')
    return 0


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    for c in ('hash', 'prepare', 'issue', 'verify', 'nonce', 'seal', 'record', 'smoke', 'rollback', 'followup', 'adopt-baseline', 'adopt-live', 'ref-reseal', 'status', 'live'):
        p = sp.add_parser(c)
        p.add_argument('--worker', required=True)
        p.add_argument('--repo')
        p.add_argument('--note', default='')
        p.add_argument('--tree')
        p.add_argument('--stage', default='ship', choices=['ship', 'deploysh', 'wrangler'])
        p.add_argument('--ticket')
        p.add_argument('--dist')
        p.add_argument('--action')
        p.add_argument('--status', default='ok')
        p.add_argument('--version')
        p.add_argument('--prev-live')
        p.add_argument('--smoke')
        p.add_argument('--message')
        p.add_argument('--reason')
        p.add_argument('--to')
        p.add_argument('--auto', action='store_true')
        p.add_argument('--urgent', action='store_true')
        p.add_argument('--patch')
        p.add_argument('--incident')
        p.add_argument('--commit')
        p.add_argument('--worktree', action='store_true')
    sp.add_parser('selfcheck')
    lp = sp.add_parser('ledger')
    lp.add_argument('op', choices=['check', 'reseal'])
    lp.add_argument('--name', default='tickets.jsonl')
    lp.add_argument('--reason')
    a = ap.parse_args()
    try:
        if a.cmd == 'hash':
            t, probs = lib.scope_tree(a.worker, fresh=True, repo=repo_of(a.worker, a.repo))
            for p in probs:
                print('拦:' + p)
            print(t)
            return 1 if probs else 0
        if a.cmd == 'live':
            v, _ = lib.live_version(a.worker)
            print(v or '')
            return 0
        fn = {'prepare': prepare, 'issue': lambda a: issue(a.worker, a.tree or lib.scope_tree(a.worker, repo=repo_of(a.worker, a.repo))[0])[0],
              'verify': verify, 'nonce': nonce, 'seal': seal, 'record': record, 'smoke': set_smoke, 'rollback': rollback, 'followup': followup,
              'adopt-baseline': adopt_baseline, 'adopt-live': adopt_live, 'ref-reseal': ref_reseal, 'status': status, 'selfcheck': selfcheck, 'ledger': ledger_cmd}[a.cmd]
        return fn(a)
    except GateError as e:
        print(f'[审核单] 拒绝:{e}')
        return 1
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f'[审核单] 闸门出错(按拦处理):{type(e).__name__}: {e}')
        return 4


if __name__ == '__main__':
    sys.exit(main())
