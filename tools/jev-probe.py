"""Jev(TypeSafe AI)判断模型探针:中文行不行、延迟多少、置信度像不像样。09-21 17:0x 创始人给 key 后第一件事。
用法:python tools/jev-probe.py  (key 从 .env 的 TYPESAFE_API_KEY 读)"""
import io, os, re, json, time, sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = io.open(os.path.join(ROOT, ".env"), encoding="utf-8").read()
_m = re.search(r"^TYPESAFE_API_KEY=(.+)$", env, re.M)
KEY = _m.group(1).strip() if _m else ""
if not KEY:   # 09-23 零付费:Jev 已停
    print("Jev 已停用(零付费),跳过探针"); sys.exit(0)
def jev(state, questions):
    body = json.dumps({"state": state, "model": "jev-latest", "questions": questions}).encode()
    req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=body, method="POST",
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=60) as f: d = json.loads(f.read().decode("utf-8"))
    return d, round((time.time() - t) * 1000)

CASES = [
    # ① 询盘分级(中文 + 英文混)
    ("Hi, we are a DTC brand in Jakarta, looking for OEM of vitamin C serum 30ml, first order 3000 pcs, need BPOM notification support. Please quote.",
     {"is_real_buyer": {"type": "noul", "instructions": "这条询盘像真实采购方(品牌/进口商/批发商),而不是同行探价、学生或广告吗?"},
      "stage": {"type": "choice", "instructions": "采购意向处于哪个阶段?", "criteria": {"browsing": "只是了解,没有产品和数量", "spec": "有明确产品、数量或市场", "ready": "已谈到打样、付款或交期"}},
      "category": {"type": "choice", "instructions": "产品属于哪个品类?", "criteria": {"skincare": "护肤", "suncare": "防晒", "cleansing": "洁面洗护", "color": "彩妆", "oralcare": "口腔护理", "other": "其他"}},
      "urgency": {"type": "score", "instructions": "紧迫程度", "criteria": ["不急", "一般", "很急"]}}),
    # ② 纯中文工单
    ("你好,我们是上海的一个新品牌,想做一款玻尿酸面膜,大概 5000 片起,想先看看样品和报价,预算不多。",
     {"is_real_buyer": {"type": "noul", "instructions": "这条询盘像真实采购方吗?"},
      "stage": {"type": "choice", "instructions": "采购意向阶段", "criteria": {"browsing": "只是了解", "spec": "有明确产品数量", "ready": "已谈打样付款交期"}},
      "category": {"type": "choice", "instructions": "品类", "criteria": {"skincare": "护肤(含面膜精华面霜)", "suncare": "防晒", "cleansing": "洁面洗护", "color": "彩妆", "oralcare": "口腔", "other": "其他"}},
      "budget_low": {"type": "noul", "instructions": "客户明确表示预算有限吗?"}}),
    # ③ 商品分类(中文标题,列表里挑)
    ("凝世金颜眼唇霜 15g 淡化细纹 紧致眼周",
     {"cat": {"type": "choice", "instructions": "这个商品属于哪个品类?", "criteria": {"面霜": "面部乳霜", "眼霜": "眼部护理霜", "精华": "精华液/安瓶", "面膜": "面膜", "洁面": "洁面/卸妆", "防晒": "防晒", "口红": "唇部彩妆", "粉底": "底妆", "洗发": "洗发护发", "身体乳": "身体护理", "其他": "以上都不是"}}}),
    # ④ 选专家(41 里挑,先给 8 个候选)
    ("客户问:我们的水杨酸洁面卖美国 DTC 半年,复购差、评论说太干,想升级配方,顺便问下印尼 BPOM 要不要重新报。",
     {"expert": {"type": "choice", "instructions": "最该先召集哪位专家?", "criteria": {"formulator": "配方工程师(乳化体系/温和性)", "cost": "成本工程师", "us_reg": "美国法规专员(MoCRA)", "id_reg": "印尼 BPOM 法规专员", "packaging": "包材结构工程师", "growth": "增长与复购分析", "claims": "宣称与文案", "qc": "质检"}},
      "needs_second": {"type": "noul", "instructions": "这个问题需要第二位专家一起会诊吗?"}}),
    # ⑤ 陷阱:数字与日期(文档说它不行,验证一下)
    ("交期 45 天,下单日 2026-09-21,客户要求 2026-10-20 前到货。",
     {"can_meet": {"type": "noul", "instructions": "按交期能在客户要求日期前交付吗?"}}),
]
for i, (state, qs) in enumerate(CASES, 1):
    try:
        d, ms = jev(state, qs)
        ans = {k: (v.get("choice") if v["type"] == "choice" else round(v.get("noul", v.get("score", 0)), 2)) for k, v in d["answers"].items()}
        conf = {k: round(v.get("confidence", v.get("noul", 0)), 2) for k, v in d["answers"].items()}
        print(f"#{i} {ms} ms  usage={d.get('usage')}\n   answers={ans}\n   confidence={conf}")
    except Exception as e:
        print(f"#{i} ERR {e}")
