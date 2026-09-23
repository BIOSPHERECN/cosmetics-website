#!/usr/bin/env python3
"""买手问答扩容:geo_answers 27 → 100(2026-09-18 创始人:「SEO、GEO 要真的给我们带入客户 … 一定要实现」)。

GEO 基线 W38:被引 169 次全在首页与法规页,27 页买手问答 0 次 —— 题目太少、太偏「起订量」。这次按三处来源补题:
  ① 真实问题:prospects.hook / next_step 与 inquiries.message(模型去重归纳成买手会敲进对话框的整句)
  ② 意图组合:8 市场 × 品类(印尼清真洗发水要多久 / 美国防晒按 OTC 管 …),每题按市场法规表 + 品类角度写,不是一个模板灌 48 遍
  ③ 专家触发词反推:面向买手的 30 余位专家,各出一题(问的是买手视角,不是内部流程)
每题 chat()(舰队按 tier,Agnes 3.0 在前)套对应专家的 core 写答案:证据先行(法规名 / 目录 / 检测标准 / 帛卉产线事实),
中英各一版;起订量 / 交期 / 价格一律「以书面报价为准」(知识库「工厂口径」页只填了出样 5–14 天),写出来的数字句整句删(复用 geo-answers.py 的 scrub)。
写库走 geo_answers 现有列 + 0096 新增的 market / category / expert;公开路由 /[lang]/answers/<slug>/ 与 sitemap 读表即自动上线;
法规页与意图页「相关问答」按 market / category 列挂(regulations/[id].astro、oem/[market]/[category].astro)。
其它 15 语交给现有 tools/geo-answers-i18n.py。

用法:
  python tools/geo/answers-expand.py              生成 20 题人审样本 → 助手交付/8-问答素材/买手问答扩容-样本-YYYYMMDD.md(不写库)
  python tools/geo/answers-expand.py --apply      补齐到 100 题并写库(已生成过的题从 _expand-cache.json 取,不重复调模型)
  python tools/geo/answers-expand.py --apply --target 120
"""
import argparse, datetime as dt, importlib.util, io, json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, chat, fleet, job  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_expand-cache.json")
SAMPLE_MD = os.path.join(r"F:\0cosmetic\助手交付\8-问答素材", f"买手问答扩容-样本-{dt.date.today():%Y%m%d}.md")

# 复用 geo-answers.py 的 scrub / terms_confirmed(文件名带连字符,只能这样加载)
_spec = importlib.util.spec_from_file_location("geo_answers", os.path.join(ROOT, "tools", "geo-answers.py"))
_ga = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_ga)
scrub, terms_confirmed = _ga.scrub, _ga.terms_confirmed

MARKETS = {  # 与 packages/core/src/content/oem.ts 的 OEM_MARKETS 同口径
    "id": {"zh": "印尼", "en": "Indonesia", "halal": True}, "my": {"zh": "马来西亚", "en": "Malaysia", "halal": True},
    "sa": {"zh": "沙特", "en": "Saudi Arabia", "halal": True}, "ae": {"zh": "阿联酋", "en": "the UAE", "halal": True},
    "ph": {"zh": "菲律宾", "en": "the Philippines", "halal": False}, "vn": {"zh": "越南", "en": "Vietnam", "halal": False},
    "th": {"zh": "泰国", "en": "Thailand", "halal": False}, "us": {"zh": "美国", "en": "the United States", "halal": False},
}
CATS = {  # 与 OEM_CATEGORIES 同口径;expert = 这个品类的技术角度由谁答
    "skincare": {"zh": "护肤", "en": "skincare", "expert": "bohui-formulation-actives-efficacy"},
    "body-care": {"zh": "身体护理", "en": "body care", "expert": "bohui-fragrance-development"},
    "hair-care": {"zh": "洗护发", "en": "hair care", "expert": "bohui-cleansing-surfactant-systems"},
    "cleansing": {"zh": "清洁", "en": "cleansing", "expert": "bohui-cleansing-surfactant-systems"},
    "sun-care": {"zh": "防晒", "en": "sun care", "expert": "bohui-sunscreen-spf-systems"},
    "makeup": {"zh": "彩妆", "en": "colour cosmetics", "expert": "bohui-color-cosmetics-lip-base"},
}
REG_EXPERT = {"us": "bohui-regulatory-us-na", "eu": "bohui-regulatory-eu", "cn": "bohui-regulatory-china"}   # 其余市场 → apac-emerging
# 意图组合:每个市场挑 4–5 个品类(不是 8×6 全灌 —— 同质化内容是 content-geo 专家的红线)
COMBOS = {"id": ["skincare", "hair-care", "sun-care", "cleansing", "body-care"], "my": ["skincare", "hair-care", "sun-care", "makeup", "cleansing"],
          "sa": ["skincare", "hair-care", "body-care", "makeup"], "ae": ["skincare", "sun-care", "body-care", "makeup", "hair-care"],
          "ph": ["skincare", "cleansing", "sun-care", "hair-care", "body-care"], "vn": ["skincare", "cleansing", "body-care", "sun-care", "hair-care"],
          "th": ["skincare", "sun-care", "hair-care", "cleansing", "body-care"], "us": ["skincare", "sun-care", "makeup", "hair-care", "body-care"]}
