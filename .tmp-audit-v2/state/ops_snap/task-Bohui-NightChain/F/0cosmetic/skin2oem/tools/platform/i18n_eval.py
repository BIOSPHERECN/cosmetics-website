# -*- coding: utf-8 -*-
"""BEAUTY2AI 翻译考评 —— 机械规则(2026-09-23)。
v2(09-23 17:xx A2 线):html_i18n_src.en 有英文原文,改成对原文判:数字对原文(09 与 9 同,泰/天城数字归一)、截断按原文长度(日韩门槛放低)、
「没翻」只认整句(功能词带词边界,v1 没边界把学名里的 to/is 也数进去)。v1 规则保留计算,只用来出「v1 误报核对」。
以下是 v1 说明:

html_i18n 只存原文哈希 h、不存原文,所以没法拿原文比。但同一个 h 在各语种各有一份译文,互证就够抓住真毛病:
  ① 文字系统:每个语种先统计自己的主流文字(韩文/阿拉伯文/泰文/西里尔/拉丁…),偏离的行 = 没翻或翻成了别的语言
  ② 没翻:同一个 h 在 3 种以上拉丁语种里一字不差 = 原文原样漏过去了
  ③ 数字:同一个 h 各语种的数字集合应一致,和多数不同 = 漏了或编了数字
  ④ 截断:比同 h 各语种长度中位数的 30% 还短
  ⑤ 品牌:平台零工厂信息,出现 帛卉 / BIOSPHERE 即违规
按语种、按模型(provider 列)出合格率。坏行只写进待重翻清单(SQL 文件,不执行,删缓存要人点头)。
用法:python tools/platform/i18n_eval.py [抽样段数,默认 400]
"""
import io, os, re, sys, json, html, statistics, collections, datetime

ROOT = r"F:\0cosmetic\skin2oem"
sys.path.insert(0, os.path.join(ROOT, "tools", "hero"))
import pd1

N = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 400
OUT = os.path.join(ROOT, "tools", "platform", "_i18n_eval_v2.md")
REDO = os.path.join(ROOT, "tools", "platform", "_i18n_redo_v2.sql")
SCRIPTS = [("韩文", r"[\uac00-\ud7af]"), ("假名", r"[\u3040-\u30ff]"), ("泰文", r"[\u0e00-\u0e7f]"),
           ("阿拉伯", r"[\u0600-\u06ff]"), ("西里尔", r"[\u0400-\u04ff]"), ("天城", r"[\u0900-\u097f]"),
           ("缅文", r"[\u1000-\u109f]"), ("汉字", r"[\u4e00-\u9fff]"), ("拉丁", r"[A-Za-z\u00c0-\u024f]")]
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹๐๑๒๓๔๕๖๗๘๙०१२३४५६७८९", "0123456789" * 4)


def plain(t):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")))   # &#39; 不能当数字 39


def script(t):
    t = plain(t)
    best, n = "无", 0
    for name, pat in SCRIPTS:
        c = len(re.findall(pat, t))
        if c > n:
            best, n = name, c
    return best


def nums(t):
    t = plain(t).translate(ARABIC_DIGITS)
    t = re.sub(r"(?<=\d)[,.\s\u00a0\u202f'](?=\d{3}(?!\d))", "", t)
    return tuple(sorted(str(int(x)) for x in re.findall(r"\d+", t)))   # 09 与 9 同


hs = pd1.q(f"SELECT h FROM html_i18n GROUP BY h HAVING COUNT(*) >= 10 ORDER BY random() LIMIT {N}") or []
hs = [r["h"] for r in hs]
rows = []
for i in range(0, len(hs), 100):
    part = ",".join("'" + h.replace("'", "''") + "'" for h in hs[i:i + 100])
    rows += pd1.q(f"SELECT h, lang, text, provider FROM html_i18n WHERE h IN ({part})") or []

