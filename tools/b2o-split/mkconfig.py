#!/usr/bin/env python3
"""beauty2oem-web 的部署配置 = 适配器产物 dist/server/wrangler.json 的结构项 + apps/web/wrangler.b2o.jsonc。
照平台 tools/platform/mkconfig.py 的路子(构建一次、从产物生成、-c 部署),多三道闸:
  ① 绑定白名单:产物里的绑定一律丢掉,只用 wrangler.b2o.jsonc 里列的(公司库、AI、Vectorize、R2 都带不过来);
  ② 认 id 不认名:生成的配置里出现公司库 / 平台库 / 公司 Worker 名 / 两边的 SESSION KV,直接退出;
  ③ --live(带域名 + Cron)要求 migrate.py verify 在 24 小时内通过 —— 数据没迁完,域名不许挪过来。
用法(在 cosmetic-sites 根目录,先 npm run build):
  python tools/b2o-split/mkconfig.py            预发布:无域名、无 Cron → dist/server/wrangler.b2o.json
  python tools/b2o-split/mkconfig.py --live     切换:并入 env.live 的域名与 Cron
  python tools/b2o-split/mkconfig.py --check    占位符换成全零 id,只为本地 `wrangler deploy --dry-run` 验结构 → wrangler.b2o.check.json
  python tools/b2o-split/mkconfig.py --selftest 离线自检(不读产物、不连网)"""
import io, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, 'apps', 'web')
OVERLAY = os.path.join(WEB, 'wrangler.b2o.jsonc')
SERVER = os.path.join(WEB, 'dist', 'server')
VERIFIED = os.path.join(ROOT, 'data', 'dump', 'b2o-split', 'verified.json')

# 从产物里只继承这些「结构项」;其余(全部绑定、vars 之外的一切)只认 overlay。产物将来多出新结构项会被丢掉 ——
# 宁可 dry-run 报错,也不让一个没过目的绑定悄悄带进新站。
KEEP = ('main', 'rules', 'no_bundle', 'find_additional_modules', 'base_dir', 'assets', 'images', 'compatibility_date',
        'compatibility_flags', 'jsx_factory', 'jsx_fragment', 'python_modules', 'upload_source_maps', 'limits', 'observability', 'placement')
FORBID_DB = {'ea5b0da4-7f96-48bf-8fca-dc7193a9596d': '公司生产库 bohui-cms-v2', 'f5010e65-8c6d-419f-8bf0-3e41762463f6': '平台库 bohui-cms-v2'}
FORBID_KV = {'a461419944d4422cb81e374a391632ce': 'bohui-web 的 SESSION', '81c04d03823c40a98300f10977dc73a0': '平台的 SESSION'}
FORBID_NAME = {'bohui-web', 'beauty2ai', 'bohui-gateway'}
HOSTS = {'beauty2oem.com', 'www.beauty2oem.com'}
ZERO = '00000000-0000-0000-0000-000000000000'


def jsonc(path):
    """只剥整行 // 注释(URL 里的 // 不受影响);行尾注释不支持,见 wrangler.b2o.jsonc 顶部说明。"""
    return json.loads('\n'.join(l for l in io.open(path, encoding='utf-8') if not l.lstrip().startswith('//')))


def env_account():
    for l in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        k, _, v = l.strip().partition('=')
        if k.strip() == 'CLOUDFLARE_ACCOUNT_ID':
            return v.strip().strip('"\'')
    return None


def build(dist, ov, live=False, check=False, account=None):
    c = {k: dist[k] for k in KEEP if k in dist}
    c['name'] = ov['name']
    if account:
        c['account_id'] = account
    c['workers_dev'] = ov.get('workers_dev', False)
    c['preview_urls'] = ov.get('preview_urls', False)
    c['vars'] = {**dist.get('vars', {}), **ov.get('vars', {})}
    for k, v in ov.items():
        if k not in ('name', 'workers_dev', 'preview_urls', 'vars', 'env', 'account_id'):
            c[k] = json.loads(json.dumps(v))           # 绑定:只认 overlay
    if live:                                           # 切换那一次;切换成功后把 env.live 两项提到 overlay 顶层,以后不带 --live 也照常带域名和 Cron
        c['routes'] = ov['env']['live']['routes']
        c['triggers'] = ov['env']['live']['triggers']
    c.setdefault('triggers', {'crons': []})            # 预发布显式空:不跑 Cron(wrangler 对 schedules 是 PUT,空表 = 清空)
    txt = json.dumps(c, ensure_ascii=False, indent=2)
    if check:
        txt = re.sub(r'<待建[^>]*>', lambda m: ZERO if 'session' not in m.group(0) else '0' * 32, txt)
    guard(json.loads(txt), live, check)
    return txt


