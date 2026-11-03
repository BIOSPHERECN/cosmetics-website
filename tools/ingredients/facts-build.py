"""成分事实表批量标注 —— 创始人 2026-09-17 看了 INCIDecoder 产品页:「他们的信息好像更全,是需要学习的,我们是不是也可以变成这样」「这些其实也是可以对外的」。
① 分页读 market_products.inci,统计 inci_key 出现于几个产品,取 ≥2 个的按频次降序;
② 规则字段:name_zh(cn-nmpa-2021)、functions(eu-cosing note 去「功能 」前缀)、rating(口径同 lib/formula-lab.ts gate():
   cn-stsc 109/110 禁用 → red,111–115 限用/准用 → yellow;eu-annex II 禁用 → red,III–VI 限用/准用 → yellow;其余 green);
③ 模型只填 what_zh / what_en / functions_zh / irritancy / comedogenic / tags,20 个一批,失败重试一次,仍失败 src='rule' 只落规则字段;
④ INSERT OR REPLACE 攒成 tools/_facts_N.sql(200 行一文件,.gitignore 已有 tools/_*.sql)走 d1_exec,幂等。
用法:python tools/ingredients/facts-build.py [--limit N] [--only-missing]   (--only-missing = 跳过库里已有 src='model' 的 key,rule 兜底行会重做)"""
import io, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, fleet, chat, job
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10 ** 6
ONLY_MISSING = "--only-missing" in sys.argv
BATCH, PER_FILE = 20, 200
TAGS = ["alcohol", "fragrance", "allergen26", "paraben", "silicone", "sulfate", "essential-oil", "mineral-oil", "peg", "formaldehyde-releaser", "animal-derived"]
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"

# inci_key 约定(与 P 任务、0083 迁移注释同):去括号、大写、空白压一个空格
def inci_key(s):
    s = re.sub(r"[（(][^）)]*[）)]", " ", s.upper())
    return re.sub(r"\s+", " ", s).strip(" .")
# cn 目录那套键(lib/inci-key.ts):非字母数字压空格
def cn_key(k): return re.sub(r"[^A-Z0-9]+", " ", k).strip()

def paged(sql, size=1500):   # d1() 大结果静默返回 [],必须按 rowid 分页
    out, off = [], 0
    while True:
        part = d1(f"{sql} ORDER BY rowid LIMIT {size} OFFSET {off}")
        out += part; off += size
        if len(part) < size: return out

