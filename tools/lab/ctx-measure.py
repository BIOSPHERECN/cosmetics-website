"""任务 C ①④:会诊提示词 tokens 基线 + 旧/新序列化对比(2026-09-18 创始人「1 省算力」)。

① 基线:formula_runs 每行都记 tokens_in(fleet.chat 的 usage.in),按 step 取最近 20 次 ok=1 的均值;
   ai_runs 把 recommend/generate/synthesize 归并成 LAB-SYNTH 分不开 step,只作旁证一起打印。
   缓存命中行 tokens_in 为 NULL(接口 cachedOutput),自然不进均值。
④ 对比:取每种 step 最近一次成功行的 input_json.messages(旧序列化原文),按 lib 里 compact()/stripMd()/expertBlock()
   同一套规则做文本变换得到「新序列化」,算字符数与估算 tokens(中文 1 字≈1 token,其它 4 字符≈1 token)。
   变换规则与 apps/web/src/lib/formula-lab.ts 一一对应(见各函数注释);是文本层近似,真值以改后跑一次 recommend 的 tokens_in 为准。

用法:python tools/lab/ctx-measure.py            基线 + 对比
      python tools/lab/ctx-measure.py --baseline  只打基线
走 tools/_bohui.py 的 d1()(wrangler --remote,先 source .env)。"""
import io, json, os, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _bohui import d1   # noqa: E402

STEPS = ("gateway", "expert", "generate", "recommend")
CJK = re.compile(r"[　-鿿豈-﫿＀-￯]")


def est_tokens(s: str) -> int:
    """中文 1 字≈1 token,其余 4 字符≈1 token(任务 C ④ 口径)"""
    z = len(CJK.findall(s))
    return z + (len(s) - z + 3) // 4


def baseline():
    print("== formula_runs 最近 20 次 tokens_in 均值(ok=1,tokens_in 非空)==")
    out = {}
    for s in STEPS:
        rows = d1(f"SELECT tokens_in, tokens_out, LENGTH(input_json) chars, created_at FROM formula_runs WHERE step='{s}' AND ok=1 AND tokens_in IS NOT NULL ORDER BY id DESC LIMIT 20")
        if not rows:
            print(f"  {s:10s} 无样本"); continue
        n = len(rows)
        tin = sum(r["tokens_in"] for r in rows) / n
        tout = sum((r["tokens_out"] or 0) for r in rows) / n
        ch = sum((r["chars"] or 0) for r in rows) / n
        out[s] = tin
        print(f"  {s:10s} n={n:2d}  tokens_in={tin:8.0f}  tokens_out={tout:6.0f}  input_json 均长={ch:7.0f}  最近={rows[0]['created_at']}")
    print("== ai_runs 最近 20 次(LAB-* key,旁证)==")
    for k in ("LAB-GATEWAY", "LAB-EXPERT", "LAB-SYNTH"):
        rows = d1(f"SELECT tokens_in FROM ai_runs WHERE prompt_key='{k}' AND ok=1 AND tokens_in IS NOT NULL ORDER BY id DESC LIMIT 20")
        print(f"  {k:12s} n={len(rows):2d}  tokens_in={sum(r['tokens_in'] for r in rows)/len(rows) if rows else 0:8.0f}")
    return out


# ── 与 formula-lab.ts 同规则的文本变换 ─────────────────────────────────────────
def strip_md(t: str) -> str:
    """= lib stripMd():去 ``` # > --- ** [](链接) 行尾空白 空行"""
    t = re.sub(r"```[a-zA-Z]*[ \t]*\n?", "", t)
    t = re.sub(r"^#{1,6}[ \t]+", "", t, flags=re.M)
    t = re.sub(r"^[ \t]*>[ \t]?", "", t, flags=re.M)
    t = re.sub(r"^[ \t]*(?:-{3,}|\*{3,})[ \t]*$", "", t, flags=re.M)
    t = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", t)
    t = re.sub(r"\[([^\]\n]+)\]\([^)\n]*\)", r"\1", t)
    t = re.sub(r"[ \t]+$", "", t, flags=re.M)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()


TIER_DUP = re.compile(r"^(角色专家,不是真人。判断句尾的|涉及法规处一律注明「以最新官方文本为准」。$)")


