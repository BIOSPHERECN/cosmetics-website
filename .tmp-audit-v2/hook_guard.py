# 审核部 v2.1 · 项目级 PreToolUse hook(设计-v2.1.md §6.1)。系统 Python 3.12 `-I -S` 隔离模式跑,只用标准库,
# 不 import 本目录别的文件(venv 坏了、工作副本改了都不影响它;执行的是已批准副本 cache/gate_approved/)。
# 拦:不经 ship.sh 的 wrangler deploy / versions deploy|upload / rollback / triggers deploy / secret / d1 写 / kv 写 / r2 delete、
#     直接跑 deploy*.xx 与非白名单 ship*.sh、写 settings / 闸门副本 / 台账 / .git/hooks、改计划任务、编码命令、CF 部署 API 等。
# 放:白名单上线入口(两站 ship.sh、ship-b2o.sh、ship_ops.sh、ops.py、ticket.py 只读子命令)、只读命令、git commit -m / gh --body 的文字。
# 开关:audit_v2/ENABLED 不在 = 观察模式(只记 ledger/hook.jsonl,不拦)。自测:python -I -S hook_guard.py --explain < 事件.json
import datetime, glob, json, os, re, sys, time

AV2 = 'f:/0cosmetic/tools-review/audit_v2'
TR = 'f:/0cosmetic/tools-review'
WHITE_SH = {'f:/0cosmetic/cosmetic-sites/tools/ship.sh', 'f:/0cosmetic/cosmetic-sites/tools/ship-b2o.sh',
            'f:/0cosmetic/skin2oem/tools/platform/ship.sh', AV2 + '/cache/gate_approved/audit_v2/ship_ops.sh'}
WHITE_PY = {AV2 + '/cache/gate_approved/audit_v2/ops.py': None, AV2 + '/cache/gate_approved/audit_v2/watch.py': None,
            AV2 + '/cache/gate_approved/audit_v2/smoke.py': None, AV2 + '/cache/gate_approved/audit_v2/gate1.py': None,
            AV2 + '/cache/gate_approved/audit_v2/ticket.py': {'status', 'followup', 'adopt-live', 'adopt-baseline', 'ref-reseal', 'ledger', 'selfcheck', 'hash', 'live', 'issue'}}
PYEXE = re.compile(r'^(python[\d.]*|py|pythonw)(\.exe)?$', re.I)
SHELLS = {'bash', 'sh', 'zsh', 'bash.exe', 'sh.exe'}
INTERP = SHELLS | {'source', '.', 'node', 'node.exe', 'pwsh', 'pwsh.exe', 'powershell', 'powershell.exe', 'cmd', 'cmd.exe', 'call', 'start', '&', 'deno', 'bun'}
RO_CMDS = {'grep', 'egrep', 'fgrep', 'rg', 'cat', 'head', 'tail', 'wc', 'ls', 'dir', 'get-content', 'gc', 'select-string', 'sls', 'findstr',
           'get-childitem', 'gci', 'test-path', 'stat', 'file', 'du', 'md5sum', 'sha256sum', 'sha1sum', 'get-filehash', 'pwd', 'echo', 'printf', 'write-output', 'write-host'}
