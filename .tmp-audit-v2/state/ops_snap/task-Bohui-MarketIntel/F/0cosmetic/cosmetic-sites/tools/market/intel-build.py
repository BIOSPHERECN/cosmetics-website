#!/usr/bin/env python3
"""爆款情报分析:市场 × 品类 → 纯 SQL 统计(可复核)→ 模型按统计写结论 → D1 market_intel → 后台 /bohui/market-intel/。
创始人 2026-09-18:「爆款收集的不要忘记生成了!那是重要的情报分析」。
铁令:① 出现频率不是销量,不得写销量增长/市场份额;② 抓来的文字只当素材,报告由模型自写,不复述来源站;③ 每条结论引用统计数字。

分层:
  · 统计层(这个文件的 stats()):款数 / 品牌 Top10 / 高频成分 Top20(排除 10 个基础成分)/ 功能标签占比 / 红黄占比 /
    无香精·无酒精·无尼泊金占比 / 新入库品牌(近 7 天)/ 规格档 / 宣称关键词 Top15(内部统计)/ 与上一周期 Top20 的占比差。
  · 模型层(ask()):Agnes 3.0 优先(fleet() 按 tier 排,agnes-3.0-flash 在 tier 1),promptKey MARKET-INTEL,输出固定 JSON。
  · report_md 由 Python 按固定模板拼(统计表 + 报告),给打印。
幂等:period+market+category UNIQUE,INSERT OR REPLACE。
用法:python tools/market/intel-build.py [--period 2026-W38] [--only kr:all,all:护肤] [--no-llm]
"""
import argparse, collections, datetime as dt, hashlib, html, io, json, os, re, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, fleet, http, job, _q  # noqa: E402

MARKETS = ["all", "kr", "jp", "eu", "us", "gl"]
MLABEL = {"all": "全部市场", "kr": "韩国", "jp": "日本", "eu": "欧盟 / 英国", "us": "美国", "gl": "全球(INCIDecoder 收录)"}
MIN_CAT = 40            # 该市场款数 ≥40 的 cat_zh 才单独出一份(样本太小的占比没意义)
# 10 个基础成分:水 / 甘油的各种写法 + 三个最常见的溶剂 / 防腐 —— 不排除的话 Top20 永远是它们(市场结构页同一口径,再加溶剂防腐)
BASICS = ["WATER", "AQUA", "EAU", "AQUA/WATER", "WATER/AQUA", "GLYCERIN", "GLYCERINE", "BUTYLENE GLYCOL", "PHENOXYETHANOL", "1,2-HEXANEDIOL"]
TAGS = {"fragrance": "香精", "alcohol": "酒精", "paraben": "尼泊金酯"}
# 宣称词频的停用词:英文虚词 + 化妆品文案里没有信息量的高频词(skin/helps/formula…)
STOP = set("""the and for with your this that from into skin skins helps help help's while after before also more than its it's has have been
are was were will can may all any our you they them their there here about over under into onto out only very just like such each both
which what when where who whom whose these those than then them then not but nor yet so as at by in of on or to up an a is be do does did
product products formula formulated ingredients ingredient contains containing provides provide made makes make gives give use used using
apply applied daily every day night face feel feels feeling leaves leaving look looks looking new one two three how why also even ml more
""".split())


def week_of(d=None):
    d = d or dt.date.today(); y, w, _ = d.isocalendar(); return f"{y}-W{w:02d}"


def where(market, cat):
    """统计口径与后台六站一致:有公开全成分(length(inci)>30)。SQL 字面量走 _q 转义(wrangler --command 没有参数绑定)。"""
    w = ["length(p.inci)>30"]
    if market != "all": w.append(f"p.country={_q(market)}")
    if cat != "all": w.append(f"p.cat_zh={_q(cat)}")
    return "WHERE " + " AND ".join(w)


def combos():
    rows = d1("SELECT country, cat_zh, COUNT(*) n FROM market_products p WHERE length(p.inci)>30 GROUP BY country, cat_zh")
    out = []
    for m in MARKETS:
        cnt = collections.Counter()
        for r in rows:
            if r["cat_zh"] and (m == "all" or r["country"] == m): cnt[r["cat_zh"]] += r["n"]
        out.append((m, "all"))
        out += [(m, c) for c, n in cnt.most_common() if n >= MIN_CAT]
    return out


