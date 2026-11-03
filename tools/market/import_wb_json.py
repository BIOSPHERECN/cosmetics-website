"""直接吃 WorkBuddy 采集目录里的 JSON(它还没导出 CSV 时也能进库)—— 创始人 2026-09-17 22:1x:「配方库还是没更新吗」。
源:C:/Users/Administrator/WorkBuddy/<会话>/collect/{mega_scan,mega_scan_9222,mass_nav,mass_nav_9222}.json
  每条 {brand, name, ingredients, claims, ingUrl, href, price, cat, source}
市场:韩/日品牌按 WorkBuddy 自己的品牌表判 kr/jp,其余记 gl(全球,INCIDecoder 收录的各国品牌);类目沿用它的 inferCat。
去重:按 ingUrl(pid);已在库(任何 platform)的同 pid 不重复插。用法:python tools/market/import_wb_json.py [--apply] [--dir <collect目录>]"""
import io, json, os, re, sys, glob, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec, job
APPLY = "--apply" in sys.argv
D = sys.argv[sys.argv.index("--dir") + 1] if "--dir" in sys.argv else max(glob.glob(os.path.expanduser("~/WorkBuddy/*/collect")), key=os.path.getmtime)
KR = set("abib torriden aestura illiyoon mediheal tonymoly anua beplain round-lab cosrx some-by-mi isntree purito goodal iunik soonjung make-prem laneige innisfree etude skinfood nature-republic missha the-face-shop holika-holika benton beauty-of-joseon skin1004 haruharu jumiso dr-jart sulwhasoo amorepacific s-nature medicube numbuzin mixsoon axis-y tirtir peripera rom&nd romand clio hera espoir".split())
JP = set("shiseido shu-uemura kanebo canmake cezanne excel integrate maquillage sk-ii kao biore curel sofina kose hada-labo senka dhc fancl muji anessa elixir".split())
def slug(b): return re.sub(r"[^a-z0-9&]+", "-", (b or "").lower()).strip("-")
def mk_of(brand): s = slug(brand); return "kr" if s in KR else "jp" if s in JP else "gl"
def cat_of(name):   # 移植 WorkBuddy gen_all_csv.js 的 inferCat,类目口径与它导出的 CSV 一致
    n = (name or "").lower()
    for pat, c in [(r"serum|ampoule|essence|booster|shot|treatment", "精华"), (r"cream|moistur|lotion|barrier|relief", "面霜"), (r"cleans|foam|wash|micellar", "洁面"), (r"mask|sheet|patch|pack", "面膜"), (r"sun|spf|uv", "防晒"), (r"shampoo|scalp|hair wash", "洗发"), (r"conditioner|hair mask|hair cream", "护发素"), (r"body|hand|foot", "身体乳"), (r"lip|gloss|tint", "口红"), (r"foundation|concealer|blush|powder|primer|cushion|\bbb\b|\bcc\b", "粉底"), (r"toner|pad|exfoliat|peeling", "精华"), (r"tooth|teeth|whitening", "牙膏")]:
        if re.search(pat, n): return c
    return "其他"
seen, rows = {}, []
ZH = {"品牌": "brand", "产品名": "name", "全成分INCI": "ingredients", "产品图": "image_url", "来源URL": "ingUrl", "功能标签": "functions", "功效描述": "description", "市场": "country"}
def load_any(f):   # .json(数组/对象)与 .jsonl(一行一条,WorkBuddy 09-18 抓全页面改用的格式);中文键名归一
    out = []
    if f.endswith(".jsonl"):
        for l in io.open(f, encoding="utf-8", errors="replace"):
            l = l.strip()
            if l:
                try: out.append(json.loads(l))
                except Exception: pass
    else:
        d = json.load(io.open(f, encoding="utf-8", errors="replace"))
        out = d if isinstance(d, list) else (d.get("items") or d.get("products") or d.get("results") or [])
    for x in out:
        if isinstance(x, dict):
            for k in list(x.keys()):
                if k in ZH and ZH[k] not in x: x[ZH[k]] = x[k]
            if x.get("image_url") and not x.get("img"): x["img"] = x["image_url"]
    return out