# 面向买手的专家(内部流程类 —— 开发信、ICP 打分、LinkedIn、展会、私域、视觉提案、报价谈判 —— 不出题:买手不会问「你们怎么给我打分」)
BUYER_EXPERTS = ["bohui-botanical-actives-claims", "bohui-brand-strategy-launch", "bohui-cleansing-surfactant-systems", "bohui-color-cosmetics-lip-base",
                 "bohui-cost-formulation-structure", "bohui-cross-border-channel", "bohui-data-security-formula-confidentiality", "bohui-deco-printing",
                 "bohui-ecommerce-ops-amazon-tiktok", "bohui-ethics-sustainability-claims", "bohui-filling-line-engineering", "bohui-formulation-actives-efficacy",
                 "bohui-formulation-aqueous-serum", "bohui-formulation-emulsion", "bohui-fragrance-development", "bohui-incoming-material-supplier",
                 "bohui-label-claims-review", "bohui-legal-advertising-claims", "bohui-legal-contract-dispute", "bohui-legal-ip-trade-secret",
                 "bohui-logistics-export-dg", "bohui-micro-preservation", "bohui-negotiation-risk-contract", "bohui-nmpa-reviewer-perspective",
                 "bohui-packaging-compatibility", "bohui-packaging-structure", "bohui-process-scaleup-emulsion", "bohui-qms-gmp-audit",
                 "bohui-regulatory-china", "bohui-regulatory-eu", "bohui-regulatory-us-na", "bohui-regulatory-apac-emerging",
                 "bohui-safety-assessor-toxicology", "bohui-sheet-mask-substrate", "bohui-stability-shelf-life", "bohui-sunscreen-spf-systems"]

# 帛卉硬事实:只准引用这些(packages/core/src/content/org.ts 官网口径 + 知识库「工厂口径」页已填的出样周期)
FACTS = ("广州市帛卉化妆品有限公司(品牌 BIOSPHERE,广州):15 条自动化产线;生产基地 20,000 m²;面膜日产能 50 万片、水乳霜日产能 30 万支;"
         "成熟配方储备 1.3 万个;认证与登记:GMPC · ISO 22716 · HALAL · FDA · EU CPNP · SGS(官网口径)。"
         "出样通常 5–14 天(现有基底靠 5 天一侧、全新配方靠 14 天一侧)。质检体系 36 项(IQC / IPQC / OQC);稳定性 40℃ 加速 3 个月;防腐挑战 ISO 11930 / USP <51>。"
         "起订量、大货交期、价格、样品费、付款条件:一律写「以书面报价为准」,不写任何数字、不写「通常几千支」这类估计。")
BAN = re.compile(r"SueAI|集团|group company", re.I)

q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
provs = [p for p in fleet() if p["id"].startswith(("agnes", "sensenova"))]   # 舰队白名单铁令:只准 Agnes / 商汤;fleet() 已按 tier 排,agnes-3.0 在前


def ask(msgs, max_tokens=3500):
    out, prov, err = chat(provs, msgs, max_tokens=max_tokens, temperature=0.3, want_json=True)
    return out, prov, err


def slugify(s, fallback):
    s = re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")[:60]
    return s or fallback


# ── 证据:市场法规行(库内 regulations 表)、专家 core、目录名 ─────────────────────────────
def load_context():
    ctx = {"reg": {}, "expert": {}, "registry": {}}
    for r in d1("SELECT id, country_zh, country_en, authority_en, law_en, entry_en, rp_en, labeling_en, latest_date, latest_what_en, inci_registry FROM regulations"):
        ctx["reg"][r["id"]] = r
    for r in d1("SELECT slug, title, core FROM expert_skills WHERE kind='expert'"):
        ctx["expert"][r["slug"]] = r
    for r in d1("SELECT id, name_zh FROM inci_registry"):
        ctx["registry"][r["id"]] = r["name_zh"]
    return ctx


