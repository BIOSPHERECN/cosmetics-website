#!/usr/bin/env python3
"""知识库回复可信闸 · 第 1 批(源码拆解-RAG与科研-v1 §二 D 组 / §三 第 1 批)。纯函数,不联网、不读库、不调模型。

  D3 无出处断言:含实证动词 / 模糊量词 / 数字,又没有出处,且不是定义句 → 拦
  D4 措辞强度:功效、因果强词要证据档 ①;关联词要证据档 ②(tier 越小证据越硬)
  D5 时间措辞:相对时间词(最近、今年、下个月、即将…)一律改绝对日期;未来日期写成「已生效」→ 拦
  D6 模型不算数:倍数、增幅、同比、折合等派生数,要么在出处里逐字出现,要么由 calc() 按白名单算式算出
  D7 对内对外双视图:【内部】…【/内部】 段只进内部视图;客户视图里再出现成本、单价、配方编号 → 拦

  未做:D1 直答阈值(等 20 条真实询盘校准)、D2 句级出处(用向量的部分等核实 Vectorize 当月用量)。
用法:import trust_gate as tg; hits = tg.check(text, evid, today=..., tier=2) → [(闸名, 说明)],空列表 = 通过。
自检:python tools/trust_gate.py
"""
import ast, datetime as dt, operator, re

# ── 断句与出处 ────────────────────────────────────────────────────────────────
def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[。!?;!?;])|(?<=[.!?;])\s+|\n+", text or "") if s.strip()]


CITE = re.compile(r"\[[^\]\n]{1,24}\]|【(来源|出处)|(来源|出处|资料来源|数据来源)\s*[::]|据[^,。,;;]{1,25}(称|显示|统计|数据|报道|公告|通报)"
                  r"|《[^》]+》|\baccording to\b|\bsource\s*:|https?://", re.I)
DEFN = re.compile(r"是指|指的是|定义为|即指|所谓|\bmeans\b|\brefers? to\b|\bis defined as\b|\bstands for\b", re.I)
NEG = re.compile(r"(不|非|无|没有|禁止|不得|不能|不写|不说|不做|\bnot\b|\bno\b|\bnever\b|n't)[^。.!?\n]{0,8}$", re.I)

# 不算数字的:日期、年份、条款号、标准号
MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
EXEMPT = re.compile(
    r"20\d\d\s*[-/年.]\s*\d{1,2}(\s*[-/月.]\s*\d{1,2}\s*日?)?|\d{1,2}\s*月\s*(\d{1,2}\s*日)?|" + MON + r"\s+\d{1,2}(,?\s+20\d\d)?|\d{1,2}\s+" + MON +
    r"|(?<!\d)(19|20)\d\d(?!\d)|第\s*[\d一二三四五六七八九十百]+\s*[条款章节项号]|\b(Article|Art\.|Annex|Section|No\.?|RDC|Regulation|Directive|Decree)\s*[\dIVX]+(\s*/\s*\d+)*"
    r"|\d+/\d+/(EC|EU|EEC)|\d+/(19|20)\d\d|ISO\s*\d+(:\d+)?|\d+:(19|20)\d\d|\bW\d\d\b|\bQ[1-4]\b", re.I)


def nums(s):
    """数字(去千分位与前导零);「2.2 万」同时给出换算值 22000。"""
    s = EXEMPT.sub(" ", s or "")
    out = {x.replace(",", "").rstrip("%").lstrip("0") or "0" for x in re.findall(r"\d[\d,]*(?:\.\d+)?%?", s)}
    out |= {f"{float(x) * 10000:.0f}" for m in re.findall(r"(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*万", s) for x in m if x}
    return {x.rstrip("0").rstrip(".") if "." in x else x for x in out}


def _in(tok, evid):
    return bool(evid) and tok.lower() in evid.lower()


# ── D3 无出处断言 ────────────────────────────────────────────────────────────
EMPIRIC = re.compile(r"证明(?!文件|材料|书|函)|证实|(数据|调查|研究|测试|检测)(显示|表明|发现)|显示|表明|揭示|临床(验证|证明|证实|测试)|实测"
                     r"|\bprove[ns]?\b|\bdemonstrat(e|es|ed)\b|\bconfirm(s|ed)? that\b|\b(data|studies|research|tests?|results?) (shows?|suggests?|indicates?)\b|\bshows? that\b", re.I)
QUANT = re.compile(r"绝?大多数|多数|绝?大部分|过半|半数以上|几乎(所有|全部)|\b(vast )?majority\b|\bmost (of|brands|buyers|consumers|sellers|shoppers|products|customers|people|users)\b"
                   r"|\b(nearly|almost) all\b", re.I)


