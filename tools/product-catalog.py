#!/usr/bin/env python3
"""《帛卉产品册 双语版 v8》→ 产品库。

由来(2026-09-09):产品库只有 10 条,而创始人给的 2026 巴西参展产品册里有 70 款,
中英双语、每款带核心成分与卖点。这是工厂自己的资料,是「老板的规划」那条线上
最硬的一块素材 —— 比我自己编的任何东西都真。

产品册结构很规整,每一款都是这个块:
    {子类中文} {子类English}
    {中文名}            ← 可能跨行
    {英文名}            ← 可能跨行
    核心成分 Key Ingredients
    {成分中文} / {成分英文}
    卖点 Selling Points
    {卖点中文} / {卖点英文}

跨行是按框宽硬断的(「100m」+「l」、「Soothin」+「g 2-in-1」),
所以拼接时**不能补空格** —— 该有的空格 PDF 已经留在行尾了。

三条纪律:
  1. **广告法先过一遍**。产品册是给展会业务员看的,里面有「市场唯一」「7天美白对比」
     这类话。展台上口头说和印在官网上是两件事 ——《广告法》第九条禁绝对化用语,
     功效宣称要有评价依据。命中的一律先落 draft,并把原话标出来给创始人定,
     我不替他改宣称,也不替他删。
  2. **不翻译**。册子给了中英双语,就写这两种;其余 16 语种留空走回退,
     不拿机器翻译冒充人工文案。
  3. **解析质量要量化**。册子封面写了 70 款,解析不到 70 就是漏了,报出来。

用法:
    python tools/product-catalog.py           解析并打印质量报告
    python tools/product-catalog.py --apply   写入 D1
"""
import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = r"F:\0cosmetic\官网素材\帛卉产品册_双语版_v8.pdf"
TXT = os.path.join(HERE, "_catalog-v8.txt")
SRC = "帛卉产品册 双语版 v8 · Product Catalog 2026(巴西参展专用资料)"

CJK = re.compile(r"[㐀-鿿\u3000-\u303f\uff00-\uffef]")
HEAD_ING = "核心成分 Key Ingredients"
HEAD_SELL = "卖点 Selling Points"
# 子类行:中文 + 空格 + 英文,整行很短
# 英文子类里有 & 和逗号(「舒缓修护 Soothing & Repair」)。
# 漏掉 & 的后果不是少一款:那一行不被认成子类,它底下的成分与卖点
# 会被上一款吞进去 —— 少一条,还脏一条。
SUBCAT = re.compile(r"^([㐀-鿿/·]{2,10})\s+([A-Za-z][A-Za-z\-/&, ]{1,28})$")
SERIES = re.compile(r"^([㐀-鿿]{2,8}系列)\s+([A-Za-z][A-Za-z ]{1,20})$")

# 子类 → 产品库品类。产品库现有取值是 skincare / hair 这种。
CAT = {
    "防晒": "suncare", "美白提亮": "skincare", "抗衰紧致": "skincare", "再生修护": "skincare",
    "祛痘": "skincare", "补水保湿": "skincare", "舒缓修护": "skincare", "清洁": "cleansing",
    "身体护理": "body", "脱毛护理": "body", "头皮护理": "haircare", "护发": "haircare",
    "漱口水": "oral", "牙膏": "oral", "口喷": "oral", "牙贴": "oral", "洁牙": "oral",
    "口腔护理": "oral", "儿童": "kids", "彩妆": "makeup",
}

# 广告法与功效宣称的雷区。命中不改字,只标记 + 落 draft。
RISKY = [
    ("绝对化用语", ["市场唯一", "唯一", "第一", "最佳", "最好", "顶级", "国家级", "全球首"]),
    ("功效数据需评价依据", ["天美白", "天身体美白", "量化抗皱", "实测数据", "对比", "量化", "小时修护"]),
    ("医疗用语", ["修复受损", "治疗", "药用", "抗菌消炎", "杀菌"]),
    # 出口准入的硬门槛,不是文案问题:
    # 过氧化氢牙贴在欧盟按 2011/84/EU 只能经牙医供应,>0.1% 不得直接零售给消费者;
    # 含氟牙膏在美国属 OTC 专论药品,要走药品路径而不是化妆品路径。
    # 这两条不标出来,客户下单后报关才发现,责任在我们。
    ("境外准入受限", ["过氧化氢", "氟化钠", "单氟磷酸钠", "含氟"]),
]