def evidence(ctx, market):
    r = ctx["reg"].get(market or "")
    if not r: return ""
    reg = ctx["registry"].get(r.get("inci_registry") or "")
    return (f"市场法规({r.get('country_en')},库内法规表,以最新官方文本为准):主管机构 {r.get('authority_en')};主法规 {r.get('law_en')};"
            f"上市路径 {r.get('entry_en')};责任人 {r.get('rp_en')};标签 {r.get('labeling_en')};最近动态 {r.get('latest_date')} {r.get('latest_what_en')}"
            + (f";可查目录:{reg}" if reg else ""))


# ── 题目池 ─────────────────────────────────────────────────────────────────────
def pool_real(existing_q):
    """① 真实问题:外联 hook / next_step + 询盘原文 → 模型去重归纳 12 题"""
    hooks = d1("SELECT hook, next_step, market, categories FROM prospects WHERE hook IS NOT NULL AND hook<>'' ORDER BY icp_score DESC LIMIT 120")
    inqs = d1("SELECT message, country FROM inquiries WHERE COALESCE(spam_score,0) <= 50 AND length(message) > 30")
    raw = "\n".join(f"- [{h.get('market') or ''}/{h.get('categories') or ''}] {h['hook']} | {h.get('next_step') or ''}" for h in hooks)[:7000]
    raw += "\n\n询盘原文:\n" + "\n".join(f"- [{i.get('country') or ''}] {i['message'][:400]}" for i in inqs)[:2500]
    sysm = ("你是化妆品代工厂的内容与 GEO 专家。下面是业务部对目标品牌写的切入点与真实询盘原文。请反推出这些品牌方在找中国代工厂时**真会敲进 ChatGPT / Google 的整句问题**,"
            "去重归纳成 12 题,覆盖不同市场与品类,不要「起订量多少 / 价格多少」这类只能由报价回答的题(已有页面),多问流程、认证、配方、包材、质量、保密、交付风险。"
            "只输出 JSON 数组:[{\"q_zh\":\"中文整句问题\",\"q_en\":\"English question\",\"market\":\"id|my|sa|ae|ph|vn|th|us|eu|cn|null\",\"category\":\"skincare|body-care|hair-care|cleansing|sun-care|makeup|null\",\"topic\":\"3-5-word-ascii-slug\"}]")
    out, prov, err = ask([{"role": "system", "content": sysm}, {"role": "user", "content": raw + "\n\n已有的题(避开):\n" + "\n".join(existing_q)}], max_tokens=3000)
    items = out if isinstance(out, list) else (out or {}).get("items") if isinstance(out, dict) else None
    if not items:
        print(f"  ① 真实问题归纳失败:{err}"); return []
    res = []
    for it in items:
        m = it.get("market") if it.get("market") in MARKETS or it.get("market") in ("eu", "cn") else None
        c = it.get("category") if it.get("category") in CATS else None
        exp = CATS[c]["expert"] if c and not m else REG_EXPERT.get(m, "bohui-regulatory-apac-emerging") if m else "bohui-qms-gmp-audit"
        res.append({"src": "real", "slug": "buyer-" + slugify(it.get("topic"), f"q{len(res)}"), "q_zh": it.get("q_zh", "").strip(), "q_en": it.get("q_en", "").strip(),
                    "market": m, "category": c, "expert": exp})
    print(f"  ① 真实问题 {len(res)} 题({prov})")
    return [r for r in res if r["q_zh"] and r["q_en"]]