GIT_RO = {'log', 'show', 'diff', 'grep', 'status', 'rev-parse', 'cat-file', 'ls-files', 'ls-tree', 'for-each-ref', 'blame', 'shortlog', 'describe', 'reflog'}
PREFIX_WORDS = {'env', 'nohup', 'time', 'command', 'exec', 'sudo', 'npx', 'pnpm', 'yarn', 'bunx', 'npm', 'dlx'}
GIT_WRITE = r'(commit|checkout|reset|update-ref|worktree|switch|restore|merge|rebase|cherry-pick|am|apply|stash|push|config|add|rm|mv|tag|branch|init|clean|gc|prune|replace|notes|filter-branch|update-index|read-tree|pull|fetch|remote)'
DEPLOY_RX = re.compile(r'\bwrangler\S*\s+(deploy|publish|rollback|delete|versions\s+(deploy|upload|secret\s+(put|delete|bulk))|triggers\s+deploy|pages\s+(deploy|publish))\b', re.I)
PROD_RX = [re.compile(r'\bwrangler\S*\s+secret\s+(put|delete|bulk)\b', re.I),
           re.compile(r'\bwrangler\S*\s+d1\s+migrations\s+apply\b[^\n]*--remote', re.I),
           re.compile(r'\bwrangler\S*\s+kv(:key|:bulk)?\s+((key|bulk)\s+)?(put|delete)\b', re.I),
           re.compile(r'\bwrangler\S*\s+r2\s+(object|bucket)\s+delete\b', re.I),
           re.compile(r'\bwrangler\S*\s+d1\s+delete\b', re.I)]
SQL_WRITE = re.compile(r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|UPSERT)\b', re.I)
PROTECT = [re.compile(p) for p in (r'\.claude/settings[^/]*\.json', r'/tools-review/\.git(/|$)', r'tools-review/audit_v2/(cache|tickets|ledger|state|drafts|reports)(/|$)',
                                   r'tools-review/audit_v2/enabled$', r'/\.git/(hooks|config$|info)', r'site-packages/[^/]*(\.pth|sitecustomize\.py|usercustomize\.py)$',
                                   r'python312/[^/]*(\.pth|sitecustomize\.py|usercustomize\.py)$', r'\.claude/workflows/review-ticket\.js$')]
PROTECT_TXT = re.compile(r'\.claude[\\/]+settings|gate_approved|audit_v2[\\/]+(cache|tickets|ledger|state|drafts|reports|enabled)\b|tools-review[\\/]+\.git'
                         r'|\.git[\\/]+(hooks|config\b|info)|review-ticket\.js|sitecustomize|usercustomize|site-packages[\\/]+\S*\.pth', re.I)
WHOLE = [(re.compile(r'FromBase64String|\bbase64\s+(-d|--decode)\b[^\n]*\|\s*(bash|sh|zsh|eval|source|python\S*|node|pwsh|powershell|cmd)\b|certutil\S*\s+-decode', re.I), '编码/解码后执行'),
         (re.compile(r'api\.cloudflare\.com\S*/(workers|pages)/|api\.cloudflare\.com\S*/d1/', re.I), '直接调 Cloudflare 部署/D1 接口'),
         (re.compile(r'\bsetx\s+(BOHUI_|AUDIT_|GIT_)|SetEnvironmentVariable\(\s*[\'"](BOHUI_|AUDIT_|GIT_)|\breg(\.exe)?\s+add\s+\S*Environment', re.I), '永久设置 BOHUI_/AUDIT_/GIT_ 环境变量'),
         (re.compile(r'Schedule\.Service|RegisterTaskDefinition|System32[\\/]+Tasks', re.I), '绕过计划任务接口'),
         (re.compile(r'((Disable|Stop|Unregister)-ScheduledTask|schtasks(\.exe)?\s+/(change[^\n]*/disable|end|delete))[^\n]*(Bohui-AuditWatch|Bohui-D1Budget)', re.I), '停审核部/D1 看门狗的计划任务'),
         (re.compile(r'\b(BOHUI_BREAKGLASS|BOHUI_SHIP_NONCE|BOHUI_DEPLOY_MESSAGE)\s*=', re.I), '手设破窗/nonce 变量'),
         (re.compile(r'disableAllHooks', re.I), 'disableAllHooks'),
         (re.compile(r'\bclaude(\.exe)?\b[^\n|;&]*--(setting-sources|settings)\b', re.I), '嵌套 claude 换设置')]
HINT = ('上线只走 ship.sh(见 tools-review/audit_v2/设计-v2.1.md §2.9);线上出事走 ship.sh --urgent 急修,'
        '或 bash <ship.sh 绝对路径> --breakglass "理由" 破窗(§3)')