def uncited(text, evid=None, numbers=True):
    """一句话含实证动词 / 模糊量词 / 数字,没有出处标记,不是定义句 → 无出处断言。
    给了 evid(本条所引出处原文)时:触发词或数字在 evid 里逐字出现就算有出处。numbers=False:数字交给调用方自己的回源闸。"""
    hits = []
    for s in sentences(text):
        if CITE.search(s) or DEFN.search(s): continue
        have, own = (nums(evid) if evid else set()), nums(s)
        # 「数据显示:中位数 2.2–3.4 万」—— 动词后面跟的是出处里的原数,算有出处;「212 款数据揭示了真相」动词后没数字,是解读,要拦
        anchor = lambda m: bool(evid) and bool(nums(s[m.end():])) and nums(s[m.end():]) <= have
        bad = [m.group(0) for m in EMPIRIC.finditer(s) if not (anchor(m) or _in(m.group(0), evid))]
        bad += [m.group(0) for m in QUANT.finditer(s) if not _in(m.group(0), evid)]   # 量词是在改写原数,锚了数字也拦
        if numbers: bad += sorted(own - have)
        if bad: hits.append(("无出处断言", f"「{'、'.join(dict.fromkeys(bad))}」没有出处:{s[:70]}"))
    return hits


# ── D4 措辞强度 ──────────────────────────────────────────────────────────────
STRONG = re.compile(r"治疗|治愈|根治|根除|修复|逆转|再生|杜绝|临床(证明|验证|证实)|显著(改善|提升|减少|降低|淡化|增加)|明显改善|立竿见影|永久|彻底(解决|去除|消除|改善)"
                    r"|\bcures?\b|\bheal(s|ing)?\b|\btreat(s|ing)?\b|\beradicat\w+|\bclinically (proven|tested|shown)\b|\bproven to\b|\bsignificantly (improv|reduc|boost|increas)\w*"
                    r"|\bpermanent(ly)?\b|\breverses? (aging|ageing|damage|wrinkles|hair loss)\b|\bprevents? (acne|aging|ageing|wrinkles|hair loss|breakouts)\b", re.I)
ASSOC = re.compile(r"有报道|据报道|常见于|与[^。,,]{1,12}(相关|有关联)|\bassociated with\b|\blinked to\b|\breportedly\b", re.I)


def strength(text, tier=2):
    """tier:1 = 官方原文逐句对位;2 = 有出处但不逐句对位(自动稿的默认);3 = 无出处。
    功效 / 因果强词要 tier 1,关联词要 tier ≤2。否定句(不写「修复」、does not treat)不拦。"""
    hits = []
    for rx, need, what in ((STRONG, 1, "功效/因果强词要证据档①"), (ASSOC, 2, "关联词要证据档②")):
        if tier <= need: continue
        for m in rx.finditer(text or ""):
            if NEG.search(text[max(0, m.start() - 12):m.start()]): continue
            hits.append(("措辞强度", f"{what}:{m.group(0)}"))
    return hits


# ── D5 时间措辞 ──────────────────────────────────────────────────────────────
RELTIME = re.compile(r"最近|近期|近日|近来|不久前|前不久|今年|去年|明年|前年|(?<![回成资基])本(周|月|季度?)(?![期转])|上个?月|下个?月|上周|下周|上季度|下季度|即将"
                     r"|\brecent(ly)?\b|\blately\b|\bthis (year|month|week|quarter)\b|\b(last|next) (year|month|week|quarter)\b|(?<!as )\bsoon\b|\bupcoming\b", re.I)
DONE = re.compile(r"已(经)?(于|生效|实施|施行|执行|落地|禁用|禁止|适用)|\btook effect\b|\bcame into (force|effect)\b|\b(has been|was|were) (banned|enforced|implemented|prohibited)\b"
                  r"|\bis now in force\b|\bnow applies\b", re.I)
MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


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


def temporal(text, today=None):
    """相对时间词 → 拦(改写成绝对日期);句中日期晚于今天却写成已生效 / 已实施 → 拦。
    已生效写成将要生效由 drafts.py 的 tense() 管,这里不重复。"""
    today = today or dt.date.today()
    hits = [("时间措辞", f"相对时间词「{m.group(0)}」要改成绝对日期") for m in RELTIME.finditer(text or "")]
    for s in sentences(text):
        own = dates(s)
        if own and max(own) > today and DONE.search(s):
            hits.append(("时间措辞", f"未来日期写成已发生:{s[:70]}"))
    return hits


# ── D6 模型不算数 ────────────────────────────────────────────────────────────
DERIVED = re.compile(r"\d+(\.\d+)?\s*倍|[几数十两三四五六七八九百]+倍|翻(了)?(一)?(番|倍)|成倍|\d+(\.\d+)?\s*[x×](?![A-Za-z0-9])|\d+(\.\d+)?-fold"
                     r"|\btwice as\b|\b(two|three|four|five|ten|\d+) times (more|higher|faster|lower|larger|bigger|greater|as)\b", re.I)
