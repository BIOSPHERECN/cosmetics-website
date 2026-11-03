#!/usr/bin/env python3
"""法规原文语料 → D1 reg_corpus(供「合规检索 AI」按关键词取证)。

来源:WorkBuddy 2026-09-14 采集的官方法规全文(data/regulations/corpus/*.md,带 YAML 头:title/source_url/jurisdiction),
外加 regulations 表里 42 个市场的摘要(准入/安全/标签/清单四段)与 regulation_updates 的修订动态。
切块:按标题/空行切成 500–900 字的块,每块带 market / law / section / source_url;正文只做关键词检索(D1 无向量),
所以块要小、标题要保留 —— 模型只能引用检索到的块,块里没有的它不许说。

用法:python tools/reg-corpus-load.py            体检(只统计)
      python tools/reg-corpus-load.py --apply    重建表并写入"""
import glob, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SRC = os.path.join(ROOT, "data", "regulations", "corpus")
MARKET = {"中国": "cn", "欧盟": "eu", "东盟": "asean", "美国": "us", "日本": "jp", "韩国": "kr", "加拿大": "ca", "印度": "in", "巴西": "br", "澳大利亚": "au"}
q = lambda v: "'" + str(v or "").replace("'", "''") + "'"  # noqa: E731

def front(md):
    m = re.match(r"---\n(.*?)\n---\n", md, re.S); meta = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line: k, v = line.split(":", 1); meta[k.strip()] = v.strip().strip('"')
        md = md[m.end():]
    return meta, md

def chunks(text, lo=500, hi=900):
    """按标题与空行切;过长的段再按句号切。保留最近的标题作 section。"""
    out, sec, buf = [], "", ""
    lines = [l.rstrip() for l in text.replace("\r", "").split("\n")]
    def flush():
        nonlocal buf
        t = re.sub(r"[ \t]+", " ", buf).strip()
        if len(t) >= 80: out.append((sec, t))
        buf = ""
    for l in lines:
        if re.match(r"^(#{1,4} |第[一二三四五六七八九十百]+[章节条]|Article \d+|Annex [IVX]+|附录|附件|Chapter \d+|Section \d+)", l.strip()):
            flush(); sec = l.strip("# ").strip()[:80]
            if len(sec) < 60: continue
        if not l.strip():
            if len(buf) >= lo: flush()
            else: buf += "\n"
            continue
        buf += l + "\n"
        if len(buf) >= hi:
            cut = max(buf.rfind("。", 0, hi), buf.rfind(". ", 0, hi), buf.rfind("；", 0, hi))
            if cut > lo: rest = buf[cut + 1:]; buf = buf[:cut + 1]; flush(); buf = rest
            else: flush()
    flush(); return out

rows = []
for f in sorted(glob.glob(os.path.join(SRC, "*", "*.md"))):
    meta, body = front(io.open(f, encoding="utf-8", errors="replace").read())
    if len(body) < 2000: continue
    mk = MARKET.get(meta.get("jurisdiction", os.path.basename(os.path.dirname(f))), "xx"); law = meta.get("title") or os.path.basename(f)
    cs = chunks(body)
    # 安全技术规范正文 56 万字里大半是禁限用表格,表格行已在 inci_catalog(cn-stsc);这里只留前 400 块(总则、通用要求、方法概述)
    if "安全技术规范" in law: cs = cs[:400]
    for i, (sec, t) in enumerate(cs): rows.append((mk, law, sec, t, meta.get("source_url", ""), "zh" if re.search(r"[一-龥]", t) else "en", f"{os.path.basename(f)}#{i}"))
    print(f"{mk:6} {law[:50]:50} 块 {len(cs)}")
# 42 个市场的结构化摘要也进语料(它们是我们核过的口径)
for r in d1("SELECT id, country_zh, law_zh, entry_zh, safety_zh, labeling_zh, lists_zh, official_url, latest_what_zh, latest_date FROM regulations"):
    for sec, t in [("准入与通报", r["entry_zh"]), ("安全评估与产品档案", r["safety_zh"]), ("标签", r["labeling_zh"]), ("禁限用清单", r["lists_zh"]), (f"最新修订 {r['latest_date'] or ''}", r["latest_what_zh"])]:
        if t and len(t) > 30: rows.append((r["id"], f"{r['country_zh']} · {r['law_zh'] or ''}", sec, t, r["official_url"] or "", "zh", f"reg:{r['id']}:{sec}"))
for r in d1("SELECT market_id, date, title_zh, summary_zh, src AS source_url FROM regulation_updates"):
    t = f"{r['title_zh'] or ''}。{r['summary_zh'] or ''}"
    if len(t) > 30: rows.append((r["market_id"], "修订动态", f"{r['date']} {r['title_zh'] or ''}"[:80], t, r["source_url"] or "", "zh", f"upd:{r['market_id']}:{r['date']}:{(r['title_zh'] or '')[:20]}"))
print("总块数", len(rows), "· 市场", sorted({r[0] for r in rows}))
if "--apply" not in sys.argv: sys.exit(0)
d1("CREATE TABLE IF NOT EXISTS reg_corpus (id INTEGER PRIMARY KEY AUTOINCREMENT, market TEXT, law TEXT, section TEXT, text TEXT, source_url TEXT, lang TEXT, key TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)")
d1("CREATE INDEX IF NOT EXISTS idx_reg_corpus_market ON reg_corpus(market)")
d1("DELETE FROM reg_corpus")
lines = [f"INSERT INTO reg_corpus (market, law, section, text, source_url, lang, key) VALUES ({q(m)},{q(l)},{q(s)},{q(t)},{q(u)},{q(g)},{q(k)});" for m, l, s, t, u, g, k in rows]
for i in range(0, len(lines), 300):
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"_regcorpus_{i // 300}.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines[i:i + 300]) + "\n"); d1_exec(f); os.remove(f)
print("写入", d1("SELECT COUNT(*) n FROM reg_corpus")[0]["n"])
