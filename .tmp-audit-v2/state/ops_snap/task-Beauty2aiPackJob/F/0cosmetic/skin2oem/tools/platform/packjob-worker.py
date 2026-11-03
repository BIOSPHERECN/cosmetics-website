# -*- coding: utf-8 -*-
"""
定制出图领单员 · 平台版 v2(beauty2ai,2026-09-24 在线设计第0批)—— 网站当场出不来的单,本机用 Agnes 补出。

分工(施工图 v2 §0、§10):
  · 网站 /api/ai/pack-run 在 Worker 里同步调商汤 U1.5 / U1 Fast(从 Worker 调得通)。
  · Agnes 出图在边缘拦 Worker 出口 IP(1015),只能本机打 —— 商汤失败、超时或全站当日名额满的单留在队列,这里领走。
v1(09-21,已移到 _备份/在线设计第0批-0924/)为什么停了:领单走 wrangler + OAuth,09-21 起 236 次领单全失败
(196 次 wrangler 输出不是 JSON、28 次 "The given account is not valid"、2 次找不到 dist_* 目录),
而且 R2 用 .env 的 boto3 凭证写 —— 本机两套 R2 凭证分属两个同名 bohui-photo 桶,写错过桶。
v2 不碰 wrangler、不碰 R2 凭证,只走网站现成的派工/交工接口(与 i18n_local.py 同一套口径):
  GET  {站}/api/cron/pack-jobs              领单(最多 2 条,服务端原子标 processing、attempts+1,满 3 次置 failed)
  POST {站}/api/cron/pack-jobs {id, b64}    交图字节,网站用 PHOTO 绑定写 R2、登记 media(folder=packjob,私有)
  POST {站}/api/cron/pack-jobs {id, err}    这一单本机也出不来,置 failed(客户页面显示「没出成」,可重试或发询盘)
密钥:CRON_KEY = .env.founder;出图 key = 本机网关配置 ~/.bohui-gateway/config.json(sync-config.py 从 gw_keys 同步)。不打印任何 key。
用法:python tools/platform/packjob-worker.py            领一轮(计划任务 Beauty2aiPackJob 每 2 分钟;空队列安静退出)
      python tools/platform/packjob-worker.py --check    上线前自检:配置齐不齐、网站与 Agnes 通不通(不领单、不出图、不耗额度)
"""
import base64, io, json, os, sys, time, urllib.error, urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SITE = os.environ.get("B2AI_SITE", "https://beauty2ai.com").rstrip("/")
LOG = os.path.join(ROOT, "node_modules", ".cache", "packjob-beauty2ai.log")
UA = "bohui-packjob/2"
LINES = ("agnes-image", "sensenova-u1fast")   # 本机出图顺序:Agnes 优先(网站那边已经试过商汤了),商汤兜底


def log(msg):
    line = f"[{datetime.now():%m-%d %H:%M:%S}] {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_conf():
    fenv = dict(l.strip().split("=", 1) for l in io.open(os.path.join(ROOT, ".env.founder"), encoding="utf-8")
                if "=" in l and not l.lstrip().startswith("#"))
    cron = fenv.get("CRON_KEY", "").strip().strip('"')
    cfg = json.load(io.open(os.path.expanduser("~/.bohui-gateway/config.json"), encoding="utf-8"))
    ch = {c["id"]: c for c in cfg.get("channels", [])}
    lines = [ch[x] for x in LINES if x in ch and ch[x].get("keys")]
    return cron, lines


# 本机出网路子会变(记忆:直连 / 7890 / 1082 轮流断)—— 每个请求先直连,连接层失败再走代理。HTTP 状态码错误不换路子。
OPENERS = [urllib.request.build_opener(urllib.request.ProxyHandler({}))] + [
    urllib.request.build_opener(urllib.request.ProxyHandler({"http": f"http://127.0.0.1:{p}", "https": f"http://127.0.0.1:{p}"}))
    for p in (7890, 1082)]


