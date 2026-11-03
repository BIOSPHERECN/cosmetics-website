"""中文产品标题 → 英文标题(平台 D1 market_products.title_en)。创始人 2026-09-21 11:5x:「页面一定要随着语言切换翻译」。
只翻标题这一个短字段(大块译文必失败的教训),一次 40 条,Agnes 优先(免费)。写创始人 D1(平台),不动公司库。
用法:python tools/platform/title-en.py [--limit N](默认全部,约 11,056 条;计划任务每 2 小时跟解读批次一起跑)"""
import io, json, os, re, sys, subprocess, datetime as dt
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env
sys.path.insert(0, os.path.join("F:/0cosmetic/cosmetic-sites", "tools")); from _bohui import chat, fleet, order_by_health, d1_exec as company_exec   # 09-21 19:3x:title_en 同步双写公司库(帛卉站解读页也按语言显示)
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10 ** 6
web = os.path.join(ROOT, "apps", "web")
def cwd():   # 每次调用时再取最新 dist(deploy.sh 会清 1 小时前的旧目录,长任务里提前取会 WinError 267)
    return os.path.join(web, sorted(x for x in os.listdir(web) if x.startswith("dist_"))[-1], "server")
def d1(sql, file=False):
    args = ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "-c", "wrangler.copy.json", "--yes", "--json"]
    if file:
        p = os.path.join(ROOT, "tools", "platform", "_title_en.sql"); io.open(p, "w", encoding="utf-8", newline="\n").write(sql); args += ["--file", p]
    else: args += ["--command", sql]
    for attempt in range(3):   # wrangler 在 Windows 偶发 libuv 断言崩溃(Assertion failed: UV_HANDLE_CLOSING),重试两次
        r = subprocess.run(args, cwd=cwd(), env=cf_env(), shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        out = r.stdout[r.stdout.find("["):]
        try: return json.loads(out)[0]["results"]
        except Exception: print("D1 错(第 %d 次)" % (attempt + 1), " ".join((r.stdout + r.stderr)[-200:].split()), flush=True)
    return []
allp = fleet()
# 12:2x A/B(同 10 条):商汤 glm-5.2 / deepseek-v4-flash 与 Agnes 质量相当,品牌音译更稳;标题是短字段、总量 <100 万 token,不伤商汤日额度;Agnes 午间 180s 超时 → 商汤优先,Agnes 兜底
PROVS = [p for p in allp if p["id"] == "sensenova"] + [p for p in allp if p["id"].startswith("sensenova")] + [p for p in allp if p["id"].startswith("agnes-30flash")] + [p for p in allp if p["id"].startswith("agnes") and not p["id"].startswith("agnes-30flash")]
PROVS = list({p["id"]: p for p in PROVS}.values())
PROVS = order_by_health(PROVS)
SYS = """你是美妆电商标题翻译。把每条中文产品标题翻成自然的英文商品名:保留品牌名原样(不翻)、保留容量/规格/数字,去掉促销词(正品/包邮/旗舰店/官方/新品/爆款 等)与平台噪声,不超过 90 个字符,首字母大写的商品名写法。
输入 JSON 数组 [{"id":1,"t":"..."}],输出同长度 JSON 数组 [{"id":1,"en":"..."}],只输出 JSON。"""
CJK = "title GLOB ('*[' || char(19968) || '-' || char(40869) || ']*')"
rows = []
for off in range(0, 10 ** 6, 400):
    page = d1(f"SELECT id, brand, title FROM market_products WHERE inci IS NOT NULL AND length(inci)>30 AND {CJK} AND (title_en IS NULL OR title_en='') ORDER BY (img<>'') DESC, id LIMIT 400 OFFSET {off}")
    if not page: break
    rows += page
    if len(rows) >= LIMIT: break
rows = rows[:LIMIT]; print(f"待翻 {len(rows)} 条", flush=True)
q = lambda s: "'" + str(s or "").replace("'", "''") + "'"
done = fail = 0; buf = []
def flush():
    global buf
    if buf:
        d1("".join(buf), file=True)
        try:
            cp = os.path.join(ROOT, "tools", "platform", "_title_en_company.sql"); io.open(cp, "w", encoding="utf-8", newline=chr(10)).write("".join(buf)); company_exec(cp)
        except Exception as e: print("  公司库双写失败", str(e)[:80], flush=True)
        buf = []
for i in range(0, len(rows), 40):
    batch = rows[i:i + 40]
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": json.dumps([{"id": r["id"], "t": r["title"][:120]} for r in batch], ensure_ascii=False)}]
    got = {}
    for _ in range(2):
        out, who, err = chat(PROVS, msgs, max_tokens=4000, temperature=0.2, want_json=True)
        if isinstance(out, dict): out = next((v for v in out.values() if isinstance(v, list)), None)
        if isinstance(out, list):
            got = {int(o["id"]): str(o.get("en", "")).strip() for o in out if isinstance(o, dict) and str(o.get("id", "")).isdigit()}
            if len(got) >= len(batch) // 2: break
        print(f"  模型失败:{err or '形状不对'},重试", flush=True)
    for r in batch:
        en = got.get(r["id"], "")
        if len(en) < 3 or re.search(r"[\u4e00-\u9fff]", en): fail += 1; continue
        buf.append(f"UPDATE market_products SET title_en={q(en[:160])} WHERE id={r['id']};\n"); done += 1
    if len(buf) >= 200: flush()
    if (i // 40) % 5 == 0: print(f"  {min(i + 40, len(rows))}/{len(rows)} 翻好 {done} 失败 {fail} 供应商 {who}", flush=True)
flush(); print(f"完成:翻好 {done},失败 {fail}")
