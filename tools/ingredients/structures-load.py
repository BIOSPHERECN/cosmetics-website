"""分子结构入库(骨架,尚未跑)—— 创始人 2026-09-17:「那么多资源库都要抓回来,图文展示」「他们还有图片」。
读 data/ingredients/structures.json(tools/ingredients/structures.py 的产物,键 = inci_key,值 {cid, formula, mw, smiles, iupac, png} 或 {none:true}),
写进 ingredient_structures(0083 迁移建表;不给 ingredient_facts 加列)。png_key 只落 R2 键名 ingredients/structures/<slug>.png,
图本身由后续 r2-copy 上传(传图只走 wrangler,见 memory r2-two-buckets-same-name)。
用法:python tools/ingredients/structures-load.py [--limit N] [--only-missing]   幂等:INSERT OR REPLACE,200 行一文件走 d1_exec;
--only-missing 先分页读库里已有 inci_key 跳过(structures.py 边跑边入,重复跑只补新的)。"""
import io, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec
META = os.path.join(ROOT, "data", "ingredients", "structures.json")
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10 ** 6
q = lambda s: "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"
def slug(k): return re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")[:80]   # 与 structures.py 同算法,png 文件名就是它

meta = {}
for _t in range(3):   # structures.py 还在后台写这个文件,撞上半截 JSON 就等一下重读
    try: meta = json.load(io.open(META, encoding="utf-8")) if os.path.exists(META) else {}; break
    except ValueError: import time; time.sleep(2)
have = set()
if "--only-missing" in sys.argv:   # 大结果 d1() 静默返回 [],必须 ORDER BY rowid 分页(memory feedback-measure-query-rows)
    off = 0
    while True:
        page = d1(f"SELECT inci_key FROM ingredient_structures ORDER BY rowid LIMIT 2000 OFFSET {off}")
        have.update(r["inci_key"] for r in page); off += 2000
        if len(page) < 2000: break
rows = [(k, v) for k, v in meta.items() if v.get("cid") and k not in have][:LIMIT]
print(f"structures.json {len(meta)} 条,有结构 {sum(1 for v in meta.values() if v.get('cid'))} 条,库里已有 {len(have)} 条,本次入 {len(rows)} 条")
total = 0
COLS = ["inci_key", "cid", "formula", "mw", "smiles", "iupac", "png_key"]
for n, i in enumerate(range(0, len(rows), 200), 1):
    vals = ",\n".join("(" + ",".join([q(k), str(int(v["cid"])), q(v.get("formula")), q(v.get("mw")), q(v.get("smiles")), q(v.get("iupac")),
                                       q(f"ingredients/structures/{slug(k)}.png" if v.get("png") else None)]) + ")" for k, v in rows[i:i + 200])
    path = os.path.join(ROOT, "tools", f"_structures_{n}.sql")   # .gitignore 的 tools/_*.sql 规则盖住
    io.open(path, "w", encoding="utf-8").write(f"INSERT OR REPLACE INTO ingredient_structures ({','.join(COLS)}) VALUES\n{vals};\n")
    w = d1_exec(path); total += w
    print(f"  文件 {n} 写入 {w} 行", flush=True)
    if w: os.remove(path)   # 写成功就清掉,失败的留着好重放
print(f"合计写入 {total} 行")
