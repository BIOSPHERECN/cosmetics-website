#!/usr/bin/env python3
"""买手问答(geo_answers)→ 17 语(2026-09-16 创始人:「GEO 是多语言展现吗」「多语言 GEO,SEO 优化势在必行」)。

只翻文字,不改数字、不改专有名词(BPOM / NPRA / SFDA / ISO 11930 / MoCRA / CPNP / INCI 保留原样)。
一页一次调用:问句 + 结论 + 各段标题正文 + FAQ 打包成 JSON 让模型整体翻(保持术语一致),超过 max_tokens 就退回按段翻。
舰队:免费白名单(Agnes / 商汤),按 tier 顺序;失败换下一家。已翻且源文没变(updated_at 相同)的跳过。
用法:python tools/geo-answers-i18n.py [--langs id,my,ar] [--limit 400] [--force]"""
import argparse, hashlib, io, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, chat, fleet  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = {  # 站点语种代码 → 语言名(给模型看的)
    "zh-tw": "Traditional Chinese (Taiwan)", "jp": "Japanese", "kr": "Korean", "fr": "French", "de": "German", "ru": "Russian", "id": "Indonesian",
    "my": "Malay", "th": "Thai", "vn": "Vietnamese", "ph": "Filipino (Tagalog)", "es": "Spanish", "pt": "Portuguese (Brazil)", "ar": "Arabic (Modern Standard)", "tr": "Turkish", "in": "Hindi",
}
PRIORITY = ["id", "my", "ar", "vn", "th", "ph", "jp", "kr", "fr", "de", "es", "pt", "tr", "ru", "in", "zh-tw"]   # 我们的市场排前
ap = argparse.ArgumentParser(); ap.add_argument("--langs", default=",".join(PRIORITY)); ap.add_argument("--limit", type=int, default=500); ap.add_argument("--force", action="store_true"); A = ap.parse_args()
q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"  # noqa: E731

rows = d1("SELECT slug, q_en, lead_en, sections_json, faqs_json, updated_at FROM geo_answers ORDER BY slug")
have = {(r["slug"], r["lang"]): r["src_hash"] for r in d1("SELECT slug, lang, src_hash FROM geo_answers_i18n")}
provs = [p for p in fleet() if p["id"].startswith(("agnes", "sensenova"))]   # 舰队白名单铁令:只准 Agnes / 商汤
print(f"答案 {len(rows)} 条 · 目标语 {A.langs} · 舰队 {[p['id'] for p in provs]}")
RULES = ("You are translating B2B cosmetics-manufacturing Q&A pages for buyers. Translate the JSON values into {lang}. Keep the JSON structure and keys exactly. "
         "Do not translate or alter: numbers, units, standards and agency names (ISO 11930, USP <51>, BPOM, NPRA, SFDA, MoCRA, CPNP, CPSR, INCI, GMP, GMPC, HSA, FDA), product codes, URLs. "
         "Use the natural business register of the target language; keep sentences as short as the source. Output only JSON.")
lines, n_ok, n_fail, n_skip = [], 0, 0, 0
t0 = time.time()
for r in rows:
    secs = json.loads(r["sections_json"] or "[]"); faqs = json.loads(r["faqs_json"] or "[]")
    src = {"q": r["q_en"], "lead": r["lead_en"], "sections": [{"h": s.get("h_en", ""), "b": s.get("b_en", "")} for s in secs], "faqs": [{"q": f.get("q_en", ""), "a": f.get("a_en", "")} for f in faqs]}
    h = hashlib.md5(json.dumps(src, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    for lang in [l.strip() for l in A.langs.split(",") if l.strip() in LANG]:
        if len(lines) >= A.limit: break
        if not A.force and have.get((r["slug"], lang)) == h: n_skip += 1; continue
        msgs = [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps(src, ensure_ascii=False)}]
        out, prov, err = chat(provs, msgs, max_tokens=4000, want_json=True)
        ok = isinstance(out, dict) and out.get("q") and out.get("lead") and isinstance(out.get("sections"), list) and len(out["sections"]) == len(src["sections"])
        if not ok:   # 整页失败 → 按段翻(每段一次),保底
            try:
                parts = {}
                for k, v in (("q", src["q"]), ("lead", src["lead"])):
                    o, _, _ = chat(provs, [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps({"t": v}, ensure_ascii=False)}], max_tokens=1200, want_json=True); parts[k] = (o or {}).get("t", "")
                parts["sections"] = []
                for s in src["sections"]:
                    o, _, _ = chat(provs, [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps(s, ensure_ascii=False)}], max_tokens=1500, want_json=True); parts["sections"].append({"h": (o or {}).get("h", ""), "b": (o or {}).get("b", "")})
                parts["faqs"] = []
                for f in src["faqs"]:
                    o, _, _ = chat(provs, [{"role": "system", "content": RULES.format(lang=LANG[lang])}, {"role": "user", "content": json.dumps(f, ensure_ascii=False)}], max_tokens=1200, want_json=True); parts["faqs"].append({"q": (o or {}).get("q", ""), "a": (o or {}).get("a", "")})
                out = parts; ok = bool(parts["q"] and parts["lead"] and all(s["b"] for s in parts["sections"]))
            except Exception as e: err = str(e)[:80]; ok = False
        if not ok: n_fail += 1; print(f"  ✗ {r['slug']} {lang}: {err or 'JSON 不完整'}"); continue
        lines.append(f"INSERT INTO geo_answers_i18n (slug, lang, q, lead, sections_json, faqs_json, src_hash, updated_at) VALUES ({q(r['slug'])}, {q(lang)}, {q(out['q'][:300])}, {q(out['lead'][:2000])}, {q(json.dumps(out['sections'], ensure_ascii=False))}, {q(json.dumps(out.get('faqs') or [], ensure_ascii=False))}, {q(h)}, datetime('now')) ON CONFLICT(slug, lang) DO UPDATE SET q=excluded.q, lead=excluded.lead, sections_json=excluded.sections_json, faqs_json=excluded.faqs_json, src_hash=excluded.src_hash, updated_at=excluded.updated_at;")
        n_ok += 1
        if n_ok % 10 == 0: print(f"  … {n_ok} 页译好({prov},{(time.time() - t0) / 60:.0f} 分钟)", flush=True)
    if len(lines) >= A.limit: break
print(f"译好 {n_ok} · 跳过 {n_skip} · 失败 {n_fail}")
if lines:
    out = os.path.join(ROOT, "tools", "_geo-i18n.sql"); total = 0
    for i in range(0, len(lines), 100):
        io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines[i:i + 100]) + "\n"); total += d1_exec(out) or 0
    print("入库", total)
