"""原料结构图与分子信息(PubChem,公共领域)—— 创始人 2026-09-17:「那么多资源库都要抓回来,图文展示」「他们还有图片」。
直连 PubChem 不通,走本机 7890 代理(BOHUI_PROXY 可改)。来源 inci_catalog:cn-nmpa-2021 带 pubchem_cid 的按 CID 直取(无歧义),
其余有 CAS 的按 CAS 查(name 端点收 CAS);不按 INCI 名查——名查会把「茶树油」配成锌盐之类的错化合物。
产物:data/ingredients/structures/<inci_key 的 slug>.png(300×300)与 data/ingredients/structures.json
  { INCI_KEY: { cid, formula, mw, smiles, iupac, cas, png } | { none:true, tried } }
用法:python tools/ingredients/structures.py [--limit N]   (自动跳过已做过的;入 D1/R2 由 structures-load.py 走)"""
import io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, job
OUT = os.path.join(ROOT, "data", "ingredients", "structures"); os.makedirs(OUT, exist_ok=True)
META = os.path.join(ROOT, "data", "ingredients", "structures.json")
meta = json.load(io.open(META, encoding="utf-8")) if os.path.exists(META) else {}
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10 ** 6
PROXY = os.environ.get("BOHUI_PROXY", "http://127.0.0.1:7890")
opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound"
def get(u):
    try:
        with opener.open(urllib.request.Request(u, headers={"User-Agent": "bohui-ingredients/1.0"}), timeout=40) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, b""
def slug(k): return re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")[:80]
# d1() 大结果静默返回 [],按 rowid 分页
rows, off = [], 0
while True:
    part = d1(f"SELECT inci_key, cas, pubchem_cid FROM inci_catalog WHERE registry IN ('cn-nmpa-2021','eu-cosing') AND ((pubchem_cid IS NOT NULL AND pubchem_cid<>'') OR (cas IS NOT NULL AND cas<>'')) ORDER BY rowid LIMIT 300 OFFSET {off}")
    if not part: break
    rows += part; off += 300
best = {}   # 一个 INCI 只留一条:有 CID 的优先
for r in rows:
    k = r["inci_key"]; cid = (r.get("pubchem_cid") or "").strip(); m = re.search(r"\b(\d{2,7}-\d{2}-\d)\b", r.get("cas") or "")
    if cid.isdigit(): best[k] = ("cid", cid)
    elif m and k not in best: best[k] = ("name", m.group(1))
todo = [(k, v) for k, v in best.items() if k not in meta][:LIMIT]
print(f"目录行 {len(rows)},可查 INCI {len(best)},待取 {len(todo)}", flush=True)
ok = miss = 0
J = job('structures', total=len(todo)).__enter__()   # 任务中心心跳
for i, (k, (kind, key)) in enumerate(todo, 1):
    J.tick(i, f'有结构 {ok} 无 {miss}')
    try:
        st, body = get(f"{PUG}/{kind}/{urllib.parse.quote(key)}/property/MolecularFormula,MolecularWeight,IsomericSMILES,IUPACName/JSON")
        if st != 200: meta[k] = {"none": True, "tried": key}; miss += 1
        else:
            prop = json.loads(body)["PropertyTable"]["Properties"][0]
            st2, png = get(f"{PUG}/cid/{prop['CID']}/PNG?image_size=300x300")
            if st2 == 200 and png: io.open(os.path.join(OUT, slug(k) + ".png"), "wb").write(png)
            meta[k] = {"cid": prop["CID"], "formula": prop.get("MolecularFormula"), "mw": prop.get("MolecularWeight"), "smiles": prop.get("IsomericSMILES"), "iupac": prop.get("IUPACName"), "cas": key if kind == "name" else None, "png": st2 == 200 and bool(png)}; ok += 1
    except Exception as e:
        meta[k] = {"none": True, "err": str(e)[:80], "tried": key}; miss += 1
    if i % 25 == 0 or i == len(todo):
        io.open(META, "w", encoding="utf-8").write(json.dumps(meta, ensure_ascii=False, indent=1))
        print(f"  {i}/{len(todo)} 有结构 {ok} 无 {miss}", flush=True)
    time.sleep(0.45)   # PubChem 限 5 次/秒,两次请求一条
print(f"完成:有结构 {ok},无 {miss} → {OUT}")
J.__exit__(None, None, None)