NOT_DEPLOY = {'deploy_audit.py', 'ship-gate.mjs'}          # 名字像、其实只读的检查脚本
SENSITIVE = re.compile(r'wrangler|deploy|settings|hook_guard|gate_approved|ScheduledTask|schtasks|disableAllHooks|refs/ship', re.I)


def norm(p, cwd):
    p = (p or '').strip().strip('"\'').replace('\\', '/')
    m = re.match(r'^/([a-zA-Z])/(.*)$', p)
    if m:
        p = f'{m.group(1)}:/{m.group(2)}'
    if p.startswith('~/'):
        p = os.path.expanduser('~').replace('\\', '/') + p[1:]
    if not re.match(r'^[a-zA-Z]:/', p):
        p = (cwd or '').replace('\\', '/').rstrip('/') + '/' + p
    return os.path.normpath(p).replace('\\', '/').lower()


def protected(path):
    return any(r.search(path) for r in PROTECT)


# ---------------- 切段(bash 与 PowerShell 各一套引号规则;引号没闭合 → None,按整条原文扫)----------------
def split_cmd(cmd, ps=False):
    segs, raw, words, cur, q, i, started = [], '', [], '', None, 0, False

    def endword():
        nonlocal cur, started
        if started:
            words.append(cur)
        cur, started = '', False

    def endseg():
        nonlocal raw, words
        endword()
        if raw.strip() or words:
            segs.append((raw.strip(), words))
        raw, words = '', []
    n = len(cmd)
    while i < n:
        ch = cmd[i]
        if q == "'":
            if ch == "'":
                if ps and i + 1 < n and cmd[i + 1] == "'":
                    cur += "'"; raw += "''"; i += 2; continue
                q = None
            else:
                cur += ch
            raw += ch; i += 1; continue
        if q == '"':
            if not ps and ch == '\\' and i + 1 < n and cmd[i + 1] in '"\\$`\n':
                cur += cmd[i + 1]; raw += ch + cmd[i + 1]; i += 2; continue
            if ps and ch == '`' and i + 1 < n:
                cur += cmd[i + 1]; raw += ch + cmd[i + 1]; i += 2; continue
            if ps and ch == '"' and i + 1 < n and cmd[i + 1] == '"':
                cur += '"'; raw += '""'; i += 2; continue
            if ch == '"':
                q = None
            else:
                cur += ch
            raw += ch; i += 1; continue
        esc = '`' if ps else '\\'
        if ch == esc and i + 1 < n:
            if cmd[i + 1] in '\r\n':
                i += 2 if cmd[i + 1] == '\n' or cmd[i + 1:i + 3] != '\r\n' else 3
                raw += ' '; continue
            cur += cmd[i + 1]; started = True; raw += ch + cmd[i + 1]; i += 2; continue
        if ch in '\'"':
            q = ch; started = True; raw += ch; i += 1; continue
        if ch == '#' and not started and (i == 0 or cmd[i - 1] in ' \t;&|\n('):
            j = cmd.find('\n', i)
            i = n if j < 0 else j
            continue
        if ch in ' \t\r':
            endword(); raw += ch; i += 1; continue
        if ch == '&' and not ps and ((raw and raw[-1] == '>') or (i + 1 < n and cmd[i + 1] == '>')):
            cur += ch; started = True; raw += ch; i += 1; continue
        if ch == '&' and ps and not (i + 1 < n and cmd[i + 1] == '&'):
            cur += ch; started = True; raw += ch; i += 1; continue
        if ch in ';|\n&':
            endseg()
            i += 2 if cmd[i:i + 2] in ('&&', '||') else 1
            continue
        cur += ch; started = True; raw += ch; i += 1
    if q:
        return None
    endseg()
    return segs


def base(w):
    return re.split(r'[\\/]', w)[-1].lower()


