# -*- coding: utf-8 -*-
"""工人体检 + 兜底拉起(09-24 S05 改写;旧版备份在会话 scratchpad/s05_bak/kick-workers.py)。

旧版只看「跑没跑」(createdAt),09-23 账单停摆期间每次都失败,日志照写「正常」。
现在的判据是「最近一次 success 离现在多久」:
  · 云端 4 个(w8848/bohui-automation:packjob / health / news-cn / trend-media)
      最近一次跑完的是失败 → 写「异常」,不拉起(坏了的工人反复拉只会烧分钟,要人看)
      最近成功超过 间隔×1.5 且没有在跑的 → 拉起一次(workflow_dispatch),同时写「异常」
  · 本机重活 6 个(Bohui-HeavyLocal,读 heavy.log 每个工人最后一次「收工 … rc=N」)
      rc≠0 或超过 间隔×3 没收工(一小时只轮一个,本来就会超期)→「异常」
  · html-i18n(Bohui-I18nLocal,读 _i18n_local.log):3 小时没更新或最后一轮写入 0 →「异常」
  · cat-jev(Jev 收费,零付费停用)、probe / probe-qy(只手动)只列不查
不切换 gh 活动账号:只把 w8848 令牌放进子进程环境(旧版每轮 `gh auth switch` 会改全局账号,已删)。
每次 gh 调用 40 秒超时;网络直连 → 7890 → 1082 逐个探,不写死端口。

用法:python tools/platform/kick-workers.py [--dry] [--selftest]
计划任务 Bohui-KickWorkers 每小时 :38(hourly.cmd,输出追加到 data/kick-workers.log)。
"""
import os, re, sys, json, time, socket, calendar, subprocess, urllib.request

REPO = "w8848/bohui-automation"
CLOUD = {"packjob": 1, "health": 8, "news-cn": 24, "trend-media": 24}          # 期望间隔(小时)
HEAVY = {"ingredient-facts": 2, "lit-refs": 2, "summaries": 4, "ai-batch": 4, "deep-report": 12, "catalog-i18n": 24}
OFF = {"cat-jev": "停用:Jev 收费(零付费铁令)", "probe": "只手动探路", "probe-qy": "只手动探路"}
HEAVY_LOG = "F:/0cosmetic/bohui-automation/local/logs/heavy.log"
I18N_LOG = "F:/0cosmetic/skin2oem/tools/platform/_i18n_local.log"
ACTIVE = {"queued", "in_progress", "waiting", "pending", "requested"}
DRY = "--dry" in sys.argv


def utc(ts):
    return calendar.timegm(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))


def classify_cloud(runs, hours, now):
    """runs:GitHub 返回的 workflow_runs(新→旧)。返回 (级别, 说明, 是否拉起)"""
    busy = any(r.get("status") in ACTIVE for r in runs)
    done = [r for r in runs if r.get("status") == "completed"]
    if done and done[0].get("conclusion") != "success":
        r = done[0]
        return "异常", f"最近一次 {r.get('conclusion')}({r.get('event')} {r['created_at'][:16]}Z #{r.get('id')}),需人看,不自动拉起", False
    ok = next((r for r in done if r.get("conclusion") == "success"), None)
    age = (now - utc(ok["created_at"])) / 3600 if ok else 999
    if age <= hours * 1.5:
        return "正常", f"最近成功 {age:.1f}h 前({ok.get('event')} #{ok.get('id')})", False
    if busy:
        return "正常", f"最近成功 {age:.1f}h 前,当前有一轮在跑", False
    return "异常", f"已 {age:.1f}h 没有成功(期望 {hours}h)", True


def parse_heavy(lines, year):
    """heavy.log:『09-24 08:58:15 收工 ai-batch rc=0 用时 25.2 分钟』→ {工人: (时间戳, rc)}"""
    out = {}
    for l in lines:
        m = re.match(r"(\d\d-\d\d \d\d:\d\d:\d\d) 收工 (\S+) rc=(-?\d+)", l)
        if m:
            t = time.mktime(time.strptime(f"{year}-{m.group(1)}", "%Y-%m-%d %H:%M:%S"))
            out[m.group(2)] = (t, int(m.group(3)))
    return out


def classify_heavy(last, hours, now):
    if not last:
        return "异常", "heavy.log 里没有收工记录"
    t, rc = last
    age = (now - t) / 3600
    if rc != 0:
        return "异常", f"最近一次收工 rc={rc}({age:.1f}h 前)"
    if age > hours * 3:
        return "异常", f"已 {age:.1f}h 没收工(期望约 {hours}h,本机一小时轮一个)"
    return "正常", f"最近收工 rc=0,{age:.1f}h 前"


