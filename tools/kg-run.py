#!/usr/bin/env python3
"""把 tools/.kg-src/ 的语料逐片喂进一个知识库(Knowledge Abstract)。

为什么要有这个跑法器,而不是一条 `he parse` 打天下:
  · 语料 25 万字,一次喂完要跑好几个小时,中间断了就全白跑。
    分片 + 台账,断了只重跑没做完的那一片。
  · 第一片用 `he parse` 建库,之后一律 `he feed` 追加 —— 用 parse 会把库覆盖掉。
  · Windows 控制台是 GBK,Hyper-Extract 的进度条字符(⠙)会直接把进程打崩
    (`UnicodeEncodeError: 'gbk' codec can't encode character '\\u2839'`),
    所以子进程必须带 PYTHONUTF8=1。

模型口径(2026-09-10 05:00 实测):
  · LLM = **agnes-2.5-flash**(apihub.agnes-ai.com)。白名单四家里当天只剩它有额度:
    agnes-2.5-pro 403 额度不足 · LongCat 402 · 商汤 kimi-k3 429 token plan exhausted。
    商汤 glm-5.2 之前跑得出(41节点/43边),额度耗尽后 `he` 会**静默返回空**,
    所以判成功只看节点/边有没有真的长出来,不看 CLI 打的 Success。
  · 同网关的 `deepseek-v4-pro` 节点抽得出、**超边一条不出**,别用。
  · Embedding 走 Cloudflare Workers AI 的 OpenAI 兼容端点(bge-m3,1024 维),
    商汤网关没有 /embeddings。

用法:
    python tools/kg-run.py                 按台账继续跑没做完的片
    python tools/kg-run.py --only ing      只跑原料那几片
    python tools/kg-run.py --status        看台账
"""
import argparse
import concurrent.futures as cf
import glob
import io
import json
import os
import subprocess
import sys
import threading
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, ".kg-src2")
KA = os.path.join(HERE, ".kg")
PARTS = os.path.join(HERE, ".kg-parts")
LEDGER = os.path.join(HERE, "_kg-ledger.json")
TPL = "general/hypergraph"


def ledger() -> dict:
    if os.path.exists(LEDGER):
        return json.loads(io.open(LEDGER, encoding="utf-8").read())
    return {}


def save(d: dict) -> None:
    io.open(LEDGER, "w", encoding="utf-8", newline="\n").write(
        json.dumps(d, ensure_ascii=False, indent=1))


def run(cmd: list, timeout: int = 5400) -> tuple:
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env, cwd=os.path.dirname(HERE),
                       timeout=timeout, shell=(os.name == "nt"))
    ok = "Success!" in (p.stdout or "")
    return ok, round(time.time() - t0), (p.stdout or p.stderr or "")[-400:]


def part_stats(d: str) -> tuple:
    f = os.path.join(d, "data.json")
    if not os.path.exists(f):
        return 0, 0
    j = json.loads(io.open(f, encoding="utf-8").read())
    return len(j.get("nodes") or []), len(j.get("edges") or [])


def merge() -> tuple:
    """把各分片库并成一个。节点按 name 去重,超边按 (name, 参与者集合) 去重。"""
    nodes, edges = {}, {}
    for d in sorted(glob.glob(os.path.join(PARTS, "*"))):
        f = os.path.join(d, "data.json")
        if not os.path.exists(f):
            continue
        j = json.loads(io.open(f, encoding="utf-8").read())
        for n in j.get("nodes") or []:
            k = (n.get("name") or "").strip()
            if k and k not in nodes:
                nodes[k] = n
        for e in j.get("edges") or []:
            k = ((e.get("name") or "").strip(),
                 tuple(sorted(e.get("participants") or [e.get("source", ""), e.get("target", "")])))
            if k[0] and k not in edges:
                edges[k] = e
    os.makedirs(KA, exist_ok=True)
    out = json.dumps({"nodes": list(nodes.values()), "edges": list(edges.values())},
                     ensure_ascii=False)
    io.open(os.path.join(KA, "data.json"), "w", encoding="utf-8", newline=chr(10)).write(out)
    return len(nodes), len(edges)


