"""给爆款产品写我们自己的介绍(summary_zh / summary_en)—— 创始人 2026-09-17 23:0x 底线:
「抓取的全页面,需要 AI 撰写,不可以抄他们的!」。输入只给模型:品牌、产品名、类目、市场、全成分(标签公开事实)与高频成分的我们自己的解读;
不给来源站的描述/亮点文字,模型也被明令不得复述任何来源文案。产出 80–120 字中文 + 40–70 词英文,讲配方结构、主打成分与适合谁,不吹不黑。
用法:python tools/market/product_summaries.py [--limit N] [--only-missing](默认只补 summary_zh 为空的)"""
import io, json, os, re, sys, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, chat, fleet, job
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10 ** 6
allp = fleet()
PROVS = [p for p in allp if p["id"].startswith("agnes-30flash")] + [p for p in allp if p["id"].startswith("sensenova")] + [p for p in allp if p["id"].startswith("agnes") and not p["id"].startswith("agnes-30flash")]   # 舰队白名单;批量标注 Agnes 3.0 优先(3 把 key,免费,商汤半夜限流拖慢整批),商汤兜底
SYS = """你是帛卉(BIOSPHERE,广州化妆品代工厂)的配方总工助理,给公开市售产品写「配方视角」的短介绍,供成分解读页对外展示。
铁律:只依据给你的全成分顺序、类目与成分解读写;绝不复述、改写或翻译任何品牌方或第三方网站的描述与宣称;不写功效承诺(不出现 治疗/治愈/根治/医学级 等),不写价格,不点评品牌好坏。
每条输出:{"id":数字,"summary_zh":"80–120 字中文:配方骨架(基质/活性/防腐体系)、主打成分与用意、适合的肤质或使用场景、一个工厂视角的观察","summary_en":"40–70 words English, same content"}。
只输出 JSON 数组,不加解释。"""
# 09-24 R2:原来 OFFSET 翻完全部待写行再截 --limit,一次运行 400 页 × 平均 6.4 万行读(8 小时 1,056 次 = 6,700 万行)。
# 改成按 rowid 接着翻、够 --limit 就停。
rows, last = [], 0
while len(rows) < LIMIT:
    page = d1(f"SELECT rowid rid, id, brand, title, cat_zh, cat, country, substr(inci,1,900) inci FROM market_products WHERE rowid > {last} AND inci IS NOT NULL AND length(inci)>30 AND (summary_zh IS NULL OR summary_zh='') ORDER BY rowid LIMIT 300")
    if not page: break
    last = page[-1]["rid"]
    rows += [{k: v for k, v in r.items() if k != "rid"} for r in page]
rows = rows[:LIMIT]; print(f"待写 {len(rows)} 条", flush=True)
facts, flast = {}, 0
while rows:   # 09-24 D2:OFFSET 翻页一轮读 5.4 万行(每 30 分钟一轮)→ 按 rowid 接着翻,约 6 千行;没有待写就不载
    page = d1(f"SELECT rowid rid, inci_key, what_zh FROM ingredient_facts WHERE rowid > {flast} AND what_zh IS NOT NULL ORDER BY rowid LIMIT 400")
    if not page: break
    flast = page[-1]["rid"]
    facts.update({r["inci_key"]: r["what_zh"] for r in page})
key = lambda s: re.sub(r"\s+", " ", re.sub(r"[（(][^）)]*[）)]", " ", s.upper())).strip(" .")
# 09-22 P 线实测:位号逗号后带空格时(`Aqua, 1, 2-Hexanediol`)上面的 lookahead 失效,切出 `1`/`3-DIOL`
# 这类碎片(全库 667 个碎片键、10,385 次出现)。不改正则(消融过,加任何分隔符与 OBF 一致率都降),切完接回去:
# 后一段 `2-` 开头 + 前一段结尾数字串 ≤2 位 = 同一个名字;`CI 17200, 12-Hydroxystearic` 不误接(17200 是 5 位)。
# 与 decoder.ts joinLocants() 同一套,回归断言在 tools/market/test_split_inci.py。
_LOCANT_HEAD = re.compile(r"^\d{1,2}\s*[-–－]")
_LOCANT_TAIL = re.compile(r"(?:^|\D)\d{1,2}$")


def join_locants(parts):
    out = []
    for p in parts:
        if out and _LOCANT_HEAD.match(p) and _LOCANT_TAIL.search(out[-1]):
            out[-1] = out[-1] + "," + p
        else:
            out.append(p)
    return out


def payload(r):
    incis = [key(x) for x in join_locants([y.strip() for y in re.split(r"[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))", r["inci"] or "") if y.strip()])][:40]
    hints = {k: facts[k] for k in incis if k in facts}
    hints = dict(list(hints.items())[:12])
    return {"id": r["id"], "brand": r["brand"], "title": r["title"], "cat": r["cat_zh"] or r["cat"], "market": r["country"], "inci": incis, "ingredient_notes": hints}
q = lambda s: "'" + str(s or "").replace("'", "''") + "'"
done = fail = 0; buf = []; n_file = 0
J = job('product-summaries', total=len(rows)).__enter__()   # 任务中心心跳
def flush():
    global buf, n_file
    if not buf: return
    n_file += 1; p = os.path.join(ROOT, "tools", f"_summaries_{n_file}.sql")
    io.open(p, "w", encoding="utf-8").write("".join(buf)); d1_exec(p); buf = []
for i in range(0, len(rows), 8):
    batch = rows[i:i + 8]
    J.tick(i, f'写好 {done} 失败 {fail}')
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": json.dumps([payload(r) for r in batch], ensure_ascii=False)}]
    got = {}
    for _ in range(2):
        out, who, err = chat(PROVS, msgs, max_tokens=5000, temperature=0.3, want_json=True)
        if isinstance(out, dict): out = next((v for v in out.values() if isinstance(v, list)), None)
        if isinstance(out, list):
            got = {int(o["id"]): o for o in out if isinstance(o, dict) and str(o.get("id", "")).isdigit()}
            if len(got) >= len(batch) // 2: break
        print(f"  模型失败:{err or '形状不对'},重试", flush=True)
    for r in batch:
        o = got.get(r["id"]); zh = (o or {}).get("summary_zh", "").strip(); en = (o or {}).get("summary_en", "").strip()
        if len(zh) < 30: fail += 1; continue
        buf.append(f"UPDATE market_products SET summary_zh={q(zh[:400])}, summary_en={q(en[:600])}, summary_at={q(dt.datetime.now().strftime('%Y-%m-%d %H:%M'))} WHERE id={r['id']};\n"); done += 1
    if len(buf) >= 120: flush()
    if (i // 8) % 10 == 0: print(f"  {min(i + 8, len(rows))}/{len(rows)} 写好 {done} 失败 {fail} 供应商 {who}", flush=True)
flush(); print(f"完成:写好 {done},失败 {fail}")
J.__exit__(None, None, None)
