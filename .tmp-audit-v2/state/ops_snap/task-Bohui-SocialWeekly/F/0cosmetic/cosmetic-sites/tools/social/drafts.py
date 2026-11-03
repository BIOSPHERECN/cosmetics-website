#!/usr/bin/env python3
"""社媒草稿小弟 v0(设计:助手交付/21-社媒与情报系统/01-社媒输出系统-设计.md)。

读本周素材(市场调研-v1/07 对外部分、法规库 2025–2026 动态、帛卉公开事实、情报条目)→ 选题池
→ 公众号 / 小红书 / 视频号(BEAUTY2OEM 线)+ LinkedIn(工厂站线)各 2 篇 + 1 个短视频分镜
→ 机检(平台尺、极限词、功效禁用、商务数字、口径禁词、频率≠销量、公开层边界、品牌口径、数字回源、服务承诺、法规时态、公众号结构)
→ 不过就带原因重写,最多 3 次,仍不过进「死信」等人看 → 落待审草稿 + 审核清单。
绝不发布、不写库、不注册计划任务。模型只走本机网关(白名单渠道),token 运行时读文件,并发 1。

用法:python tools/social/drafts.py [--week 2026-W39] [--dry-run] [--replay <草稿目录>]
退出码:0 成功(含 STOP 开关打开时什么都不做)/ 1 异常 / 2 配置缺失 / 3 一篇都没生成出来
"""
import argparse, csv, datetime as dt, glob, hashlib, importlib.util, io, json, os, re, sys, time, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DELIV = "F:/0cosmetic/助手交付"
WORDS = f"{DELIV}/21-社媒与情报系统/审核词表-v0.json"          # 词表与平台尺不进公开仓
R7 = f"{DELIV}/BEAUTY2OEM/市场调研-v1/07-独家数据洞察-帛卉自有数据.md"
INTEL = f"{DELIV}/22-知识库与专家思维/data/items.jsonl"
INTEL_MD = f"{DELIV}/21-社媒与情报系统/**/情报日报*.md"
REG = os.path.join(ROOT, "data", "regulations")
FACTS_JS = os.path.join(ROOT, "tools", "bohui-facts.mjs")
TERMS_TS = os.path.join(ROOT, "apps", "web", "src", "lib", "terms.ts")
OUT_ROOT = f"{DELIV}/10-社媒内容"
GW = "http://127.0.0.1:8788"
WHITELIST = ("agnes", "sensenova", "meituan", "longcat")        # 舰队白名单:Agnes / 商汤 / 美团
REWRITE_MAX = 3
LINES = {"factory": ("工厂站线", "BIOSPHERE"), "b2o": ("BEAUTY2OEM 线", "帛卉")}
REJECT_CODES = "口径错 / 数字无出处 / 宣称越界 / 泄露非公开层 / 不像我们 / 平台不合 / 时机不对 / 选题没价值"
B2O_HOLD = "只出稿不发"   # 待拍板 #4 按默认:beauty2oem 域名国内可访问 + 简报同意勾选到位前,BEAUTY2OEM 线一律只出稿不发
PUB_COLS = ["文件", "线", "平台", "标题", "机检", "发布", "utm_content", "落地",
            "排期", "审批人", "驳回原因码", "暗号", "数字出处", "帖子链接", "发布时间", "稿件指纹"]
MANUAL = ("排期", "审批人", "驳回原因码", "帖子链接", "发布时间")          # 人填列:重跑时从上一版带回
RECEIPT_COLS = ["帖子号", "窗口", "曝光", "互动", "有效私信", "留资"]

_s = importlib.util.spec_from_file_location("kcollect", os.path.join(ROOT, "tools", "knowledge", "collect.py"))
_k = importlib.util.module_from_spec(_s); _s.loader.exec_module(_k)   # 复用 unverified():数字必须在原文里逐字出现


# ── 素材 ─────────────────────────────────────────────────────────────────────
def S(id, title, text, origin):
    return {"id": id, "title": title, "text": text, "origin": origin}


def load_r7():
    """只取 §0 一页结论和 §9 对外卡片;§8 供给侧仅内部,不读。核实批注去掉,带「复核」的保留。"""
    t = io.open(R7, encoding="utf-8").read()
    sec = lambda n: re.search(rf"^## {n}\..*?(?=^## )", t, re.S | re.M).group(0)
    cl = lambda s: re.sub(r"【(?![^】]*复核)[^】]*】", "", s).replace("**", "").strip()
    org = "BEAUTY2OEM/市场调研-v1/07-独家数据洞察"
    out = []
    for m in re.finditer(r"^\|\s*(\d)\s*\|(.+?)\|(.+?)\|(.+?)\|\s*$", sec(0), re.M):
        out.append(S(f"R7-{m[1]}", cl(m[2]), f"洞察:{cl(m[2])} 数字:{cl(m[3])} 所以呢:{cl(m[4])}",
                     f"{org} §0 第 {m[1]} 条(帛卉自有数据:美国亚马逊美妆榜 7 次快照 2026-09-16~23;帛卉库查询 2026-09-23)"))
    for m in re.finditer(r"^(\d)\. 「(.+?)」(.*)$", sec(9), re.M):
        if "本条停用" in m[0]: continue   # 复核没过的卡片(09-24 §9 第 4 条巴西)不进素材
        out.append(S(f"R7-C{m[1]}", "对外卡片 " + m[1], cl(m[2]) + " " + cl(m[3]), f"{org} §9 对外卡片 {m[1]}"))
    return out


def load_reg(n=6):
    zh = json.load(io.open(os.path.join(REG, "_zh-cache.json"), encoding="utf-8"))
    ups, names = [], {}
    for f in glob.glob(os.path.join(REG, "*.json")):
        if os.path.basename(f).startswith("_"): continue
        d = json.load(io.open(f, encoding="utf-8"))
        names.update({m["id"]: m.get("country_zh") or m["id"] for m in d.get("markets", [])})
        ups += d.get("updates_2025_2026", [])
    ups.sort(key=lambda u: u["date"], reverse=True)
    return [S(f"REG-{i}", zh.get(u["title_en"], u["title_en"]),
              f"{u['date']} {names.get(u['market_id'], u['market_id'])}:{zh.get(u['title_en'], u['title_en']).rstrip('。')}。{zh.get(u['summary_en'], u['summary_en'])}",
              f"{u['source']}(法规库 data/regulations,整理于 2026-09-11~14)") for i, u in enumerate(ups[:n], 1)]


