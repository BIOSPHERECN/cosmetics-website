"""经验账本每晚同步(W9 · 2026-09-24):把几张可改写的业务表的增量抄进只追加的 b2o_ledger,
再把 K1 行业动态(22-知识库与专家思维/data/items.jsonl)接进事实层 kb_docs(category=行业动态,后台内部参考)。

依据 06-v2 §4.1/§4.5:账本 payload 只放 id / 枚举 / 数字 / 哈希,自由文本只算哈希不入账;
变没变按 src_hash 判,变了就追加一行、supersedes 指向同一对象上一行。账本改删由 0112 触发器挡。
写库拿公司库锁 _LOCK_D1_COMPANY(并行开跑规则 §二)。

用法:python tools/knowledge/ledger-sync.py [--dry] [--selftest]
本机计划任务 Bohui-LedgerSync 每晚 23:47 跑。
"""
import hashlib, io, json, os, re, socket, sys, time

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, TOOLS)
from _bohui import d1, d1_exec  # noqa: E402

LOCK = "F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY"
ITEMS = "F:/0cosmetic/助手交付/22-知识库与专家思维/data/items.jsonl"
SQL = os.path.join(TOOLS, "_ledger_sync.sql")
AUTHOR = f"job:ledger-sync@{socket.gethostname()}"
PII = re.compile(r"@|\d{7,}|微信|wechat|总$|姐$|老板$|路\d|号楼", re.I)


def h(*parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, default=str).encode()).hexdigest()[:32]


def clean(payload):
    """06-v2 §4.5 写入端校验:只留数字 / 短枚举 / 数字列表;长串和疑似个人信息直接丢掉该字段。"""
    out = {}
    for k, v in payload.items():
        if v is None or isinstance(v, (int, float)):
            out[k] = v
        elif isinstance(v, str) and len(v) <= 32 and (k.endswith("_hash") or not PII.search(v)):
            out[k] = v
        elif isinstance(v, list) and all(isinstance(x, int) for x in v):
            out[k] = v
    return out


def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def events():
    """(entity_type, entity_id, kind, facet, payload含src_hash)。各表行数都在百级以内,全量读 + 哈希比对。
    ponytail: 全表扫,单表过万行再改成按 updated_at 取增量。"""
    ev = []
    for r in d1("SELECT * FROM b2o_predictions"):
        jh = h([r.get(c) for c in ("title", "fact", "anomaly", "pro", "con", "ruling", "analogy", "uncertainty", "invalidation",
                                    "action", "verdict", "card_id", "made_at", "rival_sees", "undecidable_if", "evidence_json",
                                    "query_spec", "frozen_at", "frozen_hash", "review_status")])
        ev.append(("b2o_predictions", r["id"], "judgment", "judgment",
                   {"prediction_id": r["id"], "card_id": r["card_id"], "review_status": r["review_status"],
                    "frozen": 1 if r["frozen_at"] else 0, "frozen_hash": (r["frozen_hash"] or "")[:32] or None, "src_hash": jh}))
        done = [d for d in (7, 30, 60, 90) if r.get(f"r{d}")]
        if done or r["outcome"] != "pending":
            ev.append(("b2o_predictions", r["id"], "review", "review",
                       {"prediction_id": r["id"], "stages": done, "outcome": r["outcome"],
                        "src_hash": h([r.get(c) for c in ("r7", "r30", "r60", "r90", "outcome")])}))
    for r in d1("SELECT id, project_id, version_no, parent_version_id, status, base_codes, recipe_json, rationale_json, gate_json FROM formula_versions"):
        ev.append(("formula_versions", r["id"], "formula_final" if r["status"] == "final" else "rd_change", "rd_change",
                   {"version_id": r["id"], "project_id": r["project_id"], "version_no": r["version_no"], "parent_id": r["parent_version_id"],
                    "status": r["status"], "src_hash": h(r)}))   # 比例只进哈希,不进 payload
    for r in d1("SELECT * FROM formula_feedback"):
        ev.append(("formula_feedback", r["id"], "rd_change", "rd_change",
                   {"feedback_id": r["id"], "version_id": r["version_id"], "round": r["round"], "decision": r["decision"], "src_hash": h(r)}))
    for r in d1("SELECT id, period, market, category, n_products, model, created_at, length(report_md) a, length(report_json) b, length(stats_json) c FROM market_intel"):
        ev.append(("market_intel", r["id"], "judgment", "judgment",   # ponytail: 报告正文按长度+时间做指纹,不整篇拉回本机
                   {"intel_id": r["id"], "period": r["period"], "market": r["market"], "category": r["category"],
                    "n_products": r["n_products"], "src_hash": h(r)}))
    for r in d1("SELECT id, company_id, deal_id, kind, status FROM matters"):   # 不读 contact / phone / 金额
        ev.append(("matters", r["id"], "sellthrough" if r["kind"] == "订单" else "status_change", "status",
                   {"matter_id": r["id"], "company_id": r["company_id"], "deal_id": r["deal_id"], "status": r["status"],
                    "src_hash": h(r["kind"], r["status"])}))
    for r in d1("SELECT id, company_id, deal_id, status FROM quotes"):          # 不读价格与成本
        ev.append(("quotes", r["id"], "customer_choice", "status",
                   {"quote_id": r["id"], "company_id": r["company_id"], "deal_id": r["deal_id"], "status": r["status"], "src_hash": h(r["status"])}))
    for r in d1("SELECT id, company_id, deal_id, status, feedback FROM samples"):  # 客户反馈原文只算哈希
        ev.append(("samples", r["id"], "customer_choice", "status",
                   {"sample_id": r["id"], "company_id": r["company_id"], "deal_id": r["deal_id"], "status": r["status"],
                    "has_feedback": 1 if r["feedback"] else 0, "src_hash": h(r["status"], r["feedback"])}))
    return ev


