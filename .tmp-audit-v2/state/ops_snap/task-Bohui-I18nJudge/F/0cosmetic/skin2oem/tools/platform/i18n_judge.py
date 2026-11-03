# -*- coding: utf-8 -*-
"""BEAUTY2AI 翻译语义打分 —— 商汤 GLM-5.2 当裁判(2026-09-23 创始人:「用商汤啊」)。

v2(09-23 17:xx A2 线):
  · 有原文了:html_i18n_src.en 存着英文原文(v1 以为只有哈希,拿 3 种别的译文当参照 —— 参照本身错就连坐)。
    现在直接「英文原文 vs 译文」判。
  · 排除不该判的段:各语种一字不差的段;过半语种与原文一字不差的段(INCI 学名 / 品牌 / 型号,本来就不翻);
    网址 / slug / 邮箱;原文本身不是英文的段(中间件把日文页的「サイトマップ」当英文登记进来了);太短的段(<20 字或 <3 个词)。
    v1 最低分 12 条里 5 条是 `Sophora Flavescens Root Extract` 这类学名被判「没翻」1 分,就是这么来的。
  · 每条结果落 _i18n_judge_v2.jsonl(h / lang / provider / score / errors),重翻按它挑。
GLM-5.2 跟两个翻译模型(Agnes 3.0 Flash、商汤 6.8 Flash Lite)都不是同一个模型。走本机帛卉通用网关 127.0.0.1:8788。
用法:python tools/platform/i18n_judge.py [每语种抽几段,默认 20] [并发,默认 3]
"""
import io, os, re, sys, json, html, time, random, collections, datetime, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = r"F:\0cosmetic\skin2oem"
sys.path.insert(0, os.path.join(ROOT, "tools", "hero"))
import pd1

K = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 20
PAR = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 3
OUT = os.path.join(ROOT, "tools", "platform", "_i18n_judge_v2.md")
JL = os.path.join(ROOT, "tools", "platform", "_i18n_judge_v2.jsonl")
TOK = io.open(os.path.expanduser("~/.bohui-gateway/TOKEN.txt"), encoding="utf-8").read().strip()
OPEN = urllib.request.build_opener(urllib.request.ProxyHandler({}))
NAME = {"fr": "French", "de": "German", "es": "Spanish", "pt": "Portuguese", "tr": "Turkish", "vn": "Vietnamese",
        "id": "Indonesian", "my": "Malay", "ph": "Filipino", "jp": "Japanese", "kr": "Korean", "th": "Thai",
        "ar": "Arabic", "ru": "Russian", "in": "Hindi"}
NON_EN = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff\u0400-\u04ff\u0900-\u097f]")
URLISH = re.compile(r"^(https?://|www\.)\S+$|^[\w.+-]+@[\w-]+\.[\w.]+$|^[\w./-]+$")


def plain(t):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or ""))).strip()


def fam(p):
    return "agnes" if "agnes" in (p or "") else "sensenova" if "sensenova" in (p or "") else "?"


def skip_reason(en, texts):
    """整段不进抽样的原因;None = 该判"""
    if NON_EN.search(en):
        return "原文不是英文"
    if URLISH.match(en):
        return "网址/slug/邮箱"
    if len(en) < 20 or len(en.split()) < 3:
        return "太短"
    if len(set(texts)) == 1:
        return "各语种一字不差"
    if sum(1 for t in texts if t == en) * 2 >= len(texts):
        return "过半语种原样保留(学名/品牌/型号)"
    return None


def judge(lang, en, target):
    prompt = (f"English source:\n{en}\n\n{NAME.get(lang, lang)} translation:\n{target}\n\n"
              "Rate how faithfully the translation conveys the source for a website reader. Ignore style. "
              "INCI ingredient names, product and brand names, codes and URLs are correctly left untranslated - do not penalize that. "
              'Reply ONLY JSON: {"score": 1-5, "errors": ["short concrete error", ...]}  '
              "(5 = same meaning, 4 = minor slip, 3 = partly wrong, 2 = mostly wrong, 1 = wrong or not in the target language)")
    body = json.dumps({"model": "glm-5.2", "messages": [{"role": "user", "content": prompt}],
                       "max_tokens": 400, "temperature": 0}).encode()
    req = urllib.request.Request("http://127.0.0.1:8788/v1/chat/completions", data=body,
                                 headers={"Authorization": "Bearer " + TOK, "Content-Type": "application/json"})
    for i in range(6):
        try:
            out = json.load(OPEN.open(req, timeout=120))
            # 09-23 17:5x 实测:5YGY 撞「rpm exhausted」时网关会静默回落到 agnes-3.0-flash —— 裁判变成被告,只认 glm 答的
            if not str(out.get("model", "")).startswith("glm"):
                time.sleep(15 * (i + 1)); continue
            txt = out["choices"][0]["message"]["content"] or ""
            m = re.search(r"\{.*\}", txt, re.S)
            v = json.loads(m.group(0)) if m else None
            if v and isinstance(v.get("score"), (int, float)):
                return v
        except Exception:
            pass
        time.sleep(10 * (i + 1))
    return None


