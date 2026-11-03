"""每日出现记录 → market_product_seen(2026-09-18 治理层;GPT 原则:趋势要时间窗口,频率≠销量;时间序列从今天开始积累)。
幂等:INSERT OR IGNORE,同一天跑几次都只有一行。按 id 段分批,每段一条 INSERT…SELECT,一个 SQL 文件一次 d1_exec。
用法:python tools/market/seen-daily.py   (follow-workbuddy.bat 最后一行调用)"""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, job

STEP = 2000
# 09-24 D2:每 30 分钟跟着 follow-workbuddy 跑一次,每轮整表 INSERT…SELECT 约 30 万行读 + 末尾 COUNT 46.8 万行读,一天 48 轮 ≈ 3,700 万行。
# 同一天只需要一轮:本机记当天日期(UTC,与 SQL 的 date('now') 同口径),跑过就跳过;末尾计数改用写入行数。
import datetime as _dt
STAMP = os.path.join(ROOT, "tools", "_seen_daily.stamp")
today = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
try: done = io.open(STAMP, encoding="utf-8").read().strip() == today
except OSError: done = False
if done and "--force" not in sys.argv:
    print(f"seen-daily:今天({today} UTC)已跑过,跳过"); sys.exit(0)
with job("seen-daily") as J:
    mx = d1("SELECT MAX(id) m FROM market_products")
    top = int((mx[0]["m"] if mx else 0) or 0)
    p = os.path.join(ROOT, "tools", "_seen_daily.sql")
    with io.open(p, "w", encoding="utf-8") as w:
        for lo in range(0, top + 1, STEP):   # 只记有全成分的款(与后台六站口径一致:length(inci)>30)
            w.write(f"INSERT OR IGNORE INTO market_product_seen (product_id, seen_date) SELECT id, date('now') FROM market_products WHERE length(inci)>30 AND id BETWEEN {lo} AND {lo + STEP - 1};\n")
    n = d1_exec(p) if top else 0
    J.tick(n)
    # d1_exec 失败也返回 0:0 行时看最后插入的一行(rowid 倒序,读 1 行)是不是今天,确认过才记日期
    last = d1("SELECT seen_date d FROM market_product_seen ORDER BY rowid DESC LIMIT 1") if top and not n else []
    if top and (n or (last and last[0]["d"] == today)): io.open(STAMP, "w", encoding="utf-8").write(today)
    print(f"seen-daily:max id {top},本次 rows_written {n}")