src = {}
for i in range(0, len(hs), 100):
    part = ",".join("'" + h.replace("'", "''") + "'" for h in hs[i:i + 100])
    for r in pd1.q(f"SELECT h, en FROM html_i18n_src WHERE h IN ({part})") or []:
        src[r["h"]] = plain(r["en"]).strip()
by_h = collections.defaultdict(list)
for r in rows:
    by_h[r["h"]].append(r)
NATIVE = {"kr": "韩文", "jp": "假名|汉字", "th": "泰文", "ar": "阿拉伯", "ru": "西里尔"}
for lang in ("in", "my"):   # 印地语/缅语还是拉丁转写,按实际数据判:过半行里有母语字符才算母语文字
    pat = dict(SCRIPTS)["天城" if lang == "in" else "缅文"]
    rs = [r for r in rows if r["lang"] == lang]
    if rs and sum(1 for r in rs if re.search(pat, plain(r["text"]))) > len(rs) / 2:
        NATIVE[lang] = "天城" if lang == "in" else "缅文"
lang_script = {l: NATIVE.get(l, "拉丁") for l in {r["lang"] for r in rows}}
FUNC1 = re.compile(r"(the|and|for|with|of|to|your|is|are|from|this|that)", re.I)   # v1:没词边界,学名里的 to/is 也算
FUNC = re.compile(r"\b(the|and|for|with|of|to|your|is|are|from|this|that)\b", re.I)
TRUNC = {"jp": 0.2, "kr": 0.25}      # 译文长度 / 原文长度 的下限;日韩字密,门槛放低
# 日语里没有假名、却有中文全角逗号或简体专用字 = 译成了中文(「无水性木糖醇，强效保湿剂」);纯汉字术语串「皮膚保護、軟化剤」不算
ZH_ONLY = re.compile("[，这们个时会为无应该过进还没么从产发现经对说]")


def has_native(t, lang):
    return any(re.search(dict(SCRIPTS)[k], t) for k in NATIVE[lang].split("|"))


bad, v1_only, v2_new = [], collections.Counter(), []
v1_ex = collections.defaultdict(list)
for h, group in by_h.items():
    en = src.get(h, "")
    med = statistics.median(len(plain(r["text"])) for r in group)
    num_mode = collections.Counter(nums(r["text"]) for r in group).most_common(1)[0][0]
    latin = collections.Counter(plain(r["text"]).strip() for r in group if lang_script[r["lang"]] == "拉丁")
    words = en.split()
    title = sum(1 for w in words if w[:1].isupper()) >= 0.6 * max(1, len(words))   # 商品名 / 标题式大写:原样保留合理
    sentence = len(FUNC.findall(en)) >= 2 and len(words) >= 4 and not title
    en_nums = nums(en)
    for r in group:
        t, why, why1 = plain(r["text"]).strip(), [], []
        # v1 原规则(只用来核误报)
        if r["lang"] in NATIVE and len(FUNC1.findall(t)) >= 2 and not has_native(t, r["lang"]):
            why1.append("没有母语字符")
        if lang_script[r["lang"]] == "拉丁" and len(FUNC1.findall(t)) >= 2 and latin[t] >= 3:
            why1.append("与其他语种一字不差")
        if nums(r["text"]) != num_mode and num_mode:
            why1.append("数字与多数不一致")
        if med > 40 and len(t) < 0.3 * med:
            why1.append("疑似截断")
        # v2:对英文原文判
        if en and r["lang"] in NATIVE and sentence and not has_native(t, r["lang"]):
            why.append(f"没有{NATIVE[r['lang']]}字符,整句英文漏过")
        if r["lang"] == "jp" and not re.search(r"[぀-ヿ]", t) and ZH_ONLY.search(t):
            why.append("日语整句没有假名,疑似译成中文")
        if en and lang_script[r["lang"]] == "拉丁" and sentence and t == en:
            why.append("与英文原文一字不差,没翻")
        if en and en_nums and nums(t) != en_nums:
            why.append(f"数字不一致 {list(nums(t))[:6]} vs 原文 {list(en_nums)[:6]}")
        if len(en) > 40 and len(t) < TRUNC.get(r["lang"], 0.35) * len(en):
            why.append(f"疑似截断 {len(t)} 字 vs 原文 {len(en)}")
        if re.search(r"帛卉|biosphere", t, re.I) and not re.search(r"帛卉|biosphere", en, re.I):
            why.append("出现工厂品牌")
        if why:
            bad.append((r, why))
            if not why1:
                v2_new.append((r, why))
        elif why1:
            for w in why1:
                v1_only[w] += 1
                v1_ex[w].append((r, en))

