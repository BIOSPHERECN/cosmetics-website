#!/usr/bin/env python3
"""加拿大化妆品成分 Hotlist —— 禁用 + 限用两张表,进 inci_catalog 的 ca-hotlist 目录。

来源:Health Canada 官方页
  https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/
  cosmetic-ingredient-hotlist-prohibited-restricted-ingredients/hotlist.html
本机 curl 打这个站一律 000(超时/被挡),用 tools/pw-fetch.py 起 Chromium 取渲染完的 HTML
(创始人:「browsers use browsers act」),再由这里解析。

页面结构(2026-09-10 实测):两张 <table>,
  表 1「Prohibited」:Ingredient | CAS | Synonyms and Related Compounds
  表 2「Restricted」:Ingredient | CAS | Synonyms | Conditions of use(限用条件)
字段映射:
  name_zh  <- 空(加拿大没有中文名;页面按目录切表头,不硬套「标准中文名称」)
  inci     <- Ingredient
  alias    <- Synonyms
  cas      <- CAS(可能多个,用 ", " 连)
  note     <- 「禁用」 或 「限用 · <条件>」
  no       <- 顺序号(P-001 / R-001)

用法:
    python tools/hotlist-crawl.py --fetch          用浏览器取页面到缓存
    python tools/hotlist-crawl.py                   解析缓存,体检
    python tools/hotlist-crawl.py --apply           写库
"""
import argparse
import html
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
URL = ("https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/"
       "cosmetic-ingredient-hotlist-prohibited-restricted-ingredients/hotlist.html")
CACHE = os.path.join(HERE, "_hotlist.html")
REG = "ca-hotlist"
TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")


def text(cell: str) -> str:
    t = TAG.sub(" ", cell)
    t = html.unescape(t)
    # 去掉「table 1 note 1」这类脚注引用
    t = re.sub(r"table\s*\d+\s*note\s*\d+", " ", t, flags=re.I)
    t = WS.sub(" ", t).strip("  ")
    return "" if t in ("", "&nbsp;", "-", "—") else t


def tables(src: str):
    for m in re.finditer(r"<table.*?</table>", src, re.S | re.I):
        tb = m.group(0)
        cap = re.search(r"<caption.*?</caption>", tb, re.S | re.I)
        title = text(cap.group(0)) if cap else ""
        rows = []
        for tr in re.finditer(r"<tr.*?</tr>", tb, re.S | re.I):
            cells = [text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr.group(0), re.S | re.I)]
            if cells:
                rows.append(cells)
        yield title, rows


def parse(src: str):
    out = []
    kind_i = 0
    for title, rows in tables(src):
        low = title.lower()
        if "prohibited" in low:
            kind = "prohibited"
        elif "restricted" in low:
            kind = "restricted"
        else:
            # 没 caption 的按出现顺序:第一张禁用、第二张限用(页面实测就是这个顺序)
            kind = "prohibited" if kind_i == 0 else "restricted"
        kind_i += 1
        n = 0
        for cells in rows:
            if len(cells) < 2:
                continue
            ing = cells[0]
            if not ing or ing.lower().startswith("ingredient"):
                continue
            cas = cells[1] if len(cells) > 1 else ""
            syn = cells[2] if len(cells) > 2 else ""
            cond = cells[3] if len(cells) > 3 else ""
            if not re.search(r"[A-Za-z]", ing):
                continue
            n += 1
            note = "禁用 · Prohibited" if kind == "prohibited" else ("限用 · Restricted" + (f" · {cond}" if cond else ""))
            out.append({
                "no": f"{'P' if kind == 'prohibited' else 'R'}-{n:03d}",
                "inci": ing, "alias": syn, "cas": cas, "note": note, "kind": kind,
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    if a.fetch or not os.path.exists(CACHE):
        subprocess.run([sys.executable, os.path.join(HERE, "pw-fetch.py"), URL, CACHE, "--sel", "table", "--wait", "6"],
                       check=False, env={**os.environ, "PYTHONUTF8": "1"})
    src = io.open(CACHE, encoding="utf-8", errors="replace").read()
    rows = parse(src)
    from collections import Counter
    print(f"Hotlist 解析 {len(rows)} 条 · {Counter(r['kind'] for r in rows).most_common()}")
    print(f"  有 CAS {sum(1 for r in rows if r['cas'])} · 有同义词 {sum(1 for r in rows if r['alias'])}")
    for r in rows[:3] + rows[-2:]:
        print(f"    {r['no']} {r['inci'][:44]:<46} CAS {r['cas'][:14]:<16} {r['note'][:40]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for r in rows:
        vals.append("(" + ",".join([
            q(r["no"]), "NULL", q(r["inci"][:300]), q(r["alias"][:300]), "NULL", "NULL", q(r["note"][:600]),
            q("Health Canada · Cosmetic Ingredient Hotlist"), q(r["inci"].upper()[:300]), q(r["cas"][:80]), "NULL", q(REG),
        ]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry)"
                     " VALUES " + ",".join(vals[i:i + 40]) + ";")
    sql = os.path.join(HERE, "_hotlist.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"完成:{REG} 共 {n[0]['n'] if n else '?'} 条")
    d1_exec(io.open(os.path.join(HERE, "_hotlist-status.sql"), "w", encoding="utf-8", newline="\n").name) if False else None


if __name__ == "__main__":
    main()
