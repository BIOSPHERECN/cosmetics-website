#!/usr/bin/env python3
"""扩充「原料溯源」档案页 —— 从五味补到十三味。

创始人 2026-09-08:「我看基地依然还是那几个,没新增啊」。
`/zh-cn/origin/` 上「核心原料溯源档案」一直是 5 味(人参/玫瑰/绿茶/芦荟/积雪草),
而公司资料写的是「合作山地种植基地 20 余家」。数字对不上,页面就显得空。

**这些草本不是编的**:八味全部取自我们自己的原料库(`ingredients` 表,94 条),
学名、INCI、功效方向直接来自库里已经在线的那份数据。
产区写的是**公开可查的道地产区**(与已有五味同一口径),
不是「帛卉在那里有基地」—— 页面上那句「帛卉自有基地的亩数与证书编号由运营在后台补充」原样保留。

**照片没有,就不放照片**:这八味我们手上没有实拍。
ProcGrid 已改成图位可空(渲染字母牌),不拿图库照片冒充基地实拍。
拿到实拍之后,把 media id 填进 IMAGES 再跑一次即可。

用法:
  python tools/origin-herbs.py            出 SQL,不写库
  python tools/origin-herbs.py --exec     出 SQL 并灌库
"""
import io
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, d1, d1_exec, preflight   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SITE = "biosphere-ai"
PARENT = 96                 # /origin/
GRID_BLOCK = 310            # 「五味核心原料」那个 procgrid
STATS_BLOCK = 423           # 顶部四个数字
OUT = os.path.join(ROOT, "db", "migrations", "0057_origin_herbs.sql")

# 已有五味 —— 只补 href(卡片一直不可点,而导语写着「点进任意一味」)
EXISTING = [
    ("人参 Panax ginseng", "ginseng"),
    ("玫瑰 Rosa rugosa / Rosa damascena", "rose"),
    ("绿茶 Camellia sinensis", "green-tea"),
    ("芦荟 Aloe barbadensis", "aloe"),
    ("积雪草 Centella asiatica", "centella"),
]

# 拿到实拍后填 media id,再跑一次脚本即可换上
IMAGES: dict[str, str] = {}