def main():
    src = pd1.q("SELECT s.h, s.en FROM html_i18n_src s JOIN (SELECT h FROM html_i18n GROUP BY h HAVING COUNT(*) >= 10) t "
                "ON t.h = s.h ORDER BY random() LIMIT 250") or []
    en_of = {r["h"]: plain(r["en"]) for r in src}
    hs = list(en_of)
    rows = []
    for i in range(0, len(hs), 100):      # 平台库常被别的线导入锁住(7500 要等 90 秒):查询次数越少越好
        part = ",".join("'" + h.replace("'", "''") + "'" for h in hs[i:i + 100])
        rows += pd1.q(f"SELECT h, lang, text, provider FROM html_i18n WHERE h IN ({part})") or []
    by_h = collections.defaultdict(dict)
    for r in rows:
        by_h[r["h"]][r["lang"]] = r
    skipped = collections.Counter()
    tasks, per_lang = [], collections.Counter()
    for h, langs in by_h.items():
        why = skip_reason(en_of[h], [plain(x["text"]) for x in langs.values()])
        if why:
            skipped[why] += 1
            continue
        for lang, r in langs.items():
            if per_lang[lang] < K:
                per_lang[lang] += 1
                tasks.append((lang, r, en_of[h]))
    print(f"抽 {len(by_h)} 段,排除 {sum(skipped.values())} 段 {dict(skipped)};要判 {len(tasks)} 条", flush=True)

    def work(t):
        lang, r, en = t
        v = judge(lang, en[:800], plain(r["text"])[:800])
        return None if not v else {"h": r["h"], "lang": lang, "provider": r["provider"], "score": v["score"],
                                   "errors": [str(e) for e in (v.get("errors") or [])][:4], "en": en[:120],
                                   "text": plain(r["text"])[:120]}
    with ThreadPoolExecutor(PAR) as ex:
        res = [x for x in ex.map(work, tasks) if x]
    io.open(JL, "w", encoding="utf-8").write("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in res))

    avg = lambda xs: sum(xs) / len(xs) if xs else 0
    ge4 = lambda xs: 100 * sum(1 for x in xs if x >= 4) / max(1, len(xs))
    by_lang, by_fam, by_lf = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for x in res:
        by_lang[x["lang"]].append(x["score"]); by_fam[fam(x["provider"])].append(x["score"])
        by_lf[(x["lang"], fam(x["provider"]))].append(x["score"])
    allv = [x["score"] for x in res]
    L = [f"# BEAUTY2AI 翻译语义打分 v2(裁判:商汤 GLM-5.2,英文原文对照)· {datetime.datetime.now():%m-%d %H:%M}",
         f"抽 {len(by_h)} 段,排除 {sum(skipped.values())} 段(" + ",".join(f"{k} {v}" for k, v in skipped.most_common()) + ")",
         f"共判 {len(res)} 条;**平均分 {avg(allv):.2f} / 5**;4 分及以上占 {ge4(allv):.1f}%", "",
         "## 按语种", "| 语种 | 条数 | 平均分 | ≥4 分占比 | Agnes 均分(条) | 商汤 6.8 均分(条) |", "|---|---|---|---|---|---|"]
    for lang, xs in sorted(by_lang.items(), key=lambda kv: avg(kv[1])):
        a, s = by_lf[(lang, "agnes")], by_lf[(lang, "sensenova")]
        L.append(f"| {lang} | {len(xs)} | {avg(xs):.2f} | {ge4(xs):.0f}% | {avg(a):.2f} ({len(a)}) | {avg(s):.2f} ({len(s)}) |")
    L += ["", "## 按翻译模型", "| 模型 | 条数 | 平均分 | ≥4 分占比 |", "|---|---|---|---|"]
    for f, xs in by_fam.items():
        L.append(f"| {f} | {len(xs)} | {avg(xs):.2f} | {ge4(xs):.0f}% |")
    L += ["", "## 最低分 15 条"]
    for x in sorted(res, key=lambda x: x["score"])[:15]:
        L.append(f"- **{x['score']}** `{x['lang']}` `{x['provider']}` {'; '.join(x['errors'])[:160]} —— EN {x['en'][:70]!r} → {x['text'][:70]!r}")
    io.open(OUT, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"判 {len(res)} 条 · 平均 {avg(allv):.2f}/5 · 报告 {OUT}")


if __name__ == "__main__":
    main()
