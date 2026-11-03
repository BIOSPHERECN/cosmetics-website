#!/usr/bin/env python3
"""印尼 BPOM 化妆品原料技术要求(PerBPOM 17/2022 修订 23/2019)—— 创始人 2026-09-11 交来的 PDF(338 页)解析进 inci_catalog(id-bpom)。
附录按 ACD 附录编排:表头 NO / NOMOR ACD / NAMA BAHAN / PEMBATASAN(JENIS SEDIAAN · KADAR MAKSIMUM · PERSYARATAN LAIN)/ KONDISI …。
按「首格是序号」认数据行,第 2 格是 ACD 编号,第 3 格是物质名,其余并进备注;附录(LAMPIRAN)编号从页面文字里认,标进备注。
主键 `ID-{附录}/{序号}`。文件在 data/registries/id-bpom_限用物质_创始人提供_2026-09-11.pdf。
    python tools/id-bpom-crawl.py            体检
    python tools/id-bpom-crawl.py --apply    写库
"""
import argparse, glob, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__))
REG = "id-bpom"
SRC = "Peraturan BPOM No. 17/2022 (amending No. 23/2019) on Technical Requirements for Cosmetic Ingredients · 创始人提供 PDF"
norm = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()  # noqa: E731


def parse(path):
    import fitz
    d = fitz.open(path); out = []; lamp = ""; seen = set()
    for pno in range(len(d)):
        page = d[pno]; txt = page.get_text()
        m = re.search(r"LAMPIRAN\s+([IVX]+)", txt)
        if m: lamp = m.group(1)
        try: tabs = page.find_tables()
        except Exception: continue
        for tb in (tabs.tables if hasattr(tabs, "tables") else tabs):
            for r in tb.extract() or []:
                cs = [norm(c) for c in r]
                if len(cs) < 3 or not re.match(r"^\d+$", cs[0]): continue
                no = f"ID-{lamp or 'X'}/{cs[0]}"
                if no in seen: continue
                seen.add(no)
                name = cs[2] if len(cs) > 2 and cs[2] else cs[1]
                rest = " · ".join(c for c in cs[3:] if c)[:480]
                out.append({"no": no, "name": name[:300], "acd": cs[1], "note": f"Lampiran {lamp or '?'} · 序号 {cs[0]}" + (f" · ACD {cs[1]}" if cs[1] else "") + (f" · {rest}" if rest else "")})
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); a = ap.parse_args()
    rows = parse(glob.glob(os.path.join(os.path.dirname(HERE), "data", "registries", "id-bpom_*.pdf"))[0])
    import collections
    print(f"共 {len(rows)} 条 · 按附录 {collections.Counter(r['no'].split('/')[0] for r in rows).most_common()}")
    for r in rows[:3]: print("  ", r["no"], "|", r["name"][:40], "|", r["note"][:100])
    if not a.apply: print("\n加 --apply 才写库"); return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = ["(" + ",".join([q(x["no"]), q(x["name"]), q(x["name"]), q(x["acd"][:120]), "NULL", "NULL", q(x["note"][:600]), q(SRC), q(re.sub(r"[^A-Z0-9]+", " ", x["name"].upper()).strip()[:300]), "NULL", "NULL", q(REG)]) + ")" for x in rows]
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES " + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"INSERT INTO inci_registry (id, region, name_zh, name_en, issuer_zh, issuer_en, official_url, note_zh, note_en, sort_order, status) VALUES ('{REG}', '印尼', 'BPOM 化妆品原料技术要求(PerBPOM 17/2022)', 'BPOM Technical Requirements for Cosmetic Ingredients (PerBPOM 17/2022)', '印尼食品药品监督管理局(BPOM)', 'Indonesian Food and Drug Authority (BPOM)', 'https://standar-otskk.pom.go.id/regulasi', '按东盟化妆品指令附录编排:禁用、限用、防腐剂、着色剂、防晒剂;数据解析自创始人提供的官方 PDF,以 BPOM 原文为准。', 'Annexes follow the ASEAN Cosmetic Directive: prohibited, restricted, preservatives, colourants, UV filters; parsed from the official PDF; the BPOM text prevails.', 11, 'live') ON CONFLICT(id) DO UPDATE SET status='live';")
    f = os.path.join(HERE, "_id-bpom.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("写入", d1_exec(f), "行 ·", REG, d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")[0]["n"], "条")


if __name__ == "__main__":
    main()