DERIVED_KW = re.compile(r"增长率|增速|增幅|涨幅|降幅|同比|环比|折合|约合|百分点|percentage points?|\bgrowth rate\b", re.I)
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def calc(expr, names=None):
    """模型只给算式,程序算。只准:数字、事实层变量名(names 里有的)、+ − × ÷、正负号、括号。
    不用 eval;属性、下标、调用、lambda、乘方一律拒。结果由调用方连同算式存档。"""
    names = names or {}
    if len(expr) > 200: raise ValueError("算式超过 200 字符")

    def ev(n):
        if isinstance(n, ast.Expression): return ev(n.body)
        if isinstance(n, ast.Constant) and type(n.value) in (int, float): return n.value
        if isinstance(n, ast.Name) and n.id in names: return float(names[n.id])
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            try: return _OPS[type(n.op)](ev(n.left), ev(n.right))
            except ZeroDivisionError: raise ValueError("除数为 0")
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
            return -ev(n.operand) if isinstance(n.op, ast.USub) else ev(n.operand)
        raise ValueError(f"算式里有不允许的成分:{type(n).__name__}")
    return ev(ast.parse(expr, mode="eval"))


def derived(text, evid=None, results=()):
    """倍数、增幅、同比、折合这类派生数:出处里逐字有,或数值等于 calc() 算出的某个结果(±0.5%)才放行。"""
    def ok(tok):
        if _in(tok, evid): return True
        n = re.search(r"\d+(\.\d+)?", tok)
        return bool(n) and any(abs(float(n.group(0)) - v) <= abs(v) * 0.005 for v in results)
    hits = [("模型不算数", f"派生数「{m.group(0)}」出处里没有,要给算式由程序算") for m in DERIVED.finditer(text or "") if not ok(m.group(0))]
    for s in sentences(text):
        m = DERIVED_KW.search(s)
        if m and re.search(r"\d", EXEMPT.sub(" ", s)) and not _in(m.group(0), evid):
            hits.append(("模型不算数", f"「{m.group(0)}」是派生数,出处里没有:{s[:70]}"))
    return hits


# ── D7 对内对外双视图 ────────────────────────────────────────────────────────
INTERNAL = re.compile(r"【内部】.*?【/内部】", re.S)
LEAK = re.compile(r"(原料|生产|采购|制造|单位|包材|物料|配方)成本|成本价|成本\s*(约|为|是|在)?\s*[::]?\s*[¥$￥\d]|原料价|原料单价|采购价|进货价|进价|底价|出厂价|毛利|利润率|单价|内部编号|配方编号"
                  r"|\bunit cost\b|\bcost price\b|\bCOGS\b|\b(gross|profit|our) margins?\b|(RMB|CNY)\s?\d|[¥￥]\s?\d|\d+(\.\d+)?\s*元(?![素醇酸])|\b[A-Z]{2}-[A-Z]{2}\d{3}\b|【/?内部】", re.I)


def views(text):
    """同一段内容两份:internal 给模型和内部同事(去掉标记保留内容),customer 给客户和公开页(整段去掉)。"""
    return {"internal": re.sub(r"【/?内部】", "", text or ""), "customer": re.sub(r"\n{3,}", "\n\n", INTERNAL.sub("", text or "")).strip()}


def leaks(text):
    """客户视图里还出现成本、单价、配方编号 → 拦。发给客户或写进公开页之前跑。"""
    return [("对内泄露", f"客户视图里有内部信息:{m.group(0)}") for m in LEAK.finditer(text or "")]


# ── 总入口 ───────────────────────────────────────────────────────────────────
def check(text, evid=None, today=None, tier=2, numbers=True, results=()):
    """对外文字过闸:D3 + D4 + D5 + D6 + D7(对客户视图)。返回 [(闸名, 说明)],空 = 通过。"""
    t = views(text)["customer"]
    return uncited(t, evid, numbers) + strength(t, tier) + temporal(t, today) + derived(t, evid, results) + leaks(t)


