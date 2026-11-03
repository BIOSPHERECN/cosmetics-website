# -*- coding: utf-8 -*-
"""重活本机轮转(2026-09-23 A10「零付费」线)。

起因:私有仓 GitHub 免费额度每月 2,000 分钟,6 个重型工人一天就烧约 2,300 分钟,09-23 06:24 起全部被账单拒跑。
创始人铁令「一律不用收费的」—— 不提额度上限,重活搬回本机:同一套 tools/*.py,只是换成本机计划任务来跑。

规矩(记忆 feedback-cpu-heat-limits):
  · 单进程:全局锁,上一轮没跑完这轮就跳过;一次只跑一个工人
  · 低优先级 + 限核:子进程 IDLE 优先级、只绑 4 个核;线程 3(云端是 5–6)
  · 起跑前看 CPU 占用 >60% 就不启动(本机 WMI 读不到温度,只能看负载)
  · 每轮挑「最超期」的一个工人跑 25 分钟,硬上限 50 分钟
key 与 i18n_local.py 同一做法:模型 key 从本机网关配置 ~/.bohui-gateway/config.json 取;平台 CRON_KEY 取
skin2oem/.env.founder;帛卉站 CRON_KEY / ANYSEARCH_KEY 取 cosmetic-sites/.env。只放进子进程环境,不打印、不落盘。

用法:python local/heavy.py                  计划任务 Bohui-HeavyLocal 每小时一次
      python local/heavy.py --job summaries --budget 180     指定工人试跑
"""
import io, os, sys, json, time, socket, argparse, subprocess, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(os.path.dirname(HERE), "tools")
LOGS = os.path.join(HERE, "logs")
STATE = os.path.join(HERE, "state.json")
LOCK = os.path.join(HERE, "_lock")
F = "F:/0cosmetic"

# 工人 → (脚本, 期望间隔小时, 站, 额外环境)。间隔照云端原节奏;本机一小时只跑一个,按「超期倍数」轮转
JOBS = {
    "ingredient-facts": ("ingredient_facts.py", 2, "b2ai", {"BATCH": "15"}),
    "lit-refs": ("lit_refs.py", 2, "b2ai", {"LIMIT": "48"}),
    "summaries": ("summaries_cloud.py", 4, "b2ai", {}),
    "ai-batch": ("ai_batch.py", 4, "b2ai", {"TARGET_RUNS": "10000"}),
    "deep-report": ("deep_report.py", 12, "bohui", {}),
    "catalog-i18n": ("i18n_cloud.py", 24, "bohui", {"ROUNDS": "8"}),
}


def log(m):
    os.makedirs(LOGS, exist_ok=True)
    line = time.strftime("%m-%d %H:%M:%S ") + m
    print(line, flush=True)
    io.open(os.path.join(LOGS, "heavy.log"), "a", encoding="utf-8").write(line + "\n")


def envfile(path):
    out = {}
    for l in io.open(path, encoding="utf-8", errors="replace"):
        if "=" in l and not l.lstrip().startswith("#"):
            k, v = l.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _reach(url, proxy):
    """能握手拿到任何 HTTP 回应(含 403)就算通。09-23 22:4x 实测:beauty2ai 直连握手要 16–34 秒,7890 走它 SSL EOF"""
    h = urllib.request.ProxyHandler({"https": proxy, "http": proxy} if proxy else {})
    for _ in range(2):
        try:
            urllib.request.build_opener(h).open(url, timeout=40).read(1)
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            pass
    return False


def net_env(env, url):
    """直连优先 → 7890 → 1082,不写死端口(并行开跑规则 §五);探的是这个工人自己的派工站"""
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"):
        env.pop(k, None)
    if _reach(url, None):
        env["no_proxy"] = "*"      # urllib 在 Windows 上会读系统代理(常断的 1082),显式直连
        return "直连"
    for port in (7890, 1082):
        with socket.socket() as s:
            s.settimeout(1.5)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                continue
        if _reach(url, f"http://127.0.0.1:{port}"):
            env["HTTPS_PROXY"] = env["HTTP_PROXY"] = f"http://127.0.0.1:{port}"
            return f"代理 {port}"
    env["no_proxy"] = "*"
    return "都不通,按直连试"


def build_env(site, extra, budget, threads):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", BUDGET_S=str(budget), THREADS=str(threads), **extra)
    cfg = json.load(io.open(os.path.expanduser("~/.bohui-gateway/config.json"), encoding="utf-8"))
    keys = lambda cid: next((c["keys"] for c in cfg["channels"] if c["id"] == cid), [])
    ag = keys("agnes-30flash-cn")
    if site == "b2ai":
        env.update(B2AI_SITE="https://beauty2ai.com", B2AI_CRON_KEY=envfile(f"{F}/skin2oem/.env.founder")["CRON_KEY"],
                   AGNES_KEYS=",".join(ag), SENSENOVA_KEYS=",".join(keys("sensenova-68")))
        env.pop("SITE", None); env.pop("CRON_KEY", None)   # 平台零工厂信息:不回帛卉站借舰队(同 i18n_local.py)
    else:
        e = envfile(f"{F}/cosmetic-sites/.env")
        env.update(SITE="https://biosphere-ai.com", CRON_KEY=e["CRON_KEY"], ANYSEARCH_KEY=e.get("ANYSEARCH_KEY", ""),
                   AGNES_KEY=ag[-1] if ag else "", AGNES_BASE="https://apihub.agnes-ai.cn/v1", AGNES_MODEL="agnes-3.0-flash")
        # 单 key 工人用最后一把:llm_pool 从 k1 轮起,k1 最先被 429(09-23 22:56 选品台翻译 24 条错 23);2.0-flash 在 .com 端已 429,换 3.0
    return env