# ① 频次
freq = {}
for r in paged("SELECT id, inci FROM market_products WHERE inci IS NOT NULL AND inci<>''", 150):
    seen = {inci_key(p) for p in re.split(r"[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))", r["inci"])   # 09-18 与 decoder.ts 同口径:位号逗号不切,其余都切}
    for k in seen:
        if k: freq[k] = freq.get(k, 0) + 1
keys = sorted([k for k, n in freq.items() if n >= 2], key=lambda k: -freq[k])
if ONLY_MISSING:
    have = {r["inci_key"] for r in paged("SELECT inci_key FROM ingredient_facts WHERE src='model'")}
    keys = [k for k in keys if k not in have]
keys = keys[:LIMIT]
print(f"出现 ≥2 个产品的成分 {len(keys)} 个(全部 {len(freq)})", flush=True)

# ② 规则字段
nmpa = {}
for r in paged("SELECT inci_key, name_zh FROM inci_catalog WHERE registry='cn-nmpa-2021'"): nmpa.setdefault(r["inci_key"], r["name_zh"])
stsc = {}
for r in paged("SELECT inci_key, no FROM inci_catalog WHERE registry='cn-stsc'"): stsc.setdefault(r["inci_key"], []).append(r["no"])
annex = {}   # 附录 V/VI 一行列多个盐,逗号分开各记一份
for r in paged("SELECT inci_key, no FROM inci_catalog WHERE registry='eu-annex'"):
    for k in re.split(r",\s*", r["inci_key"]): annex.setdefault(inci_key(k), []).append(r["no"])
cosing = {}
for i in range(0, len(keys), 50):   # eu-cosing 36k 行不整读,按需 IN 查
    ks = keys[i:i + 50]
    for r in d1(f"SELECT inci_key, note FROM inci_catalog WHERE registry='eu-cosing' AND inci_key IN ({','.join(q(k) for k in ks)})"):
        cosing.setdefault(r["inci_key"], r["note"])
def rating(k):
    ck = cn_key(k)
    pre = [m.group(1) for m in (re.match(r"CN-(\d{3})/", n) for n in stsc.get(ck, [])) if m]
    ann = [n.split("/")[0] for n in annex.get(k, [])]
    if any(p in ("109", "110") for p in pre) or "II" in ann: return "red"
    if pre or ann: return "yellow"
    return "green"
# 规则标签:模型失败时的兜底,成功时并进模型结果(名字里明摆着的不该漏)
RULE_TAGS = [("alcohol", r"^ALCOHOL( DENAT\.?)?$|^SD ALCOHOL|^ETHANOL$"), ("fragrance", r"^(PARFUM|FRAGRANCE|AROMA)\b|PARFUM/FRAGRANCE|FRAGRANCE/PARFUM"),
             ("paraben", r"PARABEN"), ("silicone", r"(CONE|SILOXANE|SILSESQUIOXANE|CONOL)$|DIMETHICON"), ("sulfate", r"^(SODIUM|AMMONIUM) (LAURYL|LAURETH|COCO|MYRETH) SULFATE"),
             ("essential-oil", r"(LEAF|PEEL|FLOWER|FRUIT|SEED|BARK|WOOD|ROOT|NEEDLE) OIL$"), ("mineral-oil", r"^(MINERAL OIL|PARAFFINUM LIQUIDUM|PETROLATUM|PARAFFIN)\b"),
             ("peg", r"\bPEG-\d|\bPPG-\d|ETH-\d+"), ("formaldehyde-releaser", r"DMDM HYDANTOIN|IMIDAZOLIDINYL UREA|DIAZOLIDINYL UREA|QUATERNIUM-15|BRONOPOL|2-BROMO-2-NITROPROPANE"),
             ("animal-derived", r"^(LANOLIN|BEESWAX|CERA ALBA|CARMINE|CI 75470|COLLAGEN|KERATIN|SILK|SQUALENE|HONEY|MEL|LAC|MILK|TALLOW|ELASTIN)\b")]
ALLERGEN26 = {"AMYL CINNAMAL", "BENZYL ALCOHOL", "CINNAMYL ALCOHOL", "CITRAL", "EUGENOL", "HYDROXYCITRONELLAL", "ISOEUGENOL", "AMYLCINNAMYL ALCOHOL", "BENZYL SALICYLATE", "CINNAMAL", "COUMARIN", "GERANIOL", "HYDROXYISOHEXYL 3-CYCLOHEXENE CARBOXALDEHYDE", "ANISE ALCOHOL", "ANISYL ALCOHOL", "BENZYL CINNAMATE", "FARNESOL", "BUTYLPHENYL METHYLPROPIONAL", "LINALOOL", "BENZYL BENZOATE", "CITRONELLOL", "HEXYL CINNAMAL", "LIMONENE", "METHYL 2-OCTYNOATE", "ALPHA-ISOMETHYL IONONE", "EVERNIA PRUNASTRI EXTRACT", "EVERNIA FURFURACEA EXTRACT"}
def rule_tags(k):
    t = [n for n, rx in RULE_TAGS if re.search(rx, k)]
    if k in ALLERGEN26: t.append("allergen26")
    return t
def rule_row(k):
    note = cosing.get(k) or ""
    return {"inci_key": k, "name_zh": nmpa.get(cn_key(k)), "functions": re.sub(r"^功能\s*", "", note).strip() or None,
            "functions_zh": None, "what_zh": None, "what_en": None, "irritancy": None, "comedogenic": None,
            "rating": rating(k), "tags": rule_tags(k), "src": "rule"}

# ③ 模型:套专家思维(参考 lib/formula-lab.ts 的 persona / SHAPE 写法:证据先行、不确定写 null、不编数据)
SYS = f"""你是帛卉化妆品配方研发总工与安全评估师的联合席位,给成分百科写「事实卡」。读者是采购与品牌方,不是消费者。
## 硬规则
1. 证据先行:功能只按 CosIng 功能项与公开教材;刺激性(irritancy)与致痘性(comedogenic)按公开的 comedogenic 表(Fulton 等)与 CIR 结论给 0–5 整数,没有公开数据就写 null,不许编。
2. what_zh ≤60 字一句话:它在配方里干什么、有什么注意点(浓度/配伍/人群),不吹不黑,不写「安全无害」「有害」这类结论词。
3. what_en ≤30 词,同义,面向海外采购。
4. functions_zh:把给你的 functions 逐项译成中文,逗号分;functions 为空就按常识给 1–3 项。
5. tags 只准从这个集合取,不适用就给 []:{json.dumps(TAGS)}(allergen26 = 欧盟 26 种标示致敏香料成分;essential-oil = 植物精油本体;animal-derived = 动物来源或常见动物来源)。
6. 只输出一个 JSON 数组,不加围栏、不加前言;每个输入 key 对应一个对象,key 原样返回。
## 输出 JSON 形状
[{{"key":"GLYCERIN","what_zh":"基础保湿剂,3–10% 常用;高浓度发黏,冬季配合封闭剂更好","what_en":"Workhorse humectant at 3–10%; tacky at high levels, pair with occlusives","functions_zh":"保湿剂,溶剂,皮肤调理剂","irritancy":0,"comedogenic":0,"tags":[]}}]"""
allp = fleet()
PROVS = [p for p in allp if p["id"].startswith("agnes-30flash")] + [p for p in allp if p["id"].startswith("sensenova")] + [p for p in allp if p["id"].startswith("agnes") and not p["id"].startswith("agnes-30flash")]   # 舰队白名单;批量标注 Agnes 3.0 优先(3 把 key,免费,商汤半夜限流拖慢整批),商汤兜底
def ask(batch):
    payload = [{"key": k, "name_zh": nmpa.get(cn_key(k)), "functions": re.sub(r"^功能\s*", "", cosing.get(k) or "") or None} for k in batch]
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
    for _ in range(2):   # 解析失败重试一次
        out, who, err = chat(PROVS, msgs, max_tokens=6000, temperature=0.1, want_json=True)
        if isinstance(out, dict): out = next((v for v in out.values() if isinstance(v, list)), None)
        if isinstance(out, list):
            got = {str(o.get("key", "")).strip().upper(): o for o in out if isinstance(o, dict)}
            if len(got) >= len(batch) // 2: return got, who
        print(f"  模型失败:{err or '形状不对'},重试", flush=True)
    return {}, None
def clamp(v):
    try: v = int(v); return v if 0 <= v <= 5 else None
    except Exception: return None
def merge(row, o):
    row["what_zh"] = (str(o.get("what_zh") or "").strip() or None)
    row["what_en"] = (str(o.get("what_en") or "").strip() or None)
    row["functions_zh"] = (str(o.get("functions_zh") or "").strip() or None)
    row["irritancy"], row["comedogenic"] = clamp(o.get("irritancy")), clamp(o.get("comedogenic"))
    row["tags"] = sorted(set(row["tags"]) | {t for t in (o.get("tags") or []) if t in TAGS})
    row["src"] = "model" if row["what_zh"] else "rule"
    return row

# ④ 攒 SQL 写库
COLS = ["inci_key", "name_zh", "functions", "functions_zh", "what_zh", "what_en", "irritancy", "comedogenic", "rating", "tags", "src"]
def flush(rows, n):
    path = os.path.join(ROOT, "tools", f"_facts_{n}.sql")
    vals = ",\n".join("(" + ",".join(q(json.dumps(r[c], ensure_ascii=False) if c == "tags" else r[c]) for c in COLS) + ")" for r in rows)
    io.open(path, "w", encoding="utf-8").write(f"INSERT OR REPLACE INTO ingredient_facts ({','.join(COLS)}) VALUES\n{vals};\n")
    return d1_exec(path)

pending, nfile, fails, written, shown = [], 0, 0, 0, False
J = job('facts-build', total=len(keys)).__enter__()   # 任务中心心跳(创始人:「看看他们有没有停止」)
for i in range(0, len(keys), BATCH):
    batch = keys[i:i + BATCH]
    J.tick(i, f'批次失败 {fails}')
    got, who = ask(batch)
    if not got: fails += 1
    rows = [merge(rule_row(k), got[k]) if k in got else rule_row(k) for k in batch]
    if not shown:
        shown = True
        for r in rows[:5]: print(json.dumps(r, ensure_ascii=False), flush=True)
    pending += rows
    print(f"  {min(i + BATCH, len(keys))}/{len(keys)} 供应商 {who} 模型行 {sum(r['src'] == 'model' for r in rows)}/{len(rows)}", flush=True)
    if len(pending) >= PER_FILE:
        nfile += 1; written += flush(pending, nfile); pending = []
if pending: nfile += 1; written += flush(pending, nfile)
dist = d1("SELECT rating, COUNT(*) n FROM ingredient_facts GROUP BY rating")
srcs = d1("SELECT src, COUNT(*) n FROM ingredient_facts GROUP BY src")
print(f"完成:本次写 {written} 行,批次失败 {fails}/{(len(keys) + BATCH - 1) // BATCH};库内 {dist} {srcs}")
J.__exit__(None, None, None)
