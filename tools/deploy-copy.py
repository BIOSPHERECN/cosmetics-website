#!/usr/bin/env python3
"""把整套站点(代码 + 内容库)复制一份部署到创始人自己的 Cloudflare 账号(hosonzuo@gmail.com,OAuth 登录的那个)。

由来:创始人 2026-09-11 00:5x「你整理好之后,就复制一套代码到我的CF账号,我们准备另外发布一套系统,
这边将进行全面的草本风格的改变」。公司站(biosphere-ai.com,Huanggw20 账号,.env 里的 token)不动;
这份副本独立跑在他的账号里,之后两边各改各的。

两个账号怎么区分(memory: wrangler 双账号陷阱):
    带 .env(CLOUDFLARE_API_TOKEN / ACCOUNT_ID)→ 公司账号 894467…;
    去掉这两个变量 → wrangler 用本机 OAuth token → hosonzuo 账号 b7362e…。
本脚本只在「导出公司库」这一步用公司凭据,其余全部走 OAuth。

做什么(幂等,可重复跑):
    1. hosonzuo 账号里建 D1 `bohui-cms-v2`、KV `SESSION`、Vectorize `bohui-kb`(1024/cosine);已有就复用。
    2. 用刚构建好的 dist/server/wrangler.json 生成 wrangler.copy.json:Worker 名改成 `biosphere-ai`
       (tenant-map 按 *.workers.dev 第一段认站,叫这个名字不用改代码就落到 biosphere-ai 站),
       换掉 D1 / KV id;TURNSTILE_SITE_KEY 清空(site key 绑定 biosphere-ai.com 域名,workers.dev 上会挡住登录)。
       R2 绑定 `bohui-photo` 用他账号里同名的桶(memory: 两个账号同名 bohui-photo)。
    3. wrangler deploy;secrets 从 .env 取(R2_* / AUTH_SECRET / CRON_KEY / ANYSEARCH_KEY),不设 TURNSTILE_SECRET。
    4. 公司库 `wrangler d1 export` → 他账号 `wrangler d1 execute --file` 导入(47.9 MB,53 张表)。
    5. 打副本首页与 /zh-cn/inci/ 看 200。

用法:
    python tools/deploy-copy.py --dry       只打印会做什么
    python tools/deploy-copy.py             全做
    python tools/deploy-copy.py --skip-db   不导库(只更新代码)
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "apps", "web")
DIST = os.path.join(WEB, "dist", "server")
NAME = os.environ.get("COPY_WORKER_NAME", "skin2oem")  # 创始人 2026-09-11 17:2x「CF 个人号改 skin2oem」;旧名 biosphere-ai
DB_NAME = "bohui-cms-v2"


def env_of(company: bool):
    e = dict(os.environ)
    if company:
        for ln in io.open(os.path.join(ROOT, ".env"), encoding="utf-8"):
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1); e[k] = v.strip().strip('"').strip("'")
    else:
        e.pop("CLOUDFLARE_API_TOKEN", None); e.pop("CLOUDFLARE_ACCOUNT_ID", None)
    return e


def run(args, company=False, cwd=WEB, check=True, capture=True, timeout=1800, tries=4):
    """本机经代理打 Cloudflare API 时不时 timed out(2026-09-11 01:23 连着两次),
    只读 / 幂等的命令重试几次再放弃;非零退出且不是超时的才立刻报错。"""
    last = ""
    for i in range(tries):
        p = subprocess.run(["npx", "wrangler"] + args, cwd=cwd, env=env_of(company), shell=True, capture_output=capture, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        out = (p.stdout or "") + (p.stderr or "")
        if p.returncode == 0:
            return out
        last = out
        if "timed out" not in out and "ETIMEDOUT" not in out and "fetch failed" not in out:
            break
        print(f"  [{' '.join(args[:2])}] API 超时,第 {i + 1} 次重试…"); time.sleep(8 * (i + 1))
    if check:
        raise SystemExit(f"wrangler {' '.join(args)} 失败:\n{last[-1500:]}")
    return last


def first_json(out: str):
    """wrangler 的 --json 输出前后夹着代理警告 / 更新提示,只取第一个 JSON 值。"""
    i = min(x for x in (out.find("["), out.find("{")) if x >= 0)
    val, _ = json.JSONDecoder().raw_decode(out[i:])
    return val


def ensure_d1():
    out = run(["d1", "list", "--json"])
    for d in first_json(out):
        if d.get("name") == DB_NAME:
            print("  D1 已有", d["uuid"]); return d["uuid"]
    out = run(["d1", "create", DB_NAME])
    m = re.search(r'database_id\s*=\s*"([0-9a-f-]{36})"', out) or re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", out)
    print("  D1 新建", m.group(1)); return m.group(1)


def ensure_kv():
    out = run(["kv", "namespace", "list"])
    for ns in first_json(out):
        if ns.get("title") in ("biosphere-ai-SESSION", "SESSION"):
            print("  KV 已有", ns["id"]); return ns["id"]
    out = run(["kv", "namespace", "create", "SESSION"])
    m = re.search(r'id\s*=\s*"([0-9a-f]{32})"', out) or re.search(r"([0-9a-f]{32})", out)
    print("  KV 新建", m.group(1)); return m.group(1)


def ensure_vectorize():
    out = run(["vectorize", "list"], check=False)
    if "bohui-kb" in out:
        print("  Vectorize 已有 bohui-kb"); return
    run(["vectorize", "create", "bohui-kb", "--dimensions=1024", "--metric=cosine"], check=False)
    print("  Vectorize 建了 bohui-kb")


def write_config(d1_id: str, kv_id: str):
    src = os.path.join(DIST, "wrangler.json")
    cfg = json.load(io.open(src, encoding="utf-8"))
    cfg["name"] = NAME
    cfg["topLevelName"] = NAME
    for d in cfg.get("d1_databases", []):
        if d.get("binding") == "DB":
            d["database_id"] = d1_id; d["database_name"] = DB_NAME
    for k in cfg.get("kv_namespaces", []):
        if k.get("binding") == "SESSION":
            k["id"] = kv_id
    cfg.setdefault("vars", {})["TURNSTILE_SITE_KEY"] = ""
    cfg["vars"]["COPY_OF"] = "biosphere-ai.com"
    cfg.pop("routes", None); cfg.pop("workers_dev", None)
    dst = os.path.join(DIST, "wrangler.copy.json")
    io.open(dst, "w", encoding="utf-8").write(json.dumps(cfg, ensure_ascii=False, indent=1))
    return dst


def put_secrets():
    e = env_of(True)
    for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "AUTH_SECRET", "CRON_KEY", "ANYSEARCH_KEY"):
        v = e.get(k)
        if not v:
            print("  secret 缺", k); continue
        p = subprocess.run(["npx", "wrangler", "secret", "put", k, "--name", NAME], cwd=WEB, env=env_of(False), shell=True, input=v, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        print("  secret", k, "ok" if p.returncode == 0 else ("失败 " + (p.stderr or "")[-200:]))


def copy_db(d1_id: str):
    dump = os.path.join(ROOT, "data", "dump", f"{DB_NAME}.sql")
    os.makedirs(os.path.dirname(dump), exist_ok=True)
    t = time.time()
    if os.path.exists(dump) and time.time() - os.path.getmtime(dump) < 1800 and os.path.getsize(dump) > 10_000_000:
        print(f"  导出文件 {os.path.getsize(dump)/1e6:.1f} MB 是 30 分钟内的,复用")
    else:
        run(["d1", "export", DB_NAME, "--remote", "--output", dump], company=True, timeout=3600)
        print(f"  导出 {os.path.getsize(dump)/1e6:.1f} MB · {time.time()-t:.0f}s")
    t = time.time()
    # 必须带副本的配置:apps/web/wrangler.toml 里同名库写的是公司账号的 database_id,
    # 不带 -c 会拿那个 id 去 hosonzuo 账号找,7404 could not be found(2026-09-11 01:49 踩过)
    cfg = os.path.join(DIST, "wrangler.copy.json")
    if not os.path.exists(cfg):
        write_config(d1_id, ensure_kv())
    # 1) 先清空副本库里已有的用户表:上一次导到一半失败时表已建、行已灌了一部分,再导会撞主键
    def _drop_all():
        out = run(["d1", "execute", DB_NAME, "--remote", "--json", "-c", "wrangler.copy.json",
                   "--command", "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"], cwd=DIST, check=False)
        try:
            names = [r["name"] for r in first_json(out)[0]["results"]]
        except Exception:
            names = []
        if names:
            drops = "\n".join(f"DROP TABLE IF EXISTS \"{n}\";" for n in names) + "\n"
            dropf = os.path.join(DIST, "_drop_all.sql")
            io.open(dropf, "w", encoding="utf-8", newline="\n").write("PRAGMA defer_foreign_keys = ON;\n" + drops)
            run(["d1", "execute", DB_NAME, "--remote", "--file", dropf, "--yes", "-c", "wrangler.copy.json"], cwd=DIST, timeout=1800)
            print(f"  副本库清掉 {len(names)} 张旧表")
    _drop_all()
    # 2) 64 MB 一次上传经代理老超时(2026-09-11 17:5x 三次全挂),整批事务还会被 D1_RESET_DO 回滚。
    #    改成分块:先剥掉 REFERENCES 子句(副本是快照,表间外键不要也罢;不剥的话分块导入子表先于父表会撞外键),
    #    再按语句边界切成 ≤6 MB 的块,逐块导入;每块失败(超时 / D1_RESET_DO)就重试,块内事务失败会回滚、可安全重跑。
    raw = io.open(dump, encoding="utf-8", errors="replace").read()
    raw = re.sub(r"\s+REFERENCES\s+\"?\w+\"?\s*\([^)]*\)(\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))*", "", raw, flags=re.I)
    chunks, cur, size = [], [], 0
    for ln in raw.split("\n"):
        if size > 6_000_000 and (ln.startswith("INSERT INTO") or ln.startswith("CREATE ")):
            chunks.append("\n".join(cur)); cur, size = [], 0
        cur.append(ln); size += len(ln) + 1
    if cur: chunks.append("\n".join(cur))
    print(f"  分 {len(chunks)} 块导入")
    for i, body in enumerate(chunks, 1):
        f = os.path.join(DIST, f"_import_{i:02d}.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write(body + "\n")
        for k in range(4):
            out = run(["d1", "execute", DB_NAME, "--remote", "--file", f, "--yes", "-c", "wrangler.copy.json"], cwd=DIST, timeout=3600, check=False)
            bad = "D1_RESET_DO" in out or "[ERROR]" in out or "ERROR]" in out
            if not bad: break
            print(f"    块 {i} 第 {k + 1} 次失败:{out.strip().splitlines()[-1][:100] if out.strip() else ''};20s 后重试"); time.sleep(20)
        else:
            raise SystemExit(f"块 {i} 连续 4 次失败,停:\n" + out[-800:])
        print(f"    块 {i}/{len(chunks)} 完成 · {time.time() - t:.0f}s")
    chk = run(["d1", "execute", DB_NAME, "--remote", "--json", "-c", "wrangler.copy.json", "--command", "SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table'"], cwd=DIST, check=False)
    try: ntab = first_json(chk)[0]["results"][0]["n"]
    except Exception: ntab = -1
    if ntab < 10: raise SystemExit(f"导入后只有 {ntab} 张表,判定失败")
    print("  导入完成", f"{time.time()-t:.0f}s · {ntab} 张表")
    # 副本跑在 workers.dev 上,不是正式域名:全部站点标 is_live=0 → robots 禁抓 + noindex,免得搜索引擎把副本当正站收录、拖累公司站
    run(["d1", "execute", DB_NAME, "--remote", "-c", "wrangler.copy.json", "--command", "UPDATE sites SET is_live = 0"], cwd=DIST, check=False)
    print("  副本站点已全部标 is_live=0(不收录)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--skip-db", action="store_true")
    ap.add_argument("--db-only", action="store_true", help="代码已部署过,只导库")
    ap.add_argument("--name", default=None, help="Worker 名(默认 skin2oem)")
    a = ap.parse_args()
    global NAME
    if a.name: NAME = a.name
    if a.db_only:
        who = run(["whoami"])
        acct = re.search(r"│\s*([^│]+?)\s*│\s*([0-9a-f]{32})\s*│", who)
        if not acct or acct.group(2).startswith("894467"):
            raise SystemExit("OAuth 没落到 hosonzuo 账号,停")
        copy_db(ensure_d1()); return
    who = run(["whoami"])
    acct = re.search(r"│\s*([^│]+?)\s*│\s*([0-9a-f]{32})\s*│", who)
    print("目标账号:", acct.group(1) if acct else "?", acct.group(2) if acct else "")
    if not acct or acct.group(2).startswith("894467"):
        raise SystemExit("OAuth 没落到 hosonzuo 账号,停")
    if a.dry:
        print("dry:建 D1/KV/Vectorize → 写 wrangler.copy.json → deploy → secrets → 导库"); return
    d1_id = ensure_d1(); kv_id = ensure_kv(); ensure_vectorize()
    write_config(d1_id, kv_id)
    # 配置文件里的 main / assets 路径是相对配置文件的,所以在 dist/server 里跑
    out = run(["deploy", "-c", "wrangler.copy.json"], cwd=DIST, timeout=1200)
    url = re.search(r"https://[\w.-]+workers\.dev", out)
    print("  部署:", url.group(0) if url else out[-300:])
    put_secrets()
    if not a.skip_db:
        copy_db(d1_id)
    if url:
        import urllib.request
        for path in ("/zh-cn/", "/zh-cn/inci/", "/en/regulations/"):
            try:
                r = urllib.request.urlopen(url.group(0) + path, timeout=60); print("  ", path, r.status)
            except Exception as ex:
                print("  ", path, "ERR", str(ex)[:80])


if __name__ == "__main__":
    main()
