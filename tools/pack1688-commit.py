#!/usr/bin/env python3
r"""1688 清单 / 规格 → 包材库草稿(status='draft',不公开)。创始人 2026-09-16 14:2x:「采了不入库等于没采」「一定要一天收集几十几百家店铺,几千几万个瓶子」。

输入:
  data/pack1688/items/<店铺>.json     清单级(pack-scrape-1688.py --list-only):offerId / 标题 / 主图 / 价带 / 销量 / 店铺
  data/pack1688/offers-*.json         规格级(商品页提取器):材质 / 工艺 / 件重尺 SKU(长宽高、重量)/ 配附件 —— 有就补进同一行
做什么:
  · 编码 AL-<offerId>(AL = Alibaba 1688;/pack/<code> 路由按前缀小写取 R2:media/pack/al/AL-xxx.webp)
  · 瓶型 / 容量 / 材质从标题解析(规格级有就用规格级);价带按 pack-price.py 的规则「¥×2 折美元」写 price_ref;供应商名只进 supplier_ref(内部)
  · 主图:原图下载 → 补白成方图 900² → webp → Worker 直传口 /api/cron/r2-copy/(直连,不走代理)
  · 一次运行产出一份 SQL 再灌(上传与入库解耦;重跑按 source_offer_id 去重:已有的只 UPDATE 规格字段)
用法:python tools/pack1688-commit.py [--limit 500] [--no-img] [--dry]"""
import argparse, csv, glob, io, json, os, re, sys, time, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import d1, d1_exec, E, UA  # noqa: E402
from PIL import Image  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, "data", "pack1688")
ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=3000); ap.add_argument("--no-img", action="store_true"); ap.add_argument("--dry", action="store_true"); ap.add_argument("--show", type=int, default=0, help="打印前 N 条解析结果(看标题→瓶型/材质/容量准不准)"); A = ap.parse_args()

TYPES = [  # 标题关键词 → 库里的 type 槽位(先匹配的先赢,所以细的放前面)
    ("airless-bottle", r"真空瓶|真空分装|真空泵|airless"), ("dropper-bottle", r"滴管|精华瓶|精油瓶"), ("foam-pump", r"慕斯|泡沫瓶|起泡瓶|泡沫泵"),
    ("spray-bottle", r"喷雾|喷壶|细雾"), ("roll-on", r"滚珠|走珠"), ("lipstick-tube", r"口红管|唇膏管"), ("lip-gloss-tube", r"唇釉|唇彩管"),
    ("compact-powder-case", r"粉饼盒|粉盒|腮红盒|眼影盒"), ("cushion-compact", r"气垫"), ("tube", r"软管|挤压管|铝塑管|复合管"), ("jar", r"膏霜瓶|膏霜罐|面霜盒|面霜瓶|面霜罐|广口瓶|罐\b|霜罐|膏罐"),
    ("cap", r"瓶盖|盖子|螺纹盖|翻盖$|盖\s*$"), ("pump-bottle", r"泵瓶|乳液瓶|按压瓶|按压泵|洗发水瓶|沐浴露瓶|洗手液瓶|泵头瓶|压泵"), ("flip-bottle", r"翻盖瓶|蝴蝶盖"),
    ("glass-bottle", r"玻璃瓶"), ("screw-bottle", r"分装瓶|旅行瓶|小样瓶|螺口瓶|拧盖瓶|瓶子|瓶\b"), ("rigid-box", r"礼盒|包装盒|彩盒|纸盒"), ("stick", r"棒管|膏体管|走珠管|旋转管"),
]
MATS = [("PETG", r"PETG"), ("PET", r"PET(?!G)|pet"), ("PCR-PP", r"PCR"), ("PP", r"(?<![A-Za-z])PP(?![A-Za-z])|聚丙烯"), ("HDPE", r"HDPE"), ("PE", r"(?<![A-Za-z])PE(?![A-Za-z])|聚乙烯"), ("AS", r"(?<![A-Za-z])AS(?![A-Za-z])"), ("ABS", r"ABS"), ("亚克力", r"亚克力|压克力|PMMA"), ("玻璃", r"玻璃"), ("铝", r"铝瓶|铝管|铝\b"), ("竹木", r"竹|木"), ("陶瓷", r"陶瓷")]
def parse_type(t):
    for slug, rx in TYPES:
        if re.search(rx, t, re.I): return slug
    return "use-other"