def pool_combos():
    """② 意图组合:市场 × 品类,问句按品类角度写,专家按品类 / 市场定"""
    res = []
    for m, cats in COMBOS.items():
        M = MARKETS[m]
        for c in cats:
            C = CATS[c]
            halal = M["halal"]
            if c == "skincare":
                qz, qe = (f"在{M['zh']}上市一款{C['zh']}产品(精华 / 面霜),代工厂要准备哪些资料、备案多久能拿到编号?",
                          f"Launching a {C['en']} product (serum or cream) in {M['en']}: what does the OEM factory need to prepare, and how long does notification take?")
                exp = REG_EXPERT.get(m, "bohui-regulatory-apac-emerging")
            elif c == "hair-care":
                qz, qe = ((f"在{M['zh']}做清真洗发水 / 护发素代工,配方要核哪些原料、清真认证和备案各要多久?",
                           f"Halal shampoo and conditioner OEM for {M['en']}: which ingredients are checked, and how long do halal certification and notification take?") if halal else
                          (f"在{M['zh']}做洗发水 / 护发素代工,无硫酸盐配方与标签要注意什么?",
                           f"Shampoo and conditioner OEM for {M['en']}: what matters in a sulfate-free formula and on the label?"))
                exp = "bohui-regulatory-apac-emerging" if halal else C["expert"]
            elif c == "sun-care":
                qz, qe = ((f"防晒在{M['zh']}按 OTC 药品管,代工厂要什么资质、SPF 怎么测、标签怎么写?",
                           f"Sunscreen is regulated as an OTC drug in {M['en']}: what must the OEM factory hold, how is SPF tested, and what goes on the label?") if m == "us" else
                          (f"在{M['zh']}卖防晒产品,SPF / PA 检测报告要哪一种、备案怎么走?",
                           f"Selling sunscreen in {M['en']}: which SPF / PA test report is accepted, and how is the product notified?"))
                exp = "bohui-regulatory-us-na" if m == "us" else C["expert"]
            elif c == "cleansing":
                qz, qe = (f"在{M['zh']}做氨基酸洁面代工,表活体系怎么选、备案与标签要注意什么?",
                          f"Amino-acid cleanser OEM for {M['en']}: how is the surfactant system chosen, and what must be right for notification and labeling?")
                exp = C["expert"]
            elif c == "body-care":
                qz, qe = ((f"在{M['zh']}做身体乳 / 沐浴露代工,香精过敏原、清真来源与标签怎么处理?",
                           f"Body lotion and body wash OEM for {M['en']}: how are fragrance allergens, halal sourcing and labeling handled?") if halal else
                          (f"在{M['zh']}做身体乳 / 沐浴露代工,香精过敏原与标签怎么处理?",
                           f"Body lotion and body wash OEM for {M['en']}: how are fragrance allergens and labeling handled?"))
                exp = C["expert"]
            else:  # makeup
                qz, qe = (f"在{M['zh']}做唇釉 / 粉底代工,色料清单与重金属要求怎么过?",
                          f"Lip gloss and foundation OEM for {M['en']}: how are colourant lists and heavy-metal limits met?")
                exp = "bohui-regulatory-us-na" if m == "us" else C["expert"]
            res.append({"src": "combo", "slug": f"{m}-{c}-oem", "q_zh": qz, "q_en": qe, "market": m, "category": c, "expert": exp})
    return res


def pool_experts(ctx, existing_q):
    """③ 专家触发词反推:每位面向买手的专家一题(10 位一批问模型)"""
    res = []
    rows = d1("SELECT slug, title, triggers FROM expert_skills WHERE kind='expert'")
    rows = [r for r in rows if r["slug"] in BUYER_EXPERTS]
    for i in range(0, len(rows), 10):
        batch = rows[i:i + 10]
        sysm = ("你是化妆品代工厂的内容与 GEO 专家。下面每位专家的触发词是客户常提的词。请为每位专家写 1 个**品牌方买手在挑选中国代工厂时会问出口的整句问题**(买手视角,不是工厂内部流程),"
                "题目之间不重复、也不与「已有的题」重复;避开只能由报价回答的问题(起订量 / 价格 / 交期)。"
                "只输出 JSON 数组:[{\"slug\":\"专家slug原样\",\"q_zh\":\"中文整句\",\"q_en\":\"English\",\"topic\":\"3-5-word-ascii-slug\",\"market\":\"id|my|sa|ae|ph|vn|th|us|eu|cn|null\",\"category\":\"skincare|body-care|hair-care|cleansing|sun-care|makeup|null\"}]")
        usr = "\n".join(f"- {r['slug']} | {r['title']} | {str(r['triggers'])[:220]}" for r in batch) + "\n\n已有的题(避开):\n" + "\n".join(existing_q)
        out, prov, err = ask([{"role": "system", "content": sysm}, {"role": "user", "content": usr}], max_tokens=3000)
        items = out if isinstance(out, list) else None
        if not items:
            print(f"  ③ 专家批 {i // 10 + 1} 失败:{err}"); continue
        for it in items:
            if it.get("slug") not in ctx["expert"] or not it.get("q_zh") or not it.get("q_en"): continue
            m = it.get("market") if it.get("market") in MARKETS or it.get("market") in ("eu", "cn") else None
            c = it.get("category") if it.get("category") in CATS else None
            res.append({"src": "expert", "slug": "ask-" + slugify(it.get("topic"), it["slug"].replace("bohui-", "")), "q_zh": it["q_zh"].strip(), "q_en": it["q_en"].strip(),
                        "market": m, "category": c, "expert": it["slug"]})
        print(f"  ③ 专家批 {i // 10 + 1}:{len(items)} 题({prov})")
    return res


