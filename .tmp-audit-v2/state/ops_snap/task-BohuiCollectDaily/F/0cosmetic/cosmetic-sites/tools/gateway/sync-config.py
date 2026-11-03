#!/usr/bin/env python3
"""从线上 D1 providers 生成本机帛卉网关的配置。

写到 ~/.bohui-gateway/config.json —— 密钥只在这一个本机文件里,不进仓库。
(不用 %LOCALAPPDATA%:Claude 桌面版是 MSIX 包,从它里面写 AppData 会被虚拟化到 Packages/Claude_*/LocalCache,
 计划任务与 WorkBuddy 看不到;用户根目录两边一致 —— 2026-09-18 实测。)
同时生成网关令牌 TOKEN.txt(已存在就不动;网关本身也会补)。

    python tools/gateway/sync-config.py            # 同步(网关正在跑的话下一个请求自动重载)
    python tools/gateway/sync-config.py --show     # 只看会生成什么,不写

取 enabled=1 且 id 以 sensenova / agnes 开头的行:每行一个渠道,api_keys 逗号拆成 key 池。
base_url 是 .com 的(apihub.agnes-ai.com)配 proxy=127.0.0.1:7890 —— 网关先直连,连不上才走它;
.cn 的(token.sensenova.cn / apihub.agnes-ai.cn)国内直连,不配代理。
已有 config.json 里的 port / aliases 保留(手改的别名不被冲掉)。
"""
import os
import sys
import json
import socket
import secrets
import datetime
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _bohui import d1   # noqa: E402

DIR = os.environ.get("BOHUI_GATEWAY_DIR") or os.path.join(os.path.expanduser("~"), ".bohui-gateway")
CFG = os.path.join(DIR, "config.json")
TOK = os.path.join(DIR, "TOKEN.txt")
PROXY = os.environ.get("BOHUI_PROXY", "http://127.0.0.1:7890")
SQL = ("SELECT id,label,base_url,model,api_keys,tier,can_text,can_image,can_vision,vision_model FROM providers "
       "WHERE enabled=1 AND (id LIKE 'sensenova%' OR id LIKE 'agnes%') ORDER BY tier, id")


def port_free(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def main():
    show = "--show" in sys.argv
    rows = d1(SQL)
    if not rows:
        raise SystemExit("D1 没返回任何渠道(网络抖动或表空)—— 不动现有 config.json")
    old = {}
    if os.path.exists(CFG):
        try:
            old = json.load(open(CFG, encoding="utf-8"))
        except Exception as e:
            print(f"  现有 config.json 解析失败({e}),按新建处理")
    # 0.3.1 起 key 以 gw_keys 为准(后台「上游 key」区块可加/停/删);按账号取,没有才退回 providers.api_keys
    gk = {}
    for k in d1("SELECT account, secret FROM gw_keys WHERE project='bohui' AND status='active' ORDER BY priority, id") or []:
        gk.setdefault(k["account"], []).append(k["secret"])
    account_of = lambda u: "sensenova" if "sensenova" in u else "agnes" if "agnes" in u else urlparse(u).hostname
    channels = []
    for r in rows:
        keys = gk.get(account_of(r["base_url"])) or [k.strip() for k in str(r["api_keys"] or "").replace("\n", ",").split(",") if k.strip()]
        if not keys:
            print(f"  跳过 {r['id']}:没有 key")
            continue
        host = urlparse(r["base_url"]).hostname or ""
        models = [m for m in dict.fromkeys([r["model"], r.get("vision_model")]) if m]
        channels.append({
            "id": r["id"], "label": r["label"], "base_url": r["base_url"].rstrip("/"),
            "model": r["model"], "models": models, "keys": keys, "tier": r["tier"],
            "can_text": r["can_text"], "can_image": r["can_image"], "can_vision": r["can_vision"],
            "proxy": PROXY if host.endswith(".com") else "",
        })
    cfg = {"port": old.get("port") or (8787 if port_free(8787) else 8788),
           "synced_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "channels": channels}
    if old.get("aliases"):
        cfg["aliases"] = old["aliases"]

    print(f"  端口 {cfg['port']}  渠道 {len(channels)} 个:")
    for c in channels:
        print(f"    {c['id']:<20} {'/'.join(c['models']):<42} key×{len(c['keys'])}  {'直连→代理' if c['proxy'] else '直连'}")
    if show:
        return
    os.makedirs(DIR, exist_ok=True)
    with open(CFG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    if not os.path.exists(TOK):
        with open(TOK, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32) + "\n")
        print(f"  已生成网关令牌 {TOK}")
    tok = open(TOK, encoding="utf-8").read().strip()
    print(f"  已写 {CFG};令牌前 6 位 {tok[:6]}")
    # 莱诺鸟提示词模板库 → render_templates.json(出图 / 出视频前的提示词改写用;网关按文件 mtime 自动重载;daily.bat 每天刷)
    tpl = d1("SELECT id, category, name, template_en, template_zh, notes FROM render_templates ORDER BY id")
    if tpl:
        with open(os.path.join(DIR, "render_templates.json"), "w", encoding="utf-8") as f:
            json.dump(tpl, f, ensure_ascii=False, indent=1)
        print(f"  模板库 {len(tpl)} 条 → render_templates.json")
    else:
        print("  模板库没取到(保留旧文件)")


if __name__ == "__main__":
    main()
