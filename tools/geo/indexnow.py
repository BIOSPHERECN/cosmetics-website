#!/usr/bin/env python3
"""IndexNow + sitemap 推送(2026-09-18 接 tools/indexnow.py 的台账思路,改成每日自动跑)。

做什么:
  · 读 sitemap.xml 六个分片,取 <loc> 与 <lastmod>;要推的 = 台账里没推过的 + lastmod 在近 7 天内的(改过的页要重抓)
  · 分别 POST 到 Bing / Yandex / Seznam 三个 IndexNow 端点(各自记返回码;IndexNow 协议是一家收到会同步给其它家,但三家都发,返回码各自可见)
  · Google 不参与 IndexNow → 只 ping sitemap 索引(https://www.google.com/ping?sitemap=…;Google 2023 起已弃用 ping 接口,
    这里仍打一次并记录返回码,收录靠 Search Console 提交的 sitemap 与 lastmod,见后台「获客进展」的登记步骤)
  · 把本次结果写 pulse 表 k='indexnow'(sitemap 页数 / 分片 / 提交数 / 各端点返回码 / 台账累计),后台「获客进展」读这一行
  · 台账 tools/indexnow.json 沿用(已推过的地址不重复推 —— 同一批反复推会掉信用)

key:从 .env 读 INDEXNOW_KEY;没有就生成一个写进 .env 并提示 —— 新 key 的 {key}.txt 必须随下一次构建发布到站根后,IndexNow 才会认(否则 403 / 422)。
纪律:只推自己 sitemap 里已公开的地址;一次最多 10,000 条;默认只看不发,--submit 才真发。

用法:
  python tools/geo/indexnow.py             看这次会推多少
  python tools/geo/indexnow.py --submit    真发 + 写 pulse(计划任务 BohuiCollectDaily 每日 05:40 走这条)
  python tools/geo/indexnow.py --submit --all   忽略台账全量重推(慎用)
"""
import argparse, io, json, os, re, secrets, sys, time, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import http, d1_exec, E  # noqa: E402

HOST = "biosphere-ai.com"
PARTS = ["pages", "news", "formulas", "packaging", "ingredients", "decoder"]
LEDGER = os.path.join(ROOT, "tools", "indexnow.json")
ENDPOINTS = {"bing": "https://www.bing.com/indexnow", "yandex": "https://yandex.com/indexnow", "seznam": "https://search.seznam.cz/indexnow"}
BATCH = 10000
FRESH_DAYS = 7


def key():
    k = E.get("INDEXNOW_KEY", "").strip()
    if not k:
        k = secrets.token_hex(16)
        with io.open(os.path.join(ROOT, ".env"), "a", encoding="utf-8") as f:
            f.write(f"\nINDEXNOW_KEY={k}\n")
        print(f"! .env 里没有 INDEXNOW_KEY,已生成并写入:{k}\n  下一次构建发布后 https://{HOST}/{k}.txt 才在线上,IndexNow 才会认;在那之前提交会 403。")
    kf = os.path.join(ROOT, "apps", "web", "public", f"{k}.txt")
    if not os.path.exists(kf) or io.open(kf, encoding="utf-8").read().strip() != k:
        io.open(kf, "w", encoding="utf-8", newline="\n").write(k)
        print(f"  key 文件已写 {kf}(随下一次构建发布)")
    return k


def ledger():
    """{url: 推送时的 lastmod}。旧台账是列表(不知道当时的 lastmod),按 '' 迁入 —— 改过的页第一次仍会重推一遍。"""
    try:
        sent = json.load(io.open(LEDGER, encoding="utf-8"))["sent"]
        return sent if isinstance(sent, dict) else {u: "" for u in sent}
    except Exception: return {}