DELIV = "F:/0cosmetic/助手交付/5-爆款配方"   # 09-18 12:0x:WorkBuddy 开始把 .jsonl 直接交到交付夹(不再只有 CSV),一并吃
raw_all = []
for f in sorted(glob.glob(os.path.join(D, "*.json")) + glob.glob(os.path.join(D, "*.jsonl")) + glob.glob(os.path.join(DELIV, "*.jsonl")) + glob.glob(os.path.join(DELIV, "*.json"))):
    if re.search(r"(brands|build_|check_|config|state|log|all_urls)", os.path.basename(f)): continue   # 品牌表 / 状态文件跳过;其余 json 都吃(抓全页面后文件名会变)
    try: items = load_any(f)
    except Exception as e: print("跳过", f, e); continue
    for x in items:
        if not isinstance(x, dict): continue
        x['_src_file'] = os.path.basename(f); raw_all.append(x)   # 原文归档用(0101):不管新旧一律存 market_product_raw
        inci = x.get("ingredients") or x.get("inci") or x.get("inciList") or ""; inci = (", ".join(inci) if isinstance(inci, list) else str(inci)).strip(); x["ingredients"] = inci
        pid = (x.get("ingUrl") or x.get("url") or x.get("href") or "").strip(); x.setdefault("ingUrl", pid)
        if len(inci) < 30 or not pid or pid in seen: continue
        seen[pid] = 1; rows.append(x)
print(f"源目录 {D}:去重后 {len(rows)} 条有全成分")
have, names = set(), set()
norm = lambda b, t: re.sub(r"[^a-z0-9]+", "", ((b or "") + (t or "")).lower())[:60]
last = 0
while True:   # 09-20 22:0x:400/页要 250 次查询,12.6 万导入干跑 10 分钟没过体检;5000/页 14 次。09-24 D2:OFFSET → rowid 游标(OFFSET 一轮累计读约 480 万行)
    page = d1(f"SELECT rowid rid, pid, brand, title FROM market_products WHERE rowid > {last} ORDER BY rowid LIMIT 5000")
    if not page: break
    last = page[-1]["rid"]
    have.update(r["pid"] for r in page); names.update(norm(r["brand"], r["title"]) for r in page)
# 同一产品早上 CSV 可能已按商品链接进库,这里再按 品牌+品名 归一去重
new = [x for x in rows if x["ingUrl"] not in have and norm(x.get("brand"), x.get("name")) not in names]
print(f"库里已有 {len(have)} 条,本次新增 {len(new)} 条;市场分布", {m: sum(1 for x in new if mk_of(x.get('brand')) == m) for m in ('kr', 'jp', 'gl')})
if not APPLY: print("体检完成(未写库)。--apply 写库"); sys.exit(0)
q = lambda s: "'" + str(s or "").replace("'", "''") + "'"
today = dt.date.today().isoformat(); n = 0
J = job('import-wb-json', total=len(new)).__enter__()   # 任务中心心跳
STEP = 1000   # 09-20 22:0x:一行一条 INSERT,一个文件 1000 条(≈1.5MB)走 D1 导入;150 条/次要 840 次 wrangler
for i in range(0, len(new), STEP):
    J.tick(i, f'写入累计 {n}')
    p = os.path.join(ROOT, "tools", f"_wbjson_{i // STEP + 1}.sql")
    with io.open(p, "w", encoding="utf-8") as w:
        for x in new[i:i + STEP]:
            mk = mk_of(x.get("brand")); title = (x.get("name") or "").strip()
            g = lambda *ks: next((str(x.get(k)).strip() for k in ks if x.get(k) not in (None, "", [])), "")   # 全页面字段(创始人 22:5x「抓取全页面,你要跟住」)
            claims = g("claims", "highlights", "benefits")[:300]; price = g("price"); rev = g("reviews", "reviewCount"); rating = g("rating", "stars")
            desc = g("description", "desc", "about")[:400]; img = g("img", "image", "imageUrl", "image_url")[:400]; size = g("size", "spec", "volume")[:60]
            note = " ‖ " + " · ".join(v for v in [f"价 {price}" if price else "", f"评论 {rev}" if rev else "", f"评分 {rating}" if rating else "", desc, "来源 INCIDecoder"] if v)
            w.write(f"INSERT INTO market_products (platform,pid,title,brand,cat,url,img,inci,claims,size,country,first_seen,last_seen) VALUES ({q('inkeedecoder-' + mk)},{q(x['ingUrl'])},{q(title[:200])},{q((x.get('brand') or '').strip()[:80])},{q(cat_of(title))},{q((x.get('href') or x['ingUrl']).strip()[:400])},{q(img)},{q(x['ingredients'][:4000])},{q((claims + note).strip(' ‖'))},{q(size)},{q(mk)},{q(today)},{q(today)}) ON CONFLICT(platform,pid) DO UPDATE SET inci=excluded.inci, claims=excluded.claims, img=COALESCE(NULLIF(excluded.img,''), img), size=COALESCE(NULLIF(excluded.size,''), size), last_seen=excluded.last_seen;\n")
    n += d1_exec(p); print(f"  写入累计 {n}", flush=True)
