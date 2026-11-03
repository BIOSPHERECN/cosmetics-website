# -*- coding: utf-8 -*-
"""BEAUTY2AI 整页翻译 —— 本机工人(2026-09-23 A2 线)。

云端 html-i18n 自 09-23 00:38 起全部失败,真因不是导入锁:GitHub 报「recent account payments have failed or
your spending limit needs to be increased」,hosonzuo/bohui-automation 全部工作流 3–6 秒就被拒。账单修好之前本机顶上。
复用云端同一套代码(_worker/tools/ 是 origin/main 的 html_i18n.py + llm_pool.py 拷贝):同一个派工/交工接口、同一套质量闸。
  · key 从本机网关配置取(sync-config.py 从 gw_keys 同步来的 Agnes / 商汤);B2AI_CRON_KEY = .env.founder 的 CRON_KEY。不打印 key。
  · 落后语种优先:按开跑快照里待译数降序,最多的 5 个语种每轮取 3 批并发翻,其余 1 批。每批 40 条。
  · 环境变量 LANGS 可限定语种;SENSENOVA_MODEL / AGNES_MODEL 可换模型(llm_pool 读)。
用法:python tools/platform/i18n_local.py [预算秒,默认 3300]      计划任务 Bohui-I18nLocal 每小时一次
"""
import io, os, re, sys, json, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUDGET = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 3300
cfg = json.load(io.open(os.path.expanduser("~/.bohui-gateway/config.json"), encoding="utf-8"))
keys = lambda cid: next((c["keys"] for c in cfg["channels"] if c["id"] == cid), [])
fenv = dict(l.strip().split("=", 1) for l in io.open(os.path.join(ROOT, ".env.founder"), encoding="utf-8")
            if "=" in l and not l.lstrip().startswith("#"))
os.environ.update(B2AI_SITE="https://beauty2ai.com", B2AI_CRON_KEY=fenv["CRON_KEY"].strip().strip('"'), BATCH="40")
os.environ.setdefault("AGNES_KEYS", ",".join(keys("agnes-30flash-cn")))
os.environ.setdefault("SENSENOVA_KEYS", ",".join(keys("sensenova-68")))
for k in ("CRON_KEY", "SITE"):          # 不回帛卉站借舰队:平台零工厂信息,池子全关就歇一会儿
    os.environ.pop(k, None)
# 本机系统代理是 1082(常断);商汤 / Agnes .cn / beauty2ai 直连都通,全局改直连
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))


def agnes_alive():
    """09-23 17:3x 实测 Agnes 对话接口 40–240 秒无响应(/models 0.2 秒正常)—— 挂着的席位一批卡 240 秒。开跑前探一次,不通这轮就不用。"""
    k = (os.environ.get("AGNES_KEYS") or "").split(",")[0]
    if not k:
        return False
    body = json.dumps({"model": "agnes-3.0-flash", "messages": [{"role": "user", "content": "Say OK"}], "max_tokens": 200,
                       "chat_template_kwargs": {"enable_thinking": False}}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request("https://apihub.agnes-ai.cn/v1/chat/completions", data=body,
                               headers={"authorization": "Bearer " + k, "content-type": "application/json"}), timeout=30).read()
        return True
    except Exception:
        return False


# 判分 v2(09-23 18:46,GLM-5.2 对英文原文):商汤 6.8 lite 4.88 分、Agnes 3.0 4.48 分 —— 默认只用商汤;I18N_AGNES=1 才开 Agnes
if os.environ.get("I18N_AGNES") != "1" or not agnes_alive():
    os.environ["AGNES_KEYS"] = ""
sys.path.insert(0, os.path.join(HERE, "_worker", "tools"))
import html_i18n as W   # noqa: E402

HDR = {"x-cron-key": W.CRON_KEY}
t0 = time.time()
lock = threading.Lock()
wrote = {}     # {lang: 本轮写入}
_orig_chat = W.chat
_gate = threading.BoundedSemaphore(10)   # 17:46 首跑 25 路并发,5 把商汤 key 很快全冷;10 路实测不 429


def _chat(*a, **k):
    with _gate:
        return _orig_chat(*a, **k)


