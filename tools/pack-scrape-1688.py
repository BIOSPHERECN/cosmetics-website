#!/usr/bin/env python3
r"""1688 包材采集(每日,走创始人 360 浏览器的登录态,只读)。

创始人 2026-09-16 07:5x:「要抓 1688 的」「360 浏览器已经有登录 1688 的」。
360 安全浏览器要用 F:\0cosmetic\1688采集-开360.bat 启动(带 --remote-debugging-port=9222),
这里用 CDP 连上去,在它的会话里开一个新标签页读搜索页和商品页:不点按钮、不提交、不动购物车,读完关掉自己开的标签页。
图片从 cbu01.alicdn.com 直下(不带登录态也能取),所以下载不碰账号。

产出:
  data/pack1688/offers-YYYY-MM-DD.json    提取器(tools/ali1688-extract.js)格式的数组 → 给 tools/ali1688-ingest.py --probe
  F:\0cosmetic\包材图库\1688-<供应商>\<类目>-<offerId>-<n>.jpg + manifest.csv(和 pack-scrape.py 一样的纪律:按厂建文件夹)
  data/pack1688/seen.json                 抓过的 offerId,不重复

纪律:每页停 4–8 秒;搜索页每类目取前 N 条;每天最多 --cap 个商品页;遇到验证码 / 登录墙(URL 带 punish / login)就停,不硬闯。
用法:python tools/pack-scrape-1688.py [--cap 30] [--per 8] [--cats airless-bottle,cream-jar]"""
import argparse, csv, datetime as dt, glob, io, json, os, random, re, sys, time, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = r"F:\0cosmetic\包材图库"; OUT = os.path.join(ROOT, "data", "pack1688"); os.makedirs(OUT, exist_ok=True)
CATS = {  # 类目 → 1688 搜索词(和 pack-scrape.py / pack-scrape-mic.py 的类目名对齐)
    "airless-bottle": "真空瓶 化妆品", "cream-jar": "膏霜瓶 化妆品 罐", "tube": "化妆品软管", "dropper": "精华液滴管瓶",
    "pump-bottle": "乳液泵瓶 化妆品", "lipstick-tube": "口红管 空管", "compact-case": "粉饼盒 空盒", "paper-box": "化妆品包装盒 彩盒",
    "spray-bottle": "喷雾瓶 化妆品", "foam-bottle": "慕斯泡沫瓶",
}
ap = argparse.ArgumentParser(); ap.add_argument("--cap", type=int, default=30); ap.add_argument("--per", type=int, default=8); ap.add_argument("--cats", default=",".join(CATS)); ap.add_argument("--shops", action="store_true", help="按 data/pack1688/factories.csv 里的店铺一家一家收(先于关键词搜索)"); ap.add_argument("--list-only", action="store_true", help="只收店铺清单(标题/主图/价带/销量/offerId),不开商品页 —— 量级模式"); ap.add_argument("--pages", type=int, default=40, help="每家店最多翻页数(一页 30 款)。0 = 按店铺自报的在售总数自动算(上限 200 页);默认 40 会在 1+40×30=1230 条处截断,09-22 盘点发现五家店都恰好停在 1230"); ap.add_argument("--discover", action="store_true", help="从关键词搜索结果里挖店铺域名 → data/pack1688/candidates.csv(量级模式的入口)"); ap.add_argument("--auto", action="store_true", help="清单模式顺带读店铺资质(入驻年/回头率/服务分),达标的自动进 factories.csv"); ap.add_argument("--gap", type=int, default=90, help="清单模式店与店之间停几秒(12:1x 实测 2 分钟一家、9 家就被拦;夜里用 90–120)"); ap.add_argument("--only", default="", help="只收这几家(逗号分隔的 shop_key 或店铺域名)—— 定点复收用,不浪费当天的 8 次额度"); ap.add_argument("--specs", type=int, default=0, help="清单里按销量挑 N 款还没规格的开商品页补材质/尺寸/重量"); A = ap.parse_args()
seen_f = os.path.join(OUT, "seen.json"); seen = set(json.load(io.open(seen_f, encoding="utf-8"))) if os.path.exists(seen_f) else set()
EXTRACT = io.open(os.path.join(ROOT, "tools", "ali1688-extract.js"), encoding="utf-8").read()
NEXT_JS = io.open(os.path.join(ROOT, "tools", "ali1688-next.js"), encoding="utf-8").read()
today = dt.date.today().isoformat()
JUNK_MAIN = ("收纳清洁用具", "日用百货", "居家日用品", "居家日用", "五金工具")   # 主营这些的店不是包材厂,和入驻年限是两回事
def log(*a): print(f"{dt.datetime.now():%m-%d %H:%M}", *a, flush=True)
def clean_name(s, n=40): return (re.sub(r"\s+", " ", re.sub(r'[\\/:*?"<>|\r\n\t]', " ", s or "")).strip()[:n] or "unknown")
NORM = lambda u: re.sub(r"\.(jpe?g|png|webp)_[^/]*$", r".\1", ("https:" + u) if u.startswith("//") else u)   # noqa: E731  缩略后缀去掉,同一张图的缩略与原图只留一份
def save_img(url, path):
    if url.startswith("//"): url = "https:" + url
    url = re.sub(r"\.(jpe?g|png|webp)_[^/]*$", r".\1", url)   # 去掉 _b.jpg / _310x310.jpg / _.webp 这类缩略后缀,拿原图
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://detail.1688.com/"})
    with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f: f.write(r.read())
    return os.path.getsize(path)