def size_bin(s):
    """size 文本 → 档位。ml 与 g 合并按数值分档(标签上 50ml 与 50g 是同一档位的包装);oz 按 29.57 折 ml。"""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(ml|mL|ML|g|G|gr|oz|OZ|fl\.? ?oz)", s or "")
    if not m: return "未标"
    v = float(m.group(1)) * (29.57 if "oz" in m.group(2).lower() else 1)
    for lim, lab in ((15, "≤15"), (30, "16–30"), (50, "31–50"), (100, "51–100"), (200, "101–200")):
        if v <= lim: return lab + " ml/g"
    return ">200 ml/g"


def claim_words(claims):
    """宣称关键词:每款去掉「‖ 榜单:…」抓取尾巴与 HTML 实体,按词去重后计款数(一款里重复出现只算一次)。只做内部统计。"""
    cnt = collections.Counter()
    for c in claims:
        c = html.unescape((c or "").split("‖")[0]).lower()
        cnt.update({w for w in re.findall(r"[a-z][a-z\-]{3,}", c) if w not in STOP})
    return [{"kw": k, "n": n} for k, n in cnt.most_common(15)]


def stats(market, cat, prev_top):
    W = where(market, cat)
    J = f"FROM market_product_inci i JOIN market_products p ON p.id=i.product_id LEFT JOIN ingredient_facts f ON f.inci_key=i.inci_key {W}"
    b0 = d1(f"SELECT COUNT(*) n, COUNT(DISTINCT NULLIF(p.brand,'')) nb, MIN(p.first_seen) mn, MAX(p.last_seen) mx FROM market_products p {W}")
    n = int(b0[0]["n"] or 0) if b0 else 0
    if n == 0: return None   # 查询失败(d1 返回空)与真的 0 款都跳过,不让一个组合把整轮 job 拖成 failed
    base = b0[0]
    pc = lambda k: round(k * 100 / n, 1)  # noqa: E731
    brands = d1(f"SELECT p.brand, COUNT(*) n FROM market_products p {W} AND COALESCE(p.brand,'')<>'' GROUP BY p.brand ORDER BY n DESC LIMIT 10")
    excl = ",".join(_q(b) for b in BASICS)
    top = d1(f"SELECT i.inci_key, COUNT(DISTINCT i.product_id) n, MAX(f.name_zh) name_zh, MAX(f.rating) rating {J} AND i.inci_key NOT IN ({excl}) GROUP BY i.inci_key ORDER BY n DESC LIMIT 20")
    basics = d1(f"SELECT i.inci_key, COUNT(DISTINCT i.product_id) n {J} AND i.inci_key IN ({excl}) GROUP BY i.inci_key ORDER BY n DESC")
    # 功能标签:取 ingredient_facts.functions_zh 首标签(逗号有半角与全角两种),按「含该功能成分的款数」聚合
    func = d1(f"SELECT lbl, COUNT(DISTINCT pid) n FROM (SELECT i.product_id pid, trim(substr(replace(f.functions_zh,'，',','),1,instr(replace(f.functions_zh,'，',',')||',',',')-1)) lbl {J} AND COALESCE(f.functions_zh,'')<>'') GROUP BY lbl ORDER BY n DESC LIMIT 15")
    tagsel = ", ".join(f"COUNT(DISTINCT CASE WHEN f.tags LIKE '%\"{t}\"%' THEN i.product_id END) t_{t}" for t in TAGS)
    flag = d1(f"SELECT COUNT(DISTINCT CASE WHEN f.rating='red' THEN i.product_id END) red, COUNT(DISTINCT CASE WHEN f.rating='yellow' THEN i.product_id END) yellow, {tagsel} {J}")
    flag = flag[0] if flag else {"red": 0, "yellow": 0, **{f"t_{t}": 0 for t in TAGS}}
    # 新入库品牌:品牌最早 first_seen 在近 7 天;库从 2026-09-16 起才有数据,窗口不足 7 天时全体都是「新」,不算数
    data_min = d1("SELECT MIN(first_seen) mn FROM market_products")[0]["mn"] or ""
    window_ok = data_min <= (dt.date.today() - dt.timedelta(days=7)).isoformat()
    newb = d1(f"SELECT p.brand, MIN(p.first_seen) fs, COUNT(*) n FROM market_products p {W} AND COALESCE(p.brand,'')<>'' GROUP BY p.brand HAVING fs>=date('now','-7 day') ORDER BY n DESC LIMIT 15") if window_ok else []
    sc = d1(f"SELECT p.size, substr(p.claims,1,600) claims FROM market_products p {W}")
    sizes = collections.Counter(size_bin(r["size"]) for r in sc)
    top_out = []
    for r in top:
        share = pc(r["n"]); prev = prev_top.get(r["inci_key"])
        top_out.append({"inci_key": r["inci_key"], "name_zh": r["name_zh"], "rating": r["rating"], "n": r["n"], "pct": share,
                        "delta_pct": None if prev is None else round(share - prev, 1)})   # 与上一周期占比差;首周 null
    return {
        "n": n, "n_brands": int(base["nb"] or 0), "first_seen_min": base["mn"], "last_seen_max": base["mx"],
        "brands": [{"brand": r["brand"], "n": r["n"], "pct": pc(r["n"])} for r in brands],
        "top": top_out,
        "basics": [{"inci_key": r["inci_key"], "n": r["n"], "pct": pc(r["n"])} for r in basics],
        "functions": [{"label": r["lbl"], "n": r["n"], "pct": pc(r["n"])} for r in func if r["lbl"]],
        "flags": {"red": {"n": flag["red"], "pct": pc(flag["red"])}, "yellow": {"n": flag["yellow"], "pct": pc(flag["yellow"])}},
        "free_of": {f"无{zh}": {"n": n - flag[f"t_{t}"], "pct": pc(n - flag[f"t_{t}"])} for t, zh in TAGS.items()},
        "new_brands": [{"brand": r["brand"], "first_seen": r["fs"], "n": r["n"]} for r in newb], "new_brands_window_ok": window_ok,
        "sizes": [{"bin": b, "n": k, "pct": pc(k)} for b, k in sizes.most_common()],
        "claim_words": claim_words(r["claims"] for r in sc),
    }