def load_intel(n=6):
    out = []
    if os.path.exists(INTEL):
        rs = [json.loads(l) for l in io.open(INTEL, encoding="utf-8") if l.strip()]
        ok = [r for r in rs if r.get("relevant") and not r.get("needs_review")][-n:]   # 数字核验没过的不用
        out = [S(f"INT-{i}", r["title_zh"], f"{r['title_zh']}:{r['summary_zh']} 对卖家意味着:{r['meaning']}",
                 f"{r['org']}《{r['src_title']}》{r['published'][:16]} {r['url']}") for i, r in enumerate(ok, 1)]
    for p in sorted(glob.glob(INTEL_MD, recursive=True))[-1:]:
        out.append(S("INT-D", os.path.basename(p), io.open(p, encoding="utf-8").read()[:3000], p))
    return out


def load_facts():
    """事实只从 bohui-facts.mjs(公司介绍 PDF)与 terms.ts 取;配方储备、打样天数、古方、客户名一律不取。"""
    js = io.open(FACTS_JS, encoding="utf-8").read()
    figs = []
    for m in re.finditer(r"\{ key: '(\w+)', zh: '([^']+)', en: '([^']+)', value: '([^']+)', unit: '([^']*)'(.*?)\}", js):
        if m[1] not in ("lines", "cleanroom"): continue  # 09-24 主线:面积、日产能、仓储未确认,不进公开事实
        gt = "prefix: '>'" in m[6]
        ven, uen = re.search(r"valueEn: '([^']+)'", m[6]), re.search(r"unitEn: '([^']*)'", m[6])
        figs.append(f"{m[2]}{' 超过' if gt else ''} {m[4]}{m[5]}(英文:{m[3]} {'>' if gt else ''}{ven[1] if ven else m[4]} {uen[1] if uen else m[5]})")
    certs = [f"{l}({z})" for l, z in re.findall(r"label: '([^']+)', note: \{ zh: '([^']+)'", js)
             if l in ("GMPC", "ISO 22716:2007", "HALAL", "FDA", "CPNP", "SGS")]
    clients = re.findall(r"'([^']+)'", re.search(r"clients: \[(.*?)\]", js, re.S)[1])
    days = re.search(r"SAMPLE_DAYS = '([^']+)'", io.open(TERMS_TS, encoding="utf-8").read())[1]
    text = ("帛卉化妆品(广州,对外品牌 BIOSPHERE):" + ";".join(figs) + "。认证与登记:" + "、".join(certs)
            + f"。出样通常 {days} 天(只准这样写)。FDA 只能写 facility registration / 设施注册。")
    return S("F-1", "帛卉公开事实", text, "tools/bohui-facts.mjs(《帛卉公司介绍_2026.pdf》)+ apps/web/src/lib/terms.ts SAMPLE_DAYS"), clients


def evidence(ids, SRC):
    """被引出处的原文;「2.2–3.4 万」这类同时给出换算值,英文稿写 22,000 也能回源。"""
    t = "\n".join(SRC[i]["text"] for i in ids if i in SRC)
    wan = lambda m: " ".join(f"{float(x) * 10000:.0f}" for x in m.groups() if x)
    return t + "\n" + " ".join(wan(m) for m in re.finditer(r"(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*万", t))


# ── 机检 ─────────────────────────────────────────────────────────────────────
def gate(post, pf, W, clients, evid, size=True, today=None):
    rule = W["平台尺"][pf]
    title, body, tags = str(post.get("title") or ""), str(post.get("body") or ""), [str(x) for x in post.get("tags") or []]
    text = f"{title}\n{body}\n{' '.join(tags)}"
    hits = []
    if size:
        n = len(body.split()) if rule["单位"] == "词" else len(re.sub(r"\s", "", body))
        if len(title) > rule["标题上限"]: hits.append(("平台尺", f"标题 {len(title)} 字符,上限 {rule['标题上限']}"))
        if not rule["正文下限"] <= n <= rule["正文上限"]: hits.append(("平台尺", f"正文 {n} {rule['单位']},要求 {rule['正文下限']}–{rule['正文上限']}"))
        if len(tags) > rule["话题上限"]: hits.append(("平台尺", f"话题 {len(tags)} 个,上限 {rule['话题上限']}"))
    for g, pats in {**W["闸"], **W["按线"][rule["线"]]}.items():
        for p in pats:
            m = re.search(p, text, re.I)
            if m: hits.append((g, m.group(0)))
    # 边界只看拉丁字母数字:\w 含汉字,「为BIOAQUA代工」用 \w 边界会漏拦
    hits += [("公开层边界", f"客户名 {c}") for c in clients if re.search(rf"(?<![A-Za-z0-9]){re.escape(c)}(?![A-Za-z0-9])", text, re.I)]
    if not evid.strip(): hits.append(("数字回源", "没有引用任何出处"))
    bad = _k.unverified(text, evid) + [z for z in re.findall(r"[零一二两三四五六七八九十百千]+[万亿]", text) if z not in evid]
    if bad: hits.append(("数字回源", "出处里找不到:" + "、".join(bad)))
    hits += tense(text, evid, today or dt.date.today())
    if pf == "mp":   # 公众号结构闸:小标题 ≥2 个,文末要有「阅读原文」CTA
        heads = re.findall(r"^\s*(?:#{2,4}\s+\S|\*\*[^*\n]{2,30}\*\*\s*$|[一二三四五六七八九十]+、)", body, re.M)
        if len(heads) < 2: hits.append(("公众号结构", f"小标题只有 {len(heads)} 个,要 2–4 个(用 ### 开头的行)"))
        if "阅读原文" not in body.strip()[-80:]: hits.append(("公众号结构", "文末缺「点击阅读原文提交店铺,领《机会简报》」"))
    return hits


MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
FUTURE = r"\bwill\b|\bshall\b|\bupcoming\b|\bahead of\b|\bdeadlines?\b|\bis set to\b|\bcoming into\b|将于|将在|即将|将要|将会|将从|赶在|截止前|前夕"
REG_VERB = r"enforc|appl(y|ies)|take effect|come into|in force|\bban|prohibit|restrict|requir|mandat|生效|实施|施行|执行|禁用|禁止|限用|要求"


def dates(s):
    """句中写明的日期 → date 列表:2026-07-31 / 2026年7月31日 / 2026年7月(按 1 日)/ July 31, 2026 / 31 July 2026。"""
    out = []
    for y, m, d in re.findall(r"(20\d\d)-(\d{1,2})-(\d{1,2})", s): out.append((y, m, d))
    for y, m, d in re.findall(r"(20\d\d)\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?", s): out.append((y, m, d or 1))
    for mo, d, y in re.findall(r"\b([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d\d)", s): out.append((y, MONTHS.get(mo.lower()), d))
    for d, mo, y in re.findall(r"\b(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\.?,?\s+(20\d\d)", s): out.append((y, MONTHS.get(mo.lower()), d))
    r = []
    for y, m, d in out:
        try: r.append(dt.date(int(y), int(m), int(d)))
        except (TypeError, ValueError): pass
    return r


def tense(text, evid, today):
    """法规时态闸:已生效(日期 ≤ 今天)的写成将要生效就拦。句子自带日期按句子算;
    没带日期的「will / 即将 + 法规动词」或「ahead of / 截止前」句,按正文与所引法规素材(行首日期)里的日期算,全部已过才拦。"""
    known = dates(text) + [dt.date.fromisoformat(x) for x in re.findall(r"^(20\d\d-\d\d-\d\d) ", evid, re.M)]
    all_past = bool(known) and max(known) <= today
    hits = []
    for s in re.split(r"(?<=[。!?;.!?;])\s*|\n+", text):
        if not re.search(FUTURE, s, re.I): continue
        own = dates(s)
        if (own and min(own) <= today) or (not own and all_past and re.search(REG_VERB + r"|ahead of|deadline|截止|赶在", s, re.I)):
            hits.append(("法规时态", f"已生效写成将要生效:{s.strip()[:70]}"))
    return hits


