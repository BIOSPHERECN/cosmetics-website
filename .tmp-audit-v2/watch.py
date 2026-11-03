# 审核部 v2.1 · 第三关·每小时巡查(设计 §4.3)。计划任务 Bohui-AuditWatch 每小时第 47 分钟跑(注册脚本 register_watch_task.ps1,本线不执行)。
# 用法:python watch.py [--dry] [--fixture]      --dry 只打印不开单不推送;AUDIT_DRY=1 只在同时带 --fixture 时才认(绕-13)
# 13 件事:①部署对账(deployment id / message / versions)②台账链与 refs ③追审逾期 ④闸门漂移(代码、settings、hook 用的 python)
#   ⑤计划任务漂移 ⑥Jev 账本与 Worker secret ⑦上线后读量 ⑧轻冒烟 ⑨GitHub 工作流漂移 ⑩hook 自检 ⑪环境变量 ⑫锚点补发 ⑬心跳
# 红黄项交 audit_tickets.sync(科「上线」,来源「本机巡查」)开单/关单;红项 Server酱 推送(每天 5 条、按指纹去重)。
import argparse, datetime as dt, glob, io, json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, ticket

F, UN, KEYS = [], [], []
T0 = time.time()


def add(rule, obj, level, title, evidence):
    F.append(dict(dept='上线', rule=rule, obj=obj, level=level, title=title, evidence=evidence[:800], owner='主线'))


def safe(name, fn):
    try:
        fn()
    except Exception as e:
        UN.append(f'{name}:{type(e).__name__}: {str(e)[:160]}')


def enabled_at():
    r = next((x for x in lib.ledger_records('ship.jsonl') if x.get('action') == 'baseline' and x.get('worker') != 'gate'), None)
    return r['ts'] if r else lib.iso()


# ① 部署对账
def reconcile():
    since = lib.parse_iso(enabled_at())
    recs = lib.ledger_records('ship.jsonl')
    tks = {r['id']: r for r in lib.ledger_records('tickets.jsonl') if r.get('id')}
    appr = {x['gate_hash'][7:19] for x in lib.gate_approved_list()}
    ops = [r for r in lib.ledger_records('ops.jsonl') if r.get('action') == 'prod']
    ws = {w: wc for w, wc in lib.cfg()['workers'].items() if wc.get('watch') is not False}

    def fetch(w):                     # wrangler 每次 10–20 秒,并行取(单次巡查目标 ≤90 秒)
        try:
            return w, lib.deployments(w), None
        except Exception as e:
            return w, None, e
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        got = {w: (d, e) for w, d, e in ex.map(fetch, ws)}
    for w, wc in ws.items():
        deps, err = got[w]
        if err is not None:
            if re.search(r'10007|does not exist|not found', str(err), re.I):
                KEYS.append(f'{w} 还没建')          # 施工中的 Worker(如 beauty2oem-web),建好后自动开始对账
                continue
            UN.append(f'{w} 部署列表取不到:{str(err)[:120]}')
            continue
        mine = [r for r in recs if r.get('worker') == w]
        known = {r.get('version_id') for r in mine if r.get('version_id')}
        recent = [d for d in deps if lib.parse_iso(d['created_on'].replace('Z', '+00:00')) >= since]
        for d in recent:
            vs = [v.get('version_id') for v in d.get('versions', [])]
            ann = d.get('annotations') or {}
            msg = ann.get('workers/message', '') or ''
            trig = ann.get('workers/triggered_by', '')
            if trig == 'secret' or d.get('source') == 'secret':
                t = lib.parse_iso(d['created_on'].replace('Z', '+00:00'))
                if not any(o.get('worker') == w and abs((lib.parse_iso(o['ts']) - t).total_seconds()) < 900 for o in ops):
                    add('unaudited-secret', f'{w}:{d.get("id")}', 'red', f'{w} secret 变更没走 ship_ops prod', f'{d["created_on"]} {d.get("author_email", "")}')
                continue
            unk = [v for v in vs if v not in known]
            if unk:
                add('unaudited-deploy', f'{w}:{unk[0]}', 'red', f'未审部署:{w} {unk[0][:8]}',
                    f'{d["created_on"]} 来源 {d.get("source", "?")} 作者 {d.get("author_email", "")} message「{msg[:80]}」不在 ship.jsonl')
                continue
            if wc.get('kind') in ('astro', 'script') and trig not in ('rollback',) and not msg.startswith('BREAKGLASS'):
                m = re.match(r'(RT-\S+) t:([0-9a-f]{12})(?: dist:[0-9a-f]{12})? gate:([0-9a-f]{12})', msg)
                if not m or m.group(1) not in tks or tks[m.group(1)]['content_sha256'][:12] != m.group(2) or m.group(3) not in appr:
                    add('deploy-message', f'{w}:{d.get("id")}', 'red', f'{w} 部署 message 对不上审核单', f'message「{msg[:120]}」')
        hour = [d for d in recent if lib.now() - lib.parse_iso(d['created_on'].replace('Z', '+00:00')) < dt.timedelta(hours=1)]
        led = [r for r in mine if r.get('action') in ('deploy', 'urgent', 'breakglass', 'rollback', 'secret') and lib.now() - lib.parse_iso(r['ts']) < dt.timedelta(hours=1)]
        if len(hour) > len(led):
            add('deploy-count', f'{w}:{lib.now():%Y%m%d%H}', 'red', f'{w} 一小时内部署 {len(hour)} 次,台账只有 {len(led)} 次', '按 deployment id 逐条对账(绕-16)')
        if lib.LIVE and wc.get('kind') in ('astro', 'script'):
            r = lib.wrangler(w, f'versions list --name {w} --json')
            mm = re.search(r'\[.*\]', r.stdout or '', re.S)
            for v in (json.loads(mm.group(0)) if mm else []):
                c = (v.get('metadata') or {}).get('created_on', '')
                if c and lib.parse_iso(c.replace('Z', '+00:00')) >= since and v.get('id') not in known:
                    add('unaudited-version', f'{w}:{v.get("id")}', 'red', f'{w} 有未进台账的上传版本 {v.get("id", "")[:8]}', f'{c} versions upload 也要走 ship')
        KEYS.append(f'{w} 启用后部署 {len(recent)} 次')