PROMPT = """你是广州一家化妆品 OEM/ODM 工厂(15 条产线,GMPC/ISO22716/HALAL;主做护肤、身体、洗护、面膜;客户在东南亚、中东、欧美)的市场情报分析师。
下面是一个「市场 × 品类」的公开全成分统计(全部真实数字,来自我们自己的数据库)。请只根据这些数字写一份内部情报,输出 JSON:
{"headline": "≤40 字一句话结论",
 "structure": "≤150 字,这个品类的配方结构画像(基础体系、活性、防腐、香精倾向)",
 "rising": [{"inci_key": "成分 INCI(必须来自 top 表)", "why": "为什么值得关注,引用款数与占比;有 delta_pct 才可说升降"}],  最多 5 条,只选活性/功效成分,不选基础成分
 "standard_kit": ["基础必备成分 INCI"],  最多 8 个,从 basics 与 top 表里挑
 "claims_trend": "≤100 字,宣称关键词反映的诉求方向",
 "whitespace": [{"point": "我们可切入的机会", "basis": "引用的统计项与数字"}],  最多 3 条
 "risks": [{"point": "法规 / 红黄成分风险", "basis": "引用的统计项与数字"}],  最多 3 条
 "for_rd": "≤120 字,给研发的建议",
 "for_sales": "≤120 字,给业务的建议"}
硬规则:
1. 出现频率不是销量:全文不得出现「销量」「市场份额」「热卖」「畅销」「增长」这类词;delta_pct 为 null 时不得说「上升 / 下降」,只能说「高频出现」。
2. 不复述任何来源站文字,claim_words 只是词频,不得当作某个品牌的原话引用。
3. 每条结论必须带一个统计数字(款数或占比)。
4. 只输出 JSON,不加解释,不加 Markdown 围栏。全部简体中文,INCI 保留英文。"""