def gh_env():
    env = dict(os.environ)
    for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
        env.pop(k, None)
    env["GH_PROMPT_DISABLED"] = "1"
    tok = subprocess.run(["gh", "auth", "token", "--user", "w8848"], capture_output=True, text=True, timeout=20).stdout.strip()
    if not tok:
        raise RuntimeError("取不到 w8848 令牌")
    env["GH_TOKEN"] = tok
    for proxy in (None, 7890, 1082):
        if proxy:
            with socket.socket() as s:
                s.settimeout(1.5)
                if s.connect_ex(("127.0.0.1", proxy)) != 0:
                    continue
        h = urllib.request.ProxyHandler({"https": f"http://127.0.0.1:{proxy}"} if proxy else {})
        try:
            urllib.request.build_opener(h).open("https://api.github.com/zen", timeout=10).read(1)
        except Exception:
            continue
        if proxy:
            env["HTTPS_PROXY"] = f"http://127.0.0.1:{proxy}"
        return env, (f"代理 {proxy}" if proxy else "直连")
    raise RuntimeError("直连、7890、1082 都连不上 api.github.com")


def gh(env, args):
    r = subprocess.run(["gh"] + args, env=env, capture_output=True, text=True, encoding="utf-8", timeout=40)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:160])
    return r.stdout


def main():
    now = time.time()
    stamp = time.strftime("%m-%d %H:%M")
    rows = []          # (级别, 工人, 说明)
    kicked = []
    try:
        env, via = gh_env()
    except Exception as e:
        env, via = None, str(e)[:120]
    for wf, hours in CLOUD.items():
        if env is None:
            rows.append(("异常", wf, f"云端查不了:{via}"))
            continue
        try:
            runs = json.loads(gh(env, ["api", f"repos/{REPO}/actions/workflows/{wf}.yml/runs?per_page=10"]))["workflow_runs"]
            lvl, msg, kick = classify_cloud(runs, hours, now)
            if kick and not DRY:
                gh(env, ["workflow", "run", f"{wf}.yml", "-R", REPO, "--ref", "main"])
                msg += ",已拉起"
                kicked.append(wf)
            elif kick:
                msg += ",[dry] 该拉起"
        except Exception as e:
            lvl, msg = "异常", f"查询失败:{str(e)[:120]}"
        rows.append((lvl, wf, msg))
    try:
        heavy = parse_heavy(open(HEAVY_LOG, encoding="utf-8", errors="replace").read().splitlines(), time.localtime(now).tm_year)
    except OSError as e:
        heavy = {}
        rows.append(("异常", "heavy.log", f"读不到:{e}"))
    for job, hours in HEAVY.items():
        lvl, msg = classify_heavy(heavy.get(job), hours, now)
        rows.append((lvl, job, "本机 " + msg))
    try:
        age = max(0.0, (now - os.path.getmtime(I18N_LOG)) / 3600)
        wrote = re.findall(r"本轮写入 (\d+)", open(I18N_LOG, encoding="utf-8", errors="replace").read()[-400000:])
        last = int(wrote[-1]) if wrote else None
        if age > 3:
            rows.append(("异常", "html-i18n", f"本机日志 {age:.1f}h 没更新"))
        elif last == 0:
            rows.append(("异常", "html-i18n", "本机最后一轮写入 0"))
        else:
            rows.append(("正常", "html-i18n", f"本机日志 {age:.1f}h 前更新,上一轮写入 {last}"))
    except OSError as e:
        rows.append(("异常", "html-i18n", f"读不到日志:{e}"))
    for wf, why in OFF.items():
        rows.append(("停用", wf, why))
    for lvl, wf, msg in rows:
        print(f"{stamp} [{lvl}] {wf} {msg}")
    bad = [wf for lvl, wf, _ in rows if lvl == "异常"]
    print(f"{stamp} 本轮 网络:{via if env else '不通'};异常 {len(bad)} 个{('(' + '、'.join(bad) + ')') if bad else ''};拉起 {', '.join(kicked) or '无'}")
    return 1 if bad else 0


def selftest():
    now = utc("2026-09-24T02:00:00Z")
    ok = {"status": "completed", "conclusion": "success", "event": "schedule", "id": 1, "created_at": "2026-09-24T01:30:00Z"}
    fail = {"status": "completed", "conclusion": "failure", "event": "schedule", "id": 2, "created_at": "2026-09-24T01:50:00Z"}
    old = dict(ok, created_at="2026-09-23T20:00:00Z")
    assert classify_cloud([ok], 1, now)[0] == "正常"
    assert classify_cloud([fail, ok], 1, now)[:3:2] == ("异常", False)
    assert classify_cloud([old], 1, now)[::2] == ("异常", True)
    assert classify_cloud([dict(ok, status="in_progress", conclusion=None), old], 1, now)[0] == "正常"
    assert classify_cloud([], 24, now)[::2] == ("异常", True)
    h = parse_heavy(["09-24 08:58:15 收工 ai-batch rc=1 用时 6.9 分钟", "09-24 07:58:22 收工 lit-refs rc=0 用时 25.3 分钟"], 2026)
    t = time.mktime(time.strptime("2026-09-24 09:30:00", "%Y-%m-%d %H:%M:%S"))
    assert classify_heavy(h["ai-batch"], 4, t)[0] == "异常"
    assert classify_heavy(h["lit-refs"], 2, t)[0] == "正常"
    assert classify_heavy(h["lit-refs"], 2, t + 7 * 3600)[0] == "异常"
    assert classify_heavy(None, 2, t)[0] == "异常"
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
