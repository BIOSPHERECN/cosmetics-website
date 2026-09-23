"""每日出现记录 → market_product_seen(2026-09-18 治理层;GPT 原则:趋势要时间窗口,频率≠销量;时间序列从今天开始积累)。
幂等:INSERT OR IGNORE,同一天跑几次都只有一行。按 id 段分批,每段一条 INSERT…SELECT,一个 SQL 文件一次 d1_exec。
用法:python tools/market/seen-daily.py   (follow-workbuddy.bat 最后一行调用)"""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, job

STEP = 2000
with job("seen-daily") as J:
    mx = d1("SELECT MAX(id) m FROM market_products")
    top = int((mx[0]["m"] if mx else 0) or 0)
    p = os.path.join(ROOT, "tools", "_seen_daily.sql")
    with io.open(p, "w", encoding="utf-8") as w:
        for lo in range(0, top + 1, STEP):   # 只记有全成分的款(与后台六站口径一致:length(inci)>30)
            w.write(f"INSERT OR IGNORE INTO market_product_seen (product_id, seen_date) SELECT id, date('now') FROM market_products WHERE length(inci)>30 AND id BETWEEN {lo} AND {lo + STEP - 1};\n")
    n = d1_exec(p) if top else 0
    J.tick(n)
    tot = d1("SELECT COUNT(*) n FROM market_product_seen WHERE seen_date=date('now')")
    print(f"seen-daily:max id {top},本次 rows_written {n},今日累计 {tot[0]['n'] if tot else '?'} 款")