def _parse_map(txt):
    """商汤 6.8 lite 常在 JSON 后面带尾巴、或值里有没转义的引号,原 parse_map 一失败整批 40 条全丢。
    先 raw_decode(容尾巴),再按「"数字": "值"」逐条抠(值里的裸引号也吃得下)。"""
    i = txt.find("{")
    if i < 0:
        return {}
    try:
        m, _ = json.JSONDecoder().raw_decode(txt[i:])
        if isinstance(m, dict):
            return {str(k): str(v) for k, v in m.items()}
    except ValueError:
        pass
    out = {}
    for k, v in re.findall(r'"(\d+)"\s*:\s*"(.*?)"\s*(?=,\s*"\d+"\s*:|\s*}\s*$)', txt[i:].strip(), re.S):
        try:
            out[k] = json.loads('"' + v + '"')
        except ValueError:
            out[k] = v
    return out


W.chat, W.parse_map = _chat, _parse_map
import llm_pool as P    # noqa: E402
_orig_post = P._post


def _post_logged(url, body, headers, timeout):
    """llm_pool 把席位报错全吞了,只剩「0/5 席位可用」;这里记下真因(状态码 + 前 100 字)"""
    if "sensenova" in url:      # 21:59 实测:6.8 lite 偶发思考停不下来,4000 token 全烧在 reasoning 上、content 空、席位被歇 —— 关思考
        body = dict(body, thinking={"type": "disabled"}, max_tokens=max(body.get("max_tokens", 0), 6000))
    try:
        out = _orig_post(url, body, headers, timeout)
        c = (out.get("choices") or [{}])[0]
        if not (c.get("message", {}).get("content") or "").strip():     # 空串会让席位歇 60 秒,记下为什么空
            W.log(f"  席位空回 {body.get('model')} finish={c.get('finish_reason')} usage={out.get('usage', {}).get('completion_tokens')} {str(out)[:120]}")
        return out
    except urllib.error.HTTPError as e:
        msg = e.read()[:100]
        e.read = lambda *a: msg
        W.log(f"  席位报错 {body.get('model')} {e.code} {msg!r}")
        raise
    except Exception as e:
        W.log(f"  席位报错 {body.get('model')} {type(e).__name__} {str(e)[:80]}")
        raise


P._post = _post_logged

# ── 09-24 S07 商汤额度闸:翻译不许挤掉 beauty2ai brief ──
# brief(/api/ai/brief)用平台库 providers.sensenova-68 的 4 把 key;本机网关多一把只有翻译在用。
# fleet.ts 撞到「rpm exhausted」会把整个商汤家判死、这次 brief 直接失败 —— 所以共用 key 翻译只占 1 路并发,
# 且每把每个北京日最多 I18N_SHARED_TOK token(默认 2,000 万),超了当天只用独占 key;独占 key 开 I18N_EXCL_CONC 路(默认 3)。
import hashlib, datetime as _dt
QUOTA_F = os.path.join(HERE, "_i18n_quota.json")
SHARED_CAP = int(os.environ.get("I18N_SHARED_TOK", "20000000"))
_fp = lambda k: hashlib.sha256(k.encode()).hexdigest()[:8]
_today = lambda: (_dt.datetime.utcnow() + _dt.timedelta(hours=8)).strftime("%Y-%m-%d")


def _shared_keys():
    try:
        from _pd1 import pq     # 1 行读
        r = pq("SELECT api_keys FROM providers WHERE id = 'sensenova-68'")
        return {k.strip() for k in (r[0]["api_keys"] if r else "").split(",") if k.strip()}
    except Exception as e:      # 查不到就按「全是共用」处理:宁可慢,不挤 brief
        W.log(f"额度闸:读 providers 失败 {type(e).__name__},全部 key 按共用限流")
        return set((os.environ.get("SENSENOVA_KEYS") or "").split(","))


SHARED = _shared_keys()
QUOTA = json.load(io.open(QUOTA_F, encoding="utf-8")) if os.path.exists(QUOTA_F) else {}
if QUOTA.get("day") != _today():
    QUOTA = {"day": _today(), "tok": {}}
