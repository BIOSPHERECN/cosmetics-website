#!/usr/bin/env python3
"""补月访问量:data/brands/enrich/visits-done-*.json({id, visits_month, visits_period})→ brand_leads,只补非空。
    python tools/brand-visits-load.py --apply"""
import glob, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__)); DIR = os.path.join(os.path.dirname(HERE), "data", "brands", "enrich")
q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731


def main():
    lines, n = [], 0
    for f in sorted(glob.glob(os.path.join(DIR, "visits-done-*.json"))):
        try: arr = json.load(io.open(f, encoding="utf-8"))
        except Exception as e: print("坏文件", f, e); continue
        for x in arr:
            n += 1
            v = str(x.get("visits_month") or "").strip()
            if v and v.upper() != "NONE" and str(x.get("id", "")).isdigit():
                lines.append(f"UPDATE brand_leads SET visits_month = {q(v[:20])}, visits_period = {q(str(x.get('visits_period') or '2026-08')[:20])} WHERE id = {int(x['id'])} AND (visits_month IS NULL OR visits_month = '');")
    print("条目", n, "· 可补", len(lines))
    if "--apply" not in sys.argv or not lines: return
    f = os.path.join(HERE, "_visits.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("写入", d1_exec(f), "· 有流量", d1("SELECT COUNT(*) n FROM brand_leads WHERE visits_month <> ''")[0]["n"])


if __name__ == "__main__":
    main()
