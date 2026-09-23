"""把创始人的今日头条收藏拉回本地知识库(创始人 2026-09-18 13:4x:「用个脚本把这些拉回到本地知识库!」)。
走本机便携 Chrome 的调试口(F:/0cosmetic/助手用-开本地Chrome.bat 启动,CDP 9333,须在该 Chrome 里登录过头条):
裸 CDP 开一个页签 → 收藏页 → 用 Input.dispatchMouseEvent 发真实滚轮(JS scrollTo 不触发懒加载,只有真滚轮行)→ 抽全部条目
→ 逐篇抓正文(境内直连)→ 存 F:/0cosmetic/知识库/头条收藏/<id>-<标题>.md(元数据 + 正文 + GitHub 仓库)+ _index.md
→ 调 favs-digest.py 研判新条目进台账。幂等:已存在的 id 跳过正文抓取。用法:python tools/assistants/toutiao-favs.py [--max-scroll 80] [--no-digest]"""
import io, os, re, sys, json, time, html, subprocess, urllib.request, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KB = "F:/0cosmetic/知识库/头条收藏"; os.makedirs(KB, exist_ok=True)
FAV = "https://www.toutiao.com/c/user/token/Civ_OPUOGxwKRlKSSNxoGZhhOl96H76yaVy1Rnr5tM7T9zseOyWwaWVU9EzsGkkKPAAAAAAAAAAAAABQ6mTE35foUZWsIFo2yAVY94W11Oqug8aDRkUPRw1e8-dET1eGfrBXiwcZmDjxZDM-KRD_yZwOGMPFg-oEIgEDNqrpqA==/?source=list&tab=fav"
MAX_SCROLL = int(sys.argv[sys.argv.index("--max-scroll") + 1]) if "--max-scroll" in sys.argv else 80
CDP = "http://127.0.0.1:9333"
def cdp_alive():
    try: urllib.request.urlopen(CDP + "/json/version", timeout=3); return True
    except Exception: return False
if not cdp_alive():
    # 创始人 09-18 13:5x:「不要开启无痕模式!直接连 Chrome 常规的启动,我有安装 claude 插件」→ 常规 Chrome(D:/ie/Chrome,profile Data)
    # 的 chrome++.ini command_line 已加 --remote-debugging-port=9333,只要它开着调试口就在;没开就拉起常规 Chrome(同一 profile)
    subprocess.Popen(["D:/ie/Chrome/App/chrome.exe", FAV])
    for _ in range(40):
        time.sleep(1)
        if cdp_alive(): break
    else: print("常规 Chrome 的调试口 9333 没起来:请把 Chrome 全部关掉再打开一次(chrome++.ini 已带 --remote-debugging-port=9333)"); sys.exit(2)
import websocket
t = json.load(urllib.request.urlopen(urllib.request.Request(CDP + "/json/new?about:blank", method="PUT"), timeout=10))
ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=90, suppress_origin=True); mid = [0]
def call(method, **params):
    mid[0] += 1; ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid[0]: return m.get("result") or {}
