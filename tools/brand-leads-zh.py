"""brand_leads 批量翻译:一次 8 行、所有字段打包成 JSON 让模型整体译,8 路并行;只翻还没译的行。"""
import io, json, os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, HERE)
from _bohui import chat, d1, d1_exec, fleet
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
F = ["country", "hq_city", "category", "positioning", "revenue", "contact", "executives", "manufacturing", "why_target", "parent"]
# --enrich:译第三方多维补充字段(tools/brand-enrich-load.py 灌的),只翻已补充且还没译的行
if "--enrich" in sys.argv: F = ["top_geo", "top_source", "mfg_country", "mfg_evidence", "channels", "funding", "analysis", "coop_angles"]
cols = [c["name"] for c in d1("PRAGMA table_info(brand_leads)")]
for k in F:
    if k + "_zh" not in cols: d1(f"ALTER TABLE brand_leads ADD COLUMN {k}_zh TEXT")
WHERE = "enriched_at IS NOT NULL AND (analysis_zh IS NULL OR analysis_zh = '' OR analysis_zh = analysis)" if "--enrich" in sys.argv else "positioning_zh IS NULL OR positioning_zh = '' OR positioning_zh = positioning"
rows = d1("SELECT id, country_zh, " + ", ".join(F) + " FROM brand_leads WHERE " + WHERE)
print("待译行", len(rows))
allp = fleet(); PROVS = [p for p in allp if str(p["model"]).startswith("agnes-3")] + [p for p in allp if not str(p["model"]).startswith("agnes-3")]
SYS = ("你是化妆品行业商务翻译。用户给一个 JSON 数组,每个元素是一家品牌的若干英文字段。把每个字段的值译成简体中文,"
       "保留品牌名、公司名、零售商名(Sephora、Ulta、Amazon 等)、股票代码、网址、邮箱、电话、金额、百分比、年份、法规编号原样;国家名译成中文简称;'in-house' 译'自有工厂','contract manufacturer' 译'代工厂';'not disclosed' 译成'未披露';'—' 保持'—';空字符串保持空。"
       "只输出同结构的 JSON 数组(相同的 id 与键名),不加任何解释、不加代码围栏。")
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"
done = 0
def tr(chunk):
    global done
    payload = [{"id": r["id"], **{k: (r.get(k) or "") for k in F}} for r in chunk]
    try:
        out, who, err = chat(PROVS, [{"role": "system", "content": SYS}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}], max_tokens=6000, temperature=0.1, think=False)
        t = re.sub(r"^```\w*|```$", "", (out or "").strip(), flags=re.M)
        m = re.search(r"\[[\s\S]*\]", t); arr = json.loads(m.group(0)) if m else []
    except Exception as e:
        arr = []
    byid = {int(x.get("id", 0)): x for x in arr if isinstance(x, dict)}
    lines = []
    for r in chunk:
        x = byid.get(r["id"])
        if not x: continue
        x["country"] = re.split(r"[(（;；/,，]", str(x.get("country") or ""))[0].strip()
        sets = ", ".join(f"{k}_zh = {q(str(x.get(k) or ''))}" for k in F if not (k == "country" and r.get("country_zh")))
        lines.append(f"UPDATE brand_leads SET {sets} WHERE id = {r['id']};")
    if lines:
        f = os.path.join(HERE, f"_bz_{chunk[0]['id']}.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n"); d1_exec(f); os.remove(f)
    done += len(lines); print("  译完", done, flush=True)
chunks = [rows[i:i + 8] for i in range(0, len(rows), 8)]
with ThreadPoolExecutor(max_workers=8) as ex: list(ex.map(tr, chunks))
print("完成", done, "· 已译", d1("SELECT COUNT(*) n FROM brand_leads WHERE " + ("analysis_zh IS NOT NULL AND analysis_zh <> ''" if "--enrich" in sys.argv else "positioning_zh IS NOT NULL AND positioning_zh <> ''"))[0]["n"])