def http(url, body=None, headers=None, timeout=60):
    """返回 (状态码, 响应字节)。连接不上抛最后一个异常。"""
    data = json.dumps(body).encode() if body is not None else None
    last = None
    for op in OPENERS:
        req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET",
                                     headers={"User-Agent": UA, "Content-Type": "application/json", **(headers or {})})
        try:
            with op.open(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except urllib.error.URLError as e:   # 只有「连不上」才换路子;读超时等已发出的请求直接抛,免得同一张图出两次
            last = e
    raise last


def site(cron, body=None):
    st, raw = http(SITE + "/api/cron/pack-jobs", body, {"x-cron-key": cron}, timeout=90)
    try:
        return st, json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return st, {"ok": False, "raw": raw[:120].decode("utf-8", "replace")}


def gen(line, key, prompt):
    """出一张,返回图字节。商汤与 Agnes 同一 images/generations 形状,参数差异同 lib/fleet.ts image()。"""
    sense = "sensenova" in line["base_url"] or str(line.get("model", "")).startswith("sensenova-")
    body = {"model": line["model"], "prompt": prompt, "n": 1, "size": "1024x1024"}   # ★ n 必须为 1(Agnes n>1 直接 400)
    if sense:
        body.update(size="2048x2048" if "u1-fast" in line["model"] else "1024x1024", response_format="url", watermark=False)
    st, raw = http(line["base_url"].rstrip("/") + "/images/generations", body, {"Authorization": "Bearer " + key}, timeout=200)
    if st != 200:
        raise RuntimeError(f"HTTP {st} {raw[:100].decode('utf-8', 'replace')}")
    item = (json.loads(raw).get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if not item.get("url"):
        raise RuntimeError("出图返回里没有 url / b64_json")
    st, blob = http(item["url"], timeout=120)
    if st != 200:
        raise RuntimeError(f"取图 HTTP {st}")
    return blob


def shrink(blob):
    """统一转 1024 方图 webp(和风格库同规格,也让交图请求小于 1MB);没有 PIL 或转不了就原样交,网站按魔数认 PNG/JPG/WebP。"""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(blob)).convert("RGB").resize((1024, 1024))
        buf = io.BytesIO(); im.save(buf, "WEBP", quality=82)
        return buf.getvalue()
    except Exception:
        return blob


def check():
    """上线前自检:不领单、不出图、不耗额度。全过退 0。"""
    ok = True
    try:
        cron, lines = load_conf()
    except Exception as e:
        print("配置读不到:", e); return 1
    print("CRON_KEY", "有" if cron else "缺"); ok &= bool(cron)
    print("出图线路", [f"{l['id']}×{len(l['keys'])}把key" for l in lines] or "一条都没有"); ok &= bool(lines)
    try:   # 不带 key 打领单口:403 = 网站可达且接口在(带 key 才会真领单)
        st, _ = http(SITE + "/api/cron/pack-jobs", timeout=30)
        print("网站领单口", SITE, "HTTP", st, "(403 = 可达,正常)"); ok &= st == 403
    except Exception as e:
        print("网站领单口连不上:", e); ok = False
    for l in lines:   # /models 只列模型,不耗出图额度
        try:
            st, raw = http(l["base_url"].rstrip("/") + "/models", headers={"Authorization": "Bearer " + l["keys"][0]}, timeout=30)
            print(l["id"], "/models HTTP", st); ok &= st == 200 or l["id"] != "agnes-image"
        except Exception as e:
            print(l["id"], "连不上:", e); ok &= l["id"] != "agnes-image"
    print("自检", "通过" if ok else "没通过")
    return 0 if ok else 1


def main():
    cron, lines = load_conf()
    if not cron or not lines:
        log("缺 CRON_KEY 或本机网关配置里没有出图 key,退出"); return 0   # 缺配置不是故障(记忆:退出码只给真故障)
    try:
        st, d = site(cron)
    except Exception as e:
        log(f"连不上网站领单口:{str(e)[:120]}"); return 1
    if st != 200 or not d.get("ok"):
        log(f"领单失败 HTTP {st} {str(d)[:120]}"); return 1
    for job in d.get("jobs") or []:
        jid, prompt = job["id"], job.get("prompt") or ""
        log(f"领单 #{jid}")
        blob, errs = None, []
        for line in lines:
            for key in line["keys"][:3]:   # 每条线最多试 3 把 key(Agnes 按 key 限流)
                try:
                    blob = gen(line, key, prompt); break
                except Exception as e:
                    errs.append(f"{line['id']}:{str(e)[:80]}")
                    time.sleep(3)
            if blob:
                break
        if not blob:
            st, r = site(cron, {"id": jid, "err": ("本机出图失败 " + " | ".join(errs))[:200]})
            log(f"  失败 #{jid}(已置 failed,HTTP {st}):{' | '.join(errs)[:200]}")
            continue
        blob = shrink(blob)
        st, r = site(cron, {"id": jid, "b64": base64.b64encode(blob).decode()})
        log(f"  {'完成' if r.get('ok') else '交图失败'} #{jid} → media {r.get('media_id')} ({len(blob) // 1024}KB,HTTP {st})")
        time.sleep(6)   # 串行 + 间隔,别撞 Agnes 限流
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else main())
