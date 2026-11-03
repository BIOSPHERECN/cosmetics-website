"""把助手交付的「爆款配方」CSV 导入 market_products(只进后台,前台永不读 —— 创始人 2026-09-17 铁律)。
用法:python tools/market/import_hot.py [--apply]
读 F:/0cosmetic/助手交付/5-爆款配方/*.csv(表头固定 16 列,见任务 H),按 (platform, pid) 去重 UPSERT。
platform = 平台名小写去空格 + '-' + 市场码;pid = 产品链接(没有就 品牌+品名 的哈希);cat = 类目;inci = 全成分原文;
claims = 宣称功效;size = 规格;country = 市场码;url = 产品链接;img 留空。默认体检只打印,--apply 才灌库。"""
import csv, glob, hashlib, io, os, re, sys, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1_exec
SRC = r"F:\0cosmetic\助手交付\5-爆款配方"
APPLY = "--apply" in sys.argv
q = lambda s: "'" + str(s if s is not None else "").replace("'", "''") + "'"
rows, seen = [], set()
for f in sorted(glob.glob(os.path.join(SRC, "*.csv"))):
    who = re.sub(r"\.csv$", "", os.path.basename(f)).split("-")[-1]
    for r in csv.DictReader(io.open(f, encoding="utf-8-sig")):
        g = lambda k: (r.get(k) or "").strip()
        inci = g("全成分INCI(原文顺序)")
        if len(inci) < 30: continue                       # 没成分的一条不算(任务 H 规矩)
        mk = g("市场").lower() or "xx"; plat = re.sub(r"[^a-z0-9]+", "", g("平台").lower()) or "unknown"
        platform = f"{plat}-{mk}"
        url = g("产品链接"); pid = url if url.startswith("http") else hashlib.md5((g("品牌") + g("产品名")).encode()).hexdigest()[:16]
        key = (platform, pid)
        if key in seen: continue
        seen.add(key)
        title = (g("品牌") + " " + g("产品名")).strip()
        claims = g("宣称功效"); src = g("成分来源链接"); rank = g("排名"); board = g("榜单名"); price = g("售价(当地币)")
        # 来源链接、榜单、排名、价格、评论数、评分、抓取人放进 claims 字段尾部的一段结构化注记,不另加列(表结构不动)
        note = f" ‖ 榜单:{board} 排名:{rank} 价格:{price} 评论:{g('评论数')} 评分:{g('评分')} 成分来源:{src} 采集:{who}"
        rows.append((platform, pid, title, g("品牌"), g("类目") or "其他", url, inci, (claims + note).strip(" ‖"), g("规格"), mk, g("抓取日期") or dt.date.today().isoformat()))
print(f"文件 {len(glob.glob(os.path.join(SRC, '*.csv')))} 个 · 有成分且不重复 {len(rows)} 条")
by = {}
for r in rows: by[r[0]] = by.get(r[0], 0) + 1
for k, v in sorted(by.items()): print(f"  {k}: {v}")
for r in rows[:3]: print("  例:", r[0], r[3], "|", r[2][:40], "|", r[6][:50])
if not APPLY: print("体检完成(未写库)。--apply 写库"); sys.exit(0)
sql = os.path.join(ROOT, "tools", "_import_hot.sql")
with io.open(sql, "w", encoding="utf-8") as w:
    for r in rows:
        platform, pid, title, brand, cat, url, inci, claims, size, country, seen_at = r
        w.write(f"INSERT INTO market_products (platform,pid,title,brand,cat,url,img,inci,claims,size,country,first_seen,last_seen) VALUES ({q(platform)},{q(pid)},{q(title)},{q(brand)},{q(cat)},{q(url)},'',{q(inci)},{q(claims)},{q(size)},{q(country)},{q(seen_at)},{q(seen_at)}) ON CONFLICT(platform,pid) DO UPDATE SET title=excluded.title, brand=excluded.brand, cat=excluded.cat, url=excluded.url, inci=excluded.inci, claims=excluded.claims, size=excluded.size, last_seen=excluded.last_seen;\n")
# 09-24 D2:CSV 没变时每 30 分钟把同样 2,752 条再 UPSERT 一遍(每轮写 13,760 行、读也跟着涨)。内容与上次写成功的一致就跳过
import hashlib as _h
sig, stamp = _h.sha1(io.open(sql, "rb").read()).hexdigest(), sql + ".sha1"
try: same = io.open(stamp, encoding="utf-8").read().strip() == sig
except OSError: same = False
if same and "--force" not in sys.argv: print("写库: 跳过(CSV 与上次一致)"); sys.exit(0)
n = d1_exec(sql); print("写库:", n)
if n: io.open(stamp, "w", encoding="utf-8").write(sig)
