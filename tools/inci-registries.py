#!/usr/bin/env python3
"""各国原料目录清单 —— 把「原料检索」从单一国家改成一个版块。

由来(创始人 2026-09-10 10:1x:「要好像其他版块一样设置版块,点击进来,
显示多国的规范,尽可能全球更多的,而不是单个国家」)。

原来 `/inci/` 只有中国《已使用化妆品原料目录(2021年版)》8,965 条 —— 对做出口的客户,
这一页只回答了「中国能不能用」,而他真正要问的是「我要卖的那六个国家分别能不能用」。

**每一条都必须挂官方原文链接,抓不到就写「待抓取」,不许拿别的目录冒充。**
欧盟和东盟的附录内容高度重合,但重合不等于相同(东盟有自己的过渡期与本地条目),
一律各自抓各自的,不做「参照欧盟」这种偷懒映射 —— 客户拿去做通报,错一条就是退件。

用法:
    python tools/inci-registries.py            体检
    python tools/inci-registries.py --apply    写库
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# id, 地区, 中文名, 英文名, 发布机构中/英, 官方链接, 中文说明, 英文说明, 排序
REG = [
    ("cn-nmpa-2021", "中国", "已使用化妆品原料目录(2021年版)",
     "Inventory of Existing Cosmetic Ingredients in China (2021)",
     "国家药品监督管理局", "NMPA",
     "https://www.nmpa.gov.cn/xxgk/ggtg/qtggtg/20210430161354139.html",
     "国家药监局 2021 年第 62 号公告附件。收录在中国境内已经使用过的化妆品原料,"
     "含标准中文名、INCI 名与最高历史使用量。按公告说明八,最高历史使用量可作为"
     "《化妆品安全评估报告(简化版)》的证据类型 —— 这是能直接省客户钱的一栏。"
     "收录不等于批准:禁用、限用与准用组分另按《化妆品安全技术规范》执行。",
     "Annex to NMPA announcement No. 62 of 2021. Lists ingredients already used in cosmetics in China, "
     "with the standard Chinese name, INCI name and maximum historical use level. Listing is not approval.",
     10),
    ("cn-stsc", "中国", "化妆品安全技术规范 · 禁用与限用组分",
     "Safety and Technical Standards for Cosmetics — prohibited and restricted",
     "国家药品监督管理局", "NMPA",
     "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjhzhp/20151223120001986.html",
     "禁用组分表、限用组分表,以及准用防腐剂、防晒剂、着色剂、染发剂四张准用表。"
     "上一张目录回答「用过没有」,这一张回答「能不能用、能用多少」——"
     "做中国备案两张都要查,缺一张就会在评估环节被打回。",
     "Prohibited and restricted ingredient tables plus the four positive lists (preservatives, UV filters, "
     "colorants, hair dyes). The inventory says what has been used; this says what may be used and at what level.",
     20),
    ("eu-cosing", "欧盟", "CosIng 化妆品成分数据库",
     "CosIng — European Commission cosmetic ingredient database",
     "欧盟委员会", "European Commission",
     "https://ec.europa.eu/growth/tools-databases/cosing/",
     "欧盟官方成分数据库,含 INCI 名、CAS/EC 号、功能分类,以及该成分在 1223/2009 各附录中的状态。"
     "做 CPNP 通报与责任人材料时的第一手依据。",
     "The Commission's official ingredient database: INCI name, CAS/EC numbers, function, and the status of "
     "the substance in the annexes to Regulation 1223/2009.",
     30),
    ("eu-annex", "欧盟", "化妆品法规 1223/2009 附录 II–VI",
     "Regulation (EC) No 1223/2009 — Annexes II to VI",
     "欧盟委员会", "European Commission",
     "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02009R1223-20240101",
     "附录 II 禁用、III 限用、IV 着色剂、V 防腐剂、VI 防晒剂。附录随委员会条例逐年修订,"
     "**必须看合并版(consolidated)并核对生效日期** —— 拿旧版做配方是出口退件最常见的原因之一。",
     "Annex II prohibited, III restricted, IV colorants, V preservatives, VI UV filters. The annexes are amended "
     "every year; always work from the consolidated text and check the date of application.",
     40),
    ("asean-acd", "东盟", "东盟化妆品指令附录",
     "ASEAN Cosmetic Directive — Annexes",
     "东盟秘书处", "ASEAN Secretariat",
     "https://asean.org/book/asean-cosmetic-documents/",
     "印尼、泰国、马来西亚、越南、菲律宾、新加坡六国通报共用的技术底稿。"
     "附录结构与欧盟高度相似但**不等同**:有自己的过渡期与本地条目,"
     "各国还会再叠加本国规定(例如印尼的清真要求)。不要拿欧盟附录直接代替。",
     "The technical basis shared by the six ASEAN notification systems. Structurally close to the EU annexes "
     "but not identical: different transition periods, local entries, and additional national requirements.",
     50),
    ("us-fda", "美国", "FDA 化妆品禁用与限用成分、色素添加剂",
     "FDA prohibited and restricted cosmetic ingredients; color additives",
     "美国食品药品监督管理局", "US FDA",
     "https://www.fda.gov/cosmetics/cosmetics-laws-regulations/prohibited-restricted-ingredients-cosmetics",
     "美国没有「已使用原料目录」这种正面清单 —— 除色素外,化妆品成分上市前不需要批准。"
     "所以这里收的是**禁用/限用清单**与 21 CFR 73/74/82 的色素添加剂清单。"
     "另外 MoCRA 之后设施注册与产品列名是强制的,那是另一条线,见备案索引。",
     "The US has no positive inventory: apart from colour additives, cosmetic ingredients need no pre-market "
     "approval. What exists is the prohibited/restricted list plus the colour additive regulations (21 CFR 73/74/82).",
     60),
    ("ca-hotlist", "加拿大", "化妆品成分热清单(Hotlist)",
     "Cosmetic Ingredient Hotlist",
     "加拿大卫生部", "Health Canada",
     "https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/cosmetic-ingredient-hotlist-prohibited-restricted-ingredients.html",
     "加拿大的禁用与限用清单,条目比美国细。北美单如果同时走加拿大,"
     "配方要按这张表再过一遍 —— 有些在美国不限的成分在加拿大是限用。",
     "Canada's prohibited and restricted list. More granular than the US list; a formula cleared for the US "
     "still has to be re-checked against it.",
     70),
    ("jp-std", "日本", "化粧品基準 · 别表",
     "Standards for Cosmetics — appended tables",
     "厚生劳动省", "MHLW Japan",
     "https://www.mhlw.go.jp/web/t_doc?dataId=75001000&dataType=0",
     "日本采用「负面清单 + 有限正面清单」:别表 1 禁用、别表 2 限用、别表 3 防腐剂、"
     "别表 4 紫外线吸收剂。医薬部外品(药用化妆品)另按医薬部外品原料規格,是另一套。",
     "Japan works from a negative list plus limited positive lists: prohibited, restricted, preservatives and "
     "UV absorbers. Quasi-drugs follow a separate ingredient standard.",
     80),
    ("kr-safety", "韩国", "化妆品安全基准等相关规定",
     "Regulation on Safety Standards for Cosmetics",
     "食品医药品安全处", "MFDS Korea",
     "https://www.mfds.go.kr/eng/index.do",
     "别表 1 禁用原料、别表 2 使用上有限制的原料(含防腐剂、紫外线遮断剂、色素)。"
     "功能性化妆品(美白、抗皱、防晒)另有告示与审查,不在这张表里。",
     "Prohibited ingredients and ingredients subject to use limits (preservatives, UV filters, colorants). "
     "Functional cosmetics have a separate approval track.",
     90),
    ("br-anvisa", "巴西", "ANVISA 化妆品成分限制与准用清单",
     "ANVISA cosmetic ingredient restrictions and positive lists",
     "巴西国家卫生监督局", "ANVISA",
     "https://www.gov.br/anvisa/pt-br",
     "巴西属于南方共同市场(MERCOSUR)技术法规体系,禁用与限用清单以 RDC 决议逐条发布,"
     "并会引用 MERCOSUR 共同清单。做巴西线要同时看 RDC 与 MERCOSUR 决议。",
     "Brazil follows the MERCOSUR technical framework; prohibitions and restrictions are issued as RDC "
     "resolutions that reference the MERCOSUR common lists.",
     100),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    have = {r["registry"]: r["n"] for r in
            d1("SELECT registry, COUNT(*) n FROM inci_catalog GROUP BY registry")}
    print(f"目录 {len(REG)} 个 · 库内已有条目的目录: {have}")
    for r in REG:
        n = have.get(r[0], 0)
        print(f"  {r[0]:<14} {r[1]:<5} {r[2][:30]:<32} {'已入库 ' + str(n) + ' 条' if n else '待抓取'}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = []
    for (rid, region, zh, en, izh, ien, url, nzh, nen, order) in REG:
        st = "live" if have.get(rid) else "pending"
        lines.append(
            "INSERT INTO inci_registry (id,region,name_zh,name_en,issuer_zh,issuer_en,official_url,"
            "note_zh,note_en,sort_order,status) VALUES ("
            + ",".join([q(rid), q(region), q(zh), q(en), q(izh), q(ien), q(url), q(nzh), q(nen),
                        str(order), q(st)])
            + ") ON CONFLICT(id) DO UPDATE SET region=excluded.region,name_zh=excluded.name_zh,"
              "name_en=excluded.name_en,issuer_zh=excluded.issuer_zh,issuer_en=excluded.issuer_en,"
              "official_url=excluded.official_url,note_zh=excluded.note_zh,note_en=excluded.note_en,"
              "sort_order=excluded.sort_order,status=excluded.status;")
    sql = os.path.join(HERE, "_inci-registries.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()
