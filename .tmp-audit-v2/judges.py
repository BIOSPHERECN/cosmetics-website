# 审核部 v2.1 · 机审两家:Laya(本机,免费)+ Jev(TypeSafe,按量付费,创始人 09-24 19:1x 特批,每天输入 200 万 token 硬上限)。
# 用法(ticket.py 调 run();自检:python judges.py selftest):
#   判官状态只有「判了」(过/存疑/拦)和「缺席(原因)」。缺席不算存疑(急-16);只有 Jev「当天额度用尽」仍判存疑并转 Claude 审核员(创始人原话)。
#   Laya 校准前只能判「过/存疑」(block 不论置信都算存疑);Jev decision=block 且置信 ≥0.8 = 机审拦(要一名审核员回应 + 一名反驳员推翻)。
# 材料 ≤6000 字符,送出前脱敏:密钥 → [密钥],邮箱/电话/网址 → 占位;配方、成本类文件只给文件名(§2.3)。
import concurrent.futures, ctypes, io, json, os, re, subprocess, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

CONF = lib.load(lib.CODE + '/judges.json', {}) or {}
Q = CONF.get('questions', {})
JEV_URL = 'https://api.typesafe.ai/v1/systemone'
SECRET_RX = re.compile(r'\bsk-[A-Za-z0-9_\-]{16,}|\bghp_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bAKIA[0-9A-Z]{16}\b|\bBearer\s+[A-Za-z0-9._\-]{20,}'
                       r'|\b(\w*(?:_KEY|_SECRET|_TOKEN|PASSWORD))\s*[:=]\s*["\']?[^\s"\']{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----')
PRIVATE_PATH = re.compile(r'formula|配方|cost|price|lab_materials|_secrets|\.env|^data/', re.I)


def redact(s):
    s = SECRET_RX.sub('[密钥]', s)
    s = re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+', '[邮箱]', s)
    s = re.sub(r'https?://[^\s\'"`)>]+', '[网址]', s)
    return re.sub(r'(?<!\d)(\+?\d[\d\s-]{8,}\d)(?!\d)', '[电话]', s)


def material(head, files_diff, limit=None):
    """head: 站点/级别/说明/diff --stat/第一关命中与风险;files_diff: [(路径, diff 文本)] 已按风险排好序。"""
    limit = limit or CONF.get('jev', {}).get('max_chars', 6000)
    body, omitted, total, given = [], [], 0, 0
    for p, d in files_diff:
        n = d.count('\n')
        total += n
        if PRIVATE_PATH.search(p):
            body.append(f'--- {p}(配方/成本类,只给文件名:{n} 行)')
            omitted.append(p)
            continue
        body.append(redact(d))
        given += n
    txt = redact(head) + '\n' + '\n'.join(body)
    tail = ''
    if len(txt) > limit or omitted:
        cut = txt[:limit - 400]
        shown = [p for p, _ in files_diff if f'b/{p}' in cut or f'--- {p}' in cut]
        miss = [p for p, _ in files_diff if p not in shown] + omitted
        tail = f'\n[没给到内容的文件 {len(miss)} 个] ' + '、'.join(dict.fromkeys(miss))[:360]
        txt = f'[材料已截断:共 {total} 行,给了约 {min(given, cut.count(chr(10)))} 行]\n' + cut
    return (txt + tail)[:limit], bool(tail)


def cpu_pct():
    """本机 WMI 读不到温度(CPU 高温规矩),用 GetSystemTimes 量 1 秒负载代替。"""
    try:
        k = ctypes.windll.kernel32

        class FT(ctypes.Structure):
            _fields_ = [('l', ctypes.c_uint32), ('h', ctypes.c_uint32)]

        def st():
            a, b, c = FT(), FT(), FT()
            k.GetSystemTimes(ctypes.byref(a), ctypes.byref(b), ctypes.byref(c))
            return [(x.h << 32) | x.l for x in (a, b, c)]
        a = st(); time.sleep(1); b = st()
        idle, tot = b[0] - a[0], (b[1] - a[1]) + (b[2] - a[2])
        return round(100 * (1 - idle / tot), 1) if tot else 0.0
    except Exception:
        return 0.0


def _num(a, k, field):
    v = (a.get(k) or {}).get(field)
    return float(v) if isinstance(v, (int, float)) else None