_sems = {}
P._init()
for s in [x for x in P._seats if "sensenova" in x["base"] and x["key"] not in SHARED]:
    for j in range(int(os.environ.get("I18N_EXCL_CONC", "3")) - 1):     # 独占 key 复制席位,轮转时多分到几路
        P._seats.append(dict(s, name=f"{s['name']}+{j + 1}"))


def _post_capped(url, body, headers, timeout):
    key = headers.get("authorization", "")[7:]
    shared = "sensenova" in url and key in SHARED
    if shared and QUOTA["tok"].get(_fp(key), 0) >= SHARED_CAP:
        raise RuntimeError("共用 key 今日翻译额度已满")       # 池子把这个席位歇 60 秒,转去别的席位
    with lock:
        sem = _sems.setdefault(key, threading.BoundedSemaphore(1 if shared else int(os.environ.get("I18N_EXCL_CONC", "3"))))
    with sem:
        out = _post_logged(url, body, headers, timeout)
    if "sensenova" in url:
        with lock:
            QUOTA["tok"][_fp(key)] = QUOTA["tok"].get(_fp(key), 0) + int((out.get("usage") or {}).get("total_tokens") or 0)
    return out


P._post = _post_capped


def post(lang, prov, out):
    for i in range(4):      # 平台库被别的线导入锁住时交工 500:等一等再交,别把译好的丢了
        try:
            return int(W.http(f"{W.SITE}/api/cron/html-i18n", "POST", {"lang": lang, "provider": prov, "items": out}, HDR).get("wrote", 0))
        except Exception as e:
            W.log(f"[{lang}] 交工失败 {type(e).__name__} {getattr(e, 'code', '')},{30 * (i + 1)} 秒后重交")
            time.sleep(30 * (i + 1))
    return 0


def one(lang, job, chunk):
    try:
        return W.translate_batch(lang, job.get("name", lang), job.get("hint", ""), chunk)
    except Exception as e:
        W.log(f"[{lang}] 批失败 {type(e).__name__}: {str(e)[:100]}")
        return [], len(chunk), None


SKIP_F = os.path.join(HERE, "_i18n_skip.json")     # {lang: {h: 被闸次数}}:同一句闸掉 3 次就不再派(品牌名带 ° / 源文本已是目标语…)
META_F = os.path.join(HERE, "_i18n_meta.json")     # {lang: {name, hint}}:派工口给的语种名与提示词,缓存一次
SKIP = json.load(io.open(SKIP_F, encoding="utf-8")) if os.path.exists(SKIP_F) else {}


def snapshot():
    """09-24 3E:旧派工口每次 GET 全表扫 html_i18n_src 再排序(实测 rows_read 258,032/次),03:45 那轮 28 分钟派工 1,285 次
    ≈ 每小时 7 亿行读;且队首是被闸掉的句子,每次都被派回来,kr 取 2,640 只写 195。
    改成每轮开头按主键分页把原文、已译 (h, lang) 各拉一遍(≈27 万行读 = 旧口径一次 GET),本地按 seen(曝光次数)降序排队。"""
    from _pd1 import pq     # 平台库只读,带 assert_db
    src, last = [], ""
    while True:
        rows = pq(f"SELECT h, en, seen FROM html_i18n_src WHERE h > '{last}' ORDER BY h LIMIT 10000")
        if not rows:
            break
        src += rows; last = rows[-1]["h"]
    done, last = {}, ""
    while True:
        rows = pq(f"SELECT h, group_concat(lang) ls FROM html_i18n WHERE h > '{last}' GROUP BY h ORDER BY h LIMIT 20000")
        if not rows:
            break
        for r in rows:
            done[r["h"]] = set(r["ls"].split(","))
        last = rows[-1]["h"]
    src.sort(key=lambda r: -int(r["seen"]))
    return src, done


def meta(lang):
    if lang not in META:
        j = W.http(f"{W.SITE}/api/cron/html-i18n?lang={lang}&limit=1", headers=HDR)
        META[lang] = {"name": j.get("name", lang), "hint": j.get("hint", "")}
        io.open(META_F, "w", encoding="utf-8").write(json.dumps(META, ensure_ascii=False))
    return META[lang]