def ask(provs, stats_obj):
    """按档位挨家问,返回 (report_json, provider_id, usage, err)。
    没直接用 _bohui.chat():它不回 usage,而 market_intel / ai_runs 都要记 tokens。逻辑与 chat() 一致:剥围栏、找 {…}、空响应换下一家。"""
    msgs = [{"role": "system", "content": PROMPT}, {"role": "user", "content": json.dumps(stats_obj, ensure_ascii=False)}]
    last = ""
    for p in provs:
        req = {"model": p["model"], "temperature": 0.3, "max_tokens": 3000, "messages": msgs}   # 推理模型 max_tokens 小会返回空(记忆:Agnes 3.0)
        if str(p["model"]).startswith("agnes-3"): req["chat_template_kwargs"] = {"enable_thinking": False}
        t0 = time.time()
        try:
            d = json.loads(http(p["base"] + "/chat/completions", data=json.dumps(req).encode(), timeout=180, retries=2,
                                headers={"Content-Type": "application/json", "Authorization": f"Bearer {p['keys'][0]}"}).decode("utf-8", "replace"))
            txt = re.sub(r"^```\w*|```$", "", ((d.get("choices") or [{}])[0].get("message", {}).get("content", "") or "").strip(), flags=re.M)
            m = re.search(r"\{[\s\S]*\}", txt)
            if not m: last = f"{p['id']}: 无 JSON"; continue
            u = d.get("usage") or {}
            return json.loads(m.group(0)), p["id"], {"in": u.get("prompt_tokens"), "out": u.get("completion_tokens"), "ms": int((time.time() - t0) * 1000)}, ""
        except Exception as e:
            last = f"{p['id']}: {str(e)[:80]}"
    return None, None, {}, last