def cell(v: str) -> str:
    """= lib cell():'—' 占位 → 空;≥4 位小数截 3 位去尾零"""
    v = v.strip()
    if v == "—":
        return ""
    if re.fullmatch(r"-?\d+\.\d{4,}", v):
        return f"{float(v):.3f}".rstrip("0").rstrip(".")
    return v


def table_rows(body: str) -> str:
    """竖线行:' | ' → '|',单元按 cell()"""
    return "\n".join("|".join(cell(x) for x in ln.split(" | ")) for ln in body.split("\n") if ln.strip())


def new_block(head: str, body: str, role: str) -> str:
    """按块标题分派:专家 core / 维基 / 名册 / 基底 / 候选 / 库内原料 / 目录 / 总控 core;其它原样"""
    if head.startswith("专家:"):
        title = head[3:].rsplit("(", 1)[0]
        lines = [l for i, l in enumerate(strip_md(body).split("\n")) if not (i == 0 and l.strip() == title) and not TIER_DUP.search(l.strip())]
        return f"## {head}\n" + "\n".join(lines)
    if head.startswith(("剂型维基:", "原料维基:")):
        title = head.split(":", 1)[1]
        b = strip_md(body)
        return f"## {head}\n" + (b[len(title) + 1:] if b.startswith(title + "\n") else b)
    if head.startswith("专家名册"):
        return "## 专家名册(资料表格为竖线 | 分隔,首行是列名,空单元表示无。)\nslug|职称|域|何时召集\n" + table_rows(body)
    if head.startswith("基底"):
        rows = [dict(kv.split(":", 1) for kv in ln.split(" | ")) for ln in body.split("\n") if ln.strip()]
        cols = []
        for r in rows:
            for k in r:
                if k not in cols: cols.append(k)
        return f"## {head}\n" + "|".join(cols) + "\n" + "\n".join("|".join(cell(r.get(k, "")) for k in cols) for r in rows)
    if head.startswith("候选"):
        first, _, rest = body.partition("\n")   # 旧:第一行「每行一条:code | …」说明 → 新:纯列名行
        cols = first.split(":", 1)[1].replace(" | ", "|")
        return f"## {head}\n{cols}\n" + table_rows(rest)
    if head.startswith("库内原料"):
        return "## 库内原料(优先从这里取)\ninci|中文名|常见用量|pH范围|配伍禁忌|稳定性|中国/欧盟/美国|成本档|可信度\n" + table_rows(body)
    if head.startswith("目录"):
        return "## 目录(中国《已使用化妆品原料目录(2021年版)》)\ninci_key|序号|标准中文名|驻留类最高历史用量%|淋洗类最高历史用量%\n" + table_rows(body)
    if head.startswith("目标市场法规要点"):
        return f"## {head}\n" + strip_md(body)
    if head.startswith("硬规则") and role == "system":
        return f"## {head}\n{body}\n7. 资料表格为竖线 | 分隔,首行是列名,空单元表示无。"
    return f"## {head}\n{body}"


def transform(msg: str, role: str, step: str) -> str:
    parts = msg.split("\n\n## ")
    out = []
    if step == "gateway" and role == "system":   # 网关 system 第一段是总控 core(markdown)
        out.append(strip_md(parts[0]))
    else:
        out.append(parts[0])
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        out.append(new_block(head, body, role))
    return "\n\n".join(out)


def compare():
    print("== 旧/新序列化对比(最近一次成功行的 input_json.messages;token 估算:中文 1 字、其它 4 字符)==")
    print(f"  {'step':10s} {'旧字符':>8s} {'新字符':>8s} {'省':>6s}  {'旧tok':>7s} {'新tok':>7s} {'省':>6s}")
    for s in STEPS:
        r = d1(f"SELECT input_json FROM formula_runs WHERE step='{s}' AND ok=1 AND tokens_in IS NOT NULL ORDER BY id DESC LIMIT 1")
        if not r:
            print(f"  {s:10s} 无样本"); continue
        ms = json.loads(r[0]["input_json"])["messages"]
        old = "\n".join(m["content"] for m in ms)
        new = "\n".join(transform(m["content"], m["role"], s) for m in ms)
        oc, nc, ot, nt = len(old), len(new), est_tokens(old), est_tokens(new)
        print(f"  {s:10s} {oc:8d} {nc:8d} {100 * (oc - nc) / oc:5.1f}%  {ot:7d} {nt:7d} {100 * (ot - nt) / ot:5.1f}%")


if __name__ == "__main__":
    baseline()
    if "--baseline" not in sys.argv:
        compare()