def parse_mat(t):
    for name, rx in MATS:
        if re.search(rx, t): return name
    return ""
def parse_cap(t):
    m = re.findall(r"(\d+(?:\.\d+)?(?:\s*[-/~]\s*\d+(?:\.\d+)?)*)\s*(ml|mL|ML|毫升|g|G|克|oz)", t)   # 50-100g / 30/50/100ml / 30~50ML 都认
    if not m: return ""
    nums, unit = m[0]; unit = {"毫升": "ml", "克": "g", "G": "g", "ML": "ml", "mL": "ml"}.get(unit, unit)
    return re.sub(r"\s*([-/~])\s*", lambda x: "-" if x.group(1) == "~" else x.group(1), nums) + unit
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
rate = {r["code"]: r["rate"] for r in d1("SELECT code, rate FROM fx_rates WHERE code='CNY'")}.get("CNY", 6.72)
def usd(cny):
    try: v = float(str(cny).replace("¥", "").split("-")[0]) * 2 / rate
    except Exception: return ""
    return f"${v:.2f}"

# 选厂闸:判过「不达标」的店、主营不是包装的店,清单留在盘上但不入库。
# 2026-09-22 盘点:库里 4,817 条来自 rejected.csv 里的 27 家店,其中四家义乌日用百货
# 各 1,230 条、79% 是抹布衣架保鲜袋 —— 采集端判了不达标,入库端没拦,这里补上。
JUNK_MAIN = ("收纳清洁用具", "日用百货", "居家日用品", "居家日用", "五金工具")
shop_key = lambda u: re.sub(r"^https?://|\.1688\.com/?$", "", (u or "").strip().rstrip("/"))
def _shoplist(name):
    f = os.path.join(OUT, name)
    return {shop_key(r.get("店铺链接")) for r in csv.DictReader(io.open(f, encoding="utf-8-sig"))} if os.path.exists(f) else set()
rejected = _shoplist("rejected.csv")
pending = _shoplist("pending-review.csv")   # 主营对口、只差入驻年限的店:等创始人一次性过,过之前同样不入库

items = {}; shop_name = {}; shop_main = {}; gated = {}
for f in glob.glob(os.path.join(OUT, "items", "*.shop.json")):
    st = json.load(io.open(f, encoding="utf-8")); k = os.path.basename(f)[:-10]
    shop_name[k] = st.get("name") or ""; shop_main[k] = st.get("main") or ""
for f in glob.glob(os.path.join(OUT, "items", "*.json")):
    if f.endswith(".shop.json"): continue
    key = os.path.basename(f)[:-5]
    why = ("不达标店" if key in rejected else "待创始人过审" if key in pending
           else "主营非包装:" + shop_main[key] if shop_main.get(key) in JUNK_MAIN else "")
    if why:
        gated[key] = (shop_name.get(key) or key, why, len(json.load(io.open(f, encoding="utf-8")))); continue
    for it in json.load(io.open(f, encoding="utf-8")):
        it["supplier"] = it.get("supplier") or shop_name.get(key) or key   # 候选店的「工厂」列是空的,用店铺页读到的名字(后台按 supplier_ref 对 pack_shops.name)
        items[it["offerId"]] = it
specs = {}
for f in glob.glob(os.path.join(OUT, "offers-*.json")):
    for o in json.load(io.open(f, encoding="utf-8")): specs[str(o.get("offerId"))] = o
have = {str(r["source_offer_id"]): r["code"] for r in d1("SELECT source_offer_id, code FROM packaging WHERE source_offer_id IS NOT NULL")}
print(f"清单 {len(items)} 款 · 规格 {len(specs)} 款 · 库里已有 {len(have)} 款 · 汇率 CNY {rate}")
if gated:
    print(f"选厂闸拦下 {len(gated)} 家 / {sum(v[2] for v in gated.values())} 条(不入库,清单仍留在 items/):")
    for k, (nm, why, n) in sorted(gated.items(), key=lambda kv: -kv[1][2])[:12]: print(f"    {nm[:24]:26s} {n:5d} 条 · {why}")

