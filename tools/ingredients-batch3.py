#!/usr/bin/env python3
"""原料库第三批 —— 30 味,把溯源页推过 100。

QUEUE.md Q1 续。门槛与第二批一致:INCI 必须在《已使用化妆品原料目录(2021年版)》
里查得到,最高历史使用量照抄目录不改,机理只写植物化学与配方学的公开常识,
不写功效结论、不编试验数据。目录里查不到的(刺果番荔枝、巴西果、木薯、
沙棘叶、玫瑰纯露)已剔除。

用法:
    python tools/ingredients-batch3.py            体检
    python tools/ingredients-batch3.py --apply    写库
"""
import argparse, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

ROWS = [
    # ── 亚马逊 / 巴西线(续)──────────────────────────────────
    ("plukenetia-volubilis-seed-oil", "印加果油", "Plukenetia Volubilis Seed Oil",
     "印加果,星油藤,Sacha inchi", "", "植物油脂", "barrier,soothing,nourishing",
     "大戟科星油藤种子压榨油,亚麻酸(ω-3)与亚油酸合计占比在植物油里属最高一档。"
     "极高的不饱和度决定了它的两面:肤感极轻、渗透快,但氧化风险也是全库最高的之一。"
     "目录里驻留类最高历史使用量只有 0.05%,按低加量设计,不要当主油相用。",
     "0.05%(参考国家目录最高历史使用量口径,非法规限值)", "serum,oil,cream,balm", "不适用(油相)",
     "1)高不饱和度,与金属离子、光、热任一接触都会加速氧化,必须配螯合剂与抗氧化剂;"
     "2)与高活性酸类或过氧化物体系共处会明显缩短货架期;"
     "3)有本底气味,氧化后转为哈味,是客诉的第一来源。",
     "全库最不耐放的油之一。来料按批看过氧化值与酸价,拒收临期货;"
     "配方必配生育酚等抗氧体系;成品避光包材,避免长期常温货架;"
     "加速稳定性以气味为首要观察项,颜色变化反而滞后。",
     "油相后加,加热上限 60℃,乳化降温后再投更稳妥。"
     "小包装采购,开封后尽快用完;不要为省成本一次进大桶。",
     "high", "中"),

    ("moringa-oleifera-seed-oil", "辣木籽油", "Moringa Oleifera Seed Oil",
     "辣木油,Ben oil", "", "植物油脂", "conditioning,barrier,antioxidant",
     "辣木科辣木种子压榨油,油酸占比很高、亚油酸低,因此氧化稳定性在植物油里属优等,"
     "历史上曾用作钟表润滑与香料萃取的载体油,原因就是它不易酸败、气味极淡。"
     "配方上是想要植物基又怕酸败时的稳妥选择。",
     "1–15%(公开配方学常见区间,非法规限值)", "oil,cream,balm,body-lotion,hair-oil", "不适用(油相)",
     "1)气味极淡是优点,但也意味着它盖不住其它原料的本底味;"
     "2)高油酸油在高温下长时间保温仍会异构,不要靠延长保温来助溶;"
     "3)与高极性溶剂相容性一般,配方里油相极性跨度大时先做相容试验。",
     "氧化稳定性好,常温避光即可,是本库里少数不需要特别防护的植物油。"
     "留样重点看澄清度而非气味。",
     "油相常规加热,上限 80℃。可作为高价油(玫瑰果、印加果)的稀释载体,"
     "既降成本又提高整体货架期 —— 这个搭配在报价时可以主动提。",
     "low", "高"),

    ("passiflora-edulis-seed-oil", "百香果籽油", "Passiflora Edulis Seed Oil",
     "西番莲籽油,Maracujá", "", "植物油脂", "lightweight,conditioning,barrier",
     "西番莲科百香果种子压榨油,亚油酸占比高,肤感是典型的「干性油」——"
     "铺展快、成膜薄、几乎不留油光,做油类精华与面部油时不闷。"
     "巴西线里与阿萨伊、木鲁星果同属常见组合。",
     "1–20%(公开配方学常见区间,非法规限值)", "oil,serum,cream,lotion,hair-oil", "不适用(油相)",
     "1)亚油酸为主,氧化敏感,需抗氧配套;"
     "2)与高油酸油混配时肤感会被拉重,想保留清爽感就别掺太多重油;"
     "3)本底颜色浅黄,对配方影响小。",
     "对氧敏感但弱于印加果油。来料看过氧化值;配生育酚;避光贮存。",
     "油相加热上限 75℃。做「清爽型油类精华」时它是骨架油,"
     "比例低于 30% 就撑不起那个卖点,配方设计时要先定位再配比。",
     "mid", "中"),

    ("psidium-guajava-leaf-extract", "番石榴叶提取物", "Psidium Guajava Leaf Extract",
     "芭乐叶,番石榴叶", "", "多酚", "oil-control,soothing,antioxidant",
     "桃金娘科番石榴叶提取物,含没食子酸类单宁、槲皮素类黄酮与三萜。"
     "单宁带来的收敛感是它在控油与毛孔方向配方里的直接由来;"
     "颜色偏黄褐,是浅色配方的负担。",
     "0.1–0.5%(参考国家目录最高历史使用量口径,非法规限值)", "serum,essence,gel,mask,toner", "4.5–6.0",
     "1)单宁与蛋白类原料(水解胶原、多肽)结合浑浊或絮凝;"
     "2)与阳离子体系易析出;"
     "3)与铁离子络合显深色;"
     "4)高加量下体系发涩,面部配方要配润肤剂平衡。",
     "多酚体系对光、热与金属离子敏感,颜色加深是主要表现。"
     "避光贮存,体系配螯合剂;加速稳定性以颜色与澄清度为观察项。",
     "水相溶解,加热上限 60℃,后加料。"
     "叶与果是两种原料,目录里分条收录,备案与报价必须写清部位。",
     "low", "中"),

    ("coffea-arabica-seed-extract", "咖啡籽提取物", "Coffea Arabica (Coffee) Seed Extract",
     "小粒咖啡,阿拉比卡咖啡", "", "多酚", "antioxidant,conditioning,oil-control",
     "茜草科小粒咖啡种子提取物,含绿原酸类多酚与天然咖啡因。"
     "生豆提取物绿原酸高、颜色浅;焙炒豆提取物颜色深、气味强 ——"
     "**两种规格配方性质完全不同**,采购时必须写明生豆还是焙炒。",
     "0.1–2.3%(参考国家目录最高历史使用量口径,非法规限值)", "serum,essence,gel,body-lotion,mask", "4.5–6.5",
     "1)绿原酸在偏碱与高温下降解并变色;"
     "2)与铁离子络合显深绿褐;"
     "3)含咖啡因,与其它含咖啡因原料叠加时总量要合计核算;"
     "4)焙炒规格气味强,与香型设计冲突。",
     "多酚对光热敏感,颜色加深明显。避光低温贮存,体系配螯合剂。",
     "水相或水醇相溶解,加热上限 60℃,后加料。"
     "生豆/焙炒、种子/叶/果这几个维度组合出来的原料差别很大,"
     "来料规格书必须逐项写清,不能只写「咖啡提取物」。",
     "mid", "中"),

    ("theobroma-cacao-seed-extract", "可可籽提取物", "Theobroma Cacao (Cocoa) Seed Extract",
     "可可,巧克力树", "", "多酚", "antioxidant,soothing,conditioning",
     "梧桐科可可种子提取物,含原花青素类多酚(儿茶素、表儿茶素聚合体)与可可碱。"
     "颜色深、气味明显,是典型的「叙事强、配方难」原料 ——"
     "客户喜欢它的故事,配方师要处理它的颜色与气味。",
     "0.1–3%(公开配方学常见区间,非法规限值)", "serum,cream,body-lotion,mask,balm", "4.5–6.5",
     "1)原花青素与蛋白类结合浑浊;"
     "2)与铁离子络合显灰褐;"
     "3)颜色与气味都强,浅色与无香配方基本用不了;"
     "4)含可可碱,与咖啡因类叠加时口径要一致。",
     "多酚体系,光热下颜色加深。避光贮存,配螯合与抗氧。",
     "水相或水醇相溶解,加热上限 60℃,后加料。"
     "可可脂(Cocoa Butter)与可可籽提取物是完全不同的两种原料,"
     "客户常混着说,报价前先把 INCI 落到形态。",
     "mid", "中"),

    ("anacardium-occidentale-seed-oil", "腰果仁油", "Anacardium Occidentale (Cashew) Seed Oil",
     "腰果油", "", "植物油脂", "conditioning,barrier",
     "漆树科腰果种仁压榨油,油酸为主并含亚油酸,肤感中等厚度,滋润但不厚重。"
     "配方作用与其它高油酸果仁油接近,差异更多在叙事与产地。",
     "1–10%(公开配方学常见区间,非法规限值)", "oil,cream,body-lotion,balm,hair-oil", "不适用(油相)",
     "1)**坚果来源,过敏原标示是硬要求**,出口欧美必须在标签与安全评估里体现;"
     "2)不饱和度中等,常规抗氧即可;"
     "3)注意与腰果壳油(CNSL)区分 —— 后者含强刺激性酚类,不是化妆品原料。",
     "氧化稳定性中等,来料看过氧化值与酸价,配生育酚,避光贮存。",
     "油相常规加热,上限 75℃。"
     "**采购环节必须确认是种仁油而非壳液**,规格书与 COA 上要逐字核对 INCI。",
     "low", "中"),

    ("helichrysum-italicum-extract", "意大利蜡菊提取物", "Helichrysum Italicum Extract",
     "永生花,蜡菊,Immortelle", "", "植物提取物", "soothing,antioxidant,repair",
     "菊科意大利蜡菊的提取物,含黄酮类(蜡菊素类)、酚酸与倍半萜。"
     "花头干燥后颜色气味长期不变是它俗名的由来,配方上是高价的舒缓与叙事型原料。"
     "精油规格与提取物规格价格差一个数量级,报价前要落到形态。",
     "0.1–1.9%(参考国家目录最高历史使用量口径,非法规限值)", "serum,essence,cream,balm,oil", "4.5–6.5",
     "1)提取物与精油(Flower Oil)是两种原料,价格与用法都不同,别混谈;"
     "2)黄酮类与铁离子络合显色;"
     "3)本底颜色偏黄,浅色配方需控量;"
     "4)精油规格含致敏性香料组分,欧盟标示门槛要复核。",
     "黄酮酚酸体系对光热敏感,颜色加深为主要表现。避光低温贮存,配螯合剂。",
     "水相或水醇相加入,加热上限 60℃,后加料。"
     "这一味价格高且波动大,报价单上注明有效期与规格(提取溶剂、料液比)。",
     "high", "中"),
]