tot = collections.Counter(r["lang"] for r in rows)
badc = collections.Counter(r["lang"] for r, _ in bad)
ptot = collections.Counter(r["provider"] or "?" for r in rows)
pbad = collections.Counter(r["provider"] or "?" for r, _ in bad)
kinds = collections.Counter(w.split(" ")[0].split("=")[0] for _, ws in bad for w in ws)

L = [f"# BEAUTY2AI 翻译考评 · {datetime.datetime.now():%m-%d %H:%M}",
     f"抽样 {len(by_h)} 段内容 × 各语种 = {len(rows)} 条译文;有问题 {len(bad)} 条,**总合格率 {100*(1-len(bad)/max(1,len(rows))):.1f}%**", "",
     "## 按语种", "| 语种 | 主流文字 | 条数 | 有问题 | 合格率 |", "|---|---|---|---|---|"]
for lang, n in sorted(tot.items(), key=lambda x: badc[x[0]] / x[1], reverse=True):
    L.append(f"| {lang} | {lang_script[lang]} | {n} | {badc[lang]} | {100*(1-badc[lang]/n):.1f}% |")
L += ["", "## 按模型(provider)", "| 模型 | 条数 | 有问题 | 合格率 |", "|---|---|---|---|"]
for p, n in ptot.most_common():
    L.append(f"| {p} | {n} | {pbad[p]} | {100*(1-pbad[p]/n):.1f}% |")
L += ["", "## 问题类型", *[f"- {k}:{v}" for k, v in kinds.most_common()], "", "## 有问题的样例(前 20 条)"]
for r, ws in bad[:20]:
    L.append(f"- `{r['lang']}` `{r['provider']}` {'; '.join(ws)} —— EN {src.get(r['h'], '')[:60]!r} → {plain(r['text'])[:60]!r}")
L += ["", f"## v1 误报核对:v1 规则判坏、v2 对原文核过没问题的 {sum(v1_only.values())} 处",
      *[f"- {k}:{v}" for k, v in v1_only.most_common()]]
for w, ex in v1_ex.items():
    for r, en in ex[:3]:
        L.append(f"  - [{w}] `{r['lang']}` EN {en[:60]!r} → {plain(r['text'])[:60]!r}")
L += ["", f"## v2 新抓到、v1 漏掉的 {len(v2_new)} 条(前 8)"]
for r, ws in v2_new[:8]:
    L.append(f"- `{r['lang']}` {'; '.join(ws)} —— EN {src.get(r['h'], '')[:60]!r} → {plain(r['text'])[:60]!r}")
io.open(OUT, "w", encoding="utf-8").write("\n".join(L) + "\n")
io.open(REDO, "w", encoding="utf-8").write(
    "-- 待重翻清单(v2)。只作清单,不执行 DELETE:重翻走 i18n_redo.py 覆盖写(upsert),页面不会先退回英文\n" +
    "".join(f"-- {r['h']}\t{r['lang']}\t{'; '.join(ws)[:80]}\n" for r, ws in bad))
print(f"合格率 {100*(1-len(bad)/max(1,len(rows))):.1f}% · 有问题 {len(bad)}/{len(rows)} · v1 误报 {sum(v1_only.values())} · 报告 {OUT}")
