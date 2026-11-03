# -*- coding: utf-8 -*-
"""
定制出图领单员 —— 在创始人本机跑,给 /[lang]/pack(AI 包装设计)出定制外观图。

为什么在本机而不在网站里(2026-09-02 隔离实测):
  Agnes 的 /images/generations 在边缘直接拦掉 Cloudflare Worker 的出口 IP
  (单独调用 4ms 即 429 / error code 1015,根本没到应用层),
  而本机直连正常。所以网站只"下单"进 pack_jobs 表,这里定时领单:
    读 D1 排队任务 → 本机调 Agnes 出图 → 传 R2 → 登记 media → 回写任务状态
  客户页面每 5 秒问一次状态,图一出就自动显示。

用法:python tools/packjob-worker.py        (定时任务每 2 分钟一跑)
纪律:串行出图 + 间隔;每单最多重试 2 次后标 failed,不无限重试烧额度。
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── .env
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
    if m: os.environ.setdefault(m.group(1), m.group(2))

WRANGLER = os.path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")
LOG = os.path.join(ROOT, "node_modules", ".cache", "packjob.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)

def log(msg):
    line = f"[{datetime.now():%m-%d %H:%M:%S}] {msg}"
    print(line)
    with open(LOG, "a", encoding="utf-8") as f: f.write(line + "\n")

def d1(sql):
    """走 wrangler 执行 SQL;成功返回 results 列表。"""
    out = subprocess.run(
        ["node", WRANGLER, "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command", sql],
        cwd=os.path.join(ROOT, "apps", "web"), capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
    )
    txt = (out.stdout or "") + (out.stderr or "")
    i, j = txt.find("["), txt.find("{")
    start = i if (i >= 0 and (j < 0 or i < j)) else j
    if start < 0: raise RuntimeError("wrangler 无 JSON 输出: " + txt[:200])
    # wrangler 在 JSON 之后还会追加摘要文本,只取第一个完整 JSON 值
    d, _ = json.JSONDecoder().raw_decode(txt[start:])
    if isinstance(d, dict) and d.get("error"): raise RuntimeError(str(d["error"])[:200])
    return d[0].get("results", []) if isinstance(d, list) else []

def esc(s): return str(s).replace("'", "''")

# ── 领单
jobs = d1("SELECT id, prompt FROM pack_jobs WHERE status='queued' ORDER BY id LIMIT 3")
if not jobs:
    sys.exit(0)   # 没单就安静退出,别刷日志

# ── Agnes(本机直连)
prov = d1("SELECT base_url, model, api_keys FROM providers WHERE id='agnes-image' AND enabled=1")
if not prov:
    log("agnes-image 未启用,退出"); sys.exit(1)
BASE = prov[0]["base_url"].rstrip("/"); MODEL = prov[0]["model"]
KEY = (prov[0]["api_keys"] or "").split(",")[0].strip()

# ── R2(S3 兼容)
import boto3
from botocore.config import Config
s3 = boto3.client("s3",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    config=Config(signature_version="s3v4", region_name="auto"))
BUCKET = os.environ["R2_BUCKET"]

def gen(prompt):
    req = urllib.request.Request(f"{BASE}/images/generations",
        data=json.dumps({"model": MODEL, "prompt": prompt, "n": 1, "size": "1024x1024"}).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=180).read())
    item = (d.get("data") or [{}])[0]
    if item.get("b64_json"):
        import base64; return base64.b64decode(item["b64_json"]), "image/png"
    u = item.get("url")
    if not u: raise RuntimeError("出图返回无 url/b64")
    r = urllib.request.urlopen(u, timeout=120)
    return r.read(), (r.headers.get("Content-Type") or "image/png").split(";")[0]

for job in jobs:
    jid = job["id"]
    log(f"领单 #{jid}")
    last_err = ""
    for attempt in (1, 2):
        try:
            blob, ctype = gen(job["prompt"])
            # 统一转 webp 1024 方图,和风格库同规格
            try:
                from PIL import Image
                import io
                im = Image.open(io.BytesIO(blob)).convert("RGB")
                im = im.resize((1024, 1024))
                buf = io.BytesIO(); im.save(buf, "WEBP", quality=82); blob = buf.getvalue(); ctype = "image/webp"
                ext = "webp"
            except Exception:
                ext = "png" if "png" in ctype else "jpg"
            key = f"media/packjob/{jid}.{ext}"
            s3.put_object(Bucket=BUCKET, Key=key, Body=blob, ContentType=ctype)
            rows = d1("INSERT INTO media (r2_key, filename, mime, bytes, folder, alt_zh, alt_en, driver) "
                      f"VALUES ('{key}','{jid}.{ext}','{ctype}',{len(blob)},'packjob','定制外包装图 #{jid}','Custom packaging render #{jid}','r2') "
                      "RETURNING id")
            mid = rows[0]["id"]
            d1(f"UPDATE pack_jobs SET status='done', media_id={mid}, done_at=datetime('now') WHERE id={jid}")
            log(f"  完成 #{jid} → media/{mid} ({len(blob)//1024}KB)")
            last_err = ""
            break
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code} {e.read()[:80].decode('utf-8','replace')}"
        except Exception as e:
            last_err = str(e)[:120]
        log(f"  第 {attempt} 次失败 #{jid}: {last_err}")
        time.sleep(8)
    if last_err:
        d1(f"UPDATE pack_jobs SET status='failed', err='{esc(last_err)}', done_at=datetime('now') WHERE id={jid}")
    time.sleep(6)   # 串行 + 间隔,别撞限流
