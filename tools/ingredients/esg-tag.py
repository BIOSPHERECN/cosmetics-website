"""给 ingredient_facts.tags 追加 ESG 标签(2026-09-18 ESG 全绿任务 R③;规则表 esg_rules 的 tag 类规则靠这些标签命中)。

新标签:microplastic-suspect / cyclic-silicone / pfas / edta / reef-unsafe / fossil-derived / palm-derived / ethoxylated / formaldehyde-releaser / mica。
按正则匹配 inci_key,JSON 数组去重追加(已有标签保留);分页 ORDER BY rowid 读(d1 大结果静默 []),UPDATE 写 SQL 文件走 d1_exec,幂等。
用法:python tools/ingredients/esg-tag.py [--dry]
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _bohui import d1, d1_exec, _q

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALM = {"CETEARYL ALCOHOL", "CETYL ALCOHOL", "STEARYL ALCOHOL", "GLYCERYL STEARATE", "GLYCERYL STEARATE SE", "STEARIC ACID", "PALMITIC ACID", "MYRISTIC ACID", "LAURIC ACID",
        "SODIUM LAURYL SULFATE", "SODIUM LAURETH SULFATE", "CAPRYLIC/CAPRIC TRIGLYCERIDE", "COCAMIDOPROPYL BETAINE", "SODIUM COCOYL ISETHIONATE", "SODIUM LAUROYL SARCOSINATE",
        "SODIUM COCOYL GLUTAMATE", "DECYL GLUCOSIDE", "COCO-GLUCOSIDE", "LAURYL GLUCOSIDE", "CETEARYL GLUCOSIDE", "ETHYLHEXYL PALMITATE", "ISOPROPYL PALMITATE", "ISOPROPYL MYRISTATE",
        "SORBITAN STEARATE", "SORBITAN OLIVATE", "SODIUM STEARATE", "MAGNESIUM STEARATE", "ZINC STEARATE", "GLYCERYL CAPRYLATE", "ELAEIS GUINEENSIS OIL", "ELAEIS GUINEENSIS KERNEL OIL"}
# 与 tools/esg/rules-seed.py 的 key/regex 同源;甘油刻意不进 palm(每个配方都有,进了永远不绿)
RULES = [
    ("microplastic-suspect", r"^(POLYETHYLENE|POLYPROPYLENE|POLYSTYRENE|NYLON-\d+|POLYMETHYL METHACRYLATE|POLYETHYLENE TEREPHTHALATE|POLYBUTYLENE TEREPHTHALATE|ETHYLENE/ACRYLIC ACID COPOLYMER|POLYURETHANE-\d+|POLYMETHYLSILSESQUIOXANE|ACRYLATES COPOLYMER|STYRENE/ACRYLATES COPOLYMER|ACRYLATES/[A-Z0-9 ,-]+ (COPOLYMER|CROSSPOLYMER)|POLYACRYLATE-\d+|POLYVINYL ACETATE)$"),
    ("cyclic-silicone", r"^(CYCLOPENTASILOXANE|CYCLOTETRASILOXANE|CYCLOHEXASILOXANE|CYCLOMETHICONE)$"),
    ("pfas", r"PERFLUORO|POLYFLUORO|FLUOROALCOHOL|\bPTFE\b|POLYTETRAFLUOROETHYLENE|C\d+-\d+ FLUORO|FLUOROTELOMER"),
    ("edta", r"\bEDTA\b|ETHYLENEDIAMINETETRAACETIC"),
    ("reef-unsafe", r"^(BENZOPHENONE-3|OXYBENZONE|ETHYLHEXYL METHOXYCINNAMATE|OCTINOXATE|OCTOCRYLENE|4-METHYLBENZYLIDENE CAMPHOR)$"),
    ("fossil-derived", r"^(PETROLATUM|MINERAL OIL|PARAFFINUM LIQUIDUM|PARAFFIN|MICROCRYSTALLINE WAX|CERA MICROCRISTALLINA|OZOKERITE|CERESIN)$|ISOPARAFFIN"),
    ("ethoxylated", r"^PEG-\d|\bPEG\b|^PPG-\d|ETH-\d|POLYSORBATE|LAURETH|CETEARETH|STEARETH|OLETH|CETETH|TRIDECETH|PARETH|POLOXAMER"),
    ("formaldehyde-releaser", r"DMDM HYDANTOIN|IMIDAZOLIDINYL UREA|DIAZOLIDINYL UREA|QUATERNIUM-15|BRONOPOL|2-BROMO-2-NITROPROPANE|SODIUM HYDROXYMETHYLGLYCINATE"),
    ("mica", r"^(MICA|CI 77019)$"),
]
def tags_for(key):
    t = [tag for tag, rx in RULES if re.search(rx, key)]
    if key in PALM: t.append("palm-derived")
    return t

def paged(sql, size=1500):   # d1() 大结果静默返回 [],必须按 rowid 分页
    out, off = [], 0
    while True:
        part = d1(f"{sql} ORDER BY rowid LIMIT {size} OFFSET {off}")
        out += part; off += size
        if len(part) < size: return out

def main():
    rows = paged("SELECT inci_key, tags FROM ingredient_facts")
    hits, ups = {}, []
    for r in rows:
        try: old = json.loads(r["tags"] or "[]")
        except Exception: old = []
        add = tags_for(r["inci_key"])
        for t in add: hits[t] = hits.get(t, 0) + 1
        new = sorted(set(old) | set(add))
        if new != sorted(set(old)):
            ups.append(f"UPDATE ingredient_facts SET tags={_q(json.dumps(new, ensure_ascii=False))} WHERE inci_key={_q(r['inci_key'])};")
    print(f"读 {len(rows)} 行,需更新 {len(ups)} 行;标签命中:{json.dumps(hits, ensure_ascii=False)}")
    if "--dry" in sys.argv: return
    written = 0
    for i in range(0, len(ups), 400):   # 400 条一文件,同 facts-build 的分文件习惯
        path = os.path.join(ROOT, f"_esg_tag_{i // 400}.sql")
        with open(path, "w", encoding="utf-8") as f: f.write("\n".join(ups[i:i + 400]) + "\n")
        written += d1_exec(path)
    print("rows_written", written)

if __name__ == "__main__":
    assert tags_for("PEG-100 STEARATE") == ["ethoxylated"] and tags_for("DISODIUM EDTA") == ["edta"] and "palm-derived" in tags_for("STEARIC ACID") and tags_for("GLYCERIN") == []
    main()