# ② 台账链 + refs
def chains():
    for n in ('tickets.jsonl', 'ship.jsonl', 'ops.jsonl', 'revoke.jsonl'):
        ok, msg = lib.ledger_verify(n)
        if not ok:
            add('ledger-chain', n, 'red', f'台账 {n} 断链', msg)
    for w, wc in list(lib.cfg()['workers'].items()) + list(lib.cfg().get('gates', {}).items()):
        cur = lib.ref_commit(wc['repo'], lib.ship_ref(w))
        last = ticket.last_success(w)
        if (cur or last) and (not last or last.get('snapshot') != cur):
            add('ship-ref', w, 'red', f'refs/ship/{w} 与 ship.jsonl 最后一条成功记录对不上', f'ref {str(cur)[:10]} / 台账 {str((last or {}).get("snapshot"))[:10]}')


# ③ 追审逾期
def followups():
    for x in ticket.overdue():
        add('followup-overdue', x.split(' 到期')[0], 'red', f'追审逾期:{x}', '急修/破窗/降级审核/线上登记要 24 小时内补审:ticket.py followup --worker <名>')


# ④ 闸门漂移
def drift():
    ok, h = lib.gate_ok(lib.APPROVED) if os.path.isdir(lib.APPROVED) else (False, 'none')
    if not ok:
        add('gate-drift', 'approved', 'red', '已批准副本的哈希不在批准清单', f'{h[:19]}(有人动了 cache/gate_approved/)')
    elif lib.gate_hash(lib.REAL) != h:
        add('gate-workcopy', 'workcopy', 'yellow', '闸门工作副本有未审改动', '批准前不会被执行;改完走 ship_ops.sh gate')
    man = lib.load(lib.rt('state', 'guard_manifest.json'), {}) or {}
    cur = guard_manifest()
    for k, v in cur.items():
        if man and man.get(k) != v:
            add('guard-drift', k, 'red', f'受保护文件变了:{os.path.basename(k)}', f'{k}(settings / review-ticket.js / hook 用的 python 与 .pth);认可就重新批准闸门')
    if not man:
        lib.dump(lib.rt('state', 'guard_manifest.json'), cur)