HERBS = [
    {
        "slug": "licorice", "zh": "甘草", "sci": "Glycyrrhiza glabra / Glycyrrhiza uralensis",
        "inci": "Glycyrrhiza Glabra Root Extract",
        "region": "中国新疆 · 内蒙古", "part": "根与根茎",
        "actives": "甘草酸、甘草苷;光果甘草另含光甘草定(Glabridin)",
        "use": "舒缓、亮肤方向;水醇提取,常与烟酰胺、维 C 衍生物配伍。",
        "key": "「甘草」在配方里指两个物种:光果甘草(G. glabra)与乌拉尔甘草(G. uralensis)。"
               "光甘草定主要来自前者 —— 做亮肤方向要先认清是哪一种,写错物种等于宣称落空。",
    },
    {
        "slug": "goji", "zh": "枸杞", "sci": "Lycium barbarum",
        "inci": "Lycium Barbarum Fruit Extract",
        "region": "中国宁夏中宁 · 新疆精河", "part": "成熟果实",
        "actives": "枸杞多糖(LBP)、玉米黄质双棕榈酸酯、甜菜碱",
        "use": "抗氧化与保湿方向;多糖组分对屏障类配方友好。",
        "key": "枸杞的活性主力是多糖,而多糖怕高温久提 —— 提取温度与时长直接决定这一味"
               "是活性物还是甜味剂。低温萃取那一段不是噱头。",
    },
    {
        "slug": "houttuynia", "zh": "鱼腥草", "sci": "Houttuynia cordata",
        "inci": "Houttuynia Cordata Extract",
        "region": "中国四川 · 贵州", "part": "全草",
        "actives": "癸酰乙醛(鱼腥草素)、槲皮苷、绿原酸",
        "use": "舒缓与控油方向;油皮、痘肌类配方常用。",
        "key": "鱼腥草的特征气味来自癸酰乙醛,而它正是活性所在 —— 脱味脱得太干净,"
               "活性也一起走了。做香型时这一味要单独谈。",
    },
    {
        "slug": "patchouli", "zh": "广藿香", "sci": "Pogostemon cablin",
        "inci": "Pogostemon Cablin Oil",
        "region": "中国广东肇庆 · 湛江(道地「广藿香」)", "part": "地上部分(叶与茎)",
        "actives": "广藿香醇(Patchoulol)、α-布藜烯等倍半萜",
        "use": "调理与香氛方向;精油入料,常作定香。",
        "key": "「广」字就是产区:广东是广藿香的道地产区,离广州基地最近的一味 ——"
               "鲜料在途时间短,挥发性成分损耗小。",
    },
    {
        "slug": "honeysuckle", "zh": "金银花", "sci": "Lonicera japonica",
        "inci": "Lonicera Japonica Flower Extract",
        "region": "中国山东平邑 · 河南封丘", "part": "花蕾(将开未开时采)",
        "actives": "绿原酸、木犀草苷",
        "use": "舒缓与抗氧化方向;敏感肌、清洁类配方常用。",
        "key": "采收时点定成败:花蕾将开未开时绿原酸含量最高,开花之后掉得很快。"
               "这一味最能说明「择时采收」不是修辞。",
    },
    {
        "slug": "scutellaria", "zh": "黄芩", "sci": "Scutellaria baicalensis",
        "inci": "Scutellaria Baicalensis Root Extract",
        "region": "中国河北承德 · 山西", "part": "根",
        "actives": "黄芩苷(Baicalin)、黄芩素、汉黄芩素",
        "use": "抗氧化与舒缓方向;与屏障类配方配伍稳定。",
        "key": "黄芩苷本身带黄色,加量做抗氧化会把膏体带黄 —— "
               "这一味的用量上限往往由外观决定,而不是由功效决定。",
    },
    {
        "slug": "notoginseng", "zh": "三七", "sci": "Panax notoginseng",
        "inci": "Panax Notoginseng Root Extract",
        "region": "中国云南文山", "part": "根与根茎(三年生以上)",
        "actives": "三七皂苷 R1、人参皂苷 Rb1 / Rg1",
        "use": "屏障方向;与人参同属,皂苷谱不同,不能互相替代。",
        "key": "三七与人参同属不同种,皂苷谱差别很大 —— 报价单上写「人参皂苷」"
               "而实际用三七,是行业里常见的偷换,我们按物种分开建档。",
    },
    {
        "slug": "mugwort", "zh": "艾蒿", "sci": "Artemisia princeps / Artemisia argyi",
        "inci": "Artemisia Princeps Leaf Extract",
        "region": "中国湖北蕲春(蕲艾) · 河南", "part": "叶",
        "actives": "桉叶素等挥发油、黄酮类",
        "use": "舒缓与屏障方向;敏感肌线常用,韩系配方带热之后需求量涨得快。",
        "key": "艾蒿含挥发油,做敏感肌线时要按目标市场核对致敏原申报 —— "
               "「温和」是配方目标,不是这一味的天然属性。",
    },
]

