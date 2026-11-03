# 审核部 v2.1 · 冒烟(设计 §4.1、§4.2)
# 用法:python smoke.py --worker <名> --mode deploy|baseline|hourly [--no-rollback] [--fixture <json>]
#   deploy/baseline:每个 URL 加 ?kk=<时间戳> 破缓存(?cb= 不进缓存键,破不了);hourly:走缓存,只挑 hourly 条目,不查 deploy_only(搜索页省 D1)。
#   deploy 另跑 sites.json 的 post_checks(公司站 ship-gate.mjs、平台 smoke.sh),失败只报不回退。
# 退出码:0 全过;5 关键 URL(crit)≥2 条 5xx/超时且 30 秒后直连与 7890 重试仍失败、对照地址通、部署前基线是好的 → 可自动回退;
#         6 其他失败(非关键页、post_checks);7 本机网络异常(对照地址都不通,不回退);8 线上页面出现红线词(不回退,按红项报)。
# --fixture 只在红队临时副本里认(夹具:{url: {"status":…, "location":…, "body":…}}),正式运行忽略。
import argparse, datetime, io, json, os, re, subprocess, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

def _probe():
    """探针 secret 只从本机 .env 读进内存(不写文件、不打印);两站同一个值。没有就返回空,中间件不认,等于旧行为。"""
    for p in ('F:/0cosmetic/cosmetic-sites/.env',):
        try:
            m = re.search(r'^\s*PROBE_SECRET\s*=\s*"?([^"\r\n]+)"?', io.open(p, encoding='utf-8').read(), re.M)
            if m:
                return m.group(1).strip()
        except OSError:
            pass
    return ''


PROBE = _probe()
UA = {'browser': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      'tool': 'curl/8.4.0'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url, ua, proxy=None, fixture=None):
    if fixture is not None:
        f = fixture.get(url.split('?kk=')[0].split('&kk=')[0])
        if f is None:
            return 200, '', '<h1>ok</h1>'
        return f.get('status', 200), f.get('location', ''), f.get('body', '')
    op = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({'https': proxy, 'http': proxy} if proxy else {}))
    hd = {'User-Agent': UA[ua], 'Accept': 'text/html,*/*'}
    # 09-25:公司站(bohui-web)破缓存改靠探针头(C1 起 ?kk= 会被 301 掉;带对 secret 才不跳、不走缓存)。平台站仍用 ?kk=
    if PROBE and re.match(r'https://(www\.)?(biosphere-ai|beauty2oem)\.com/', url) and ('?kk=' in url or '&kk=' in url):
        hd['x-bohui-probe'] = PROBE
        url = re.sub(r'[?&]kk=\d+$', '', url)
    req = urllib.request.Request(url, headers=hd)
    try:
        with op.open(req, timeout=30) as r:
            return r.status, r.headers.get('Location', ''), r.read(2_000_000).decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Location', '') if e.headers else '', (e.read(200_000) or b'').decode('utf-8', 'replace')
    except Exception as e:
        return 0, '', f'{type(e).__name__}: {e}'


def judge(it, st, loc, body, forbid_sets):
    errs = []
    exp = it.get('expect_any') or [it.get('expect', 200)]
    if st not in exp:
        errs.append(f'状态 {st} ≠ {exp}')
    want_loc = it.get('location_any') or ([it['location']] if it.get('location') else [])
    if want_loc and not any(loc.split('?')[0].endswith(x) for x in want_loc):
        errs.append(f"跳转到 {loc or '(无)'} ≠ …{'/'.join(want_loc)}")
    if st == 200:
        for m in it.get('must', []):
            if m not in body:
                errs.append(f'缺 {m}')
        if it.get('must_any') and not any(m in body for m in it['must_any']):
            errs.append(f"缺 {'/'.join(it['must_any'])}")
        fb = it.get('forbid', [])
        fb = forbid_sets.get(fb[1:], []) if isinstance(fb, str) and fb.startswith('@') else fb
        bad = [m for m in fb if m in body]
        if bad:
            errs.append(f'红线标记出现:{bad}')
        if it.get('h1') is not None and len(re.findall(r'<h1[\s>]', body)) != it['h1']:
            errs.append(f"<h1 数量 {len(re.findall(r'<h1[\\s>]', body))} ≠ {it['h1']}")
        if it.get('fresh'):
            m = re.search(re.escape(it['fresh']) + r'(\d{4}-\d{2}-\d{2})', body)
            today = lib.now().date()
            if not m or (today - datetime.date.fromisoformat(m.group(1))).days > 1:
                errs.append(f"「{it['fresh']}日期」不是今天或昨天:{m.group(1) if m else '没找到'}")
    return errs


