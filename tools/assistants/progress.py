#!/usr/bin/env python3
r"""助手进度盯梢(创始人 2026-09-16 11:0x:「记住盯住他们的进度」)。每 2 小时跑一次(计划任务 BohuiAssistantWatch):
① 先跑 ingest_inbox 把交付合并进系统;② 数一遍各处交付物;③ 把一行摘要追加到 F:\0cosmetic\助手交付\_进度.md,并和上一次比,没变化就标「无进展」。
看的东西:助手交付\1-名单|2-官网正文|3-榜单链接|4-客户数据、data/prospect/<助手>/、data/kb/inbox、data/pack1688/factories.csv|offers-*.json、D1 prospect_contacts、_交付说明 里的认领行。
用法:python tools/assistants/progress.py [--no-ingest]"""
import datetime as dt, glob, io, json, os, re, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1  # noqa: E402
DROP = r"F:\0cosmetic\助手交付"; PD = os.path.join(ROOT, "data", "prospect"); LOG = os.path.join(DROP, "_进度.md")
if "--no-ingest" not in sys.argv:
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "prospect", "ingest_inbox.py")], capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
    ingest = " | ".join(l for l in (r.stdout or "").splitlines() if l.strip())[-400:]
else: ingest = "(跳过合并)"
n = lambda pat: len(glob.glob(pat))  # noqa: E731
assist = {os.path.basename(d): n(os.path.join(d, "*")) for d in glob.glob(os.path.join(PD, "*")) if os.path.isdir(d) and os.path.basename(d) not in ("Claude", "inbox", "pages", "已处理")}
done_dir = os.path.join(PD, "已处理"); today = dt.date.today().strftime("%m%d")
done_today = [f for f in os.listdir(done_dir) if f.startswith(today)] if os.path.isdir(done_dir) else []
by_who = {}
for f in done_today:
    m = re.match(r"^\d{4}-\d{4}-(\d-[^-]+|[^-]+)", f); who = m.group(1) if m else "?"; by_who[who] = by_who.get(who, 0) + 1   # 0916-1053-1-名单-xxx 或 0916-1053-Marvis-xxx
fac = os.path.join(ROOT, "data", "pack1688", "factories.csv"); n_fac = max(0, len(io.open(fac, encoding="utf-8-sig").read().splitlines()) - 1) if os.path.exists(fac) else 0
n_off = sum(len(json.load(io.open(f, encoding="utf-8"))) for f in glob.glob(os.path.join(ROOT, "data", "pack1688", "offers-*.json")))
kb_in = n(os.path.join(ROOT, "data", "kb", "inbox", "*.md")); kb_done = n(os.path.join(ROOT, "data", "kb", "done", "*.md"))
dm = (d1("SELECT COUNT(*) n FROM prospect_contacts") or [{"n": "?"}])[0]["n"]; kb = (d1("SELECT COUNT(*) n FROM kb_docs") or [{"n": "?"}])[0]["n"]
pages = n(os.path.join(DROP, "2-官网正文", "*.md")); cust = n(os.path.join(DROP, "4-客户数据", "*.csv"))
claims = []
sf = os.path.join(DROP, "_交付说明-20260916.md")
if os.path.exists(sf):
    for l in io.open(sf, encoding="utf-8", errors="replace").read().splitlines()[-40:]:
        if re.search(r"认领|交付|任务 ?[A-F]", l): claims.append(l.strip()[:80])
snap = {"1688工厂": n_fac, "1688商品": n_off, "决策人(库)": dm, "知识库inbox": kb_in, "知识库done": kb_done, "kb_docs": kb, "官网正文": pages, "客户数据文件": cust, "今日已处理文件": len(done_today), "助手文件夹": assist}
line = f"- {dt.datetime.now():%m-%d %H:%M} · 1688工厂 {n_fac} · 1688商品 {n_off} · 决策人 {dm} · 知识库 inbox {kb_in}/done {kb_done}/库 {kb} · 官网正文 {pages} · 今日处理 {len(done_today)}(按助手 {by_who or '—'}) · 助手文件夹 {assist or '空'}"
prev = ""
if os.path.exists(LOG):
    prev_lines = [l for l in io.open(LOG, encoding="utf-8").read().splitlines() if l.startswith("- ")]
    prev = prev_lines[-1] if prev_lines else ""
same = prev and re.sub(r"^- \d\d-\d\d \d\d:\d\d · ", "", prev) == re.sub(r"^- \d\d-\d\d \d\d:\d\d · ", "", line)
if same: line += " · **无进展**"
if claims: line += " · 最近认领/交付:" + " / ".join(claims[-3:])
hdr = "# 助手进度(自动,每 2 小时;流水线先合并交付再计数)\n\n"
old = io.open(LOG, encoding="utf-8").read() if os.path.exists(LOG) else hdr
io.open(LOG, "w", encoding="utf-8", newline="\n").write((old if old.startswith("#") else hdr + old).rstrip("\n") + "\n" + line + "\n")
print(line); print("合并:", ingest)