def load_text() -> str:
    if not os.path.exists(TXT):
        import pypdf
        r = pypdf.PdfReader(PDF)
        io.open(TXT, "w", encoding="utf-8", newline="\n").write(
            "\n\n===PAGE===\n\n".join((p.extract_text() or "") for p in r.pages))
    return io.open(TXT, encoding="utf-8").read()


def split_zh_en(lines: list) -> tuple:
    """一段里前面是中文、后面是英文。分界 = 第一行完全不含中日韩字符。

    分界之前要先补断行:册子按框宽硬断,「…100m」下一行只剩一个「l」。
    那个「l」不含汉字,直接拿去当分界的话,中文名少个单位、英文名多个字母,
    结果是「…100m」和「lCooling Anti-Itch…」——两边都错。
    所以三个字符以内的碎行先并回上一行。
    """
    merged = []
    for ln in lines:
        t = ln.strip()
        if merged and 0 < len(t) <= 3 and not CJK.search(t):
            merged[-1] = merged[-1] + ln
        else:
            merged.append(ln)
    lines = merged
    k = len(lines)
    for i, ln in enumerate(lines):
        if ln.strip() and not CJK.search(ln):
            k = i
            break
    return "".join(lines[:k]).strip(), "".join(lines[k:]).strip()


def parse(txt: str) -> list:
    lines = [ln.rstrip("\n") for ln in txt.split("\n")]
    out, series = [], ""
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        m = SERIES.match(ln)
        if m:
            series = m.group(1)
            i += 1
            continue
        m = SUBCAT.match(ln)
        if not m or ln in (HEAD_ING, HEAD_SELL):
            i += 1
            continue

        sub_zh, sub_en = m.group(1), m.group(2).strip()
        # 名字段:到「核心成分」为止
        j = i + 1
        name_lines = []
        while j < len(lines) and lines[j].strip() != HEAD_ING:
            if lines[j].strip() == "===PAGE===" or SERIES.match(lines[j].strip()):
                break
            name_lines.append(lines[j])
            j += 1
        if j >= len(lines) or lines[j].strip() != HEAD_ING:
            i += 1
            continue

        j += 1
        ing_lines = []
        while j < len(lines) and lines[j].strip() != HEAD_SELL:
            ing_lines.append(lines[j])
            j += 1
        j += 1
        sell_lines = []
        while j < len(lines):
            s = lines[j].strip()
            if s == "===PAGE===" or SUBCAT.match(s) or SERIES.match(s):
                break
            sell_lines.append(lines[j])
            j += 1

        name_zh, name_en = split_zh_en(name_lines)
        ing_zh, ing_en = split_zh_en(ing_lines)
        sell_zh, sell_en = split_zh_en(sell_lines)
        if name_zh and name_en:
            out.append({
                "series": series, "sub_zh": sub_zh, "sub_en": sub_en,
                "name_zh": name_zh, "name_en": name_en,
                "ing_zh": ing_zh, "ing_en": ing_en,
                "sell_zh": sell_zh, "sell_en": sell_en,
            })
        i = j
    return out


