#!/usr/bin/env python3
"""美国 FDA 化妆品禁用与限用成分 —— 进 inci_catalog 的 us-fda 目录。

来源:https://www.fda.gov/cosmetics/cosmetics-laws-regulations/prohibited-restricted-ingredients-cosmetics
本机 curl 打 fda.gov 一律 000,用 tools/pw-fetch.py 起 Chromium 取(Akamai 站要用 wait_until=commit,
否则 goto 卡死、关浏览器时报 `Connection closed while reading from the driver`)。

**这份清单只有十来条,不是抓漏了,是美国就这么多。**
美国没有「已使用原料目录」这种正面清单,除色素外化妆品成分上市前不需批准;
法规层面明文禁用/限用的就是 21 CFR 700.11–700.35 这几条 + 色素法规。
所以这一目录的价值不在条数,在于把「美国到底禁了什么」说准 ——
很多客户以为美国和欧盟一样有一千多条禁用,报价时按欧盟口径把配方改一遍,白花钱。

页面结构(2026-09-10 实测):每个物质是一个 <strong>名称.</strong>,后面跟说明段落,
段落里有 21 CFR 700.xx 的条款号。解析:按 strong 切段,取条款号与说明。

用法:
    python tools/fda-crawl.py            体检(读 tools/_fda-prohibited.html)
    python tools/fda-crawl.py --apply    写库
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
CACHE = os.path.join(HERE, "_fda-prohibited.html")
REG = "us-fda"
TAG = re.compile(r"<[^>]+>")
CFR = re.compile(r"21 CFR (?:§ ?)?(7\d\d\.\d+)")
# 页面上不是物质、只是小节标题的 strong
SKIP = ("?", "what ", "why ", "are ")

# 补一层中文名与类别 —— 页面是英文,客户看目录要能一眼认出
ZH = {
    "Bithionol": ("硫双二氯酚", "禁用"),
    "Chlorofluorocarbon propellants": ("氟氯烃类推进剂(CFC)", "禁用"),
    "Chloroform": ("氯仿", "禁用"),
    "Halogenated salicylanilides": ("卤代水杨酰苯胺类(二溴、三溴、四氯水杨酰苯胺等)", "禁用"),
    "Hexachlorophene": ("六氯酚", "限用"),
    "Mercury compounds": ("汞化合物", "限用(仅眼部区域防腐且无替代时,痕量)"),
    "Methylene chloride": ("二氯甲烷", "禁用"),
    "Prohibited cattle materials": ("禁用牛源物质(疯牛病风险材料)", "禁用"),
    "Sunscreens in cosmetics": ("化妆品中的防晒剂(按 OTC 药品监管)", "限用/按药品管理"),
    "Vinyl chloride": ("氯乙烯(气雾剂推进剂)", "禁用"),
    "Zirconium-containing complexes": ("含锆络合物(气雾剂)", "禁用"),
}


def parse(src: str):
    m = re.search(r"<main.*?</main>", src, re.S | re.I) or re.search(r"<article.*?</article>", src, re.S | re.I)
    body = m.group(0) if m else src
    parts = re.split(r"(<strong[^>]*>.*?</strong>)", body, flags=re.S | re.I)
    out, n = [], 0
    for i in range(1, len(parts) - 1, 2):
        head = html.unescape(TAG.sub("", parts[i])).strip().rstrip(".")
        low = head.lower()
        if not head or any(low.startswith(k) or k in low for k in SKIP):
            continue
        # 脚注星号(* / **)和「More Resources」这类栏目标题也是 <strong>,不是物质
        if not re.search(r"[A-Za-z]{3,}", head) or low.startswith("more resources"):
            continue
        desc = html.unescape(TAG.sub(" ", parts[i + 1]))
        desc = re.sub(r"\s+", " ", desc).strip()
        # 说明只取到下一个物质之前的第一段(约 500 字),够读懂限制条件
        desc = desc[:600]
        cites = sorted(set(CFR.findall(parts[i + 1])))
        key = next((k for k in ZH if head.lower().startswith(k.lower())), head)
        zh, kind = ZH.get(key, ("", "禁用/限用"))
        n += 1
        out.append({
            "no": f"US-{n:02d}", "inci": head, "name": zh, "kind": kind,
            "note": (f"{kind} · 21 CFR {' / '.join(cites)}" if cites else kind) + f" · {desc}",
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(CACHE):
        print("先跑:python tools/pw-fetch.py <FDA 页面> tools/_fda-prohibited.html --wait 12")
        return
    rows = parse(io.open(CACHE, encoding="utf-8", errors="replace").read())
    print(f"FDA 解析 {len(rows)} 条(美国法规层面就这么多,不是抓漏)")
    for r in rows:
        print(f"  {r['no']} {r['inci'][:44]:<46} {r['name'][:22]:<24} {r['note'][:48]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = ["(" + ",".join([q(r["no"]), q(r["name"]), q(r["inci"][:300]), "NULL", "NULL", "NULL", q(r["note"][:900]),
                            q("US FDA · Prohibited & Restricted Ingredients in Cosmetics"), q(r["inci"].upper()[:300]),
                            "NULL", "NULL", q(REG)]) + ")" for r in rows]
    lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry)"
                 " VALUES " + ",".join(vals) + ";")
    sql = os.path.join(HERE, "_fda.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"完成:{REG} 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