def verdict_of(a, who):
    c = CONF.get(who, {})
    dec = (a.get('decision') or {}).get('choice')
    conf = _num(a, 'decision', 'confidence') or 0.0
    noul = {k: _num(a, k, 'noul') for k in ('cost', 'security', 'compliance')}
    corr = _num(a, 'correctness', 'score')
    out = dict(decision=dec, conf=round(conf, 2), noul={k: (round(v, 2) if v is not None else None) for k, v in noul.items()},
               correctness=(round(corr, 2) if corr is not None else None))
    clean = all(v is not None and v < c.get('noul_max', 0.5) for v in noul.values()) and corr is not None and corr < c.get('correctness_max', 2)
    if dec == 'allow' and conf >= c.get('pass_conf', 0.7) and clean:
        out['verdict'] = '过'
    elif who == 'jev' and dec == 'block' and conf >= c.get('block_conf', 0.8):
        out['verdict'] = '拦'
    elif who == 'laya' and c.get('block_open') and dec == 'block' and conf >= c.get('block_conf', 1.1):
        out['verdict'] = '拦'
    else:
        out['verdict'] = '存疑'
    return out


def absent(why, **kw):
    return dict(status='缺席', verdict=None, reason=why, **kw)


LAYA_PY = r'''
import json, os, sys
os.environ.setdefault('HF_HUB_OFFLINE', '1'); os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
from laya import Router
q = json.load(open(sys.argv[1], encoding='utf-8'))
a = Router(default='multilingual', max_loaded=1).predict({'change': sys.stdin.read()}, q, model='multilingual')
print('@@LAYA@@' + json.dumps(a.get('answers', a), default=str))
'''


