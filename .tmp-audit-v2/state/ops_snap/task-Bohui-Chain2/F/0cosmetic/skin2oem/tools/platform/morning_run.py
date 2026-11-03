# -*- coding: utf-8 -*-
"""明早一键:把夜里没跑的四件按序做完(2026-09-23 02:4x)。

不带 --go 只打印计划与当前库状态,不动任何东西;带 --go 才真跑。
任一步失败即停,不往下走。

  python tools/platform/morning_run.py          # 看计划
  python tools/platform/morning_run.py --go     # 真跑
"""
import io, os, sys, json, subprocess, datetime

ROOT = r"F:\0cosmetic\skin2oem"
sys.path.insert(0, os.path.join(ROOT, "tools", "hero"))
GO = "--go" in sys.argv
REPORT = os.path.join(ROOT, "tools", "platform", "_morning_report.txt")
out = []

STEPS = [
    ("0132 源登记表补登(29 行;含退役 cir/echa/regs-blocs 三个占位行,已核过 dry run)",
     "sql", "db/migrations/0132_data_sources_refresh.sql"),
    ("0133 归一口径列(ALTER 只能跑一次,重跑会报 duplicate column,那是正常的)",
     "sql", "db/migrations/0133_data_sources_normalize.sql"),
    ("安全评级 v2(真菌痤疮:unknown 1554 -> 8,safe-partial 1760)",
     "py", "tools/safety/apply_v2.py"),
    ("致痘分同步到公司库(118 条带出处;脚本自带行数保险 5000-7000)",
     "py", "tools/safety/sync_company_comedogenic.py"),
]


def say(s):
    line = f"[{datetime.datetime.now():%H:%M}] {s}"
    out.append(line); print(line, flush=True)
    io.open(REPORT, "w", encoding="utf-8").write("\n".join(out) + "\n")


def q(sql):
    import pd1
    try:
        return pd1.q(sql)
    except Exception as e:
        say(f"查询失败: {str(e)[:100]}"); return None


r = q("SELECT (SELECT COUNT(*) FROM product_ingredients) pi,"
      "(SELECT COUNT(*) FROM data_sources) src,"
      "(SELECT COUNT(*) FROM ingredient_market_status) ims")
say("当前库: " + (json.dumps(r[0], ensure_ascii=False) if r else "查不到"))
if r and r[0]["pi"] < 363861:
    say(f"注意:product_ingredients 只有 {r[0]['pi']},P 线还没灌完(应 363861)。先等它。")
    if GO:
        sys.exit(1)

for i, (desc, kind, path) in enumerate(STEPS, 1):
    say(f"{i}. {desc}")
    if not GO:
        continue
    if kind == "sql":
        import pd1
        cmd = pd1.BASE + ["--file", os.path.join(ROOT, path)]
        p = subprocess.run(cmd, cwd=pd1.SERVER, env=pd1._env(), shell=(os.name == "nt"),
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=1800)
    else:
        p = subprocess.run([sys.executable, os.path.join(ROOT, path)], cwd=ROOT,
                           env=dict(os.environ, PYTHONIOENCODING="utf-8"),
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=7200)
    tail = ((p.stdout or "") + (p.stderr or "")).strip().split("\n")[-3:]
    say(f"   -> exit {p.returncode} | " + " / ".join(x[:80] for x in tail))
    if p.returncode != 0:
        say("   停下,不往后跑。"); sys.exit(1)

if GO:
    r = q("SELECT (SELECT COUNT(*) FROM data_sources) src,"
          "(SELECT COUNT(*) FROM safety_rules) rules")
    say("跑完: " + (json.dumps(r[0], ensure_ascii=False) if r else "查不到"))
else:
    say("以上是计划。要真跑加 --go。")