def ledger_rows():
    last = {}
    for r in d1("SELECT id, entity_type, entity_id, kind, json_extract(payload_json,'$.src_hash') sh, json_extract(payload_json,'$.facet') f "
                f"FROM b2o_ledger WHERE author = {q(AUTHOR)} OR author LIKE 'job:ledger-sync@%' ORDER BY id"):
        last[(r["entity_type"], str(r["entity_id"]), r["f"])] = (r["id"], r["sh"])
    rows = []
    for et, eid, kind, facet, p in events():
        prev = last.get((et, str(eid), facet))
        if prev and prev[1] == p["src_hash"]:
            continue
        p = clean({**p, "facet": facet})
        rows.append(f"({q(et)},{q(eid)},{q(kind)},{q(AUTHOR)},'machine',{q(json.dumps(p, ensure_ascii=False))},{prev[0] if prev else 'NULL'})")
    return [f"INSERT INTO b2o_ledger (entity_type,entity_id,kind,author,author_kind,payload_json,supersedes) VALUES {','.join(rows[i:i + 80])};"
            for i in range(0, len(rows), 80)], len(rows)


def facts_rows():
    have = {r["slug"]: h(r["tags"], r["body"]) for r in d1("SELECT slug, tags, body FROM kb_docs WHERE slug LIKE 'k1-%'")}
    out = []
    for line in io.open(ITEMS, encoding="utf-8"):
        it = json.loads(line)
        if not it.get("relevant"):
            continue
        body = f"{it.get('summary_zh', '')}\n\n帛卉解读:{it.get('meaning', '')}\n\n来源:{it.get('org', '')} · {it.get('published', '')} · 认知档 {it.get('level', '')}"
        tags = ",".join([it.get("source_type", ""), f"数字核验:{it.get('num_check', '')}", "待人审" if it.get("needs_review") else "已核验",
                         *it.get("topics", []), *it.get("markets", [])])[:200]
        slug = "k1-" + it["id"]
        if have.get(slug) == h(tags, body):
            continue
        out.append(f"INSERT INTO kb_docs (slug,title,category,tags,source_url,source_site,body,n) VALUES ({q(slug)},{q(it.get('title_zh', '')[:200])},"
                   f"'行业动态',{q(tags)},{q(it.get('url', '')[:400])},{q(it.get('org', '')[:80])},{q(body)},{len(body)}) "
                   "ON CONFLICT(slug) DO UPDATE SET title=excluded.title, tags=excluded.tags, body=excluded.body, n=excluded.n, imported_at=datetime('now');")
    return out


def with_lock(fn):
    for _ in range(30):   # 最多等 30 分钟
        try:
            os.mkdir(LOCK)
            break
        except FileExistsError:
            time.sleep(60)
    else:
        print("公司库锁 30 分钟未拿到,本次跳过"); return 0
    try:
        io.open(os.path.join(LOCK, "owner.txt"), "w", encoding="utf-8").write(f"W9 ledger-sync {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        return fn()
    finally:
        for f in os.listdir(LOCK):
            os.remove(os.path.join(LOCK, f))
        os.rmdir(LOCK)


def main(dry):
    n0 = d1("SELECT COUNT(*) n FROM ingredient_facts")
    if not n0 or not 5000 <= n0[0]["n"] <= 7000:
        print("库不对(ingredient_facts 不在 5000–7000),停", n0); return 1
    led, n_led = ledger_rows()
    facts = facts_rows()
    print(f"{time.strftime('%Y-%m-%d %H:%M')} 账本待追加 {n_led} 行;行业动态待写 {len(facts)} 条")
    if dry or not (led or facts):
        return 0

    def write():
        stmts = led + facts
        for i in range(0, len(stmts), 6):   # 每文件 ≤480 行
            io.open(SQL, "w", encoding="utf-8", newline="\n").write("\n".join(stmts[i:i + 6]) + "\n")
            if d1_exec(SQL) == 0:
                print("写入 0 行,停"); return 1
            time.sleep(10)
        return 0
    rc = with_lock(write)
    print("账本总行", d1("SELECT COUNT(*) n FROM b2o_ledger"), "行业动态", d1("SELECT COUNT(*) n FROM kb_docs WHERE slug LIKE 'k1-%'"))
    return rc


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        p = clean({"a": 1, "b": "draft", "c": "x" * 33, "d": "a@b.com", "e": "13800138000", "f": [1, 2], "g": ["s"], "h": "王总", "src_hash": "1234567abc"})
        assert p == {"a": 1, "b": "draft", "f": [1, 2], "src_hash": "1234567abc"}, p
        assert h({"x": 1}) == h({"x": 1}) and len(h(1)) == 32
        print("selftest ok"); sys.exit(0)
    sys.exit(main("--dry" in sys.argv))