# 道地药材线那 22 味在单独文件里 —— 一次往 shell 灌两万字中文,heredoc 会在某个引号上炸
from ingredients_batch3_rows import ROWS2  # noqa: E402
ROWS += ROWS2


def check():
    ok, miss = [], []
    for r in ROWS:
        key = re.sub(r"[（(][^）)]*[）)]", " ", r[2].upper())
        key = re.sub(r"[^A-Z0-9]+", " ", key).strip()
        hit = d1("SELECT no, name_zh, max_rinse, max_leave FROM inci_catalog "
                 f"WHERE inci_key = '{key}' LIMIT 1")
        (ok if hit else miss).append((r, hit[0] if hit else None))
    return ok, miss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    have = {r["slug"] for r in d1("SELECT slug FROM ingredients")}
    ok, miss = check()
    print(f"本批 {len(ROWS)} 味 · 目录对得上 {len(ok)} · 对不上 {len(miss)}")
    for r, _h in miss:
        print(f"  ✗ {r[1]} · {r[2]} —— 目录查不到,不入库")

    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_ingredients-batch3.sql")
    cols = ("slug,inci,name_zh,aliases,cas,family,functions,mechanism_zh,use_level,formats,"
            "ph_range,incompatible,stability,factory_note,cost_band,confidence,status,updated_at")
    n = 0
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for r, h in ok:
            if r[0] in have:
                continue
            (slug, zh, inci, alias, cas, fam, fn, mech, use, fmts, ph,
             inc, stab, note, band, conf) = r
            mkt = (f"已收录于《已使用化妆品原料目录(2021年版)》第 {h['no']} 号"
                   f"「{h['name_zh']}」;" if h else "")
            if h and (h["max_rinse"] or h["max_leave"]):
                v = []
                if h["max_rinse"]:
                    v.append(f"淋洗类 {h['max_rinse']}%")
                if h["max_leave"]:
                    v.append(f"驻留类 {h['max_leave']}%")
                mkt += ("目录载明最高历史使用量 " + "、".join(v)
                        + "(可作为简化版安全评估报告的证据类型,非法规限值);")
            mkt += "按备案要求填报,以最新官方文本为准。"
            fh.write(
                f"INSERT INTO ingredients ({cols},market_cn) VALUES ("
                f"{q(slug)},{q(inci)},{q(zh)},{q(alias)},{q(cas)},{q(fam)},{q(fn)},{q(mech)},"
                f"{q(use)},{q(fmts)},{q(ph)},{q(inc)},{q(stab)},{q(note)},{q(band)},{q(conf)},"
                f"'published',datetime('now'),{q(mkt)}) "
                f"ON CONFLICT(slug) DO UPDATE SET mechanism_zh=excluded.mechanism_zh, "
                f"incompatible=excluded.incompatible, stability=excluded.stability, "
                f"factory_note=excluded.factory_note, market_cn=excluded.market_cn, "
                f"status='published', updated_at=datetime('now');\n")
            n += 1
    print(f"  SQL {os.path.getsize(sql):,} 字节 · {n} 味,写入 {d1_exec(sql):,} 行")
    t = d1("SELECT COUNT(*) n FROM ingredients WHERE status='published'")
    print(f"完成:原料库在架 {t[0]['n']} 味")


if __name__ == "__main__":
    main()
