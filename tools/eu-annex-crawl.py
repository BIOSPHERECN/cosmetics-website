#!/usr/bin/env python3
"""欧盟化妆品法规 1223/2009 附录 II–VI —— 从 EUR-Lex 合并版 HTML 解析进 inci_catalog(eu-annex)。

来源:EUR-Lex 最新合并版 `02009R1223-20260501`(2026-09-10 检索所得),
HTML 4.09MB,用 tools/pw-fetch.py 取回(直接 curl 也行,但 --sel table 能等到表渲染完)。
    https://eur-lex.europa.eu/eli/reg/2009/1223/2026-05-01/eng

各附录一张主表(V 与 VI 前面还有说明小表,按「行数最多」那张取):
    II  禁用     1,941 行:序号 / 化学名 / CAS / EC
    III 限用       691 行:序号 / 化学名 / 通用名 / CAS / EC / 产品类型与部位 / 最高浓度 / 其他 / 标签措辞
    IV  着色剂     164 行:序号 / 化学名 / CI 号 / CAS / EC / 颜色 / 产品类型 / 最高浓度 / 其他 / 措辞
    V   防腐剂                同 III 结构
    VI  防晒剂      61 行      同 III 结构
表头占前三行(标题 / 子标题 / a b c d…列标),数据行以序号开头。

**只收原文,不做「等价映射」:** 附录里的名字与 CosIng 的 INCI 不一一对应,这里照抄附录列,
备注写清附录号与限制文字;要对 INCI 名去 eu-cosing 那一档查。

用法:
    python tools/eu-annex-crawl.py            体检(需先取回 HTML 到 data/registries/eu1223.html 或 --html 指定)
    python tools/eu-annex-crawl.py --apply    写库
"""
import argparse
import glob
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "eu-annex"
SRC = "EU Regulation 1223/2009 consolidated 2026-05-01 · EUR-Lex"
ANNEX = [("ANNEX II", "II", "禁用"), ("ANNEX III", "III", "限用"), ("ANNEX IV", "IV", "准用着色剂"),
         ("ANNEX V", "V", "准用防腐剂"), ("ANNEX VI", "VI", "准用防晒剂")]


def text(x: str) -> str:
    x = re.sub(r"<br\s*/?>", " ", x)
    x = re.sub(r"<[^>]+>", "", x)
    x = x.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", x).strip()


def parse(html: str):
    marks = [(k, html.find(k)) for k, _, _ in ANNEX]
    marks = [(k, i) for k, i in marks if i >= 0]
    bounds = marks + [("END", len(html))]
    out = []
    for (k, i), (_, j) in zip(bounds, bounds[1:]):
        num, kind = next((n, kd) for kk, n, kd in ANNEX if kk == k)
        seg = html[i:j]
        tabs = re.findall(r"<table.*?</table>", seg, re.S)
        if not tabs:
            continue
        # 选「以序号开头的数据行最多」的那张表,不选行数最多的:附录 VI 前面有一张 64 行的说明表,
        # 按行数会选错,数据表(61 行)一条都出不来。
        def score(t):
            return sum(1 for r in re.findall(r"<tr.*?</tr>", t, re.S)
                       if re.match(r"^\d+[a-z]?$", text(re.search(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S).group(0)) if re.search(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S) else ""))
        tb = max(tabs, key=score)
        rows = re.findall(r"<tr.*?</tr>", tb, re.S)
        n_ok = 0
        last = None
        for r in rows:
            cells = [text(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)]
            if len(cells) < 3 or not re.match(r"^\d+[a-z]?$", cells[0]):
                # rowspan 续行:没有序号、只有「产品类型 / 最高浓度 / 其他」三四格 —— 续行并回上一条,
                # 否则附录 III 一半的限用条件(同一物质在不同产品类型的上限)就丢了。
                if last is not None and num != "II" and 1 <= len(cells) <= 5 and any(cells):
                    extra = " / ".join(x for x in cells if x)
                    if extra and extra not in last["note"]:
                        last["note"] = (last["note"] + " ｜ " + extra)[:600]
                continue
            if num == "II":
                ref, name, cas, ec = cells[0], cells[1], (cells[2] if len(cells) > 2 else ""), (cells[3] if len(cells) > 3 else "")
                inci, limit, other = "", "", ""
            elif num == "IV":
                ref, name, inci, cas, ec = cells[0], cells[1], (cells[2] if len(cells) > 2 else ""), (cells[3] if len(cells) > 3 else ""), (cells[4] if len(cells) > 4 else "")
                limit = " / ".join(x for x in cells[5:9] if x)
                other = cells[9] if len(cells) > 9 else ""
            else:  # III / V / VI
                ref, name, inci, cas, ec = cells[0], cells[1], (cells[2] if len(cells) > 2 else ""), (cells[3] if len(cells) > 3 else ""), (cells[4] if len(cells) > 4 else "")
                limit = " / ".join(x for x in cells[5:8] if x)
                other = cells[8] if len(cells) > 8 else ""
            if not name:
                continue
            note = f"附录 {num} {kind} · 序号 {ref}" + (f" · {limit}" if limit else "") + (f" · 标签措辞:{other[:160]}" if other else "")
            last = {"no": f"{num}/{ref}", "name": name[:300], "inci": inci[:300], "cas": cas[:120], "ec": ec[:120], "note": note[:600]}
            out.append(last)
            n_ok += 1
        print(f"  {k:<10} 主表 {len(rows)} 行 → 解析 {n_ok} 条")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default=os.path.join(os.path.join(os.path.dirname(HERE), "data", "registries"), "eu-annex_EUR-Lex_02009R1223-20260501.html"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    html = io.open(a.html, encoding="utf-8", errors="replace").read()
    rows = parse(html)
    print(f"共 {len(rows):,} 条")
    for r in rows[:3]:
        print("   ", r["no"], "|", r["name"][:40], "|", r["cas"], "|", r["note"][:60])
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for x in rows:
        key = (x["inci"] or x["name"]).upper()
        vals.append("(" + ",".join([q(x["no"]), q(x["name"]), q(x["inci"]), "NULL", "NULL", "NULL", q(x["note"]),
                                    q(SRC), q(key[:300]), q(x["cas"]), q(x["ec"]), q(REG)]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    for old in glob.glob(os.path.join(HERE, "_eu-annex-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_eu-annex-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f); buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_eu-annex-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · eu-annex 共 {n[0]['n'] if n else '?'} 条")
    d1_exec_note = os.path.join(HERE, "_eu-annex-status.sql")
    io.open(d1_exec_note, "w", encoding="utf-8", newline="\n").write(
        f"UPDATE inci_registry SET status='live' WHERE id='{REG}';\n")
    d1_exec(d1_exec_note)


if __name__ == "__main__":
    main()
