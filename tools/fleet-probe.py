#!/usr/bin/env python3
"""逐家探活 AI 舰队 —— 从**本机**出口测,和 Workers 出口对照。

2026-09-07 的事故:资讯管线三天没产出。根因之一是所有模型从 Cloudflare Workers
出去都返回 `429 error code: 1015` —— 那是 Cloudflare 自己的限流码,
说明供应商在拦从 Workers IP 段过来的请求,不是我们的额度问题。

后台的 /api/admin/fleet-health 要登录态,排障时用不上;
这个脚本走本机出口,不需要登录,直接说清「哪家活着、多快、报什么错」。

只读:不改任何配置,不写库。
凭据从 D1 的 providers 表读,不回显。
"""
import io
import os
import re
import sys
import json
import time
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def d1(sql):
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
    try:
        return json.loads(raw[raw.index("[\n  {"):raw.rindex("]") + 1])[0]["results"]
    except Exception:
        print(raw[-400:])
        raise SystemExit("取不到 providers")


def ping(p):
    keys = [k.strip() for k in str(p["api_keys"] or "").replace("\n", ",").split(",") if k.strip()]
    if not keys:
        return p["id"], p["tier"], False, 0, "没有 key"
    base = (p["base_url"] or "").rstrip("/")
    body = json.dumps({"model": p["model"],
                       "messages": [{"role": "user", "content": "ping"}],
                       "max_tokens": 4}).encode()
    req = urllib.request.Request(f"{base}/chat/completions", data=body, headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {keys[0]}"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as f:
            f.read(400)
        return p["id"], p["tier"], True, int((time.time() - t0) * 1000), "正常"
    except urllib.error.HTTPError as e:
        txt = ""
        try:
            txt = e.read(220).decode("utf-8", "replace")
        except Exception:
            pass
        # 生图/生视频模型用聊天接口探活必然 400,那是通道活着
        alive = e.code == 400 and ("image" in txt.lower() or "video" in txt.lower())
        return p["id"], p["tier"], alive, int((time.time() - t0) * 1000), \
            f"HTTP {e.code} {re.sub(r'\\s+', ' ', txt)[:90]}"
    except Exception as e:
        return p["id"], p["tier"], False, int((time.time() - t0) * 1000), f"{type(e).__name__}: {str(e)[:70]}"


def main():
    rows = d1("SELECT id, tier, base_url, model, api_keys FROM providers WHERE enabled=1 ORDER BY tier, id")
    print(f"从**本机**出口探活 {len(rows)} 家(对照组:Workers 出口全部 429/1015)\n")
    print(f"  {'档':>2} {'供应商':<16} {'通':^4} {'毫秒':>7}  说明")
    ok_list = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = sorted(ex.map(ping, rows), key=lambda r: (r[1], r[0]))
    for pid, tier, ok, ms, note in res:
        mark = "✅" if ok else "❌"
        print(f"  {tier:>2} {pid:<16} {mark:^4} {ms:>7}  {note}")
        if ok:
            ok_list.append(pid)
    print(f"\n  本机可用 {len(ok_list)} / {len(rows)} 家:{', '.join(ok_list) if ok_list else '(无)'}")
    if ok_list:
        print("  → 说明凭据与额度都没问题,被拦的是 Workers 这条出口。"
              "\n    AI 调用应当从本机 / GitHub Actions 发起,Workers 只负责读写数据。")


if __name__ == "__main__":
    main()