cron = E.get("CRON_KEY"); api = "https://biosphere-ai.com/api/cron/r2-copy/"; opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def upload(key, blob):
    req = urllib.request.Request(f"{api}?key={urllib.parse.quote(key, safe='/')}", data=blob, method="POST", headers={"x-cron-key": cron, "Origin": "https://biosphere-ai.com", "Content-Type": "image/webp", "User-Agent": UA})
    last = ""
    for i in range(3):
        try:
            with opener.open(req, timeout=120) as f: r = json.loads(f.read().decode("utf-8", "replace"))
            if r.get("ok"): return True
            last = str(r)[:100]
        except Exception as e: last = f"{type(e).__name__}: {str(e)[:80]}"
        time.sleep(1.5 * (i + 1))
    print("  上传失败", key, last); return False
def fetch_img(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://detail.1688.com/"})
    with opener.open(req, timeout=40) as r: return r.read()
def square_webp(blob, size=900):
    im = Image.open(io.BytesIO(blob)).convert("RGB"); w, h = im.size; s = max(w, h)
    canvas = Image.new("RGB", (s, s), (255, 255, 255)); canvas.paste(im, ((s - w) // 2, (s - h) // 2)); canvas = canvas.resize((size, size), Image.LANCZOS)
    out = io.BytesIO(); canvas.save(out, "WEBP", quality=82); return out.getvalue()

lines, n_new, n_upd, n_img, n_fail, img_jobs = [], 0, 0, 0, 0, []
done_img = set(json.load(io.open(os.path.join(OUT, "uploaded.json"), encoding="utf-8"))) if os.path.exists(os.path.join(OUT, "uploaded.json")) else set()
for oid, it in list(items.items())[:A.limit]:
    sp = specs.get(oid, {}); title = (sp.get("title") or it.get("title") or "").strip(); code = f"AL-{oid}"
    typ = parse_type(title); mat = (sp.get("material") or parse_mat(title) or "")[:80]; cap = parse_cap(title)
    skus = sp.get("skus") or []; dims = sp.get("dimsFromSku") or sp.get("dims") or ""; wt = next((s.get("weight_g") for s in skus if s.get("weight_g")), None)
    if skus and not cap: cap = "/".join(dict.fromkeys(s["capacity"] for s in skus if s.get("capacity")))[:60]
    price = usd(it.get("price") or sp.get("price") or "")
    if A.show and (n_new + n_upd) < A.show: print(f"  {typ:<20} {mat:<8} {cap:<16} {price:<7} {title[:44]}")
    note = f"1688 ¥{it.get('price', '?')} ×2 ÷ {rate:.2f}(fx_rates {time.strftime('%Y-%m-%d')});销量 {it.get('sold', '')}"
    sku_raw = json.dumps({"skus": skus[:60], "attrs": {k: v for k, v in (sp.get("attrs") or {}).items() if k in ("工艺", "表面处理", "配附件", "型号", "货号", "是否可加工定制", "误差", "产地")}}, ensure_ascii=False) if sp else None
    if oid in have:
        lines.append(f"UPDATE packaging SET supplier_ref=COALESCE(NULLIF(supplier_ref,''), {q(it.get('supplier'))}), material=COALESCE(NULLIF({q(mat)},''), material), capacity=COALESCE(NULLIF({q(cap)},''), capacity), dims=COALESCE({q(dims)}, dims), weight_g=COALESCE({q(wt)}, weight_g), sku_raw=COALESCE({q(sku_raw)}, sku_raw), source_price={q(it.get('price'))}, source_price_note={q(note)}, price_ref=COALESCE(NULLIF({q(price)},''), price_ref), updated_at=datetime('now') WHERE source_offer_id={q(oid)};"); n_upd += 1
    else:
        lines.append(f"INSERT INTO packaging (code, type, material, capacity, dims, weight_g, status, source_url, source_offer_id, supplier_ref, sourced_at, sku_raw, source_price, source_price_note, price_mult, price_ref, price_currency, notes_zh, updated_at) VALUES ({q(code)}, {q(typ)}, {q(mat) if mat else chr(39) * 2}, {q(cap)}, {q(dims)}, {q(wt)}, 'draft', {q(it.get('url'))}, {q(oid)}, {q(it.get('supplier'))}, date('now'), {q(sku_raw)}, {q(it.get('price'))}, {q(note)}, 2, {q(price)}, 'USD', {q(title[:120])}, datetime('now'));"); n_new += 1
    img = it.get("img") or ((sp.get("images") or [""])[0])
    if img and not A.no_img and not A.dry and code not in done_img: img_jobs.append((code, img))
# 图:8 线程并行(单线程 6 秒一张,3,700 张要 6 小时;并行后 ~45 分钟)。下载→补白方图→webp→Worker 直传;进度每 50 张落盘,断了可续
from concurrent.futures import ThreadPoolExecutor, as_completed
def one(code, img):
    try: return code, upload(f"media/pack/al/{code}.webp", square_webp(fetch_img(img)))
    except Exception as e: print("  图失败", code, str(e)[:60]); return code, False
if img_jobs:
    print("图任务", len(img_jobs), "张,8 线程", flush=True)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, fut in enumerate(as_completed([ex.submit(one, c_, u_) for c_, u_ in img_jobs]), 1):
            code_, ok_ = fut.result(); n_img += 1 if ok_ else 0; n_fail += 0 if ok_ else 1
            if ok_: done_img.add(code_)
            if i % 50 == 0: io.open(os.path.join(OUT, "uploaded.json"), "w").write(json.dumps(sorted(done_img))); print(f"  图进度 {i}/{len(img_jobs)}", flush=True)
io.open(os.path.join(OUT, "uploaded.json"), "w").write(json.dumps(sorted(done_img)))
# 店铺资质 → pack_shops(后台「包材采集」页用;老板的 decision 不覆盖)
for f in glob.glob(os.path.join(OUT, "items", "*.shop.json")):
    st = json.load(io.open(f, encoding="utf-8")); key = os.path.basename(f)[:-10]
    ok = 1 if (st.get("years", 0) >= 5 and st.get("repeat", 0) >= 30) else 0
    lines.append(f"INSERT INTO pack_shops (shop_key, shop_url, name, years, repeat_rate, score, main_cat, loc, items, qualified, first_seen, last_seen) VALUES ({q(key)}, {q(st.get('shop'))}, {q(st.get('name'))}, {q(st.get('years'))}, {q(st.get('repeat'))}, {q(st.get('score'))}, {q(st.get('main'))}, {q(st.get('loc'))}, {q(st.get('items', 0))}, {ok}, {q(st.get('seen'))}, {q(st.get('seen'))}) ON CONFLICT(shop_key) DO UPDATE SET name=COALESCE(excluded.name, name), years=excluded.years, repeat_rate=excluded.repeat_rate, score=excluded.score, main_cat=COALESCE(excluded.main_cat, main_cat), loc=COALESCE(excluded.loc, loc), items=excluded.items, qualified=excluded.qualified, last_seen=excluded.last_seen;")
print(f"新建 {n_new} · 更新 {n_upd} · 图传 {n_img}(失败 {n_fail})")
if A.dry: print("(dry run)"); sys.exit(0)
# D1 一次吃不下几千条(14:5x 实测 3,689 条一个文件 → {"D1_RESET_DO":true}),按 300 条一段灌;失败的段留 _pack1688-commit-failN.sql 重跑
total = 0
for i in range(0, len(lines), 300):
    out = os.path.join(ROOT, "tools", "_pack1688-commit.sql"); io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines[i:i + 300]) + "\n")
    n = d1_exec(out); total += n or 0
    if not n: io.open(os.path.join(ROOT, "tools", f"_pack1688-commit-fail{i // 300}.sql"), "w", encoding="utf-8", newline="\n").write("\n".join(lines[i:i + 300]) + "\n"); print("  段", i // 300, "失败,留档", flush=True)
    else: print(f"  段 {i // 300} 入库 {n}", flush=True)
print("入库合计", total)