def stats() -> tuple:
    f = os.path.join(KA, "data.json")
    if not os.path.exists(f):
        return 0, 0
    d = json.loads(io.open(f, encoding="utf-8").read())
    return len(d.get("nodes") or []), len(d.get("edges") or [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--jobs", type=int, default=1)   # 免费额度只扛得住串行,见下方注释
    a = ap.parse_args()

    lg = ledger()
    files = sorted(glob.glob(os.path.join(SRC, "*.md")))
    if a.only:
        files = [f for f in files if a.only in os.path.basename(f)]

    if a.status:
        n, e = stats()
        done = sum(1 for f in files if lg.get(os.path.basename(f), {}).get("ok"))
        print(f"语料 {len(files)} 片 · 已完成 {done} 片 · 知识库 {n} 节点 / {e} 边")
        for f in files:
            b = os.path.basename(f)
            r = lg.get(b, {})
            print(f"  {'✓' if r.get('ok') else '·'} {b:<24}"
                  f"{(str(r.get('secs', '')) + 's') if r.get('secs') else '':>8}"
                  f"  {r.get('note', '')[:60]}")
        return

    todo = [f for f in files if not lg.get(os.path.basename(f), {}).get("ok")]
    # **并发只能是 1**。2026-09-10 05:01 拿 4 线程跑,61 片里 57 片在 10 秒内失败:
    #   429 "You've reached the API rate limit for free users"
    # agnes-2.5-flash 是免费档,一路请求就到顶;`he` 不重试,直接把空库存下来
    # 还打印 Success。串行(单片约 120s)实测稳。
    print(f"待跑 {len(todo)} 片 · 并发 {a.jobs} · 单片实测约 120s "
          f"· 预计 {len(todo) * 2 // 60} 小时 {len(todo) * 2 % 60} 分", flush=True)
    lock = threading.Lock()

    def one(f):
        b = os.path.basename(f)
        # **每片单独 parse 成独立库,不用 `he feed`**。
        # 实测(2026-09-10 04:50):`he feed` 对全新内容也只打印
        # 「Success! Knowledge appended」而节点数一个不涨 —— 1,087 字的小片同样如此,
        # 而同样内容走 `he parse` 能正常抽出 41 节点 / 43 边。
        # 也就是说 feed 这条路是坏的,而它坏得**没有任何错误输出**。
        # 绕开:分片各自建库,最后由 merge() 按名字去重合并。
        part = os.path.join(PARTS, b[:-3])
        cmd = ["he", "parse", f, "-t", TPL, "-o", part, "-l", "zh", "--force"]
        try:
            ok, secs, tail = run(cmd)
        except subprocess.TimeoutExpired:
            ok, secs, tail = False, 5400, "超时"
        n, e = part_stats(part)
        # **不信 CLI 的 Success**:实测它在模型没返回结果时照样打印成功,
        # 而节点数一个没涨。唯一算数的是节点/边**真的多了**。
        ok = ok and (n > 0 or e > 0)
        with lock:
            lg[b] = {"ok": ok, "secs": secs, "nodes": n, "edges": e,
                     # 失败一律留下模型那边的原话 —— 上一版只写「没长」,
                     # 结果 57 片全是同一句,分不清是限流还是抽不出东西。
                     "note": "" if ok else tail.replace(chr(10), " ")[-200:]}
            save(lg)
            done = sum(1 for v in lg.values() if v.get("ok"))
            print(f"[{time.strftime('%H:%M:%S')}] {'完成' if ok else '失败'} {b:<26}"
                  f"{secs:>4}s · {n:>4}节点/{e:>3}边 · 累计 {done}/{len(files)}", flush=True)
            if not ok:
                print("    " + tail[:200], flush=True)

    with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
        list(ex.map(one, todo))

    n, e = merge()   # 分片库合并进 .kg —— 不合并的话 stats() 读到的还是上一轮的旧库
    done = sum(1 for v in lg.values() if v.get("ok"))
    print(f"\n收工:{done}/{len(files)} 片 · 知识库 {n} 节点 / {e} 边")


if __name__ == "__main__":
    main()
