#!/usr/bin/env python3
"""驱动 Worker 把 R2 图片从旧账号搬到新账号。

创始人 2026-09-07:「又要修改 api 吗,能不能一次性到位」。
所以这一版不要任何新凭据:Worker 手里本来就有旧桶的 S3 密钥,
新桶挂成原生绑定(PHOTO),读旧写新全在 Worker 里完成。
本地那份 551 MB 中转留着当备份,但迁移不再依赖它。

这个脚本只做三件事:出 key 清单、分批 POST、记账。
零删除:源桶一个字节都不动。
"""
import io
import os
import sys
import json
import time
import argparse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "tools", "r2-migrate.json")
STATE = os.path.join(ROOT, "tools", "r2-copy-state.json")
API = "https://biosphere-ai.com/api/cron/r2-copy"


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()
CRON = E.get("CRON_KEY")
if not CRON:
    raise SystemExit(".env 里没有 CRON_KEY")


def post(keys, timeout):
    req = urllib.request.Request(
        API, data=json.dumps({"keys": keys}).encode(),
        headers={"Content-Type": "application/json", "x-cron-key": CRON,
                 "User-Agent": "bohui-r2-migrate/1"})
    with urllib.request.urlopen(req, timeout=timeout) as f:
        return json.loads(f.read().decode("utf-8", "replace"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=60)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=100000)
    ap.add_argument("--timeout", type=int, default=180)
    a = ap.parse_args()

    led = json.load(io.open(LEDGER, encoding="utf-8"))
    all_keys = sorted(led["objects"].keys())
    done = set()
    if os.path.exists(STATE):
        done = set(json.load(io.open(STATE, encoding="utf-8")).get("done", []))
    todo = [k for k in all_keys if k not in done][:a.limit]
    print(f"源桶 {len(all_keys):,} 个 · 已搬 {len(done):,} · 本次待搬 {len(todo):,}")
    if not todo:
        print("全部搬完了")
        return

    batches = [todo[i:i + a.batch] for i in range(0, len(todo), a.batch)]
    print(f"分 {len(batches)} 批,每批 {a.batch} 个,{a.workers} 路并发\n")

    tot = {"copied": 0, "skipped": 0, "failed": 0, "bytes": 0}
    t0 = time.time()
    errs = []

    def run(i_b):
        i, b = i_b
        try:
            r = post(b, a.timeout)
            return i, b, r, None
        except Exception as e:
            return i, b, None, str(e)[:100]

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for i, b, r, err in ex.map(run, list(enumerate(batches))):
            if err or not (r and r.get("ok")):
                errs.append(f"批 {i}: {err or r}")
                continue
            for k in ("copied", "skipped", "failed", "bytes"):
                tot[k] += r.get(k, 0)
            # 只有整批没有失败才记为已完成,失败的下次重来
            if r.get("failed", 0) == 0:
                done.update(b)
            for e in (r.get("errors") or [])[:2]:
                errs.append(f"批 {i}: {e}")
            if (i + 1) % 10 == 0 or i + 1 == len(batches):
                el = time.time() - t0
                print(f"  {i+1}/{len(batches)} 批 · 已传 {tot['copied']:,} · 跳过 {tot['skipped']:,} "
                      f"· 失败 {tot['failed']:,} · {tot['bytes']/1024/1024:.0f} MB · {el:.0f} 秒")

    io.open(STATE, "w", encoding="utf-8", newline="\n").write(
        json.dumps({"done": sorted(done)}, ensure_ascii=False))
    print(f"\n合计:新传 {tot['copied']:,} · 已存在跳过 {tot['skipped']:,} · 失败 {tot['failed']:,} "
          f"· {tot['bytes']/1024/1024:.1f} MB · {time.time()-t0:.0f} 秒")
    left = len(all_keys) - len(done)
    print(f"剩余 {left:,} 个" if left else "全部搬完 —— 源桶原样保留,一个字节都没动")
    for e in errs[:10]:
        print(f"  ⚠ {e}")


if __name__ == "__main__":
    main()
