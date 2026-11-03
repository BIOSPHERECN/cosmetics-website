#!/usr/bin/env python3
"""种植基地页批量生成 —— 原料库里的植物,每一味一个产地溯源页。

由来:创始人反复提过两次「我看基地依然还是那几个,没新增啊」
「基地要扩展到更多的 100 个基地,你一直没交付」。站上只有 13 个,欠着。

口径完全照抄现有那 13 页(2026-08-29 建的),一个字不放松:
  · matrix 里只放**可公开查证的通用信息**:学名、常规产区、入料部位、主要活性、应用方向
  · prose 一段明确留空,写着「待运营在后台补充」——
    地块位置、亩数、GAP 认证号、当季采收日期、批次报告号这些**必须人填**。
    系统凭空生成的产区海拔和亩数,采购拿去核对当场穿帮,损失远大于「暂时没填」。
  · **不加 bandimg**。现有 13 页每页配一张基地实拍,新增这批没有图 ——
    宁可少一个版块,不摆占位图(创始人:「各种库,把空余的删除,保持真实的上架」)。

哪些原料够格开基地页:**能指向一片地的植物**。
β-葡聚糖、透明质酸钠、黄原胶、角鲨烷、水杨酸、积雪草苷这些是分离物、
发酵产物或半合成物,没有种植基地,开页就是编 —— 一律排除。

两处渲染契约,写错了不会报错、只会渲染成空白:
  · matrix 的条目键是 {title, desc},**不是** {k, v}。
    现有那 13 页从 2026-08-29 起就存的 {k,v},「原料档案」整块空了十天没人发现。
  · prose 渲染器读 paragraphs 数组,不读 body。这里的 prose 是写给运营看的提示,
    所以直接建成 is_visible=0 —— 万一哪天渲染器改对了,也不会把内部提示漏给客户。

用法:
    python tools/origin-pages.py            体检:列出会建哪些,不写库
    python tools/origin-pages.py --apply    写入 D1
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
PARENT_SLUG = "origin"

# 不是「一片地」的原料,不开基地页。
NOT_A_FARM = {
    "beta-glucan", "sodium-hyaluronate", "xanthan-gum", "betaine", "salicylic-acid",
    "ferulic-acid", "phytic-acid", "squalane", "asiaticoside", "glabridin",
    "epigallocatechin-gallate", "pectin", "inulin", "carrageenan",
    "tamarindus-indica-seed-gum", "tremella-fuciformis-polysaccharide",
    "laminaria-digitata-extract", "crithmum-maritimum-extract",
}

# 现有 13 页用的是俗名短 slug(origin/ginseng),原料库用的是拉丁名
# (panax-ginseng-root-extract)。不做这张对照表,会给同一味植物开出第二个基地页 ——
# 页面上看是「基地变多了」,实际是同一片地写了两遍。
ALIAS = {
    "aloe-barbadensis-leaf-juice": "aloe",
    "artemisia-princeps-leaf-extract": "mugwort",
    "camellia-sinensis-leaf-extract": "green-tea",
    "centella-asiatica-extract": "centella",
    "glycyrrhiza-glabra-root-extract": "licorice",
    "houttuynia-cordata-extract": "houttuynia",
    "lonicera-japonica-flower-extract": "honeysuckle",
    "lycium-barbarum-fruit-extract": "goji",
    "panax-ginseng-root-extract": "ginseng",
    "panax-notoginseng-root-extract": "notoginseng",
    "pogostemon-cablin-oil": "patchouli",
    "rosa-damascena-flower-oil": "rose",
    "scutellaria-baicalensis-root-extract": "scutellaria",
}

# 常规产区。全部是公开可查的道地/主产区,不是我们自有地块 ——
# 页面上写「常规产区」而不是「帛卉基地」,这两件事差得远。
# 拿不准的留空:matrix 会自动少一行,不会写一个像模像样的假产区。
REGION = {
    # ── 第三批(2026-09-10)──
    "plukenetia-volubilis-seed-oil": ("秘鲁与厄瓜多尔亚马逊地区", "Amazon regions of Peru and Ecuador"),
    "moringa-oleifera-seed-oil": ("印度、非洲之角与中国云南", "India, the Horn of Africa and Yunnan, China"),
    "passiflora-edulis-seed-oil": ("巴西、秘鲁与中国广西", "Brazil, Peru and Guangxi, China"),
    "psidium-guajava-leaf-extract": ("巴西、印度与中国华南", "Brazil, India and southern China"),
    "coffea-arabica-seed-extract": ("巴西、哥伦比亚与中国云南", "Brazil, Colombia and Yunnan, China"),
    "theobroma-cacao-seed-extract": ("巴西、科特迪瓦与加纳", "Brazil, Côte d'Ivoire and Ghana"),
    "anacardium-occidentale-seed-oil": ("巴西东北部、越南与印度", "Northeastern Brazil, Vietnam and India"),
    "helichrysum-italicum-extract": ("科西嘉与地中海沿岸", "Corsica and the Mediterranean coast"),
    "polygonatum-sibiricum-extract": ("中国贵州、湖南与河北", "Guizhou, Hunan and Hebei, China"),
    "polygonatum-odoratum-extract": ("中国湖南、河南与江苏", "Hunan, Henan and Jiangsu, China"),
    "rehmannia-glutinosa-root-extract": ("中国河南焦作(怀药产区)", "Jiaozuo, Henan, China"),
    "paeonia-suffruticosa-root-extract": ("中国安徽亳州、山东菏泽", "Bozhou in Anhui and Heze in Shandong, China"),
    "morus-alba-root-bark-extract": ("中国江浙、四川与广东", "Jiangsu-Zhejiang, Sichuan and Guangdong, China"),
    "polygonum-multiflorum-root-extract": ("中国广东德庆、贵州与四川", "Deqing in Guangdong, Guizhou and Sichuan, China"),
    "schisandra-chinensis-fruit-extract": ("中国辽宁、吉林与黑龙江", "Liaoning, Jilin and Heilongjiang, China"),
    "lithospermum-officinale-root-extract": ("中国新疆、内蒙古与东北", "Xinjiang, Inner Mongolia and Northeast China"),
    "sophora-flavescens-root-extract": ("中国山西、河南与陕西", "Shanxi, Henan and Shaanxi, China"),
    "phellodendron-amurense-extract": ("中国东北(关黄柏)与四川(川黄柏)", "Northeast China and Sichuan, China"),
    "forsythia-suspensa-fruit-extract": ("中国山西、河南与陕西", "Shanxi, Henan and Shaanxi, China"),
    "coix-lacryma-jobi-seed-extract": ("中国贵州兴仁、福建与河北", "Xingren in Guizhou, Fujian and Hebei, China"),
    "camellia-japonica-flower-extract": ("中国浙江、日本与韩国济州", "Zhejiang in China, Japan and Jeju in Korea"),
    "gynostemma-pentaphyllum-extract": ("中国陕西平利、湖南与云南", "Pingli in Shaanxi, Hunan and Yunnan, China"),
    "lentinus-edodes-extract": ("中国浙江庆元、福建与湖北", "Qingyuan in Zhejiang, Fujian and Hubei, China"),
    "tremella-fuciformis-extract": ("中国福建古田、四川通江", "Gutian in Fujian and Tongjiang in Sichuan, China"),
    "tricholoma-matsutake-extract": ("中国云南香格里拉、四川甘孜(野生)", "Shangri-La in Yunnan and Garzê in Sichuan, China (wild)"),
    "thuja-orientalis-leaf-extract": ("中国华北与西北", "Northern and northwestern China"),
    "ligustrum-lucidum-fruit-extract": ("中国浙江、江苏与湖南", "Zhejiang, Jiangsu and Hunan, China"),
    "eriobotrya-japonica-extract": ("中国福建莆田、浙江与江苏", "Putian in Fujian, Zhejiang and Jiangsu, China"),
    "gleditsia-australis-fruit-extract": ("中国云南、广西与贵州", "Yunnan, Guangxi and Guizhou, China"),
    "aloe-andongensis-leaf-extract": ("安哥拉与非洲南部", "Angola and southern Africa"),

    # ── 第二批(2026-09-09):亚马逊线与道地药材线 ──
    "euterpe-oleracea-fruit-extract": ("巴西亚马逊河口(帕拉州)", "The Amazon estuary, Pará, Brazil"),
    "euterpe-oleracea-fruit-oil": ("巴西亚马逊河口(帕拉州)", "The Amazon estuary, Pará, Brazil"),
    "astrocaryum-murumuru-seed-butter": ("巴西亚马逊西部与阿克里州", "Western Amazon and Acre, Brazil"),
    "paullinia-cupana-seed-extract": ("巴西亚马逊州马乌埃斯", "Maués, Amazonas, Brazil"),
    "bertholletia-excelsa-seed-oil": ("巴西、玻利维亚与秘鲁的亚马逊林区", "Amazon forests of Brazil, Bolivia and Peru"),
    "myrciaria-dubia-fruit-extract": ("秘鲁与巴西的亚马逊河漫滩", "Amazon floodplains of Peru and Brazil"),
    "copaifera-officinalis-resin": ("巴西与哥伦比亚亚马逊林区", "Amazon forests of Brazil and Colombia"),
    "copernicia-cerifera-wax": ("巴西东北部(塞阿拉、皮奥伊)", "Northeastern Brazil (Ceará, Piauí)"),
    "orbignya-oleifera-seed-oil": ("巴西马拉尼昂与托坎廷斯", "Maranhão and Tocantins, Brazil"),
    "bletilla-striata-root-extract": ("中国贵州、云南与四川", "Guizhou, Yunnan and Sichuan, China"),
    "dendrobium-extract": ("中国浙江、云南与安徽霍山", "Zhejiang, Yunnan and Huoshan in Anhui, China"),
    "ganoderma-lucidum-extract": ("中国浙江龙泉、安徽与吉林", "Longquan in Zhejiang, Anhui and Jilin, China"),
    "poria-cocos-extract": ("中国湖北罗田、安徽与云南", "Luotian in Hubei, Anhui and Yunnan, China"),
    "gastrodia-elata-root-extract": ("中国贵州大方、云南昭通与陕西汉中", "Dafang in Guizhou, Zhaotong in Yunnan and Hanzhong in Shaanxi, China"),
    "saussurea-involucrata-extract": ("中国新疆天山山区(人工栽培)", "The Tianshan range, Xinjiang, China (cultivated)"),
    "paris-polyphylla-extract": ("中国云南与四川(人工栽培)", "Yunnan and Sichuan, China (cultivated)"),
    "ligusticum-chuanxiong-root-extract": ("中国四川都江堰与彭州", "Dujiangyan and Pengzhou, Sichuan, China"),
    "saposhnikovia-divaricata-root-extract": ("中国黑龙江、内蒙古与河北", "Heilongjiang, Inner Mongolia and Hebei, China"),
    "atractylodes-macrocephala-root-powder": ("中国浙江磐安与安徽", "Pan'an in Zhejiang and Anhui, China"),
    "carthamus-tinctorius-flower-extract": ("中国新疆塔城与河南", "Tacheng in Xinjiang and Henan, China"),

    "aloe-barbadensis-leaf-juice": ("墨西哥、加勒比与中国海南", "Mexico, the Caribbean and Hainan, China"),
    "angelica-sinensis-root-extract": ("中国甘肃岷县一带", "Min County, Gansu, China"),
    "anthemis-nobilis-flower-oil": ("英国、法国与东欧", "United Kingdom, France and Eastern Europe"),
    "arctium-lappa-root-extract": ("中国东北与日本", "Northeast China and Japan"),
    "argania-spinosa-kernel-oil": ("摩洛哥西南部阿甘树林区", "Argan groves of southwest Morocco"),
    "arnica-montana-flower-extract": ("欧洲中部山区", "Mountain regions of Central Europe"),
    "artemisia-princeps-leaf-extract": ("中国湖北蕲春与日本", "Qichun in Hubei, China, and Japan"),
    "astragalus-membranaceus-root-extract": ("中国山西、内蒙古与甘肃", "Shanxi, Inner Mongolia and Gansu, China"),
    "bambusa-vulgaris-extract": ("中国南方与东南亚竹产区", "Bamboo regions of southern China and Southeast Asia"),
    "betula-alba-juice": ("中国东北、北欧与俄罗斯", "Northeast China, Northern Europe and Russia"),
    "butyrospermum-parkii-butter": ("西非萨赫勒地带(加纳、布基纳法索)", "The West African Sahel (Ghana, Burkina Faso)"),
    "calendula-officinalis-flower-extract": ("东欧与地中海地区", "Eastern Europe and the Mediterranean"),
    "camellia-oleifera-seed-oil": ("中国湖南、江西与广西", "Hunan, Jiangxi and Guangxi, China"),
    "citrus-aurantium-amara-flower-oil": ("突尼斯、摩洛哥与埃及", "Tunisia, Morocco and Egypt"),
    "citrus-aurantium-bergamia-fruit-oil": ("意大利卡拉布里亚", "Calabria, Italy"),
    "curcuma-longa-root-extract": ("印度与中国西南", "India and southwest China"),
    "ginkgo-biloba-leaf-extract": ("中国江苏、山东与湖北", "Jiangsu, Shandong and Hubei, China"),
    "hamamelis-virginiana-leaf-extract": ("北美东部", "Eastern North America"),
    "hippophae-rhamnoides-fruit-oil": ("中国西北与蒙古高原", "Northwest China and the Mongolian Plateau"),
    "lavandula-angustifolia-oil": ("法国普罗旺斯与保加利亚", "Provence, France, and Bulgaria"),
    "linum-usitatissimum-linseed-seed-extract": ("加拿大、中国内蒙古与新疆", "Canada, Inner Mongolia and Xinjiang, China"),
    "melaleuca-alternifolia-leaf-oil": ("澳大利亚新南威尔士北部", "Northern New South Wales, Australia"),
    "mentha-piperita-oil": ("美国、印度与中国江苏", "United States, India and Jiangsu, China"),
    "oenothera-biennis-oil": ("中国东北与北美", "Northeast China and North America"),
    "oryza-sativa-bran-oil": ("中国、印度与东南亚稻作区", "Rice-growing regions of China, India and Southeast Asia"),
    "paeonia-lactiflora-root-extract": ("中国安徽亳州与浙江", "Bozhou in Anhui, and Zhejiang, China"),
    "perilla-ocymoides-seed-oil": ("中国东北、韩国与日本", "Northeast China, Korea and Japan"),
    "pinus-pinaster-bark-extract": ("法国朗德海岸松林", "The Landes maritime pine forest, France"),
    "platycodon-grandiflorum-root-extract": ("中国东北与韩国", "Northeast China and Korea"),
    "polygonum-cuspidatum-root-extract": ("中国湖北、江西与陕西", "Hubei, Jiangxi and Shaanxi, China"),
    "punica-granatum-fruit-extract": ("伊朗、土耳其与中国新疆", "Iran, Türkiye and Xinjiang, China"),
    "rosa-canina-fruit-oil": ("智利、保加利亚与中国西北", "Chile, Bulgaria and northwest China"),
    "rosa-damascena-flower-oil": ("保加利亚玫瑰谷与土耳其伊斯帕尔塔", "The Rose Valley of Bulgaria and Isparta, Türkiye"),
    "rosmarinus-officinalis-leaf-extract": ("地中海沿岸与中国西南", "The Mediterranean coast and southwest China"),
    "salix-alba-bark-extract": ("欧洲与中国北方河岸带", "Riparian zones of Europe and northern China"),
    "salvia-miltiorrhiza-root-extract": ("中国山东、河南与陕西", "Shandong, Henan and Shaanxi, China"),
    "santalum-album-oil": ("印度迈索尔与澳大利亚西部", "Mysore, India, and Western Australia"),
    "simmondsia-chinensis-seed-oil": ("美国西南部与墨西哥索诺拉沙漠", "The Sonoran Desert of the southwestern US and Mexico"),
    "vaccinium-myrtillus-fruit-extract": ("北欧与东欧森林", "Forests of Northern and Eastern Europe"),
    "vitis-vinifera-seed-extract": ("法国、意大利与中国宁夏", "France, Italy and Ningxia, China"),
}

PART = [
    ("Root", "根", "root"), ("Leaf", "叶", "leaf"), ("Flower", "花", "flower"),
    ("Fruit", "果实", "fruit"), ("Seed", "种子", "seed"), ("Bark", "树皮", "bark"),
    ("Kernel", "果仁", "kernel"), ("Bran", "麸皮", "bran"), ("Juice", "汁液", "juice"),
    ("Butter", "果脂", "butter"), ("Oil", "全株或果实", "plant"),
]


def latin(inci: str) -> str:
    """从 INCI 里取属种名:去掉俗名括号,再砍掉部位与形态词。"""
    s = re.sub(r"\([^)]*\)", " ", inci or "")
    words = s.split()
    keep = []
    STOP = {"Extract", "Oil", "Juice", "Powder", "Water", "Butter", "Gum", "Ferment",
            "Root", "Leaf", "Flower", "Fruit", "Seed", "Bark", "Kernel", "Bran",
            "Filtrate", "Lysate", "Rhizome", "Stem", "Whole"}
    for w in words:
        if w in STOP:
            break
        keep.append(w)
    if len(keep) >= 2:
        return f"{keep[0]} {keep[1].lower()}"
    return " ".join(keep) or (inci or "")


def part_of(inci: str) -> tuple:
    for en, zh, _ in PART:
        if re.search(rf"\b{en}\b", inci or ""):
            return zh, en.lower()
    return "", ""


def build():
    have = {r["slug"] for r in d1(
        f"SELECT slug FROM pages WHERE site_id='{SITE}' AND slug LIKE '{PARENT_SLUG}/%'")}
    rows = d1("SELECT slug, name_zh, inci, family, functions, mechanism_zh, cost_band "
              "FROM ingredients WHERE status='published' "
              "AND family IN ('植物提取物','精油','植物油脂','多酚','多糖') ORDER BY slug")
    out = []
    for r in rows:
        if r["slug"] in NOT_A_FARM:
            continue
        # 基地页的 slug 用原料 slug 的头两段,和现有 origin/ginseng 这种短名一致
        short = ALIAS.get(r["slug"]) or "-".join(r["slug"].split("-")[:2])
        if f"{PARENT_SLUG}/{short}" in have:
            continue
        if any(o["short"] == short for o in out):
            short = "-".join(r["slug"].split("-")[:3])
        out.append({**r, "short": short,
                    "latin": latin(r["inci"]), "part_zh": part_of(r["inci"])[0],
                    "region": REGION.get(r["slug"])})
    return out


def blocks_for(p: dict, zh: bool) -> list:
    name = p["name_zh"] if zh else p["inci"]
    reg = (p["region"] or ("", ""))[0 if zh else 1]
    mech = (p["mechanism_zh"] or "").strip()
    use_zh = mech.split("。")[0][:60] if mech else ""
    fns = [x.strip() for x in (p["functions"] or "").split(",") if x.strip()][:3]
    matrix = []
    if zh:
        matrix.append({"title": "学名", "desc": p["latin"]})
        if reg:
            matrix.append({"title": "常规产区", "desc": reg})
        if p["part_zh"]:
            matrix.append({"title": "入料部位", "desc": p["part_zh"]})
        matrix.append({"title": "INCI 名称", "desc": p["inci"]})
        if use_zh:
            matrix.append({"title": "常见应用方向", "desc": use_zh})
    else:
        matrix.append({"title": "Botanical name", "desc": p["latin"]})
        if reg:
            matrix.append({"title": "Typical growing regions", "desc": reg})
        matrix.append({"title": "INCI name", "desc": p["inci"]})
        if fns:
            matrix.append({"title": "Common use", "desc": ", ".join(fns)})

    if zh:
        return [
            ("hero", 10, {"eyebrow": "原料溯源", "title": f"{name} · {p['latin']}",
                          "body": use_zh or f"{name}在配方中的常见用法见原料库条目。",
                          "ctaText": "发起询盘", "ctaHref": "/zh-cn/contact/"}),
            ("matrix", 30, {"title": "原料档案",
                            "intro": "以下为该植物的通用信息,可公开查证。",
                            "items": matrix}),
            ("statement", 40, {"eyebrow": "这一味的关键", "tone": "sand", "body": "",
                               "title": "同一味植物,产区、采收期与提取方式不同,活性物含量能差出几倍。"
                                        "我们按批检测后再定投料量,不按标称值直接用。"}),
            ("prose", 50, {"body": "【待运营在后台补充】本味原料的帛卉合作基地信息:"
                                   "地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n"
                                   "这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,"
                                   "采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}),
            ("inquiry", 60, {"title": f"需要{name}的检测报告?",
                             "body": "按批出具活性物含量、农残与重金属检测。",
                             "ctaText": "发起询盘"}),
        ]
    return [
        ("hero", 10, {"eyebrow": "Ingredient sourcing", "title": p["latin"],
                      "body": f"{p['inci']} — see the ingredient library entry for formulation notes.",
                      "ctaText": "Start an enquiry", "ctaHref": "/en/contact/"}),
        ("matrix", 30, {"title": "Ingredient file",
                        "intro": "Publicly verifiable general information on this plant.",
                        "items": matrix}),
        ("statement", 40, {"eyebrow": "What matters here", "tone": "sand", "body": "",
                           "title": "Growing region, harvest window and extraction method can shift active "
                                    "content several-fold. We test each lot before setting the dosing, "
                                    "rather than working from the nominal figure."}),
        ("prose", 50, {"body": "[To be completed by the team in the CMS] BIOSPHERE partner-farm details for "
                               "this material: plot location, area, GAP or organic certificate number, "
                               "current harvest dates, lot test report numbers.\n\n"
                               "This section is deliberately empty. Altitude and acreage invented by a "
                               "system collapse the moment a buyer checks them — a far bigger loss than "
                               "\"not filled in yet\"."}),
        ("inquiry", 60, {"title": "Need lot test reports for this material?",
                         "body": "Active content, pesticide residue and heavy metals, reported per lot.",
                         "ctaText": "Start an enquiry"}),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    items = build()
    now = d1(f"SELECT COUNT(*) n FROM pages WHERE site_id='{SITE}' AND slug LIKE '{PARENT_SLUG}/%'")
    cur = now[0]["n"] if now else 0
    no_region = [p for p in items if not p["region"]]
    print(f"现有基地页 {cur} 个 · 本次新建 {len(items)} 个 · 完成后 {cur + len(items)} 个")
    print(f"  其中没有产区口径的 {len(no_region)} 个(matrix 会少一行,不编产区)")
    for p in items[:5]:
        print(f"    {p['short']:<22} {p['name_zh'][:14]:<14} {p['latin'][:28]:<28} "
              f"{(p['region'] or ['—'])[0][:18]}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    pid0 = int(d1("SELECT MAX(id) m FROM pages")[0]["m"]) + 1
    bid0 = int(d1("SELECT MAX(id) m FROM blocks")[0]["m"]) + 1
    parent = d1(f"SELECT id FROM pages WHERE site_id='{SITE}' AND slug='{PARENT_SLUG}'")[0]["id"]
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_origin-pages.sql")
    bid = bid0
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for k, p in enumerate(items):
            pid = pid0 + k
            slug = f"{PARENT_SLUG}/{p['short']}"
            fh.write(
                f"INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, "
                f"status, updated_at) VALUES ({pid}, '{SITE}', {q(slug)}, {parent}, 'standard', 0, "
                f"{1200 + k}, 'published', datetime('now')) ON CONFLICT(id) DO UPDATE SET "
                f"slug=excluded.slug, parent_id=excluded.parent_id, status='published';\n")
            for lang, nav, title in (
                    ("zh-cn", p["name_zh"], f"{p['name_zh']} {p['latin']} · 产地溯源"),
                    ("en", p["latin"], f"{p['latin']} · ingredient sourcing")):
                fh.write(
                    f"INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES "
                    f"({pid}, {q(lang)}, {q(nav)}, {q(title)}, {q(title)}) "
                    f"ON CONFLICT(page_id, lang) DO UPDATE SET nav_label=excluded.nav_label, "
                    f"title=excluded.title;\n")
            for typ, order, _ in blocks_for(p, True):
                fh.write(
                    f"INSERT INTO blocks (id, page_id, type, sort_order, is_visible, config_json, "
                    f"updated_at) VALUES ({bid}, {pid}, {q(typ)}, {order}, "
                    f"{0 if typ == 'prose' else 1}, '{{}}', datetime('now')) "
                    f"ON CONFLICT(id) DO UPDATE SET type=excluded.type, sort_order=excluded.sort_order;\n")
                for lang, is_zh in (("zh-cn", True), ("en", False)):
                    data = next(d for t, _o, d in blocks_for(p, is_zh) if t == typ)
                    fh.write(
                        f"INSERT INTO block_i18n (block_id, lang, data_json) VALUES "
                        f"({bid}, {q(lang)}, {q(json.dumps(data, ensure_ascii=False))}) "
                        f"ON CONFLICT(block_id, lang) DO UPDATE SET data_json=excluded.data_json;\n")
                bid += 1
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    n = d1(f"SELECT COUNT(*) n FROM pages WHERE site_id='{SITE}' AND slug LIKE '{PARENT_SLUG}/%' "
           f"AND status='published'")
    print(f"完成:基地页 {n[0]['n']} 个")


if __name__ == "__main__":
    main()