def strip_prefix(words):
    """去掉段首的环境变量赋值(A=b)、env/nohup/time/exec 等前缀词,返回真正的执行体起点。"""
    i = 0
    while i < len(words) and (re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', words[i]) or base(words[i]) in ('env', 'nohup', 'time', 'command', 'exec', 'sudo')
                              or re.match(r'^\$env:[A-Za-z_]\w*=', words[i], re.I)):
        i += 1
    return words[i:]


def wrangler_sub(words):
    """wrangler 子命令(跳过全局选项及其值);返回小写子命令列表(最多 3 个)与全部参数。"""
    for k, w in enumerate(words):
        if re.match(r'^(cf-)?wrangler[\w.@-]*$', base(w)) and not base(w).endswith(('.json', '.toml', '.jsonc')):
            rest, subs, j = words[k + 1:], [], 0
            while j < len(rest) and len(subs) < 3:
                t = rest[j]
                if t.startswith('-'):
                    if '=' not in t and t in ('-c', '--config', '--cwd', '-e', '--env', '--env-file', '--profile', '--name'):
                        j += 1
                    j += 1
                    continue
                subs.append(t.lower().replace('kv:key', 'kv').replace('kv:bulk', 'kv'))
                j += 1
            return subs, rest
    return None, None


def dry_run_ok(args):
    return '--dry-run' in args and not any(re.match(r'^--(no-)?dry-?run=|^--no-dry-?run$|^--dryRun=', a, re.I) for a in args)