def laya(mat):
    t0 = time.time()
    c = CONF.get('laya', {})
    if not lib.LIVE:
        fx = lib.load(lib.rt('state', 'fixture_laya.json'))
        if fx is None:
            return absent('测试副本没有 Laya 夹具')
        if fx.get('cpu', 0) > c.get('cpu_busy_pct', 85):
            return absent(f"CPU 忙 {fx['cpu']}%(夹具)")
        return dict(verdict_of(fx['answers'], 'laya'), status='判了', seconds=0)
    cpu = cpu_pct()
    if cpu > c.get('cpu_busy_pct', 85):
        return absent(f'CPU 负载 {cpu}% > {c.get("cpu_busy_pct", 85)}%(高温规矩:本机读不到温度,按负载)')
    if not os.path.exists(lib.VENV_PY):
        return absent('venv 不在')
    qf = lib.rt('cache', 'tmp', f'laya-q-{os.getpid()}.json')
    lib.dump(qf, Q)
    try:
        env = lib.clean_env(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', OMP_NUM_THREADS='2', MKL_NUM_THREADS='2')
        p = subprocess.run([lib.VENV_PY, '-c', LAYA_PY, qf], input=mat.encode('utf-8'), capture_output=True, env=env,
                           timeout=c.get('timeout', 240), creationflags=getattr(subprocess, 'BELOW_NORMAL_PRIORITY_CLASS', 0))
        m = re.search(rb'@@LAYA@@(\{.*\})', p.stdout)
        if not m:
            return absent(f'Laya 出错 exit {p.returncode}:{p.stderr.decode("utf-8", "replace")[-200:]}')
        return dict(verdict_of(json.loads(m.group(1)), 'laya'), status='判了', seconds=round(time.time() - t0))
    except subprocess.TimeoutExpired:
        return absent(f'Laya 超过 {c.get("timeout", 240)} 秒没结果')
    finally:
        os.path.exists(qf) and os.remove(qf)


def _key():
    try:
        m = re.search(r'^\s*TYPESAFE_API_KEY\s*=\s*"?([^"\r\n]+)"?', io.open('F:/0cosmetic/cosmetic-sites/.env', encoding='utf-8').read(), re.M)
        return m.group(1).strip() if m else ''
    except OSError:
        return ''


def jev_budget():
    b = lib.load(lib.rt('state', 'jev_budget.json'), {}) or {}
    day = f'{lib.now():%Y-%m-%d}'
    return b if b.get('day') == day else {'day': day, 'used_in': 0, 'calls': 0}


def jev(mat):
    c = CONF.get('jev', {})
    cap = c.get('daily_input_cap', 2_000_000)
    b = jev_budget()
    if b.get('disabled'):
        return absent(f"当天停用:{b['disabled']}")
    body = json.dumps({'state': mat, 'model': 'jev-latest', 'questions': Q}, ensure_ascii=False)
    est = len(mat) + len(json.dumps(Q, ensure_ascii=False))
    if b['used_in'] + est > cap:
        return dict(status='判了', verdict='存疑', reason=f"当天额度用尽({b['used_in']:,}+{est:,} > {cap:,})", quota=True, day_used=b['used_in'])
    t0 = time.time()
    if not lib.LIVE:
        fx = lib.load(lib.rt('state', 'fixture_jev.json'))
        if fx is None:
            return absent('测试副本没有 Jev 夹具')
        err, d, rid = fx.get('error'), fx, 'fixture'
    else:
        key = _key()
        if not key:
            return absent('cosmetic-sites/.env 里没有 TYPESAFE_API_KEY')
        err, d, rid = None, None, None
        req = urllib.request.Request(JEV_URL, data=body.encode('utf-8'), method='POST',
                                     headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        for px in (None, lib.PROXY):
            try:
                op = urllib.request.build_opener(urllib.request.ProxyHandler({'https': px} if px else {}))
                with op.open(req, timeout=c.get('timeout', 20)) as r:
                    raw = r.read()
                    rid = r.headers.get('x-request-id') or r.headers.get('cf-ray')
                d = json.loads(raw.decode('utf-8'))
                d['_sha'] = lib.sha256(raw)
                err = None
                break
            except urllib.error.HTTPError as e:
                err = e.code
                break
            except Exception as e:
                err = f'{type(e).__name__}'
    if err in (401, 402) or (isinstance(err, int) and err == 403):
        b['disabled'] = f'HTTP {err}(key 失效或余额不足;零付费铁令:不建议充值)'
        lib.dump(lib.rt('state', 'jev_budget.json'), b)
        lib.issue(f'[审核部/红][上线] Jev 返回 {err},当天停用', f'Jev(TypeSafe)返回 HTTP {err}。当天停用,审核单记「Jev 缺席」。零付费铁令:不建议充值,等创始人定。')
        return absent(f'HTTP {err},当天停用')
    if err is not None or not d or not d.get('answers'):
        return absent(f'Jev 调用失败:{err or "无 answers"}')
    u = d.get('usage') or {}
    used = next((v for k, v in (u.items() if isinstance(u, dict) else []) if isinstance(v, int) and re.search('input|prompt', k)), est)
    b['used_in'] += used
    b['calls'] += 1
    try:
        lib.dump(lib.rt('state', 'jev_budget.json'), b)
        ref = lib.ledger_append('jev_calls.jsonl', {'request_id': rid or d.get('id'), 'usage': u, 'resp_sha256': d.get('_sha'), 'tokens_in': used, 'day_used': b['used_in']})
    except OSError as e:
        b['disabled'] = f'账本写不进:{e}'
        return dict(status='判了', verdict='存疑', reason='Jev 账本写不进,当天停用')
    return dict(verdict_of(d['answers'], 'jev'), status='判了', tokens_in=used, day_used=b['used_in'], seconds=round(time.time() - t0, 1),
                call_ref=f"ledger/jev_calls.jsonl@{ref['ts']}", request_id=rid)


def run(mat, partial=False, tier='L2'):
    """两家并行。材料截断而级别在 L2 以上时 Jev 的「过」降为存疑(判定映射表)。"""
    with concurrent.futures.ThreadPoolExecutor(2) as ex:
        fl, fj = ex.submit(laya, mat), ex.submit(jev, mat)
        res = {'laya': fl.result(), 'jev': fj.result()}
    if partial and tier in ('L2', 'L3') and res['jev'].get('verdict') == '过':
        res['jev'].update(verdict='存疑', reason='材料截断且级别 ≥ L2')
    for k in res:
        res[k]['partial'] = partial
    return res


def selftest():
    a = {'decision': {'choice': 'allow', 'confidence': 0.91}, 'cost': {'noul': 0.2}, 'security': {'noul': 0.04}, 'compliance': {'noul': 0.02}, 'correctness': {'score': 0}}
    assert verdict_of(a, 'jev')['verdict'] == '过'
    assert verdict_of(dict(a, decision={'choice': 'block', 'confidence': 0.9}), 'jev')['verdict'] == '拦'
    assert verdict_of(dict(a, decision={'choice': 'block', 'confidence': 0.3}), 'laya')['verdict'] == '存疑'   # T7
    assert verdict_of(dict(a, decision={'choice': 'block', 'confidence': 0.99}), 'laya')['verdict'] == '存疑'  # Laya 未校准不开放机审拦
    assert verdict_of(dict(a, cost={'noul': 0.62}), 'jev')['verdict'] == '存疑'
    m, part = material('站点 x', [('apps/web/src/a.ts', '+const k = "sk-' + 'A' * 30 + '"\n+mail a@b.com https://x.y/z\n'), ('data/cost.json', '+1\n')])
    assert '[密钥]' in m and '[邮箱]' in m and '[网址]' in m and 'sk-AAAA' not in m and '配方/成本类' in m and part
    print('judges 自检 ok')


if __name__ == '__main__':
    if sys.argv[1:2] == ['selftest']:
        selftest()
    elif sys.argv[1:2] == ['probe']:            # 实测两家在线:python judges.py probe(一次 Jev 调用约 1 千 token)
        mat = '站点 测试 · 级别 L1 · 说明:审核部上线探针\n+// 只改注释\n'
        print(json.dumps(run(mat, tier='L1'), ensure_ascii=False, indent=1))