def selftest():
    t9 = dt.date(2026, 9, 24)
    g = lambda text, evid=None, **k: {x for x, _ in check(text, evid, today=t9, **k)}
    ev = "15 个类目、7 次快照;每类 Top100 里 78–91 款最多缺席 1 次;护肤主类评论中位数 2.2–3.4 万;头皮类是 739"
    # D3
    assert "无出处断言" in g("15 个类目中多数 Top100 产品几乎不动。", ev)                        # W39 公众号-2:多数 出处里没有
    assert "无出处断言" in g("212款榜单产品的真实全成分数据,揭示了一个被忽略的真相。", "212 款")   # W39 小红书-2
    assert "无出处断言" in g("Studies show our base improves hydration.")
    assert "无出处断言" in g("产能 18 万支。")                                                  # 没出处的数字
    assert g("15 个类目、7 次快照,78–91 款最多缺席 1 次。", ev) == set()                        # 数字都在出处里
    assert g("数据显示,护肤主类评论中位数是 2.2–3.4 万。", ev) == set()                          # 实证动词锚在出处原数上
    assert "无出处断言" in g("The data shows the base system is remarkably standardized.", ev)   # W39 0923-1804 LinkedIn-1:没数字的解读
    assert "无出处断言" in g("在多数类目中,Top100 里有 78–91 款最多缺席 1 次。", ev)              # 量词锚了数字也拦
    assert g("差异化靠少数核心功效。", ev) == set()
    assert g("护肤主类评论中位数是 2.2–3.4 万。", ev) == set()
    assert g("Median 22,000 reviews in 15 categories.", ev) == set()                            # 万 换算后能回源
    assert g("据英国产品安全警示(2026-09-01)显示,3 款被召回。") == set()                       # 有出处标记
    assert g("所谓无香,是指不添加香精香料。") == set()                                          # 定义句
    assert g("欧盟 1223/2009 附录 II 第 1380 条;ISO 22716:2007;RDC 529/2021。") == set()          # 条款号、标准号不算数字
    assert g("Could you confirm which line you would outsource?") == set()                      # 请求确认 ≠ 实证动词
    assert "无出处断言" not in g("产能 18 万支。", numbers=False)                                # 数字交给调用方
    # D4
    assert "措辞强度" in g("这款精华能修复屏障。") and "措辞强度" in g("Clinically proven to reduce redness.")
    assert "措辞强度" in g("It significantly improves texture.") and "措辞强度" in g("Our cream heals dry skin.")
    assert "措辞强度" not in g("这款精华能修复屏障。", tier=1)                                   # 官方原文对位才放行
    assert "措辞强度" not in g("我们不写修复、治疗这类词。") and "措辞强度" not in g("It does not treat any condition.")
    assert "措辞强度" not in g("a hair treatment mask base") and "措辞强度" not in g("barrier repair cream base")   # 剂型名不拦
    assert "措辞强度" in g("该成分与致敏有关联。", tier=3) and "措辞强度" not in g("该成分与致敏有关联。", tier=2)
    # D5
    assert "时间措辞" in g("欧盟最近又禁了一批成分。") and "时间措辞" in g("The rule takes effect next month.")
    assert "时间措辞" in g("Clean Skin Club recently launched a Healthy Aging series.")       # W39 开发信 1
    assert "时间措辞" in g("该规定已于2027年3月1日生效。")                                      # 未来日期写成已生效
    assert "时间措辞" not in g("试错成本高、回本周期长。") and "时间措辞" not in g("Reply as soon as convenient.")   # 0923-1816 公众号-1
    assert "时间措辞" not in g("该规定于2026年7月31日生效。") and "时间措辞" not in g("The ban took effect on 31 July 2026.")
    # D6
    assert "模型不算数" in g("评论门槛差几十倍。", ev)                                           # W39 公众号-2 标题
    assert "模型不算数" in g("Reviews are 30x higher in skincare.", ev)
    assert "模型不算数" in g("销量同比增长 12%。")
    r = calc("a / b", {"a": 22000, "b": 739})
    assert abs(r - 29.77) < 0.01 and "模型不算数" not in g("评论门槛约 29.8 倍。", ev, results=[r])
    assert calc("(34000 - 22000) / 22000 * 100") > 54 and calc("-3 + 2 * 4") == 5
    for bad in ("__import__('os')", "a.b", "x[0]", "(lambda: 1)()", "2 ** 999", "open('f')", "True + 1", "1 / 0", "c * 2"):
        try: calc(bad, {"a": 1}); raise AssertionError(bad)
        except ValueError: pass
        except SyntaxError: pass
    # D7
    v = views("客户版说明。\n【内部】原料成本 38 元/kg,配方编号 SK-SE001【/内部】\n以报价单为准。")
    assert "原料成本" in v["internal"] and "SK-SE001" in v["internal"] and "成本" not in v["customer"] and "【" not in v["internal"]
    assert g("客户版说明。\n【内部】原料成本 38 元/kg【/内部】", numbers=False) == set()          # 内部段不进客户视图
    assert "对内泄露" in g("这个配方的原料单价很低。") and "对内泄露" in g("Base SK-SE001 fits your line.")
    assert "对内泄露" in g("Our margin on this is thin.") and "对内泄露" in g("每支 3.5 元。", numbers=False)
    assert "对内泄露" not in g("新品的早期曝光成本在头发类目里更低。") and "对内泄露" not in g("1,2-己二醇和二元醇。")
    print("trust_gate selftest ok(D3–D7 共 56 条断言)")


if __name__ == "__main__":
    selftest()
