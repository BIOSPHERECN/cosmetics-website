#!/usr/bin/env python3
"""页面模板句 → 15 语(表 ui_i18n,按 ns + lang + key)。源句在 data/i18n/<ns>.en.json(英文),占位符 {market} {category} {n} … 原样保留。
免费舰队整包翻(一个 ns 一次调用,JSON 进 JSON 出),失败按 key 单句重试;src_hash 记源文指纹,变了才重翻。
用法:python tools/ui-i18n.py --ns oem,oem-index [--langs id,my,ar] [--force]"""
import argparse, hashlib, io, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, chat, fleet  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = {"zh-tw": "Traditional Chinese (Taiwan)", "jp": "Japanese", "kr": "Korean", "fr": "French", "de": "German", "ru": "Russian", "id": "Indonesian", "my": "Malay", "th": "Thai", "vn": "Vietnamese", "ph": "Filipino (Tagalog)", "es": "Spanish", "pt": "Portuguese (Brazil)", "ar": "Arabic (Modern Standard)", "tr": "Turkish", "in": "Hindi"}
ap = argparse.ArgumentParser(); ap.add_argument("--ns", default="oem,oem-index"); ap.add_argument("--langs", default="id,my,ar,vn,th,ph,jp,kr,fr,de,es,pt,tr,ru,in,zh-tw"); ap.add_argument("--force", action="store_true"); A = ap.parse_args()
q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
provs = [p for p in fleet() if p["id"].startswith(("agnes", "sensenova"))]
RULES = ("Translate the JSON values into {lang} for a B2B cosmetics manufacturer's website. Keep keys and structure. Keep placeholders like {{market}} {{category}} {{adj}} {{n}} {{np}} {{authority}} {{certs}} {{lines}} {{rp}} {{labeling}} {{formats}} {{sd}} exactly as they are. "
         "Do not translate standards or agency names (ISO 11930, USP <51>, GMPC, ISO 22716, HALAL, FDA, EU CPNP, SGS, BPOM, NPRA, SFDA, MoCRA, OEM). Keep the brand name BIOSPHERE. Business register, short sentences. Output only JSON.")
lines = []; n_ok = n_skip = n_fail = 0
have = {(r["ns"], r["lang"], r["key"]): r["src_hash"] for r in d1("SELECT ns, lang, key, src_hash FROM ui_i18n")}
for ns in [x.strip() for x in A.ns.split(",") if x.strip()]:
    src = json.load(io.open(os.path.join(ROOT, "data", "i18n", f"{ns}.en.json"), encoding="utf-8"))
    for lang in [l.strip() for l in A.langs.split(",") if l.strip() in LANG]:
        todo = {k: v for k, v in src.items() if A.force or have.get((ns, lang, k)) != hashlib.md5(v.encode()).hexdigest()[:12]}
        if not todo: n_skip += len(src); continue
        out, prov, err = chat(provs, [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps(todo, ensure_ascii=False)}], max_tokens=4000, want_json=True)
        if not isinstance(out, dict) or set(out) != set(todo):   # 整包不完整 → 逐句
            out = out if isinstance(out, dict) else {}
            for k, v in todo.items():
                if out.get(k): continue
                o, _, _ = chat(provs, [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps({k: v}, ensure_ascii=False)}], max_tokens=1200, want_json=True)
                if isinstance(o, dict) and o.get(k): out[k] = o[k]
        for k, v in todo.items():
            t = out.get(k)
            if not t or not isinstance(t, str): n_fail += 1; continue
            lines.append(f"INSERT INTO ui_i18n (ns, lang, key, text, src_hash, updated_at) VALUES ({q(ns)}, {q(lang)}, {q(k)}, {q(t[:2000])}, {q(hashlib.md5(v.encode()).hexdigest()[:12])}, datetime('now')) ON CONFLICT(ns, lang, key) DO UPDATE SET text=excluded.text, src_hash=excluded.src_hash, updated_at=excluded.updated_at;"); n_ok += 1
        print(f"  {ns} {lang}: {sum(1 for k in todo if out.get(k))}/{len(todo)} ({prov})", flush=True)
print(f"译好 {n_ok} · 跳过 {n_skip} · 失败 {n_fail}")
if lines:
    out = os.path.join(ROOT, "tools", "_ui-i18n.sql"); total = 0
    for i in range(0, len(lines), 150):
        io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines[i:i + 150]) + "\n"); total += d1_exec(out) or 0
    print("入库", total)