def to_md(period, market, cat, S, R, model):
    """固定模板:报告在前(给人读),统计表在后(可复核)。"""
    tbl = lambda hdr, rows: "| " + " | ".join(hdr) + " |\n|" + "---|" * len(hdr) + "\n" + "\n".join("| " + " | ".join(str(x) for x in r) + " |" for r in rows) + "\n"  # noqa: E731
    R = R or {}
    L = [f"# 爆款情报 · {period} · {MLABEL.get(market, market)} × {'全部品类' if cat == 'all' else cat}",
         f"> 出现频率 ≠ 销量。统计对象:公开全成分 {S['n']:,} 款 · {S['n_brands']} 个品牌 · 入库 {S['first_seen_min']} ~ {S['last_seen_max']} · 模型 {model or '—'}", ""]
    if R:
        L += [f"## {R.get('headline', '')}", "", "### 配方结构画像", R.get("structure", ""), "", "### 值得关注的成分"]
        L += [f"- **{x.get('inci_key')}** — {x.get('why')}" for x in R.get("rising", [])]
        L += ["", "### 标配成分", "、".join(R.get("standard_kit", [])), "", "### 宣称趋势", R.get("claims_trend", ""), "", "### 机会"]
        L += [f"- {x.get('point')}(依据:{x.get('basis')})" for x in R.get("whitespace", [])]
        L += ["", "### 风险"] + [f"- {x.get('point')}(依据:{x.get('basis')})" for x in R.get("risks", [])]
        L += ["", "### 给研发", R.get("for_rd", ""), "", "### 给业务", R.get("for_sales", ""), ""]
    L += ["## 统计表", "", "### 品牌 Top 10(款数)", tbl(["品牌", "款数", "占比"], [(b["brand"], b["n"], f"{b['pct']}%") for b in S["brands"]]),
          "### 高频成分 Top 20(已排除水 / 甘油等 10 个基础成分)",
          tbl(["#", "INCI", "中文名", "评级", "款数", "占比", "vs 上周期"], [(i + 1, t["inci_key"], t.get("name_zh") or "", t.get("rating") or "", t["n"], f"{t['pct']}%", "—" if t["delta_pct"] is None else f"{t['delta_pct']:+}pp") for i, t in enumerate(S["top"])]),
          "### 基础成分出现占比", tbl(["INCI", "款数", "占比"], [(b["inci_key"], b["n"], f"{b['pct']}%") for b in S["basics"]]),
          "### 功能标签(含该功能成分的款数,functions_zh 首标签)", tbl(["功能", "款数", "占比"], [(f["label"], f["n"], f"{f['pct']}%") for f in S["functions"]]),
          "### 安全评级与标签", tbl(["项", "款数", "占比"], [("含红色成分", S["flags"]["red"]["n"], f"{S['flags']['red']['pct']}%"), ("含黄色成分", S["flags"]["yellow"]["n"], f"{S['flags']['yellow']['pct']}%")] + [(k, v["n"], f"{v['pct']}%") for k, v in S["free_of"].items()]),
          "### 规格分布", tbl(["档位", "款数", "占比"], [(s["bin"], s["n"], f"{s['pct']}%") for s in S["sizes"]]),
          "### 宣称关键词 Top 15(内部统计,不对外)", tbl(["词", "款数"], [(w["kw"], w["n"]) for w in S["claim_words"]]),
          "### 新入库品牌(近 7 天)", tbl(["品牌", "首见", "款数"], [(b["brand"], b["first_seen"], b["n"]) for b in S["new_brands"]]) if S["new_brands"] else ("(数据窗口不足 7 天,暂不统计)" if not S["new_brands_window_ok"] else "(无)")]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--period", default=week_of()); ap.add_argument("--only", default=""); ap.add_argument("--no-llm", action="store_true"); A = ap.parse_args()
    todo = [tuple(x.split(":", 1)) for x in A.only.split(",") if ":" in x] or combos()
    provs = [] if A.no_llm else fleet()
    sqlp = os.path.join(ROOT, "tools", "_market_intel.sql")
    with job("market-intel", total=len(todo)) as J:
        for k, (m, cat) in enumerate(todo):
            t0 = time.time()
            # 上一周期同组合的 Top20 占比 → delta_pct(时间序列从 09-18 起,满两周才有真正的升降)
            prev = d1(f"SELECT stats_json FROM market_intel WHERE market={_q(m)} AND category={_q(cat)} AND period<{_q(A.period)} ORDER BY period DESC LIMIT 1", tries=2)
            prev_top = {t["inci_key"]: t["pct"] for t in json.loads(prev[0]["stats_json"]).get("top", [])} if prev else {}
            S = stats(m, cat, prev_top)
            if not S: print(f"跳过 {m}×{cat}:0 款"); continue
            R, prov, u, err = ask(provs, S) if provs else (None, None, {}, "")
            if err: print(f"  llm err {m}×{cat}: {err}")
            if R:   # 模型常超条数(首跑 whitespace 给了 5 条),按规格硬截:rising ≤5 / standard_kit ≤8 / whitespace ≤3 / risks ≤3
                for key, lim in (("rising", 5), ("standard_kit", 8), ("whitespace", 3), ("risks", 3)):
                    if isinstance(R.get(key), list): R[key] = R[key][:lim]
            md = to_md(A.period, m, cat, S, R, prov)
            with io.open(sqlp, "w", encoding="utf-8", newline="\n") as w:
                w.write(f"INSERT OR REPLACE INTO market_intel (period, market, category, stats_json, report_md, report_json, n_products, model, tokens_in, tokens_out) VALUES "
                        f"({_q(A.period)}, {_q(m)}, {_q(cat)}, {_q(json.dumps(S, ensure_ascii=False))}, {_q(md)}, {_q(json.dumps(R, ensure_ascii=False) if R else None)}, {S['n']}, {_q(prov)}, {u.get('in') or 'NULL'}, {u.get('out') or 'NULL'});\n")
                if provs:   # 每次模型调用记 ai_runs(治理层 0087 口径),失败也记 ok=0
                    w.write(f"INSERT INTO ai_runs (prompt_key, provider, model, entity_type, entity_id, input_hash, tokens_in, tokens_out, latency_ms, ok, error) VALUES "
                            f"('MARKET-INTEL', {_q(prov)}, {_q(next((p['model'] for p in provs if p['id'] == prov), None))}, 'market_intel', {_q(f'{A.period}/{m}/{cat}')}, "
                            f"{_q(hashlib.sha1(json.dumps(S, sort_keys=True).encode()).hexdigest()[:16])}, {u.get('in') or 'NULL'}, {u.get('out') or 'NULL'}, {u.get('ms') or 'NULL'}, {1 if R else 0}, {_q(err or None)});\n")
            n = d1_exec(sqlp)
            print(f"[{k + 1}/{len(todo)}] {m}×{cat} {S['n']} 款 · 模型 {prov or '—'} · tokens {u.get('in')}/{u.get('out')} · 写入 {n} · {time.time() - t0:.0f}s · {(R or {}).get('headline', '')[:40]}")
            J.tick(k + 1, f"{m}×{cat}")


if __name__ == "__main__":
    main()
