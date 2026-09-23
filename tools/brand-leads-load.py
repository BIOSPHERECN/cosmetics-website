#!/usr/bin/env python3
"""全球化妆品品牌目标清单 —— data/brands/*.json(子代理调研,每条带 sources)→ D1 brand_leads。只写公开事实,不估算。
    python tools/brand-leads-load.py --apply"""
import glob, html, io, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
HERE = os.path.dirname(os.path.abspath(__file__)); DIR = os.path.join(os.path.dirname(HERE), "data", "brands")
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
F = ["name", "country", "hq_city", "website", "parent", "listed", "founded", "category", "positioning", "revenue", "traffic", "contact", "executives", "manufacturing", "why_target"]
# 创始人 2026-09-11:国家只留简称,不带括号注释;英文→中文在装载时直接定死,不靠翻译
CN = {"united states": "美国", "usa": "美国", "united kingdom": "英国", "uk": "英国", "france": "法国", "germany": "德国", "japan": "日本", "south korea": "韩国", "korea": "韩国", "china": "中国", "taiwan": "中国台湾", "hong kong": "中国香港",
      "indonesia": "印度尼西亚", "thailand": "泰国", "vietnam": "越南", "philippines": "菲律宾", "malaysia": "马来西亚", "singapore": "新加坡", "india": "印度", "pakistan": "巴基斯坦", "brazil": "巴西", "mexico": "墨西哥", "argentina": "阿根廷",
      "colombia": "哥伦比亚", "chile": "智利", "peru": "秘鲁", "canada": "加拿大", "australia": "澳大利亚", "new zealand": "新西兰", "italy": "意大利", "spain": "西班牙", "netherlands": "荷兰", "sweden": "瑞典", "denmark": "丹麦", "finland": "芬兰",
      "norway": "挪威", "poland": "波兰", "austria": "奥地利", "switzerland": "瑞士", "ireland": "爱尔兰", "belgium": "比利时", "portugal": "葡萄牙", "turkey": "土耳其", "türkiye": "土耳其", "russia": "俄罗斯", "belarus": "白俄罗斯", "ukraine": "乌克兰",
      "israel": "以色列", "united arab emirates": "阿联酋", "uae": "阿联酋", "saudi arabia": "沙特阿拉伯", "egypt": "埃及", "lebanon": "黎巴嫩", "morocco": "摩洛哥", "nigeria": "尼日利亚", "kenya": "肯尼亚", "south africa": "南非", "ghana": "加纳", "greece": "希腊", "czech republic": "捷克", "hungary": "匈牙利", "romania": "罗马尼亚"}


def short_country(v):
    v = re.split(r"[(（;；/,，]", str(v or ""))[0].strip()
    return v, CN.get(v.lower(), "")


def main():
    rows, seen = [], set()
    ex = os.path.join(DIR, "_exclude.txt")  # 创始人点名剔除的品牌,不再回灌
    skip = {re.sub(r"[^a-z0-9]", "", l.strip().lower()) for l in io.open(ex, encoding="utf-8") if l.strip() and not l.startswith("#")} if os.path.exists(ex) else set()
    for f in sorted(glob.glob(os.path.join(DIR, "batch*.json"))):
        for b in json.load(io.open(f, encoding="utf-8")).get("brands", []):
            n = html.unescape(str(b.get("name") or "")).strip()
            if not n or n.lower() in seen or not b.get("website") or re.sub(r"[^a-z0-9]", "", n.lower()) in skip: continue
            seen.add(n.lower()); rows.append(b)
    print("品牌", len(rows))
    if "--apply" not in sys.argv: return
    d1("CREATE TABLE IF NOT EXISTS brand_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, " + ", ".join(f"{k} TEXT" for k in F) + ", sources_json TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))")
    if "country_zh" not in [c["name"] for c in d1("PRAGMA table_info(brand_leads)")]: d1("ALTER TABLE brand_leads ADD COLUMN country_zh TEXT")
    # 按品牌名 upsert(不清表):风格调研并进来的行与 Agnes 译好的 *_zh 列要保留;同名只更新调研字段
    have = {re.sub(r"[^a-z0-9]", "", str(r["name"]).lower()): r["id"] for r in d1("SELECT id, name FROM brand_leads")}
    lines = []
    for b in rows:
        vals = {k: html.unescape(str(b.get(k) or "")).strip()[:600] for k in F}
        vals["country"], zh = short_country(vals["country"])
        if zh: vals["country_zh"] = zh
        vals["sources_json"] = json.dumps(b.get("sources") or [], ensure_ascii=False)[:2000]
        key = re.sub(r"[^a-z0-9]", "", vals["name"].lower())
        if key in have:
            sets = ", ".join(f"{k} = {q(v)}" for k, v in vals.items() if k != "name" and v)
            lines.append(f"UPDATE brand_leads SET {sets}, updated_at = datetime('now') WHERE id = {have[key]};")
        else:
            lines.append(f"INSERT INTO brand_leads ({', '.join(vals)}) VALUES ({', '.join(q(v) for v in vals.values())});")
    f = os.path.join(HERE, "_brand-leads.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("写入", d1_exec(f), "行 · 库里", d1("SELECT COUNT(*) n FROM brand_leads")[0]["n"])


if __name__ == "__main__":
    main()
