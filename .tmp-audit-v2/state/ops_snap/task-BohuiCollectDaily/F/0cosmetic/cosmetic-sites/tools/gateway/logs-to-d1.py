#!/usr/bin/env python3
"""把帛卉网关的 jsonl 日志汇入线上 ai_runs(entity_type='gateway')。

    python tools/gateway/logs-to-d1.py            # 昨天 + 今天
    python tools/gateway/logs-to-d1.py --days 7   # 最近 7 天

幂等:input_hash = 该行文本的 sha256 前 32 位;先把库里已有的 hash 分页拉下来,只灌没见过的。
分批:每 200 行一条 INSERT,写成一个 SQL 文件走 d1_exec(带重试)。
列映射:ts(UTC 'YYYY-MM-DD HH:MM:SS')/ prompt_key='GATEWAY:'+alias / provider / model /
       tokens_in / tokens_out / latency_ms=ms / ok=status 2xx / error / entity_type='gateway'。
"""
import os
import sys
import json
import hashlib
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _bohui import d1, d1_exec, _q   # noqa: E402

DIR = os.environ.get("BOHUI_GATEWAY_DIR") or os.path.join(os.path.expanduser("~"), ".bohui-gateway")
LOG_DIR = os.path.join(DIR, "logs")
BATCH = 200


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 2
    today = datetime.date.today()
    rows = []
    for i in range(days):
        p = os.path.join(LOG_DIR, f"{today - datetime.timedelta(days=i)}.jsonl")
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append((hashlib.sha256(line.encode("utf-8")).hexdigest()[:32], json.loads(line)))
            except Exception:
                pass
    if not rows:
        print("  没有日志行可汇入"); return
    # 已有 hash:按 ts 圈定范围后分页拉(jsonl 按本地日期分文件,ts 是 UTC,多往前圈一天)
    since = f"{today - datetime.timedelta(days=days)} 00:00:00"
    have, off = set(), 0
    while True:
        page = d1(f"SELECT input_hash FROM ai_runs WHERE entity_type='gateway' AND ts >= {_q(since)} ORDER BY id LIMIT 1000 OFFSET {off}")
        have.update(r["input_hash"] for r in page if r.get("input_hash"))
        if len(page) < 1000:
            break
        off += 1000
    new = [(h, r) for h, r in rows if h not in have]
    print(f"  日志 {len(rows)} 行,库里已有 {len(have)},待灌 {len(new)}")
    if not new:
        return
    sql_path = os.path.join(LOG_DIR, "_upload.sql")
    stmts = []
    for i in range(0, len(new), BATCH):
        vals = []
        for h, r in new[i:i + BATCH]:
            ts = str(r.get("ts") or "").replace("T", " ")[:19]
            st = r.get("status") or 0
            vals.append("(%s,%s,%s,%s,%s,%s,%s,%s,%s,'gateway',%s)" % (
                _q(ts), _q("GATEWAY:" + str(r.get("alias") or "")), _q(r.get("provider")), _q(r.get("model")),
                r.get("tokens_in") if r.get("tokens_in") is not None else "NULL",
                r.get("tokens_out") if r.get("tokens_out") is not None else "NULL",
                r.get("ms") if r.get("ms") is not None else "NULL",
                1 if 200 <= int(st) < 300 else 0, _q((r.get("error") or None) and str(r.get("error"))[:200]), _q(h)))
        stmts.append("INSERT INTO ai_runs (ts,prompt_key,provider,model,tokens_in,tokens_out,latency_ms,ok,error,entity_type,input_hash) VALUES\n" + ",\n".join(vals) + ";")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(stmts) + "\n")
    n = d1_exec(sql_path)
    print(f"  已灌 {len(new)} 行(wrangler rows_written={n},含索引写;SQL 文件 {sql_path})")


if __name__ == "__main__":
    main()