# 原文归档(0101):按 pid 去重,INSERT OR IGNORE,分批走 SQL 文件(引号/反斜杠多,--command 会拆坏)
seen_raw, nr = set(), 0
batch, stmts = [], []   # batch=一条语句里的行(≤60KB);stmts=一个文件里的语句(20 条≈1.2MB 一次 wrangler)
def cut_raw():
    global batch
    if batch: stmts.append("INSERT OR IGNORE INTO market_product_raw (pid, raw_json, scraped_at, src_file) VALUES " + ",".join(batch) + ";"); batch = []
    if len(stmts) >= 20: flush_raw()
def flush_raw():
    global nr, stmts
    if batch: cut_raw()
    if not stmts: return
    p = os.path.join(ROOT, "tools", "_wbraw.sql")
    with io.open(p, "w", encoding="utf-8") as w:
        w.write(chr(10).join(stmts) + chr(10))
    nr += d1_exec(p) or 0; stmts = []; print(f"  原文归档累计 {nr}", flush=True)
last = 0
while True:   # 09-20 22:1x:原文表已有 13 万行,先拉 pid 跳过,不然 150MB 白传一遍。09-24 D2:rowid 游标
    page = d1(f"SELECT rowid rid, pid FROM market_product_raw WHERE rowid > {last} ORDER BY rowid LIMIT 5000")
    if not page: break
    last = page[-1]["rid"]
    seen_raw.update(r["pid"] for r in page)
print(f"原文表已有 {len(seen_raw)} 条,只归档没有的", flush=True)
for x in raw_all:
    pid = (x.get("ingUrl") or x.get("url") or x.get("href") or "").strip()
    if not pid or pid in seen_raw: continue
    seen_raw.add(pid)
    src = x.pop("_src_file", ""); rawj = json.dumps({k: v for k, v in x.items() if k not in ("ingUrl",)}, ensure_ascii=False)
    batch.append(f"({q(pid)},{q(rawj[:20000])},{q(x.get('scraped_at') or '')},{q(src)})")
    if sum(len(b) for b in batch) > 60_000: cut_raw()   # D1 单语句约 100KB 上限:按字节数切(09-19 18:2x 138 批 TOOBIG);09-20 改多语句一文件
flush_raw()
print(f"原文归档:本次新存 {nr} 行(market_product_raw 按 pid 去重)")
print(f"完成:写入 {n} 行。接着跑 python tools/market/hot_zh.py --apply 出中文")
J.__exit__(None, None, None)
