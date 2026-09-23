"""看住助手有没有停(创始人 2026-09-17 23:1x:「你自己不定时的要去控制他们,看看他们有没有停止」)。
只读:WorkBuddy 审计日志最后一条时间 + 每个会话 collect 目录最新文件时间 + 5-爆款配方 最新 CSV;超过 STALE 分钟没动就判「停了」。
输出一行状态(给心跳读),并追加到 助手交付/_进度.md;退出码 2 = 有助手停了(心跳据此去戳它)。用法:python tools/assistants/watch.py [--stale 40]"""
import io, os, sys, json, glob, time, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
STALE = int(sys.argv[sys.argv.index("--stale") + 1]) if "--stale" in sys.argv else 40
H = os.path.expanduser("~"); now = time.time()
def age(ts): return int((now - ts) / 60) if ts else None
# WorkBuddy:审计日志最后一条
logs = sorted(glob.glob(os.path.join(H, ".workbuddy", "audit-log", "*.jsonl")))
last_audit = None
if logs:
    for line in reversed(io.open(logs[-1], encoding="utf-8", errors="replace").read().splitlines()):
        try: last_audit = json.loads(line)["timestamp"] / 1000; break
        except Exception: pass
# 各会话 collect 目录最新文件
sess = []
# 09-18 12:5x:只看 collect 会误报——WorkBuddy 在跟创始人对话写脚本时 collect 不动;改看整个会话目录里最新的文件(跳过 node_modules)
for d in glob.glob(os.path.join(H, "WorkBuddy", "*")):
    if not os.path.isdir(d): continue
    fs = []
    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in ("node_modules", ".git")]
        fs += [os.path.getmtime(os.path.join(root, f)) for f in files]
    if fs: sess.append((os.path.basename(d), max(fs)))
sess.sort(key=lambda x: -x[1])
csvs = [os.path.getmtime(f) for f in glob.glob("F:/0cosmetic/助手交付/5-爆款配方/*.csv")]
parts = [f"WorkBuddy 审计 {age(last_audit)} 分钟前"] + [f"{s[:16]} 产出 {age(m)} 分钟前" for s, m in sess[:3]] + [f"CSV 最新 {age(max(csvs)) if csvs else '无'} 分钟前"]
fresh = min([age(last_audit) or 9999] + [age(m) for _, m in sess[:1]] or [9999])
stale = fresh >= STALE
line = f"- {dt.datetime.now().strftime('%m-%d %H:%M')} · 看守:{' · '.join(parts)} → {'停了 ' + str(fresh) + ' 分钟,要戳' if stale else '在干活'}"
print(line)
io.open("F:/0cosmetic/助手交付/_进度.md", "a", encoding="utf-8").write(line + "\n")
try:   # 任务中心也留一行(2026-09-18 治理层):后台一眼看到助手停没停;写失败不影响看守本身
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from _bohui import d1, _q
    d1(f"INSERT INTO jobs (name, job_type, host, status, note, heartbeat_at, finished_at) VALUES ('assistant-watch', 'watch', {_q(os.environ.get('COMPUTERNAME', ''))}, {_q('stalled' if stale else 'running')}, {_q(line[:200])}, datetime('now'), datetime('now'))", tries=1)
except Exception as e:
    print('  [jobs] 写失败', str(e)[:80])
sys.exit(2 if stale else 0)