def pick(state, now):
    """最超期的那个;都没到期就不跑"""
    best, score = None, 1.0
    for name, (_, every, _, _) in JOBS.items():
        s = (now - state.get(name, 0)) / (every * 3600)
        if s >= score:
            best, score = name, s
    return best


def take_lock():
    try:
        os.mkdir(LOCK)
    except FileExistsError:
        if time.time() - os.path.getmtime(LOCK) < 3 * 3600:
            return False
        log("锁超过 3 小时,视为死锁,接管")
    io.open(os.path.join(LOCK, "owner.txt"), "w", encoding="utf-8").write(f"heavy.py pid={os.getpid()} {time.strftime('%m-%d %H:%M')}")
    return True


def exec_worker(script):
    """子进程入口:给访问自家派工站的 urlopen 套「连接层断了就重试」再跑工人脚本。
    09-23 22:4x 实测本机到 beauty2ai 直连握手 16–34 秒、偶发 10054 被对端重置;云端脚本假设网络稳,第一个请求断了整轮就退 1。
    只重试连接层错误(HTTPError 原样抛,不改工人自己的判断)。ponytail: 交工 POST 断线重发可能重复写,接口都是 upsert 才敢这样"""
    import runpy, urllib.request as U
    orig = U.urlopen

    def urlopen(*a, **k):
        u = getattr(a[0], "full_url", a[0]) if a else ""
        if not any(h in str(u) for h in ("beauty2ai.com", "biosphere-ai.com")):
            return orig(*a, **k)    # 只重试自家派工站;外站(gnews 直连必超时)重试只会把一轮拖成几十分钟
        for i in range(4):
            try:
                return orig(*a, **k)
            except urllib.error.HTTPError:
                raise
            except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
                if i == 3:
                    raise
                time.sleep(5 * 2 ** i)
    U.urlopen = urlopen
    sys.path.insert(0, TOOLS)
    sys.argv = [script]
    runpy.run_path(os.path.join(TOOLS, script), run_name="__main__")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", choices=list(JOBS))
    ap.add_argument("--budget", type=int, default=1500)
    ap.add_argument("--threads", type=int, default=3)
    a = ap.parse_args()
    import psutil
    cpu = psutil.cpu_percent(interval=3)
    if cpu > 60:
        log(f"CPU {cpu:.0f}% > 60%,这轮不启动"); return 0
    if not take_lock():
        log("上一轮还在跑,跳过"); return 0
    try:
        state = json.load(io.open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
        name = a.job or pick(state, time.time())
        if not name:
            log("没有到期的工人"); return 0
        script, _, site, extra = JOBS[name]
        env = build_env(site, extra, a.budget, a.threads)
        # 探的是这个工人最依赖的那一端:深度报告要抓海外来源,直连 gnews 必超时(09-23 23:0x 一轮 20 分钟只走了 3 个关键词),走 7890 1.3 秒
        probe = {"deep-report": "https://news.google.com/rss"}.get(name) or (
            "https://beauty2ai.com/robots.txt" if site == "b2ai" else "https://biosphere-ai.com/robots.txt")
        net = net_env(env, probe)
        state[name] = time.time()
        io.open(STATE, "w", encoding="utf-8").write(json.dumps(state))
        log(f"开跑 {name}(预算 {a.budget}s,{a.threads} 线程,{net},CPU {cpu:.0f}%)")
        t0 = time.time()
        with io.open(os.path.join(LOGS, f"{name}.log"), "a", encoding="utf-8") as out:
            out.write(f"\n===== {time.strftime('%m-%d %H:%M:%S')} 本机轮转开跑 =====\n"); out.flush()
            p = subprocess.Popen([sys.executable, "-u", os.path.abspath(__file__), "--exec", script], cwd=os.path.dirname(HERE), env=env,
                                 stdout=out, stderr=subprocess.STDOUT, creationflags=subprocess.IDLE_PRIORITY_CLASS)
            try:
                psutil.Process(p.pid).cpu_affinity(list(range(min(4, psutil.cpu_count()))))
            except Exception:
                pass
            try:
                rc = p.wait(timeout=max(a.budget + 600, 3000))
            except subprocess.TimeoutExpired:
                p.kill(); rc = -9
        log(f"收工 {name} rc={rc} 用时 {(time.time() - t0) / 60:.1f} 分钟")
        return 0 if rc == 0 else 1
    finally:
        try:
            os.remove(os.path.join(LOCK, "owner.txt")); os.rmdir(LOCK)
        except OSError:
            pass


def selftest():
    now = 100 * 3600
    assert pick({k: now for k in JOBS}, now) is None                      # 刚跑过,都不到期
    st = {k: now for k in JOBS}; st["lit-refs"] = now - 5 * 3600; st["deep-report"] = now - 13 * 3600
    assert pick(st, now) == "lit-refs"                                     # 2.5 倍超期 > 1.08 倍
    assert pick({}, now) in JOBS                                           # 从没跑过的都到期
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    if len(sys.argv) == 3 and sys.argv[1] == "--exec":
        exec_worker(sys.argv[2]); sys.exit(0)
    sys.exit(main())
