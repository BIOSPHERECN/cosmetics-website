#!/usr/bin/env python3
"""爆款成分补全 + 解码(体检模式)。ini_harvest 每天只抓 40 款;本工具对缺成分的款全量走三路:
  源 A · 已有 inci 文本 → 解码归一(拆逗号/去配方号/三语式取首/大小写/去重)
  源 B · Amazon 商品页公开 Ingredients 栏(复用 ini_harvest 已验证的抓取逻辑)
  源 C · INKEEDecoder(原 INCIDecoder)按 品牌+标题 搜索,取匹配度最高的产品页「Ingredients overview」段
  输出:体检报告 md/csv + 回写 SQL 文件;默认不写库,加 --apply 才灌 D1。断点续跑,被拦提前停。
用法:
  python tools/market/ini_decoder.py [--limit N] [--headed] [--apply] [--reset-progress]"""
import argparse, asyncio, datetime as dt, io, json, os, random, re, sys, urllib.parse
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _bohui import d1, d1_exec, proxy_url  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
PROG = os.path.join(ROOT, "data", "market", "ini-decoder-progress.json")
OUT_MD = os.path.join(ROOT, "data", "market", f"ini-decoder-{dt.date.today().isoformat()}.md")
OUT_CSV = os.path.join(ROOT, "data", "market", f"ini-decoder-{dt.date.today().isoformat()}.csv")
OUT_SQL = os.path.join(ROOT, "tools", "_ini-decode.sql")
ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=0)          # 冒烟用:只处理前面 N 款
ap.add_argument("--headed", action="store_true")
ap.add_argument("--apply", action="store_true")          # 加这个才写库
ap.add_argument("--reset-progress", action="store_true") # 重新从头跑
A = ap.parse_args()
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731

# ---------- 解码 ----------
_MULTILANG = re.compile(r"^[A-Z][A-Z &'’-]*\s*/\s*[A-Z][A-Z &'’-]*(\s*/\s*[A-Z][A-Z &'’-]*)*$")
_RECIPE_NO = re.compile(r"^\s*[A-Z0-9]{5,}\s*$")        # 配方号/批号 G684936 之类整段
def decode_inci(raw):
    """原始 INCI 文本 → 干净成分列表(保序去重)。规则宁可保守,不误伤真成分。"""
    if not raw: return []
    s = re.sub(r"\s+", " ", raw)
    s = re.sub(r"^\s*(?:ingredients?|in.?ci|成分)\s*[:;,.\-– ]*", "", s, flags=re.I)  # 去前缀
    parts = [p.strip().rstrip(".,;") for p in s.split(",")]
    out, seen = [], set()
    for p in parts:
        if not p or p in (".", "-", "–"): continue
        if _RECIPE_NO.match(p): continue                          # 丢配方号
        if _MULTILANG.match(p):                                   # L'Oreal 三语式 AQUA / WATER / EAU → 取第一个
            segs = [x.strip() for x in re.split(r"\s*/\s*", p) if x.strip()]
            p = segs[0]
        if len(p) == 1: continue
        key = p.lower()
        if key in seen: continue
        seen.add(key); out.append(p)
    return out

# ---------- Amazon 页面抓取(复用 ini_harvest 的评估逻辑) ----------
AMZN_JS = r"""() => {
  const T = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  if (document.title.match(/Robot Check|captcha/i) || document.querySelector('form[action*="validateCaptcha"]')) return { blocked: true };
  let inci = '';
  for (const h of document.querySelectorAll('#important-information h4, #importantInformation h4, #important-information .a-text-bold')) {
    if (/ingredients/i.test(h.innerText)) { let el = h.nextElementSibling; while (el && !T(el)) el = el.nextElementSibling; inci = T(el); if (inci) break; }
  }
  if (!inci) for (const tr of document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #prodDetails tr')) { if (/^ingredients$/i.test(T(tr.querySelector('th')))) { inci = T(tr.querySelector('td')); break; } }
  if (!inci) for (const el of document.querySelectorAll('[data-a-expander-name*="ngredient"] .a-expander-content, #ingredients-content, [id*="ingredients"] .a-expander-content')) { inci = T(el); if (inci) break; }
  if (!inci) { const m = document.body.innerText.match(/\bIngredients:?\s*\n?\s*([A-Z][^\n]{40,3000})/); if (m) inci = m[1].trim(); }
  return { inci, blocked: false };
}"""

# ---------- INKEEDecoder ----------
def _norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())
def _tok(s):
    return set(re.sub(r"\s+", " ", _norm(s)).strip().split())
