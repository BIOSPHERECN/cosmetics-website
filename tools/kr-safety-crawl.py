#!/usr/bin/env python3
"""韩国《化妆品安全基准等相关规定》附录 1(禁用)/ 附录 2(限用)—— 从 MFDS 官方英文版 PDF 解析进 inci_catalog(kr-safety)。

来源(2026-09-10 检索所得):大韩化妆品协会(helpcosmetic.or.kr)挂的 MFDS 官方英文译本,
Notification No. 2023-73(2023-11-30 施行):
    http://helpcosmetic.or.kr/admin/bbs/down.php?code=country&idx=5892&no=2   Appendix 1 Ingredients that cannot be used(41 页)
    http://helpcosmetic.or.kr/admin/bbs/down.php?code=country&idx=5892&no=3   Appendix 2 Ingredients that require restrictions on use(22 页)
MFDS 自己的英文站只有目录页、law.go.kr / elaw 都是 frame 套会话拿不到正文 —— 创始人 23:3x:
「你要去调用第三方的,他们都帮你收集了」。协会站是行业官方组织,文件是 MFDS 的译本原件,来源写清楚。

表结构(实测):首行空表头,第二行才是列名 ——
    附录 1:Ingredient Name / CAS No. / Chemical name
    附录 2:Ingredients / Usage limit / Note / CAS No. / Chemical name,分段「* Preservative」「* UV」「* Other」「Hair dye」
按列名认列,不按位置;一条被换页切成两行时(名字空、CAS 空、只有续文)并回上一条。

用法:
    python tools/kr-safety-crawl.py            体检(PDF 在 data/registries/kr-safety_*.pdf,或 --dir)
    python tools/kr-safety-crawl.py --apply    写库
"""
import argparse
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "kr-safety"
SRC = "Regulation on the Safety Standards, etc. of Cosmetics (MFDS Notification 2023-73), English version hosted by Korea Cosmetic Association"
FILES = [("1", "kr-safety_MFDS-2023-73_Appendix1_prohibited_EN.pdf", "禁用"), ("2", "kr-safety_MFDS-2023-73_Appendix2_restricted_EN.pdf", "限用")]
SECTIONS = [("* Preservative", "防腐剂"), ("* UV", "紫外线过滤剂"), ("* Other", "其他限用"), ("Hair dye", "染发剂")]


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def header_index(rows):
    """找到含 CAS 的那一行当表头,返回 (表头行号, 列位)。"""
    for i, r in enumerate(rows[:3]):
        cells = [norm(c).lower() for c in r]
        if any("cas" in c for c in cells):
            idx = {}
            for j, c in enumerate(cells):
                if "cas" in c:
                    idx["cas"] = j
                elif "ingredient" in c:
                    idx["name"] = j
                elif "usage" in c or "limit" in c:
                    idx["limit"] = j
                elif c.startswith("note"):
                    idx["note"] = j
                elif "chemical" in c:
                    idx["chem"] = j
            return i, idx
    return -1, {}


def parse(path: str, app: str, kind: str):
    import fitz
    d = fitz.open(path)
    out, last, idx = [], None, {}
    section = ""
    for pno in range(len(d)):
        page = d[pno]
        txt = page.get_text()
        for mark, label in SECTIONS:
            if mark in txt:
                section = label
        try:
            tabs = page.find_tables()
        except Exception:
            continue
        for tb in (tabs.tables if hasattr(tabs, "tables") else tabs):
            rows = tb.extract()
            if not rows:
                continue
            hi, found = header_index(rows)
            if found:
                idx = found
            body = rows[hi + 1:] if hi >= 0 else rows
            if "name" not in idx:
                continue
            for r in body:
                cells = [norm(c) for c in r]
                g = lambda k: cells[idx[k]] if k in idx and idx[k] < len(cells) else ""  # noqa: E731
                name, cas, chem, lim, note = g("name"), g("cas"), g("chem"), g("limit"), g("note")
                if not any(cells):
                    continue
                if not name:
                    # 换页续行:并回上一条
                    if last is not None and (chem or lim or note):
                        if chem:
                            last["chem"] = norm(last["chem"] + " " + chem)
                        if lim:
                            last["limit"] = norm(last["limit"] + " " + lim)
                        if note:
                            last["note"] = norm(last["note"] + " " + note)
                    continue
                if name.lower().startswith("ingredient"):
                    continue
                last = {"app": app, "kind": kind, "section": section if app == "2" else "",
                        "name": name, "cas": cas, "chem": chem, "limit": lim, "note": note}
                out.append(last)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = []
    for app, fn, kind in FILES:
        p = os.path.join(a.dir, fn)
        if not os.path.exists(p):
            print(f"  附录 {app}: 没有 {fn}")
            continue
        got = parse(p, app, kind)
        from collections import Counter
        print(f"  附录 {app} {kind}: {len(got)} 条 · 分段 {Counter(x['section'] for x in got).most_common()} · 例 {got[0]['name'][:40] if got else '-'} | {got[0]['cas'] if got else ''}")
        rows += got
    print(f"共 {len(rows)} 条")
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for i, x in enumerate(rows, 1):
        note = f"附录 {x['app']} {x['kind']}" + (f" · {x['section']}" if x["section"] else "")
        if x["limit"]:
            note += f" · 限量 {x['limit'][:200]}"
        if x["note"]:
            note += f" · {x['note'][:200]}"
        if x["chem"]:
            note += f" · 化学名 {x['chem'][:120]}"
        # inci_key 去掉「and its salts / esters」尾巴,原料页按 INCI 精确对账才命中(水杨酸 = "Salicylic acid and its salts")
        key = re.sub(r"[（(][^）)]*[）)]", " ", x["name"].upper())
        key = re.sub(r"\s+AND\s+(?:ITS|THEIR)?\s*(?:SALTS?|ESTERS?|DERIVATIVES?)(?:\s+AND\s+(?:ITS\s+)?(?:SALTS?|ESTERS?))?\s*$", "", key)
        key = re.sub(r"[^A-Z0-9]+", " ", key).strip()[:300]
        vals.append("(" + ",".join([q(f"KR-{x['app']}/{i}"), q(x["name"][:300]), q(x["name"][:300]), "NULL", "NULL", "NULL",
                                    q(note[:600]), q(SRC), q(key), q(x["cas"][:120]), "NULL", q(REG)]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"UPDATE inci_registry SET status='live', official_url='http://helpcosmetic.or.kr/admin/bbs/down.php?code=country&idx=5892&no=2', "
                 f"note_zh=note_zh || ' 数据取自 MFDS 官方英文译本(大韩化妆品协会站点转载),原文以 MFDS 韩文告示为准。' WHERE id='{REG}';")
    f = os.path.join(HERE, "_kr-safety.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    total = d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · kr-safety 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