def slugify(en: str, used: set) -> str:
    s = re.sub(r"\([^)]*\)", " ", en.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = "-".join(s.split("-")[:6])[:60].strip("-") or "product"
    base, n = s, 2
    while s in used:
        s = f"{base}-{n}"
        n += 1
    used.add(s)
    return s


def flag(p: dict) -> list:
    hay = f"{p['name_zh']} {p['sell_zh']}"
    hits = []
    for kind, words in RISKY:
        w = [x for x in words if x in hay]
        if w:
            hits.append(f"{kind}:{'、'.join(sorted(set(w)))}")
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    rows = parse(load_text())
    # 只把「不是这本册子来的」当作已占用。否则重跑一次,
    # 册子上次自己写进去的 slug 会被当成别人的,每款都加 -2 后缀变成新品。
    used = {r["slug"] for r in d1(
        "SELECT slug FROM products WHERE site_id='biosphere-ai' "
        "AND (internal_note IS NULL OR internal_note NOT LIKE '帛卉产品册%')")}
    cats, risky = {}, 0
    for p in rows:
        p["slug"] = slugify(p["name_en"], used)
        p["category"] = CAT.get(p["sub_zh"], "skincare")
        p["flags"] = flag(p)
        cats[p["category"]] = cats.get(p["category"], 0) + 1
        risky += 1 if p["flags"] else 0

    print(f"解析 {len(rows)} 款(册子封面写 70 款)")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {k:<10}{v:>4}")
    print(f"  宣称需创始人过目 {risky} 款 · 可直接上架 {len(rows) - risky} 款")
    short = [p for p in rows if len(p["name_zh"]) < 4 or len(p["name_en"]) < 8]
    if short:
        print(f"  名字过短(可能解析串行){len(short)} 款:{[p['name_zh'][:12] for p in short[:5]]}")
    for p in rows[:3]:
        print(f"    {p['category']:<9} {p['name_zh'][:26]:<26} | {p['name_en'][:44]}")
        if p["flags"]:
            print(f"              ⚠ {' / '.join(p['flags'])}")

    io.open(os.path.join(HERE, "_catalog-v8.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(rows, ensure_ascii=False))
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    if len(rows) < 60:
        print("解析数明显少于册子上的 70 款,不写库 —— 先修解析。")
        sys.exit(1)

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_product-catalog.sql")
    base = (d1("SELECT MAX(id) m FROM products")[0]["m"] or 0)
    base = int(base) + 1
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        # products 上原本没有 slug 的唯一约束,ON CONFLICT(slug) 直接报
        # 「does not match any PRIMARY KEY or UNIQUE constraint」。补一个 ——
        # 同一个站里 slug 本来就该唯一,不然 /products/{slug} 该开哪一条?
        fh.write("CREATE UNIQUE INDEX IF NOT EXISTS ux_products_site_slug "
                 "ON products(site_id, slug);\n")
        for k, p in enumerate(rows):
            pid = base + k
            note = SRC + ("|宣称待复核:" + " / ".join(p["flags"]) if p["flags"] else "")
            status = "draft" if p["flags"] else "published"
            fh.write(
                f"INSERT INTO products (id, site_id, slug, category, moq, is_featured, sort_order, "
                f"status, updated_at, internal_note) VALUES ({pid}, 'biosphere-ai', {q(p['slug'])}, "
                f"{q(p['category'])}, '柔性起订量 · 按品类与包材议', 0, {2000 + k * 10}, "
                f"{q(status)}, datetime('now'), {q(note)}) "
                f"ON CONFLICT(site_id, slug) DO UPDATE SET category=excluded.category, "
                f"status=excluded.status, internal_note=excluded.internal_note, "
                f"updated_at=datetime('now');\n")
            for lang, name, ing, sell, sub in (
                    ("zh-cn", p["name_zh"], p["ing_zh"], p["sell_zh"], p["sub_zh"]),
                    ("en", p["name_en"], p["ing_en"], p["sell_en"], p["sub_en"])):
                summary = (f"核心成分:{ing}。" if lang == "zh-cn" else f"Key ingredients: {ing}.")
                desc = (f"品类:{sub}。\n卖点(出自{SRC}):{sell}" if lang == "zh-cn"
                        else f"Category: {sub}.\nSelling points (from the 2026 product catalogue): {sell}")
                hl = json.dumps([x for x in re.split(r"[;;]", sell) if x.strip()], ensure_ascii=False)
                fh.write(
                    f"INSERT INTO product_i18n (product_id, lang, name, summary, description, "
                    f"specs_json, highlights_json, mt) VALUES ((SELECT id FROM products WHERE "
                    f"slug={q(p['slug'])} AND site_id='biosphere-ai'), {q(lang)}, {q(name)}, "
                    f"{q(summary)}, {q(desc)}, '[]', {q(hl)}, 0) "
                    f"ON CONFLICT(product_id, lang) DO UPDATE SET name=excluded.name, "
                    f"summary=excluded.summary, description=excluded.description, "
                    f"highlights_json=excluded.highlights_json;\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    n = d1("SELECT status, COUNT(*) n FROM products WHERE site_id='biosphere-ai' GROUP BY status")
    print("完成:", {x["status"]: x["n"] for x in n})


if __name__ == "__main__":
    main()
