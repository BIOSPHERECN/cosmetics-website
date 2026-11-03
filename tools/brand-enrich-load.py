#!/usr/bin/env python3
"""品牌线索第三方多维补充 —— data/brands/enrich/done-*.json(子代理逐家查 Similarweb 流量、生产模式、渠道、
第三方视角分析与合作角度)→ brand_leads 新列。创始人 2026-09-11 17:0x:「要有官网月访问量等多维数据;
是否本土生产或 OEM/ODM 要深入调研;先用第三方角度专业分析,别和帛卉结合」。
    python tools/brand-enrich-load.py --apply
2026-09-24 拍板默认 #20 / WP-01:Similarweb 停用 —— 流量、排名、跳出率等 Similarweb 字段不再入库(存量不计分),
只写生产模式、渠道、价位、分析这些。旧版存档:助手交付/AI获客/停用代码-20260924/brand-enrich-load.py.txt"""
import glob, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__)); DIR = os.path.join(os.path.dirname(HERE), "data", "brands", "enrich")
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
F = ["mfg_model", "mfg_country", "mfg_evidence", "channels", "price_tier", "funding", "analysis", "coop_angles"]
MODEL = {"in-house": "in-house", "inhouse": "in-house", "own": "in-house", "contract": "contract", "oem": "contract", "odm": "contract", "hybrid": "hybrid", "mixed": "hybrid"}
TIER = {"mass": "mass", "masstige": "masstige", "prestige": "prestige", "luxury": "luxury"}


def main():
    rows = {}
    for f in sorted(glob.glob(os.path.join(DIR, "done-*.json"))):
        try: arr = json.load(io.open(f, encoding="utf-8"))
        except Exception as e: print("坏文件", f, e); continue
        for x in (arr if isinstance(arr, list) else arr.get("brands", [])):
            if isinstance(x, dict) and str(x.get("id", "")).isdigit(): rows[int(x["id"])] = x
    print("补充", len(rows), "家")
    if "--apply" not in sys.argv: return
    lines = []
    for i, x in rows.items():
        v = {k: str(x.get(k) or "").strip()[:600] for k in F}
        v["mfg_model"] = MODEL.get(v["mfg_model"].lower().split()[0] if v["mfg_model"] else "", "unknown" if not v["mfg_model"] else v["mfg_model"][:20])
        v["price_tier"] = TIER.get(v["price_tier"].lower(), "")
        srcs = json.dumps(x.get("sources") or [], ensure_ascii=False)[:2000]
        sets = ", ".join(f"{k} = {q(val)}" for k, val in v.items())
        lines.append(f"UPDATE brand_leads SET {sets}, enrich_sources = {q(srcs)}, enriched_at = datetime('now') WHERE id = {i};")
    f = os.path.join(HERE, "_brand-enrich.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("写入", d1_exec(f), "· 已补充", d1("SELECT COUNT(*) n FROM brand_leads WHERE enriched_at IS NOT NULL")[0]["n"], "· 有流量", d1("SELECT COUNT(*) n FROM brand_leads WHERE visits_month IS NOT NULL AND visits_month <> ''")[0]["n"])


if __name__ == "__main__":
    main()
