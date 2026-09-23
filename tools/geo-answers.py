#!/usr/bin/env python3
"""AI 获客:答案型内容生成 —— 把库里的真数字组装成买手会问的那些问题的答案。

由来(创始人 2026-09-10 12:3x 发来一套 GEO 打法,并说「抓紧变现,才是我们急需要做的」)。
那套打法的核心三条,这里照做:
  ① 问句要是买手真会问的整句话,不是关键词;按「使用场景 / 功能对比 / 购买决策」分三维。
  ② 结论前置,中间按场景分点、每点至少一个具体数字,结尾 FAQ。
  ③ 不用第一人称品牌口吻,保持客观 —— AI 引用客观陈述,不引用广告。

但有一条我不照做:数字不能让模型编。
那套打法里「把产品参数丢给 ChatGPT 写 1500 字」在消费品上行得通,在我们这里不行 ——
起订量、交期、备案步骤写错一个,客户拿去报价就出事。所以这里的每个数字都从库里取:
  · 起订量与交期 ← formulas / packaging 表的真实区间
  · 备案步骤与官方链接 ← inci_registry / 合规索引里已核过的条目
  · 检验项与依据 ← qc_items 的 36 条
取不到数的问题宁可不生成,也不写「通常」「一般来说」这种糊过去的话。

用法:
    python tools/geo-answers.py            体检
    python tools/geo-answers.py --apply    写库
"""
import argparse
import re
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

CAT_ZH = {
    "skincare": "护肤", "body": "身体护理", "makeup": "彩妆", "oral": "口腔护理",
    "cleansing": "清洁", "suncare": "防晒", "haircare": "洗护", "kids": "儿童护理",
    "fragrance": "香氛",
}
CAT_EN = {
    "skincare": "skincare", "body": "body care", "makeup": "colour cosmetics", "oral": "oral care",
    "cleansing": "cleansing", "suncare": "sun care", "haircare": "hair care", "kids": "kids care",
    "fragrance": "fragrance",
}
MARKET_ZH = {
    "id": "印尼", "th": "泰国", "my": "马来西亚", "vn": "越南", "ph": "菲律宾", "sg": "新加坡",
}


def fetch():
    d = {}
    d["moq"] = {r["category"]: (int(r["mn"]), int(r["mx"]), int(r["n"])) for r in d1(
        "SELECT category, MIN(moq) mn, MAX(moq) mx, COUNT(*) n FROM formulas WHERE moq > 0 GROUP BY category")}
    d["lead"] = {r["category"]: (int(r["mn"]), int(r["mx"])) for r in d1(
        "SELECT category, MIN(lead_days) mn, MAX(lead_days) mx FROM formulas WHERE lead_days > 0 GROUP BY category")}
    d["packmoq"] = {r["type"]: (int(r["mn"]), int(r["n"])) for r in d1(
        "SELECT type, MIN(moq) mn, COUNT(*) n FROM packaging WHERE moq > 0 GROUP BY type")}
    d["nf"] = {r["category"]: int(r["n"]) for r in d1(
        "SELECT category, COUNT(*) n FROM formulas GROUP BY category")}
    d["qc"] = int((d1("SELECT COUNT(*) n FROM qc_items") or [{"n": 0}])[0]["n"])
    d["inci"] = int((d1("SELECT COUNT(*) n FROM inci_catalog") or [{"n": 0}])[0]["n"])
    d["ing"] = int((d1("SELECT COUNT(*) n FROM ingredients") or [{"n": 0}])[0]["n"])
    d["pack"] = int((d1("SELECT COUNT(*) n FROM packaging") or [{"n": 0}])[0]["n"])
    return d


def terms_confirmed():
    """工厂口径页(playbooks.factory-terms)还有「(待填)」就算未确认 —— 创始人 2026-09-16 铁令:起订量 / 出样 / 交期 / 价格只准用那一页的数字。
    未确认时:moq-lead-* 生成无数字版(讲怎么定、不讲多少),其它答案里带起订量 / 交期数字的句子整句删掉。"""
    r = d1("SELECT body FROM playbooks WHERE slug='factory-terms'")
    return bool(r) and "(待填)" not in (r[0].get("body") or "")


_SD_OK = re.compile(r"5–14 天|5–14 days")
_NUM_ZH = re.compile(r"[^。;；\n]*(?:起订量|起订|交期|打样周期|出样|\d[\d,]*\s*(?:支|只|个|套)起|MOQ)[^。;；\n]*[。;；]?")
_NUM_EN = re.compile(r"[^.;\n]*(?:MOQ|units? (?:on|and)|start at|starts? at|lead time|sampling|\d[\d,]* units)[^.;\n]*[.;]?", re.I)


def scrub(t):
    """删掉含起订量 / 交期数字的整句(中英各自的句号切分),其余原样。"""
    if not t: return t
    keep = lambda m: m.group(0) if _SD_OK.search(m.group(0)) else ""   # noqa: E731  出样 5–14 天是口径页已填的数字,放行
    t = _NUM_ZH.sub(keep, t); t = _NUM_EN.sub(keep, t)
    return re.sub(r"\s{2,}", " ", t).strip()