def seg_deny(raw, words, cwd, text_only=False):
    """对剩下的段判拦截词;返回原因或 None。"""
    joined = ' '.join(words)
    ws = strip_prefix(words)
    subs, args = wrangler_sub(ws or words)
    if subs is not None:
        s = subs + ['', '', '']
        if s[0] in ('deploy', 'publish', 'delete') or (s[0] == 'versions' and s[1] == 'upload'):
            if not dry_run_ok(args):
                return f'wrangler {s[0]}{" " + s[1] if s[0] == "versions" else ""}(上线只走 ship.sh)'
        if s[0] == 'rollback' or (s[0] == 'versions' and s[1] in ('deploy', 'secret') and s[2] != 'list') or (s[0] == 'triggers' and s[1] == 'deploy') \
                or (s[0] == 'pages' and s[1] in ('deploy', 'publish')):
            return f'wrangler {" ".join(subs)}(回退走 ship.sh --rollback;部署走 ship.sh)'
        if (s[0] == 'secret' and s[1] in ('put', 'delete', 'bulk')) or (s[0] == 'd1' and s[1] == 'migrations' and s[2] == 'apply' and '--remote' in args) \
                or (s[0] == 'kv' and (s[1] in ('put', 'delete') or (s[1] in ('key', 'bulk') and s[2] in ('put', 'delete')))) \
                or (s[0] == 'r2' and s[1] in ('object', 'bucket') and s[2] == 'delete') or (s[0] == 'd1' and s[1] == 'delete'):
            return f'wrangler {" ".join(subs)} 是生产配置变更,走 ship_ops.sh prod(§7.5)'
        if s[0] == 'd1' and s[1] == 'execute' and '--remote' in args and (any(a.startswith('--file') for a in args) or SQL_WRITE.search(joined)):
            return 'wrangler d1 execute --remote 写操作,走 ship_ops.sh prod'
        if any('$' in a for a in args[:3]):
            return 'wrangler 子命令用变量拼(看不清要干什么)'
    for rx in (DEPLOY_RX,) + tuple(PROD_RX):
        for t in (raw, joined):
            m = rx.search(t)
            if m and not (rx is DEPLOY_RX and m.group(1).lower() in ('deploy', 'delete') and dry_run_ok(t.split())):
                return f'命令里有「{m.group(0)[:60]}」(上线/生产变更只走 ship.sh、ship_ops.sh)'
    if re.search(r'\bd1\s+execute\b[^\n]*--remote', joined, re.I) and ('--file' in joined or SQL_WRITE.search(joined)) and re.search(r'wrangler', joined, re.I):
        return 'd1 execute --remote 写操作,走 ship_ops.sh prod'
    if re.search(r'\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b', joined, re.I):
        return 'npm/pnpm run deploy'
    if re.search(r'(^|\s)(deploy|publish|rollback)(\s|$)', joined, re.I) and re.search(r'\$|\(|\+|\biex\b|invoke-expression', raw, re.I):
        return '用变量/表达式拼出来的部署命令(看不清要干什么)'
    if text_only:
        if re.search(r'(^|[\s/\\])deploy[\w.-]*\.(sh|ps1|bat|cmd)\b', joined, re.I) and re.search(r'\b(bash|sh|pwsh|powershell|cmd|call|start)\b', joined, re.I):
            return '文本里要人/别的代理执行部署脚本'
        return None
    # 执行位置:解释器 + 路径,或路径本身在段首
    if ws:
        k = 0
        first = base(ws[0])
        if first in INTERP or PYEXE.match(first) or first in ('&', 'call'):
            k = 1
            while k < len(ws) and ws[k].startswith('-') and ws[k].lower() not in ('/c',):
                k += 1
            if first in ('cmd', 'cmd.exe') and k < len(ws) and ws[k].lower() == '/c':
                k += 1
        target = ws[k] if k < len(ws) else ''
        tb = base(target)
        tp = norm(target, cwd) if target else ''
        if tp in WHITE_PY and WHITE_PY[tp] is not None:
            return f'ticket.py 的这个子命令只由 ship.sh 在流程里调用(直接可用:{"/".join(sorted(WHITE_PY[tp]))})'
        if (k or re.search(r'\.(py|sh|cmd|bat)$', tb)) and tp.startswith(AV2 + '/') and not tp.startswith((AV2 + '/cache/gate_approved/', AV2 + '/redteam/')):
            return f'直接跑闸门工作副本的代码 {target}(批准前不执行,急-8;用 cache/gate_approved/ 下的已批准副本)'
        if k and any(w in ('-c', '-e', '-m') for w in ws[1:k + 1]) and re.search(r'tools-review[\\/]+audit_v2(?![\\/]+(cache[\\/]+gate_approved|redteam))', raw, re.I):
            return '用解释器内联代码碰闸门工作副本(批准前不执行)'
        if re.match(r'^deploy[\w.-]*\.(sh|py|ps1|bat|cmd|mjs|js|cjs)$', tb) and tb not in NOT_DEPLOY:
            return f'直接跑部署脚本 {target}(上线只走 ship.sh / ship_ops.sh)'
        if re.match(r'^(ship[\w.-]*|gate)\.(sh|py|ps1|bat|cmd|mjs|js)$', tb) and tb not in NOT_DEPLOY and norm(target, cwd) not in WHITE_SH:
            return f'{target} 不是白名单里的上线入口'
    return None


def whitelisted(raw, words, cwd):
    if re.search(r'\$\(|`|<\(|>\(', raw):
        return False
    ws = strip_prefix(words)
    if len(ws) >= 2 and base(ws[0]) in SHELLS:
        k = 1
        while k < len(ws) and ws[k].startswith('-'):
            k += 1
        if k < len(ws) and norm(ws[k], cwd) in WHITE_SH:
            rest_raw = ' '.join(ws[k + 1:])
            return seg_deny(rest_raw, ws[k + 1:], cwd, text_only=True) is None and not any(r.search(rest_raw) for r, _ in WHOLE)
    if len(ws) >= 2 and (PYEXE.match(base(ws[0])) or norm(ws[0], cwd).endswith(('/_venv/review/scripts/python.exe', '/python312/python.exe'))):
        k = 1
        while k < len(ws) and ws[k].startswith('-'):
            k += 1
        if k < len(ws):
            p = norm(ws[k], cwd)
            if p in WHITE_PY:
                allowed = WHITE_PY[p]
                return allowed is None or (k + 1 < len(ws) and ws[k + 1] in allowed)
    return False


