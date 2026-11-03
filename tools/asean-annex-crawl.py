#!/usr/bin/env python3
"""东盟化妆品指令附录 II / III / IV / VI —— 从 NPRA(马来西亚药监)发布的 2026-06-10 版 PDF 抽表进 inci_catalog(asean-acd)。

来源(2026-09-10 检索所得,东盟秘书处 asean.org 的 2023 版与 NPRA 转发的 2026 版都在;取新的):
    https://www.npra.gov.my/images/Guidelines_Central/Guidelines_on_Cosmetic/Annex_II_release_-_10_June_2026.pdf
    …/Annex_III_release_-_10_June_2026.pdf · …/Annex_IV_release_-_10_June_2026.pdf · …/Annex_VI_release_-_10_June_2026.pdf
curl 一律 000,走 tools/pw-download.py(浏览器网络栈)。

**PDF 表怎么抽:** PyMuPDF `page.find_tables()` 对这几份排版规整的 PDF 能直接给出单元格,
实测附录 II 第 3 页一张表 36 行、三列(Substances / CAS Number / Ref. No)。
每页表头重复,靠表头行文字对列,不按位置硬编:附录 III/IV/VI 列数不同,
拿表头里含 "Substance"/"CAS"/"Ref"/"Maximum"/"Restriction"/"Colour"/"Field" 的列来认。
一条记录被换页切成两行时,续行没有 Ref. No —— 并回上一条。

只收原文,不做「等价映射」;东盟附录与欧盟附录相似但不等同,各自独立入库。

用法:
    python tools/asean-annex-crawl.py            体检(PDF 在 data/registries/asean_aII.pdf 等,或 --dir 指定)
    python tools/asean-annex-crawl.py --apply    写库
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
REG = "asean-acd"
SRC = "ASEAN Cosmetic Directive Annexes, release 10 June 2026 · NPRA Malaysia"
FILES = [("II", "asean-acd_AnnexII_2026-06-10_NPRA.pdf", "禁用"), ("III", "asean-acd_AnnexIII_2026-06-10_NPRA.pdf", "限用"),
         ("IV", "asean-acd_AnnexIV_2026-06-10_NPRA.pdf", "准用着色剂"), ("VI", "asean-acd_AnnexVI_2026-06-10_NPRA.pdf", "准用防晒剂")]


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def col_index(header: list) -> dict:
    """按表头认列。表头文字各附录略有出入,用关键词而不是精确匹配。"""
    idx = {}
    for i, h in enumerate(header):
        hl = norm(h).lower()
        if not hl:
            continue
        # 附录 III 的名字列叫「Substance/CAS No」—— 先认 substance 再认 cas,否则它被当成 CAS 列,整表作废
        if "ref" in hl and "ref" not in idx:
            idx["ref"] = i
        elif ("substance" in hl or "ingredient" in hl or hl.startswith("name")) and "name" not in idx:
            idx["name"] = i
        elif ("colour index" in hl or hl.startswith("ci ") or hl == "ci") and "ci" not in idx:
            idx["ci"] = i
            idx.setdefault("name", i)          # 附录 IV 没有物质名列,CI 号就是它的名字
        elif "cas" in hl and "cas" not in idx:
            idx["cas"] = i
        elif ("maximum" in hl or "concentration" in hl or "restriction" in hl or "limitation" in hl
              or "field" in hl or "condition" in hl or "requirement" in hl) and hl not in idx:
            idx.setdefault("limits", []).append(i)
    return idx


def parse_pdf(path: str, num: str, kind: str):
    import fitz
    d = fitz.open(path)
    out, last = [], None
    for pno in range(len(d)):
        page = d[pno]
        try:
            tabs = page.find_tables()
        except Exception:
            continue
        for tb in (tabs.tables if hasattr(tabs, "tables") else tabs):
            rows = tb.extract()
            if not rows:
                continue
            idx = col_index(rows[0])
            body = rows[1:]
            if "name" not in idx:          # 没表头的续页:沿用上一张表的列位
                if not out:
                    continue
                idx = parse_pdf.last_idx
                body = rows
            parse_pdf.last_idx = idx
            for r in body:
                cells = [norm(c) for c in r]
                name = cells[idx["name"]] if idx.get("name") is not None and idx["name"] < len(cells) else ""
                ref = cells[idx["ref"]] if idx.get("ref") is not None and idx["ref"] < len(cells) else ""
                cas = cells[idx["cas"]] if idx.get("cas") is not None and idx["cas"] < len(cells) else ""
                ci = cells[idx["ci"]] if idx.get("ci") is not None and idx["ci"] < len(cells) else ""
                lim = " / ".join(cells[i] for i in idx.get("limits", []) if i < len(cells) and cells[i])
                if not name and not ref:
                    continue
                if not ref and last is not None:      # 换页续行:并回上一条
                    last["name"] = norm(last["name"] + " " + name)
                    if lim:
                        last["limit"] = norm(last["limit"] + " " + lim)
                    continue
                # Ref 写法不一:「1」「1a」「12 (12)」「(EU 23)」—— 取开头的编号;附录 IV 没有 Ref,用 CI 号
                m = re.match(r"^\(?\s*(\d+[a-z]?)", ref)
                if m:
                    ref = m.group(1)
                elif num == "IV" and re.match(r"^\d{4,5}", name):
                    ref = name.split()[0]
                else:
                    continue
                if not cas:
                    mc = re.search(r"CAS\s*No\.?\s*([\d\-]{5,12})", name)
                    if mc:
                        cas = mc.group(1)
                last = {"num": num, "kind": kind, "ref": ref, "name": name, "cas": cas, "ci": ci, "limit": lim}
                out.append(last)
    return out


def parse_iv_text(path: str, num: str, kind: str):
    """附录 IV 版式(实测):CI 号独占一行,颜色在下一行,之后四列各一行(X 或空),再后面是限制文字。
    find_tables 把整列 CI 号并成一个格,所以按文本行走。"""
    import fitz
    COL = r"(Red|Yellow|Blue|Green|Orange|Brown|Black|White|Violet|Pink|Purple|Grey|Gray|Colourless|Various)"
    pat = re.compile(r"^\s*(\d{5})(?:\s*\((\d+)\))?\s*$", re.M)
    out, seen = [], set()
    for page in fitz.open(path):
        lines = [l.strip() for l in page.get_text().split(chr(10))]
        for i, ln in enumerate(lines):
            m = pat.match(ln)
            if not m or i + 1 >= len(lines):
                continue
            colour = lines[i + 1]
            if not re.match(COL + r"$", colour):
                continue
            ci = m.group(1)
            if ci in seen:
                continue
            seen.add(ci)
            # 往后最多看 8 行:X 标记与限制文字,遇到下一个 CI 号就停
            tail = []
            for l2 in lines[i + 2:i + 10]:
                if pat.match(l2):
                    break
                if l2 and l2 != "X":
                    tail.append(l2)
            lim = colour + (" · " + " ".join(tail) if tail else "")
            out.append({"num": num, "kind": kind, "ref": ci, "name": f"CI {ci}", "cas": "", "ci": ci, "limit": lim[:400]})
    return out


parse_pdf.last_idx = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    rows = []
    for num, fn, kind in FILES:
        p = os.path.join(a.dir, fn)
        if not os.path.exists(p) or os.path.getsize(p) < 10_000:
            print(f"  附录 {num}: 没有文件 {fn},跳过")
            continue
        got = parse_pdf(p, num, kind)
        if num == "IV" and len(got) < 20:
            # 附录 IV 的 CI 列被 find_tables 整列并成一个格(实测只出 1 条);改按页面文本认「5 位 CI 号 + 颜色」
            got = parse_iv_text(p, num, kind)
        print(f"  附录 {num} {kind}: {len(got)} 条 · 例 {got[0]['ref'] if got else '-'} {got[0]['name'][:40] if got else ''} | {got[0]['cas'] if got else ''}")
        rows += got
    print(f"共 {len(rows):,} 条")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for x in rows:
        note = f"附录 {x['num']} {x['kind']} · Ref {x['ref']}" + (f" · CI {x['ci']}" if x["ci"] else "") + (f" · {x['limit'][:400]}" if x["limit"] else "")
        # inci_catalog.no 是主键、跨目录唯一:欧盟附录已经占了「II/1」这种写法,东盟必须带前缀,否则整批 SQLITE_CONSTRAINT_PRIMARYKEY
        vals.append("(" + ",".join([q(f"ASEAN-{x['num']}/{x['ref']}"), q(x["name"][:300]), "NULL", "NULL", "NULL", "NULL",
                                    q(note[:600]), q(SRC), q(x["name"][:300].upper()), q(x["cas"][:120]), "NULL", q(REG)]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"UPDATE inci_registry SET status='live' WHERE id='{REG}';")
    for old in glob.glob(os.path.join(HERE, "_asean-annex-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_asean-annex-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f); buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_asean-annex-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · asean-acd 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