# ── 写答案 ─────────────────────────────────────────────────────────────────────
def write_answer(ctx, item):
    ex = ctx["expert"].get(item["expert"]) or ctx["expert"]["bohui-regulatory-apac-emerging"]
    core = re.sub(r"\n{2,}", "\n", str(ex["core"]))[:2600]
    ev = evidence(ctx, item.get("market"))
    sysm = (f"你是帛卉化妆品(广州,品牌 BIOSPHERE)的角色专家「{ex['title']}」。按下面的专家口径回答一位品牌方买手的问题。\n<专家口径>\n{core}\n</专家口径>\n"
            f"<可引用的事实(只准用这些数字与名称;别的数字一律不写)>\n{FACTS}\n{ev}\n</可引用的事实>\n"
            "写法:证据先行 —— 第一句就是结论,并点名依据(法规名 / 目录名 / 检测标准);客观第三人称,不用「我们」「本公司」「贵司」「您」;"
            "帛卉的产线 / 认证事实只在与问题直接相关时提一次(例如问审厂就提 ISO 22716 与 36 项质检),不要为了用数字把产能、面积、配方数往每段里塞;不提事实清单里没有的体系名(如 HACCP);"
            "不堆形容词;每一段都能被 AI 单独摘出引用;涉及法规写「以最新官方文本为准」;不写任何起订量 / 交期 / 价格 / 账期数字,写「以书面报价为准」;不出现 SueAI、集团;"
            "不要在句尾加 ①②③ 之类的分层标记(那是内部口径,对外页面不带)。"
            "不要使用「起订量 / 交期 / 出样 / 打样周期 / MOQ / lead time / sampling time / units」这些词 —— 含这些词的句子会被整句删掉(工厂口径未填);要讲周期就说「以书面报价为准」,要讲出样只能原样引用「通常 5–14 天」。"
            "中英文各自独立成文(英文按目标读者重写,不是逐句翻译),术语与机构名保留原文(BPOM、NPRA、SFDA、MoCRA、CPNP、ISO 11930、USP <51>、INCI)。\n"
            "只输出 JSON:{\"dim\":\"scene|compare|decide\",\"lead_zh\":\"结论 120–200 字\",\"lead_en\":\"conclusion 80–140 words\","
            "\"sections\":[{\"h_zh\":\"小标题\",\"b_zh\":\"≤90 字\",\"h_en\":\"heading\",\"b_en\":\"≤60 words\"},{...},{...}],"
            "\"faqs\":[{\"q_zh\":\"追问\",\"a_zh\":\"≤60 字\",\"q_en\":\"follow-up\",\"a_en\":\"≤40 words\"},{...}]}(sections 恰好 3 个,faqs 恰好 2 个)")
    usr = f"买手的问题:{item['q_zh']}\nBuyer's question: {item['q_en']}" + (f"\n目标市场:{MARKETS[item['market']]['zh']}" if item.get("market") in MARKETS else "") + (f"\n品类:{CATS[item['category']]['zh']}" if item.get("category") in CATS else "")
    for attempt in range(2):
        out, prov, err = ask([{"role": "system", "content": sysm}, {"role": "user", "content": usr}], max_tokens=3800)
        ok = (isinstance(out, dict) and out.get("lead_zh") and out.get("lead_en") and isinstance(out.get("sections"), list) and len(out["sections"]) >= 3
              and isinstance(out.get("faqs"), list) and len(out["faqs"]) >= 2 and 80 <= len(out["lead_zh"]) <= 320)
        if ok: break
        err = err or (f"结构不完整 / 结论 {len((out or {}).get('lead_zh') or '')} 字" if isinstance(out, dict) else "无 JSON")
    if not ok:
        return None, err
    secs = [{k: str(s.get(k, "")).strip() for k in ("h_zh", "b_zh", "h_en", "b_en")} for s in out["sections"][:3]]
    faqs = [{k: str(f.get(k, "")).strip() for k in ("q_zh", "a_zh", "q_en", "a_en")} for f in out["faqs"][:2]]
    row = {**item, "dim": out.get("dim") if out.get("dim") in ("scene", "compare", "decide") else ("decide" if item["src"] == "combo" else "scene"),
           "lead_zh": out["lead_zh"].strip(), "lead_en": out["lead_en"].strip(), "sections": secs, "faqs": faqs, "sources": sources_for(ctx, item), "model": prov}
    # 商务数字句整句删(与 geo-answers.py 同一把尺);禁词整句删
    if not terms_confirmed():
        for k in ("lead_zh", "lead_en"): row[k] = scrub(row[k])
        for s in row["sections"]:
            for k in ("b_zh", "b_en"): s[k] = scrub(s[k])
        for f in row["faqs"]:
            for k in ("a_zh", "a_en"): f[k] = scrub(f[k])
    for k in ("lead_zh", "lead_en"):
        row[k] = " ".join(x for x in re.split(r"(?<=[。.!?])\s*", row[k]) if not BAN.search(x)).strip()
    # 认知分层标记 ①②③ 是专家口径的内部记号,对外页面一律去掉
    tier = lambda t: re.sub(r"\s*[①②③]\s*", " ", t).replace("  ", " ").strip()  # noqa: E731
    row["lead_zh"], row["lead_en"] = tier(row["lead_zh"]), tier(row["lead_en"])
    for s_ in row["sections"]:
        for k in ("h_zh", "b_zh", "h_en", "b_en"): s_[k] = tier(s_[k])
    for f in row["faqs"]:
        for k in ("q_zh", "a_zh", "q_en", "a_en"): f[k] = tier(f[k])
    return row, ""


