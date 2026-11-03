#!/usr/bin/env python3
"""站点罗盘采集器 —— 本机跑,把多维快照写进 D1,后台只读快照。

创始人 2026-09-07:「还有访问量,SEO、GEO 效果等多维度的分析罗盘」
以及更早的「后台的管理系统界面一定要美观,操作一定要便捷」。

为什么采集放本机、不放 Worker:
  罗盘要读 Cloudflare 的账号级分析 API,那把 token 的权限是**整个账号**。
  一旦放进 Worker,泄漏面就从「一台内网机器」扩大到「边缘上的一个 JS 文件」。
  本机采集 → 写快照 → 后台读快照,Worker 全程不碰这把钥匙。
  顺带还省事:快照是一行 JSON,后台渲染零额外查询。

为什么访问统计用 Analytics Engine 而不是 Cloudflare Web Analytics:
  后者靠页面里的 JS 信标,而 **AI 爬虫不执行 JS** ——
  这个站的价值恰恰在于被 AI 答案引擎抓取和引用,
  用一个看不见爬虫的工具去衡量 GEO 效果,等于拿体温计量血压。

采集四组:
  ① 访问 —— 按来访者类别/语种/版块/路径/国家,人和爬虫分开看
  ② 内容 —— 各库存量与新鲜度(多久没更新了)
  ③ 用量 —— D1 行读、Workers 请求,对着套餐额度看
  ④ 健康 —— 模型舰队逐家探活、管线最后成功时间
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
ACC = E["CLOUDFLARE_ACCOUNT_ID"]
TOK = E["CLOUDFLARE_API_TOKEN"]


def d1(sql):
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
    try:
        return json.loads(raw[raw.index("[\n  {"):raw.rindex("]") + 1])[0]["results"]
    except Exception:
        return []


def ae(sql):
    """Analytics Engine 的 SQL 接口。注意它是 ClickHouse 方言,不是 SQLite。"""
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACC}/analytics_engine/sql",
        data=(sql + " FORMAT JSON").encode(),
        headers={"Authorization": f"Bearer {TOK}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as f:
            rows = json.loads(f.read().decode("utf-8", "replace")).get("data") or []
            # ClickHouse 的 UInt64 在 JSON 里是字符串,不转就会在求和时炸
            for r in rows:
                if isinstance(r.get("n"), str) and r["n"].isdigit():
                    r["n"] = int(r["n"])
            return rows
    except Exception as e:
        print(f"  AE 查询失败:{str(e)[:80]}")
        return []


def gql(query):
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/graphql",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as f:
            return json.loads(f.read().decode("utf-8", "replace"))
    except Exception as e:
        print(f"  GraphQL 失败:{str(e)[:80]}")
        return {}


def probe_fleet():
    rows = d1("SELECT id,tier,base_url,model,api_keys FROM providers WHERE enabled=1 ORDER BY tier,id")

    def one(p):
        keys = [k.strip() for k in str(p["api_keys"] or "").replace("\n", ",").split(",") if k.strip()]
        if not keys:
            return {"id": p["id"], "tier": p["tier"], "ok": False, "ms": 0, "note": "无 key"}
        body = json.dumps({"model": p["model"], "max_tokens": 4,
                           "messages": [{"role": "user", "content": "ping"}]}).encode()
        t0 = time.time()
        try:
            req = urllib.request.Request((p["base_url"] or "").rstrip("/") + "/chat/completions",
                                         data=body, headers={"Content-Type": "application/json",
                                                             "Authorization": f"Bearer {keys[0]}"})
            urllib.request.urlopen(req, timeout=25).read(200)
            return {"id": p["id"], "tier": p["tier"], "ok": True,
                    "ms": int((time.time() - t0) * 1000), "note": "正常"}
        except urllib.error.HTTPError as e:
            txt = ""
            try:
                txt = e.read(160).decode("utf-8", "replace")
            except Exception:
                pass
            # 生图/生视频模型用聊天接口探活必然 400,那是通道活着
            alive = e.code == 400 and ("image" in txt.lower() or "video" in txt.lower())
            return {"id": p["id"], "tier": p["tier"], "ok": alive,
                    "ms": int((time.time() - t0) * 1000),
                    "note": "生成类模型(通道正常)" if alive else f"HTTP {e.code}"}
        except Exception as e:
            return {"id": p["id"], "tier": p["tier"], "ok": False,
                    "ms": int((time.time() - t0) * 1000), "note": type(e).__name__}

    with ThreadPoolExecutor(max_workers=6) as ex:
        return list(ex.map(one, rows))


def main():
    print("采集中…")
    snap = {"at": time.strftime("%Y-%m-%d %H:%M:%S")}

    # ── ① 访问 ────────────────────────────────────────────────────────
    W = "WHERE timestamp > NOW() - INTERVAL '7' DAY"
    snap["visitors"] = ae(f"SELECT blob1 AS k, count() AS n FROM bohui_pulse {W} GROUP BY k ORDER BY n DESC")
    snap["langs"] = ae(f"SELECT blob2 AS k, count() AS n FROM bohui_pulse {W} GROUP BY k ORDER BY n DESC LIMIT 20")
    snap["sections"] = ae(f"SELECT blob3 AS k, count() AS n FROM bohui_pulse {W} GROUP BY k ORDER BY n DESC LIMIT 16")
    snap["paths"] = ae(f"SELECT blob4 AS k, count() AS n FROM bohui_pulse {W} GROUP BY k ORDER BY n DESC LIMIT 20")
    snap["countries"] = ae(f"SELECT blob5 AS k, count() AS n FROM bohui_pulse {W} GROUP BY k ORDER BY n DESC LIMIT 15")
    # AI 爬虫抓了哪些页 —— GEO 效果最直接的证据
    snap["ai_paths"] = ae(
        f"SELECT blob4 AS k, count() AS n FROM bohui_pulse {W} AND blob1 LIKE 'ai:%' "
        "GROUP BY k ORDER BY n DESC LIMIT 15")
    snap["daily"] = ae(
        f"SELECT toDate(timestamp) AS d, blob1 AS k, count() AS n FROM bohui_pulse {W} "
        "GROUP BY d, k ORDER BY d")

    # ── ①b GEO 被引频率 ───────────────────────────────────────────────
    # 创始人 2026-09-11 转来 Dan Koe 的 GEO 打法:「盯住被引频率这个新指标,每周固定监控一次」。
    # 三个直接读数,都从打点里来,不靠猜:
    #   cite:*  —— ChatGPT-User / Perplexity-User / Claude-User 在回答某人时实时来取这一页 = 这一页正在被引用;
    #   ref:*   —— 真人从 chatgpt.com / perplexity.ai 等答案页点链接进来 = 被引带来的流量;
    #   ai:*    —— GPTBot 等的常规抓取 = 被看见(第一步),抓得多不等于被引。
    # 本周与上周各取一份,后台并排看涨跌;按 _sample_interval 加权才是真实次数。
    W2 = "WHERE timestamp <= NOW() - INTERVAL '7' DAY AND timestamp > NOW() - INTERVAL '14' DAY"
    geo = {}
    for tag, w in (("now", W), ("prev", W2)):
        geo[tag] = {
            "cite_by": ae(f"SELECT blob1 AS k, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 LIKE 'cite:%' GROUP BY k ORDER BY n DESC"),
            "cite_paths": ae(f"SELECT blob4 AS k, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 LIKE 'cite:%' GROUP BY k ORDER BY n DESC LIMIT 40"),
            "ref_by": ae(f"SELECT blob6 AS k, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 = 'human' AND blob6 LIKE 'ref:%' GROUP BY k ORDER BY n DESC"),
            "ref_paths": ae(f"SELECT blob4 AS k, blob6 AS r, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 = 'human' AND blob6 IN ('ref:chatgpt','ref:perplexity','ref:claude','ref:gemini','ref:bing') GROUP BY k, r ORDER BY n DESC LIMIT 40"),
            "crawl_by": ae(f"SELECT blob1 AS k, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 LIKE 'ai:%' GROUP BY k ORDER BY n DESC"),
            "crawl_sections": ae(f"SELECT blob3 AS k, SUM(_sample_interval) AS n FROM bohui_pulse {w} AND blob1 LIKE 'ai:%' GROUP BY k ORDER BY n DESC LIMIT 20"),
        }
    # 2026-09-16:cite:* 里混着扫描器 —— 伪装 ChatGPT-User 的 UA 去探 /.env、/.aws/credentials、/docker-compose.yaml。
    # 这些不是引用,是攻击探测;从路径榜里剔掉,另记一个 cite_real(去噪后的被引次数),后台看这个。
    import re as _re
    NOISE = _re.compile(r"(\.env|\.git|\.aws|\.ssh|\.npmrc|\.idea|/wp-|\.php|\.ya?ml$|\.json$|environ|credentials|id_ecdsa|id_rsa|\.bashrc|docker-compose|userfiles|read-document|/mcp$|/api/|\.\./|/\.[a-z])", _re.I)
    for tag in geo:
        paths = [x for x in (geo[tag].get("cite_paths") or []) if not NOISE.search(str(x.get("k") or ""))]
        geo[tag]["cite_paths"] = paths
        geo[tag]["cite_real"] = sum(int(x.get("n") or 0) for x in paths)
    snap["geo"] = geo

    # ── ② 内容 ────────────────────────────────────────────────────────
    c = d1("SELECT (SELECT COUNT(*) FROM news) news, "
           "(SELECT COUNT(*) FROM news WHERE is_published=1) news_pub, "
           "(SELECT MAX(published_at) FROM news WHERE is_published=1) news_last, "
           "(SELECT COUNT(*) FROM packaging WHERE status IN ('sample','active')) packaging, "
           "(SELECT COUNT(*) FROM formulas WHERE status IN ('sample','active')) formulas, "
           "(SELECT COUNT(*) FROM ingredients WHERE status='published') ingredients, "
           "(SELECT COUNT(*) FROM inquiries) inquiries, "
           "(SELECT COUNT(*) FROM inquiries WHERE created_at >= datetime('now','-30 days')) inq30, "
           "(SELECT COUNT(*) FROM pack_assets WHERE reviewed=0) pending_imgs")
    snap["content"] = c[0] if c else {}

    # 向量检索用量 —— Vectorize 按查询的向量维度计费,量堆起来才贵。
    # 全站日闸 500 次/天(apps/web/src/lib/ratelimit.ts 的 kb.query),
    # 这里把实际用量摆到罗盘上,别等账单来了才知道。
    # 限流计数复用 revisions 表,entity 形如 rl:kb.query。
    kb = d1("SELECT COUNT(*) n FROM revisions WHERE entity='rl:kb.query' "
            "AND created_at > datetime('now','-1 day')")
    snap["kb_query_24h"] = int(kb[0]["n"]) if kb else 0
    # 翻译完整度 —— 标题仍等于英文原文的,算没翻
    snap["i18n_gap"] = d1(
        "SELECT a.lang, COUNT(*) n FROM page_i18n a JOIN page_i18n b "
        "ON b.page_id=a.page_id AND b.lang='en' WHERE a.lang<>'en' AND a.title=b.title "
        "GROUP BY a.lang ORDER BY n DESC LIMIT 10")

    # 有中文、没英文 —— 上面那条只查得出「译文等于原文」,查不出**根本没译**。
    # 2026-09-08 实测:新建的八个原料页只播了简体,主回填把 en 当源语言不当目标,
    # 于是 /en/origin/licorice/ 整页是中文(937 个汉字),而这是个外贸站。
    # 英文缺一条就是外国访客看到一段中文,必须能一眼看见。
    miss = d1(
        "SELECT (SELECT COUNT(*) FROM blocks b WHERE EXISTS(SELECT 1 FROM block_i18n z "
        "WHERE z.block_id=b.id AND z.lang='zh-cn') AND NOT EXISTS(SELECT 1 FROM block_i18n e "
        "WHERE e.block_id=b.id AND e.lang='en')) blocks, "
        "(SELECT COUNT(*) FROM pages p WHERE EXISTS(SELECT 1 FROM page_i18n z "
        "WHERE z.page_id=p.id AND z.lang='zh-cn') AND NOT EXISTS(SELECT 1 FROM page_i18n e "
        "WHERE e.page_id=p.id AND e.lang='en')) pages")
    snap["en_missing"] = miss[0] if miss else {}

    # ── ③ 用量 ────────────────────────────────────────────────────────
    g = gql('{viewer{accounts(filter:{accountTag:"%s"}){'
            'workersInvocationsAdaptive(limit:1,filter:{datetime_geq:"%s"}){sum{requests errors}}'
            '}}}' % (ACC, time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime(time.time() - 86400))))
    try:
        w = g["data"]["viewer"]["accounts"][0]["workersInvocationsAdaptive"][0]["sum"]
        snap["workers"] = {"requests": w.get("requests", 0), "errors": w.get("errors", 0)}
    except Exception:
        snap["workers"] = {}

    ins = subprocess.run(
        ["npx", "wrangler", "d1", "insights", "bohui-cms-v2", "--time-period", "1d",
         "--sort-by", "reads", "--limit", "6"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", ins.stdout or "")
    try:
        arr = json.loads(raw[raw.index("[\n  {"):raw.rindex("]") + 1])
        snap["d1_top"] = [{"rows": q["avgRowsRead"], "runs": q["numberOfTimesRun"],
                           "total": q["totalRowsRead"], "eff": q["queryEfficiency"],
                           "q": re.sub(r"\s+", " ", q["query"])[:110]} for q in arr]
        snap["d1_total_reads"] = sum(q["totalRowsRead"] for q in arr)
    except Exception:
        snap["d1_top"] = []

    # 顺手把各库存量缓存行刷新一遍(前台六站页/目录页读这一行,不再现算 COUNT(*))
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "counts-refresh.py")], cwd=ROOT, env={**os.environ, **E})

    # ── ④ 健康 ────────────────────────────────────────────────────────
    snap["fleet"] = probe_fleet()

    # 写快照。整份 JSON 一行,后台一次查询就能取到。
    js = json.dumps(snap, ensure_ascii=False)
    tmp = os.path.join(ROOT, "tools", ".pulse.sql")
    q = js.replace("'", "''")
    wk = time.strftime("%G-W%V"); gq = json.dumps(geo.get("now", {}), ensure_ascii=False).replace("'", "''")
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        "CREATE TABLE IF NOT EXISTS pulse (k TEXT PRIMARY KEY, json TEXT NOT NULL, "
        "updated_at TEXT NOT NULL DEFAULT (datetime('now')));\n"
        f"INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('latest', '{q}', datetime('now'));\n"
        f"INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('geo:{wk}', '{gq}', datetime('now'));\n")
    r = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--file", tmp],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    ok = '"success": true' in (r.stdout or "") or "rows_written" in (r.stdout or "")
    os.remove(tmp)

    v = {x["k"]: x["n"] for x in snap["visitors"]}
    ai = sum(n for k, n in v.items() if k.startswith("ai:"))
    se = sum(n for k, n in v.items() if k.startswith("se:"))
    print(f"  访问 7 天:人 {v.get('human', 0)} · AI 爬虫 {ai} · 搜索引擎 {se}")
    print(f"  舰队:{sum(1 for f in snap['fleet'] if f['ok'])}/{len(snap['fleet'])} 家可用")
    print(f"  D1 日读:{snap.get('d1_total_reads', 0):,} 行")
    print(f"  快照{'已写入' if ok else '写入失败'} · {len(js):,} 字节")


if __name__ == "__main__":
    main()