def incd_query(brand, title):
    """搜索词:品牌 + 标题前 4 个实质词。"""
    words = re.sub(r"[^a-zA-Z0-9]+", " ", _norm(title)).split()
    stop = {"for", "the", "with", "and", "of", "on", "men", "women", "to", "a", "in", "by"}
    kw = [w for w in words if w and w not in stop][:4]
    return urllib.parse.quote(f"{brand} {' '.join(kw)}".strip())
def incd_pick(brand, title, cands):
    """候选 (txt,url) 列表 → 标题词重叠最高且达到阈值的,否则 None。"""
    tt = _tok(f"{brand} {title}")
    best, bs = None, 0.0
    for txt, url in cands:
        ct = _tok(txt)
        if not ct: continue
        score = len(tt & ct) / max(1, len(ct))     # 以候选侧为准,避免长标题虚高
        if score > bs: bs, best = score, (txt, url)
    return best if best and bs >= 0.45 else None
def incd_ingredients(detail):
    """详情页 innerText → Ingredients overview 段的一整行成分。"""
    m = re.search(r"Ingredients overview\s*\n\s*([^\n]+)", detail or "")
    if not m: return None
    s = m.group(1).strip().rstrip(".")
    return s if len(s) >= 20 else None

# ---------- 主流程 ----------
async def main():
    todo = d1(f"""SELECT p.id, p.pid, p.title, p.brand, p.url, p.inci, MIN(s.rank) rk FROM market_products p
                  JOIN market_snapshots s ON s.pid=p.pid AND s.platform=p.platform
                  WHERE p.platform LIKE 'amazon%' AND (p.inci IS NULL OR p.inci='' OR p.inci='-')
                  AND s.date=(SELECT MAX(date) FROM market_snapshots)
                  GROUP BY p.id ORDER BY rk""")
    if A.limit: todo = todo[:A.limit]
    print("待处理", len(todo))
    prog = {} if A.reset_progress else (json.load(io.open(PROG, encoding="utf-8")) if os.path.exists(PROG) else {})
    rows, stat = [], {}
    def mark(pid, status, n=0, src="", inci=""):
        stat[status] = stat.get(status, 0) + 1
        rows.append({"pid": pid, "status": status, "n": n, "src": src, "inci": inci, "date": dt.date.today().isoformat()})

    async with async_playwright() as p:
        cdp = None
        cdp = None
        for _try in range(3):           # 360 CDP ws 握手偶发超时,重试
            try:
                cdp = await p.chromium.connect_over_cdp("http://127.0.0.1:9222", timeout=15000)
                break
            except Exception:
                await asyncio.sleep(3)
        if cdp:
            ctx = cdp.contexts[0] if cdp.contexts else await cdp.new_context(); page = await ctx.new_page(); print("浏览器:360(CDP)直连")
        else:
            px = proxy_url(); b = await p.chromium.launch(headless=not A.headed, args=["--disable-blink-features=AutomationControlled"], proxy={"server": px} if px else None); print("浏览器:本机 Chromium", px or "直连")
            ctx = await b.new_context(user_agent=UA, locale="en-US", viewport={"width": 1366, "height": 900}, extra_http_headers={"Accept-Language": "en-US,en;q=0.9"})
            page = await ctx.new_page(); await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        await page.goto("https://www.amazon.com/", wait_until="domcontentloaded", timeout=60000); await page.wait_for_timeout(3000)
        for r in todo:
            pid = r["pid"]
            if pid in prog: continue                    # 断点续跑
            status = "err"; n = 0; src = ""; found = ""
            try:
                # 源 A:已有文本(只解码)
                if r["inci"] and r["inci"] != "-":
                    dec = decode_inci(r["inci"])
                    n, src, status, found = len(dec), "decode", "ok-decode", ", ".join(dec) if dec else ""
                # 源 C:INKEEDecoder(快,命中率高——先于 Amazon)
                if not found:
                    try:
                        await page.goto(f"https://incidecoder.com/search?query={incd_query(r['brand'] or '', r['title'] or '')}", wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(1200)
                        cands = await page.evaluate(r"""() => [...document.querySelectorAll('a[href*="/products/"]')].slice(0,12).map(a => [ (a.textContent||'').replace(/\s+/g,' ').trim(), a.getAttribute('href') ])""")
                    except Exception:
                        cands = []
                    pick = incd_pick(r["brand"] or "", r["title"] or "", [c for c in cands if c and c[1]])
                    if pick:
                        try:
                            await page.goto("https://incidecoder.com" + pick[1], wait_until="domcontentloaded", timeout=30000)
                            await page.wait_for_timeout(1000)
                            detail = await page.evaluate("() => document.body.innerText")
                        except Exception:
                            detail = ""
                        ings = incd_ingredients(detail)
                        dec = decode_inci(ings)
                        if len(dec) >= 3:
                            found = ", ".join(dec); n = len(dec); src = "inkedecoder"; status = "ok-incd"
                            print(pid, "→ INKEDECODER:", pick[0][:50])
                        else:
                            found = ""      # 交给 Amazon 兜底
                    else:
                        found = ""
                # 源 B:Amazon 页(慢,兜底)
                if not found:
                    try:
                        await page.goto((r["url"] or f"https://www.amazon.com/dp/{pid}").split("?")[0], wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(1200)
                        got = await page.evaluate(AMZN_JS)
                    except Exception as e:
                        got = {"blocked": False, "inci": ""}
                        status = "err"; found = ""; print(pid, "AMZNERR", str(e)[:60])
                    if got.get("blocked"):
                        mark(pid, "blocked", 0, "amazon", "")
                        print(pid, "BLOCKED(验证码)—今天到此"); break
                    dec = decode_inci(got.get("inci") or "")
                    # 可信度防线:真成分表至少 3 项,项数太少多半是抓到营销话术/占位文本
                    if len(dec) >= 3:
                        found = ", ".join(dec); n = len(dec); src = "amazon"; status = "ok-amazon"
                    else:
                        status = "none"     # 两边都没有成分表
            except Exception as e:
                status = "err"; print(pid, "ERR", str(e)[:80])
            mark(pid, status, n, src, found[:3000])
            if found:
                print(f"#{r['rk']:>3} {pid} [{status}] {n}项 · {(r['title'] or '')[:46]}")
            else:
                print(f"#{r['rk']:>3} {pid} [{status}] · {(r['title'] or '')[:46]}")
            prog[pid] = {"status": status, "n": n, "src": src, "date": dt.date.today().isoformat()}
            io.open(PROG, "w", encoding="utf-8").write(json.dumps(prog, ensure_ascii=False))
            if not A.limit and status in ("ok-amazon",) : await page.wait_for_timeout(random.randint(4500, 8000))
            elif not A.limit: await page.wait_for_timeout(random.randint(1200, 2500))
        await page.close()
        if not cdp: await b.close()

    # ---------- 报告 + SQL(默认不写库) ----------
    total = len(rows)
    got = [r for r in rows if r["status"] in ("ok-decode", "ok-amazon", "ok-incd")]
    none = [r for r in rows if r["status"] == "none"]
    md = [
        f"# 亚马逊爆款成分「解码器」体检 · {dt.date.today().isoformat()}",
        "",
        f"- 处理 **{total}** 款 · 补全 **{len(got)}** 款({len([r for r in got if r['src']=='amazon'])} Amazon 页 / "
        f"{len([r for r in got if r['src']=='inkedecoder'])} INKEEDecoder / {len([r for r in got if r['src']=='decode'])} 已有解码) · "
        f"页面没有 {len(none)} · 失败 {stat.get('err',0)} · 被拦提前停 {stat.get('blocked',0)}",
        "", "## 分状态", "",
    ]
    for k, v in sorted(stat.items()): md.append(f"- {k}: {v}")
    md += ["", "## 补全明细(前 200)", "", "| 状态 | 来源 | 项数 | pid | 成分 |", "|---|---|---|---|---|"]
    for r in got[:200]:
        md.append(f"| {r['status']} | {r['src']} | {r['n']} | {r['pid']} | {r['inci'][:150]} |")
    io.open(OUT_MD, "w", encoding="utf-8", newline="\n").write("\n".join(md) + "\n")
    with io.open(OUT_CSV, "w", encoding="utf-8", newline="", errors="replace") as f:
        f.write("pid,status,src,n,inci\n")
        for r in rows: f.write(f"{r['pid']},{r['status']},{r['src']},{r['n']},\"{r['inci'].replace(chr(34),chr(34)+chr(34)) if r['inci'] else ''}\"\n")
    # SQL:只收集真补全的款
    by_id = {r["pid"]: r for r in d1(f"SELECT pid, id FROM market_products WHERE platform LIKE 'amazon%'")}
    sql_lines = []
    for r in got:
        rid = by_id.get(r["pid"], {}).get("id")
        if rid: sql_lines.append(f"UPDATE market_products SET inci={q(r['inci'])}, brand=COALESCE(NULLIF(brand,''),{q(r.get('pid'))}) WHERE id={rid};")
    io.open(OUT_SQL, "w", encoding="utf-8", newline="\n").write("\n".join(sql_lines) + "\n")
    print(f"\n体检: 处理 {total} · 补全 {len(got)} · 页面没有 {len(none)} · 失败 {stat.get('err',0)}")
    print("报告:", OUT_MD, "·", OUT_CSV)
    print("SQL(未执行):", OUT_SQL, f"· {len(sql_lines)} 行;加 --apply 才灌库")
    if A.apply and sql_lines:
        print("写入 D1:", d1_exec(OUT_SQL))
asyncio.run(main())