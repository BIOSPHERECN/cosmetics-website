# -*- coding: utf-8 -*-
"""P 线灌完后的夜间收尾,一次跑完不用人盯(2026-09-23 02:0x)。

会话重启后原收尾链已随上个会话停掉,这个脚本接手它的活:
  等 product_ingredients 灌满 -> ingredient-freq.py --todo-only -> obf-ingredients-load.py --freq -> counts-refresh.py
每步失败就停,不在坏表上继续刷。结果写 tools/platform/_night_report.txt,只打印摘要。
"""
import io, os, sys, time, json, subprocess, datetime

ROOT = r"F:\0cosmetic\skin2oem"
sys.path.insert(0, os.path.join(ROOT, "tools", "hero"))
REPORT = os.path.join(ROOT, "tools", "platform", "_night_report.txt")
TARGET = 363861
out = []


def say(s):
    line = f"[{datetime.datetime.now():%H:%M}] {s}"
    out.append(line)
    print(line, flush=True)
    io.open(REPORT, "w", encoding="utf-8").write("\n".join(out) + "\n")


def q(sql, tries=3):
    import pd1
    for i in range(tries):
        try:
            return pd1.q(sql)
        except Exception as e:
            if i == tries - 1:
                say(f"查询失败: {str(e)[:120]}")
                return None
            time.sleep(60)


def run(script, *args, timeout=7200):
    cmd = [sys.executable, os.path.join(ROOT, "tools", "platform", script), *args]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    p = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    tail = ((p.stdout or "") + (p.stderr or "")).strip().split("\n")[-3:]
    say(f"{script} {' '.join(args)} -> exit {p.returncode} | " + " / ".join(x[:90] for x in tail))
    return p.returncode == 0


# ① 等灌满
say(f"开始等 product_ingredients 灌到 {TARGET}")
while True:
    r = q("SELECT COUNT(*) n FROM product_ingredients")
    n = r[0]["n"] if r else 0
    if n >= TARGET:
        say(f"灌完: {n} 行")
        break
    time.sleep(300)

# ② 三步收尾,任一失败即停
ok = run("ingredient-freq.py", "--todo-only")
if ok:
    ok = run("obf-ingredients-load.py", "--freq")
if ok:
    ok = run("counts-refresh.py")

# ③ 收尾数字
r = q("SELECT (SELECT COUNT(*) FROM product_ingredients) pi,"
      "(SELECT COUNT(*) FROM ingredient_todo) todo,"
      "(SELECT COUNT(*) FROM market_products) mp,"
      "(SELECT COUNT(*) FROM ingredient_market_status) ims,"
      "(SELECT COUNT(*) FROM packaging WHERE status IN ('sample','active') AND type<>'use-other') shelf")
say("收尾数字: " + (json.dumps(r[0], ensure_ascii=False) if r else "查不到"))
r2 = q("SELECT freq FROM ingredient_todo WHERE inci_key='1'")
say("碎片键 `1` 的 freq: " + (str(r2[0]["freq"]) if r2 else "已不在表里(好)"))
say("全部完成" if ok else "中途停下,见上面 exit 非 0 那行")
