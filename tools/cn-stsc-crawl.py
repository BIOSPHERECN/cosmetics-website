#!/usr/bin/env python3
"""中国化妆品禁用 / 限用 / 准用组分 —— 从第三方整理页(化妆品法规网 hzpwjc.cn)的 7 张 HTML 表解析进 inci_catalog(cn-stsc)。

为什么用第三方(创始人 2026-09-10 23:3x:「你要去调用第三方的,他们都帮你收集了,你要去用他们搜索」):
nmpa.gov.cn 对这台机器整体不可达(TLS 直接断连,创始人自己的 Chrome 也打不开)。
化妆品法规网把 NMPA 2021 年《化妆品禁用原料目录》《禁用植(动)物原料目录》与 2015 年版
《化妆品安全技术规范》表 3–7 逐条录成了 HTML 表,列名与原文一致。
中检院(nifdc.org.cn,NMPA 直属)镜像的 2015 版 PDF 另存在 data/registries/cn-stsc_化妆品安全技术规范2015_NIFDC镜像.pdf(13.8MB)作对照。

七张表(URL 尾号 = hzpwjc 的文章号):
    109 禁用原料目录(2021 版)          1,288 行:序号 / 中文名 / 英文名
    110 禁用植(动)物原料目录(2021 版)     113 行:序号 / 中文名 / 拉丁学名或英文名
    111 限用组分(表 3)                     85 行:序号 / 中文名 / 英文名 / INCI / 适用范围 / 最大允许浓度 / 其他限制 / 标签
    112 准用防腐剂(表 4)                   57 行:序号 / 中文名 / 英文名 / INCI / 最大允许浓度 / 其他限制 / 标签
    113 准用防晒剂(表 5)                   30 行:同上
    114 准用着色剂(表 6)                  161 行:序号 / CI 索引号 / CI 通用名 / 颜色 / 中文名 / 使用范围(1–4) / 其他
    115 准用染发剂(表 7)                   78 行:序号 / 中文名 / INCI / 氧化型浓度 / 非氧化型浓度 / 其他 / 标签
表头两行(主 + 子),数据行以序号开头。页面上写明来源是第三方整理、以 NMPA 原文为准。

用法:
    python tools/cn-stsc-crawl.py            体检(HTML 在 data/registries/cn-stsc_hzpwjc_{109..115}.html,来源见同目录 README)
    python tools/cn-stsc-crawl.py --apply    写库
"""
import argparse
import glob
import html as htmlmod
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "cn-stsc"
SRC = "整理自化妆品法规网(hzpwjc.cn)转录的 NMPA《化妆品禁用原料目录(2021年版)》《化妆品禁用植(动)物原料目录(2021年版)》与《化妆品安全技术规范(2015年版)》表 3–7;以 NMPA 原文为准"
TABLES = [
    (109, "禁用", "禁用原料目录(2021)"),
    (110, "禁用", "禁用植(动)物原料目录(2021)"),
    (111, "限用", "限用组分(表3)"),
    (112, "准用防腐剂", "准用防腐剂(表4)"),
    (113, "准用防晒剂", "准用防晒剂(表5)"),
    (114, "准用着色剂", "准用着色剂(表6)"),
    (115, "准用染发剂", "准用染发剂(表7)"),
]


def cell(x: str) -> str:
    x = re.sub(r"<br\s*/?>", " ", x)
    x = htmlmod.unescape(re.sub(r"<[^>]+>", "", x))
    return re.sub(r"\s+", " ", x).strip()


def rows_of(path: str):
    h = io.open(path, encoding="utf-8", errors="replace").read()
    tabs = re.findall(r"<table.*?</table>", h, re.S)
    if not tabs:
        return []
    tb = max(tabs, key=lambda t: len(re.findall(r"<tr", t)))
    out = []
    for r in re.findall(r"<tr.*?</tr>", tb, re.S):
        cs = [cell(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)]
        if not cs or not re.match(r"^\d+$", cs[0]):
            continue
        # 「1 2 3 4 …」列号行(表 6 有)不是数据
        if len(cs) >= 3 and all(re.match(r"^\d+$", c) for c in cs) and [int(c) for c in cs] == list(range(1, len(cs) + 1)):
            continue
        # 同一序号连着出现两行 = 长名字被录成两行(109 的 1261),并回上一行
        if out and out[-1][0] == cs[0]:
            prev = out[-1]
            for i in range(1, max(len(prev), len(cs))):
                a = prev[i] if i < len(prev) else ""
                b = cs[i] if i < len(cs) else ""
                if i < len(prev):
                    prev[i] = (a + b) if a and b and not a.endswith(" ") and not b.startswith(" ") and (a[-1] in "（(,-" or b[0] in "）),-" or re.search(r"[一-鿿]$", a)) else (a + " " + b).strip()
                else:
                    prev.append(b)
            continue
        out.append(cs)
    return out