def readonly(raw, words, whole):
    ws = strip_prefix(words)
    if not ws:
        return False
    b = base(ws[0])
    if re.search(r'\|\s*(bash|sh|zsh|pwsh|powershell|cmd|iex|Invoke-Expression|python\S*|py|node|xargs|eval|source)\b', whole, re.I):
        return False
    red = re.sub(r'\d?>>?\s*(/dev/null|\$null|NUL)\b|\d?>&\d|\|\s*Out-Null', '', raw, flags=re.I)
    if re.search(r'(?<![-=<])>', re.sub(r'(["\'])(?:(?!\1).)*\1', '', red)):
        return False
    if any(re.match(r'^(--pre(-glob)?|-O|--open-files-in-pager|--ext-diff|--textconv|--output|--exec)(=|$)', w) or re.match(r'^-O.', w) for w in ws):
        return False
    if b in ('git', 'git.exe'):
        rest = ws[1:]
        while rest and rest[0] in ('-C', '--no-pager', '-P') or (rest and rest[0].startswith('--git-dir')):
            rest = rest[2:] if rest[0] == '-C' else rest[1:]
        if not rest or rest[0].startswith('-c') or rest[0] not in GIT_RO:
            return False
        if rest[0] == 'reflog' and len(rest) > 1 and rest[1] not in ('show',) and not rest[1].startswith('-'):
            return False
        return True
    if b in SHELLS and len(ws) >= 2 and ws[1] == '-n':
        return True
    return re.sub(r'\.exe$', '', b) in RO_CMDS


def strip_texts(words):
    """git commit -m/-F、gh issue|pr create|comment --body/-b/--title/-t 的参数文字不参与扫描。"""
    ws = strip_prefix(words)
    if not ws:
        return words
    b = base(ws[0])
    out, skip = [], False
    if b in ('git', 'git.exe') and 'commit' in ws:
        keys = ('-m', '-F', '--message', '--file')
    elif b in ('gh', 'gh.exe') and len(ws) > 2 and ws[1] in ('issue', 'pr') and ws[2] in ('create', 'comment', 'edit', 'close'):
        keys = ('--body', '-b', '--title', '-t', '--body-file', '-F')
    else:
        return words
    for w in ws:
        if skip:
            skip = False
            continue
        if w in keys:
            skip = True
            continue
        if any(w.startswith(k + '=') for k in keys if k.startswith('--')) or (w.startswith('-m') and len(w) > 2 and b.startswith('git')):
            continue
        out.append(w)
    return out


