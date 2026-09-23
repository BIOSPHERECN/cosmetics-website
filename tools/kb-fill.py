#!/usr/bin/env python3
"""知识库灌库 —— 分批调 /api/cron/kb-index/,把四类内容写进 Vectorize。

为什么分批:一次几千条会超 Worker 的 CPU 时间上限,而且失败之后不知道断在哪。
分批 + 记录 offset,断了从上一批接着来。

用法:python tools/kb-fill.py            全部灌一遍
      python tools/kb-fill.py packaging  只灌某一类
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import api, preflight   # noqa: E402
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BATCH = 200
SCOPES = ["content", "ingredients", "formulas", "packaging"]


def fill(scope):
    off, total, t0 = 0, 0, time.time()
    while True:
        try:
            r = api("/api/cron/kb-index/", params={"scope": scope, "limit": BATCH, "offset": off},
                    method="POST", data=b"", timeout=180)
        except Exception as e:
            print(f"  × {scope} offset={off} 失败:{str(e)[:200]}")
            return total, False
        if not r.get("ok"):
            print(f"  × {scope} offset={off} 接口报错:{r}")
            return total, False
        n = int(r.get("indexed", 0))
        total += n
        if n:
            print(f"  {scope:<12} offset {off:>5} · 本批 {n:>3} · 累计 {total:>5} · {time.time()-t0:.0f}s", flush=True)
        if r.get("done"):
            return total, True
        off += BATCH


def main():
    preflight(need_keys=("CRON_KEY",))
    want = sys.argv[1:] or SCOPES
    grand = 0
    for s in want:
        if s not in SCOPES:
            print(f"跳过未知 scope:{s}")
            continue
        n, ok = fill(s)
        grand += n
        print(f"{s}:{n:,} 条{'' if ok else ' —— 中断,重跑会从头开始'}\n")
    print(f"合计灌入 {grand:,} 条")


if __name__ == "__main__":
    main()
