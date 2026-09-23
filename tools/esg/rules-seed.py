"""ESG 全绿规则种子(2026-09-18 创始人:「开发部是需要符合 ESG 规范全绿的配方,看看怎么样对应法规要求」;总工 09-17「客户都要求全绿合规,按美丽修行那种标准」)。

规则写成 Python 列表 → 生成 tools/_esg_seed.sql(DELETE standard 再 INSERT)→ d1_exec。字段同表 esg_rules(0089)。
四支柱:regulatory 法规 / environment 环境 / social 社会 / safety 安全。每条 basis = 法规名 + 条款;
拿不准的 effective_from 留空、note 标 ③;所有 note 末尾统一「以最新官方文本为准」。条款号不确定就只写法规名,不编。
registry 类 pattern 带斜杠('eu-annex:II/')——不带会让 II 撞上 III(inci_catalog.no 形如 'II/123'、'CN-111/1')。
动物实验(EU 2013 起禁售动物实验化妆品;中国 2021 一般化妆品可免)是法规层面不是原料规则,不进表,写在文档。
用法:python tools/esg/rules-seed.py [--dry](--dry 只生成 SQL 不灌)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _bohui import d1_exec, d1, _q

STD = "bohui-esg-v1"
RULES = []

def R(pillar, mt, pattern, sev, title, reason, basis, url, scope="ALL", applies="all", eff=None, limit=None, note=""):
    RULES.append(dict(pillar=pillar, scope=scope, applies=applies, match_type=mt, pattern=pattern, severity=sev,
                      title_zh=title, reason_zh=reason, basis=basis, basis_url=url, effective_from=eff, limit_pct=limit,
                      note=(note + ";" if note else "") + "以最新官方文本为准"))

# ───────── ① regulatory 法规:目标市场目录命中(限量数字在 inci_catalog.note 文本,由 esgCheck 抽) ─────────
NMPA = "https://www.nmpa.gov.cn"; EURLEX = "https://eur-lex.europa.eu"
R("regulatory", "registry", "cn-stsc:CN-109/", "red", "中国禁用原料", "命中《化妆品禁用原料目录》,中国市场不得使用",
  "《化妆品禁用原料目录》(NMPA 2021 年第 74 号公告)", NMPA, scope="cn", eff="2021-05-28")
R("regulatory", "registry", "cn-stsc:CN-110/", "red", "中国禁用植(动)物原料", "命中《化妆品禁用植(动)物原料目录》,中国市场不得使用",
  "《化妆品禁用植(动)物原料目录》(NMPA 2021 年第 74 号公告)", NMPA, scope="cn", eff="2021-05-28")
R("regulatory", "registry", "cn-stsc:CN-111/", "yellow", "中国限用组分", "命中《化妆品安全技术规范》限用组分表,须核最大允许浓度与使用条件",
  "《化妆品安全技术规范》(2015 年版)第三章 表 3 限用组分", NMPA, scope="cn", note="限量与适用范围见目录 note;抽不出数字判需人工核")
R("regulatory", "registry", "cn-stsc:CN-112/", "yellow", "中国准用防腐剂(限量)", "准用防腐剂有最大允许浓度与标签要求",
  "《化妆品安全技术规范》(2015 年版)第三章 表 4 准用防腐剂", NMPA, scope="cn", note="限量见目录 note")
R("regulatory", "registry", "cn-stsc:CN-113/", "yellow", "中国准用防晒剂(限量)", "准用防晒剂有最大允许浓度",
  "《化妆品安全技术规范》(2015 年版)第三章 表 5 准用防晒剂", NMPA, scope="cn", note="限量见目录 note")
R("regulatory", "registry", "cn-stsc:CN-114/", "yellow", "中国准用着色剂(使用范围)", "准用着色剂按使用范围分栏(眼部/一般/淋洗),须核范围",
  "《化妆品安全技术规范》(2015 年版)第三章 表 6 准用着色剂", NMPA, scope="cn", note="核使用范围栏,不是浓度")
R("regulatory", "registry", "cn-stsc:CN-115/", "yellow", "中国准用染发剂(限量)", "准用染发剂有最大允许浓度与警示语",
  "《化妆品安全技术规范》(2015 年版)第三章 表 7 准用染发剂", NMPA, scope="cn", note="限量见目录 note")
R("regulatory", "registry", "eu-annex:II/", "red", "欧盟禁用物质(Annex II)", "命中 (EC) 1223/2009 附录 II 禁用清单,欧盟市场不得使用",
  "Regulation (EC) No 1223/2009 Annex II", EURLEX, scope="eu")
R("regulatory", "registry", "eu-annex:III/", "yellow", "欧盟限用物质(Annex III)", "附录 III 限用:有最大浓度、产品类型与标签措辞",
  "Regulation (EC) No 1223/2009 Annex III", EURLEX, scope="eu", note="限量与条件见目录 note;抽不出数字判需人工核")
R("regulatory", "registry", "eu-annex:IV/", "yellow", "欧盟准用着色剂(Annex IV)", "附录 IV 着色剂按产品类型分栏,须核使用范围",
  "Regulation (EC) No 1223/2009 Annex IV", EURLEX, scope="eu", note="核使用范围栏")
R("regulatory", "registry", "eu-annex:V/", "yellow", "欧盟准用防腐剂(Annex V,限量)", "附录 V 防腐剂有最大浓度与标签义务",
  "Regulation (EC) No 1223/2009 Annex V", EURLEX, scope="eu", note="限量见目录 note")
R("regulatory", "registry", "eu-annex:VI/", "yellow", "欧盟准用 UV 滤剂(Annex VI,限量)", "附录 VI UV 滤剂有最大浓度",
  "Regulation (EC) No 1223/2009 Annex VI", EURLEX, scope="eu", note="限量见目录 note")
R("regulatory", "registry", "asean-acd:", "yellow", "东盟目录命中(需核)", "命中 ASEAN Cosmetic Directive 附录(禁用/限用/准用),须核对应附录与限量",
  "ASEAN Cosmetic Directive Annexes II–VII", "https://asean.org", scope="asean", note="③ 附录归属看目录 note")
R("regulatory", "registry", "br-anvisa:", "yellow", "巴西 ANVISA 目录命中(需核)", "命中 ANVISA 化妆品原料清单(禁用/限用/准用),须核",
  "ANVISA 化妆品原料清单(RDC 决议)", "https://www.gov.br/anvisa", scope="br", note="③ 决议号见目录 source")
R("regulatory", "registry", "id-bpom:", "yellow", "印尼 BPOM 目录命中(需核)", "命中 BPOM 化妆品原料技术要求清单,须核",
  "Peraturan BPOM 化妆品原料技术要求", "https://www.pom.go.id", scope="id", note="③ 法规号见目录 source")
R("regulatory", "registry", "kr-safety:", "yellow", "韩国安全基准命中(需核)", "命中 MFDS《化妆品安全基准等相关规定》,须核禁用/限用",
  "화장품 안전기준 등에 관한 규정(MFDS 告示)", "https://www.mfds.go.kr", scope="kr", note="③ 告示号见目录 source")
R("regulatory", "registry", "jp-std:", "yellow", "日本化妆品基准命中(需核)", "命中《化粧品基準》禁用/限用/防腐剂·UV·着色配合限度",
  "化粧品基準(平成 12 年厚生省告示第 331 号)", "https://www.mhlw.go.jp", scope="jp", note="③")
R("regulatory", "registry", "us-fda:", "yellow", "美国 FDA 禁限用/色素命中(需核)", "命中 21 CFR 700 禁限用或 21 CFR 73/74 色素清单,须核",
  "21 CFR Part 700 Subpart B;21 CFR Parts 73/74", "https://www.ecfr.gov", scope="us")
R("regulatory", "registry", "ca-hotlist:", "yellow", "加拿大 Hotlist 命中(需核)", "命中 Health Canada Cosmetic Ingredient Hotlist(禁用或限用),须核",
  "Health Canada Cosmetic Ingredient Hotlist", "https://www.canada.ca", scope="ca")

# ───────── ② environment 环境 ─────────
ECHA = "https://echa.europa.eu"
MICRO = ["POLYETHYLENE", "POLYPROPYLENE", "POLYSTYRENE", "NYLON-6", "NYLON-12", "NYLON-66", "POLYMETHYL METHACRYLATE",
         "POLYETHYLENE TEREPHTHALATE", "POLYBUTYLENE TEREPHTHALATE", "ETHYLENE/ACRYLIC ACID COPOLYMER", "POLYURETHANE-11", "POLYMETHYLSILSESQUIOXANE"]
MP_BASIS = "Commission Regulation (EU) 2023/2055(REACH Annex XVII entry 78,淋洗类微珠 2023-10-17 起禁);《关于进一步加强塑料污染治理的意见》(发改环资〔2020〕80 号,2022 年底禁售含塑料微珠日化品)"
for k in MICRO:   # 固体微粒常见者:淋洗类 eu/cn 红
    R("environment", "key", k, "red", "塑料微珠(淋洗类禁用)", "合成聚合物微粒,淋洗类产品欧盟/中国已禁",
      MP_BASIS, ECHA, scope="eu,cn", applies="rinse-off", eff="2023-10-17", note="中国 2022-12-31 起禁售")
R("environment", "regex", "^(" + "|".join(MICRO) + ")$", "yellow", "微塑料嫌疑(驻留类分期禁)", "驻留类 2027-10-17 淋洗其它/2029-10-17 驻留/2035-10-17 彩妆唇部指甲分期禁,现即应替代",
  "Commission Regulation (EU) 2023/2055(REACH Annex XVII entry 78 过渡期)", ECHA, note="③ 分期日期以条目文本为准")
R("environment", "regex", r"^(ACRYLATES COPOLYMER|STYRENE/ACRYLATES COPOLYMER|ACRYLATES/[A-Z0-9 ,-]+ (COPOLYMER|CROSSPOLYMER)|POLYACRYLATE-\d+|POLYVINYL ACETATE)$",
  "yellow", "成膜聚合物需核是否固体微粒", "溶液/乳液型成膜剂不一定属微塑料,须向供应商核物理形态与可溶性(REACH 78 豁免水溶/可降解)",
  "Commission Regulation (EU) 2023/2055(REACH Annex XVII entry 78 定义与豁免)", ECHA, note="③ 供应商出具微塑料声明")
SIL_BASIS = "Commission Regulation (EU) 2018/35(REACH Annex XVII entry 70:淋洗类 D4/D5 ≤0.1% 自 2020-01-31);(EU) 2024/1328(D6 淋洗及 D4/D5/D6 驻留 ≤0.1% 自 2027-06-06)"
for k in ["CYCLOTETRASILOXANE", "CYCLOPENTASILOXANE", "CYCLOMETHICONE"]:
    R("environment", "key", k, "red", "环状硅氧烷 D4/D5 淋洗超限", "淋洗类 D4/D5 ≤0.1%(w/w),超限欧盟禁售", SIL_BASIS, ECHA, scope="eu", applies="rinse-off", eff="2020-01-31", limit=0.1,
      note="≤0.1% 时降 yellow")
R("environment", "key", "CYCLOHEXASILOXANE", "yellow", "环状硅氧烷 D6 淋洗(2027 起 ≤0.1%)", "淋洗类 D6 自 2027-06-06 ≤0.1%", SIL_BASIS, ECHA, scope="eu", applies="rinse-off", eff="2027-06-06", limit=0.1)
for k in ["CYCLOTETRASILOXANE", "CYCLOPENTASILOXANE", "CYCLOHEXASILOXANE", "CYCLOMETHICONE"]:
    R("environment", "key", k, "yellow", "环状硅氧烷 驻留类 2027-06-06 起 ≤0.1%", "驻留类 D4/D5/D6 自 2027-06-06 ≤0.1%,现即应替代", SIL_BASIS, ECHA, scope="eu", applies="leave-on", eff="2027-06-06", limit=0.1)
PFAS_RE = r"PERFLUORO|POLYFLUORO|FLUOROALCOHOL|\bPTFE\b|POLYTETRAFLUOROETHYLENE|C\d+-\d+ FLUORO|FLUOROTELOMER"
R("environment", "regex", PFAS_RE, "red", "PFAS 州级/法国禁用", "加州 2025-01-01 起化妆品禁含有意添加 PFAS;法国 2026-01-01 起化妆品禁",
  "California AB 2771 (Health & Safety Code §108981.5);法国反 PFAS 法(2025 年 2 月通过)", "https://leginfo.legislature.ca.gov", scope="us-ca,fr", eff="2025-01-01", note="③ 法国法律编号与生效以官方公报为准;加州为州级")
R("environment", "regex", PFAS_RE, "yellow", "PFAS 其它州级禁令", "科罗拉多/明尼苏达/华盛顿 2025 起禁化妆品有意添加 PFAS;缅因 2030",
  "Colorado HB22-1345;Minnesota HF 2310 (Amara's Law);Washington HB 1047 (Toxic-Free Cosmetics Act);Maine LD 1503", "https://leg.colorado.gov", scope="us", note="③ 州级,各州条款以官方文本为准")
R("environment", "regex", PFAS_RE, "yellow", "PFAS(持久性,通用限制审议中)", "全氟/多氟物质持久累积,EU 通用 PFAS 限制提案审议中,客户 ESG 普遍排除",
  "ECHA 通用 PFAS 限制提案(REACH Annex XVII,审议中)", ECHA, note="③")
HI = "Hawaii Act 104, Session Laws of Hawaii 2018(SB 2571),2021-01-01 起禁售含 oxybenzone/octinoxate 防晒"
PALAU = "Palau Responsible Tourism Education Act 2018(RPPL 10-14),2020-01-01 起禁 10 种「珊瑚礁毒性」成分"
for k in ["BENZOPHENONE-3", "OXYBENZONE", "ETHYLHEXYL METHOXYCINNAMATE", "OCTINOXATE"]:
    R("environment", "key", k, "red", "珊瑚礁禁用 UV 滤剂(夏威夷/帕劳)", "夏威夷与帕劳禁售含此 UV 滤剂的防晒品", HI + ";" + PALAU, "https://www.capitol.hawaii.gov",
      scope="us-hi,palau", applies="sunscreen", eff="2020-01-01", note="州级/属地级")
for k in ["OCTOCRYLENE", "4-METHYLBENZYLIDENE CAMPHOR"]:
    R("environment", "key", k, "red", "帕劳禁用 UV 滤剂", "帕劳禁售", PALAU, "https://www.palaugov.pw", scope="palau", applies="sunscreen", eff="2020-01-01")
for k in ["TRICLOSAN", "METHYLPARABEN", "ETHYLPARABEN", "BUTYLPARABEN", "BENZYLPARABEN", "PHENOXYETHANOL"]:
    R("environment", "key", k, "red", "帕劳禁用成分", "帕劳 10 种珊瑚礁毒性成分之一", PALAU, "https://www.palaugov.pw", scope="palau", applies="sunscreen", eff="2020-01-01")
R("environment", "regex", "^(BENZOPHENONE-3|OXYBENZONE|ETHYLHEXYL METHOXYCINNAMATE|OCTINOXATE|OCTOCRYLENE|4-METHYLBENZYLIDENE CAMPHOR)$", "yellow",
  "reef-unsafe UV 滤剂", "夏威夷/帕劳/美属维京群岛/Key West/泰国国家公园/阿鲁巴/博奈尔等地禁售,客户「珊瑚礁友好」宣称不通过",
  HI + ";" + PALAU + ";US Virgin Islands Act 8185", "https://www.capitol.hawaii.gov", note="③ 各地清单以官方文本为准")
for k in ["EDTA", "DISODIUM EDTA", "TRISODIUM EDTA", "TETRASODIUM EDTA", "CALCIUM DISODIUM EDTA"]:
    R("environment", "key", k, "yellow", "EDTA 难生物降解", "EU Ecolabel 淋洗类化妆品排除 EDTA 及其盐;替代 GLDA / 植酸钠 / EDDS",
      "Commission Decision (EU) 2021/1870(EU Ecolabel 化妆品与动物护理品,Criterion 3 排除/限用物质)", EURLEX, note="③ 非法规禁用,严格档")
for k in ["TRICLOSAN", "TRICLOCARBAN"]:
    R("environment", "key", k, "yellow", "三氯生/三氯卡班(水环境+争议)", "水生毒性与耐药争议;美国 FDA 已禁用于消费者抗菌洗剂;欧盟 Annex V 严格限量",
      "FDA Final Rule 2016(21 CFR 310.545 消费者抗菌洗剂);Regulation (EC) 1223/2009 Annex V", "https://www.ecfr.gov", eff="2017-09-06", note="③")
R("environment", "key", "BHT", "yellow", "BHT 内分泌干扰疑虑(欧盟已限量)", "欧盟 2024 年起对 BHT 设限量(漱口水/牙膏/其它);客户 ESG 常排除",
  "Regulation (EU) 2024/996(Annex III 增列 BHT)", EURLEX, note="③ 限量与过渡期以条目文本为准")
R("environment", "key", "BHA", "yellow", "BHA 致癌疑虑", "IARC 2B;加州 Prop 65 清单;客户 ESG 常排除",
  "California Proposition 65 清单;IARC Monographs", "https://oehha.ca.gov", note="③")
R("environment", "regex", r"^PEG-\d|\bPEG\b|^PPG-\d|ETH-\d|POLYSORBATE|LAURETH|CETEARETH|STEARETH|OLETH|CETETH|TRIDECETH|PARETH|POLOXAMER", "yellow",
  "乙氧基化物(严格档)", "环氧乙烷工艺副产 1,4-二噁烷;COSMOS 排除;纽约州限 1,4-二噁烷残留",
  "COSMOS Standard(乙氧基化不允许);New York ECL §37-0117(1,4-dioxane 淋洗类 ≤1 ppm、驻留类 ≤10 ppm)", "https://www.cosmos-standard.org", note="非法规禁用;严格档")
for k in ["PETROLATUM", "MINERAL OIL", "PARAFFINUM LIQUIDUM", "PARAFFIN", "MICROCRYSTALLINE WAX", "CERA MICROCRISTALLINA", "ISOPARAFFIN", "C13-14 ISOPARAFFIN", "OZOKERITE", "CERESIN"]:
    R("environment", "key", k, "yellow", "化石来源(严格档)", "矿物油/石蜡类为石油来源,COSMOS 排除,ISO 16128 不计天然指数",
      "COSMOS Standard;ISO 16128-1:2016 / 16128-2:2017", "https://www.cosmos-standard.org", note="非法规禁用;严格档")

# ───────── ③ social 社会 ─────────
R("social", "tag", "animal-derived", "red", "动物来源(纯素不通过)", "羊毛脂/蜂蜡/胭脂虫红/胶原/角蛋白/丝/蜂蜜/牛脂/明胶等动物来源,纯素标准不通过",
  "The Vegan Society Trademark Standards;PETA Beauty Without Bunnies(非法规)", "https://www.vegansociety.com",
  note="仅 constraints.vegan 或 ESG 严格档判 red,基础档降 yellow「来源需核」")
R("social", "regex", r"COLLAGEN|KERATIN|ELASTIN|GELATIN|PLACENTA|ROYAL JELLY|CHOLESTEROL|LANOLIN|TALLOW|CARMINE|CI 75470|BEESWAX|CERA ALBA|CERA FLAVA|SERICIN|\bSILK\b|CASEIN|LACTOFERRIN|\bSNAIL\b|\bEGG\b|\bLAC\b|\bPEARL\b|\bMEL\b|SHELLAC|AMBERGRIS|CIVET",
  "red", "动物来源(纯素不通过,键补充)", "同上,补 tag 未覆盖的水解胶原/蜗牛/珍珠/壳聚糖等",
  "The Vegan Society Trademark Standards(非法规)", "https://www.vegansociety.com", note="仅 constraints.vegan 或严格档 red,基础档 yellow;甘油/硬脂酸等「来源需核」不判红")
R("social", "regex", r"MILK|CHITOSAN", "yellow", "乳/壳聚糖来源需核(动物或植物)", "MILK 可为植物乳(椰子/燕麦)也可为动物乳,CHITOSAN 多为甲壳来源亦有真菌来源;纯素项目需供应商说明来源", "Vegan Society / V-Label 定义(认证标准,非法规)", "https://www.vegansociety.com", note="09-18 抽审新增;非法规,需证书;以最新官方文本为准")
R("social", "key", "SQUALENE", "yellow", "鲨烯来源需核(鲨鱼/橄榄)", "SQUALENE 可来自鲨鱼肝油或橄榄;非橄榄/甘蔗来源纯素不通过,需供应商来源声明",
  "The Vegan Society Trademark Standards(非法规)", "https://www.vegansociety.com", note="来源声明为橄榄/甘蔗则绿")
for k in ["MICA", "CI 77019"]:
    R("social", "key", k, "yellow", "云母需供应商 RMI 声明(童工风险)", "印度/马达加斯加云母矿童工风险;需 Responsible Mica Initiative 成员或可追溯声明",
      "Responsible Mica Initiative 供应链标准;Regulation (EU) 2024/3015(禁强迫劳动产品,2027-12-14 起适用)", "https://responsible-mica-initiative.com", note="③ 需声明,不判红")
PALM = ["CETEARYL ALCOHOL", "CETYL ALCOHOL", "STEARYL ALCOHOL", "GLYCERYL STEARATE", "GLYCERYL STEARATE SE", "STEARIC ACID", "PALMITIC ACID", "MYRISTIC ACID", "LAURIC ACID",
        "SODIUM LAURYL SULFATE", "SODIUM LAURETH SULFATE", "CAPRYLIC/CAPRIC TRIGLYCERIDE", "COCAMIDOPROPYL BETAINE", "SODIUM COCOYL ISETHIONATE", "SODIUM LAUROYL SARCOSINATE",
        "SODIUM COCOYL GLUTAMATE", "DECYL GLUCOSIDE", "COCO-GLUCOSIDE", "LAURYL GLUCOSIDE", "CETEARYL GLUCOSIDE", "ETHYLHEXYL PALMITATE", "ISOPROPYL PALMITATE", "ISOPROPYL MYRISTATE",
        "SORBITAN STEARATE", "SODIUM STEARATE", "MAGNESIUM STEARATE", "ZINC STEARATE", "GLYCERYL CAPRYLATE", "ELAEIS GUINEENSIS OIL", "ELAEIS GUINEENSIS KERNEL OIL"]
for k in PALM:   # 甘油刻意不进:几乎每个配方都有,进了永远不绿;来源在采购端核
    R("social", "key", k, "yellow", "棕榈衍生物需 RSPO 证书", "常见棕榈仁/棕榈油衍生物,客户 ESG 要求 RSPO(MB/SG)证书或供应商来源声明",
      "RSPO Supply Chain Certification Standard;Regulation (EU) 2023/1115(EUDR,棕榈油及衍生物为覆盖商品)", "https://rspo.org", note="③ EUDR 适用日期有推迟;需证书,不判红")

# ───────── ④ safety 安全 ─────────
R("safety", "tag", "allergen26", "yellow", "致敏香精成分(标签义务)", "26 种致敏香料成分超阈值须标示(驻留 0.001%/淋洗 0.01%);2026-07-31 起扩至 80 余种",
  "Regulation (EC) 1223/2009 Annex III(26 项致敏原条目);Regulation (EU) 2023/1545(新增致敏原,2026-07-31 起投放/2028-07-31 起全部)", EURLEX, eff=None, note="标签义务不是禁用 → yellow")
R("safety", "tag", "fragrance", "yellow", "香精需核 26/80 致敏原", "PARFUM/FRAGRANCE 须向香精供应商索 IFRA 证书与致敏原清单核标签",
  "Regulation (EC) 1223/2009 Art. 19(1)(g) 与 Annex III;(EU) 2023/1545", EURLEX)
FR_BASIS = "Regulation (EU) 2022/1181(Annex V 前言:总甲醛 ≥0.001% 须标「释放甲醛」,2022-07-31 起);《化妆品安全技术规范》(2015)表 4(甲醛 >0.05% 须标「含甲醛」)"
for k in ["DMDM HYDANTOIN", "IMIDAZOLIDINYL UREA", "DIAZOLIDINYL UREA", "2-BROMO-2-NITROPROPANE-1,3-DIOL", "SODIUM HYDROXYMETHYLGLYCINATE"]:
    R("safety", "key", k, "yellow", "甲醛释放体(标签义务+致敏)", "释放甲醛,欧盟须标「releases formaldehyde」,美丽修行口径红/黄", FR_BASIS, EURLEX, eff="2022-07-31")
R("safety", "key", "QUATERNIUM-15", "red", "Quaternium-15 欧盟禁用", "已列入 Annex II(CMR),欧盟不得使用;其它市场甲醛释放体 yellow",
  "Regulation (EU) 2019/831(Annex II 增列)", EURLEX, scope="eu", note="③ 条目号以 Annex II 文本为准")
R("safety", "key", "QUATERNIUM-15", "yellow", "甲醛释放体(标签义务+致敏)", "释放甲醛,美丽修行口径红/黄", FR_BASIS, EURLEX)
R("safety", "regex", r"METHYL(CHLORO)?ISOTHIAZOLINONE", "red", "MIT/CMIT 驻留类欧盟禁用", "MIT 驻留类 2017-02-12 起禁;CMIT/MIT 混合物仅限淋洗",
  "Regulation (EU) 2016/1198(MIT 驻留禁);Regulation (EU) No 1003/2014(CMIT/MIT 仅淋洗)", EURLEX, scope="eu", applies="leave-on", eff="2017-02-12")
R("safety", "regex", r"METHYL(CHLORO)?ISOTHIAZOLINONE", "yellow", "MIT/CMIT 淋洗类 ≤0.0015%", "淋洗类 MIT ≤0.0015%(15 ppm);CMIT/MIT 3:1 混合物 ≤0.0015%;超限升 red",
  "Regulation (EU) 2017/1224(MIT 淋洗 0.0015%);Regulation (EU) No 1003/2014(CMIT/MIT 0.0015%)", EURLEX, scope="eu", applies="rinse-off", eff="2018-01-27", limit=0.0015)
R("safety", "regex", r"METHYL(CHLORO)?ISOTHIAZOLINONE", "yellow", "MIT/CMIT 高致敏(中国准用限量)", "强致敏防腐剂,中国表 4 准用有限量与淋洗限制;客户 ESG 普遍排除",
  "《化妆品安全技术规范》(2015)表 4 准用防腐剂", NMPA, scope="cn,us,jp,kr,asean,br,ca", note="限量见 CN-112 目录 note")
R("safety", "tag", "paraben", "yellow", "对羟基苯甲酸酯(限量+争议)", "丙/丁酯合计 ≤0.14%,3 岁以下尿布区驻留禁;客户「无 paraben」宣称常见",
  "Regulation (EU) No 1004/2014(Annex V/12a);《化妆品安全技术规范》(2015)表 4", EURLEX, eff="2015-04-16", note="限量见目录 note")
R("safety", "regex", r"^(ISOPROPYL|ISOBUTYL|PHENYL|BENZYL|PENTYL)PARABEN$", "red", "五种 paraben 欧盟禁用", "异丙/异丁/苯基/苄基/戊基对羟基苯甲酸酯列入 Annex II",
  "Regulation (EU) No 358/2014(Annex II)", EURLEX, scope="eu", eff="2014-10-30")
R("safety", "key", "BUTYLPHENYL METHYLPROPIONAL", "red", "Lilial 欧盟禁用", "CMR 1B,2022-03-01 起 Annex II",
  "Regulation (EU) 2021/1902(Annex II)", EURLEX, scope="eu", eff="2022-03-01")
R("safety", "key", "HYDROXYISOHEXYL 3-CYCLOHEXENE CARBOXALDEHYDE", "red", "HICC(Lyral)欧盟禁用", "强致敏,2019-08-23 起禁投放/2021-08-23 起禁售",
  "Regulation (EU) 2017/1410(Annex II)", EURLEX, scope="eu", eff="2019-08-23")
R("safety", "regex", r"^(ATRANOL|CHLOROATRANOL)$", "red", "Atranol/Chloroatranol 欧盟禁用", "橡苔/树苔中强致敏物,Annex II",
  "Regulation (EU) 2017/1410(Annex II)", EURLEX, scope="eu", eff="2019-08-23")
R("safety", "key", "TALC", "yellow", "滑石粉需石棉检测", "石棉污染风险;美国 FDA 2024 拟规则要求含滑石粉化妆品做石棉检测;欧盟 CLP 致癌分类审议中",
  "FDA Proposed Rule 2024(MoCRA §3505 石棉检测);EU CLP ATP 分类(审议中)", "https://www.fda.gov", note="③ 需供应商石棉检测报告")
R("safety", "regex", r"\bNANO\b", "yellow", "纳米材料需通报与标示", "欧盟纳米材料上市前 6 个月 CPNP 通报,标签成分后加 (nano)",
  "Regulation (EC) 1223/2009 Art. 16 与 Art. 19(1)(g)", EURLEX, scope="eu")

COLS = ["standard", "pillar", "scope", "applies", "match_type", "pattern", "severity", "title_zh", "reason_zh", "basis", "basis_url", "effective_from", "limit_pct", "note", "active"]

def main():
    assert all(r["severity"] in ("red", "yellow") and r["pillar"] in ("regulatory", "environment", "social", "safety") for r in RULES)
    assert all(r["match_type"] in ("key", "prefix", "contains", "regex", "tag", "registry") for r in RULES)
    lines = [f"DELETE FROM esg_rules WHERE standard='{STD}';"]
    for r in RULES:
        row = {**r, "standard": STD, "active": 1}
        vals = ",".join(str(row[c]) if c in ("limit_pct", "active") and row[c] is not None else _q(row[c]) for c in COLS)
        lines.append(f"INSERT INTO esg_rules ({','.join(COLS)}) VALUES ({vals});")
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_esg_seed.sql")
    with open(path, "w", encoding="utf-8") as f: f.write("\n".join(lines) + "\n")
    by = {}
    for r in RULES: by[r["pillar"]] = by.get(r["pillar"], 0) + 1
    print(f"规则 {len(RULES)} 条 {by} → {path}")
    if "--dry" in sys.argv: return
    print("rows_written", d1_exec(path))
    print(d1(f"SELECT pillar, COUNT(*) n FROM esg_rules WHERE standard='{STD}' GROUP BY pillar"))

if __name__ == "__main__":
    main()