def run_lang(lang, par, q):
    idle = i = 0
    job = meta(lang)
    while i < len(q) and time.time() - t0 < BUDGET:
        items = q[i:i + W.BATCH * par]; i += len(items)
        chunks = [items[k:k + W.BATCH] for k in range(0, len(items), W.BATCH)]
        with ThreadPoolExecutor(len(chunks)) as ex:
            res = list(ex.map(lambda c: one(lang, job, c), chunks))
        n = 0
        for (out, bad, prov), c in zip(res, chunks):
            if prov is None:        # 调用抛错(池子全冷):不计闸次
                continue
            with lock:
                sk = SKIP.setdefault(lang, {})
                good = [x for x in out if not x.get("same")]
                keep = [{"h": x["h"], "text": x["text"]} for x in out if x.get("same") and sk.get(x["h"], 0) >= 2]   # 同一短串第三次仍原样 = 品牌/国名,认了
            if good:
                n += post(lang, prov, good)
            if keep:
                n += post(lang, "keep:" + prov, keep)
            got = {x["h"] for x in good + keep}     # 验收 04:5x:整批被闸(如 same×40)也要计闸次,原来 out 空就跳过 → 8 个语种卡在同一批原地重试
            with lock:
                for it in c:
                    if it["h"] not in got:
                        sk[it["h"]] = sk.get(it["h"], 0) + 1
                REDO.get(lang, set()).difference_update(got)
        with lock:
            wrote[lang] = wrote.get(lang, 0) + n
        W.log(f"[{lang}] 取 {len(items)} 写 {n} · 余 {len(q) - i} · {W.pool_status()}")
        if all(r[2] is None for r in res):      # 只有池子全冷(全部调用抛错)才退回队头;模型答了但整批被闸 → 计闸次往下走
            i -= len(items); idle += 1
            time.sleep(min(120, 15 * idle))
        else:
            idle = 0
    if i >= len(q):
        W.log(f"[{lang}] 队列空")


QUEUE = os.path.join(HERE, "_redo_queue.jsonl")      # i18n_redo.py 生成:低分语种里 Agnes 翻的行,交商汤覆盖重翻
POS = os.path.join(HERE, "_redo_queue.pos")


def run_redo():
    """消化重翻队列:每次 3 批×40 条(同一语种连着做),交工 upsert 覆盖旧译文;位置记在 .pos,下轮接着做"""
    q = [json.loads(l) for l in io.open(QUEUE, encoding="utf-8")]
    pos = int(io.open(POS).read().strip() or 0) if os.path.exists(POS) else 0
    n_all = fails = 0
    while pos < len(q) and time.time() - t0 < BUDGET:
        lang = q[pos]["lang"]
        take = [x for x in q[pos:pos + 120] if x["lang"] == lang]
        if lang not in META:        # 语种名与提示词取派工接口那一份(和新译同口径,比如印地语要天城文)
            try:
                j = W.http(f"{W.SITE}/api/cron/html-i18n?lang={lang}&limit=1", headers=HDR)
                META[lang] = {"name": j.get("name", lang), "hint": j.get("hint", "")}
            except Exception:
                time.sleep(60); continue
        job = META[lang]
        chunks = [take[i:i + W.BATCH] for i in range(0, len(take), W.BATCH)]
        with ThreadPoolExecutor(len(chunks)) as ex:
            res = list(ex.map(lambda c: one(lang, job, c), chunks))
        n = sum(post(lang, "redo:" + prov, [x for x in out if not x.get("same")]) for out, bad, prov in res if out)
        if n == 0 and fails < 2:        # 池子全冷:不挪位置,歇一会儿同一批再来;连着 3 次才跳过(旧译文留着)
            fails += 1; time.sleep(60); continue
        fails = 0
        pos += len(take)
        io.open(POS, "w").write(str(pos))
        n_all += n
        W.log(f"[重翻 {lang}] {pos}/{len(q)} 本批覆盖 {n}")
    W.log(f"[重翻] 本轮覆盖 {n_all},队列 {pos}/{len(q)}")


META = json.load(io.open(META_F, encoding="utf-8")) if os.path.exists(META_F) else {}



LANGS_ALL = "es,pt,fr,de,jp,kr,id,my,th,vn,ph,ar,tr,in,ru"