def parse(n: int, kind: str, label: str, cs: list) -> dict:
    g = lambda i: cs[i] if i < len(cs) else ""  # noqa: E731
    if n in (109, 110):
        return {"no": f"CN-{n}/{cs[0]}", "zh": g(1), "en": g(2), "cas": "", "note": f"{label} · 序号 {cs[0]}"}
    if n == 111:
        lim = " / ".join(x for x in (g(4), g(5)) if x)
        note = f"{label} · 序号 {cs[0]}" + (f" · {lim}" if lim else "") + (f" · {g(6)}" if g(6) else "") + (f" · 标签:{g(7)}" if g(7) else "")
        return {"no": f"CN-{n}/{cs[0]}", "zh": g(1), "en": g(3) or g(2), "cas": "", "note": note}
    if n in (112, 113):
        note = f"{label} · 序号 {cs[0]}" + (f" · 最大允许浓度 {g(4)}" if g(4) else "") + (f" · {g(5)}" if g(5) else "") + (f" · 标签:{g(6)}" if g(6) else "")
        return {"no": f"CN-{n}/{cs[0]}", "zh": g(1), "en": g(3) or g(2), "cas": "", "note": note}
    if n == 114:
        # 序号 / CI 索引号 / CI 通用名 / 颜色 / 中文名 / 使用范围 1–4(四格)/ 其他
        scope = "".join("✓" if x else "·" for x in (g(5), g(6), g(7), g(8)))
        note = f"{label} · 序号 {cs[0]} · {g(1) if g(1).upper().startswith('CI') else 'CI ' + g(1)} · {g(3)} · 使用范围[各种/除眼部/不接触粘膜/暂时接触]:{scope}" + (f" · {g(9)}" if g(9) else "")
        return {"no": f"CN-{n}/{cs[0]}", "zh": g(4) or f"CI {g(1)}", "en": g(2) or f"CI {g(1)}", "cas": "", "note": note}
    if n == 115:
        note = f"{label} · 序号 {cs[0]}" + (f" · 氧化型 {g(3)}" if g(3) else "") + (f" · 非氧化型 {g(4)}" if g(4) else "") + (f" · {g(5)}" if g(5) else "") + (f" · 标签:{g(6)}" if g(6) else "")
        return {"no": f"CN-{n}/{cs[0]}", "zh": g(1), "en": g(2), "cas": "", "note": note}
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = []
    for n, kind, label in TABLES:
        p = os.path.join(a.dir, f"cn-stsc_hzpwjc_{n}.html")
        if not os.path.exists(p):
            print(f"  {n} {label}: 没有文件")
            continue
        rs = rows_of(p)
        got = [x for x in (parse(n, kind, label, cs) for cs in rs) if x and (x["zh"] or x["en"])]
        print(f"  {n} {label}: 表 {len(rs)} 行 → {len(got)} 条 · 例 {got[0]['zh'][:24] if got else '-'} | {got[0]['en'][:30] if got else ''}")
        rows += got
    print(f"共 {len(rows):,} 条")
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for x in rows:
        key = (x["en"] or x["zh"]).upper()
        key = re.sub(r"[（(][^）)]*[）)]", " ", key)
        key = re.sub(r"[^A-Z0-9一-鿿]+", " ", key).strip()
        vals.append("(" + ",".join([q(x["no"]), q(x["zh"][:300]), q(x["en"][:300]), "NULL", "NULL", "NULL", q(x["note"][:600]),
                                    q(SRC), q(key[:300]), "NULL", "NULL", q(REG)]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"UPDATE inci_registry SET status='live', note_zh=note_zh || ' 本站数据整理自第三方转录(化妆品法规网),已对照中检院镜像的 2015 版 PDF 留存;条文以 NMPA 原文为准。' WHERE id='{REG}';")
    for old in glob.glob(os.path.join(HERE, "_cn-stsc-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_cn-stsc-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f); buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_cn-stsc-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · cn-stsc 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