# ── 模型 ─────────────────────────────────────────────────────────────────────
def chat(system, user, max_tokens=4000):
    """网关 bohui-chat;超时 60 秒,失败重试 2 次;返回渠道不在白名单就整批停。"""
    token = io.open(os.path.expanduser("~/.bohui-gateway/TOKEN.txt"), encoding="utf-8").read().strip()
    body = json.dumps({"model": "bohui-chat", "temperature": 0.5, "max_tokens": max_tokens,
                       "chat_template_kwargs": {"enable_thinking": False},
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    opener, err = urllib.request.build_opener(urllib.request.ProxyHandler({})), ""
    for i in range(3):
        try:
            req = urllib.request.Request(GW + "/v1/chat/completions", data=body,
                                         headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
            with opener.open(req, timeout=60) as r:
                prov, d = r.headers.get("x-bohui-provider", ""), json.loads(r.read())
            if not prov.startswith(WHITELIST):
                raise SystemExit(f"网关返回的渠道「{prov}」不在白名单,整批停止")
            m = re.search(r"\{.*\}", d["choices"][0]["message"].get("content") or "", re.S)
            if m: return json.loads(m.group(0)), prov
            err = "没返回 JSON"
        except SystemExit:
            raise
        except Exception as e:
            err = str(e)[:160]
        if i < 2: time.sleep(5)
    raise RuntimeError(f"网关 3 次都失败:{err}")


RULES = """铁规(违反任何一条稿子会被机检拦下重写):
1. 数字只准用素材里出现过的,原样照写(不换算、不四舍五入、不改单位);每个数字都必须能在你 sources 里列的素材原文里找到。没把握就不写数字。
2. 榜单出现频率 ≠ 销量;标题里的词 ≠ 真实配方;库里查不到 ≠ 不限。占比的主语是「N 款样本产品」,不是消费者、不是市场;下限就写「至少」。
3. 不写起订量、交期、价格;出样只准说「通常 5–14 天」。不写小批量 / 低起订;定位是规模化代工,讲产能、认证、合规确定性。
4. 不出现 SueAI、集团、古方、爆款预测;不点名任何品牌(含客户);不写具体 SKU、配方编号、包材选型、进入时间窗口。
5. 不做功效承诺(治疗、修复、抗炎、药妆、clinically proven、hypoallergenic 之类都不写);不用广告法极限词(最佳、第一、顶级、唯一、the best、world-class 之类)。
6. 用自己的话写判断,不照抄素材;每篇讲清:看到了什么变化、我们怎么判断、依据是什么、什么情况下这个判断会错。
7. 帛卉能做什么只准用 [F-1] 和素材「所以呢」里写明的(配方、资料包、安全评估材料);不许自拟服务、流程或承诺(免费筛查、备选供应商、代做 PIF、保证不停线、ensure / 确保、帮您快速完成、meet delivery timelines 之类)。
8. 一个数字只能配它在素材里的原句,不许把 A 条的样本数安到 B 条的结论上。"""


def sys_prompt(line, SRC):
    name, sig = LINES[line]
    other = "不提 BEAUTY2OEM" if line == "factory" else "不提 biosphere-ai.com,正文不放任何网址、电话、微信、二维码"
    mats = "\n".join(f"[{s['id']}] {s['title']}\n{s['text']}" for s in SRC.values())
    return (f"你是帛卉化妆品(广州,规模化化妆品代工厂)的内容编辑,写{name}的社媒稿,对外署名「{sig}」,{other}。\n{RULES}\n"
            f"今天是 {dt.date.today()}:早于今天的法规日期写成「已生效 / took effect」,不许写成将要生效,也不许说「赶在截止前」。\n"
            f"<素材>\n{mats}\n</素材>\n只输出一个 JSON 对象。")


# ── 流程 ─────────────────────────────────────────────────────────────────────
def make_topics(SRC):
    j, prov = chat(sys_prompt("b2o", SRC),
                   "先出本周选题池:8 个选题,工厂站线(factory,海外品牌方与采购)至少 3 个,BEAUTY2OEM 线(b2o,国内跨境美妆卖家)至少 3 个。"
                   '输出 {"topics":[{"id":"T1","line":"factory|b2o","title":"一句话选题","angle":"榜单稳定度|评论门槛|标题卖点|真实成分结构|多市场限量|当地责任人|法规动态|行业情报|制造能力",'
                   '"sources":["素材 id"],"why":"这条能怎样带来询盘或简报提交,一句话","counter":"什么情况下这个判断会错,一句话"}]}', 3000)
    ok = [t for t in (j.get("topics") or []) if t.get("line") in LINES and t.get("sources") and set(t["sources"]) <= set(SRC)]
    for t in ok:   # 选题池不对外,不拦,只标出无出处的数字
        t["num"] = "、".join(_k.unverified(f"{t.get('title')} {t.get('why')} {t.get('counter')}", evidence(t["sources"], SRC))) or "过"
    return ok, prov


def make_posts(pf, W, topics, SRC):
    r = W["平台尺"][pf]; line = r["线"]
    tl = "\n".join(f"{t['id']} {t['title']}(角度 {t['angle']};素材 {','.join(t['sources'])})" for t in topics if t["line"] == line)
    j, prov = chat(sys_prompt(line, SRC),
                   f"本周选题:\n{tl}\n\n写 {r['名']} 2 篇,选不同的选题。语言:{'英文' if r['语'] == 'en' else '中文'}。"
                   f"平台尺:标题 ≤{r['标题上限']} 字符;正文 {r['正文下限']}–{r['正文上限']} {r['单位']};话题 ≤{r['话题上限']} 个(不带 #)。{r['要求']}。"
                   '输出 {"posts":[{"topic":"T1","title":"","body":"","tags":[""],"sources":["用到的素材 id"]},{...}]}')
    return [p for p in (j.get("posts") or []) if isinstance(p, dict)][:2], prov


def fix(post, pf, W, hits, SRC):
    r = W["平台尺"][pf]
    src = "\n".join(f"[{i}] {SRC[i]['text']}" for i in post.get("sources") or [] if i in SRC)
    j, prov = chat(sys_prompt(r["线"], SRC),
                   f"这篇 {r['名']} 稿没过机检,逐条改掉下面的问题,别的尽量不动;数字只能照抄所引素材原文,找不到就删掉那个数字。\n"
                   f"问题:\n" + "\n".join(f"- [{g}] {h}" for g, h in hits) + f"\n平台尺:正文 {r['正文下限']}–{r['正文上限']} {r['单位']}。\n"
                   f"所引素材原文:\n{src}\n\n原稿 JSON:\n{json.dumps(post, ensure_ascii=False)}\n\n只输出改好的这一篇,键名不变。")
    return ({**post, **j} if j.get("body") else post), prov   # 模型漏回的键(sources/topic)沿用原稿


def run_gate(post, pf, W, clients, SRC, size=True):
    """机检 → 带原因重写 ≤ REWRITE_MAX 次;返回 (post, hits, 改写次数, 渠道)。"""
    provs, n = [], 0
    while True:
        # 帛卉公开事实(含「出样通常 5–14 天」)是系统提示要求照写的,模型常不列进 sources → 每轮并入,出处里也看得到
        src = [s for s in post.get("sources") or [] if isinstance(s, str)]
        post["sources"] = src + (["F-1"] if src and "F-1" not in src else [])   # 一个出处都没引的照旧拦
        hits = gate(post, pf, W, clients, evidence(post.get("sources") or [], SRC), size)
        if not hits or n >= REWRITE_MAX: return post, hits, n, provs
        try:
            post, prov = fix(post, pf, W, hits, SRC); provs.append(prov); n += 1
        except RuntimeError as e:
            print(f"    改写失败:{e}"); return post, hits, n, provs


def storyboard(post, W, clients, SRC):
    """分镜也走「机检 → 带原因重写 ≤ REWRITE_MAX 次」;返回 (shots, 素材清单, hits, 渠道, 改写次数)。"""
    ask = ("把下面这条视频号 60 秒口播稿拆成 6–8 个镜头的分镜。画面只能是:员工实拍(产线、灌装、检测、打样)、HTML 信息图(数字照抄口播)、屏幕录制帛卉自己的数据页;"
           "不用 AI 生成画面冒充工厂,画面里不得出现客户品牌、客户标签、配方单。\n"
           f"口播稿:\n{post.get('body')}\n"
           '输出 {"shots":[{"sec":"0-5","画面":"","口播":"","字幕":"","素材":"实拍|HTML信息图|屏幕录制","注意":""}],"素材清单":["要实拍的镜头,一行一个"]}')
    hits, n = [], 0
    while True:
        j, prov = chat(sys_prompt("b2o", SRC), ask + ("\n上一版没过机检,逐条改掉;口播和字幕里的数字只能照抄口播稿:\n"
                                                     + "\n".join(f"- [{g}] {h}" for g, h in hits) if hits else ""))
        shots = [s for s in (j.get("shots") or []) if isinstance(s, dict)]
        probe = {"title": "", "body": "\n".join(f"{s.get('口播', '')} {s.get('字幕', '')}" for s in shots), "sources": post.get("sources")}
        hits = gate(probe, "channels", W, clients, evidence((post.get("sources") or []) + ["F-1"], SRC), size=False)   # 镜头常带产线事实
        if not shots: hits = [("平台尺", "分镜为空或格式不对,shots 要 6–8 个镜头对象")]   # 空分镜没数字,别当通过
        if not hits or n >= REWRITE_MAX: return shots, [str(x) for x in j.get("素材清单") or []], hits, prov, n
        n += 1


def links(pf, line, week, i):
    utm = f"{line}-{pf}-{week.replace('-', '')}-{i}"
    code = hashlib.sha1(utm.encode()).hexdigest()[:5].upper()
    q = f"utm_source={pf}&utm_medium=social&utm_campaign={week}&utm_content={utm}"
    if line == "factory": return utm, code, f"正文末尾链接:https://biosphere-ai.com/en/oem/?{q}"
    if pf == "mp": return utm, code, f"阅读原文:https://beauty2oem.com/zh-cn/brief/?{q}(发布前提:域名国内可访问 + 简报表单同意勾选;未到位只出稿不发)"
    return utm, code, "正文不放链接;用平台官方留资组件,备注暗号"


def write_post(out, fn, pf, W, post, hits, n, provs, week, i, SRC, topics):
    r = W["平台尺"][pf]; line = r["线"]; name, sig = LINES[line]
    utm, code, land = links(pf, line, week, i)
    tp = next((t for t in topics if t["id"] == post.get("topic")), {})
    body = re.sub(rf"\n+\s*(——\s*)?{sig}$", "", str(post.get("body") or "").strip())   # 落款由下面统一加,去掉模型自带的
    if line == "factory": body += f"\n\n{land.split(':', 1)[1]}"
    tags = " ".join("#" + re.sub(r"[#\s]+", "", t) for t in post.get("tags") or [])
    hold = B2O_HOLD if line == "b2o" else "人审通过后由人工发布"
    md = [f"---\n平台: {r['名']}({name})\n状态: {'待人审(不自动发布)' if not hits else '死信·未过机检(等人看)'}\n发布: {hold}\n周次: {week}\n"
          f"选题: {post.get('topic', '')} {tp.get('title', '')}\nutm_content: {utm}\n暗号: {code}\n落地: {land}\n"
          f"模型: {' → '.join(provs)}(改写 {n} 次)\n生成: {dt.datetime.now():%Y-%m-%d %H:%M}\n---\n",
          f"# {post.get('title', '')}\n\n{body}\n\n{tags}\n\n—— {sig}\n",
          "\n## 出处(正文每个数字都应能在这里逐字找到)\n"]
    md += [f"- [{s}] {SRC[s]['origin']}\n  > {SRC[s]['text'][:400]}" for s in post.get("sources") or [] if s in SRC]
    md += ["\n## 机检", "- 全部通过(平台尺、词表各闸含服务承诺、品牌口径、数字回源简版、法规时态、公众号结构)" if not hits else "\n".join(f"- 拦:[{g}] {h}" for g, h in hits),
           f"- 选题反证条件:{tp.get('counter', '—')}",
           "- 未上的闸:宣称强度梯、证据对位、另一家模型审校 —— 由人审补看"]
    io.open(os.path.join(out, fn), "w", encoding="utf-8", newline="\n").write("\n".join(md) + "\n")
    return {"文件": fn, "线": name, "平台": r["名"], "状态": "待人审" if not hits else "死信", "改写": n,
            "未过": ";".join(f"{g}:{h}" for g, h in hits) or "—", "出处": ",".join(post.get("sources") or []) or "—",
            "标题": str(post.get("title") or ""), "发布": hold, "utm_content": utm, "暗号": code, "落地": land,
            "稿件指纹": hashlib.sha1(f"{post.get('title')}\n{body}".encode()).hexdigest()[:8]}


# ── 发布清单 / 回执 / 回放 ─────────────────────────────────────────────────────
def merge(rows, old, key, manual):
    """人填列按 key 从上一版带回;稿件指纹变了的带回值前加「旧稿:」,不把对旧稿的审批冒充成对新稿的。"""
    prev = {tuple(o.get(k, "") for k in key): o for o in old}
    out = []
    for r in rows:
        o = prev.get(tuple(r.get(k, "") for k in key), {})
        mark = "旧稿:" if o.get("稿件指纹", "") not in ("", r.get("稿件指纹", "")) else ""
        out.append({**r, **{c: ("" if o[c].startswith("旧稿:") else mark) + o[c] for c in manual if o.get(c)}})
    return out


def to_csv(cols, rows):
    f = io.StringIO(); w = csv.DictWriter(f, cols, extrasaction="ignore", lineterminator="\n")
    w.writeheader(); w.writerows(rows); return f.getvalue()


def read_csv(p):
    return list(csv.DictReader(io.open(p, encoding="utf-8-sig"))) if os.path.exists(p) else []


PF = {"公众号": "mp", "小红书": "xhs", "视频号": "channels", "LinkedIn": "linkedin",
      "抖音": "channels", "Instagram": "linkedin", "TikTok": "linkedin"}   # 后三个是旧稿平台:抖音按国内口播(BEAUTY2OEM 线),IG/TikTok 按工厂站线英文


def parse_md(t):
    """草稿 md → (平台键, post, 出处 {id: 引文首行} 或 None, 头信息)。新版(本脚本产出)有「## 出处」节;
    旧版(content-weekly 的 W38/W39)没有出处节,返回 None。"""
    m = re.match(r"﻿?---\n(.*?)\n---\n(.*)", t.replace("\r\n", "\n"), re.S)
    if not m: return None, None, None, {}
    meta, rest = dict(re.findall(r"^([^:\n]+):[ \t]*(.*)$", m[1], re.M)), m[2]
    pf = next((v for k, v in PF.items() if meta.get("平台", "").startswith(k)), None)
    if "\n## 出处" not in rest:
        body = "\n".join(l for l in rest.split("\n") if not re.match(r"(统计数字|能力点|配图模板)[::]", l)).strip()
        body = re.sub(r"\?utm_\S+", "", body)   # 网址本身留给导流闸,utm 参数里的周号不算正文数字
        return pf, {"title": meta.get("标题", ""), "body": body, "tags": []}, None, meta
    head, tail = rest.split("\n## 出处", 1)
    title = re.search(r"^# (.*)$", head, re.M)[1]
    body, tags = head.split(f"# {title}\n", 1)[1].rsplit("\n—— ", 1)[0].strip(), []
    if body.rsplit("\n", 1)[-1].startswith("#"):
        body, last = body.rsplit("\n", 1) if "\n" in body else ("", body)
        tags = re.findall(r"#(\S+)", last)
    body = re.sub(r"\n+https://biosphere-ai\.com/en/oem/\?\S+$", "", body.strip())   # 系统附的链接,不是模型写的
    cites = dict(re.findall(r"^- \[([\w-]+)\][^\n]*\n  > ([^\n]*)", tail.split("\n## 机检")[0], re.M))
    return pf, {"title": title, "body": body, "tags": tags}, cites, meta


def replay(d, W, clients, SRC):
    """回放闸:把一个目录的草稿按当前闸重跑,不调模型、不写文件。新版稿按它自己引的出处回源(素材池里同一条还在就用全文);
    旧版稿没有出处,按整个当前素材池回源、不查平台尺。金标样例头信息写「期望拦: 闸名、闸名」,逐条核对。"""
    pool, n, blocked, miss = evidence(list(SRC), SRC), 0, 0, []
    for f in sorted(glob.glob(os.path.join(d, "*.md"))):
        pf, post, cites, meta = parse_md(io.open(f, encoding="utf-8-sig").read())
        if not pf: continue
        if cites is None: ev, size = pool, False
        else:
            full = {i: {"text": SRC[i]["text"] if i in SRC and SRC[i]["text"].startswith(q) else q} for i, q in cites.items()}
            ev, size = evidence(list(full), full), True
        hits = gate(post, pf, W, clients, ev, size)
        want = [x.strip() for x in re.split(r"[、,,]", meta.get("期望拦", "")) if x.strip()]
        lost = [x for x in want if x not in {g for g, _ in hits}]
        n += 1; blocked += bool(hits); miss += [f"{os.path.basename(f)}:{x}" for x in lost]
        print(f"{os.path.basename(f)}({pf}{'·旧版' if cites is None else ''}):" + ("过" if not hits else "拦 " + " | ".join(f"[{g}] {h}" for g, h in hits))
              + (f"  ← 期望拦 {'、'.join(want)}:{'全中' if not lost else '漏 ' + '、'.join(lost)}" if want else ""))
    print(f"回放 {n} 份:拦 {blocked},过 {n - blocked}" + (f";金标漏拦 {len(miss)}:{'、'.join(miss)}" if miss else ""))
    return 0


def selftest(W, clients):
    ev = "15 个类目、7 次快照;护肤主类 Top100 的评论中位数是 2.2–3.4 万;212 款中透明质酸钠 ≥19.8%"
    ok = {"title": "榜单观察", "body": "15 个类目里,212 款样本至少 19.8% 含透明质酸钠。" + "判断依据与反证条件。" * 30, "tags": ["跨境美妆"]}
    assert gate(ok, "xhs", W, clients, evidence([], {}) + ev) == [], gate(ok, "xhs", W, clients, ev)
    assert gate({"title": "x", "body": "Median 22,000–34,000 reviews across 15 categories. " * 18}, "linkedin", W, clients,
                ev + " " + " ".join(re.findall(r"\d+", "22000 34000"))) == []
    assert evidence(["a"], {"a": {"text": "2.2–3.4 万"}}).split()[-2:] == ["22000", "34000"]
    bad = lambda body, pf="linkedin": {g for g, _ in gate({"title": "t", "body": body}, pf, W, clients, ev, size=False)}
    assert "数字回源" in bad("A 1.3-wormula library.")                       # W39 LinkedIn 乱码数字
    assert "频率≠销量" in bad("26.7% of consumers prefer it.")                # W38 主语错
    assert "数字回源" in bad("十八万产能,稳定交付。", "channels")              # W39 抖音无出处产能
    assert "极限词" in bad("这是最佳选择", "xhs") and "功效禁用" in bad("Clinically proven formula")
    assert "导流" in bad("详见 https://x.com", "xhs") and "品牌口径" in bad("Try BEAUTY2OEM")
    assert "商务数字" in bad("MOQ is low") and "口径禁词" in bad("SueAI 集团出品", "mp")
    assert "公开层边界" in bad("Made for " + clients[0]) and "商务数字" in bad("3–7 天出样", "mp")
    assert "公开层边界" in bad("我们为" + clients[0] + "代工", "xhs")               # 客户名紧贴汉字
    assert "占位符" in bad("Let's talk: [Insert Contact/Link]") and "功效禁用" in bad("祛痘猛药", "mp")   # W39 LinkedIn-1 / 公众号-2
    assert "点名品牌" in bad("Stocked at Ulta and Olay")                        # 词表里 "\b" 写成单斜杠会变退格符
    assert "占比≠含量" in bad("透明质酸钠含量至少19.8%", "xhs")                 # W39 小红书-2:出现率写成了含量
    assert "公开层边界" in bad("Per material R7-5, minoxidil is banned.")       # W39 LinkedIn-1:素材编号漏进正文
    # 09-24 W8 新三闸(A3):W39 草稿-自动 实例
    assert "服务承诺" in bad("BIOSPHERE helps you map these restrictions before you start.")   # W39 LinkedIn-1
    assert "服务承诺" in bad("If your roadmap includes multiple regions, let us verify your ingredient list against current bans.")
    assert "服务承诺" in bad("We ensure your batch records align with these specific regulatory dates.")   # W39 LinkedIn-2
    assert "服务承诺" in bad("我们提供免费配方筛查,保证一次过审。", "mp")
    assert "服务承诺" in bad("This capacity ensures we can meet delivery timelines.")          # 09-24 A1 真跑 LinkedIn-2
    assert "服务承诺" in bad("帛卉可帮助卖家快速完成产品成分审查与标签调整。", "mp")              # 09-24 A1 真跑 公众号-2
    assert "服务承诺" in bad("We help navigate these compliance hurdles.")                     # 09-24 A1 终版 LinkedIn-2
    assert "服务承诺" not in bad("这是路径判断,而非对最终销售结果的承诺。", "xhs")               # 否定句不误拦(A1 终版 公众号-1)
    assert "服务承诺" in bad("我们承诺按期交付。", "xhs")
    reg = "2026-07-31 欧盟:过敏原标注新规适用。\n2026-07-15 英国:禁用 4-MBC。"
    t9 = dt.date(2026, 9, 24)
    tz = lambda body, ev="": {g for g, _ in gate({"title": "t", "body": body}, "linkedin", W, clients, ev, size=False, today=t9)}
    assert "法规时态" in tz("From July 31, 2026, the EU will enforce labeling for 56 new allergens.")   # W39 LinkedIn-2
    assert "法规时态" in tz("Adjust your specs for the EU and UK markets ahead of these deadlines.", reg)
    assert "法规时态" in tz("该规定将于2026年7月31日起实施。")
    assert "法规时态" not in tz("From July 31, 2026, the EU applies labeling for 56 new allergens.", reg)   # 已生效写法不拦
    assert "法规时态" not in tz("The rule will apply from 1 March 2027.", reg)                              # 真未来日期不拦
    mp_ok = "### 看到了什么\n正文。\n### 我们的判断\n正文。\n\n点击阅读原文提交店铺,领《机会简报》"
    assert "公众号结构" not in bad(mp_ok, "mp")
    assert "公众号结构" in bad(mp_ok.rsplit("\n\n", 1)[0], "mp")                     # W39 公众号-1/2:缺阅读原文 CTA
    assert "公众号结构" in bad("看到了什么。我们的判断。\n\n点击阅读原文提交店铺,领《机会简报》", "mp")   # 没小标题
    # 09-24 S08(A2 回放闸 / A9 发布清单)
    assert "比例换算" in bad("2 in 3 formulas now skip fragrance") and "比例换算" in bad("Over one-third of tracked formulas.")   # W38 TikTok-1
    assert "频率≠销量" in bad("Adenosine appears in 32.9% of skincare products in the Korean market, the most prevalent active.")   # W38 LinkedIn-1
    pf, p, c, _ = parse_md("---\n平台: 小红书\n标题: t\n---\n\n正文。\n\nhttps://biosphere-ai.com/zh-cn/x/\n")
    assert pf == "xhs" and c is None and "导流" in {g for g, _ in gate(p, pf, W, clients, ev, size=False)}   # W38/W39 旧版小红书带网址
    r1 = {"utm_content": "u1", "暗号": "A1B2C", "稿件指纹": "f1"}
    old = list(csv.DictReader(io.StringIO(to_csv(PUB_COLS, [r1])))); old[0]["审批人"] = "市场部"
    assert merge([r1], old, ("utm_content",), MANUAL)[0]["审批人"] == "市场部"                       # 人填列重跑不丢
    assert merge([{**r1, "稿件指纹": "f2"}], old, ("utm_content",), MANUAL)[0]["审批人"] == "旧稿:市场部"   # 稿子换了不冒充审批
    us = [links(pf, W["平台尺"][pf]["线"], "2026-W40", i)[:2] for pf in W["平台尺"] for i in (1, 2)]
    assert len({u for u, _ in us}) == len({k for _, k in us}) == len(us)                           # 暗号与 utm_content 各自唯一
    print("selftest ok(机检 38 条断言)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", default="%d-W%02d" % dt.date.today().isocalendar()[:2])
    ap.add_argument("--dry-run", action="store_true", help="只读素材、跑机检自检、探网关,不调模型不写文件")
    ap.add_argument("--replay", metavar="目录", help="回放闸:只把该目录的草稿按当前闸重跑,不调模型、不写文件")
    a = ap.parse_args()
    if not os.path.exists(WORDS): print(f"缺词表 {WORDS}"); return 2
    W = json.load(io.open(WORDS, encoding="utf-8"))
    facts, clients = load_facts()
    SRC = {s["id"]: s for s in load_r7() + load_reg() + load_intel() + [facts]}
    print(f"素材 {len(SRC)} 条:" + " ".join(sorted(SRC)))
    selftest(W, clients)
    if a.replay: return replay(a.replay, W, clients, SRC)
    if a.dry_run:
        tok = os.path.exists(os.path.expanduser("~/.bohui-gateway/TOKEN.txt"))
        try:
            h = json.loads(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(GW + "/health", timeout=5).read())
            gw = "在线" if h.get("ok") else "异常"
        except Exception as e:
            gw = f"不通({str(e)[:60]})"
        print(f"网关 {gw} · token 文件{'在' if tok else '缺'} · 将写到 {OUT_ROOT}/{a.week}/草稿-自动/(dry-run 未写)")
        return 0 if tok and gw == "在线" else 2
    if os.path.exists(os.path.join(OUT_ROOT, "STOP")):
        print("STOP 开关已打开,不写待审草稿"); return 0
    out = os.path.join(OUT_ROOT, a.week, "草稿-自动")
    old_pub, old_rc = read_csv(os.path.join(out, "_发布清单.csv")), read_csv(os.path.join(out, "回执-模板.csv"))   # 人填列要带回
    if os.path.isdir(out) and os.listdir(out):                    # 旧交付物不删:上一版整目录改名留存
        os.rename(out, f"{out}-{dt.datetime.fromtimestamp(os.path.getmtime(out)):%m%d-%H%M}")
    os.makedirs(out)
    topics, prov = make_topics(SRC)
    print(f"选题池 {len(topics)} 个({prov})")
    if not topics: print("选题池为空"); return 3
    io.open(os.path.join(out, "选题池.md"), "w", encoding="utf-8").write(
        f"# {a.week} 选题池(自动,待人审)\n\n| 号 | 线 | 选题 | 角度 | 素材 | 数字回源 | 能带来什么 | 反证条件 |\n|---|---|---|---|---|---|---|---|\n"
        + "\n".join(f"| {t['id']} | {LINES[t['line']][0]} | {t.get('title', '')} | {t.get('angle', '')} | {','.join(t['sources'])} | {'过' if t['num'] == '过' else '找不到 ' + t['num']} | {t.get('why', '')} | {t.get('counter', '')} |" for t in topics) + "\n")
    rows, chan = [], None
    for pf in ("mp", "xhs", "channels", "linkedin"):
        try:
            posts, prov = make_posts(pf, W, topics, SRC)
        except RuntimeError as e:
            print(f"  ✗ {pf}:{e}"); continue
        for i, p in enumerate(posts, 1):
            p, hits, n, provs = run_gate(p, pf, W, clients, SRC)
            fn = f"{W['平台尺'][pf]['名']}-{i}.md"
            rows.append(write_post(out, fn, pf, W, p, hits, n, [prov] + provs, a.week, i, SRC, topics))
            if pf == "channels" and chan is None and not hits: chan = (p, fn)
            print(f"  {fn}:{rows[-1]['状态']}(改写 {n} 次){' ' + rows[-1]['未过'] if hits else ''}", flush=True)
        for i in range(len(posts) + 1, 3):   # 模型少给了稿:清单里记一行缺稿,别让人以为齐了
            r = W["平台尺"][pf]
            rows.append({"文件": f"{r['名']}-{i}.md", "线": LINES[r["线"]][0], "平台": r["名"], "状态": "缺稿", "改写": 0,
                         "未过": f"模型只给了 {len(posts)} 篇", "出处": "—"})
            print(f"  ✗ {r['名']}-{i}.md:缺稿(模型只给了 {len(posts)} 篇)")
        if pf == "channels" and chan is None and posts: chan = (posts[0], f"{W['平台尺'][pf]['名']}-1.md")
    if chan:
        try:
            shots, need, hits, prov, sn = storyboard(chan[0], W, clients, SRC)
            md = (f"# 短视频分镜 · 对应 {chan[1]}(待人审;只用实拍与 HTML 信息图)\n\n模型:{prov}(改写 {sn} 次)· 机检:" + ("通过" if not hits else ";".join(f"{g}:{h}" for g, h in hits))
                  + "\n\n| 秒 | 画面 | 口播 | 字幕 | 素材 | 注意 |\n|---|---|---|---|---|---|\n"
                  + "\n".join("| " + " | ".join(str(s.get(k, "")).replace("|", "/").replace("\n", " ") for k in ("sec", "画面", "口播", "字幕", "素材", "注意")) + " |" for s in shots)
                  + "\n\n## 要实拍的素材\n" + "\n".join(f"- [ ] {x}" for x in need)
                  + "\n\n## 发布前逐帧确认\n- [ ] 画面无客户品牌、客户标签、配方单、电脑屏幕上的非公开内容\n- [ ] 信息图数字与口播稿出处一致\n- [ ] 平台「AI 内容声明」按实际勾选\n")
            io.open(os.path.join(out, "分镜-视频号.md"), "w", encoding="utf-8").write(md)
            rows.append({"文件": "分镜-视频号.md", "线": LINES["b2o"][0], "平台": "视频号分镜", "状态": "待人审" if not hits else "死信",
                         "改写": sn, "未过": ";".join(f"{g}:{h}" for g, h in hits) or "—", "出处": ",".join(dict.fromkeys((chan[0].get("sources") or []) + ["F-1"]))})
            print(f"  分镜-视频号.md:{rows[-1]['状态']}(改写 {sn} 次)")
        except RuntimeError as e:
            print(f"  ✗ 分镜:{e}")
    io.open(os.path.join(out, "_审核清单.md"), "w", encoding="utf-8").write(
        f"# {a.week} 自动草稿 · 审核清单\n\n本批只到「待人审」,系统不发布任何内容。人审点①:逐条选 通过 / 改一句(改后重跑机检)/ 驳回 + 原因码。\n"
        f"驳回原因码:{REJECT_CODES}。死信 = 自动重写 {REWRITE_MAX} 次仍未过机检,需要人看。\n"
        "本版机检:平台尺、极限词、功效禁用、商务数字、口径禁词、频率≠销量、公开层边界(含客户名)、品牌口径 / 导流、数字回源简版、服务承诺、法规时态、公众号结构(小标题 + 阅读原文)。"
        "未上:宣称强度梯、证据对位、另一家模型审校 —— 人审时补看宣称强弱与证据。\n\n"
        "| 文件 | 线 | 平台 | 机检 | 改写 | 未过的闸 | 出处 | 人审 | 原因码 |\n|---|---|---|---|---|---|---|---|---|\n"
        + "\n".join(f"| {r['文件']} | {r['线']} | {r['平台']} | {r['状态']}{'·' + B2O_HOLD if r['线'] == LINES['b2o'][0] else ''} | {r['改写']} | {r['未过']} | {r['出处']} | □通过 □改一句 □驳回 | |" for r in rows)
        + f"\n\nBEAUTY2OEM 线全部「{B2O_HOLD}」(域名国内可访问、简报同意勾选到位之前)。排期、审批人、驳回原因码、帖子链接、发布时间填在 `_发布清单.csv`,重跑会带回。\n")
    pub = [{**r, "机检": r["状态"], "数字出处": r["出处"] + "(逐字原文见稿件「出处」节)"} for r in rows if r.get("utm_content")]
    assert len({r["暗号"] for r in pub}) == len({r["utm_content"] for r in pub}) == len(pub), "暗号或 utm_content 重复"
    io.open(os.path.join(out, "_发布清单.csv"), "w", encoding="utf-8-sig").write(to_csv(PUB_COLS, merge(pub, old_pub, ("utm_content",), MANUAL)))
    rc = [{"帖子号": r["utm_content"], "窗口": w} for r in pub for w in ("48h", "7d")]
    io.open(os.path.join(out, "回执-模板.csv"), "w", encoding="utf-8-sig").write(to_csv(RECEIPT_COLS, merge(rc, old_rc, ("帖子号", "窗口"), RECEIPT_COLS[2:])))
    good = sum(r["状态"] == "待人审" for r in rows)
    print(f"完成:{len(rows)} 份,待人审 {good},死信 {sum(r['状态'] == '死信' for r in rows)},缺稿 {sum(r['状态'] == '缺稿' for r in rows)} → {out}")
    return 0 if rows else 3


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:
        print(f"异常:{e!r}"); sys.exit(1)