def check_shell(cmd, cwd, ps=False):
    whole = cmd
    joined_all = cmd
    segs = split_cmd(cmd, ps)
    if segs is not None:
        joined_all = ' '.join(' '.join(w) for _, w in segs)
    for rx, why in WHOLE:
        if rx.search(whole) or rx.search(joined_all):
            if why == '手设破窗/nonce 变量' and re.search(r'BOHUI_BREAKGLASS', whole, re.I):
                return f'不认环境变量写法的破窗。正确写法:bash <ship.sh 绝对路径> --breakglass "理由"'
            return why
    if ps and re.search(r'(^|\s)-(e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)(\s|$)', whole, re.I) \
            and re.search(r'\b(powershell|pwsh)', whole, re.I):
        return 'PowerShell 编码命令(-EncodedCommand)'
    if re.search(r'\b(powershell|pwsh)(\.exe)?\b[^\n]*\s-(e|ec|enc|encodedcommand)\s', whole, re.I):
        return 'PowerShell 编码命令(-EncodedCommand)'
    if segs is None:                                   # 引号没闭合:整条原文扫
        return seg_deny(whole, whole.split(), cwd) or (('拦截词出现在未闭合的引号里' if SENSITIVE.search(whole) else None))
    all_ro_git = all(readonly(r, w, whole) and base((strip_prefix(w) or [''])[0]).startswith('git') for r, w in segs)
    if re.search(r'refs/ship', whole, re.I) and not all_ro_git:
        return 'refs/ship 只能由 ticket.py 改(只读 git log/show/diff/rev-parse/cat-file/reflog show 可以)'
    for raw, words in segs:
        ws = strip_prefix(words)
        b = base(ws[0]) if ws else ''
        if b in ('cd', 'pushd', 'set-location', 'sl', 'chdir') and len(ws) >= 2:
            cwd = norm(ws[1], cwd)
            continue
        if whitelisted(raw, words, cwd):
            continue
        in_tr = any(norm(w, cwd) == TR or norm(w, cwd).startswith(TR + '/') for w in ws[1:] if not w.startswith('-')) or norm('.', cwd).startswith(TR)
        if b in ('git', 'git.exe') and in_tr and re.search(rf'\bgit(\.exe)?\s+(-C\s+\S+\s+)?(-c\s+\S+\s+)*{GIT_WRITE}\b', ' '.join(ws), re.I):
            return '对 tools-review 仓的 git 写操作(只有 ship_ops.sh gate 能动)'
        if b in ('git', 'git.exe') and len(ws) > 1 and (ws[1] == '-c' or ws[1].startswith('-c')) and not re.match(r'^(core\.quotepath|color\.\w+)=', ws[2] if len(ws) > 2 else ''):
            return 'git -c 可以换 pager/编辑器/钩子(只读命令也不行)'
        if readonly(raw, words, whole):
            continue
        if b in ('rg', 'grep', 'git', 'git.exe') and any(re.match(r'^(--pre(-glob)?|-O|--open-files-in-pager|--ext-diff|--textconv)(=|$)', w) or re.match(r'^-O.', w) for w in ws):
            return f'{b} 带能执行命令的参数(--pre / -O / --ext-diff / --textconv)'
        sw = strip_texts(words)
        sraw = raw if sw is words else ' '.join(sw)
        why = seg_deny(sraw, sw, cwd)
        if why:
            return why
        paths = [norm(w, cwd) for w in ws if not w.startswith('-') and re.search(r'[\\/.]|^[A-Za-z]:|enabled', w, re.I)]
        if (PROTECT_TXT.search(sraw) or any(protected(p) for p in paths)) and b not in ('cd',):
            return '命令动到受保护路径(settings / 闸门副本与缓存 / 台账 / 草稿 / 报告 / .git 钩子 / site-packages 注入)'
        if re.search(r'\bschtasks(\.exe)?\s+/(create|delete)\b|\bschtasks(\.exe)?\s+/change\b(?![^\n]*/(enable|disable)\b)', sraw, re.I) \
                or re.search(r'\b(Register|Set|Unregister)-ScheduledTask\b', sraw, re.I):
            return '计划任务的定义变更走 ops.py register(§7.3)'
    return None


def texts(o):
    if isinstance(o, str):
        return [o]
    if isinstance(o, dict):
        return [t for v in o.values() for t in texts(v)]
    if isinstance(o, list):
        return [t for v in o for t in texts(v)]
    return []


def recent_reports():
    ok = set()
    now = time.time()
    for p in glob.glob(AV2 + '/drafts/*.json'):
        if now - os.path.getmtime(p) > 3 * 86400:
            continue
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        for r in d.get('reports_expected', []):
            ok.add(r.replace('\\', '/').lower())
        if d.get('reports_expected'):
            ok.add('dir:' + os.path.dirname(d['reports_expected'][0]).replace('\\', '/').lower())
    return ok


def unlocked():
    try:
        u = json.load(open(AV2 + '/state/guard_unlock.json', encoding='utf-8'))
        return datetime.datetime.fromisoformat(u['until']) > datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    except Exception:
        return False


