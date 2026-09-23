#!/usr/bin/env python3
"""原料溯源页加厚 —— 把原料库里已有的专业内容摆到页面上。

由来(2026-09-09 23:2x,创始人看 /zh-cn/origin/rose/ 后:
「你这也太简单了!要更详细的说明这些植物各方面的资料,以及化妆品具体用的场景,
你这简单到虚无的很啊」「要专业」)。

他说得对。页面上只有五行档案,而 `ingredients` 表里每一味都躺着这些东西:
作用机理、公开常见添加量、适用剂型、pH 区间、配伍禁忌、稳定性、工厂投料要点、
四大市场法规口径、清真素食、CAS、别名、依据强度 —— 一个字都没往页面上放。

再加上今天新入库的两样:
  · `inci_catalog` 的国家目录序号与**最高历史使用量**(淋洗类/驻留类),
    按 2021 年第 62 号公告说明八可作为简化版安全评估报告的证据类型
  · `formulas` 里**实际用到这一味的在册配方**,按 INCI 反查,给出编码与剂型 ——
    这就是创始人要的「化妆品具体用的场景」:不是形容词,是我们真做过的配方

版块顺序按采购的问题顺序排,不按数据表的顺序排:
  1 hero          这是什么、产地在哪
  2 matrix        原料档案(学名/产区/部位/INCI/CAS/成本档/依据强度)
  3 prose(应用)  怎么用:适用剂型、常见添加量、pH 区间
  4 procgrid      在册配方里谁在用(可点进配方详情)
  5 prose(机理)  作用机理
  6 matrix(工艺) 配伍禁忌 / 稳定性 / 工厂投料要点
  7 matrix(法规) 国家目录 + 最高历史使用量 + 四大市场口径
  8 statement     这一味的关键
  9 inquiry       要检测报告

一条纪律:**只搬,不编**。表里没有的字段,那一段就不出现。
产区、机理、禁忌、投料这些都是原料库里逐条审过的内容,不是这里现生成的。

用法:
    python tools/origin-depth.py            体检
    python tools/origin-depth.py --apply    写库
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
SITE = "biosphere-ai"
FMT_ZH = {
    "serum": "精华液", "essence": "精华水", "toner": "化妆水", "lotion": "乳液",
    "cream": "面霜", "gel": "凝胶", "oil": "护肤油", "balm": "膏霜",
    "mask": "面膜", "sheet-mask": "片状面膜", "foam": "洁面", "cleansing-gel": "洁面啫喱",
    "body-lotion": "身体乳", "shampoo": "洗发水", "toothpaste": "牙膏",
    "sun-lotion": "防晒乳", "eye-cream": "眼霜", "mist": "喷雾", "stick": "棒状",
}


def inci_key(x: str) -> str:
    x = re.sub(r"[（(][^）)]*[）)]", " ", (x or "").upper())
    return re.sub(r"[^A-Z0-9]+", " ", x).strip()


def load():
    pages = d1(f"SELECT id, slug FROM pages WHERE site_id='{SITE}' AND slug LIKE 'origin/%'")
    ing = d1("SELECT * FROM ingredients WHERE status='published'")
    cat = {r["inci_key"]: r for r in d1(
        "SELECT inci_key, no, name_zh, max_rinse, max_leave, note FROM inci_catalog WHERE inci_key IS NOT NULL")}
    fml = d1("SELECT code, category, format, benefits, actives_json FROM formulas "
             "WHERE status IN ('active','sample')")
    return pages, ing, cat, fml


def match(pages, ing):
    """页面 slug ↔ 原料 slug。页面用俗名短名(origin/rose),原料用拉丁名。"""
    ALIAS = {
        "aloe": "aloe-barbadensis-leaf-juice", "mugwort": "artemisia-princeps-leaf-extract",
        "green-tea": "camellia-sinensis-leaf-extract", "centella": "centella-asiatica-extract",
        "licorice": "glycyrrhiza-glabra-root-extract", "houttuynia": "houttuynia-cordata-extract",
        "honeysuckle": "lonicera-japonica-flower-extract", "goji": "lycium-barbarum-fruit-extract",
        "ginseng": "panax-ginseng-root-extract", "notoginseng": "panax-notoginseng-root-extract",
        "patchouli": "pogostemon-cablin-oil", "rose": "rosa-damascena-flower-oil",
        "scutellaria": "scutellaria-baicalensis-root-extract",
    }
    by_slug = {r["slug"]: r for r in ing}
    out = []
    for p in pages:
        short = p["slug"].split("/", 1)[1]
        g = by_slug.get(ALIAS.get(short, ""))
        if not g:
            g = next((r for r in ing if r["slug"].startswith(short)), None)
        if g:
            out.append((p, g))
    return out


def formulas_using(g, fml):
    key = inci_key(g["inci"])
    hit = []
    for f in fml:
        try:
            acts = json.loads(f["actives_json"] or "[]")
        except Exception:
            continue
        if any(inci_key(a.get("inci", "")) == key for a in acts):
            hit.append(f)
    return hit


def blocks(g, cat, uses):
    """返回 [(type, sort, {zh}, {en})]。英文只给能可靠给的部分,不machine翻译中文长文。"""
    fmts = [x.strip() for x in (g["formats"] or "").split(",") if x.strip()]
    fmt_zh = "、".join(FMT_ZH.get(x, x) for x in fmts)
    c = cat.get(inci_key(g["inci"]))
    out = []

    # ── 怎么用
    app = []
    if fmt_zh:
        app.append(f"适用剂型:{fmt_zh}。")
    if g["use_level"]:
        app.append(f"公开配方学常见添加区间:{g['use_level']}")
    if g["ph_range"]:
        app.append(f"体系 pH 区间:{g['ph_range']}。")
    if g["halal_vegan"]:
        app.append(f"清真与素食:{g['halal_vegan']}")
    if app:
        out.append(("prose", 32,
                    {"paragraphs": ["以下为配方应用口径,来自公开配方学与工厂经验整理,不构成法规限值。"] + app},
                    {"paragraphs": ["Formulation notes from public formulation practice and factory experience. "
                                    "Not regulatory limits."]}))

    # ── 在册配方里谁在用
    if uses:
        items = [{"image": "", "label": f["code"],
                  "note": f"{FMT_ZH.get(f['format'], f['format'])} · {(f['benefits'] or '').replace(',', ' / ')}",
                  "href": f"/zh-cn/formula/{f['code']}/"} for f in uses[:12]]
        items_en = [{"image": "", "label": f["code"],
                     "note": f"{f['format']} · {(f['benefits'] or '').replace(',', ' / ')}",
                     "href": f"/en/formula/{f['code']}/"} for f in uses[:12]]
        out.append(("procgrid", 34,
                    {"eyebrow": "用在哪里", "cols": 6,
                     "title": f"在册配方里有 {len(uses)} 支用到这一味",
                     "intro": "点进任一支看完整工艺规格:pH、黏度、灌装温度、防腐体系、打样与大货周期。",
                     "items": items},
                    {"eyebrow": "Where it is used", "cols": 6,
                     "title": f"{len(uses)} formulas on file use this material",
                     "intro": "Open any one for the full process window.", "items": items_en}))

    # ── 作用机理
    if g["mechanism_zh"]:
        out.append(("prose", 36,
                    {"paragraphs": ["作用机理"] + [x + "。" for x in g["mechanism_zh"].split("。") if x.strip()]},
                    {"paragraphs": ["Mechanism — see the Chinese entry; not machine-translated."]}))

    # ── 配方与工艺注意
    rows = []
    if g["incompatible"]:
        rows.append({"title": "配伍禁忌与翻车点", "desc": g["incompatible"]})
    if g["stability"]:
        rows.append({"title": "稳定性", "desc": g["stability"]})
    if g["factory_note"]:
        rows.append({"title": "工厂投料要点", "desc": g["factory_note"]})
    if rows:
        out.append(("matrix", 38,
                    {"title": "配方与工艺注意", "intro": "这三件是打样阶段真正会踩的坑,写在明处。", "items": rows},
                    {"title": "Formulation and process notes",
                     "intro": "The three things that actually go wrong at sampling stage.",
                     "items": [{"title": r["title"], "desc": r["desc"]} for r in rows]}))

    # ── 法规
    reg = []
    if c:
        reg.append({"title": "中国已使用化妆品原料目录",
                    "desc": f"目录序号 {c['no']} · 标准中文名称「{c['name_zh']}」"
                            f"(国家药监局 2021 年第 62 号公告附件)"})
        if c["max_rinse"] or c["max_leave"]:
            v = []
            if c["max_rinse"]:
                v.append(f"淋洗类 {c['max_rinse']}%")
            if c["max_leave"]:
                v.append(f"驻留类 {c['max_leave']}%")
            reg.append({"title": "最高历史使用量",
                        "desc": " · ".join(v) + "。按公告说明八,可作为《化妆品安全评估报告(简化版)》"
                                               "的证据类型;这是历史收录值,不是法规限值。"})
    for k, t in (("market_cn", "中国"), ("market_eu", "欧盟"),
                 ("market_us", "美国"), ("market_apac", "亚太")):
        if g[k]:
            reg.append({"title": t, "desc": g[k]})
    if reg:
        out.append(("matrix", 40,
                    {"title": "法规与市场准入",
                     "intro": "以最新官方文本为准,由品牌方与其责任人复核。", "items": reg},
                    {"title": "Regulatory status",
                     "intro": "The latest official text prevails.",
                     "items": [{"title": r["title"], "desc": r["desc"]} for r in reg]}))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    pages, ing, cat, fml = load()
    pairs = match(pages, ing)
    print(f"基地/溯源页 {len(pages)} 个 · 能对上原料库的 {len(pairs)} 个")

    plan, stat = [], {"应用": 0, "配方": 0, "机理": 0, "工艺": 0, "法规": 0}
    for p, g in pairs:
        uses = formulas_using(g, fml)
        bs = blocks(g, cat, uses)
        plan.append((p, g, bs))
        for t, o, _z, _e in bs:
            if o == 32: stat["应用"] += 1
            elif o == 34: stat["配方"] += 1
            elif o == 36: stat["机理"] += 1
            elif o == 38: stat["工艺"] += 1
            elif o == 40: stat["法规"] += 1
    print("  会加上的版块:", " · ".join(f"{k} {v}" for k, v in stat.items()))
    tot = sum(len(b) for _p, _g, b in plan)
    print(f"  合计新增版块 {tot} 个")
    if plan:
        p0, g0, b0 = plan[0]
        print(f"  例:{p0['slug']} ← {g0['name_zh']} · {len(b0)} 块")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    bid = int(d1("SELECT MAX(id) m FROM blocks")[0]["m"]) + 1
    sql = os.path.join(HERE, "_origin-depth.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for p, _g, bs in plan:
            # 先清掉上一轮加厚生成的块(sort_order 32/34/36/38/40),再重建,避免重复堆叠
            fh.write(f"DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks "
                     f"WHERE page_id={p['id']} AND sort_order IN (32,34,36,38,40));\n")
            fh.write(f"DELETE FROM blocks WHERE page_id={p['id']} AND sort_order IN (32,34,36,38,40);\n")
            for typ, order, zh, en in bs:
                fh.write(f"INSERT INTO blocks (id, page_id, type, sort_order, is_visible, config_json, "
                         f"updated_at) VALUES ({bid}, {p['id']}, {q(typ)}, {order}, 1, '{{}}', "
                         f"datetime('now'));\n")
                for lang, data in (("zh-cn", zh), ("en", en)):
                    fh.write(f"INSERT INTO block_i18n (block_id, lang, data_json) VALUES "
                             f"({bid}, {q(lang)}, {q(json.dumps(data, ensure_ascii=False))});\n")
                bid += 1
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()
