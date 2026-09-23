#!/usr/bin/env python3
"""巴西 ANVISA 化妆品原料清单 —— 从可达的第三方转录页解析进 inci_catalog(br-anvisa)。

官方站(gov.br 全域、in.gov.br 公报、anvisalegis 的 Cloudflare 人机挑战)对本机全部不可达;
创始人 2026-09-10「你要去调用第三方的,他们都帮你收集了」。巴西的清单就是 MERCOSUR 决议的内化本,
下面四份转录页条数与结构都对得上原文,来源在站上写明,以 ANVISA / DOU 原文为准。

四张表(文件在 data/registries/):
    禁用   br-anvisa_RDC-83-2016_proibidas_legisweb.html      LegisWeb 全开的 RDC 83/2016 附件(= GMC 62/14),1,376 项,
                                                              列:Nº / Nº UE(欧盟附录 II 序号)/ SUBSTÂNCIA / CAS / EINECS。
                                                              现行 RDC 529/2021 = 本表 + GMC 37/20 新增 8 项(异丙/异丁/苯基/苄基/戊基对羟基苯甲酸酯、
                                                              季铵盐-15、氯乙酰胺、氯苯酚),那 8 项按 ANVISA 公告单独补行,CAS 从本库欧盟条目取。
    限用   br-anvisa_RDC-530-2021_restritas_cosmetoguia.html  Cosmetoguia 转录的 RDC 530/2021:附件 I 限用 105 项(一项多行,续行序号空)+
                                                              附件 II 须标注的 26 种香精致敏原。
    防腐剂 br-anvisa_RDC-528-2021_conservantes_cosmetoguia.html Cosmetoguia 转录的 RDC 528/2021,60 项,带 INCI 与 CAS。
    防晒剂 br-anvisa_RDC-600-2022_filtrosUV_cosmetoguia.html   Cosmetoguia 转录的 RDC 600/2022(= GMC 44/15 + 14/21),36 项。
着色剂 RDC 628/2022(= GMC 16/12)只找到扫描件 PDF(巴拉圭商会转载,无文字层),本机无 OCR,先不进库,注明。

主键 `BR-{决议}/{序号}`,避免撞其他目录(inci_catalog.no 跨目录唯一)。

用法:
    python tools/br-anvisa-crawl.py            体检
    python tools/br-anvisa-crawl.py --apply    写库
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
REG = "br-anvisa"
SRC_PROIB = "RDC 83/2016 anexo (GMC 62/14), transcrição LegisWeb; RDC 529/2021 = esta lista + 8 itens da GMC 37/20 · ANVISA"
SRC_529 = "RDC 529/2021 (GMC 37/20) itens adicionados, conforme comunicado ANVISA 2021-08; CAS do registro CosIng homônimo · ANVISA"
SRC_530 = "RDC 530/2021 (GMC 24/11 + 37/20), transcrição Cosmetoguia · ANVISA"
SRC_528 = "RDC 528/2021 (GMC 35/20), transcrição Cosmetoguia · ANVISA"
SRC_600 = "RDC 600/2022 (GMC 44/15 + 14/21), transcrição Cosmetoguia · ANVISA"
ADD_529 = [  # GMC 37/20 加进禁用表的 8 项(ANVISA 2021-08-11 公告)
    ("Isopropilparabeno", "ISOPROPYLPARABEN"), ("Isobutilparabeno", "ISOBUTYLPARABEN"), ("Fenilparabeno", "PHENYLPARABEN"),
    ("Benzilparabeno", "BENZYLPARABEN"), ("Pentilparabeno", "PENTYLPARABEN"), ("Quaternium-15", "QUATERNIUM-15"),
    ("Cloroacetamida", "CHLOROACETAMIDE"), ("Clorofeno", "CHLOROPHENE"),
]
CAS_RE = re.compile(r"\b\d{2,7}-\d{2}-\d\b")


def cell(x: str) -> str:
    x = re.sub(r"<br\s*/?>", " ", x)
    x = htmlmod.unescape(re.sub(r"<[^>]+>", " ", x))
    return re.sub(r"\s+", " ", x).strip()


def tables(path: str):
    """按 <table> 分组取行(Cosmetoguia 页不嵌套,530 靠分组认附件 II)。"""
    h = io.open(path, encoding="utf-8", errors="replace").read()
    out = []
    for tb in re.findall(r"<table.*?</table>", h, re.S):
        out.append([[cell(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", tb, re.S)])
    return out


def all_rows(path: str):
    """整页所有 <tr>,不管属于哪张表。LegisWeb 把附件表嵌在版式表的一个单元格里,
    内层表关掉后外层还有六百多行,按 <table> 切会丢一半;数据行靠「首格是序号」认。"""
    h = io.open(path, encoding="utf-8", errors="replace").read()
    return [[cell(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", h, re.S)]


def key_of(s: str) -> str:
    k = re.sub(r"[（(][^）)]*[）)]", " ", (s or "").upper())
    # 「e seus sais / and its salts」尾巴不进 key,原料页按 INCI 精确对账才命中
    k = re.sub(r"\s+(?:E|AND)\s+(?:SEUS|ITS|THEIR)?\s*(?:SAIS|SALTS?|ÉSTERES|ESTERES|ESTERS?)(?:\s+(?:E|AND)\s+(?:SEUS\s+|ITS\s+)?(?:SAIS|SALTS?|ÉSTERES|ESTERES|ESTERS?))?\s*$", "", k)
    return re.sub(r"[^A-Z0-9]+", " ", k).strip()[:300]


def inci_in(s: str) -> str:
    """从「葡文名 [INCI 大写]」里抽 INCI:取最长的一段连续大写词(≥2 词或 ≥6 字符)。"""
    cands = re.findall(r"\b[A-Z][A-Z0-9/\-,'()]+(?:\s+[A-Z][A-Z0-9/\-,'()]+)*", s)
    cands = [c.strip().strip("()[]/,-'") for c in cands if len(c) >= 6 and not CAS_RE.search(c)]
    return max(cands, key=len) if cands else ""


def parse_proibidas(path: str):
    rows = all_rows(path)
    out = []
    for cs in rows:
        if len(cs) < 4 or not re.match(r"^\d+\s?[A-Za-z]?$", cs[0]):
            continue
        cs[0] = cs[0].replace(" ", "")
        cas = next((c for c in cs[3:] if CAS_RE.search(c)), "")
        ec = next((c for c in cs[3:] if re.match(r"^\d{3}-\d{3}-\d$", c)), "")
        eu = cs[1] if cs[1] and cs[1] != "-" else ""
        note = f"禁用 · RDC 83/2016 附件第 {cs[0]} 项(GMC 62/14)" + (f" · 欧盟附录 II 序号 {eu}" if eu else "") + (f" · EC {ec}" if ec else "")
        out.append({"no": f"BR-83/{cs[0]}", "name": cs[2], "inci": cs[2], "cas": cas if cas != "-" else "", "ec": ec, "alias": eu, "note": note, "src": SRC_PROIB})
    return out


def parse_529_additions():
    out = []
    for pt, inci in ADD_529:
        hit = d1("SELECT cas, ec_no FROM inci_catalog WHERE registry IN ('eu-cosing','eu-annex') AND inci_key = '" + key_of(inci) + "' AND cas IS NOT NULL LIMIT 1")
        cas, ec = (hit[0]["cas"], hit[0]["ec_no"]) if hit else ("", "")
        out.append({"no": f"BR-529/+{len(out) + 1}", "name": pt, "inci": inci, "cas": cas or "", "ec": ec or "", "alias": "",
                    "note": "禁用 · RDC 529/2021 新增(GMC 37/20)· 据 ANVISA 2021-08 公告" + (" · CAS 取自欧盟同名条目" if cas else ""), "src": SRC_529})
    return out


def parse_530(path: str):
    tabs = tables(path)
    out, cur = [], None
    for rows in tabs:
        if not rows:
            continue
        head = " ".join(rows[0]).upper()
        if "INCI" in head and len(rows[0]) == 3 and "RESTRI" not in head:
            # 附件 II:香精致敏原 [序, 物质, INCI]
            for cs in rows[1:]:
                if len(cs) >= 3 and re.match(r"^\d+\.?$", cs[0]):
                    n = cs[0].rstrip(".")
                    cas = CAS_RE.search(cs[1]); cas = cas.group(0) if cas else ""
                    out.append({"no": f"BR-530/II-{n}", "name": re.sub(r"\s*\(CAS[^)]*\)", "", cs[1]).strip(), "inci": cs[2], "cas": cas, "ec": "", "alias": "",
                                "note": f"香精致敏原 · RDC 530/2021 附件 II 第 {n} 项 · 驻留型 >0.001%、淋洗型 >0.01% 须在标签标注", "src": SRC_530})
            continue
        # 附件 I:[序, 物质(+INCI), 适用范围, 最大浓度, 其他限制, 使用条件/警示]
        for cs in rows:
            if len(cs) < 4:
                continue
            j = " ".join(cs).upper()
            if "ORDEM" in j or "[NOME INCI]" in j or cs[:6] == ["a", "b", "c", "d", "e", "f"]:
                continue
            g = lambda i: cs[i] if i < len(cs) else ""  # noqa: E731
            if re.match(r"^\d+[a-z]?$", cs[0]):
                cur = {"no": cs[0], "name": g(1), "scope": g(2), "conc": g(3), "other": g(4), "cond": g(5)}
                out.append(cur)
            elif cur is not None and any(cs):
                for k, i in (("name", 1), ("scope", 2), ("conc", 3), ("other", 4), ("cond", 5)):
                    if g(i):
                        cur[k] = (cur[k] + " " + g(i)).strip()
    fin = []
    for x in out:
        if "scope" not in x:
            fin.append(x); continue
        inci = inci_in(x["name"])
        cas = CAS_RE.search(x["name"] + " " + x["other"]); cas = cas.group(0) if cas else ""
        name = re.sub(r"\s*\[[^\]]*\]", "", x["name"]).strip()
        note = f"限用 · RDC 530/2021 附件 I 第 {x['no']} 项" + (f" · 适用 {x['scope'][:160]}" if x["scope"] else "") + (f" · 最大浓度 {x['conc'][:160]}" if x["conc"] else "") \
            + (f" · {x['other'][:140]}" if x["other"] else "") + (f" · 警示:{x['cond'][:120]}" if x["cond"] else "")
        fin.append({"no": f"BR-530/{x['no']}", "name": name, "inci": inci or name, "cas": cas, "ec": "", "alias": "", "note": note, "src": SRC_530})
    return fin


def parse_528(path: str):
    rows = all_rows(path)
    out = []
    for cs in rows:
        if len(cs) < 5 or not re.match(r"^\d+$", cs[0]):
            continue
        g = lambda i: cs[i] if i < len(cs) else ""  # noqa: E731
        note = f"准用防腐剂 · RDC 528/2021 第 {cs[0]} 项" + (f" · 最大浓度 {g(4)[:200]}" if g(4) else "") + (f" · {g(5)[:140]}" if g(5) else "") + (f" · 警示:{g(6)[:120]}" if g(6) else "")
        # INCI 格里常是一串「a) SALICYLIC ACID b) CALCIUM SALICYLATE …」或「BENZOIC ACID/ SODIUM BENZOATE」,
        # inci_key 只取第一个(母体物质),原料页按 INCI 精确对账才命中;全串留在 inci 列
        first = next((p.strip() for p in re.split(r"\s*/\s*|\s*\b[a-z]\)\s*", g(2)) if p.strip()), "")
        out.append({"no": f"BR-528/{cs[0]}", "name": g(1), "inci": g(2) or g(1), "key": key_of(first) if first else "", "cas": g(3)[:120].replace("/ ", "/"), "ec": "", "alias": "", "note": note, "src": SRC_528})
    return out


def parse_600(path: str):
    rows = all_rows(path)
    out = []
    for cs in rows:
        if len(cs) < 3 or not re.match(r"^\d+$", cs[0]):
            continue
        g = lambda i: cs[i] if i < len(cs) else ""  # noqa: E731
        inci = inci_in(g(1))
        note = f"准用防晒剂 · RDC 600/2022 第 {cs[0]} 项" + (f" · 最大浓度 {g(2)[:120]}" if g(2) else "") + (f" · {g(3)[:200]}" if g(3) else "")
        out.append({"no": f"BR-600/{cs[0]}", "name": g(1), "inci": inci or g(1), "cas": "", "ec": "", "alias": "", "note": note, "src": SRC_600})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    parts = [
        ("禁用 RDC 83/2016", "br-anvisa_RDC-83-2016_proibidas_legisweb.html", parse_proibidas),
        ("限用+致敏原 RDC 530/2021", "br-anvisa_RDC-530-2021_restritas_cosmetoguia.html", parse_530),
        ("防腐剂 RDC 528/2021", "br-anvisa_RDC-528-2021_conservantes_cosmetoguia.html", parse_528),
        ("防晒剂 RDC 600/2022", "br-anvisa_RDC-600-2022_filtrosUV_cosmetoguia.html", parse_600),
    ]
    rows = []
    for label, fn, fn_parse in parts:
        p = os.path.join(a.dir, fn)
        if not os.path.exists(p):
            print(f"  {label}: 没有 {fn}"); continue
        got = fn_parse(p)
        ncas = sum(1 for x in got if x["cas"])
        print(f"  {label}: {len(got)} 条 · 带 CAS {ncas} · 例 {got[0]['no']} {got[0]['name'][:40]} | {got[0]['inci'][:30]} | {got[0]['cas']}")
        rows += got
    add = parse_529_additions()
    print(f"  禁用 RDC 529/2021 新增: {len(add)} 条 · 带 CAS {sum(1 for x in add if x['cas'])}")
    rows += add
    seen, dup = set(), []
    for x in rows:
        if x["no"] in seen: dup.append(x["no"])
        seen.add(x["no"])
    print(f"共 {len(rows):,} 条 · 重复主键 {dup[:5]}")
    for x in rows:
        if x["no"] in ("BR-530/1a", "BR-530/68", "BR-530/105", "BR-530/II-1", "BR-83/1376"):
            print("   ", x["no"], "|", x["name"][:50], "|", x["inci"][:30], "|", x["cas"], "|", x["note"][:150])
    if not a.apply:
        print("\n加 --apply 才写库"); return
    if dup:
        print("有重复主键,不写库"); return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = ["(" + ",".join([q(x["no"]), q(x["name"][:300]), q(x["inci"][:300]), q(x["alias"][:120]), "NULL", "NULL", q(x["note"][:600]),
                            q(x["src"]), q(x.get("key") or key_of(x["inci"] or x["name"])), q(x["cas"][:120]), q(x["ec"][:40]), q(REG)]) + ")" for x in rows]
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES " + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"UPDATE inci_registry SET status='live', "
                 f"note_zh = note_zh || ' 本站数据整理自第三方转录(LegisWeb、Cosmetoguia):禁用表为 RDC 83/2016 附件加 RDC 529/2021 新增 8 项,限用 / 致敏原为 RDC 530/2021,防腐剂 RDC 528/2021,防晒剂 RDC 600/2022;着色剂表(RDC 628/2022)只找到扫描件,尚未收录。条文以 ANVISA / DOU 原文为准。', "
                 f"note_en = COALESCE(note_en,'') || ' Transcribed from third-party legal databases (LegisWeb, Cosmetoguia): prohibited list = RDC 83/2016 annex plus the 8 substances added by RDC 529/2021; restricted list and fragrance allergens from RDC 530/2021; preservatives RDC 528/2021; UV filters RDC 600/2022. The colorant list (RDC 628/2022) is not yet included (scanned copies only). The ANVISA / DOU text prevails.' "
                 f"WHERE id='{REG}';")
    for old in glob.glob(os.path.join(HERE, "_br-anvisa-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1; f = os.path.join(HERE, f"_br-anvisa-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n"); total += d1_exec(f); buf = []
    if buf:
        part += 1; f = os.path.join(HERE, f"_br-anvisa-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n"); total += d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · br-anvisa 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
