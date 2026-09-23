#!/usr/bin/env python3
"""Cloudflare 全局操作台 —— 一次配好凭据,以后不再"权限不足"。

为什么有这个东西(2026-09-04):
  之前每做一件事就撞一次权限墙 —— 改 HTTPS 跳转、修 www、加路由,
  每次都要停下来找创始人开权限,活干不下去。根因是凭据只覆盖 Workers/D1,
  而且**没有任何办法提前知道缺哪一项**,总是做到一半才发现。
  所以这里做两件事:① 凭据自动择优(全局密钥优先,退回受限令牌);
  ② `check` 子命令一次性把所有要用的权限探一遍,缺什么当场列出来。

凭据从 .env 读,优先级:
  ① CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY   全局密钥(账号全权,一次配置永久可用)
  ② CLOUDFLARE_API_TOKEN                     受限令牌(按勾选的权限)
密钥只在内存里用,不打印、不写日志、不进任何输出。

用法:
  python tools/cf.py check                     权限自检:列出每一项能不能用
  python tools/cf.py zone                      查区域基本信息与 HTTPS 相关设置
  python tools/cf.py https-on                  打开 Always Use HTTPS / 自动重写 / TLS1.2 下限
  python tools/cf.py dns                       列 DNS 记录
  python tools/cf.py fix-www                   修 www:删冲突记录 → 指向主域 → 挂 Worker 路由
  python tools/cf.py purge                     清 CDN 缓存
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

# Windows 控制台默认 GBK,✓✗ 这类符号会直接抛 UnicodeEncodeError —— 强制 UTF-8 输出
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.cloudflare.com/client/v4"
DOMAIN = os.environ.get("CF_DOMAIN", "biosphere-ai.com")
WORKER = os.environ.get("CF_WORKER", "bohui-web")


def env():
    """只从 .env 读,不接受命令行传密钥 —— 免得进 shell 历史。"""
    out = {}
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8", errors="replace"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("CLOUDFLARE_EMAIL", "CLOUDFLARE_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"):
        if os.environ.get(k):
            out[k] = os.environ[k]
    return out


E = env()


def auth_headers():
    if E.get("CLOUDFLARE_EMAIL") and E.get("CLOUDFLARE_API_KEY"):
        return {"X-Auth-Email": E["CLOUDFLARE_EMAIL"], "X-Auth-Key": E["CLOUDFLARE_API_KEY"]}, "全局密钥"
    if E.get("CLOUDFLARE_API_TOKEN"):
        return {"Authorization": "Bearer " + E["CLOUDFLARE_API_TOKEN"]}, "受限令牌"
    print("✗ .env 里既没有全局密钥也没有令牌")
    sys.exit(2)


HDR, MODE = auth_headers()


def api(path, method="GET", body=None, quiet=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("content-type", "application/json")
    for k, v in HDR.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        try:
            d = json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            d = {"success": False, "errors": [{"message": f"HTTP {e.code}"}]}
        if not quiet:
            pass
        return d


def errmsg(d):
    return "; ".join(str(x.get("message", x)) for x in (d.get("errors") or []))[:90] or "未知错误"


def zone_id():
    d = api(f"/zones?name={DOMAIN}")
    if not d.get("success") or not d.get("result"):
        print(f"✗ 查不到区域 {DOMAIN}:{errmsg(d)}")
        sys.exit(1)
    return d["result"][0]["id"]


# ── 权限自检 ────────────────────────────────────────────────────────
def cmd_check():
    acct = E.get("CLOUDFLARE_ACCOUNT_ID", "")
    print(f"凭据方式:{MODE}   域名:{DOMAIN}\n")
    z = None
    d = api(f"/zones?name={DOMAIN}", quiet=True)
    ok_zone = bool(d.get("success") and d.get("result"))
    if ok_zone:
        z = d["result"][0]["id"]
    rows = [("区域 读取", ok_zone, "" if ok_zone else errmsg(d))]

    def probe(label, path, need_write=False, body=None):
        r = api(path, "PATCH" if need_write else "GET", body, quiet=True)
        rows.append((label, bool(r.get("success")), "" if r.get("success") else errmsg(r)))
        return r

    if z:
        probe("区域设置 读取", f"/zones/{z}/settings/always_use_https")
        probe("DNS 读取", f"/zones/{z}/dns_records?per_page=1")
        probe("Workers 路由 读取", f"/zones/{z}/workers/routes")
        # 写权限用"把设置改成它当前的值"来探,不会造成任何实际变更
        cur = api(f"/zones/{z}/settings/always_use_https", quiet=True)
        if cur.get("success"):
            probe("区域设置 写入", f"/zones/{z}/settings/always_use_https", True,
                  {"value": cur["result"]["value"]})
    if acct:
        probe("Workers 脚本 读取", f"/accounts/{acct}/workers/scripts")
        probe("D1 读取", f"/accounts/{acct}/d1/database")
        probe("R2 读取", f"/accounts/{acct}/r2/buckets")

    w = max(len(r[0]) for r in rows)
    miss = 0
    for name, ok, why in rows:
        print(f"  {name.ljust(w)}  {'✓' if ok else '✗ ' + why}")
        miss += 0 if ok else 1
    print()
    print("全部通过,可以放手干。" if not miss else f"缺 {miss} 项 —— 上面打 ✗ 的就是要补的权限。")


def cmd_zone():
    z = zone_id()
    print(f"区域 {DOMAIN}  id={z}\n")
    for s in ("always_use_https", "automatic_https_rewrites", "ssl", "min_tls_version", "tls_1_3", "browser_check"):
        d = api(f"/zones/{z}/settings/{s}", quiet=True)
        v = d["result"]["value"] if d.get("success") else "✗ " + errmsg(d)
        print(f"  {s.ljust(26)} {v}")


def cmd_https_on():
    z = zone_id()
    want = {"always_use_https": "on", "automatic_https_rewrites": "on", "min_tls_version": "1.2"}
    for k, v in want.items():
        d = api(f"/zones/{z}/settings/{k}", "PATCH", {"value": v})
        print(f"  {k.ljust(26)} {'✓ 已设为 ' + v if d.get('success') else '✗ ' + errmsg(d)}")


def cmd_dns():
    z = zone_id()
    d = api(f"/zones/{z}/dns_records?per_page=50")
    if not d.get("success"):
        print("✗", errmsg(d))
        return
    for r in d["result"]:
        print(f"  {r['type']:6} {r['name']:34} → {str(r['content'])[:38]:40} 代理={r['proxied']}  id={r['id']}")


def cmd_fix_www():
    """www 现在解析到 Cloudflare 却没人接管(503)。
       做法:把 www 的记录改成指向主域并开代理,再把 Worker 路由挂上去。"""
    z = zone_id()
    host = f"www.{DOMAIN}"
    d = api(f"/zones/{z}/dns_records?name={host}")
    if not d.get("success"):
        print("✗ 读 DNS 失败:", errmsg(d))
        return
    recs = d["result"]
    if recs:
        for r in recs:
            print(f"  现有记录 {r['type']} {r['name']} → {r['content']} 代理={r['proxied']}")
        r = recs[0]
        u = api(f"/zones/{z}/dns_records/{r['id']}", "PATCH",
                {"type": "CNAME", "name": host, "content": DOMAIN, "proxied": True})
        print("  改为 CNAME → 主域并开代理:", "✓" if u.get("success") else "✗ " + errmsg(u))
    else:
        c = api(f"/zones/{z}/dns_records", "POST",
                {"type": "CNAME", "name": host, "content": DOMAIN, "proxied": True})
        print("  新建 CNAME www → 主域:", "✓" if c.get("success") else "✗ " + errmsg(c))

    rt = api(f"/zones/{z}/workers/routes", "POST", {"pattern": f"{host}/*", "script": WORKER})
    if rt.get("success"):
        print(f"  路由 {host}/* → {WORKER}:✓")
    else:
        msg = errmsg(rt)
        print(f"  路由 {host}/* → {WORKER}:{'已存在,跳过' if 'exists' in msg or '10020' in msg else '✗ ' + msg}")


def cmd_purge():
    z = zone_id()
    d = api(f"/zones/{z}/purge_cache", "POST", {"purge_everything": True})
    print("  清缓存:", "✓" if d.get("success") else "✗ " + errmsg(d))


CMDS = {"check": cmd_check, "zone": cmd_zone, "https-on": cmd_https_on,
        "dns": cmd_dns, "fix-www": cmd_fix_www, "purge": cmd_purge}

if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else "check"
    if c not in CMDS:
        print("可用命令:", " ".join(CMDS))
        sys.exit(2)
    CMDS[c]()
