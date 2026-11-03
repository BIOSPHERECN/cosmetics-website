"""把公司账号 R2 桶(bohui-photo,网站所在账号)里的对象镜像到创始人个人账号的同名桶(平台 beauty2ai 用)。
创始人 2026-09-21 01:4x:「图片是不是没有搬迁到我的 CF」。

来源:公司站 /api/cron/r2-export(PHOTO 绑定列键 + 取对象,x-cron-key 鉴权)。
目标:.env 里的 R2_* 就是创始人账号的 S3 凭证(R2_ACCOUNT_ID=b7362e…),boto3 直接 put;已存在且大小相同的跳过。
用法:python tools/r2-mirror.py [--prefix media/] [--workers 8] [--dry]
纪律:只读公司桶、只增目标桶,不删任何对象;跑完打印「来源/已存在/新拷/失败」四个数。"""
import io, os, sys, json, time, urllib.request, concurrent.futures as cf
import boto3
from botocore.config import Config
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
kv = {}
for ln in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
    ln = ln.strip()
    if ln and not ln.startswith('#') and '=' in ln: k, v = ln.split('=', 1); kv[k] = v.strip().strip('"').strip("'")
SITE = 'https://biosphere-ai.com'; PROXY = 'http://127.0.0.1:7890'
prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else 'media/'
workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 8
dry = '--dry' in sys.argv
opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': PROXY, 'http': PROXY}))
def api(path):
    req = urllib.request.Request(SITE + path, headers={'x-cron-key': kv['CRON_KEY'], 'User-Agent': 'r2-mirror/1'})
    for t in range(4):
        try: return opener.open(req, timeout=120)
        except Exception as e:
            if t == 3: raise
            time.sleep(3 * (t + 1))
os.environ['HTTPS_PROXY'] = PROXY
s3 = boto3.client('s3', endpoint_url=f"https://{kv['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com", aws_access_key_id=kv['R2_ACCESS_KEY_ID'], aws_secret_access_key=kv['R2_SECRET_ACCESS_KEY'], region_name='auto', config=Config(signature_version='s3v4', max_pool_connections=32))
BUCKET = kv.get('R2_BUCKET', 'bohui-photo')
# 1) 列公司桶
keys, cursor = [], None
while True:
    q = f"/api/cron/r2-export?list=1&prefix={urllib.request.quote(prefix)}&n=1000" + (f"&cursor={urllib.request.quote(cursor)}" if cursor else '')
    d = json.load(api(q)); keys += d['keys']
    print(f"  列到 {len(keys)} 个", flush=True)
    if not d.get('truncated'): break
    cursor = d['cursor']
# 2) 目标桶已有(按前缀列一次,比逐个 HEAD 省 9,000 次请求)
have = {}
tok = None
while True:
    r = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=1000, **({'ContinuationToken': tok} if tok else {}))
    for o in r.get('Contents', []): have[o['Key']] = o['Size']
    if not r.get('IsTruncated'): break
    tok = r['NextContinuationToken']
todo = [k for k in keys if have.get(k['key']) != k['size']]
print(f"来源 {len(keys)} · 目标已有 {len(have)} · 待拷 {len(todo)}", flush=True)
if dry: sys.exit(0)
done = fail = 0
def one(k):
    r = api(f"/api/cron/r2-export?get={urllib.request.quote(k['key'])}")
    body = r.read(); ct = r.headers.get('content-type', 'application/octet-stream')
    s3.put_object(Bucket=BUCKET, Key=k['key'], Body=body, ContentType=ct)
    return len(body)
t0 = time.time()
with cf.ThreadPoolExecutor(max_workers=workers) as ex:
    futs = {ex.submit(one, k): k for k in todo}
    for i, f in enumerate(cf.as_completed(futs), 1):
        try: f.result(); done += 1
        except Exception as e: fail += 1; print('  失败', futs[f]['key'], str(e)[:80], flush=True)
        if i % 200 == 0: print(f"  {i}/{len(todo)} · {time.time() - t0:.0f}s", flush=True)
print(f"完成:来源 {len(keys)} · 已存在 {len(keys) - len(todo)} · 新拷 {done} · 失败 {fail} · {time.time() - t0:.0f}s")