def sources_for(ctx, item):
    src = []
    m, c = item.get("market"), item.get("category")
    if m in ctx["reg"]:
        src.append({"t": f"各国法规 · {ctx['reg'][m].get('country_zh') or m}", "u": f"/zh-cn/regulations/{m}/"})
    if m in MARKETS and c in CATS:
        src.append({"t": f"{MARKETS[m]['zh']}{CATS[c]['zh']}代工", "u": f"/zh-cn/oem/{m}/{c}/"})
    reg = (ctx["reg"].get(m) or {}).get("inci_registry") if m else None
    if reg and reg in ctx["registry"]:
        src.append({"t": ctx["registry"][reg], "u": f"/zh-cn/inci/{reg}/"})
    if c in ("skincare", "body-care", "hair-care", "cleansing", "sun-care", "makeup") or item["src"] == "expert":
        src.append({"t": "配方库", "u": "/zh-cn/formulas/"})
    src.append({"t": "质检体系", "u": "/zh-cn/qc/"})
    return src[:4]


# ── 输出 ─────────────────────────────────────────────────────────────────────
def to_md(rows):
    L = [f"# 买手问答扩容 · 人审样本 {len(rows)} 题({dt.date.today()})\n",
         "> 来源:① 真实问题(外联切入点 + 询盘原文归纳)② 市场 × 品类意图组合 ③ 专家触发词反推。每题套对应专家 core 由模型自写,证据先行;商务数字一律「以书面报价为准」。",
         "> 审法:结论是否成立、依据有没有引错、有没有越线的宣称。样本稿(20 题)审过后跑 `python tools/geo/answers-expand.py --apply` 写库;全量稿说明这些题已在 geo_answers 里、随下一次构建上线(/zh-cn/answers/<slug>/ 与 /en/…)。",
         "> 审出问题的题:直接 `DELETE FROM geo_answers WHERE slug='…'`,或把 tools/geo/_expand-cache.json 里该 slug 的 rows 删掉再跑 `--apply`(会按当前提示词重写这一题)。\n"]
    for i, r in enumerate(rows, 1):
        L += [f"## {i}. {r['q_zh']}", f"*{r['q_en']}*  ",
              f"`{r['slug']}` · 来源 {r['src']} · 市场 {r.get('market') or '通用'} · 品类 {r.get('category') or '通用'} · 专家 {r['expert']} · 维度 {r['dim']} · 模型 {r.get('model')}\n",
              f"**结论(中)** {r['lead_zh']}\n", f"**Conclusion (EN)** {r['lead_en']}\n"]
        for s in r["sections"]: L.append(f"- **{s['h_zh']}** {s['b_zh']}  \n  *{s['h_en']}* {s['b_en']}")
        L.append("")
        for f in r["faqs"]: L.append(f"- Q:{f['q_zh']} — {f['a_zh']}  \n  Q: {f['q_en']} — {f['a_en']}")
        L.append("\n来源:" + " · ".join(f"[{s['t']}]({s['u']})" for s in r["sources"]) + "\n")
    return "\n".join(L)