def guard_manifest():
    fs = ['F:/0cosmetic/.claude/settings.json', 'F:/0cosmetic/cosmetic-sites/.claude/settings.json', 'F:/0cosmetic/skin2oem/.claude/settings.json',
          'F:/0cosmetic/bohui-automation/.claude/settings.json', 'F:/0cosmetic/.claude/workflows/review-ticket.js', lib.SYS_PY, lib.VENV_PY,
          'F:/0cosmetic/_venv/review/pyvenv.cfg'] + glob.glob('F:/0cosmetic/_venv/review/Lib/site-packages/*.pth') + \
         glob.glob('C:/Users/Administrator/AppData/Local/Programs/Python/Python312/Lib/site-packages/*.pth')
    return {f.replace('\\', '/'): (lib.sha256(open(f, 'rb').read()) if os.path.exists(f) else 'missing') for f in fs}


# ⑤ 计划任务漂移(第一批只报不拦)
def tasks():
    import ops
    reg = lib.load(ops.tasks_path(), {}) or {}
    if not reg:
        UN.append('计划任务登记表 state/tasks.json 还没建(ops.py register --all)')
        return
    ts = ops.list_tasks()
    if not ts:
        UN.append('计划任务列表为空(取数失败)')
        return
    for t in ts:
        r = reg.get(t['n'])
        if not r:
            add('task-unregistered', t['n'], 'red', f"计划任务 {t['n']} 没登记", '新增/修改计划任务走 ops.py register(§7.3)')
            continue
        if ops.xml_sha(t['x']) != r['xml_sha256']:
            add('task-xml', t['n'], 'red', f"计划任务 {t['n']} 定义变了", '和登记表 xml_sha256 对不上')
        if ops.files_sha(r['files']) != r['files_sha256']:
            add('task-script', t['n'], 'red', f"计划任务 {t['n']} 的脚本改了没审", f"脚本:{r['files'][:4]};走 ship_ops.sh task {t['n']} --note …")
        if r.get('enabled_expected') and t['s'] == 'Disabled':
            add('task-disabled', t['n'], 'yellow', f"计划任务 {t['n']} 应启用但停了", 'D1 红灯暂停的看任务描述')
    for f, v in (reg.get('_scripts') or {}).items():
        if ops.files_sha([f]) != v['files_sha256']:
            add('script-unreviewed', f, 'red', f'登记过的脚本改了没审:{os.path.basename(f)}', f)
    KEYS.append(f'计划任务 {len(ts)} 个')


# ⑥ Jev 账本 + Worker secret
def jev():
    import judges
    b = judges.jev_budget()
    cap = judges.CONF.get('jev', {}).get('daily_input_cap', 2_000_000)
    if b['used_in'] > cap * 0.8:
        add('jev-quota', b['day'], 'yellow', f"Jev 今日输入 {b['used_in']:,} token,超过上限 80%", f'上限 {cap:,}')
    ok, msg = lib.ledger_verify('jev_calls.jsonl')
    if not ok:
        add('jev-ledger', 'jev_calls', 'red', 'Jev 调用账本断链', msg)
    KEYS.append(f"Jev 今日 {b['used_in']:,}/{cap:,} token")
    st = lib.load(lib.rt('state', 'watch_daily.json'), {}) or {}
    if lib.LIVE and st.get('secret_day') != b['day']:
        for w in ('bohui-web', 'beauty2ai'):
            r = lib.wrangler(w, f'secret list --name {w}')
            if 'TYPESAFE_API_KEY' in (r.stdout or ''):
                add('jev-in-worker', w, 'red', f'{w} 的 secret 里有 TYPESAFE_API_KEY', 'Jev 只许在本机闸门用,不进 Worker')
        st['secret_day'] = b['day']
        lib.dump(lib.rt('state', 'watch_daily.json'), st)