def guard(c, live, check):
    bad = []
    if c.get('name') in FORBID_NAME: bad.append(f"Worker 名是 {c['name']}")
    for d in c.get('d1_databases', []):
        if d.get('database_id') in FORBID_DB: bad.append(f"D1 指向{FORBID_DB[d['database_id']]}")
        if d.get('database_name') == 'bohui-cms-v2': bad.append('D1 名是 bohui-cms-v2(同名库地雷)')
        if not check and (d.get('database_id') in (None, ZERO) or '<' in str(d.get('database_id'))): bad.append('D1 id 还是占位符')
    for k in c.get('kv_namespaces', []):
        if k.get('id') in FORBID_KV: bad.append(f"KV 指向{FORBID_KV[k['id']]}")
        if not check and (not k.get('id') or '<' in str(k.get('id')) or set(str(k.get('id'))) == {'0'}): bad.append('KV id 还是占位符')
    for r in c.get('routes', []):
        host = (r if isinstance(r, str) else r.get('pattern', '')).split('/')[0]
        if host not in HOSTS: bad.append(f'路由 {host} 不是 beauty2oem 的域名')
    if c.get('workers_dev') is not False or c.get('preview_urls') is not False: bad.append('workers_dev / preview_urls 没关')
    if (c.get('vars') or {}).get('SITE_MODE') != 'b2o': bad.append('vars.SITE_MODE 不是 b2o')
    if not c.get('main') or not c.get('assets'): bad.append('产物里没有 main / assets(先 npm run build)')
    if live and not check:
        try:
            v = json.load(io.open(VERIFIED, encoding='utf-8'))
            if time.time() - v['ts'] > 86400: bad.append(f'verified.json 超过 24 小时({v.get("at")}),先重跑 migrate.py verify')
        except (OSError, ValueError, KeyError):
            bad.append('没有 data/dump/b2o-split/verified.json:数据没迁完、没对账,不许带域名上线')
    if bad:
        sys.exit('拒绝生成:\n  - ' + '\n  - '.join(bad))


def main():
    a = set(sys.argv[1:])
    if '--selftest' in a:
        return selftest()
    live, check = '--live' in a, '--check' in a
    src = os.path.join(SERVER, 'wrangler.json')
    if not os.path.exists(src):
        sys.exit(f'没有 {src}:先在仓库根目录 npm run build')
    txt = build(json.load(io.open(src, encoding='utf-8')), jsonc(OVERLAY), live, check, None if check else env_account())
    dst = os.path.join(SERVER, 'wrangler.b2o.check.json' if check else 'wrangler.b2o.json')
    io.open(dst, 'w', encoding='utf-8', newline='\n').write(txt)
    c = json.loads(txt)
    print('wrote', os.path.relpath(dst, ROOT), '| name', c['name'], '| D1', [d['database_name'] for d in c.get('d1_databases', [])],
          '| 绑定', sorted(k for k in c if isinstance(c[k], list) and k not in ('rules', 'compatibility_flags')),
          '| 路由', [r['pattern'] for r in c.get('routes', [])] or '无', '| Cron', c['triggers']['crons'] or '无')


def selftest():
    dist = {'name': 'bohui-web', 'main': 'entry.mjs', 'assets': {'binding': 'ASSETS', 'directory': '../client'}, 'no_bundle': True,
            'rules': [{'type': 'ESModule', 'globs': ['**/*.mjs']}], 'images': {'binding': 'IMAGES'}, 'compatibility_date': '2026-08-01',
            'vars': {'TURNSTILE_SITE_KEY': 'k', 'MEDIA_DRIVER': 'r2-s3'}, 'triggers': {'crons': ['*/10 * * * *']},
            'd1_databases': [{'binding': 'DB', 'database_name': 'bohui-cms-v2', 'database_id': 'ea5b0da4-7f96-48bf-8fca-dc7193a9596d'}],
            'kv_namespaces': [{'binding': 'SESSION', 'id': 'a461419944d4422cb81e374a391632ce'}], 'vectorize': [{'binding': 'VECTORIZE', 'index_name': 'bohui-kb'}],
            'ai': {'binding': 'AI'}, 'r2_buckets': [{'binding': 'PHOTO', 'bucket_name': 'bohui-photo'}], 'services': [{'binding': 'X', 'service': 'bohui-web'}]}
    ov = jsonc(OVERLAY)
    c = json.loads(build(dist, ov, check=True))
    assert c['name'] == 'beauty2oem-web' and c['main'] == 'entry.mjs' and c['images'] == {'binding': 'IMAGES'}
    assert not {'ai', 'vectorize', 'r2_buckets', 'services'} & set(c), '公司绑定漏进来了'
    assert c['d1_databases'][0]['database_name'] == 'beauty2oem-db' and c['d1_databases'][0]['database_id'] == ZERO
    assert c['vars'] == {'TURNSTILE_SITE_KEY': 'k', 'MEDIA_DRIVER': 'r2-s3', 'SITE_MODE': 'b2o', 'CACHE_V': 'b2o1', 'ALLOWED_HOSTS': 'beauty2oem.com,www.beauty2oem.com'}
    assert c['triggers'] == {'crons': []} and 'routes' not in c, '预发布不许带域名 / Cron'
    c = json.loads(build(dist, ov, live=True, check=True))
    assert [r['pattern'] for r in c['routes']] == ['beauty2oem.com'] and c['triggers']['crons'] == ['*/10 * * * *']
    for bad_ov in ({**ov, 'name': 'bohui-web'},
                   {**ov, 'd1_databases': [{'binding': 'DB', 'database_name': 'bohui-cms-v2', 'database_id': 'ea5b0da4-7f96-48bf-8fca-dc7193a9596d'}]},
                   {**ov, 'kv_namespaces': [{'binding': 'SESSION', 'id': 'a461419944d4422cb81e374a391632ce'}]},
                   {**ov, 'env': {'live': {'routes': [{'pattern': 'biosphere-ai.com', 'custom_domain': True}], 'triggers': {'crons': []}}}}):
        try:
            build(dist, bad_ov, live=True, check=True)
            raise AssertionError('该拒绝的没拒绝')
        except SystemExit:
            pass
    try:                                                # 不带 --check:占位符必须被拒
        build(dist, ov)
        raise AssertionError('占位符没被拒')
    except SystemExit as e:
        assert '占位符' in str(e)
    print('mkconfig selftest ok')


if __name__ == '__main__':
    main()