FUNC_EN = {
    "licorice": "Licorice", "goji": "Goji berry", "houttuynia": "Houttuynia",
    "patchouli": "Patchouli", "honeysuckle": "Honeysuckle", "scutellaria": "Baikal skullcap",
    "notoginseng": "Notoginseng", "mugwort": "Mugwort",
}


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def j(obj):
    """块内容存 JSON 字符串。用 ensure_ascii=False —— 中文转义之后
       后台编辑器里看到的是一堆 \\u,没法改。"""
    import json
    return q(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exec", action="store_true", dest="do_exec")
    a = ap.parse_args()
    preflight()

    rows = d1(f"SELECT MAX(id) m FROM pages")
    next_page = int(rows[0]["m"]) + 1
    rows = d1(f"SELECT MAX(id) m FROM blocks")
    next_block = int(rows[0]["m"]) + 1
    print(f"新页从 id {next_page} 起 · 新块从 id {next_block} 起")

    L = ["-- 0057:原料溯源档案从五味补到十三味。",
         "-- 八味全部取自 ingredients 表(我们自己的原料库),产区写公开可查的道地产区,",
         "-- 不声称「帛卉在该产区有基地」——「自有基地亩数与证书编号由运营补充」那句原样保留。",
         "-- 由 tools/origin-herbs.py 生成,可重复跑(先删同 slug 的页再插)。",
         ""]

    grid_items = []
    for lab, sl in EXISTING:
        grid_items.append({"image": None, "label": lab, "note": None, "slug": sl})

    # 已有五味的图与产区从库里读回来,免得手抄写错
    old = d1("SELECT data_json FROM block_i18n WHERE block_id=%d AND lang='zh-cn'" % GRID_BLOCK)
    if old:
        import json
        cur = json.loads(old[0]["data_json"])
        for it, g in zip(cur.get("items", []), grid_items):
            g["image"] = it.get("image")
            g["note"] = it.get("note")

    pid, bid = next_page, next_block
    for h in HERBS:
        slug = f"origin/{h['slug']}"
        title_zh = f"{h['zh']} {h['sci'].split(' / ')[0]} · 原料溯源"
        title_en = f"{FUNC_EN[h['slug']]} — ingredient origin"
        L.append(f"-- {h['zh']}")
        L.append(f"DELETE FROM pages WHERE site_id={q(SITE)} AND slug={q(slug)};")
        L.append(
            f"INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) "
            f"VALUES ({pid}, {q(SITE)}, {q(slug)}, {PARENT}, 'standard', 1, {1105 + len(grid_items)}, 'published');")
        sci = h["sci"]
        desc_zh = (f"{h['zh']} {sci} 的常规产区、入料部位与主要活性成分,"
                   f"以及它在配方里的常见方向。产区为公开可查的道地产区。")
        desc_en = (f"Typical growing regions, plant part and key actives of {sci}, "
                   f"and how it is used in formulation.")
        L.append(
            f"INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES "
            f"({pid}, 'zh-cn', {q(h['zh'])}, {q(title_zh)}, {q(desc_zh)});")

        blocks = [
            ("hero", {
                "eyebrow": "原料溯源",
                "title": f"{h['zh']} · {h['sci']}",
                "body": h["use"],
                "ctaText": "发起询盘", "ctaHref": "/zh-cn/contact/",
            }, {
                "eyebrow": "INGREDIENT ORIGIN",
                "title": f"{FUNC_EN[h['slug']]} · {h['sci']}",
                "body": "Botanical facts below are publicly verifiable. "
                        "Plot size and certificate numbers for our own bases are filled in by operations.",
                "ctaText": "Send an enquiry", "ctaHref": "/en/contact/",
            }),
            ("matrix", {
                "title": "原料档案",
                "intro": "以下为该植物的通用信息,可公开查证。",
                "items": [
                    {"k": "学名", "v": h["sci"]},
                    {"k": "INCI", "v": h["inci"]},
                    {"k": "常规产区", "v": h["region"]},
                    {"k": "入料部位", "v": h["part"]},
                    {"k": "主要活性成分", "v": h["actives"]},
                    {"k": "常见应用方向", "v": h["use"]},
                ],
            }, {
                "title": "Ingredient file",
                "intro": "Publicly verifiable botanical information.",
                "items": [
                    {"k": "Botanical name", "v": h["sci"]},
                    {"k": "INCI", "v": h["inci"]},
                    {"k": "Typical growing regions", "v": h["region"]},
                    {"k": "Plant part", "v": h["part"]},
                    {"k": "Key actives", "v": h["actives"]},
                    {"k": "Typical use", "v": h["use"]},
                ],
            }),
            ("statement", {"eyebrow": "这一味的关键", "tone": "sand", "title": h["key"], "body": ""},
                          {"eyebrow": "WHAT MATTERS HERE", "tone": "sand", "title": h["key"], "body": ""}),
            ("prose", {"body": "【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、"
                               "GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n"
                               "这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,"
                               "采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"},
                       {"body": "[To be filled in by operations] Plot location, area, GAP or organic "
                                "certificate number, harvest date and batch test report number for our "
                                "cooperating base for this botanical.\n\nLeaving this blank is deliberate: "
                                "invented acreage or altitude figures fall apart the moment a buyer checks them."}),
            ("inquiry", {"title": f"需要{h['zh']}原料的检测报告?",
                         "body": "按批出具活性物含量、农残与重金属检测。", "ctaText": "发起询盘"},
                        {"title": f"Need test reports for {FUNC_EN[h['slug']].lower()}?",
                         "body": "Actives content, pesticide residue and heavy metals, issued per batch.",
                         "ctaText": "Send an enquiry"}),
        ]
        for i, (typ, zh, en) in enumerate(blocks, 1):
            L.append(f"INSERT INTO blocks (id, page_id, type, sort_order, is_visible) "
                     f"VALUES ({bid}, {pid}, {q(typ)}, {i * 10}, 1);")
            # 只写简体。英文与其余十六种语言交给 tools/translate-backfill.mjs ——
            # 在这里手写英文,「常规产区/入料部位」这些值还是中文,等于给英文页塞中文。
            L.append(f"INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES "
                     f"({bid}, 'zh-cn', {j(zh)}, 0);")
            bid += 1

        grid_items.append({
            "image": IMAGES.get(h["slug"]),
            "label": f"{h['zh']} {h['sci'].split(' / ')[0]}",
            "note": h["region"],
            "slug": h["slug"],
        })
        pid += 1
        L.append("")

    # 卡片网格:补 href(五味一直不可点)+ 追加八味
    import json
    items = [{k: v for k, v in
              (("image", g["image"]), ("label", g["label"]), ("note", g["note"]),
               ("href", f"/zh-cn/origin/{g['slug']}/")) if v}
             for g in grid_items]
    grid = {"eyebrow": "ORIGINS", "tone": "paper", "cols": 3,
            "title": f"{len(items)} 味核心原料",
            "intro": "点进任意一味看产区、入料部位与活性成分。植物学信息是公开可查的;"
                     "帛卉自有基地的亩数与证书编号由运营在后台补充。尚无实拍的条目暂不配图 ——"
                     "不拿图库照片冒充基地实拍。",
            "items": items}
    L.append("-- 卡片网格:补 href + 追加八味")
    L.append(f"UPDATE block_i18n SET data_json={j(grid)} WHERE block_id={GRID_BLOCK} AND lang='zh-cn';")

    stats = d1(f"SELECT data_json FROM block_i18n WHERE block_id={STATS_BLOCK} AND lang='zh-cn'")
    if stats:
        sb = json.loads(stats[0]["data_json"])
        for it in sb.get("items", []):
            if it.get("unit") == "味":
                it["value"] = str(len(items))
        L.append("-- 顶部数字:核心原料档案改成实际条数")
        L.append(f"UPDATE block_i18n SET data_json={j(sb)} WHERE block_id={STATS_BLOCK} AND lang='zh-cn';")

    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print(f"SQL:{OUT}")
    print(f"  新增 {len(HERBS)} 味 · 网格共 {len(items)} 张卡 · 每味 5 个版块(先写简体,其余语种走翻译回填)")
    if a.do_exec:
        n = d1_exec(OUT)
        print(f"  已灌库,写入 {n} 行")
    else:
        print("  加 --exec 才写库")


if __name__ == "__main__":
    main()
