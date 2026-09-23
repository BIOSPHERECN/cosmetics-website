#!/usr/bin/env python3
"""古方候选库 → D1 classics(前台 /classics/ 版块)。来源:F:/0book/数据导出/古方_2026-09-10/古方库_化妆品适用候选_2026-09-10.xlsx
四张表进库并打级:抽检确认可用(tier=confirmed,6 方)/ v2 A·B 主候选(tier=primary,75)/ 外用美容方无禁用(tier=candidate,525)
/ 本草附方外用(tier=candidate)/ 含铅汞砒禁用(tier=research,442 —— 只标「仅供研究」,不给组成)。
红线:不写剂量与煎服法(组成只列药味);禁用组分方不列组成;全部带「古籍记载,非功效宣称」。
    python tools/classics-load.py --apply"""
import io, json, os, re, sys, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
D = r"F:/0book/数据导出/古方_2026-09-10/"; HERE = os.path.dirname(os.path.abspath(__file__))
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
NUM = "一二三四五六七八九十百千半兩两〇零壹貳叁肆伍陸柒捌玖拾"; UNIT = "两兩钱錢分斤升合勺盏盞枚个個只隻片撮字銖铢斗石觔厘釐毫方寸匕"
ORPHAN = "钱錢两兩盏盞銖铢撮個个枚隻只"; DELIM = r"[、,,;;。 ]"
JUNK = {"以水", "水", "切", "为末", "為末", "研末", "研细", "各", "共", "同", "煎", "煎汤", "煎湯", "洗", "用"}
def strip_dose(s):
    """只列药味不列剂量与煎服法:简繁数字与单位都砍;孤儿单位(各錢/樟腦錢)砍;用/以水/切/为末这类做法词砍。
    合/升/分/片不当孤儿单位处理 —— 会撞百合、升麻、分心木、片姜黄。2026-09-11 玉容散「麻兩錢」漏网后重写。"""
    s = re.sub(rf"(?:各)?[{NUM}]+[{UNIT}](?:[{NUM}]+[{UNIT}]?)?", "", str(s or ""))
    s = re.sub(rf"各?[{ORPHAN}]+(?={DELIM}|$)", "", s); s = re.sub(rf"各(?={DELIM}|$)", "", s)
    s = re.sub(r"各等分|等分|各半|各少许|少许|适量|適量", "", s)
    out = []
    for t in [x.strip() for x in re.split(DELIM + "+", s)]:
        t = re.sub(r"^(點方用|点方用|方用|用|以|入|加|方加|再加|又加|同|共)", "", t); t = re.sub(r"(?<=.{2})[切碎末研洗炒炙焙煅淬]+$", "", t)
        if t and t not in JUNK and len(t) >= 2: out.append(t)
    return "、".join(dict.fromkeys(out))



def rows_of(ws):
    rs = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
    hdr = [str(c).strip() if c else "" for c in rs[0]]
    return [{hdr[i]: (str(r[i]).strip() if i < len(r) and r[i] is not None else "") for i in range(len(hdr))} for r in rs[1:]]


def main():
    wb = openpyxl.load_workbook(D + "古方库_化妆品适用候选_2026-09-10.xlsx", read_only=True, data_only=True)
    sheets = {ws.title: ws for ws in wb.worksheets}
    confirmed = {r["方名"]: r for r in rows_of(sheets["抽检确认可用"])}
    primary = {}
    for f in ("v2_A.jsonl", "v2_B.jsonl"):
        for l in io.open(D + f, encoding="utf-8"):
            if l.strip():
                j = json.loads(l); primary[j["name"]] = j["grade"]
    out, seen = [], set()
    def add(r, tier, research=False):
        name = r.get("方名", "").strip()
        if not name or name in seen or name == "—": return
        seen.add(name)
        comp = "" if research else strip_dose(r.get("组成", ""))[:400]
        purp = r.get("用途标签", "")
        try: purp = " · ".join(json.loads(purp.replace("'", '"')).keys()) if purp.startswith("{") else purp
        except Exception: purp = re.sub(r"[{}\[\]'\"]", "", purp)[:80]
        c = confirmed.get(name)
        out.append({"name": name, "book": r.get("出处(书)", "") or (c or {}).get("出处", ""), "grade": r.get("等级", "") or primary.get(name, ""), "tier": "confirmed" if c else ("primary" if name in primary else tier),
                    "purposes": purp[:120], "form": re.sub(r"[\[\]'\"]", "", r.get("剂型/名称命中", ""))[:60], "composition": comp, "indication": (r.get("主治", "") or "")[:300],
                    "modern": (c or {}).get("最像今天哪类产品", "") or "", "note": (c or {}).get("备注", "") or (("含铅汞砒等禁用组分,仅供研究,不可复刻") if research else ""), "toxic": r.get("毒性成分", "") if research else ""})
    for r in rows_of(sheets["候选_外用美容方_无禁用成分"]): add(r, "candidate")
    for r in rows_of(sheets["本草附方_外用_无禁用成分"]): add(r, "candidate")
    for r in rows_of(sheets["含铅汞砒等禁用成分_仅供研究"]): add(r, "research", research=True)
    for n, c in confirmed.items():
        if n not in seen and n != "—" and "/" not in n:
            add({"方名": n, "出处(书)": c.get("出处", ""), "用途标签": c.get("用途", ""), "组成": c.get("组成要点(原文)", "")}, "confirmed")
    import collections
    print("共", len(out), collections.Counter(x["tier"] for x in out))
    if "--apply" not in sys.argv: return
    d1("CREATE TABLE IF NOT EXISTS classics (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, book TEXT, grade TEXT, tier TEXT, purposes TEXT, form TEXT, composition TEXT, indication TEXT, modern TEXT, note TEXT, toxic TEXT, ok INTEGER DEFAULT 0)")
    lines = ["DELETE FROM classics;"]
    for x in out:
        lines.append("INSERT INTO classics (name, book, grade, tier, purposes, form, composition, indication, modern, note, toxic) VALUES (" + ",".join(q(x[k]) for k in ("name", "book", "grade", "tier", "purposes", "form", "composition", "indication", "modern", "note", "toxic")) + ");")
    f = os.path.join(HERE, "_classics.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    # ok=1 = 可建单页(抽检确认 + v2 主候选,人工核过);候选表噪音多,只进列表不建单页
    d1("UPDATE classics SET ok = CASE WHEN tier IN ('confirmed','primary') THEN 1 ELSE 0 END")
    print("写入", d1_exec(f), "· 库里", d1("SELECT tier, COUNT(*) n FROM classics GROUP BY tier"))


if __name__ == "__main__":
    main()
