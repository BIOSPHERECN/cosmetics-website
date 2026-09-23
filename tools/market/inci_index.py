"""成分—产品关系表 market_product_inci 灌数(GPT 设计包 product_ingredients 落到现有 D1,任务 I,2026-09-18)。
依据:原料页 instr 子串匹配 PEG-8 会命中 PEG-80;切分口径与 apps/web/src/lib/decoder.ts 的 splitInci + factKey 逐字一致。
用法:python tools/market/inci_index.py [--only-missing]   幂等(INSERT OR IGNORE),--only-missing 跳过已有 product_id。"""
import io, os, re, sys
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, d1_exec
ONLY_MISSING = "--only-missing" in sys.argv

# decoder.ts splitInci:(?<!\d)[,;,;、] 切 → 去括号 → 空白压一格 → trim;factKey:去括号 → 大写 → 压空白 → 去首尾空白/句点
PAREN = re.compile(r"[（(][^）)]*[）)]")
# 09-22 P 线实测:位号逗号后带空格时(`Aqua, 1, 2-Hexanediol`)上面的 lookahead 失效,切出 `1`/`3-DIOL`
# 这类碎片(全库 667 个碎片键、10,385 次出现,`1` 一个键就 freq 1362)。不改正则 —— P 线消融过,
# `·•‧∙・`、换行、` - ` 逐个加进分隔符,与 OBF 一致率全降。改成切完接回去:
# 后一段 `2-` 开头 + 前一段结尾数字串 ≤2 位 = 同一个名字;`CI 17200, 12-Hydroxystearic` 不误接(17200 是 5 位)。
# 与 apps/web/src/lib/decoder.ts joinLocants() 同一套口径,改一处要同步另一处。
_LOCANT_HEAD = re.compile(r"^\d{1,2}\s*[-–－]")
_LOCANT_TAIL = re.compile(r"(?:^|\D)\d{1,2}$")


def join_locants(parts):
    out = []
    for p in parts:
        if out and _LOCANT_HEAD.match(p) and _LOCANT_TAIL.search(out[-1]):
            out[-1] = out[-1] + "," + p
        else:
            out.append(p)
    return out


def split_inci(s):
    return join_locants([x for x in (re.sub(r"\s+", " ", PAREN.sub(" ", p)).strip() for p in re.split(r"[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))", s or "")) if x])
# 09-22 P 线查出的口径漂移:这里少了脏字符那一段,`Limonene†` 出 `LIMONENE†`,
# 与 _pd1.fact_key / decoder.ts factKey 对不上,`market_product_inci` 就挂不到 `ingredient_facts`。
# 脏字符表与 _pd1.py `_DIRTY` 逐字一致(* „ † ‡ + \ 孤括号 与不可见字符)。
# 09-22 U 线实测：不可见字符要**删除**，不能换成空格 —— `Potassium Jo­jobate`（软连字符 U+00AD）
# 被换成空格后裂成 `JO JOBATE`，又是一个碎键。可见脏字符换空格才对，它们本来就在分隔位置上。
# 顺序：先删不可见，再把可见的换空格。
_INVIS = re.compile(r"[\u2060\u00ad\ufeff\u200b\u200c\u200d\ufffc]")
_DIRTY = re.compile(r"[*„†‡+\()\[\]{}]")


def fact_key(name):
    s = _DIRTY.sub(" ", _INVIS.sub("", PAREN.sub(" ", name).upper()))
    s = re.sub(r"^[\s.]+|[\s.]+$", "", re.sub(r"\s+", " ", s))
    return re.sub(r"(\d)\s*,\s*(?=\d)", r",", s)  # 09-22:位号逗号两侧压掉空白,`1, 2-HEXANEDIOL` 与既有 `1,2-HEXANEDIOL` 才是同一个键(与 decoder.ts factKey 同步)

def paged(sql, size=150):   # d1() 大结果静默 [],必须 ORDER BY rowid 分页(记忆:查询先量行数)
    out, off = [], 0
    while True:
        part = d1(f"{sql} ORDER BY rowid LIMIT {size} OFFSET {off}")
        out += part; off += size
        if len(part) < size: return out

q = lambda s: "'" + str(s).replace("'", "''") + "'"

def main():
    have = {r["product_id"] for r in paged("SELECT DISTINCT product_id FROM market_product_inci", 2000)} if ONLY_MISSING else set()
    prods = paged("SELECT id, inci FROM market_products WHERE length(inci) > 30")
    rows = []
    for p in prods:
        if p["id"] in have: continue
        seen = set()   # 同款重复键只留首次:PK(product_id, seq) 不会冲突,但共现统计要去重
        for seq, name in enumerate(split_inci(p["inci"]), 1):
            k = fact_key(name)
            if not k or k in seen: continue
            seen.add(k); rows.append((p["id"], seq, k))
    print(f"products {len(prods)} skip {len(have)} rows {len(rows)}")
    for i in range(0, len(rows), 400):
        path = os.path.join(ROOT, "tools", f"_mpi_{i // 400}.sql")
        with io.open(path, "w", encoding="utf-8") as f:
            f.write("INSERT OR IGNORE INTO market_product_inci(product_id, seq, inci_key) VALUES " +
                    ",".join(f"({pid},{seq},{q(k)})" for pid, seq, k in rows[i:i + 400]) + ";\n")
        d1_exec(path); os.remove(path)
        if (i // 400) % 25 == 0: print(f"  {i + 400}/{len(rows)}", flush=True)   # 心跳(记忆:长任务不许静默)
    print("COUNT", d1("SELECT COUNT(*) AS n FROM market_product_inci"))
    print("DISTINCT inci_key", d1("SELECT COUNT(DISTINCT inci_key) AS n FROM market_product_inci"))
    print("top10", d1("SELECT inci_key, COUNT(*) AS n FROM market_product_inci GROUP BY inci_key ORDER BY n DESC LIMIT 10"))

if __name__ == "__main__":
    # 自检:与 decoder.ts 同口径
    # 注意:decoder.ts 的 (?<!\d) 让「PEG-8, 1,2-Hexanediol」不在 8 后切,这是线上口径,照搬不修
    assert split_inci("Water (Aqua), Glycerin;Cetyl Alcohol, 1,2-Hexanediol、Niacinamide.") == ["Water", "Glycerin", "Cetyl Alcohol", "1,2-Hexanediol", "Niacinamide."]
    assert fact_key("Niacinamide.") == "NIACINAMIDE" and fact_key("Water/Aqua/Eau") == "WATER/AQUA/EAU" and fact_key("Sodium  Hyaluronate (1%)") == "SODIUM HYALURONATE"
    main()