# ⑦ 上线后读量(读 d1_budget 本机 jsonl,不查 D1)
def reads():
    p = 'F:/0cosmetic/bohui-automation/local/logs/d1_budget.jsonl'
    if not lib.LIVE or not os.path.exists(p):
        return
    rows = []
    for l in open(p, encoding='utf-8', errors='replace').readlines()[-400:]:
        try:
            rows.append(json.loads(l))
        except ValueError:
            pass
    for r in [x for x in lib.ledger_records('ship.jsonl') if x.get('action') in ('deploy', 'urgent', 'breakglass') and x.get('status') == 'ok']:
        t = lib.parse_iso(r['ts'])
        if not dt.timedelta(hours=2) <= lib.now() - t <= dt.timedelta(hours=4):
            continue
        after = [d for x in rows for d in x.get('dbs', []) if x.get('at', '') >= t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')]
        before = [d for x in rows for d in x.get('dbs', []) if x.get('at', '')[:13] == (t - dt.timedelta(days=1)).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H')]
        a = max((d.get('last_hour', 0) for d in after), default=0)
        b0 = max((d.get('last_hour', 0) for d in before), default=0)
        if b0 and a > 2 * b0:
            add('reads-doubled', f"{r['worker']}:{r.get('version_id')}", 'red', f"{r['worker']} 上线后读量翻倍", f"上线 {r.get('version_id')} 后每小时 {a:,} 行,前一天同时段 {b0:,}")


# ⑦b 零付费看门狗(§4.4):Workers AI / KV 写 / R2 A 类 / Vectorize,用 GraphQL 统计接口(免费、只读;D1 由 d1_budget 管)
USAGE_Q = '''query($a:String!,$d:Date!,$m:Date!){viewer{accounts(filter:{accountTag:$a}){
 ai: aiInferenceAdaptiveGroups(limit:1,filter:{date_geq:$d}){sum{totalNeurons}}
 kv: kvOperationsAdaptiveGroups(limit:100,filter:{date_geq:$m}){sum{requests} dimensions{actionType}}
 r2: r2OperationsAdaptiveGroups(limit:200,filter:{date_geq:$m}){sum{requests} dimensions{actionType}}
 vq: vectorizeV2QueriesAdaptiveGroups(limit:1,filter:{date_geq:$m}){sum{queriedVectorDimensions}}}}}'''
# nosemgrep: C4-r2-list 这是 GraphQL 用量统计里 R2 A 类操作名的清单(只数次数),不是列目录调用
R2_A = {'PutObject', 'CopyObject', 'CompleteMultipartUpload', 'CreateMultipartUpload', 'UploadPart', 'UploadPartCopy', 'ListObjects', 'ListObjectsV2',
        'ListBuckets', 'ListMultipartUploads', 'ListParts', 'PutBucket', 'PutBucketCors', 'PutBucketLifecycleConfiguration', 'LifecycleStorageTierTransition'}
FREE = {'Workers AI 今日 neuron': 10_000, 'KV 写/删/列 本月': 1_000_000, 'R2 A 类 本月': 1_000_000, 'Vectorize 查询维度 本月': 50_000_000}


def usage():
    if not lib.LIVE:
        return
    sys.path.insert(0, 'F:/0cosmetic/bohui-automation/local')
    import d1_budget as b
    now = dt.datetime.now(dt.timezone.utc)
    day, month = now.date().isoformat(), now.date().replace(day=1).isoformat()
    frac = now.day / (((now.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)).day)
    for name, get in (('公司', lambda: b.company_cred()), ('平台', lambda: ('b7362ed77d212bab298a9ae8736c9868', b.platform_token()))):
        try:
            acc, tok = get()
            r = b.cf(tok, 'https://api.cloudflare.com/client/v4/graphql', {'query': USAGE_Q, 'variables': {'a': acc, 'd': day, 'm': month}})
            a = (((r.get('data') or {}).get('viewer') or {}).get('accounts') or [{}])[0]
            if r.get('errors'):
                raise RuntimeError(str(r['errors'])[:160])
        except Exception as e:
            UN.append(f'{name}账号用量取不到:{str(e)[:120]}')
            continue
        vals = {'Workers AI 今日 neuron': sum(g['sum']['totalNeurons'] or 0 for g in a.get('ai') or []),
                'KV 写/删/列 本月': sum(g['sum']['requests'] for g in a.get('kv') or [] if g['dimensions']['actionType'] in ('write', 'delete', 'list')),
                'R2 A 类 本月': sum(g['sum']['requests'] for g in a.get('r2') or [] if g['dimensions']['actionType'] in R2_A),
                'Vectorize 查询维度 本月': sum(g['sum']['queriedVectorDimensions'] or 0 for g in a.get('vq') or [])}
        for k, v in vals.items():
            proj = v if '今日' in k else v / max(frac, 1 / 31)
            ratio = proj / FREE[k]
            if ratio > 1:
                add('usage-over', f'{name}:{k}', 'red', f'{name}账号 {k} 推算超免费额度', f'已用 {v:,.0f},推算 {proj:,.0f} / 免费 {FREE[k]:,}(零付费铁令)')
            elif ratio > 0.8:
                add('usage-80', f'{name}:{k}', 'yellow', f'{name}账号 {k} 推算超免费额度 80%', f'已用 {v:,.0f},推算 {proj:,.0f} / 免费 {FREE[k]:,}')
        KEYS.append(f"{name}用量 " + ' '.join(f'{k.split()[0]}{v:,.0f}' for k, v in vals.items()))


# ⑧ 轻冒烟
def smoke():
    for w, wc in lib.cfg()['workers'].items():
        if not wc.get('smoke'):
            continue
        p = subprocess.run([sys.executable, os.path.join(lib.CODE, 'smoke.py'), '--worker', w, '--mode', 'hourly'], capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=300, env=lib.clean_env())
        if p.returncode in (5, 6, 8):
            add('smoke-hourly', w, 'yellow' if p.returncode == 6 else 'red', f"{w} 轻冒烟{'出现红线词' if p.returncode == 8 else '失败'}", p.stdout[-600:])
        elif p.returncode == 7:
            UN.append(f'{w} 轻冒烟:本机网络异常')


# ⑨ GitHub 工作流漂移(只读 API)
def gh_drift():
    if not lib.LIVE:
        return
    lib.gh_token()
    tk = lib.tickets_mod()
    items = tk.api('GET', '/repos/w8848/bohui-automation/contents/.github/workflows')
    states = {x['path']: x['state'] for x in tk.api('GET', '/repos/w8848/bohui-automation/actions/workflows?per_page=100').get('workflows', [])}
    cur = {i['path']: {'sha': i['sha'], 'state': states.get(i['path'], '?')} for i in items if i['name'].endswith(('.yml', '.yaml'))}
    mp = lib.rt('state', 'gh_manifest.json')
    man = lib.load(mp)
    if not man:
        lib.dump(mp, cur)
        KEYS.append(f'GitHub 工作流基线 {len(cur)} 个')
        return
    for p, v in cur.items():
        if p not in man:
            add('gh-new-workflow', p, 'red', f'GitHub 新增未登记工作流 {os.path.basename(p)}', '要 kind=task 审核单才准推(第二批 pre-push)')
        elif man[p]['sha'] != v['sha']:
            add('gh-workflow-changed', p, 'red', f'GitHub 工作流被改 {os.path.basename(p)}', f"sha {man[p]['sha'][:8]} → {v['sha'][:8]}")
        elif man[p]['state'] == 'active' and v['state'] != 'active':
            add('gh-workflow-disabled', p, 'red', f'GitHub 工作流被停用 {os.path.basename(p)}', v['state'])
    KEYS.append(f'GitHub 工作流 {len(cur)} 个')


# ⑩ hook 自检 ⑪ 环境变量
def hook_self():
    hg = (lib.APPROVED if lib.LIVE else lib.CODE) + '/hook_guard.py'
    p = subprocess.run([lib.SYS_PY, '-I', '-S', hg, '--explain'], input=json.dumps({'tool_name': 'Bash', 'tool_input': {'command': 'npx wrangler deploy'},
                                                                                  'cwd': 'F:/0cosmetic'}).encode(), capture_output=True, timeout=30)
    if b'"deny"' not in p.stdout:
        add('hook-selftest', 'hook_guard', 'red', 'hook 自检:npx wrangler deploy 没被拒', p.stdout.decode('utf-8', 'replace')[-300:])
    if not lib.enabled():
        add('gate-disabled', 'ENABLED', 'yellow', '审核部开关 ENABLED 不在(观察模式,不拦)', f'{lib.RT}/ENABLED')


def env_vars():
    for key in (r'HKCU\Environment', r'HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment'):
        p = subprocess.run(['reg', 'query', key], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        bad = re.findall(r'^\s+((?:BOHUI_|AUDIT_|GIT_)\w*)\s+REG_', p.stdout or '', re.M | re.I)
        if bad:
            add('env-var', key, 'red', f'永久环境变量出现 {bad}', key)


# ⑫ 锚点补发 + Jev 留痕核对
def anchors():
    p = lib.rt('state', 'anchor_pending.jsonl')
    if lib.LIVE and os.path.exists(p):
        pend = [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()]
        left = [x for x in pend if not lib.anchor(x['text'])]
        io.open(p, 'w', encoding='utf-8').write(''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in left))
    day = f'{lib.now():%Y-%m-%d}'
    tks = [lib.load(q) or {} for q in glob.glob(lib.rp('tickets', '*', '*.json'))]
    today = [t for t in tks if t.get('issued_at', '').startswith(day) and t.get('judges')]
    with_jev = [t for t in today if (t['judges'].get('jev') or {}).get('call_ref')]
    calls = [r for r in lib.ledger_records('jev_calls.jsonl') if r.get('ts', '').startswith(day)]
    if len(with_jev) > len(calls):
        add('jev-trace', day, 'red', f'带 Jev 记录的审核单 {len(with_jev)} 张 > 账本调用 {len(calls)} 次', '审核单里的 Jev 结果对不上真实调用(绕-14)')
    absent = [t for t in today if (t['judges'].get('jev') or {}).get('status') == '缺席']
    if today and len(absent) / len(today) > 0.3:
        add('jev-absent', day, 'yellow', f'今天 Jev 缺席 {len(absent)}/{len(today)} 张单', '超过 30%')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--fixture', action='store_true')
    ap.add_argument('--only')
    ap.add_argument('--now', action='store_true')
    a = ap.parse_args()
    dry = a.dry or (a.fixture and os.environ.get('AUDIT_DRY') == '1')
    if a.fixture and lib.LIVE:
        print('--fixture 只在红队临时副本里用')
        return 64
    steps = [('部署对账', reconcile), ('台账链', chains), ('追审', followups), ('闸门漂移', drift), ('计划任务', tasks), ('Jev', jev),
             ('读量', reads), ('零付费', usage), ('轻冒烟', smoke), ('GitHub 工作流', gh_drift), ('hook 自检', hook_self), ('环境变量', env_vars), ('锚点', anchors)]
    for name, fn in steps:
        if a.only and a.only not in (name, fn.__name__):
            continue
        safe(name, fn)
    hb = {'at': lib.iso(), 'seconds': round(time.time() - T0, 1), 'red': sum(f['level'] == 'red' for f in F), 'yellow': sum(f['level'] == 'yellow' for f in F),
          'unaudited': UN, 'keys': KEYS}
    lib.dump(lib.rt('state', 'watch_heartbeat.json'), hb)
    with io.open(lib.rt('logs', f'watch-{lib.now():%Y%m%d}.jsonl'), 'a', encoding='utf-8') as f:
        f.write(json.dumps(dict(hb, findings=F), ensure_ascii=False) + '\n')
    for x in F:
        print(f"[{'红' if x['level'] == 'red' else '黄'}] {x['title']}:{x['evidence'][:160]}")
    for u in UN:
        print(f'[无法审计] {u}')
    print(f"巡查完:红 {hb['red']} 黄 {hb['yellow']} 无法审计 {len(UN)} · {hb['seconds']}s · {';'.join(KEYS)}")
    if dry or not lib.LIVE:
        return 1 if hb['red'] else 0
    try:
        lib.gh_token()
        tk = lib.tickets_mod()
        tk.sync(F, ['上线'] if not UN else [], '本机巡查', f'https://github.com/{tk.REPO}/issues?q=label%3A审核部', f'{lib.now():%Y-%m-%d}')
    except Exception as e:
        print(f'整改单同步失败:{e}')
    for x in F:
        if x['level'] == 'red':
            lib.push(x['title'], x['evidence'], fp=tk_fp(x))
    return 1 if hb['red'] else 0


def tk_fp(x):
    return lib.sha256(f"{x['dept']}|{x['rule']}|{x['obj']}")[:12]


if __name__ == '__main__':
    sys.exit(main())
