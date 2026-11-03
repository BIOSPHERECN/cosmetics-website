#!/usr/bin/env python3
"""美国 21 CFR Part 73 / 74 Subpart C(化妆品准用色素添加剂)—— 从 eCFR 官方 XML 解析进 inci_catalog(us-fda)。

来源:eCFR Versioner API(官方,联邦法规电子版),curl 经本机代理一律 000,走 tools/pw-download.py:
    https://www.ecfr.gov/api/versioner/v1/full/2026-09-01/title-21.xml?part=73   免认证色素(Part 73)
    https://www.ecfr.gov/api/versioner/v1/full/2026-09-01/title-21.xml?part=74   须批次认证色素(Part 74)
XML 里 § 写成 `&#xA7;`,节标题在 <HEAD> 里:「&#xA7; 73.2030 Annatto.」;Subpart C—Cosmetics 之后到 Subpart D 之前的节就是化妆品用色素。

**为什么值得单独进库:** 美国没有化妆品原料正面清单,色素是唯一例外 —— 不在 73/74 Subpart C 里的着色剂
在美国化妆品里就是不能用,而且大多数每节都写了「不得用于眼部」这类限制。做美线的彩妆客户第一个问的就是这个。

us-fda 目录原有 11 条(FDA 禁限用清单),这里**只追加色素、不动那 11 条**;主键用 `US-73.2030` 这种写法避免撞其他目录。

用法:
    python tools/us-fda-colors.py            体检
    python tools/us-fda-colors.py --apply    写库
"""
import argparse
import html
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "us-fda"
SRC = "21 CFR Part 73/74 Subpart C (Cosmetics), eCFR 2026-09-01 · US FDA"


def plain(x: str) -> str:
    x = re.sub(r"<[^>]+>", " ", x)
    x = html.unescape(x)
    return re.sub(r"\s+", " ", x).strip()


def parse_part(xml: str, part: str):
    """取 Subpart C—Cosmetics 到 Subpart D 之间的各节。"""
    i = xml.find("Subpart C")
    j = xml.find("Subpart D", i + 1)
    if i < 0:
        return []
    seg = xml[i:j if j > 0 else len(xml)]
    out = []
    # 每节:<DIV8 ...><HEAD>&#xA7; 73.2030 Annatto.</HEAD> ... </DIV8>
    for m in re.finditer(r"<DIV8[^>]*>(.*?)</DIV8>", seg, re.S):
        body = m.group(1)
        hm = re.search(r"<HEAD>(.*?)</HEAD>", body, re.S)
        if not hm:
            continue
        head = plain(hm.group(1))
        sm = re.match(r"§\s*(\d+\.\d+)\s+(.+?)\.?$", head)
        if not sm:
            continue
        sec, name = sm.group(1), sm.group(2).strip()
        text = plain(body)
        # 「Uses and restrictions」那一段:拿到第一句说明用途与限制的话
        um = re.search(r"Uses and restrictions\.?\s*(.{20,420}?)(?:\(\w\)\s*Labeling|$)", text)
        use = um.group(1).strip() if um else ""
        flags = []
        if re.search(r"not (?:be used|to be used|for use) in (?:the )?(?:area of the )?eye", text, re.I) or \
           re.search(r"except (?:that it may not be used|in the area of the eye)", text, re.I):
            flags.append("眼部不可用")
        if re.search(r"area of the eye", text, re.I) and re.search(r"may be safely used[^.]*eye", text, re.I):
            flags.append("含眼部用途")
        if re.search(r"externally applied", text, re.I):
            flags.append("仅外用")
        if re.search(r"batch[^.]{0,40}certif", text, re.I) or part == "74":
            flags.append("须批次认证" if part == "74" else "免认证")
        if part == "73" and "须批次认证" not in flags:
            flags.append("免认证")
        note = f"21 CFR {sec} 化妆品准用色素" + (" · " + " · ".join(dict.fromkeys(flags)) if flags else "") + (f" · {use[:260]}" if use else "")
        out.append({"no": f"US-{sec}", "name": name, "note": note[:600]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = []
    for part in ("73", "74"):
        p = os.path.join(a.dir, f"us-fda_eCFR_21CFR{part}_2026-09-01.xml")
        if not os.path.exists(p):
            print(f"  Part {part}: 没有 {p}")
            continue
        got = parse_part(io.open(p, encoding="utf-8", errors="replace").read(), part)
        print(f"  Part {part} Subpart C: {len(got)} 节 · 例 {got[0]['no'] if got else '-'} {got[0]['name'][:40] if got else ''}")
        rows += got
    print(f"共 {len(rows)} 条")
    for r in rows[:3]:
        print("   ", r["no"], "|", r["name"], "|", r["note"][:90])
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}' AND no LIKE 'US-7%';"]
    vals = ["(" + ",".join([q(x["no"]), q(x["name"][:300]), q(x["name"][:300]), "NULL", "NULL", "NULL", q(x["note"]),
                            q(SRC), q(x["name"][:300].upper()), "NULL", "NULL", q(REG)]) + ")" for x in rows]
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    f = os.path.join(HERE, "_us-fda-colors.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    total = d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · us-fda 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