def ev(expr):
    r = call("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True); return (r.get("result") or {}).get("value")
call("Page.enable"); call("Page.navigate", url=FAV); time.sleep(6)
if not ev("!!document.querySelector('[class*=\"avatar\"],[class*=\"user-info\"],[class*=\"login-out\"]') && !/登录/.test(document.querySelector('header,.header,[class*=\"nav\"]')?.innerText||'')"):
    print("这个 Chrome 里头条没登录:请在弹出的 Chrome 窗口登录今日头条一次(扫码),再重跑本脚本"); call("Page.navigate", url=FAV); sys.exit(3)
COUNT = "document.querySelectorAll('a[href*=\"/article/\"],a[href*=\"/video/\"],a[href*=\"/w/\"]').length"
prev, stall = 0, 0
for i in range(MAX_SCROLL):
    for _ in range(6): call("Input.dispatchMouseEvent", type="mouseWheel", x=640, y=500, deltaX=0, deltaY=800)
    time.sleep(1.4)
    n = ev(COUNT) or 0
    if n == prev:
        stall += 1
        if stall >= 6: break
    else: prev, stall = n, 0
    if i % 10 == 9: print(f"  滚 {i+1} 屏,链接 {n}", flush=True)
rows = ev("""(() => { const seen=new Set(); const rows=[]; document.querySelectorAll('a[href*="/article/"],a[href*="/video/"],a[href*="/w/"]').forEach(a=>{ const h=a.href.split('?')[0]; const tt=(a.innerText||a.title||'').trim().replace(/[ 	
]+/g,' '); if(!seen.has(h)&&tt.length>8){ seen.add(h); rows.push({h,t:tt.slice(0,120)}); } }); return rows; })()""") or []
print(f"收藏条目 {len(rows)}", flush=True)
try: urllib.request.urlopen(urllib.request.Request(f"{CDP}/json/close/{t['id']}", method="PUT"), timeout=10)
except Exception: pass
ws.close()
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"}
def fetch(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: body = r.read().decode("utf-8", "replace")
    except Exception as e: return "", "", []
    tm = re.search(r"<title>(.*?)</title>", body, re.S); title = html.unescape(tm.group(1)).replace(" - 今日头条", "").strip() if tm else ""
    gh = sorted(set(re.findall(r"github\.com/[\w\-]+/[\w\-.]+", body)))
    body2 = re.sub(r"<script.*?</script>|<style.*?</style>", "", body, flags=re.S)
    art = re.search(r"<article[^>]*>(.*?)</article>", body2, re.S)
    txt = html.unescape(re.sub(r"[ \t]+", " ", re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", art.group(1) if art else body2)))
    txt = re.sub(r"<[^>]+>", "", txt); txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
    return title, txt[:20000], gh
safe = lambda s: re.sub(r"[\/:*?\"<>|\s]+", "-", s)[:60].strip("-")
new = 0; index = []
for r in rows:
    m = re.search(r"/(article|video|w)/(\d+)", r["h"]); 
    if not m: continue
    kind, pid = m.group(1), m.group(2)
    existing = [f for f in os.listdir(KB) if f.startswith(pid + "-")]
    if existing: index.append((pid, existing[0], r["t"])); continue
    title, txt, gh = fetch(r["h"]); title = title or r["t"]
    fn = f"{pid}-{safe(title) or kind}.md"
    io.open(os.path.join(KB, fn), "w", encoding="utf-8").write(f"---\nid: {pid}\nkind: {kind}\ntitle: {title}\nurl: {r['h']}\nsaved: {dt.datetime.now():%Y-%m-%d %H:%M}\ngithub: {', '.join(gh) if gh else ''}\n---\n\n# {title}\n\n{txt if txt else '(视频/微头条,无正文;标题:' + r['t'] + ')'}\n")
    index.append((pid, fn, title)); new += 1; time.sleep(0.6)
    if new % 20 == 0: print(f"  存 {new} 篇", flush=True)
with io.open(os.path.join(KB, "_index.md"), "w", encoding="utf-8") as f:
    f.write(f"# 今日头条收藏 · 本地知识库(自动)\n\n更新 {dt.datetime.now():%Y-%m-%d %H:%M} · 共 {len(index)} 篇(本次新增 {new})\n\n")
    for pid, fn, title in index: f.write(f"- [{title[:80]}]({fn})\n")
print(f"知识库 {KB}:共 {len(index)} 篇,新增 {new}", flush=True)
if "--no-digest" not in sys.argv and rows:
    fav_json = os.path.join(os.environ.get("TEMP", "."), "favs-all.json"); io.open(fav_json, "w", encoding="utf-8").write(json.dumps(rows, ensure_ascii=False))
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "assistants", "favs-digest.py"), fav_json, "--limit", "200"], cwd=ROOT)