def save(sent):
    tmp = LEDGER + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(json.dumps({"sent": sent}, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    os.replace(tmp, LEDGER)


def sitemap():
    """→ ([(loc, lastmod|None)], {part: n})"""
    urls, parts = [], {}
    for p in PARTS:
        try:
            xml = http(f"https://{HOST}/sitemap.xml?part={p}", timeout=180).decode("utf-8", "replace")
        except Exception as e:
            print(f"  {p:<12} 拉取失败 {str(e)[:80]}"); parts[p] = None; continue
        found = re.findall(r"<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?", xml)
        parts[p] = len(found); urls += [(u, m or None) for u, m in found]
        print(f"  {p:<12} {len(found):>6,} 条")
    return urls, parts


def post(name, url, k, chunk):
    body = json.dumps({"host": HOST, "key": k, "keyLocation": f"https://{HOST}/{k}.txt", "urlList": chunk}).encode()
    try:
        http(url, data=body, timeout=120, retries=2, headers={"Content-Type": "application/json; charset=utf-8"})
        return 200   # urllib 把 200/202 都当成功,协议里 202 = 已收下
    except Exception as e:
        m = re.search(r"HTTP (\d{3})", str(e)); return int(m.group(1)) if m else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submit", action="store_true"); ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    k = key()
    try:
        live = http(f"https://{HOST}/{k}.txt", timeout=30).decode().strip() == k
    except Exception:
        live = False
    print(f"key 文件线上{'已就位' if live else '还没上线(提交会被拒,等下一次发布)'} https://{HOST}/{k}.txt")

    print("读 sitemap:")
    urls, parts = sitemap()
    total = len(urls); sent = {} if a.all else ledger()
    cutoff = (dt.date.today() - dt.timedelta(days=FRESH_DAYS)).isoformat()
    mod = {u: (m or "")[:10] for u, m in urls}
    new = [u for u, _ in urls if u not in sent]
    # 近 7 天改过且 lastmod 与上次推送时不同的才重推 —— 同一批地址反复推会掉信用;新增在前,一次 POST 最多 BATCH 条,分批发
    fresh = [u for u, m in urls if u in sent and m and m[:10] >= cutoff and sent[u] != m[:10]]
    todo = list(dict.fromkeys(new + fresh))
    print(f"\nsitemap 共 {total:,} 条 · 台账已推 {len(sent):,} · 新增 {len(new):,} · 近 {FRESH_DAYS} 天改过 {len(fresh):,} · 这次要推 {len(todo):,}")

    codes, ok = {}, 0
    if a.submit and todo and live:
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            for name, ep in ENDPOINTS.items():
                c = post(name, ep, k, chunk); codes[name] = c
                print(f"  {name:<7} {c} ({len(chunk):,} 条)")
            if any(c in (200, 202) for c in codes.values()):
                ok += len(chunk); sent.update({u: mod.get(u, "") for u in chunk}); save(sent)
    elif a.submit and not todo:
        print("没有要推的")
    elif not a.submit:
        print("只看不发。要真发加 --submit")
    # Google:没有 IndexNow,ping sitemap 索引(接口已弃用但无害,返回码照记)
    if a.submit:
        try:
            http(f"https://www.google.com/ping?sitemap=https://{HOST}/sitemap.xml", timeout=30, retries=1); codes["google-ping"] = 200
        except Exception as e:
            m = re.search(r"HTTP (\d{3})", str(e)); codes["google-ping"] = int(m.group(1)) if m else 0
        print(f"  google-ping {codes['google-ping']}(Google 不参与 IndexNow;收录靠 Search Console 的 sitemap 与 lastmod)")
        # 写 pulse,后台「获客进展」读
        snap = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "sitemap_total": total, "parts": parts, "new": len(new), "fresh": len(fresh),
                "submitted": ok, "codes": codes, "ledger": len(sent), "key_live": live}
        sql = os.path.join(ROOT, "tools", "_indexnow-pulse.sql")
        io.open(sql, "w", encoding="utf-8", newline="\n").write(
            "INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('indexnow', '" + json.dumps(snap, ensure_ascii=False).replace("'", "''") + "', datetime('now'));\n")
        print(f"  pulse 写入 {'成功' if d1_exec(sql) else '失败'}")
        if a.submit and todo and live and not ok:
            print("一条都没推成功,上面的返回码就是原因(403 = key 文件没被读到;422 = 地址不在这个 host 下;429 = 推太勤)"); sys.exit(1)
    print(f"完成:提交 {ok:,} 条 · 返回码 {codes or '—'}")


if __name__ == "__main__":
    main()