import i18n_core as C    # noqa: E402
REDO_RAW = json.load(io.open(C.REDO_F, encoding="utf-8")) if os.path.exists(C.REDO_F) else {"langs": {}}
REDO = {l: set(v) for l, v in REDO_RAW["langs"].items()}


def save_redo():
    with lock:
        io.open(C.REDO_F, "w", encoding="utf-8").write(json.dumps(dict(REDO_RAW, langs={l: sorted(v) for l, v in REDO.items()})))
        io.open(QUOTA_F, "w", encoding="utf-8").write(json.dumps(QUOTA))


def main():
    try:
        core = C.core()         # 5 个核心页现抓现切,句子哈希与中间件同口径
    except Exception as e:
        W.log(f"核心页抓取失败 {type(e).__name__},本轮不排优先"); core = {"pages": {}, "items": {}}
    src, done = snapshot()
    only = [l for l in (os.environ.get("LANGS") or LANGS_ALL).split(",") if l]
    en = {r["h"]: r["en"] for r in src}
    en.update({h: t for h, t in core["items"].items() if h not in en})     # 还没登记进 src 的核心句也直接翻(交工按哈希写,中间件按哈希查)
    order = list(dict.fromkeys(h for p in core["pages"].values() for h in p)) + [r["h"] for r in src]
    order = list(dict.fromkeys(order))
    ncore = len(core["items"])
    todo = lambda l, h: (l not in done.get(h, ()) or h in REDO.get(l, ())) and SKIP.get(l, {}).get(h, 0) < 3
    qs = {l: [{"h": h, "en": en[h]} for h in order if todo(l, h)] for l in only}
    W.log(f"核心页 {ncore} 句排队首;各语种核心待译 " + " ".join(f"{l}={sum(1 for x in qs[l][:ncore] if x['h'] in core['items'])}" for l in only)
          + f";照抄/旧译待重翻 {sum(map(len, REDO.values()))}(扫描时 {REDO_RAW.get('start', 0)});共用商汤 key {len(SHARED)} 把每把 1 路、日上限 {SHARED_CAP:,} token")

    def saver():
        while True:
            time.sleep(300); save_redo()
    threading.Thread(target=saver, daemon=True).start()
    langs = sorted(only, key=lambda l: -len(qs[l]))
    par = {l: (3 if i < 5 else 1) for i, l in enumerate(langs)}
    W.log("开跑 预算 %ds · 快照 原文 %d 句 · 待译 %d · Agnes %s · 商汤 %s · 并发 %s" % (BUDGET, len(src), sum(map(len, qs.values())),
          "通" if os.environ["AGNES_KEYS"] else "不通,本轮不用",
          os.environ.get("SENSENOVA_MODEL", "sensenova-6.8-flash-lite"), " ".join(f"{l}×{p}" for l, p in par.items())))
    ths = [threading.Thread(target=run_lang, args=(l, p, qs[l]), daemon=True) for l, p in par.items()]
    if os.path.exists(QUEUE):
        ths.append(threading.Thread(target=run_redo, daemon=True))
    [t.start() for t in ths]
    [t.join() for t in ths]
    with lock:
        io.open(SKIP_F, "w", encoding="utf-8").write(json.dumps(SKIP))
    save_redo()
    W.log(f"照抄/旧译待重翻 剩 {sum(map(len, REDO.values()))};商汤用量(今日,按 key 指纹):"
          + " ".join(f"{k}{'(共用)' if any(_fp(x) == k for x in SHARED) else ''}={v:,}" for k, v in QUOTA["tok"].items()))
    # 验收 04:5x:收尾不再调 ?status=1(整表 GROUP BY,一次 2 分钟 + 30 余万行读,还把收尾顶到 :44,离下一轮 :45 只剩 1 分多,
    # 计划任务 IgnoreNew,超时就整小时不跑)。done = 开跑快照 + 本轮写入,口径一致
    dn = {l: sum(1 for s in done.values() if l in s) + wrote.get(l, 0) for l in only}
    W.log(f"本轮写入 {sum(wrote.values())};done: " + " ".join(f"{l}={n}" for l, n in sorted(dn.items(), key=lambda x: x[1])))


if __name__ == "__main__":
    main()
