#!/usr/bin/env python3
"""部署帛卉网关云版(Cloudflare Worker bohui-gateway → gateway.biosphere-ai.com)。

    python tools/gateway/worker/deploy.py          # 建 KV(首次)→ deploy → 写 secrets → 验 /v1/models
    python tools/gateway/worker/deploy.py --secrets-only   # 只刷 secrets(换了 key 之后)

用 .env 里的 CLOUDFLARE_API_TOKEN / ACCOUNT_ID(经 _bohui._wenv,含 7890 代理兜底),别落到 OAuth 主账号。
secret GW_CONFIG = ~/.bohui-gateway/config.json 精简版(只留网关要的字段,去掉 proxy/label 以外的冗余);
secret GW_TOKEN  = ~/.bohui-gateway/TOKEN.txt(与本机版同一把令牌,客户端只需记一把)。
secret 超过平台上限(5KB)时退回 KV 的 config 键(Worker 两处都会读)。
"""
import os
import re
import sys
import json
import subprocess
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from _bohui import _wenv, E, http   # noqa: E402

DIR = os.environ.get("BOHUI_GATEWAY_DIR") or os.path.join(os.path.expanduser("~"), ".bohui-gateway")
TOML = os.path.join(HERE, "wrangler.toml")
HOST = "https://gateway.biosphere-ai.com"
ZONE = "38eac8524706eb1f7eaa6cf5d368cc52"   # biosphere-ai.com
KEEP = ("id", "label", "base_url", "model", "models", "keys", "tier", "can_text", "can_image", "can_vision", "weight", "ctx")


def wr(*args, stdin=None, timeout=300):
    p = subprocess.run(["npx", "wrangler", *args], cwd=HERE, env=_wenv(), shell=(os.name == "nt"), capture_output=True,
                       text=True, encoding="utf-8", errors="replace", input=stdin, timeout=timeout)
    out = re.sub(r"\x1b\[[0-9;]*m", "", (p.stdout or "") + (p.stderr or ""))
    return p.returncode, out


def main():
    cfg = json.load(open(os.path.join(DIR, "config.json"), encoding="utf-8"))
    token = open(os.path.join(DIR, "TOKEN.txt"), encoding="utf-8").read().strip()
    slim = {"aliases": cfg.get("aliases", {}), "compress": cfg.get("compress", True),
            "channels": [{k: c[k] for k in KEEP if k in c} for c in cfg["channels"]]}
    slim_txt = json.dumps(slim, ensure_ascii=False, separators=(",", ":"))
    print(f"  渠道 {len(slim['channels'])} 个,GW_CONFIG {len(slim_txt.encode('utf-8'))} 字节,令牌前 6 位 {token[:6]}")

    toml = open(TOML, encoding="utf-8").read()
    if "--secrets-only" not in sys.argv:
        if 'id = "REPLACE_ME"' in toml:
            rc, out = wr("kv", "namespace", "create", "BOHUI_GW")
            m = re.search(r'id\s*=\s*"([0-9a-f]{32})"', out)
            if not m:
                raise SystemExit(f"建 KV 失败:{out[-400:]}")
            toml = toml.replace('id = "REPLACE_ME"', f'id = "{m.group(1)}"')
            open(TOML, "w", encoding="utf-8", newline="\n").write(toml)
            print(f"  KV BOHUI_GW 已建:{m.group(1)}")
        rc, out = wr("deploy")
        m = re.search(r"Uploaded [^\r\n]+", out)
        print("  deploy:", ("ok " + (m.group(0) if m else "")) if rc == 0 else out[-600:])
        if rc != 0:
            raise SystemExit("deploy 失败")
        # 挂域名走账号级 API:wrangler 的 custom_domain 会先 GET zone 级 /workers/routes,.env 令牌没这权限(10000)
        try:
            http("https://api.cloudflare.com/client/v4/accounts/%s/workers/domains" % E["CLOUDFLARE_ACCOUNT_ID"], method="PUT",
                 data=json.dumps({"hostname": HOST.split("//")[1], "zone_id": ZONE, "service": "bohui-gateway", "environment": "production"}).encode(),
                 headers={"Authorization": "Bearer " + E["CLOUDFLARE_API_TOKEN"], "Content-Type": "application/json"}, timeout=40, retries=1)
            print(f"  域名 {HOST} 已挂到 bohui-gateway")
        except Exception as e:
            print(f"  挂域名失败(不影响 workers.dev):{str(e)[:200]}")

    rc, out = wr("secret", "put", "GW_TOKEN", stdin=token)
    print("  GW_TOKEN:", "ok" if rc == 0 else out[-300:])
    rc, out = wr("secret", "put", "GW_CONFIG", stdin=slim_txt)
    if rc == 0:
        print("  GW_CONFIG: ok(secret)")
        wr("kv", "key", "delete", "--binding", "BOHUI_GW", "--remote", "config")
    else:
        print(f"  GW_CONFIG 作 secret 失败({out.strip().splitlines()[-1][:120]})→ 改放 KV 的 config 键")
        wr("secret", "delete", "GW_CONFIG", stdin="y\n")   # 别让旧 secret 盖住 KV 里的新配置(Worker 先读 secret);实测 secret 上限 5.1KB,15 个渠道就超
        tmp = os.path.join(DIR, "logs", "_gw-config.json")
        open(tmp, "w", encoding="utf-8").write(slim_txt)
        rc, out = wr("kv", "key", "put", "--binding", "BOHUI_GW", "--remote", "config", "--path", tmp)
        os.remove(tmp)
        print("  KV config:", "ok" if rc == 0 else out[-300:])

    tplp = os.path.join(DIR, "render_templates.json")   # 提示词模板库 → KV templates 键(云版出图改写用)
    if os.path.exists(tplp):
        rc, out = wr("kv", "key", "put", "--binding", "BOHUI_GW", "--remote", "templates", "--path", tplp)
        print("  KV templates:", "ok" if rc == 0 else out[-200:])

    # 验:/v1/models 200(secrets 生效有几秒延迟,重试几次)
    import time
    for i in range(6):
        try:
            req = urllib.request.Request(HOST + "/v1/models", headers={"Authorization": f"Bearer {token}", "User-Agent": "bohui-deploy"})
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=30) as f:
                n = len(json.loads(f.read().decode("utf-8")).get("data", []))
                print(f"  验证 GET {HOST}/v1/models → 200,{n} 个模型")
                break
        except Exception as e:
            print(f"  验证第 {i + 1} 次:{str(e)[:100]}")
            time.sleep(5)


if __name__ == "__main__":
    main()