def blocked(page):
    u = page.url; t = (page.title() or "")
    return ("punish" in u or "login.1688" in u or "login.taobao" in u or "验证" in t or "登录" in t)

SEARCH_JS = r"""() => { const out = []; const seen = new Set();   // 搜索页的商品链接是 detail.m.1688.com/page/index.html?offerId=NNN(2026-09-16 实测),桌面商品页再按 offerId 拼
  for (const a of document.querySelectorAll('a[href*="offerId="],a[href*="/offer/"]')) { const m = a.href.match(/offerId=(\d+)|offer\/(\d+)\.html/); const id = m && (m[1] || m[2]); if (!id || seen.has(id)) continue;
    let card = a; for (let i = 0; i < 6 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('img') && (card.innerText || '').length > 20) break; }
    const img = card.querySelector('img'); const txt = (card.innerText || '').replace(/\s+/g, ' ').trim();
    const title = (a.title || (img && img.alt) || txt).replace(/\s+/g, ' ').trim().slice(0, 80); if (!title) continue; seen.add(id);
    const comp = (txt.match(/([一-龥A-Za-z()（）]{4,30}(?:有限公司|厂|商行|工厂|包装|制品))/) || [])[1] || '';
    out.push({ offerId: id, url: 'https://detail.1688.com/offer/' + id + '.html', title, img: img ? (img.src || img.getAttribute('data-src') || '') : '', supplier: comp }); }
  return out; }"""