def build(d):
    out = []
    confirmed = terms_confirmed()

    def add(slug, dim, q_zh, q_en, lead_zh, lead_en, secs, faqs, src):
        out.append({
            "slug": slug, "dim": dim, "q_zh": q_zh, "q_en": q_en,
            "lead_zh": lead_zh, "lead_en": lead_en,
            "sections": secs, "faqs": faqs, "sources": src,
        })

    # ── 维度一:使用场景 ────────────────────────────────────────────
    for cat, zh in CAT_ZH.items():
        mo = d["moq"].get(cat)
        le = d["lead"].get(cat)
        nf = d["nf"].get(cat, 0)
        if not confirmed:      # 工厂口径未填:讲「起订量和交期由什么决定」,一个数字都不给(大单定位:讲产能与流程,不打小批量牌)
            add(
                f"moq-lead-{cat}", "scene",
                f"做{zh}类产品代工,起订量和交期是怎么定的?",
                f"How are MOQ and lead time set for {CAT_EN[cat]} OEM?",
                f"{zh}类现有成熟配方 {nf} 条。出样通常 5–14 天(现有基底靠短的一头,全新配方靠长的一头);起订量和大货交期不是一个统一数字,由三件事决定:剂型与灌装线、包材是现成瓶型还是开模、配方是否改动;按项目出书面报价单。",
                f"{nf} proven {CAT_EN[cat]} formulations are on file. Samples usually ship in 5–14 days (existing bases at the short end, new formulations at the long end). MOQ and production lead time are not a single figure: they follow the format and filling line, "
                f"whether the packaging is a stock shape or a new mould, and whether the formula changes. Terms are issued per project in a written quotation.",
                [
                    {"h_zh": "规模化订单怎么算", "b_zh": "同一配方多规格合并计算配方侧数量;包材按每个规格各自的瓶型门槛计;整柜出货时按柜量倒推批次,单支成本最低。",
                     "h_en": "How large runs are costed", "b_en": "Sizes sharing one formulation are combined on the formulation side; packaging is counted per size by its bottle threshold; full-container shipments set the batch plan and give the lowest unit cost."},
                    {"h_zh": "改配方或改包材", "b_zh": "改配方要重做稳定性(40℃ 加速 3 个月)与防腐挑战(ISO 11930 / USP <51>);换包材要重做相容性。这两项决定交期的长短,不是产线。",
                     "h_en": "Reformulating or changing packaging", "b_en": "A reformulation re-runs stability (40C accelerated, 3 months) and preservative challenge testing (ISO 11930 / USP <51>); a packaging change re-runs compatibility. These tests, not the filling line, set the lead time."},
                    {"h_zh": "多规格同时上", "b_zh": "共用一条配方、多套包材是常见做法:配方侧数量合并,包材侧各算各的,总量不变而单支更可控。",
                     "h_en": "Launching several sizes at once", "b_en": "One formulation with several packaging sets is the usual pattern: quantities merge on the formulation side and are counted per size on the packaging side."},
                ],
                [
                    {"q_zh": "起订量能不能再低?", "a_zh": "能谈的是包材那一侧:用库内常规瓶型比开新模低一个量级。配方侧的下限由灌装批量决定,报价单上会写明。",
                     "q_en": "Can the MOQ go lower?", "a_en": "The packaging side is where it moves: stock bottle shapes sit an order of magnitude below a new mould. The formulation floor is set by the filling batch and is stated in the quotation."},
                    {"q_zh": "交期从哪天开始算?", "a_zh": "从包材到厂且配方确认之日起算;包材未到的等待时间不计入,报价单上会写清楚。",
                     "q_en": "When does the lead time start?", "a_en": "From the date packaging arrives and the formulation is signed off; waiting for packaging is not counted, and the quotation says so."},
                ],
                [{"t": "配方库", "u": "/zh-cn/formulas/"}, {"t": "质检体系", "u": "/zh-cn/qc/"}],
            )
            continue
        if not mo or not le:
            continue           # 取不到真数就不生成这一条
        lo, hi, _n = mo
        l1, l2 = le
        add(
            f"moq-lead-{cat}", "scene",
            f"做{zh}类产品代工,起订量和打样交期分别是多少?",
            f"What is the MOQ and sampling lead time for {CAT_EN[cat]} OEM?",
            f"{zh}类现有成熟配方 {nf} 条,起订量区间 {lo:,}–{hi:,} 支,量产交期 {l1}–{l2} 天。"
            f"起订量由剂型与包材共同决定,不是单一数字。",
            f"{nf} proven {CAT_EN[cat]} formulations are on file; MOQ ranges from {lo:,} to {hi:,} units "
            f"and production lead time from {l1} to {l2} days. MOQ is set by the format and the packaging together, not by one number.",
            [
                {"h_zh": "场景一:验证市场,先小批出货",
                 "b_zh": f"取库内成熟配方直接投产,起订量落在 {lo:,} 支这一档,交期 {l1} 天起。"
                         f"配方不改动是压住起订量的前提 —— 一旦改配方就要重新做稳定性与相容性,时间和量都会上去。",
                 "h_en": "Scenario 1: test the market with a small run",
                 "b_en": f"Running an existing formulation unchanged keeps MOQ at the {lo:,}-unit end and lead time from {l1} days. "
                         f"Keeping the formula unchanged is what holds the MOQ down: any change re-triggers stability and compatibility work."},
                {"h_zh": "场景二:改配方或改包材",
                 "b_zh": f"改配方要重做稳定性(40℃ 加速 3 个月)与防腐挑战(ISO 11930 / USP <51>),交期上浮到 {l2} 天一档;"
                         f"换包材要重做相容性,起订量按包材那一侧的门槛走。",
                 "h_en": "Scenario 2: reformulate or change packaging",
                 "b_en": f"A reformulation re-runs stability (40C accelerated, 3 months) and preservative challenge testing (ISO 11930 / USP <51>), "
                         f"pushing lead time toward {l2} days; a packaging change re-runs compatibility and the MOQ follows the packaging threshold."},
                {"h_zh": "场景三:多规格同时上",
                 "b_zh": "同配方不同规格可以合并起订量计算,但每个规格的包材各自计 MOQ —— "
                         "三个规格常见的做法是共用一条配方、三套包材,总量不变而单支成本更可控。",
                 "h_en": "Scenario 3: launching several sizes at once",
                 "b_en": "Sizes sharing one formulation can be combined for the formulation MOQ, but each size carries its own packaging MOQ."},
            ],
            [
                {"q_zh": "起订量能不能再低?", "a_zh": "能谈的是包材那一侧:选库内常规瓶型比开新模低一个量级。配方侧低于区间下限时,"
                                                "单支成本会显著上升,通常不划算。",
                 "q_en": "Can the MOQ go lower?", "a_en": "The packaging side is where it moves: stock bottle shapes sit an order of magnitude "
                                                          "below a new mould. Below the formulation range, unit cost rises sharply."},
                {"q_zh": "交期从哪天开始算?", "a_zh": f"从包材到厂且配方确认之日起算 {l1}–{l2} 天。包材未到的等待时间不计入,"
                                                 "这一点在报价单上会写清楚。",
                 "q_en": "When does the lead time start?", "a_en": f"{l1}–{l2} days from the date packaging arrives and the formulation is signed off."},
            ],
            [{"t": "配方库", "u": "/zh-cn/formulas/"}, {"t": "包材库", "u": "/zh-cn/packaging/"}],
        )

    # ── 维度二:功能对比 ────────────────────────────────────────────
    jar = d["packmoq"].get("jar")
    airless = d["packmoq"].get("airless-bottle")
    if jar and airless:
        add(
            "jar-vs-airless", "compare",
            "膏霜罐和真空瓶怎么选?高活性精华应该用哪种?",
            "Jar or airless bottle: which packaging suits a high-active serum?",
            f"含视黄醇、多肽、维生素 C 这类易氧化活性物的产品选真空瓶,不选广口膏霜罐。"
            f"库内真空瓶起订量从 {airless[0]:,} 支起、共 {airless[1]} 款,膏霜罐从 {jar[0]:,} 支起、共 {jar[1]} 款。",
            f"Products built on oxidation-sensitive actives (retinol, peptides, vitamin C) belong in an airless bottle rather than an open jar. "
            f"Airless options start at {airless[0]:,} units ({airless[1]} on file); jars start at {jar[0]:,} units ({jar[1]} on file).",
            [
                {"h_zh": "氧化与污染", "b_zh": "广口罐每次使用都开盖接触空气与手指,活性物衰减与微生物负荷都比真空瓶高;"
                                            "真空活塞出料全程不回气,配方不接触外界。",
                 "h_en": "Oxidation and contamination",
                 "b_en": "An open jar exposes the product to air and fingers at every use; an airless piston never lets air back in."},
                {"h_zh": "用量可控性", "b_zh": "真空泵单泵出量可设定(常见 0.15–0.2ml),便于在说明书上写清用量;膏霜罐靠目测,用量差异大。",
                 "h_en": "Dose control",
                 "b_en": "An airless pump delivers a set dose (commonly 0.15–0.2 ml), which lets the leaflet state the amount; a jar leaves it to the eye."},
                {"h_zh": "成本与观感", "b_zh": "同容量下真空瓶单价高于膏霜罐;而膏霜罐在厚质地面霜与身体霜上仍是主流,"
                                            "开盖挖取的仪式感是它的卖点,不是缺点。",
                 "h_en": "Cost and perception",
                 "b_en": "At the same fill volume an airless bottle costs more; jars remain the norm for rich creams and body butters."},
            ],
            [
                {"q_zh": "真空瓶会不会有残留?", "a_zh": "活塞式残留率通常低于袋式,具体按瓶型实测;报价前可以要一支实瓶做残留测试。",
                 "q_en": "Does an airless bottle leave residue?", "a_en": "Piston types typically leave less than pouch types; measure on the actual bottle before committing."},
                {"q_zh": "膏霜罐能不能做高活性?", "a_zh": "可以,但要在配方侧补偿:提高抗氧体系、下调活性物上限、并把开盖后使用期(PAO)标短。",
                 "q_en": "Can a jar carry high actives?", "a_en": "Yes, but the formula must compensate: stronger antioxidant system, lower active ceiling, shorter PAO."},
            ],
            [{"t": "包材库 · 真空瓶", "u": "/zh-cn/packaging/?t=airless-bottle"}, {"t": "质检体系", "u": "/zh-cn/qc/"}],
        )

    # ── 维度三:购买决策 ────────────────────────────────────────────
    add(
        "asean-notification", "decide",
        "产品要卖东南亚六国,备案分别要多久、卡在哪一步?",
        "Selling into the six ASEAN markets: how long does notification take and where does it stall?",
        "六国走的是通报制不是审批制,但账号资质是真正的门槛:印尼要本地 PT 公司与 NIB,"
        "马来西亚要 MSC TrustGate 的硬件电子签,越南要国家单一窗口账号。"
        "账号准备的时间通常比通报本身长。",
        "The six ASEAN markets run notification rather than approval, but the account prerequisites are the real gate: "
        "Indonesia needs a local PT entity and NIB, Malaysia needs an MSC TrustGate hardware token, Vietnam needs a National Single Window account. "
        "Setting up the account usually takes longer than the notification itself.",
        [
            {"h_zh": "先办账号,再谈通报",
             "b_zh": "印尼 BPOM Notifkos 要求 NIB + NPWP + API-U(进口时);马来西亚 NPRA Quest3+ 要求 USB 硬件签;"
                     "菲律宾要先拿 LTO 再做 e-Notification。这些都不是配方问题,是主体资质问题。",
             "h_en": "Get the account first",
             "b_en": "BPOM Notifkos needs NIB, NPWP and API-U for imports; NPRA Quest3+ needs a USB token; the Philippines needs an LTO before e-Notification."},
            {"h_zh": "资料一次到位,少一轮补件",
             "b_zh": "通报资料的共同项:成分表(含 INCI 与含量)、产品规格、生产商 GMP 证明、"
                     "自由销售证明、标签样稿。标签语言不合规是最常见的退件原因。",
             "h_en": "Prepare the dossier once",
             "b_en": "Common items: full ingredient list with INCI, product specification, manufacturer GMP evidence, free sale certificate, label artwork. "
                     "Non-compliant label language is the most common reason for rejection."},
            {"h_zh": "清真与本地化",
             "b_zh": "印尼自 2026-10-17 起对化妆品实施清真强制,BPJPH 认证要单独排期,不要压到最后。",
             "h_en": "Halal and localisation",
             "b_en": "Indonesia's halal requirement for cosmetics applies from 17 Oct 2026; BPJPH certification needs its own schedule."},
        ],
        [
            {"q_zh": "工厂能替我们备案吗?", "a_zh": "备案主体必须是当地持牌企业,工厂不能代持。工厂能做的是把技术资料按目的地清单备齐,"
                                            "并配合出具 GMP 与检测报告。",
             "q_en": "Can the factory file on our behalf?", "a_en": "The notification holder must be a locally licensed entity. "
                                                                    "The factory supplies the technical dossier, GMP evidence and test reports."},
            {"q_zh": "六国资料能复用吗?", "a_zh": "技术底稿大部分可复用(ASEAN 附录共用),但标签、语言与本地证明各国不同,不能整套照搬。",
             "q_en": "Can one dossier serve all six?", "a_en": "The technical core is shared under the ASEAN annexes; labels, languages and local certificates are not."},
        ],
        [{"t": "各国备案索引", "u": "/zh-cn/compliance/"}, {"t": "各国原料目录检索", "u": "/zh-cn/inci/"}],
    )

    add(
        "how-to-audit-oem", "decide",
        "怎么判断一家化妆品代工厂靠不靠谱?要问哪几个问题?",
        "How do you tell whether a cosmetics contract manufacturer is credible?",
        f"看三样能立刻分出高下:检验项能不能逐条说清、原料能不能追到批次、法规资料能不能按目的地给全。"
        f"可对照的具体数量:检验项 {d['qc']} 条、原料档案 {d['ing']} 味、包材 {d['pack']:,} 款、可检索原料目录 {d['inci']:,} 条。",
        f"Three checks separate the field: whether the control points can be stated one by one, whether an ingredient can be traced to a lot, "
        f"and whether the regulatory dossier can be assembled per destination. Concrete counts to compare against: {d['qc']} control points, "
        f"{d['ing']} ingredient dossiers, {d['pack']:,} packaging options and {d['inci']:,} searchable inventory entries.",
        [
            {"h_zh": "问检验:每一关查什么、依据哪条标准",
             "b_zh": "答得上「来料查 COA 与 INCI 目录、过程每 30 分钟记参数、成品做 ISO 11930 防腐挑战」的,"
                     "和只答「我们有全套质检」的,是两种工厂。",
             "h_en": "Ask about testing: what each checkpoint tests and on what basis",
             "b_en": "A factory that answers with named methods differs from one that says it has 'full QC'."},
            {"h_zh": "问溯源:一个成品批号能查回哪一步",
             "b_zh": "合理的答案是「查回原料供应商批号与产区」。答「能查到具体地块与采收日期」的要当心 ——"
                     "除非有地块台账与采收记录,否则这个答案是编的。",
             "h_en": "Ask about traceability: how far back a finished batch goes",
             "b_en": "A credible answer is the supplier lot and the source region. Claims of an exact plot and harvest date need a plot ledger to back them."},
            {"h_zh": "问法规:目的地清单能不能当场列出",
             "b_zh": "欧盟要 CPSR 与责任人,美国 MoCRA 要设施注册与产品列名,东盟六国各要一套账号资质。"
                     "列不出来的,通常是没做过那个市场。",
             "h_en": "Ask about regulations: can they list the destination checklist on the spot",
             "b_en": "EU needs a CPSR and a responsible person; the US needs MoCRA facility registration and product listing; each ASEAN market needs its own account."},
        ],
        [
            {"q_zh": "没有证书就不能合作吗?", "a_zh": "证书回答的是「有没有资格做」,检验记录回答的是「怎么做的」。两者都要看,只看证书容易踩坑。",
             "q_en": "Are certificates enough?", "a_en": "Certificates say whether a factory is qualified; records say how it actually works. Ask for both."},
            {"q_zh": "怎么验证配方库不是凑数的?", "a_zh": "随机挑三条配方,要求给出剂型、pH 区间、适用市场与已做过的检验项。凑数的库答不上第三项。",
             "q_en": "How do you check a formulation library is real?", "a_en": "Pick three at random and ask for format, pH range, target markets and tests already run."},
        ],
        [{"t": "质检体系", "u": "/zh-cn/qc/"}, {"t": "原料溯源", "u": "/zh-cn/origin/"}, {"t": "配方库", "u": "/zh-cn/formulas/"}],
    )

    # ── 维度三补充:六国逐个市场的备案问句(买手是按国家问的,不会问「东南亚」)──
    # 步骤与官方入口与 /compliance/ 那页同一套已核过的清单,不新编。
    MK = [
        ("id", "印尼", "Indonesia", "BPOM Notifkos",
         ["注册本地 PT 公司,在 OSS 取得 NIB 营业注册号", "办 NPWP 企业税号;进口货再办 API-U 进口商识别号",
          "在 BPOM Notifkos 开通报账号并逐品通报", "2026-10-17 起化妆品清真强制,BPJPH 认证单独排期"],
         ["Set up a local PT entity and obtain the NIB via OSS", "Register the NPWP tax ID; importers also need the API-U",
          "Open a BPOM Notifkos account and notify product by product", "Halal becomes mandatory for cosmetics from 17 Oct 2026 — schedule BPJPH separately"],
         "https://notifkos.pom.go.id/"),
        ("th", "泰国", "Thailand", "Thai FDA 化妆品通报",
         ["在商业发展厅 DBD 注册公司并取得税号", "向 Thai FDA 化妆品处开通报账号", "逐品提交化妆品通报,标签用泰文"],
         ["Register the company with DBD and obtain a tax ID", "Open a notification account with the Thai FDA Cosmetic Control Group",
          "Submit each product notification; labels in Thai"],
         "https://en.fda.moph.go.th/our-services-new/submission-of-application-on-cosmetic-notification"),
        ("my", "马来西亚", "Malaysia", "NPRA Quest3+",
         ["在 SSM 注册公司", "向 MSC TrustGate 申请 USB 硬件电子签(必需,无法跳过)", "在 NPRA Quest3+ 逐品通报"],
         ["Register the company with SSM", "Obtain the MSC TrustGate USB token (mandatory)", "Notify each product in NPRA Quest3+"],
         "https://npra.gov.my/index.php/en/quest3-system-basic/register-usb-token"),
        ("vn", "越南", "Vietnam", "DAV / 国家单一窗口",
         ["在国家企业注册门户注册企业", "开通国家单一窗口 NSW 账号", "向药品管理局 DAV 提交化妆品公告(通报)"],
         ["Register the enterprise on the National Business Registration Portal", "Open a National Single Window account",
          "Submit the cosmetic product proclamation to DAV"],
         "https://dav.gov.vn/"),
        ("ph", "菲律宾", "Philippines", "PFDA e-Notification",
         ["在 SEC 注册公司并向 BIR 登记税务", "先取得 FDA 经营许可 LTO", "在 FDA ePortal 做化妆品电子通报"],
         ["Register with the SEC and the BIR", "Obtain the FDA License to Operate (LTO) first", "File the cosmetic e-Notification on the FDA ePortal"],
         "https://eportal.fda.gov.ph/"),
        ("sg", "新加坡", "Singapore", "HSA PRISM",
         ["在 ACRA 注册公司", "在 HSA PRISM 开通账号", "上市前逐品通报,资料按 ASEAN 通报表格式"],
         ["Register the company with ACRA", "Open an HSA PRISM account", "Notify each product before placing on the market, in ASEAN notification format"],
         "https://www.hsa.gov.sg/cosmetic-products/cosmetic-product-notification/"),
    ]
    for cc, zh, en, sysname, steps_zh, steps_en, url in MK:
        add(
            f"notify-{cc}", "decide",
            f"化妆品进入{zh}市场,备案要走哪几步、卡在哪一步?",
            f"Entering the {en} cosmetics market: what are the notification steps and where does it stall?",
            f"{zh}走通报制,系统是 {sysname};真正耗时的是通报账号的主体资质,不是通报本身。"
            f"顺序固定:{' → '.join(steps_zh)}。",
            f"{en} runs a notification system ({sysname}); the time goes into the account prerequisites, not the notification itself. "
            f"The sequence is fixed: {' -> '.join(steps_en)}.",
            [{"h_zh": f"第 {i+1} 步:{z}", "b_zh": z, "h_en": f"Step {i+1}: {e}", "b_en": e}
             for i, (z, e) in enumerate(zip(steps_zh, steps_en))],
            [
                {"q_zh": "工厂能替品牌方通报吗?", "a_zh": "不能。通报主体必须是当地持牌企业;工厂提供技术资料、GMP 证明与检测报告。",
                 "q_en": "Can the factory notify on the brand's behalf?", "a_en": "No. The holder must be a locally licensed entity; the factory supplies the technical dossier, GMP evidence and test reports."},
                {"q_zh": "资料能沿用其他东盟国家的吗?", "a_zh": "技术底稿大部分通用(ASEAN 附录共用),标签语言与本地证明不通用。",
                 "q_en": "Can the dossier be reused from another ASEAN market?", "a_en": "The technical core largely carries over under the ASEAN annexes; labels and local certificates do not."},
            ],
            [{"t": f"{sysname} 官方入口", "u": url}, {"t": "各国备案索引", "u": "/zh-cn/compliance/"}, {"t": "各国原料目录检索", "u": "/zh-cn/inci/"}],
        )

    # ── 维度二补充:软管 vs 泵瓶(洗护与身体线最常问的两种)──
    tube = d["packmoq"].get("tube")
    pump = d["packmoq"].get("pump-bottle")
    if tube and pump:
        add(
            "tube-vs-pump", "compare",
            "洗护和身体护理产品,软管和泵瓶哪个更划算?",
            "Tube or pump bottle for wash and body care: which is the better buy?",
            f"200ml 以下、需要挤出可控用量的选软管;300ml 以上、浴室场景单手操作的选泵瓶。"
            f"库内软管起订量从 {tube[0]:,} 支起({tube[1]} 款),泵瓶从 {pump[0]:,} 支起({pump[1]} 款)。",
            f"Under 200 ml with controlled squeeze-out: tube. Over 300 ml, one-handed in the shower: pump bottle. "
            f"Tubes on file start at {tube[0]:,} units ({tube[1]} options); pump bottles at {pump[0]:,} units ({pump[1]} options).",
            [
                {"h_zh": "容量与使用姿势", "b_zh": "软管靠挤压,大容量后段挤不干净且手感差;泵瓶单手按压,浴室里最顺手,但小容量做泵瓶单价占比过高。",
                 "h_en": "Volume and handling", "b_en": "Tubes are squeezed and get awkward past 200 ml; pumps work one-handed but make little sense below 100 ml."},
                {"h_zh": "运输与货架", "b_zh": "软管平放装箱率高、破损率低;泵瓶要留泵头高度,箱规按泵头算,运费按体积走。",
                 "h_en": "Shipping and shelf", "b_en": "Tubes pack flat and break less; pumps need headroom for the pump and ship by volume."},
                {"h_zh": "回收与法规标识", "b_zh": "单一材质 PE 软管在欧盟回收标识上最省事;泵头含金属弹簧的泵瓶要标注拆分回收,或选无金属弹簧泵头。",
                 "h_en": "Recycling and labelling", "b_en": "A mono-material PE tube is the easiest EU recycling case; pumps with a metal spring need separation instructions or a spring-free pump."},
            ],
            [
                {"q_zh": "软管能做泵头吗?", "a_zh": "有软管泵头组合,但适配管径有限,起订量按泵头那一侧算。",
                 "q_en": "Can a tube take a pump?", "a_en": "Tube-pump combinations exist for a few neck sizes; MOQ follows the pump."},
            ],
            [{"t": "包材库 · 软管", "u": "/zh-cn/packaging/?t=tube"}, {"t": "包材库 · 泵瓶", "u": "/zh-cn/packaging/?t=pump-bottle"}],
        )

    # ── 第二批(2026-09-10 14:1x):欧美与中国备案、稳定性、防腐、彩盒、多语标签、清真 ──
    # 数字来源:qc_items 判定口径、inci_catalog 各目录条数、packaging 纸类 MOQ。取不到就跳过。
    reg = {r["registry"]: int(r["n"]) for r in d1(
        "SELECT registry, COUNT(*) n FROM inci_catalog GROUP BY registry")}
    pk = {r["type"]: (int(r["mn"]), int(r["n"])) for r in d1(
        "SELECT type, MIN(moq) mn, COUNT(*) n FROM packaging WHERE moq > 0 AND type IN "
        "('outer-carton','rigid-box','label-sticker','overwrap-film','shrink-film','leaflet','shipping-box') GROUP BY type")}
    eu_n = reg.get("eu-cosing", 0)
    ca_n = reg.get("ca-hotlist", 0)
    cn_n = reg.get("cn-nmpa-2021", 0)

    if eu_n:
        add(
            "eu-cpnp-cpsr", "decide",
            "产品出口欧盟要过哪几道:CPSR、责任人、CPNP 各要准备什么?",
            "Exporting cosmetics to the EU: what do the CPSR, the Responsible Person and CPNP each require?",
            f"欧盟不是备案制而是「自证 + 通报」:先由合格评估人出具 CPSR 安全评估报告(1223/2009 附件 I),"
            f"再由欧盟境内责任人在 CPNP 通报,产品才能上架。配方每一味都要先过 CosIng({eu_n:,} 条)"
            f"与附录 II–VI 的禁限用核对,这一步做在 CPSR 之前,不是之后。",
            f"The EU runs on self-certification plus notification: a qualified assessor issues the CPSR (Annex I of 1223/2009), "
            f"then an EU-based Responsible Person notifies the product in CPNP. Every ingredient is checked against CosIng "
            f"({eu_n:,} entries) and Annexes II–VI before the CPSR, not after.",
            [
                {"h_zh": "第一步:成分逐条过附录",
                 "b_zh": f"附录 II 禁用、III 限用、IV 着色剂、V 防腐剂、VI 防晒剂,逐年修订,必须看合并版并核对生效日期。"
                         f"站内 CosIng 检索 {eu_n:,} 条可直接查功能、附录号与限量。",
                 "h_en": "Step 1: run every ingredient through the annexes",
                 "b_en": f"Annex II prohibited, III restricted, IV colorants, V preservatives, VI UV filters, amended every year; "
                         f"work from the consolidated text. The on-site CosIng search covers {eu_n:,} entries with function, annex and limit."},
                {"h_zh": "第二步:CPSR 与 PIF",
                 "b_zh": "CPSR 由具备资质的安全评估人签发,依据是产品信息文件 PIF:配方、原料规格与 COA、"
                         "稳定性与防腐挑战数据(站内质检 STB-01/02、FQC-03 那几项)、微生物、包材相容性、标签样稿。"
                         "PIF 要在责任人处保存 10 年。",
                 "h_en": "Step 2: CPSR and the PIF",
                 "b_en": "A qualified safety assessor signs the CPSR on the basis of the Product Information File: formula, raw-material specs and COAs, "
                         "stability and preservative-challenge data, microbiology, packaging compatibility and label artwork. The PIF is kept for 10 years."},
                {"h_zh": "第三步:责任人与 CPNP",
                 "b_zh": "责任人必须是欧盟境内法人,标签上印其名称与地址;通报在 CPNP 完成后即可上市,没有审批等待期。"
                         "工厂提供技术资料与 GMP(ISO 22716)证明,不能代替责任人。",
                 "h_en": "Step 3: the Responsible Person and CPNP",
                 "b_en": "The RP must be an EU legal entity named on the label; once notified in CPNP the product can be placed on the market with no approval wait. "
                         "The factory supplies the technical dossier and ISO 22716 evidence; it cannot stand in for the RP."},
            ],
            [
                {"q_zh": "CPSR 要多久?", "a_zh": "资料齐全的情况下评估本身通常以周计;真正花时间的是前面的稳定性与防腐挑战数据,"
                                            "加速稳定性至少 3 个月(STB-01)。没有这些数据评估人不会签。",
                 "q_en": "How long does a CPSR take?", "a_en": "The assessment itself is measured in weeks when the file is complete; "
                                                              "the long pole is the stability and challenge-test data behind it: accelerated stability alone runs 3 months."},
                {"q_zh": "英国还能用同一套吗?", "a_zh": "不能整套照搬。英国脱欧后用 UK Cosmetics Regulation 与 SCPN 通报,责任人须在英国境内;"
                                                "技术资料大部分可复用,通报与责任人要分开做。",
                 "q_en": "Does the same file cover the UK?", "a_en": "Not as-is: the UK uses its own Cosmetics Regulation and SCPN notification with a UK-based RP; "
                                                                     "most of the technical file carries over, the notification and RP do not."},
            ],
            [{"t": "欧盟 CosIng 检索", "u": "/zh-cn/inci/eu-cosing/"}, {"t": "各国备案索引", "u": "/zh-cn/compliance/"}, {"t": "质检体系", "u": "/zh-cn/qc/"}],
        )

    add(
        "us-mocra", "decide",
        "产品要进美国,MoCRA 之后到底要做什么?FDA 会不会批?",
        "Selling cosmetics in the US after MoCRA: what is actually required, and does the FDA approve products?",
        "FDA 不批化妆品。MoCRA 之后的强制项是三件:生产设施注册、逐品产品列名、指定美国境内联系人并做不良事件记录;"
        "成分侧没有正面清单,只有禁限用与色素添加剂规定(21 CFR 73/74/82)。防晒是例外:按 OTC 药品管。",
        "The FDA does not approve cosmetics. MoCRA makes three things mandatory: facility registration, product listing, and a US agent with adverse-event records. "
        "There is no positive ingredient list, only prohibitions and the colour-additive regulations (21 CFR 73/74/82). Sunscreen is the exception: it is an OTC drug.",
        [
            {"h_zh": "设施注册与产品列名",
             "b_zh": "生产设施在 FDA Cosmetics Direct 注册,每两年更新;每个上市 SKU 做产品列名,配方变更要更新。"
                     "这两件由负责人(通常是品牌方)提交,工厂提供设施信息与配方资料。",
             "h_en": "Facility registration and product listing",
             "b_en": "Facilities register in FDA Cosmetics Direct and renew every two years; each marketed SKU is listed and updated on reformulation. "
                     "The responsible person (usually the brand) files; the factory supplies facility and formula information."},
            {"h_zh": "安全实证与标签",
             "b_zh": "MoCRA 要求持有安全实证(safety substantiation)记录,内容和欧盟 PIF 高度重合:稳定性、微生物、防腐挑战、相容性。"
                     "标签要有美国联系地址、成分按 INCI 降序;香精致敏原标注待 FDA 细则落地后执行。",
             "h_en": "Safety substantiation and labelling",
             "b_en": "MoCRA requires safety substantiation records, largely the same evidence as an EU PIF. Labels need a US contact address and INCI in descending order; "
                     "fragrance-allergen labelling follows once the FDA rule is final."},
            {"h_zh": "防晒是药,不是化妆品",
             "b_zh": "SPF 产品按 OTC 专论(21 CFR 352)走:只能用专论允许的防晒剂与浓度,要做 SPF/广谱测试,设施要符合药品 GMP。"
                     "亚洲常用的新型防晒剂在美国多数不能用。",
             "h_en": "Sunscreen is a drug",
             "b_en": "SPF products follow the OTC monograph (21 CFR 352): only listed filters at listed levels, SPF and broad-spectrum testing, and drug GMP at the facility. "
                     "Most newer Asian UV filters are not permitted in the US."},
        ],
        [
            {"q_zh": "小品牌有没有豁免?", "a_zh": "年销售额低于一定门槛的小企业可免设施注册与产品列名,但眼部等类别不豁免;门槛与例外以 FDA 现行指南为准。",
             "q_en": "Are small businesses exempt?", "a_en": "Below a revenue threshold, facility registration and listing are waived, with exceptions for eye-area and similar categories; check the current FDA guidance."},
            {"q_zh": "加拿大能一起做吗?", "a_zh": f"不能照搬。加拿大有自己的 Hotlist 禁限用清单(站内 {ca_n} 条),条目比美国细,配方要再过一遍。",
             "q_en": "Can Canada be covered in the same pass?", "a_en": f"Not as-is: Canada's Hotlist ({ca_n} entries on site) is more granular than the US list and needs its own check."},
        ],
        [{"t": "美国 FDA 禁限用与色素", "u": "/zh-cn/inci/us-fda/"}, {"t": "加拿大 Hotlist", "u": "/zh-cn/inci/ca-hotlist/"}, {"t": "各国备案索引", "u": "/zh-cn/compliance/"}],
    )

    if cn_n:
        add(
            "china-filing", "decide",
            "在中国上市一款普通化妆品,备案要准备什么、哪一步最容易被退?",
            "Filing an ordinary cosmetic in China: what the dossier needs and where it gets sent back",
            f"普通化妆品是备案制,在 NMPA 备案平台提交即可上市,但资料要经得起事后抽查。最容易被退的是安全评估:"
            f"用《已使用化妆品原料目录》({cn_n:,} 条)里的最高历史使用量做简化版评估,原料超量或不在目录内就要补毒理资料。",
            f"Ordinary cosmetics in China are filed, not approved, on the NMPA platform, but the file must survive post-market checks. "
            f"The safety assessment is where filings fail: the simplified assessment relies on the maximum historical use levels in the inventory "
            f"({cn_n:,} entries); any ingredient above its level or outside the list needs toxicology data.",
            [
                {"h_zh": "备案人与境内责任人",
                 "b_zh": "备案人对产品负责;进口产品要指定境内责任人。生产企业须持《化妆品生产许可证》,并按《化妆品生产质量管理规范》运行。",
                 "h_en": "The filer and the domestic responsible person",
                 "b_en": "The filer is liable for the product; imports need a domestic responsible person. The manufacturer holds a production licence and runs under the China GMP rules."},
                {"h_zh": "安全评估与功效宣称",
                 "b_zh": "简化版评估依据目录用量与权威机构结论;功效宣称按《化妆品功效宣称评价规范》分类,保湿、清洁等可文献或研究支撑,"
                         "祛斑美白、防晒、防脱属特殊化妆品,走注册而非备案。",
                 "h_en": "Safety assessment and efficacy claims",
                 "b_en": "The simplified assessment uses inventory levels and authoritative conclusions; claims follow the efficacy evaluation rules. "
                         "Whitening, sunscreen and anti-hair-loss are special cosmetics and require registration, not filing."},
                {"h_zh": "标签与检验报告",
                 "b_zh": "标签按《化妆品标签管理办法》:成分按含量降序、0.1% 以下单列「其他微量成分」;备案前要有资质机构出具的微生物与理化检验报告。",
                 "h_en": "Labels and test reports",
                 "b_en": "Labels list ingredients in descending order with trace ingredients grouped; microbiological and physico-chemical reports from a qualified lab are required before filing."},
            ],
            [
                {"q_zh": "目录里没有的原料怎么办?", "a_zh": "属于新原料,要先完成新原料备案或注册,有 3 年监测期;不建议在首款产品上用。",
                 "q_en": "What if an ingredient is not in the inventory?", "a_en": "It counts as a new ingredient and needs its own filing or registration with a 3-year monitoring period; avoid it on a first product."},
                {"q_zh": "备案后多久能卖?", "a_zh": "普通化妆品取得备案编号即可上市,没有审批等待期;但资料不实会在抽查中被取消备案。",
                 "q_en": "How soon after filing can it sell?", "a_en": "Immediately on receipt of the filing number; inaccurate files are cancelled at inspection."},
            ],
            [{"t": "已使用化妆品原料目录检索", "u": "/zh-cn/inci/cn-nmpa-2021/"}, {"t": "质检体系", "u": "/zh-cn/qc/"}],
        )

    add(
        "stability-how-long", "scene",
        "新配方的稳定性要测多久才能定货架期?能不能只做加速?",
        "How long must a new formula be tested before a shelf life can be set, and is accelerated data enough?",
        "不能只做加速。行业通行做法是 40℃ 加速 3 个月 + 25℃ 常温 12 个月 + 冻融循环 3–5 次,三者一起支撑 24 个月货架期;"
        "加速 3 个月无显著变化只能作为支撑之一,最终以常温数据为准。",
        "Accelerated data alone does not set a shelf life. Standard practice combines 40C accelerated for 3 months, 25C real-time for 12 months and 3–5 freeze-thaw cycles "
        "to support a 24-month shelf life; a clean 3-month accelerated result is supporting evidence, the real-time data is decisive.",
        [
            {"h_zh": "加速:40℃ 三个月",
             "b_zh": "按 0/1/2/3 个月取点看外观、气味、pH、黏度、微生物。三个月无显著变化可作为 24 个月货架期的支撑之一(STB-01)。",
             "h_en": "Accelerated: 40C for three months",
             "b_en": "Sampled at 0/1/2/3 months for appearance, odour, pH, viscosity and microbiology; a clean result is one of the supports for 24 months."},
            {"h_zh": "常温:25℃ 跟到期",
             "b_zh": "25℃/60%RH 按 0/3/6/12 个月取点,并与货架期同步跟到期。整个考察期内符合成品标准才算过(STB-02)。",
             "h_en": "Real-time: 25C followed to expiry",
             "b_en": "25C/60%RH at 0/3/6/12 months and followed through the shelf life; the product must meet its specification throughout."},
            {"h_zh": "冻融与光照",
             "b_zh": "-5℃ 与室温循环 3–5 次、每次 24 小时,解冻后不析出、不破乳(STB-03);透明包材与含精油体系加做光照,"
                     "变色超范围就改遮光包材或加抗氧体系(STB-04)。",
             "h_en": "Freeze-thaw and light",
             "b_en": "3–5 cycles between -5C and room temperature, 24 hours each, with no separation on thawing; transparent packs and essential-oil systems add a light study."},
        ],
        [
            {"q_zh": "打样时能先给临时货架期吗?", "a_zh": "可以给「暂定」并注明依据加速数据,但标签上的保质期要等常温数据覆盖;打样阶段就把稳定性起测,不要等大货。",
             "q_en": "Can a provisional shelf life be given at sampling?", "a_en": "Yes, marked provisional on accelerated data; the labelled shelf life waits for real-time coverage. Start stability at the sampling stage."},
            {"q_zh": "换了包材要重测吗?", "a_zh": "要做相容性(FQC-06):成品与实际包材在 40℃ 与常温放置至少 3 个月,看渗漏、溶胀、变色与香精迁移;高油相与含精油体系必须实瓶验证。",
             "q_en": "Does a packaging change require retesting?", "a_en": "Compatibility must be re-run: product in the actual pack at 40C and room temperature for at least 3 months, watching for leakage, swelling, discolouration and fragrance migration."},
        ],
        [{"t": "质检体系 · 稳定性与相容性", "u": "/zh-cn/qc/?s=stab"}, {"t": "配方库", "u": "/zh-cn/formulas/"}],
    )

    add(
        "preservative-challenge", "compare",
        "防腐挑战试验 ISO 11930 和 USP <51> 有什么区别?出口该做哪个?",
        "ISO 11930 versus USP <51> preservative challenge testing: what differs and which one does an export need?",
        "两者都是接种五株标准菌后按时间点计数,差别在判定准则与取点:ISO 11930 是化妆品专用标准,欧盟 CPSR 与东盟通报默认认它;"
        "USP <51> 来自美国药典,美国与部分美洲市场常要求。做出口通常按目的市场选一种,同一批样品可以两套判定一起出。",
        "Both inoculate five reference organisms and count over time; they differ in acceptance criteria and sampling points. ISO 11930 is the cosmetics-specific standard "
        "accepted by EU CPSRs and ASEAN notifications; USP <51> comes from the US Pharmacopeia and is expected in the US and parts of the Americas. "
        "Pick by destination; one sample set can be evaluated against both.",
        [
            {"h_zh": "什么时候必须做",
             "b_zh": "新配方、更换防腐体系、更换包材各做一次(FQC-03)。只改香精不改防腐体系可以不重做,但改了水活度或 pH 的要重做。",
             "h_en": "When it is required",
             "b_en": "A new formula, a change of preservative system, or a change of packaging each trigger a run; a fragrance-only change does not, a change in water activity or pH does."},
            {"h_zh": "判定口径",
             "b_zh": "ISO 11930 按 A/B 两级准则判定,达到 A 级即可单独支撑;USP <51> 按类别设定各时间点的对数下降要求。"
                     "报告要写明接种量、菌株来源与取点,缺这些的报告在 CPSR 评估里不算数。",
             "h_en": "Acceptance basis",
             "b_en": "ISO 11930 grades A or B, with A sufficient on its own; USP <51> sets log-reduction targets per category and time point. "
                     "Reports must state inoculum, strain source and sampling points, or a CPSR assessor will discount them."},
            {"h_zh": "没做会怎样",
             "b_zh": "没有挑战数据,欧盟评估人不签 CPSR,东盟通报会被要求补件;更实际的风险是货架期内长菌召回,那笔钱远高于一次试验。",
             "h_en": "What happens without it",
             "b_en": "No challenge data means no CPSR signature and a supplementary request in ASEAN; the practical risk is microbial growth in the field and a recall."},
        ],
        [
            {"q_zh": "无防腐配方能免做吗?", "a_zh": "不能。宣称「无防腐」的体系更要证明自防腐能力(低水活度、多元醇、pH),挑战试验是唯一证据。",
             "q_en": "Are preservative-free formulas exempt?", "a_en": "No: a self-preserving claim needs the challenge test as its only evidence."},
            {"q_zh": "试验要多久?", "a_zh": "ISO 11930 取点到第 28 天,加上前后准备通常 5–6 周;和加速稳定性并行做,不额外拉长交期。",
             "q_en": "How long does it take?", "a_en": "ISO 11930 samples through day 28; allow 5–6 weeks including setup, run in parallel with accelerated stability."},
        ],
        [{"t": "质检体系 · 成品检验", "u": "/zh-cn/qc/?s=fqc"}, {"t": "各国备案索引", "u": "/zh-cn/compliance/"}],
    )

    oc = pk.get("outer-carton")
    rb = pk.get("rigid-box")
    if oc and rb:
        ow = pk.get("overwrap-film", (10000, 1))[0]
        add(
            "carton-vs-rigid-box", "compare",
            "彩盒和天地盖礼盒怎么选?起订量和运输成本差多少?",
            "Folding carton or rigid box: how do MOQ and freight compare?",
            f"日常线用折叠彩盒,礼盒与套装用天地盖硬盒。折叠彩盒起订量从 {oc[0]:,} 只起、平张运输;"
            f"天地盖从 {rb[0]:,} 只起,但成型后不能压平,运费按体积算,报价要把物流一起算进去。",
            f"Folding cartons for the everyday line, rigid boxes for gift sets. Cartons start at {oc[0]:,} units and ship flat; "
            f"rigid boxes start at {rb[0]:,} units but cannot be collapsed, so freight is charged by volume and must be priced in.",
            [
                {"h_zh": "折叠彩盒:克重与盒型",
                 "b_zh": "30–50ml 瓶用 300g 白卡,100ml 以上改 350g 免压折痕;直插盒人工装填快,自动底适合单款大批量。"
                         "出口欧盟要在盒面预留责任人地址、批号、PAO 与成分表的位置,50ml 盒面建议留白 35% 以上。",
                 "h_en": "Folding carton: board weight and style",
                 "b_en": "300g board for 30–50ml, 350g above 100ml; tuck-end for fast hand packing, crash-lock for high-volume single SKUs. "
                         "EU exports need space on the carton for the RP address, batch code, PAO and ingredient list."},
                {"h_zh": "天地盖:内托决定观感",
                 "b_zh": "灰板 1.5–2.0mm 裱纸;EVA 内托便宜但塑料感重,纸浆模塑贵一档但整盒单一材质可回收。"
                         "抽屉盒要留 0.5–1mm 配合间隙,南方梅雨季纸张吸潮要按季节留。",
                 "h_en": "Rigid box: the insert sets the impression",
                 "b_en": "1.5–2.0mm greyboard wrapped in paper; EVA inserts are cheap but plasticky, moulded pulp costs more but keeps the box mono-material. "
                         "Drawer boxes need 0.5–1mm clearance, adjusted for humid seasons."},
                {"h_zh": "外封与防拆",
                 "b_zh": f"彩盒外加 BOPP 烟包膜(带拉线,{ow:,} 只起)防拆防潮;套装捆绑用 POF 收缩膜,PVC 已被多数出口市场拒收。",
                 "h_en": "Overwrap and tamper evidence",
                 "b_en": "A BOPP overwrap with tear tape gives tamper evidence and moisture protection; POF shrink film for bundles, PVC is no longer accepted in most export markets."},
            ],
            [
                {"q_zh": "能不能不做外盒?", "a_zh": "可以,很多电商线只做标签 + 运输箱。但出口欧盟时法定标识若放不进标签,就必须靠外盒或说明书承载。",
                 "q_en": "Can the carton be skipped?", "a_en": "Yes for many e-commerce lines; but if the mandatory EU text does not fit the label, the carton or a leaflet has to carry it."},
                {"q_zh": "彩盒要不要环保认证?", "a_zh": "欧盟与日韩客户常要求 FSC 纸与大豆油墨;不覆膜改水性过油即为单一材质可回收,触感膜属塑料复合层要注意。",
                 "q_en": "Do cartons need eco credentials?", "a_en": "EU, Japanese and Korean buyers often ask for FSC board and soy inks; skipping lamination for aqueous varnish keeps the carton mono-material."},
            ],
            [{"t": "包材库 · 纸盒与套装", "u": "/zh-cn/packaging/?g=carton"}, {"t": "质检体系 · 来料检验", "u": "/zh-cn/qc/?s=iqc"}],
        )

    lf = pk.get("leaflet")
    if lf:
        add(
            "multilingual-labels", "scene",
            "一款产品卖六个国家,标签和说明书怎么排才不被退件?",
            "One product in six countries: how are labels and leaflets laid out without being rejected?",
            f"标签语言不合规是通报退件最常见的原因。做法是「盒面放法定项,折页放多语种」:说明书折页 {lf[0]:,} 份起,"
            f"55–70g 纸按语种分区块排,字号不低于目的市场下限(欧盟通行 1.2mm 字高),批号与日期留白给产线喷码。",
            f"Non-compliant label language is the most common reason for rejection. The workable layout puts the mandatory items on the carton and the languages in a leaflet: "
            f"leaflets from {lf[0]:,} pieces, 55–70g paper, one block per language, type no smaller than the destination minimum (1.2mm in EU practice), batch and date left blank for on-line coding.",
            [
                {"h_zh": "哪些项必须在主展示面",
                 "b_zh": "产品名、净含量、责任人/进口商名址、批号、保质期或 PAO、成分表(INCI 降序)、警示语。各国顺序与语言要求不同,"
                         "东南亚多国要本地语 + 英语双语,泰国要泰文,印尼要印尼文。",
                 "h_en": "What must sit on the principal panel",
                 "b_en": "Name, net content, RP/importer name and address, batch, expiry or PAO, INCI list in descending order, warnings. "
                         "Order and language differ: most ASEAN markets want local language plus English; Thailand requires Thai, Indonesia requires Bahasa."},
                {"h_zh": "折页怎么折",
                 "b_zh": "70g 双胶纸三折以内;超过四折改 55–60g 薄型纸,否则塞不进盒。六国以上用风琴折,每个语种一个区块,不要按段落混排。",
                 "h_en": "How the leaflet folds",
                 "b_en": "70g offset paper up to three folds; beyond four folds use 55–60g thin paper or it will not fit the carton. Six or more languages call for an accordion fold, one block per language."},
                {"h_zh": "校验在哪一关",
                 "b_zh": "印刷件首件按目的市场法规逐项核(IQC-08),出货前再对照已通报资料终检(OQC-01);任一项不符即扣货,不带病出海。",
                 "h_en": "Where it gets checked",
                 "b_en": "The first printed piece is checked item by item against the destination rules (IQC-08); before shipment the label is re-checked against the notified file (OQC-01)."},
            ],
            [
                {"q_zh": "标签能不能贴译文贴纸?", "a_zh": "部分市场允许进口商加贴本地语贴纸,但不得遮盖原标签强制项;贴纸方案要在通报资料里体现,临时补贴容易被查。",
                 "q_en": "Can a translated sticker be used?", "a_en": "Some markets allow an importer sticker in the local language as long as it does not cover mandatory items; it must match the notified artwork."},
                {"q_zh": "成分表用中文还是 INCI?", "a_zh": "中国标签用《化妆品标签管理办法》规定的标准中文名;出口用 INCI。两者对应关系可在站内目录里逐条查。",
                 "q_en": "Chinese names or INCI on the ingredient list?", "a_en": "Standard Chinese names for China, INCI for export; the on-site inventory maps one to the other."},
            ],
            [{"t": "包材库 · 说明书与标签", "u": "/zh-cn/packaging/?g=carton"}, {"t": "各国备案索引", "u": "/zh-cn/compliance/"}, {"t": "已使用化妆品原料目录", "u": "/zh-cn/inci/cn-nmpa-2021/"}],
        )

    add(
        "halal-cosmetics", "decide",
        "做清真化妆品要改配方吗?印尼 2026 年清真强制到底怎么执行?",
        "Do halal cosmetics need reformulation, and how does Indonesia's 2026 halal mandate work?",
        "多数配方不需要推倒重来,但要逐味核原料来源:动物源成分(甘油、硬脂酸、胶原、角鲨烷)必须是植物或合成来源并有供应商声明,"
        "酒精按当地清真机构口径处理。印尼自 2026-10-17 起化妆品清真认证强制,由 BPJPH 主管,认证要单独排期。",
        "Most formulas do not need rebuilding, but every ingredient's origin is checked: animal-derived materials (glycerin, stearic acid, collagen, squalane) must be plant or synthetic with supplier declarations, "
        "and alcohol is handled per the certifying body's rules. Indonesia makes halal certification mandatory for cosmetics from 17 Oct 2026 under BPJPH; it needs its own schedule.",
        [
            {"h_zh": "原料侧:来源声明",
             "b_zh": "每味原料要有清真声明或来源证明,油脂类与乳化剂是高风险项;来料检验时与 COA 一并核(IQC-01)。",
             "h_en": "Ingredients: origin declarations",
             "b_en": "Every ingredient needs a halal or origin declaration; lipids and emulsifiers are the high-risk group, checked with the COA at incoming inspection."},
            {"h_zh": "产线侧:防交叉",
             "b_zh": "清真批次与含动物源批次的清场与专项清洗要留记录(IPQC-08),这是审核员必看的一项。",
             "h_en": "Production: preventing cross-contact",
             "b_en": "Changeover cleaning between halal and non-halal batches must be recorded; auditors always ask for it."},
            {"h_zh": "认证互认",
             "b_zh": "马来西亚 JAKIM、印尼 BPJPH、海湾 GSO 各有体系,部分互认。目标市场定了再选认证机构,不要先拿一张再找市场。",
             "h_en": "Mutual recognition",
             "b_en": "JAKIM (Malaysia), BPJPH (Indonesia) and the Gulf schemes recognise each other only in part; choose the certifier after the target market."},
        ],
        [
            {"q_zh": "含酒精的爽肤水能做清真吗?", "a_zh": "取决于认证机构对合成乙醇与浓度的口径;通常有条件允许,产品定位前先与机构确认。",
             "q_en": "Can an alcohol-containing toner be halal?", "a_en": "It depends on the certifier's position on synthetic ethanol and concentration; usually conditionally allowed."},
            {"q_zh": "认证要多久?", "a_zh": "从资料齐全到发证以月计,印尼 2026-10-17 大限前排队会更长;先把原料声明收齐再提交。",
             "q_en": "How long does certification take?", "a_en": "Months once the file is complete; queues will lengthen ahead of Indonesia's October 2026 deadline."},
        ],
        [{"t": "各国备案索引 · 印尼", "u": "/zh-cn/compliance/"}, {"t": "质检体系 · 来料与过程", "u": "/zh-cn/qc/?s=iqc"}],
    )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    d = fetch()
    rows = build(d)
    if not terms_confirmed():
        for r in rows:
            if r["slug"].startswith("moq-lead-"): continue
            for k in ("lead_zh", "lead_en"): r[k] = scrub(r[k])
            for sec in r["sections"]:
                for k in ("b_zh", "b_en"): sec[k] = scrub(sec.get(k, ""))
            for fq in r["faqs"]:
                for k in ("a_zh", "a_en"): fq[k] = scrub(fq.get(k, ""))
        print("工厂口径未确认:moq-lead-* 用无数字版,其它答案已删掉含起订量 / 交期的句子")
    from collections import Counter
    print(f"生成答案页 {len(rows)} 条 · 维度分布 {Counter(r['dim'] for r in rows).most_common()}")
    for r in rows[:5]:
        print(f"  [{r['dim']}] {r['slug']:<22} {r['q_zh'][:34]}")
        print(f"        结论:{r['lead_zh'][:56]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [
        "CREATE TABLE IF NOT EXISTS geo_answers (slug TEXT PRIMARY KEY, dim TEXT, q_zh TEXT, q_en TEXT,"
        " lead_zh TEXT, lead_en TEXT, sections_json TEXT, faqs_json TEXT, sources_json TEXT,"
        " updated_at TEXT);",
        "CREATE INDEX IF NOT EXISTS idx_geo_dim ON geo_answers(dim);",
    ]
    for r in rows:
        lines.append(
            "INSERT INTO geo_answers (slug,dim,q_zh,q_en,lead_zh,lead_en,sections_json,faqs_json,"
            "sources_json,updated_at) VALUES ("
            + ",".join([q(r["slug"]), q(r["dim"]), q(r["q_zh"]), q(r["q_en"]), q(r["lead_zh"]), q(r["lead_en"]),
                        q(json.dumps(r["sections"], ensure_ascii=False)),
                        q(json.dumps(r["faqs"], ensure_ascii=False)),
                        q(json.dumps(r["sources"], ensure_ascii=False)), "datetime('now')"])
            + ") ON CONFLICT(slug) DO UPDATE SET dim=excluded.dim,q_zh=excluded.q_zh,q_en=excluded.q_en,"
              "lead_zh=excluded.lead_zh,lead_en=excluded.lead_en,sections_json=excluded.sections_json,"
              "faqs_json=excluded.faqs_json,sources_json=excluded.sources_json,updated_at=excluded.updated_at;")
    sql = os.path.join(HERE, "_geo-answers.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")
    n = d1("SELECT COUNT(*) n FROM geo_answers")
    print(f"完成:geo_answers 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()