def check_write(tool, ti, cwd):
    p = norm(ti.get('file_path') or ti.get('notebook_path') or ti.get('path') or '', cwd)
    body = '\n'.join(texts({k: v for k, v in ti.items() if k not in ('file_path', 'notebook_path', 'path')}))
    if re.search(r'\.claude/settings[^/]*\.json$', p):
        if 'disableallhooks' in body.lower():
            return 'settings 里写 disableAllHooks'
        return None if unlocked() else 'settings 受保护(要改走 ops.py unlock-guard --reason,或创始人手改)'
    if p.startswith(AV2 + '/reports/'):
        ok = recent_reports()
        if p in ok or ('dir:' + os.path.dirname(p) in ok and re.match(r'^(refute-|复核-)', os.path.basename(p))):
            return None
        return '报告只能写到当前草稿列出的文件名(reports_expected / refute-* / 复核-*)'
    if protected(p):
        return f'受保护路径 {p}(闸门副本/缓存/台账/草稿/开关/.git 钩子/site-packages 注入)'
    if re.search(r'\.(sh|py|ps1|bat|cmd|mjs|cjs|js|ts)$', p) and not p.startswith(AV2 + '/') and not p.startswith(TR + '/'):
        why = seg_deny(body, body.split(), cwd, text_only=True)
        if why or re.search(r'api\.cloudflare\.com\S*/(workers|pages)/', body, re.I):
            return f'往脚本 {os.path.basename(p)} 里写部署命令(先写脚本再间接部署 = 绕闸)'
    return None


def decide(ev):
    tool = ev.get('tool_name', '')
    ti = ev.get('tool_input') or {}
    cwd = norm(ev.get('cwd') or os.getcwd(), '')
    if tool in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
        return check_write(tool, ti, cwd)
    if tool in ('Bash', 'Monitor'):
        return check_shell(ti.get('command') or '', cwd, ps=False)
    if tool == 'PowerShell':
        return check_shell(ti.get('command') or '', cwd, ps=True)
    txt = '\n'.join(texts(ti))
    for rx, why in WHOLE:
        if rx.search(txt):
            return why
    return seg_deny(txt, txt.split(), cwd, text_only=True)


def log(ev, why, mode):
    try:
        os.makedirs(AV2 + '/ledger', exist_ok=True)
        ti = ev.get('tool_input') or {}
        s = ti.get('command') or ti.get('file_path') or json.dumps(ti, ensure_ascii=False)
        with open(AV2 + '/ledger/hook.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps({'ts': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).replace(microsecond=0).isoformat(),
                                'session': ev.get('session_id'), 'tool': ev.get('tool_name'), 'text': str(s)[:300], 'why': why, 'mode': mode},
                               ensure_ascii=False) + '\n')
    except Exception:
        pass


def main():
    explain = '--explain' in sys.argv
    raw = sys.stdin.buffer.read().decode('utf-8', 'replace')
    try:
        ev = json.loads(raw)
        why = decide(ev)
    except Exception as e:
        ev, why = {}, (f'hook 自己出错且内容涉及上线/设置({type(e).__name__}),失败即关' if SENSITIVE.search(raw) else None)
    if explain:
        sys.stdout.buffer.write(json.dumps({'decision': 'deny' if why else 'allow', 'reason': why}, ensure_ascii=False).encode('utf-8') + b'\n')
        return 0
    if not why:
        return 0
    if not os.path.exists(AV2 + '/ENABLED'):
        log(ev, why, 'observe')
        return 0
    log(ev, why, 'deny')
    sys.stdout.write(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
                                                        'permissionDecisionReason': f'审核部拦截:{why}。{HINT}'}}))   # 纯 ASCII(\u 转义),不怕控制台代码页
    return 0


if __name__ == '__main__':
    sys.exit(main())
