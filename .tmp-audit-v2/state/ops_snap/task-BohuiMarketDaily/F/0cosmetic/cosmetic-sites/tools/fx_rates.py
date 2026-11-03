#!/usr/bin/env python3
"""汇率刷新(每天一次,进 D1 fx_rates,USD 基准)。源:open.er-api.com(免费、无 key、每日更新);失败就保留昨天的。用法:python tools/fx_rates.py"""
import io, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1_exec, proxy_url  # noqa: E402
WANT = ["USD", "EUR", "GBP", "CNY", "IDR", "MYR", "SGD", "THB", "VND", "PHP", "SAR", "AED", "EGP", "TRY", "INR", "JPY", "KRW", "AUD", "CAD", "BRL", "MXN", "HKD", "TWD", "NZD", "ZAR", "NGN", "PKR"]
try:
    px = proxy_url(); opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": px, "https": px})) if px else urllib.request.build_opener()   # 默认直连;设了 BOHUI_PROXY 才走代理
    with opener.open("https://open.er-api.com/v6/latest/USD", timeout=40) as r: d = json.load(r)
    assert d.get("result") in ("ok", "success"), d
except Exception as e: print("汇率源失败,保留旧值:", str(e)[:120]); sys.exit(1)
rates = {k: v for k, v in d["rates"].items() if k in WANT}
sql = "\n".join(f"INSERT INTO fx_rates (code, rate, updated_at) VALUES ('{k}', {v}, datetime('now')) ON CONFLICT(code) DO UPDATE SET rate=excluded.rate, updated_at=excluded.updated_at;" for k, v in rates.items())
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_fx.sql"); io.open(out, "w", encoding="utf-8", newline="\n").write(sql + "\n")
print("汇率", len(rates), "条 · 源更新", d.get("time_last_update_utc", "?")[:16], "→", d1_exec(out))