def control_ok(url, fixture):
    if fixture is not None:
        return fixture.get('__control__', {}).get('status', 200) == 200
    return any(fetch(url, 'browser', px)[0] == 200 for px in (None, lib.PROXY))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--worker', required=True)
    ap.add_argument('--mode', default='deploy', choices=['deploy', 'baseline', 'hourly'])
    ap.add_argument('--no-rollback', action='store_true')
    ap.add_argument('--fixture')
    a = ap.parse_args()
    c = lib.cfg()
    w = lib.wcfg(a.worker)
    fx = lib.load(a.fixture) if (a.fixture and not lib.LIVE) else None
    items = [it for it in w.get('smoke', []) if (a.mode != 'hourly' or it.get('hourly')) and not (a.mode == 'hourly' and it.get('deploy_only'))]
    if not items:
        print(f'[冒烟] {a.worker} 没配冒烟清单(第二批补),跳过')
        return 0
    kk = str(int(time.time()))
    res = []
    for it in items:
        url = it['url']
        if a.mode != 'hourly':
            url += ('&' if '?' in url else '?') + 'kk=' + kk
        st, loc, body = fetch(url, it.get('ua', 'browser'), fixture=fx)
        res.append({'url': it['url'], 'status': st, 'errs': judge(it, st, loc, body, c.get('forbid_sets', {})), 'crit': bool(it.get('crit'))})
    bad = [r for r in res if r['errs']]
    for r in bad:
        print(f"   ✗ {r['url']}:{';'.join(r['errs'])}")
    print(f"[冒烟 {a.mode}] {a.worker}:{len(res) - len(bad)}/{len(res)} 过")
    out = {'at': lib.iso(), 'worker': a.worker, 'mode': a.mode, 'results': res}
    if a.mode == 'baseline':
        lib.dump(lib.rt('state', f'smoke_baseline_{a.worker}.json'), out)
        return 0 if not bad else 6
    lib.dump(lib.rt('logs', f'smoke-{a.worker}-{lib.now():%Y%m%d-%H%M%S}.json'), out)
    code = 0
    crit = [r for r in bad if r['crit'] and (r['status'] >= 500 or r['status'] == 0)]
    if len(crit) >= 2:
        if not fx:
            time.sleep(30)
        still = []
        for r in crit:
            it = next(i for i in items if i['url'] == r['url'])
            url = it['url'] + ('&' if '?' in it['url'] else '?') + 'kk=' + str(int(time.time()))
            codes = [fetch(url, it.get('ua', 'browser'), px, fx)[0] for px in (None, lib.PROXY)]
            if all(c == 0 or c >= 500 for c in codes):
                still.append(r)
        base = {r['url']: r for r in (lib.load(lib.rt('state', f'smoke_baseline_{a.worker}.json'), {}) or {}).get('results', [])}
        pre_bad = [r['url'] for r in still if base.get(r['url'], {}).get('errs')]
        if len(still) >= 2 and not control_ok(c.get('control_url', 'https://www.cloudflare.com/cdn-cgi/trace'), fx):
            print('   对照地址直连和 7890 都不通 → 判「本机网络异常」,不回退,只开单')
            code = 7
        elif len(still) - len(pre_bad) >= 2:
            code = 5
            prev = (lib.load(lib.rt('state', f'live_{a.worker}.json'), {}) or {}).get('version')
            print(f"   关键页 {len(still)} 条仍 5xx/超时{'(不自动回退:急修/破窗)' if a.no_rollback else f',将回退到 {prev}'}")
        elif still:
            print(f'   关键页失败 {len(still)} 条,其中 {len(pre_bad)} 条部署前就坏(外部原因:D1 7500 / 上游),不回退')
            code = 6
    if not code and any('红线标记出现' in e for r in bad for e in r['errs']):
        code = 8                     # 线上页面出现红线词:不回退(不是代码崩),但按红项报
    if not code and bad:
        code = 6
    if a.mode == 'deploy' and not fx:
        for cmd in w.get('post_checks', []):
            cmd = re.sub(r'^bash ', f'"{lib.BASH}" ', cmd)          # PATH 上的 bash 可能是 WSL 的
            p = subprocess.run(cmd, shell=True, cwd=w['repo'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900,
                               env=lib.clean_env())
            print(f'   post_check「{cmd}」exit {p.returncode}' + ('' if p.returncode == 0 else ':' + (p.stdout + p.stderr)[-300:]))
            if p.returncode and not code:
                code = 6
    return code


if __name__ == '__main__':
    sys.exit(main())