def to_sql(rows):
    lines = []
    for r in rows:
        lines.append("INSERT INTO geo_answers (slug,dim,q_zh,q_en,lead_zh,lead_en,sections_json,faqs_json,sources_json,market,category,expert,updated_at) VALUES ("
                     + ",".join([q(r["slug"]), q(r["dim"]), q(r["q_zh"]), q(r["q_en"]), q(r["lead_zh"]), q(r["lead_en"]), q(json.dumps(r["sections"], ensure_ascii=False)),
                                 q(json.dumps(r["faqs"], ensure_ascii=False)), q(json.dumps(r["sources"], ensure_ascii=False)), q(r.get("market")), q(r.get("category")), q(r["expert"]), "datetime('now')"])
                     + ") ON CONFLICT(slug) DO UPDATE SET dim=excluded.dim,q_zh=excluded.q_zh,q_en=excluded.q_en,lead_zh=excluded.lead_zh,lead_en=excluded.lead_en,"
                       "sections_json=excluded.sections_json,faqs_json=excluded.faqs_json,sources_json=excluded.sources_json,market=excluded.market,category=excluded.category,expert=excluded.expert,updated_at=excluded.updated_at;")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="补齐到 target 并写库;不加只出 20 题人审样本")
    ap.add_argument("--target", type=int, default=100)
    ap.add_argument("--sample", type=int, default=20)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--md-only", action="store_true", help="只从缓存重出人审稿,不调模型不写库")
    a = ap.parse_args()
    if not provs: raise SystemExit("舰队里没有 Agnes / 商汤可用")
    print(f"舰队:{[p['id'] for p in provs][:4]} …")

    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {"pool": [], "rows": {}}
    ctx = load_context()
    existing = d1("SELECT slug, q_zh FROM geo_answers ORDER BY slug")
    have = {r["slug"] for r in existing}
    print(f"库里已有 {len(have)} 题 · 目标 {a.target}")

    # 题目池(缓存:不重复调模型)
    if not cache["pool"]:
        eq = [r["q_zh"] for r in existing]
        pool = pool_real(eq)
        pool += pool_combos()
        pool += pool_experts(ctx, eq + [p["q_zh"] for p in pool])
        seen = set(have); uniq = []
        for p in pool:
            s = p["slug"]; n = 2
            while s in seen: s = f"{p['slug']}-{n}"; n += 1
            p["slug"] = s; seen.add(s); uniq.append(p)
        cache["pool"] = uniq
        io.open(CACHE, "w", encoding="utf-8", newline="\n").write(json.dumps(cache, ensure_ascii=False, indent=1))
    # 定位铁令(09-16):接大单不打小批量牌 —— 问「起订量能不能低 / 小批量」的题不做页(moq-lead-* 已按「怎么定」讲过);
    # 问句里带「N 天交付」的是在要承诺(外联草稿里那句 45–60 天出样就是这么混进来的);口服类不是化妆品。模型归纳时都会带出来,这里剔
    SMALL = re.compile(r"起订|小批量|小单|试单|MOQ|small[- ]batch|low[- ]moq|minimum order|low volume|\d+\s*天|\d+\s*days|口服", re.I)
    NAMES = {**{k: (v["zh"], v["en"].split()[-1]) for k, v in MARKETS.items()}, "eu": ("欧盟", "EU"), "cn": ("中国", "China"), "jp": ("日本", "Japan"), "kr": ("韩国", "Korea")}
    for p in cache["pool"]:   # 模型标的市场必须在问句里出现,否则当通用题(09-18 实测:问日本的题被标成 vn)
        m = p.get("market")
        if m in NAMES and not (NAMES[m][0] in p["q_zh"] or NAMES[m][1].lower() in p["q_en"].lower()):
            hit = [k for k, (zh, en) in NAMES.items() if zh in p["q_zh"] or en.lower() in p["q_en"].lower()]
            p["market"] = hit[0] if len(hit) == 1 else None
        elif m and m not in NAMES:
            p["market"] = None
    known = {p["slug"] for p in cache["pool"]}   # COMBOS 加了新组合时补进池尾(不重新调模型归纳)
    cache["pool"] += [p for p in pool_combos() if p["slug"] not in known]
    pool = [p for p in cache["pool"] if not SMALL.search(p["q_zh"] + " " + p["q_en"] + " " + p["slug"])]
    pool_new = [p for p in pool if p["slug"] not in have]
    pool_redo = [p for p in pool if p["slug"] in have and p["slug"] not in cache["rows"]]   # 库里有、缓存被清掉的 = 人审后要重写的题
    print(f"题目池 {len(cache['pool'])} 题(真实 {sum(p['src'] == 'real' for p in cache['pool'])} · 组合 {sum(p['src'] == 'combo' for p in cache['pool'])} · 专家 {sum(p['src'] == 'expert' for p in cache['pool'])})")

    need = (a.target - len(have)) if a.apply else a.sample
    def dump_md(rs):
        os.makedirs(os.path.dirname(SAMPLE_MD), exist_ok=True)
        io.open(SAMPLE_MD, "w", encoding="utf-8", newline="\n").write(to_md(rs)); print(f"人审稿 → {SAMPLE_MD}({len(rs)} 题)")
    if a.md_only or (a.apply and need <= 0 and not pool_redo):
        dump_md([cache["rows"][p["slug"]] for p in pool if p["slug"] in cache["rows"]])
        if not a.md_only: print("已达标,不再生成")
        return
    # 样本取三类混合(前 6 真实、8 组合、6 专家),全量按池顺序补到 need
    if a.apply:
        todo = pool_redo + pool_new[:max(need, 0)]
    else:
        by = {k: [p for p in pool_new if p["src"] == k] for k in ("real", "combo", "expert")}
        todo = (by["real"][:6] + by["combo"][:8] + by["expert"][:6])[:need]
    todo_gen = [p for p in todo if p["slug"] not in cache["rows"]]
    print(f"这次 {len(todo)} 题,其中 {len(todo_gen)} 题要写答案(其余取缓存)")

    t0 = time.time(); fails = []
    with job("geo-answers-expand", total=len(todo_gen)) as J:
        def one(p):
            row, err = write_answer(ctx, p)
            return p, row, err
        done = 0
        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            for p, row, err in ex.map(one, todo_gen):
                done += 1
                if row:
                    cache["rows"][p["slug"]] = row
                    print(f"  ✓ {done}/{len(todo_gen)} {p['slug']} ({row['model']}, {len(row['lead_zh'])} 字, {(time.time() - t0) / 60:.1f} 分)", flush=True)
                else:
                    fails.append(p["slug"]); print(f"  ✗ {p['slug']}: {err}", flush=True)
                J.tick(done, p["slug"])
                if done % 5 == 0: io.open(CACHE, "w", encoding="utf-8", newline="\n").write(json.dumps(cache, ensure_ascii=False, indent=1))
    io.open(CACHE, "w", encoding="utf-8", newline="\n").write(json.dumps(cache, ensure_ascii=False, indent=1))
    rows = []
    for p in todo:
        if p["slug"] not in cache["rows"]: continue
        r = cache["rows"][p["slug"]]; r["market"], r["category"] = p.get("market"), p.get("category"); r["sources"] = sources_for(ctx, r); rows.append(r)
    print(f"写好 {len(rows)} 题 · 失败 {len(fails)}{(':' + ', '.join(fails)) if fails else ''} · 用时 {(time.time() - t0) / 60:.1f} 分")

    # 人审稿:样本模式写 20 题;--apply 时把缓存里全部题写进同一份(审的人看全量,不用再翻库)
    dump_md([cache["rows"][p["slug"]] for p in pool if p["slug"] in cache["rows"]] if a.apply else rows)
    if not a.apply:
        print("加 --apply 才写库"); return
    sql = os.path.join(HERE, "_expand.sql"); total = 0
    for i in range(0, len(rows), 40):
        io.open(sql, "w", encoding="utf-8", newline="\n").write(to_sql(rows[i:i + 40])); total += d1_exec(sql) or 0
    n = d1("SELECT COUNT(*) n FROM geo_answers")
    print(f"入库 {total} 行 · geo_answers 现有 {n[0]['n'] if n else '?'} 题")
    print("其它语种:python tools/geo-answers-i18n.py(只翻没翻过的)")


if __name__ == "__main__":
    main()
