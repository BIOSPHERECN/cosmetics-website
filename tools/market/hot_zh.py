"""爆款配方中文化(创始人 2026-09-17:「他的资料是英文的,要显示中文」)。
① inci_zh:全成分逐个对 inci_catalog(registry='cn-nmpa-2021')的 inci_key → 标准中文名,对不上的保留原文;
② title_zh / cat_zh:产品名与类目用免费模型(fleet)批量翻成中文,50 条一批。
用法:python tools/market/hot_zh.py [--apply] [--limit N]。默认体检打印前 10 条,--apply 才写库(先自动补两列)。"""
import io, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, fleet, chat, job
APPLY = "--apply" in sys.argv
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 5000
q = lambda s: "'" + str(s if s is not None else "").replace("'", "''") + "'"

def inci_key(s):   # 与 tools/nmpa-catalog.py / lib/inci-key.ts 同算法:去括号、非字母数字压空格
    s = re.sub(r"[（(][^）)]*[）)]", " ", s.upper())
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()

cols = [c["name"] for c in d1("PRAGMA table_info(market_products)")]
if "inci_zh" not in cols:
    if not APPLY: print("缺 inci_zh / title_zh 列,--apply 时自动 ALTER")
    else:
        for c in ("inci_zh", "title_zh", "cat_zh"):
            if c not in cols: d1(f"ALTER TABLE market_products ADD COLUMN {c} TEXT")
rows = d1(f"SELECT id, title, cat, inci FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 AND (inci_zh IS NULL OR inci_zh = '') LIMIT {LIMIT}") if "inci_zh" in cols else d1(f"SELECT id, title, cat, inci FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 LIMIT {LIMIT}")
print("待中文化", len(rows), "条")
# ① 目录对照:一次把 cn-nmpa-2021 的 inci_key → name_zh 拉进内存(8,965 行)
cat = {}
off = 0
while True:   # d1() 一次吐 8,965 行会超出命令行/输出上限而静默返回空,分页 1500 行一趟
    page = d1(f"SELECT inci_key, name_zh FROM inci_catalog WHERE registry='cn-nmpa-2021' ORDER BY rowid LIMIT 1500 OFFSET {off}")
    if not page: break
    for r in page: cat.setdefault(r["inci_key"], r["name_zh"])
    off += 1500
    if len(page) < 1500: break
print("目录载入", len(cat), "条")
def zh_inci(s):
    out, hit, tot = [], 0, 0
    for part in re.split(r"[,;，；]\s*|\s+/\s+(?=[A-Z])", s):
        p = part.strip()
        if not p: continue
        tot += 1
        k = inci_key(p)
        if k in cat: out.append(cat[k]); hit += 1
        else:
            k2 = inci_key(re.split(r"/", p)[0])       # Aqua/Water/Eau → AQUA
            if k2 in cat: out.append(cat[k2]); hit += 1
            else: out.append(p)
    return "、".join(out), hit, tot
# ② 产品名 / 类目:模型翻译,50 条一批,失败保留英文
provs = fleet()
def zh_titles(items):
    msgs = [{"role": "system", "content": "你是化妆品行业翻译。把下面每条英文化妆品名(品牌保留原文不翻)翻成简体中文,类目也翻成中文(护肤/洗发护发/身体/口腔/彩妆/男士/儿童/香水/其他)。只输出 JSON 对象:{\"items\":[{\"id\":数字,\"title_zh\":\"…\",\"cat_zh\":\"…\"}]},不加解释。"},
            {"role": "user", "content": json.dumps([{"id": r["id"], "title": r["title"], "cat": r["cat"]} for r in items], ensure_ascii=False)}]
    try:
        d, who, err = chat(provs, msgs, max_tokens=4000, want_json=True)   # _bohui.chat 返回 (json对象, 供应商, 错误)
        if d is None: raise RuntimeError(err)
        return {x["id"]: (x.get("title_zh") or "", x.get("cat_zh") or "") for x in d.get("items", []) if "id" in x}
    except Exception as e:
        print("  翻译批失败:", str(e)[:80]); return {}
upd, hits, tots = [], 0, 0
J = job('hot-zh', total=len(rows)).__enter__()   # 任务中心心跳
for i in range(0, len(rows), 50):
    batch = rows[i:i + 50]
    J.tick(i, f'成分命中 {hits}/{tots}')
    tz = zh_titles(batch) if APPLY or i == 0 else {}
    for r in batch:
        iz, h, t = zh_inci(r["inci"]); hits += h; tots += t
        tzh, czh = tz.get(r["id"], ("", ""))
        upd.append((r["id"], iz, tzh, czh))
    print(f"  {min(i + 50, len(rows))}/{len(rows)} 成分命中 {hits}/{tots}", flush=True)
for r_id, iz, tzh, czh in upd[:10]: print("  例:", r_id, "|", tzh[:30], "|", czh, "|", iz[:60])
print(f"成分中文命中率 {hits}/{tots} = {hits * 100 // max(1, tots)}%")
if not APPLY: J.__exit__(None, None, None); print("体检完成(未写库)。--apply 写库"); sys.exit(0)
sql = os.path.join(ROOT, "tools", "_hot_zh.sql")
with io.open(sql, "w", encoding="utf-8") as w:
    for r_id, iz, tzh, czh in upd:
        w.write(f"UPDATE market_products SET inci_zh={q(iz)}, title_zh=COALESCE(NULLIF({q(tzh)},''), title_zh), cat_zh=COALESCE(NULLIF({q(czh)},''), cat_zh) WHERE id={r_id};\n")
print("写库:", d1_exec(sql))
J.__exit__(None, None, None)
