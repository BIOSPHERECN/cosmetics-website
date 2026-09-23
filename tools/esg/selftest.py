# -*- coding: utf-8 -*-
"""ESG 闸门只读自检(任务 G):取 formula_versions 最新一版 recipe_json,与 esg_rules 的 key / tag 类规则在本地比一遍,
打印前 10 条命中供主线与线上 esgCheck 结果对照。不写库、不调 HTTP。用法:python tools/esg/selftest.py [version_id]"""
import json, re, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _bohui import d1

def fact_key(s):   # 与 lib/decoder.ts factKey 同口径:去括号、大写、空白压一格、去首尾句点
    s = re.sub(r"[（(][^）)]*[）)]", " ", s or "")
    return re.sub(r"\s+", " ", s.upper()).strip(" .")

vid = sys.argv[1] if len(sys.argv) > 1 else None
where = f"WHERE id={int(vid)}" if vid else ""
ver = d1(f"SELECT id, project_id, version_no, recipe_json, esg_json FROM formula_versions {where} ORDER BY rowid DESC LIMIT 1")
if not ver: sys.exit("没有版本行")
v = ver[0]
rows = json.loads(v.get("recipe_json") or "[]")
proj = d1(f"SELECT format, markets, constraints_json FROM formula_projects WHERE id={v['project_id']}")
print(f"版本 #{v['id']} v{v['version_no']} 项目 {v['project_id']} 剂型/市场 {proj[0]['format'] if proj else '?'} / {proj[0]['markets'] if proj else '?'} 行数 {len(rows)}")
rules = d1("SELECT id, pillar, scope, applies, match_type, pattern, severity, title_zh, basis FROM esg_rules WHERE active=1 AND match_type IN ('key','tag','prefix','contains') ORDER BY rowid LIMIT 200")
print(f"esg_rules key/tag/prefix/contains 规则 {len(rules)} 条")
keys = sorted({fact_key(r.get("inci") or r.get("name") or "") for r in rows} - {""})
tags = {}
if keys:
    ins = ",".join("'" + k.replace("'", "''") + "'" for k in keys)
    for f in d1(f"SELECT inci_key, tags FROM ingredient_facts WHERE inci_key IN ({ins})"):
        tags[f["inci_key"]] = json.loads(f.get("tags") or "[]")
hits = []
for r in rows:
    k = fact_key(r.get("inci") or r.get("name") or "")
    for ru in rules:
        p, t = (ru["pattern"] or "").strip(), ru["match_type"]
        ok = (t == "key" and fact_key(p) == k) or (t == "prefix" and k.startswith(p.upper())) or (t == "contains" and p.upper() in k) or (t == "tag" and p in tags.get(k, []))
        if ok: hits.append((r.get("seq"), k, r.get("pct"), ru["pillar"], ru["severity"], ru["id"], ru["title_zh"], ru["basis"]))
print(f"本地命中 {len(hits)} 条(前 10):")
for h in hits[:10]: print("  ", " | ".join(str(x) for x in h))
e = json.loads(v.get("esg_json") or "null")
print("线上 esg_json:", "无" if not e else f"pass={e.get('pass')} hits={len(e.get('hits', []))} pillars={ {k: p.get('status') for k, p in (e.get('pillars') or {}).items()} }")