def shop_ids(page, url, want):
    """店铺「全部商品」页的商品 id。2026-09-16 10:4x 实测:页面纯前端渲染,卡片上没有链接;真正的清单来自接口
    mtop.alibaba.alisite.cbu.server.ModuleAsyncService(响应 data.content.offerList,每页 30 条,店铺共 offerCount 条)。
    所以只监听这个响应取 id / 标题 / 主图,并按 memberId 过滤掉「为你推荐」混进来的别家货;想要更多就点「下一页」(每天最多 6 页,间隔 6–9 秒)。
    节奏:10 分钟内开 8 次店铺页就会被 _____tmd_____ 反爬页拦(08:1x 踩过),所以一家店一天只进一次。返回 [(id, title, img)],按清单顺序。"""
    found, order, member = {}, [], [None]
    shop_ids.total, shop_ids.stop = 0, ""
    def on_resp(r):
        try:
            if "ModuleAsyncService" not in r.url: return
            t = r.text()
            if "offerList" not in t: return
            # 店铺在售总数:接口自己报的。有了它才知道 1,230 是不是截断(09-22 五家店都恰好停在 1230 = 1+40×30)
            for m in re.finditer(r'"(?:totalCount|offerCount|totalNum|totalResults|total)"\s*:\s*"?(\d{1,7})"?', t):
                v = int(m.group(1))
                if 0 < v < 1000000 and v > shop_ids.total: shop_ids.total = v
            j = json.loads(t[t.index("{"): t.rindex("}") + 1])
            def walk(o):
                if isinstance(o, dict):
                    if isinstance(o.get("offerList"), list): return o["offerList"]
                    for v in o.values():
                        x = walk(v)
                        if x: return x
                elif isinstance(o, list):
                    for v in o:
                        x = walk(v)
                        if x: return x
            for it in walk(j) or []:
                oid = str(it.get("id") or ""); mid = str(it.get("memberId") or "")
                if not oid.isdigit(): continue
                member[0] = member[0] or mid
                if mid and member[0] and mid != member[0]: continue
                if oid not in found: ims = it.get("offerImages") or []; im0 = ims[0] if ims else ""; im0 = im0 if isinstance(im0, str) else (im0.get("imageURI") or im0.get("imageUrl") or "") if isinstance(im0, dict) else ""; im0 = ("https://cbu01.alicdn.com/" + im0) if im0 and not im0.startswith("http") else im0; found[oid] = (it.get("subject") or "", im0, str(it.get("offerPrice") or ""), str(it.get("vagueSaleQuantity") or it.get("saleQuantity") or ""), mid); order.append(oid)
        except Exception: pass
    page.on("response", on_resp)
    shop_ids.stats = {}
    page.goto(url.rstrip("/") + "/page/offerlist.htm", wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(random.randint(8000, 11000))
    if blocked(page) or "_____tmd_____" in page.content():
        log("店铺页被反爬拦住,退避 20 分钟再试一次", url); page.wait_for_timeout(20 * 60 * 1000)
        page.goto(url.rstrip("/") + "/page/offerlist.htm", wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(random.randint(8000, 11000))
        if blocked(page) or "_____tmd_____" in page.content(): log("还是被拦,本轮到此为止"); page.remove_listener("response", on_resp); shop_ids.halt = True; return []
    try:
        head = page.evaluate("() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)")
        shop_ids.stats = {"name": (re.search(r"([一-龥A-Za-z()（）·]{4,40}(?:有限公司|厂|商行|销售部|经营部|工作室|制品))", head) or [None, ""])[1],
                          "years": int((re.search(r"入驻\s*(\d+)\s*年", head) or [None, 0])[1] or 0), "repeat": float((re.search(r"回头率\s*([\d.]+)\s*%", head) or [None, 0])[1] or 0),
                          "score": float((re.search(r"服务分\s*([\d.]+)", head) or [None, 0])[1] or 0), "main": (re.search(r"主营类目[:：]\s*([^\s]{1,12})", head) or [None, ""])[1],
                          "loc": (re.search(r"(广东|浙江|江苏|上海|福建|山东|河北|湖北|四川|河南|安徽|江西|湖南|北京|天津|广西|云南|重庆)\s*([一-龥]{1,6})", head) or [None, "", ""])[0] or ""}
    except Exception: pass
    def wait_grow(before, base, cap=14000):
        """点完先按节奏等一会儿,再轮询到 cap。旧代码固定等 3.5–5.5 秒就判「翻不动」,
           而接口慢一点回来就被当成末页 —— 这是 14 家店只收到首屏 30 条的原因之一。"""
        page.wait_for_timeout(base + random.randint(0, 1200))
        t0 = time.time()
        while len(order) == before and (time.time() - t0) * 1000 < cap: page.wait_for_timeout(400)
        return len(order) > before

    limit = A.pages if A.list_only else 6
    if A.list_only and A.pages == 0: limit = min(200, -(-(shop_ids.total or 1200) // 30))   # 0 = 按在售总数自动,200 页硬顶
    shop_ids.stop = f"到 --pages 上限 {limit}"
    for _pg in range(limit):
        if not A.list_only and len([i for i in order if i not in seen]) >= want: shop_ids.stop = "已收够"; break
        if A.list_only and shop_ids.total and len(order) >= shop_ids.total: shop_ids.stop = f"收满在售 {shop_ids.total}"; break
        for _ in range(3): page.mouse.wheel(0, 6000); page.wait_for_timeout(600)   # 分页条在商品列表下方,不滚到底它不渲染
        before = len(order)
        nxt = page.evaluate_handle(NEXT_JS).as_element()   # 选「下一页」的逻辑在 tools/ali1688-next.js,单独可测
        if not nxt:
            shop_ids.stop = "没有下一页"
            try: log("   翻页诊断:", page.evaluate("() => [...document.querySelectorAll('[class*=next],[class*=page],[class*=Pag]')].slice(0, 6).map(e => (e.getAttribute('class') || '').slice(0, 26) + '|' + (e.textContent || '').replace(/\\s+/g, '').slice(0, 8)).join(' ; ')"))
            except Exception: pass
            break
        try:
            nxt.scroll_into_view_if_needed(timeout=3000); nxt.click(timeout=5000)
        except Exception:
            try: nxt.evaluate("el => el.click()")   # 真实事件点不动(被浮层盖住等)就退一步用 JS click
            except Exception: shop_ids.stop = "点不动"; break
        if not wait_grow(before, 3500 if A.list_only else 6000):
            shop_ids.stop = "点了没有新货(多半是末页)"; break
    page.remove_listener("response", on_resp)
    if isinstance(getattr(shop_ids, "stats", None), dict): shop_ids.stats.update({"total": shop_ids.total, "stop": shop_ids.stop, "got": len(order)})
    log(f"   翻页结束:收到 {len(order)} 条 · 店铺自报在售 {shop_ids.total or '?'} 条 · 停因「{shop_ids.stop}」")
    return [(i, *found[i][:2]) for i in order] if not A.list_only else [(i, *found[i]) for i in order]

offers, n_pages, n_img = [], 0, 0
with sync_playwright() as p:
    try: b = p.chromium.connect_over_cdp("http://127.0.0.1:9222", timeout=8000)
    except Exception as e: log("连不上 360(要用 1688采集-开360.bat 启动,端口 9222):", str(e)[:100]); sys.exit(2)
    ctx = b.contexts[0] if b.contexts else b.new_context(); page = ctx.new_page()
    try:
        fac = os.path.join(OUT, "factories.csv"); cand = os.path.join(OUT, "candidates.csv")
        if A.discover:
            hosts = {}
            for cat in [c for c in A.cats.split(",") if c in CATS]:
                if n_pages >= A.cap: break
                for pg in (1, 2):
                    page.goto("https://s.1688.com/selloffer/offer_search.htm?keywords=" + urllib.parse.quote(CATS[cat].encode("gbk")) + "&n=y" + (f"&beginPage={pg}" if pg > 1 else ""), wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(random.randint(6000, 9000)); page.mouse.wheel(0, 4000); page.wait_for_timeout(2000); n_pages += 1
                    if blocked(page): log(cat, "搜索页被拦,今天到此"); n_pages = A.cap; break
                    for h in page.evaluate("() => [...new Set([...document.querySelectorAll('a[href]')].map(a => { try { return new URL(a.href).host } catch (e) { return '' } }))]"):
                        if h.endswith(".1688.com") and not re.match(r"^(s|detail|detail\.m|air|login|www|fuwu|dj|114|m|work|p4p|market|sale|dianpu|shop\d*|club|info|page|passport|cbu|cbu-jp|h5|h5api|xstore|creditcbu|marketing|paas|mp|ad|open|yiqi|kuaidi|export|cn|ali|cnalichn|ju|jump|piao|show|trade|tao|survey|rate|buyer|pay|nvyou|trace|wangwang|alibaba)\.", h) and h.count(".") == 2:
                            hosts.setdefault(h, set()).add(cat)
                    if n_pages >= A.cap: break
            known = set(); 
            for f in (fac, cand):
                if os.path.exists(f): known |= {re.sub(r"^https?://|/.*$", "", r.get("店铺链接", "")).lower() for r in csv.DictReader(io.open(f, encoding="utf-8-sig"))}
            new_rows = [{"工厂": "", "店铺链接": f"https://{h}/", "主营": "", "为什么选它": "搜索页挖到 · " + "/".join(sorted(c)), "加入日": today} for h, c in hosts.items() if h.lower() not in known]
            with io.open(cand, "a", encoding="utf-8-sig", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=["工厂", "店铺链接", "主营", "为什么选它", "加入日"]); (os.path.getsize(cand) == 0 or not os.path.exists(cand)) and w.writeheader(); w.writerows(new_rows)
            log(f"挖到店铺 {len(hosts)} 家,新增候选 {len(new_rows)} → candidates.csv")
        rows_src = []
        if A.shops and os.path.exists(fac): rows_src += list(csv.DictReader(io.open(fac, encoding="utf-8-sig")))
        if A.auto and os.path.exists(cand):
            done_shops = {os.path.basename(f)[:-10] for f in glob.glob(os.path.join(OUT, "items", "*.shop.json"))}
            rows_src += [r for r in csv.DictReader(io.open(cand, encoding="utf-8-sig")) if re.sub(r"^https?://|\.1688\.com/?$", "", r["店铺链接"].strip().rstrip("/")) not in done_shops]
        if A.only:
            _k = lambda u: re.sub(r"^https?://|\.1688\.com/?$", "", (u or "").strip().rstrip("/"))
            want_keys = {_k(x) for x in A.only.split(",") if x.strip()}
            rows_src = [r for r in rows_src if _k(r["店铺链接"]) in want_keys]
            log("定点复收", len(rows_src), "家:", ", ".join(_k(r["店铺链接"]) for r in rows_src))
        if A.shops or A.auto:
            for row in rows_src:
                if n_pages >= A.cap: break
                if A.list_only:
                    if getattr(shop_ids, "halt", False): break
                    got = shop_ids(page, row["店铺链接"], 10**6)
                    if not got: log("  0 款,不写文件", row["店铺链接"]); n_pages += 1; continue
                    shop_key = re.sub(r"^https?://|\.1688\.com/?$", "", row["店铺链接"].strip().rstrip("/"))
                    idir = os.path.join(OUT, "items"); os.makedirs(idir, exist_ok=True); ifile = os.path.join(idir, f"{shop_key}.json")
                    old_items = {x["offerId"]: x for x in json.load(io.open(ifile, encoding="utf-8"))} if os.path.exists(ifile) else {}
                    for oid, title, img, price, sold, mid in got:
                        old_items.setdefault(oid, {"offerId": oid, "url": f"https://detail.1688.com/offer/{oid}.html", "title": title, "img": NORM(img) if img else "", "price": price, "sold": sold, "memberId": mid, "supplier": row["工厂"], "shop": row["店铺链接"], "first_seen": today})
                    io.open(ifile, "w", encoding="utf-8").write(json.dumps(list(old_items.values()), ensure_ascii=False, indent=0))
                    st = getattr(shop_ids, "stats", {}) or {}
                    if A.auto and st and not row.get("工厂"):   # 候选店:入驻≥5 年且回头率≥30% 才升级进 factories.csv(创始人的选厂硬标准前两条;图与专精由人看)
                        y, rp, mc = st.get("years", 0), st.get("repeat", 0), st.get("main", "")
                        ok = y >= 5 and rp >= 30
                        if not ok and mc and mc not in JUNK_MAIN and rp >= 30:
                            # 主营对口、回头率也够,只差入驻年限 —— 不判死,单独落名单等创始人一次性过(门槛不放宽)
                            dst = os.path.join(OUT, "pending-review.csv"); new_file = not os.path.exists(dst) or os.path.getsize(dst) == 0
                            with io.open(dst, "a", encoding="utf-8-sig", newline="") as fh:
                                w = csv.DictWriter(fh, fieldnames=["工厂", "店铺链接", "主营", "条数", "入驻年限", "回头率", "服务分", "差在哪", "加入日"]); new_file and w.writeheader()
                                w.writerow({"工厂": st.get("name") or shop_key, "店铺链接": row["店铺链接"], "主营": mc, "条数": len(old_items), "入驻年限": y,
                                            "回头率": rp, "服务分": st.get("score", ""), "差在哪": f"入驻 {y} 年,差 {5 - y} 年到门槛(回头率与主营都达标)", "加入日": today})
                            log("  → 待过审进 pending-review.csv"); io.open(os.path.join(idir, f"{shop_key}.shop.json"), "w", encoding="utf-8").write(json.dumps({**st, "shop": row["店铺链接"], "items": len(old_items), "seen": today}, ensure_ascii=False)); n_pages += 1; page.wait_for_timeout(A.gap * 1000 + random.randint(0, 20000)); continue
                        dst = fac if ok else os.path.join(OUT, "rejected.csv"); new_file = not os.path.exists(dst) or os.path.getsize(dst) == 0
                        with io.open(dst, "a", encoding="utf-8-sig", newline="") as fh:
                            w = csv.DictWriter(fh, fieldnames=["工厂", "店铺链接", "主营", "为什么选它", "加入日"]); new_file and w.writeheader()
                            w.writerow({"工厂": st.get("name") or shop_key, "店铺链接": row["店铺链接"], "主营": st.get("main", ""), "为什么选它": f"自动:入驻 {st.get('years')} 年 · 回头率 {st.get('repeat')}% · 服务分 {st.get('score')} · {st.get('loc', '')} · {len(old_items)} 款" + ("" if ok else " · 不达标"), "加入日": today})
                        log("  →", "达标进 factories.csv" if ok else "不达标进 rejected.csv")
                    if st: io.open(os.path.join(idir, f"{shop_key}.shop.json"), "w", encoding="utf-8").write(json.dumps({**st, "shop": row["店铺链接"], "items": len(old_items), "seen": today}, ensure_ascii=False))
                    log("清单", row["工厂"] or st.get("name", ""), f"本次 {len(got)} 款 · 累计 {len(old_items)} 款 · 入驻 {st.get('years', '?')} 年 · 回头率 {st.get('repeat', '?')}% → {os.path.basename(ifile)}"); n_pages += 1; page.wait_for_timeout(A.gap * 1000 + random.randint(0, 20000)); continue
                items = [(i, t, im) for i, t, im in shop_ids(page, row["店铺链接"], A.per) if i not in seen]; log("店铺", row["工厂"], "新商品", len(items))
                for oid, _t, _im in items[:A.per]:
                    if n_pages >= A.cap: break
                    page.goto(f"https://detail.1688.com/offer/{oid}.html", wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(random.randint(6000, 10000)); n_pages += 1
                    if blocked(page): log(oid, "商品页遇到验证 / 登录墙,今天到此"); n_pages = A.cap; break
                    try: d = json.loads(page.evaluate(EXTRACT)); d["images"] = list(dict.fromkeys(NORM(u) for u in (d.get("images") or [])))
                    except Exception as e: log(oid, "提取失败", str(e)[:80]); continue
                    d.update({"cat": "shop", "supplier": row["工厂"], "date": today, "shop": row["店铺链接"]}); seen.add(oid); offers.append(d)
                    folder = os.path.join(LIB, "1688-" + clean_name(row["工厂"])); os.makedirs(folder, exist_ok=True); rows = []
                    for i, u in enumerate((d.get("images") or [])[:3], 1):
                        fn = f"{oid}-{i}.jpg"
                        try: save_img(u, os.path.join(folder, fn)); n_img += 1; rows.append([fn, "1688", row["工厂"], d.get("title", "")[:60], d["url"], u, "shop", today])
                        except Exception as e: log("  图下载失败", u[:60], str(e)[:60])
                    if rows:
                        mf = os.path.join(folder, "manifest.csv"); new = not os.path.exists(mf)
                        with io.open(mf, "a", encoding="utf-8-sig", newline="") as f:
                            w = csv.writer(f); new and w.writerow(["文件名", "平台", "工厂", "标题", "商品链接", "图片链接", "类目", "抓取日"]); w.writerows(rows)
                    log(f"  {oid} {d.get('material') or '?'} · SKU {d.get('skuCount')} · 尺寸 {d.get('dimsFromSku') or d.get('dims') or '-'} · 图 {len(rows)} · {d.get('title', '')[:36]}")
        if A.specs:
            pool = []
            for f in glob.glob(os.path.join(OUT, "items", "*.json")):
                if f.endswith(".shop.json"): continue
                pool += [x for x in json.load(io.open(f, encoding="utf-8")) if x["offerId"] not in seen]
            def sold_n(v):
                v = str(v or "0").replace("+", ""); m = re.match(r"([\d.]+)(万?)", v); return (float(m.group(1)) * (10000 if m.group(2) else 1)) if m else 0
            pool.sort(key=lambda x: -sold_n(x.get("sold"))); log("规格补采:候选", len(pool), "款,本轮", A.specs)
            for it in pool[:A.specs]:
                oid = it["offerId"]; page.goto(it["url"], wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(random.randint(6000, 10000)); n_pages += 1
                if blocked(page): log(oid, "商品页被拦,规格补采到此"); break
                try: d = json.loads(page.evaluate(EXTRACT)); d["images"] = list(dict.fromkeys(NORM(u) for u in (d.get("images") or [])))
                except Exception as e: log(oid, "提取失败", str(e)[:80]); continue
                d.update({"cat": "specs", "supplier": it.get("supplier") or "", "date": today, "shop": it.get("shop") or ""}); seen.add(oid); offers.append(d)
                log(f"  {oid} {d.get('material') or '?'} · SKU {d.get('skuCount')} · 尺寸 {d.get('dimsFromSku') or d.get('dims') or '-'} · 销量 {it.get('sold')} · {d.get('title', '')[:30]}")
        for cat in ([] if (A.list_only or A.specs) else [c for c in A.cats.split(",") if c in CATS]):
            if n_pages >= A.cap: break
            kw = CATS[cat]
            page.goto("https://s.1688.com/selloffer/offer_search.htm?keywords=" + urllib.parse.quote(kw.encode("gbk")) + "&n=y", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(random.randint(3500, 6000)); page.mouse.wheel(0, 1800); page.wait_for_timeout(1500)
            if blocked(page): log(cat, "搜索页遇到验证 / 登录墙,今天到此", page.url[:80]); break
            cards = [c for c in page.evaluate(SEARCH_JS) if c["offerId"] not in seen][:A.per]
            log(cat, "搜索页新商品", len(cards))
            for c in cards:
                if n_pages >= A.cap: break
                page.goto(c["url"], wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(random.randint(4000, 8000)); n_pages += 1
                if blocked(page): log(c["offerId"], "商品页遇到验证 / 登录墙,今天到此", page.url[:80]); n_pages = A.cap; break
                try: d = json.loads(page.evaluate(EXTRACT)); d["images"] = list(dict.fromkeys(NORM(u) for u in (d.get("images") or [])))
                except Exception as e: log(c["offerId"], "提取失败", str(e)[:80]); continue
                d.update({"cat": cat, "supplier": c.get("supplier") or d.get("brand") or "", "date": today, "searchTitle": c["title"]}); seen.add(c["offerId"]); offers.append(d)
                sup = clean_name(d["supplier"] or "unknown"); folder = os.path.join(LIB, "1688-" + sup); os.makedirs(folder, exist_ok=True)
                rows = []
                for i, u in enumerate((d.get("images") or [])[:3], 1):
                    fn = f"{cat}-{c['offerId']}-{i}.jpg"; path = os.path.join(folder, fn)
                    try: sz = save_img(u, path); n_img += 1; rows.append([fn, "1688", sup, d.get("title", "")[:60], d["url"], u, cat, today])
                    except Exception as e: log("  图下载失败", u[:60], str(e)[:60])
                if rows:
                    mf = os.path.join(folder, "manifest.csv"); new = not os.path.exists(mf)
                    with io.open(mf, "a", encoding="utf-8-sig", newline="") as f:
                        w = csv.writer(f); new and w.writerow(["文件名", "平台", "工厂", "标题", "商品链接", "图片链接", "类目", "抓取日"]); w.writerows(rows)
                log(f"  {c['offerId']} {d.get('material') or '?'} · SKU {d.get('skuCount')} · 图 {len(rows)} · {d.get('title', '')[:40]}")
    finally:
        page.close()   # 只关自己开的标签页,360 继续开着
if offers:
    f = os.path.join(OUT, f"offers-{today}.json"); old = json.load(io.open(f, encoding="utf-8")) if os.path.exists(f) else []
    io.open(f, "w", encoding="utf-8").write(json.dumps(old + offers, ensure_ascii=False, indent=0))
    io.open(seen_f, "w", encoding="utf-8").write(json.dumps(sorted(seen)))
    log(f"本轮 {len(offers)} 个商品 · {n_img} 张主图 → {f};下一步 python tools/ali1688-ingest.py {f} --probe")
else: log("本轮没有新商品")
