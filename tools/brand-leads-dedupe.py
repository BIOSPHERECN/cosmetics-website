#!/usr/bin/env python3
"""brand_leads 按官网域名去重(子代理各批次偶有同一品牌两种写法:Ilia / Ilia Beauty、Necessaire / Nécessaire、Transino ×2)。
保留字段填得最多的一行,把另一行非空字段补进去,删掉重复行。    python tools/brand-leads-dedupe.py --apply"""
import io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__))
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
dom = lambda u: re.sub(r"^www\.", "", re.sub(r"^https?://", "", str(u or "").strip().lower())).split("/")[0]  # noqa: E731
import unicodedata
# 同域名但不同品牌很常见(集团官网挂多个牌子:Shiseido、Karmarts、Clio…),只有名字也对得上才算重复
def nkey(n):
    n = unicodedata.normalize("NFKD", str(n or "")).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"\(.*?\)", "", n)
    n = re.sub(r"(beauty|cosmetics|cosmetic|cosmetique|skincare|skin care)", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def main():
    rows = d1("SELECT * FROM brand_leads")
    groups = {}
    for r in rows:
        d = dom(r["website"])
        if d and "." in d: groups.setdefault(d, []).append(r)
    dups = {}
    for d, rs in groups.items():
        if len(rs) < 2: continue
        byname = {}
        for r in rs: byname.setdefault(nkey(r["name"]), []).append(r)
        for k, same in byname.items():
            if len(same) > 1: dups[f"{d} [{k}]"] = same
    lines = []
    for d, rs in dups.items():
        rs.sort(key=lambda r: (-sum(1 for v in r.values() if v not in (None, "")), r["id"]))
        keep, rest = rs[0], rs[1:]
        sets = {}
        for r in rest:
            for k, v in r.items():
                if k != "id" and v not in (None, "") and keep.get(k) in (None, ""): sets[k] = v
        print(f"{d}: 留 {keep['id']} {keep['name']} · 删 " + ", ".join(f"{r['id']} {r['name']}" for r in rest) + (f" · 补 {len(sets)} 字段" if sets else ""))
        if sets: lines.append(f"UPDATE brand_leads SET {', '.join(f'{k} = {q(v)}' for k, v in sets.items())} WHERE id = {keep['id']};")
        lines.append(f"DELETE FROM brand_leads WHERE id IN ({', '.join(str(r['id']) for r in rest)});")
    print("重复域名", len(dups))
    if "--apply" not in sys.argv or not lines: return
    f = os.path.join(HERE, "_dedupe.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("执行", d1_exec(f), "· 库里", d1("SELECT COUNT(*) n FROM brand_leads")[0]["n"])


if __name__ == "__main__":
    main()
