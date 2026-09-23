#!/usr/bin/env python3
"""配方库扩充与规格补齐 —— 把「有多少条」变成「每条有多少个数」。

创始人 2026-09-09:「主要是普通的护肤品,我们化妆品工厂都可以做,
需要先强化配方库的数字,这个才是价值」。

在这之前配方库是 100 条,每条只有:功效标签、活性物、MOQ、交期、可售市场。
采购真正会问而我们答不上来的是另外一批数:
    pH 多少?黏度多少?灌装温度?保质期?打样几天、大货几天?
    防腐体系是什么(客户市场禁 MIT/CMIT 的话直接出局)?
    **这一款在中国算普通化妆品备案,还是特殊化妆品注册?**

最后一条是这次的重点。创始人问「能不能去国家药监局查配方」——
逐条产品的备案记录被阿里云 WAF 挡着(实测见 REPORT),抓不到;
**但药监局的分类规则是公开且确定的**,而采购真正关心的也不是别人的备案号,
是「我这一款要多久能上市」。所以把规则写进库:

    《化妆品监督管理条例》(国令第 727 号,2021-01-01 施行)第十六条 ——
    染发、烫发、祛斑美白、防晒、防脱发,以及宣称新功效的化妆品,
    属特殊化妆品,须经 NMPA 注册后方可生产进口;
    其余为普通化妆品,备案即可。

差别不是文字游戏:备案通常以周计,注册要做人体功效评价 + 技术审评,
按年计。把这条写进每一款配方,采购的排期表当场就能算 —— 这是真数字。

数据纪律:
  · 所有规格仍是**示例规格**(status='sample'),页面已全屏标注,与既有口径一致。
  · pH / 黏度 / 灌装温度 / 保质期取行业常规区间,按剂型给,不按单品编 ——
    给区间而不给单值,因为单值是假精确,而假精确比不给更伤。
  · 活性物一律带 INCI 名。没有 INCI 的不写 —— 中文名不能跨境核对。
  · 不写任何单价。报价按询盘逐单出具,这条纪律全站一致。

跑法:
    python tools/formula-build.py --dry     # 只看会写多少条
    python tools/formula-build.py           # 真写
"""
import sys
import os
import io
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import d1, d1_exec  # noqa: E402

# ── 活性物表 ───────────────────────────────────────────────────────────
# (中文名, INCI, 常规用量区间)。用量取行业常规添加量,不是"最高可用量" ——
# 最高可用量是法规上限,写进产品规格会误导采购以为我们按上限做。
A = {
    "ha":        ("透明质酸钠", "Sodium Hyaluronate", "0.05-0.5%"),
    "ha_multi":  ("多分子量透明质酸", "Sodium Hyaluronate Crosspolymer", "0.5-2%"),
    "gly":       ("甘油", "Glycerin", "3-10%"),
    "pan":       ("泛醇", "Panthenol", "1-5%"),
    "beta":      ("β-葡聚糖", "Beta-Glucan", "0.5-2%"),
    "treh":      ("海藻糖", "Trehalose", "1-3%"),
    "beta_ine":  ("甜菜碱", "Betaine", "1-3%"),
    "nmf":       ("天然保湿因子复配", "Sodium PCA", "0.5-2%"),
    "cer_np":    ("神经酰胺NP", "Ceramide NP", "0.1-1%"),
    "cer_cplx":  ("神经酰胺复配", "Ceramide NP/AP/EOP", "0.3-1.5%"),
    "chol":      ("胆固醇", "Cholesterol", "0.2-0.8%"),
    "sq":        ("角鲨烷", "Squalane", "3-10%"),
    "shea":      ("乳木果油", "Butyrospermum Parkii Butter", "2-8%"),
    "jojoba":    ("霍霍巴籽油", "Simmondsia Chinensis Seed Oil", "2-6%"),
    "nia":       ("烟酰胺", "Niacinamide", "2-5%"),
    "tranex":    ("凝血酸", "Tranexamic Acid", "1-3%"),
    "arb":       ("α-熊果苷", "Alpha-Arbutin", "0.5-2%"),
    "vc_eth":    ("3-O-乙基抗坏血酸", "3-O-Ethyl Ascorbic Acid", "1-3%"),
    "vc_map":    ("抗坏血酸葡糖苷", "Ascorbyl Glucoside", "1-3%"),
    "ferulic":   ("阿魏酸", "Ferulic Acid", "0.3-1%"),
    "reti":      ("视黄醇", "Retinol", "0.05-0.3%"),
    "retinal":   ("视黄醛", "Retinal", "0.02-0.1%"),
    "bakuchiol": ("补骨脂酚", "Bakuchiol", "0.5-1%"),
    "pep_sig":   ("信号肽复配", "Palmitoyl Tripeptide-1", "2-5%"),
    "pep_ach":   ("乙酰基六肽-8", "Acetyl Hexapeptide-8", "2-5%"),
    "adeno":     ("腺苷", "Adenosine", "0.04-0.1%"),
    "toco":      ("生育酚", "Tocopherol", "0.2-1%"),
    "resv":      ("白藜芦醇", "Resveratrol", "0.1-0.5%"),
    "ega":       ("依克多因", "Ectoin", "0.5-2%"),
    "cica":      ("积雪草提取物", "Centella Asiatica Extract", "0.5-3%"),
    "madec":     ("羟基积雪草苷", "Madecassoside", "0.1-0.5%"),
    "bisab":     ("红没药醇", "Bisabolol", "0.2-0.5%"),
    "allan":     ("尿囊素", "Allantoin", "0.2-0.5%"),
    "lico":      ("光果甘草根提取物", "Glycyrrhiza Glabra Root Extract", "0.1-0.5%"),
    "oat":       ("燕麦仁提取物", "Avena Sativa Kernel Extract", "0.5-2%"),
    "sa":        ("水杨酸", "Salicylic Acid", "0.5-2%"),
    "lha":       ("辛酰水杨酸", "Capryloyl Salicylic Acid", "0.1-0.5%"),
    "aha":       ("乳酸/乙醇酸复配", "Lactic Acid, Glycolic Acid", "3-8%"),
    "pha":       ("葡糖酸内酯", "Gluconolactone", "3-8%"),
    "zinc":      ("PCA锌", "Zinc PCA", "0.3-1%"),
    "azel":      ("壬二酸衍生物", "Potassium Azeloyl Diglycinate", "2-5%"),
    "tto":       ("互叶白千层叶油", "Melaleuca Alternifolia Leaf Oil", "0.1-0.5%"),
    "clay":      ("高岭土", "Kaolin", "10-25%"),
    "charcoal":  ("活性炭", "Charcoal Powder", "1-3%"),
    "amino":     ("氨基酸表活复配", "Sodium Cocoyl Glycinate", "10-18%"),
    "apg":       ("烷基糖苷", "Coco-Glucoside", "4-10%"),
    "ctg":       ("辛酸/癸酸甘油三酯", "Caprylic/Capric Triglyceride", "50-80%"),
    "poly80":    ("聚山梨醇酯-80", "Polysorbate 80", "8-15%"),
    "tio2":      ("二氧化钛", "Titanium Dioxide", "5-15%"),
    "zno":       ("氧化锌", "Zinc Oxide", "8-20%"),
    "uvo_chem":  ("有机防晒剂复配", "Ethylhexyl Triazone, Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine", "8-18%"),
    "mica":      ("云母", "Mica", "30-60%"),
    "silica":    ("硅石", "Silica", "5-12%"),
    "wax":       ("蜡体复配", "Cera Alba, Candelilla Cera", "15-28%"),
    "castor":    ("蓖麻籽油", "Ricinus Communis Seed Oil", "30-50%"),
    "probio":    ("乳酸杆菌发酵产物", "Lactobacillus Ferment", "1-5%"),
    "yeast":     ("酵母发酵滤液", "Saccharomyces Ferment Filtrate", "3-10%"),
    "caff":      ("咖啡因", "Caffeine", "0.5-3%"),
    "urea":      ("尿素", "Urea", "3-10%"),
    "menth":     ("薄荷醇", "Menthol", "0.1-0.5%"),
    # ── 草本活性物(2026-09-10 Q4)──────────────────────────
    # INCI 直接取自 ingredients 表,不另起名 —— 两边名字对不上,
    # origin-depth 就反查不到「哪些在册配方用到这一味」,
    # 100 个溯源页里只有 7 页列得出来,就是这么来的。
    "arte_pri": ("艾蒿（叶）提取物", "Artemisia Princeps Leaf Extract", "0.1–3%"),
    "astr_mur": ("木鲁星果脂", "Astrocaryum Murumuru Seed Butter", "1–15%"),
    "blet_str": ("白及根提取物", "Bletilla Striata Root Extract", "0.05–1%"),
    "buty_par": ("乳木果脂", "Butyrospermum Parkii Butter", "2–15%"),
    "cale_off": ("金盏花花提取物", "Calendula Officinalis Flower Extract", "0.5–3%"),
    "came_sin": ("绿茶（叶）提取物", "Camellia Sinensis Leaf Extract", "0.05–2%"),
    "cent_asi": ("积雪草提取物", "Centella Asiatica Extract", "0.1–5%"),
    "coix_lac": ("薏苡仁提取物", "Coix Lacryma-Jobi Ma-Yuen Seed Extract", "0.1–2%"),
    "cope_cer": ("巴西棕榈蜡", "Copernicia Cerifera (Carnauba) Wax", "0.5–8%"),
    "dend_ext": ("石斛提取物", "Dendrobium Loddigesii Extract", "0.1–2%"),
    "eute_ole": ("巴西莓(阿萨伊)果提取物", "Euterpe Oleracea Fruit Extract", "0.1–2%"),
    "fors_sus": ("连翘果提取物", "Forsythia Suspensa Fruit Extract", "0.1–5%"),
    "gano_luc": ("灵芝提取物", "Ganoderma Lucidum (Mushroom) Extract", "0.1–3%"),
    "gast_ela": ("天麻根提取物", "Gastrodia Elata Root Extract", "0.1–3%"),
    "glyc_gla": ("光果甘草(根)提取物", "Glycyrrhiza Glabra Root Extract", "0.1–2%"),
    "hama_vir": ("金缕梅叶提取物", "Hamamelis Virginiana Leaf Extract", "1–5%"),
    "heli_ita": ("意大利蜡菊提取物", "Helichrysum Italicum Extract", "0.1–1.9%"),
    "hipp_rha": ("沙棘果油", "Hippophae Rhamnoides Fruit Oil", "0.05–1%"),
    "hout_cor": ("鱼腥草提取物", "Houttuynia Cordata Extract", "0.1–2%"),
    "loni_jap": ("金银花（花）提取物", "Lonicera Japonica Flower Extract", "0.1–3%"),
    "lyci_bar": ("枸杞（果）提取物", "Lycium Barbarum Fruit Extract", "0.1–3%"),
    "mori_ole": ("辣木籽油", "Moringa Oleifera Seed Oil", "1–15%"),
    "moru_alb": ("桑白皮提取物", "Morus Alba Root Bark Extract", "0.1–4%"),
    "myrc_dub": ("卡姆果提取物", "Myrciaria Dubia Fruit Extract", "0.1–3%"),
    "orbi_ole": ("巴巴苏籽油", "Orbignya Oleifera Seed Oil", "1–30%"),
    "paeo_suf": ("牡丹皮提取物", "Paeonia Suffruticosa Root Extract", "0.1–6%"),
    "pana_gin": ("人参(根)提取物", "Panax Ginseng Root Extract", "0.1–2%"),
    "pass_edu": ("百香果籽油", "Passiflora Edulis Seed Oil", "1–20%"),
    "paul_cup": ("瓜拉纳籽提取物", "Paullinia Cupana Seed Extract", "0.1–3%"),
    "poly_mul": ("何首乌(根)提取物", "Polygonum Multiflorum Root Extract", "0.1–5%"),
    "pori_coc": ("茯苓提取物", "Poria Cocos Sclerotium Extract", "0.1–3%"),
    "rosm_off": ("迷迭香叶提取物", "Rosmarinus Officinalis Leaf Extract", "0.5–2%"),
    "saus_inv": ("天山雪莲提取物", "Saussurea Involucrata Extract", "0.1–2%"),
    "scut_bai": ("黄芩(根)提取物", "Scutellaria Baicalensis Root Extract", "0.05–0.5%"),
    "soph_fla": ("苦参根提取物", "Sophora Flavescens Root Extract", "0.1–2.1%"),
    "trem_fuc": ("银耳提取物", "Tremella Fuciformis (Mushroom) Extract", "0.05–1%"),
    # ── 口腔(2026-09-09 新增)──
    "cpc":       ("西吡氯铵", "Cetylpyridinium Chloride", "0.05-0.1%"),
    "zn_cit":    ("柠檬酸锌", "Zinc Citrate", "0.5-2%"),
    "sod_bicarb":("碳酸氢钠", "Sodium Bicarbonate", "5-25%"),
    "hap":       ("羟基磷灰石", "Hydroxyapatite", "2-10%"),
    "papain":    ("木瓜蛋白酶", "Papain", "0.1-0.5%"),
    "k_nitrate": ("硝酸钾", "Potassium Nitrate", "3-5%"),
    "xylitol":   ("木糖醇", "Xylitol", "3-10%"),
    "chamo":     ("洋甘菊花提取物", "Chamomilla Recutita Flower Extract", "0.1-0.5%"),
    # ── 香氛 ──
    "parfum":    ("香精复配", "Parfum", "8-20%"),
    "fixative":  ("定香基质", "Ethylene Brassylate", "1-5%"),
    "citrus":    ("柑橘类精油复配", "Citrus Aurantium Dulcis Peel Oil", "1-3%"),
    # ── 洗护 ──
    "keratin":   ("水解角蛋白", "Hydrolyzed Keratin", "0.5-2%"),
    "beh_tms":   ("阳离子调理剂", "Behentrimonium Chloride", "1-3%"),
    "dimethicone":("聚二甲基硅氧烷", "Dimethicone", "1-4%"),
}

# ── 剂型表 ─────────────────────────────────────────────────────────────
# 每个剂型的工艺常量。这些数按剂型走而不按单品走 —— 同一剂型的工艺窗口本来就一样,
# 逐条给不同的数字是假精确。
# (品类, 剂型, pH, 黏度, 灌装温度, 保质期月, MOQ, 打样天, 大货天, 防腐体系, 中文剂型名)
FMT = {
    "serum":        ("skincare", "pH 5.0-6.0", "800-3,000 cP",  "室温灌装 ≤30℃", 36, 3000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "精华液"),
    "ampoule":      ("skincare", "pH 5.0-6.0", "500-2,000 cP",  "室温灌装 ≤30℃", 36, 5000, 12, 28, "苯氧乙醇 + 对羟基苯乙酮", "安瓶"),
    "essence":      ("skincare", "pH 5.0-6.0", "50-500 cP",     "室温灌装 ≤30℃", 36, 5000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "化妆水/精华水"),
    "lotion":       ("skincare", "pH 5.0-6.5", "2,000-6,000 cP", "45-50℃ 灌装",  36, 3000, 12, 28, "苯氧乙醇 + 乙基己基甘油", "乳液"),
    "cream":        ("skincare", "pH 5.0-6.5", "15,000-40,000 cP", "45-55℃ 灌装", 36, 3000, 14, 30, "苯氧乙醇 + 对羟基苯乙酮", "面霜"),
    "gel":          ("skincare", "pH 5.0-6.0", "8,000-20,000 cP", "室温灌装 ≤30℃", 36, 3000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "凝胶"),
    "oil":          ("skincare", "不适用(无水体系)", "20-80 cP",  "室温灌装",     24, 3000, 8,  22, "无水体系,不添加防腐剂", "美容油"),
    "balm":         ("skincare", "不适用(无水体系)", "膏体,针入度 15-30", "70-80℃ 热灌", 24, 5000, 12, 28, "无水体系,不添加防腐剂", "膏霜/唇膏基"),
    "sleeping-mask":("skincare", "pH 5.0-6.5", "10,000-25,000 cP", "45-50℃ 灌装", 36, 5000, 14, 30, "苯氧乙醇 + 对羟基苯乙酮", "睡眠面膜"),
    "sheet-mask":   ("skincare", "pH 5.0-6.0", "精华液 30-300 cP", "室温灌注 ≤30℃", 24, 10000, 12, 25, "苯氧乙醇 + 乙基己基甘油", "贴片面膜"),
    "mask":         ("skincare", "pH 5.0-6.5", "20,000-60,000 cP", "室温灌装 ≤30℃", 24, 8000, 12, 28, "苯氧乙醇 + 对羟基苯乙酮", "涂抹面膜"),
    "eye-cream":    ("skincare", "pH 5.0-6.5", "12,000-30,000 cP", "45-50℃ 灌装", 36, 5000, 14, 30, "苯氧乙醇 + 对羟基苯乙酮", "眼霜"),
    "eye-patch":    ("skincare", "pH 5.0-6.0", "凝胶体,不测黏度",  "室温",         24, 10000, 14, 30, "苯氧乙醇 + 乙基己基甘油", "眼膜"),
    "mist":         ("skincare", "pH 5.0-6.0", "≤50 cP(水剂)",   "室温灌装",     24, 5000, 8,  22, "苯氧乙醇 + 乙基己基甘油", "喷雾"),
    "stick":        ("skincare", "不适用(无水体系)", "膏体,针入度 10-25", "75-85℃ 热灌", 24, 8000, 14, 32, "无水体系,不添加防腐剂", "棒状"),
    "foam":         ("cleansing","pH 5.0-6.0", "6,000-18,000 cP", "室温灌装 ≤35℃", 36, 5000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "洁面泡/洁面膏"),
    "cleansing-gel":("cleansing","pH 5.0-6.0", "4,000-12,000 cP", "室温灌装 ≤35℃", 36, 5000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "洁面啫喱"),
    "cleansing-oil":("cleansing","不适用(无水体系)", "30-100 cP", "室温灌装",     24, 5000, 10, 25, "无水体系,不添加防腐剂", "卸妆油"),
    "micellar":     ("cleansing","pH 5.0-6.0", "≤30 cP(水剂)",  "室温灌装",     24, 8000, 8,  22, "苯氧乙醇 + 乙基己基甘油", "卸妆水"),
    "body-lotion":  ("body",     "pH 5.0-6.5", "3,000-8,000 cP", "45-50℃ 灌装",  36, 5000, 12, 28, "苯氧乙醇 + 乙基己基甘油", "身体乳"),
    "body-wash":    ("body",     "pH 5.0-6.0", "3,000-9,000 cP", "室温灌装 ≤35℃", 36, 5000, 10, 25, "苯氧乙醇 + 乙基己基甘油", "沐浴露"),
    "scrub":        ("body",     "pH 5.0-6.5", "膏体,含磨砂颗粒", "室温灌装",     24, 5000, 12, 28, "苯氧乙醇 + 对羟基苯乙酮", "身体磨砂"),
    "hand-cream":   ("body",     "pH 5.0-6.5", "18,000-45,000 cP", "45-55℃ 灌装", 36, 5000, 12, 28, "苯氧乙醇 + 对羟基苯乙酮", "护手霜"),
    "sun-lotion":   ("suncare",  "pH 5.5-7.0", "4,000-12,000 cP", "40-45℃ 灌装",  30, 10000, 20, 45, "苯氧乙醇 + 乙基己基甘油", "防晒乳"),
    "sun-stick":    ("suncare",  "不适用(无水体系)", "膏体,针入度 10-20", "75-85℃ 热灌", 30, 10000, 20, 45, "无水体系,不添加防腐剂", "防晒棒"),

    # ── 口腔护理(2026-09-09 新增)────────────────────────────────
    # 依据:三折页与公司 PPT 里的实货 —— 竹炭牙膏 / 烟酰胺牙膏 / 24K 金亮白牙膏 /
    # 漱口片 / 口气喷雾 / 牙贴 / 牙龈护理粉,不是概念品类。
    # 监管口径与化妆品不同:牙膏按《牙膏监督管理办法》(2023-12-01 施行)备案管理。
    "toothpaste":   ("oral",      "pH 5.5-9.0", "膏体,挤出稠度可控", "室温灌装 ≤35℃", 36, 10000, 15, 35, "苯氧乙醇 或 山梨酸钾体系", "牙膏"),
    "mouthwash":    ("oral",      "pH 4.5-7.0", "≤30 cP(水剂)",   "室温灌装",      36, 10000, 12, 30, "苯甲酸钠 + CPC 体系", "漱口水"),
    "tooth-tablet": ("oral",      "不适用(固体)", "压片,硬度 40-80 N", "压片成型",     24, 10000, 18, 40, "固体体系,不添加防腐剂", "洁牙片/漱口片"),
    "oral-spray":   ("oral",      "pH 5.0-7.0", "≤20 cP(水剂)",   "室温灌装",      24, 10000, 12, 30, "苯甲酸钠体系", "口腔喷雾"),
    "tooth-strip":  ("oral",      "pH 5.5-7.5", "凝胶,涂布量可控",  "室温涂布",      18, 20000, 20, 45, "苯氧乙醇体系", "牙贴"),
    "gum-powder":   ("oral",      "不适用(粉体)", "粉体,粒径可控",   "粉体填充",      24, 10000, 15, 35, "粉体体系,不添加防腐剂", "牙龈护理粉"),
    # ── 儿童护肤(已取得儿童与眼部产品生产资质)────────────────────
    # 《儿童化妆品监督管理规定》(2022-01-01 施行):标签须标「小金盾」标志,
    # 配方遵循「安全优先、功效必需、配方极简」——所以这一档一律走极简防腐与低刺激体系。
    "kids-cream":   ("kids",      "pH 5.0-6.0", "8,000-20,000 cP", "45-50℃ 灌装",  30, 10000, 15, 35, "对羟基苯乙酮 + 辛甘醇(极简)", "儿童面霜"),
    "kids-lotion":  ("kids",      "pH 5.0-6.0", "2,000-5,000 cP",  "45-50℃ 灌装",  30, 10000, 15, 35, "对羟基苯乙酮 + 辛甘醇(极简)", "儿童乳液"),
    "kids-wash":    ("kids",      "pH 5.0-6.0", "2,000-6,000 cP",  "室温灌装 ≤35℃", 30, 10000, 12, 30, "对羟基苯乙酮 + 辛甘醇(极简)", "儿童洗沐"),
    "kids-shampoo": ("kids",      "pH 5.0-6.0", "2,000-5,000 cP",  "室温灌装 ≤35℃", 30, 10000, 12, 30, "对羟基苯乙酮 + 辛甘醇(极简)", "儿童洗发"),
    # ── 香氛 ──────────────────────────────────────────────────
    "edt":          ("fragrance", "不适用(醇溶体系)", "≤10 cP",     "室温灌装,需陈化", 60, 5000, 20, 45, "醇溶体系,不添加防腐剂", "淡香水 EDT"),
    "edp":          ("fragrance", "不适用(醇溶体系)", "≤10 cP",     "室温灌装,需陈化", 60, 5000, 20, 45, "醇溶体系,不添加防腐剂", "浓香水 EDP"),
    "body-mist":    ("fragrance", "pH 5.0-6.5", "≤20 cP",          "室温灌装",      30, 10000, 12, 30, "苯氧乙醇 + 乙基己基甘油", "身体香氛喷雾"),
    "solid-perfume":("fragrance", "不适用(无水体系)", "膏体,针入度 12-28", "75-85℃ 热灌", 36, 5000, 15, 35, "无水体系,不添加防腐剂", "固体香膏"),
    # ── 洗护(原来只有 3 条,补齐)────────────────────────────────
    # 注意:**防脱发属特殊化妆品**(须注册),这一档不做,不写进库。
    "shampoo":      ("haircare",  "pH 5.0-6.0", "3,000-8,000 cP",  "室温灌装 ≤35℃", 36, 5000, 12, 30, "苯氧乙醇 + 乙基己基甘油", "洗发水"),
    "conditioner":  ("haircare",  "pH 3.5-4.5", "6,000-15,000 cP", "40-45℃ 灌装",  36, 5000, 12, 30, "苯氧乙醇 + 乙基己基甘油", "护发素"),
    "hair-mask":    ("haircare",  "pH 3.5-4.5", "15,000-35,000 cP","40-50℃ 灌装",  36, 5000, 14, 32, "苯氧乙醇 + 对羟基苯乙酮", "发膜"),
    "hair-oil":     ("haircare",  "不适用(无水体系)", "20-60 cP",   "室温灌装",      24, 5000, 10, 25, "无水体系,不添加防腐剂", "护发精油"),
    "hair-essence": ("haircare",  "pH 4.5-6.0", "500-3,000 cP",    "室温灌装 ≤30℃", 36, 5000, 12, 28, "苯氧乙醇 + 乙基己基甘油", "免洗护发精华"),
    # PPT 十款重点爆品里有「冰感止痒修护防晒喷雾」与「一分钟止痒冰感脱毛后护理喷雾」——
    # 是在产的剂型,库里却没有,补上。防晒喷雾属特殊化妆品,走注册不走备案。
    "sun-spray":    ("suncare",   "pH 5.0-6.5", "≤50 cP",          "室温灌装",      30, 10000, 15, 40, "苯氧乙醇 + 乙基己基甘油", "防晒喷雾"),
    "body-spray":   ("body",      "pH 4.5-6.0", "≤50 cP",          "室温灌装",      30, 10000, 12, 30, "苯氧乙醇 + 乙基己基甘油", "身体护理喷雾"),
    "jelly-mask":   ("skincare",  "pH 5.0-6.0", "20,000-60,000 cP","40-50℃ 灌装",  30, 5000, 14, 32, "苯氧乙醇 + 对羟基苯乙酮", "冻膜"),
}

# ── 功效族 ─────────────────────────────────────────────────────────────
# (功效标签, 中文诉求, 活性物 key 列表, 肤感, 成本档, 趋势标签)
KITS = [
    ("hydrating,barrier",     "基础补水+屏障", ["ha", "gly", "pan"],            "水感清爽,吸收快无残留",      "low",  "barrier-repair"),
    ("hydrating,plumping",    "长效保湿",     ["ha_multi", "treh", "beta_ine"], "弹润有膜感,不黏腻",         "mid",  "multi-weight-ha"),
    ("barrier,repair",        "屏障修护",     ["cer_cplx", "chol", "sq"],       "厚润不油腻,推开即化",       "mid",  "ceramide-barrier"),
    ("barrier,soothing",      "敏肌屏障",     ["ega", "beta", "pan"],           "极简配方,无酒精无香精",     "mid",  "ectoin-sensitive"),
    ("soothing,sensitive-skin","舒缓抗刺激",  ["cica", "madec", "bisab"],       "凉感轻薄,零刺激",           "mid",  "cica-soothing"),
    ("soothing,repairing",    "术后向舒缓",   ["pan", "allan", "madec"],        "极简,医美术后向",           "mid",  "post-procedure"),
    ("brightening,even-tone", "提亮匀净",     ["nia", "arb", "vc_eth"],         "轻薄微黏,成膜均匀",         "mid",  "niacinamide-tone"),
    ("brightening,antioxidant","抗氧提亮",    ["vc_map", "ferulic", "toco"],    "微酸感,建议日间配防晒",     "high", "vitc-antiox"),
    ("brightening,clarifying","净透匀肤",     ["tranex", "nia", "lico"],        "水润无负担",                "mid",  "tranexamic-tone"),
    ("anti-aging,firming",    "紧致抗老",     ["pep_sig", "pep_ach", "adeno"],  "丝滑,推开即化",             "high", "peptide-firming"),
    ("anti-aging,smoothing",  "视黄醇抗老",   ["reti", "toco", "sq"],           "油润,夜用型",               "high", "retinol-night"),
    ("anti-aging,elasticity", "温和抗老",     ["bakuchiol", "resv", "toco"],    "无刺激,孕哺可用向",         "high", "bakuchiol-gentle"),
    ("antioxidant,nourishing","抗氧滋养",     ["resv", "toco", "jojoba"],       "滋润,夜间修护向",           "mid",  "antiox-night"),
    ("oil-control,pore-care", "控油净痘",     ["sa", "zinc", "nia"],            "速干哑光,清爽",             "low",  "bha-oilcontrol"),
    ("oil-control,clarifying","温和控油",     ["lha", "azel", "tto"],           "轻薄不拔干",                "mid",  "lha-gentle-oil"),
    ("exfoliating,smoothing", "温和焕肤",     ["pha", "aha", "allan"],          "微刺感,建议夜用",           "mid",  "pha-gentle-peel"),
    ("microbiome,barrier",    "微生态平衡",   ["probio", "beta", "gly"],        "轻盈,微酸性",               "high", "microbiome-skin"),
    ("nourishing,repairing",  "发酵滋养",     ["yeast", "pan", "sq"],           "滋润,吸收后微膜感",         "high", "ferment-nourish"),
    ("hydrating,gentle",      "无添加基础款", ["gly", "beta_ine", "oat"],       "极简,无香精无酒精",         "low",  "clean-formula"),
    ("nourishing,comfortable","滋养修护",     ["shea", "sq", "toco"],           "厚润,冬季/干燥气候向",      "mid",  "rich-nourish"),
    # ── 草本领衔的功效族(2026-09-10 Q4)────────────────────────
    # 为什么单开一批:原来的功效族全部由通用活性物领衔(透明质酸、烟酰胺、视黄醇),
    # 草本只在文案里出现、不在 actives 里,于是 100 个原料溯源页只有 7 页
    # 能列出「在册配方里谁在用」。这一批让草本真正进 actives_json,
    # 溯源页与配方库才算打通,而不是各写各的。
    ("herbal-soothing,sensitive-skin", "东方草本舒缓", ["cent_asi", "scut_bai", "loni_jap"],
     "凉感轻薄,零刺激感",            "mid",  "oriental-soothing"),
    ("herbal-oil-control,clarifying", "草本控油净痘",  ["hout_cor", "soph_fla", "rosm_off"],
     "速干哑光,不拔干",              "mid",  "oriental-oilcontrol"),
    ("herbal-brightening,even-tone", "草本亮肤匀净",  ["moru_alb", "glyc_gla", "coix_lac"],
     "轻薄水润,上脸不假白",          "mid",  "oriental-brightening"),
    ("polysaccharide,hydrating",     "真菌多糖保湿",  ["trem_fuc", "gano_luc", "pori_coc"],
     "弹润有膜感,不黏腻",            "mid",  "fungal-polysaccharide"),
    ("herbal-repair,barrier",        "东方草本修护",  ["dend_ext", "blet_str", "gast_ela"],
     "厚润好推,干后有细腻膜感",      "high", "oriental-repair"),
    ("amazon-antioxidant,brightening", "亚马逊抗氧",  ["eute_ole", "myrc_dub", "paul_cup"],
     "深色果感,建议避光包材",        "mid",  "amazon-antiox"),
    ("amazon-nourishing,comfortable", "亚马逊滋养",   ["astr_mur", "orbi_ole", "pass_edu"],
     "上手偏硬,抹开即化",            "mid",  "amazon-butter"),
    ("scalp-care,herbal",            "草本头皮护理",  ["poly_mul", "soph_fla", "rosm_off"],
     "清爽不紧绷,冲后不涩",          "mid",  "oriental-scalp"),
    ("herbal-soothing,repairing",    "欧系草本舒缓",  ["hama_vir", "cale_off", "heli_ita"],
     "轻薄快吸,术后向",              "high", "european-botanical"),
    ("herbal-antioxidant,plateau",   "高原草本抗氧",  ["saus_inv", "lyci_bar", "came_sin"],
     "水感通透,微酸性",              "high", "plateau-botanical"),
    ("herbal-barrier,sensitive-skin", "草本抗敏屏障", ["arte_pri", "cent_asi", "pori_coc"],
     "极简配方,无香精无酒精",        "mid",  "oriental-sensitive"),
    ("herbal-nourishing,repair",     "沙棘修护滋养",  ["hipp_rha", "buty_par", "mori_ole"],
     "厚润,冬季与干燥气候向",        "mid",  "seabuckthorn-rich"),
    # ── 口腔 / 儿童 / 香氛 / 洗护 的功效族(2026-09-09 新增)。
    # 活性物一律带 INCI —— 中文名不能跨境核对,这条纪律和护肤线一致。
    ("fresh-breath,antibacterial", "清新抑菌",  ["cpc", "zn_cit", "menth"],    "清凉不辣口,留香时间可调",   "low",  "oral-fresh"),
    ("whitening-teeth,stain",      "亮白去渍",  ["sod_bicarb", "hap", "papain"], "细腻不磨牙,刷后即滑",       "mid",  "oral-whitening"),
    ("gum-care,soothing",          "牙龈护理",  ["allan", "chamo", "toco"], "温和不刺激,适合牙龈敏感", "mid",  "oral-gum"),
    ("sensitive-teeth,relief",     "抗敏感",    ["k_nitrate", "hap", "zn_cit"],     "低摩擦,冷热刺激缓冲",       "mid",  "oral-sensitive"),
    ("probiotic,balance",          "口腔益生",  ["probio", "xylitol", "zn_cit"], "无酒精,微甜不辣口",      "high", "oral-probiotic"),
    ("kids-gentle,barrier",        "儿童温和屏障", ["pan", "oat", "gly"],        "极简配方,无香精无色素",     "mid",  "kids-minimal"),
    ("kids-soothing,repair",       "儿童舒缓修护", ["oat", "allan", "cer_cplx"], "厚润好推,不辣眼",       "mid",  "kids-minimal"),
    ("scent,long-lasting",         "留香",      ["parfum", "fixative"],   "前中后调分明,留香可调",     "mid",  "scent-lasting"),
    ("scent,fresh",                "清新香调",  ["parfum", "citrus"],     "开盖清爽,不闷",             "low",  "scent-fresh"),
    ("hair-cleanse,gentle",        "温和清洁",  ["amino", "apg", "pan"],       "泡沫细密,冲后不涩",         "low",  "amino-surfactant"),
    ("hair-repair,smooth",         "修护顺滑",  ["keratin", "beh_tms", "dimethicone"], "顺滑不假滑,吹干不毛躁", "mid",  "keratin-repair"),
    ("scalp-care,balance",         "头皮护理",  ["pan", "zinc", "probio"], "清爽不紧绷,适合油头",       "mid",  "scalp-microbiome"),
]

# ── 只补规格、不新生成的剂型 ───────────────────────────────────────────
# 创始人 C5:「彩妆你需要网上自己搜索完善」。库里 22 条(彩妆 15、护肤 4、清洁 1、
# 洗护 1、防晒 1)的工艺字段一直空着,采购一问就露怯。
#
# 这些剂型不进 ALLOW —— 彩妆的差异在色粉与遮盖力,不在功效族,
# 用「剂型 × 功效族」去交叉会生出「粉饼 × 视黄醇抗老」这种不存在的东西。
# 所以只把工艺窗口补上,条目本身还是原来那些。
#
# 数字口径与全表一致:给区间不给单值。压制力一栏能对上设备口径 ——
# 转盘式自动压粉机常规压制力 1-3 吨,52mm 饼径折算约 8-20 MPa。
# 键是 (品类, 剂型),不是只有剂型 —— powder 在清洁/洗护/彩妆/护肤下是四种东西。
SPEC_ONLY = {
    # (category, format): (pH, 黏度/形态, 灌装或成型, 保质期月, 打样天, 大货天, 防腐体系)
    ("makeup", "powder"):      ("不适用(无水粉体)", "散粉/压制粉,松装密度可控", "粉体填充;压制款压制力 1-3 吨(约 8-20 MPa,视饼径)", 36, 18, 40, "无水体系,不添加防腐剂"),
    ("makeup", "cushion"):     ("pH 5.5-7.0", "2,000-8,000 cP", "室温浸润,浸渍量按海绵克重设定", 30, 20, 45, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "foundation"):  ("pH 5.5-7.0", "3,000-15,000 cP", "40-45℃ 灌装", 30, 18, 40, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "concealer"):   ("pH 5.5-7.0", "15,000-40,000 cP", "40-45℃ 灌装", 30, 18, 40, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "lipstick"):    ("不适用(无水蜡基)", "膏体,针入度 8-18", "75-90℃ 浇注,冷却定型", 36, 20, 45, "无水体系,以生育酚抗氧"),
    ("makeup", "gloss"):       ("不适用(无水油胶)", "3,000-15,000 cP", "60-70℃ 灌装", 36, 18, 40, "无水体系,以生育酚抗氧"),
    ("makeup", "lip-mask"):    ("不适用(无水体系)", "膏体,针入度 15-35", "70-85℃ 热灌", 36, 18, 40, "无水体系,以生育酚抗氧"),
    ("makeup", "mascara"):     ("pH 7.0-8.5", "20,000-60,000 cP", "65-75℃ 热灌", 30, 25, 50, "苯氧乙醇 + 对羟基苯乙酮"),
    ("makeup", "pencil"):      ("不适用(无水蜡基)", "笔芯,硬度按环境温度分夏/冬配方", "70-85℃ 挤出成型", 36, 20, 45, "无水体系,以生育酚抗氧"),
    ("makeup", "mud"):         ("pH 5.5-7.0", "20,000-60,000 cP", "40-50℃ 灌装", 30, 18, 40, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "spray"):       ("pH 5.0-6.5", "≤20 cP", "室温灌装", 30, 12, 30, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "stick"):       ("不适用(无水蜡基)", "膏体,针入度 10-25", "75-90℃ 浇注", 36, 20, 45, "无水体系,以生育酚抗氧"),
    ("makeup", "cream"):       ("pH 5.5-7.0", "8,000-25,000 cP", "45-50℃ 灌装", 30, 18, 40, "苯氧乙醇 + 乙基己基甘油"),
    ("makeup", "serum"):       ("pH 5.0-6.5", "800-3,000 cP", "室温灌装 ≤30℃", 30, 15, 35, "苯氧乙醇 + 乙基己基甘油"),
    # 护肤 / 清洁 / 洗护 / 防晒 里剩下的空格
    ("skincare", "powder"):    ("pH 5.0-6.0(复溶后测)", "冻干粉,复溶时间 ≤60 秒", "冻干成型,氮气填充", 36, 20, 45, "无水体系,不添加防腐剂"),
    ("skincare", "powder+ampoule"): ("pH 5.0-6.0(复溶后测)", "冻干粉 + 安瓶双剂", "冻干成型 + 安瓶室温灌装", 36, 22, 48, "无水粉体不加防腐;安瓶苯氧乙醇体系"),
    ("skincare", "bio-cellulose-mask"): ("pH 5.0-6.0", "精华 ≤500 cP", "室温灌注,菌膜含液量按膜重设定", 24, 20, 45, "苯氧乙醇 + 对羟基苯乙酮"),
    ("skincare", "lip-mask"):  ("pH 5.0-6.5", "10,000-30,000 cP", "45-55℃ 灌装", 30, 15, 35, "苯氧乙醇 + 乙基己基甘油"),
    ("cleansing", "powder"):   ("pH 5.5-6.5(1% 水溶液测)", "粉体,起泡量可控", "粉体填充", 36, 15, 35, "粉体体系,不添加防腐剂"),
    ("haircare", "powder"):    ("不适用(无水粉体)", "粉体,吸油量可控", "粉体填充", 36, 15, 35, "粉体体系,不添加防腐剂"),
    ("suncare", "spf"):        ("pH 5.0-6.5", "3,000-12,000 cP", "40-45℃ 灌装", 30, 15, 40, "苯氧乙醇 + 乙基己基甘油"),
}

# 新增品类(口腔/儿童/香氛/洗护)专属功效族。ALLOW 写 None 的剂型不吃这一批 ——
# 否则「精华液 × 清新抑菌」这种组合会自己长出来。
NEW_LINE_BENEFITS = {
    "fresh-breath,antibacterial",
    "whitening-teeth,stain",
    "gum-care,soothing",
    "sensitive-teeth,relief",
    "probiotic,balance",
    "kids-gentle,barrier",
    "kids-soothing,repair",
    "scent,long-lasting",
    "scent,fresh",
    "hair-cleanse,gentle",
    "hair-repair,smooth",
    "scalp-care,balance",
}

# Q4 那批草本功效族的名字。单独成集是为了**保住既有编码**:
# 编码来自一个按 (剂型 × 功效族) 递增的计数器,给靠前的剂型插一个新功效族,
# 后面所有配方的编码会整体挪位 —— 线上已经发出去的 SK-SE042 会变成另一支配方。
# 所以 build() 分两遍走:第一遍按原顺序生成既有组合,第二遍才追加这一批。
Q4_KITS = {
    "herbal-soothing,sensitive-skin",
    "herbal-oil-control,clarifying",
    "herbal-brightening,even-tone",
    "polysaccharide,hydrating",
    "herbal-repair,barrier",
    "amazon-antioxidant,brightening",
    "amazon-nourishing,comfortable",
    "scalp-care,herbal",
    "herbal-soothing,repairing",
    "herbal-antioxidant,plateau",
    "herbal-barrier,sensitive-skin",
    "herbal-nourishing,repair",
}

# 特殊化妆品判定 —— 《化妆品监督管理条例》第十六条
SPECIAL_HINT = ("suncare",)

REG_GENERAL = (
    "普通化妆品:境内生产按《化妆品监督管理条例》向 NMPA 备案即可上市;"
    "备案需提交产品全成分、执行标准、标签样稿与安全评估资料。"
)
REG_SPECIAL = (
    "特殊化妆品:按《化妆品监督管理条例》第十六条须经 NMPA 注册后方可生产,"
    "需人体功效评价试验与技术审评,周期显著长于备案 —— 排期时请按注册口径预留。"
)

MARKETS_BASE = "CN,EU,US,JP,ID,MY,SA"

# 品类监管口径覆盖(2026-09-09)。
# 上面那两段是化妆品口径。口腔与儿童**不能套用** ——
# 牙膏在中国根本不归《化妆品监督管理条例》管,漱口水连化妆品都不是。
# 报价单上写错法规依据,客户报关那天才发现,那是我们的责任。
REG_BY_CAT = {
    "oral": (
        "牙膏:按《牙膏监督管理办法》(2023-12-01 施行)向 NMPA 备案,参照普通化妆品管理,"
        "功效宣称须有评价依据;漱口水/口腔喷雾/洁牙片/牙贴/牙龈护理粉不属于化妆品,"
        "按普通日化品管理,带抑菌宣称的按消毒产品口径另行备案。"
        "出口另按目标市场:欧盟牙膏按 EC No 1223/2009 化妆品管理;"
        "美国含氟牙膏属 OTC 专论药品,本档配方不含氟化物。"
    ),
    "kids": (
        "儿童化妆品:普通化妆品备案,并须同时满足《儿童化妆品监督管理规定》"
        "(2022-01-01 施行)—— 标签强制标注儿童化妆品标志(小金盾),"
        "遵循安全优先、功效必需、配方极简原则,不使用尚在评估中的原料。"
    ),
}


def actives_json(keys):
    return json.dumps(
        [{"name": A[k][0], "inci": A[k][1], "pct": A[k][2]} for k in keys],
        ensure_ascii=False,
    )


def build():
    """剂型 × 功效族 交叉,跳过工艺上不成立的组合。"""
    rows, n = [], {}
    # 每个剂型能承载哪些功效族 —— 不是所有组合都成立,
    # 例如无水体系(油/膏/棒)承载不了水溶性酸类,喷雾承载不了高油相。
    ALLOW = {
        "serum":        None,  # None = 全部
        "ampoule":      ["barrier,repair", "brightening,even-tone", "anti-aging,firming",
                         "soothing,sensitive-skin", "barrier,soothing", "nourishing,repairing"],
        "essence":      ["herbal-soothing,sensitive-skin", "herbal-antioxidant,plateau",
                         "hydrating,barrier", "hydrating,plumping", "brightening,clarifying",
                         "soothing,sensitive-skin", "microbiome,barrier", "hydrating,gentle",
                         "exfoliating,smoothing"],
        "lotion":       ["herbal-soothing,sensitive-skin", "herbal-brightening,even-tone",
                         "hydrating,barrier", "barrier,repair", "brightening,even-tone",
                         "oil-control,pore-care", "soothing,sensitive-skin", "hydrating,gentle"],
        "cream":        None,
        "gel":          ["hydrating,barrier", "soothing,sensitive-skin", "oil-control,pore-care",
                         "hydrating,plumping", "microbiome,barrier"],
        "oil":          ["nourishing,comfortable", "antioxidant,nourishing", "anti-aging,smoothing"],
        "balm":         ["barrier,repair", "nourishing,comfortable", "soothing,repairing",
                         "amazon-nourishing,comfortable"],
        "sleeping-mask":["hydrating,plumping", "barrier,repair", "brightening,even-tone",
                         "soothing,sensitive-skin"],
        "sheet-mask":   ["herbal-repair,barrier", "herbal-brightening,even-tone",
                         "hydrating,barrier", "brightening,even-tone", "soothing,sensitive-skin",
                         "barrier,repair", "hydrating,plumping", "brightening,clarifying"],
        "mask":         ["herbal-oil-control,clarifying", "polysaccharide,hydrating",
                         "oil-control,pore-care", "brightening,clarifying", "exfoliating,smoothing",
                         "hydrating,plumping"],
        "eye-cream":    ["anti-aging,firming", "barrier,repair", "brightening,even-tone",
                         "anti-aging,elasticity", "soothing,sensitive-skin"],
        "eye-patch":    ["hydrating,plumping", "anti-aging,firming", "brightening,even-tone"],
        "mist":         ["hydrating,barrier", "soothing,sensitive-skin", "microbiome,barrier",
                         "herbal-soothing,sensitive-skin"],
        "stick":        ["barrier,repair", "nourishing,comfortable", "soothing,repairing"],
        "foam":         ["hydrating,gentle", "oil-control,pore-care", "soothing,sensitive-skin"],
        "cleansing-gel":["hydrating,gentle", "oil-control,clarifying", "soothing,sensitive-skin",
                         "herbal-oil-control,clarifying"],
        "cleansing-oil":["nourishing,comfortable"],
        "micellar":     ["hydrating,gentle", "soothing,sensitive-skin"],
        "body-lotion":  ["amazon-nourishing,comfortable", "herbal-nourishing,repair",
                         "hydrating,barrier", "nourishing,comfortable", "barrier,repair",
                         "brightening,even-tone", "exfoliating,smoothing"],
        "body-wash":    ["hydrating,gentle", "soothing,sensitive-skin"],
        "scrub":        ["exfoliating,smoothing", "hydrating,barrier"],
        "hand-cream":   ["barrier,repair", "nourishing,comfortable", "hydrating,barrier"],
        "sun-lotion":   ["hydrating,barrier", "soothing,sensitive-skin", "antioxidant,nourishing"],
        "sun-stick":    ["barrier,repair"],
        "toothpaste":   ["fresh-breath,antibacterial", "whitening-teeth,stain",
                         "gum-care,soothing", "sensitive-teeth,relief", "probiotic,balance"],
        "mouthwash":    ["fresh-breath,antibacterial", "gum-care,soothing", "probiotic,balance",
                         "whitening-teeth,stain", "sensitive-teeth,relief"],
        "tooth-tablet": ["fresh-breath,antibacterial", "whitening-teeth,stain", "probiotic,balance"],
        "oral-spray":   ["fresh-breath,antibacterial", "probiotic,balance", "gum-care,soothing"],
        "tooth-strip":  ["whitening-teeth,stain"],
        "gum-powder":   ["gum-care,soothing", "whitening-teeth,stain"],
        "kids-cream":   ["kids-gentle,barrier", "kids-soothing,repair"],
        "kids-lotion":  ["kids-gentle,barrier", "kids-soothing,repair"],
        "kids-wash":    ["kids-gentle,barrier", "kids-soothing,repair"],
        "kids-shampoo": ["kids-gentle,barrier", "kids-soothing,repair"],
        "edt":          ["scent,fresh", "scent,long-lasting"],
        "edp":          ["scent,long-lasting"],
        "body-mist":    ["scent,fresh", "scent,long-lasting"],
        "solid-perfume":["scent,long-lasting", "scent,fresh"],
        "shampoo":      ["hair-cleanse,gentle", "scalp-care,balance", "scalp-care,herbal"],
        "conditioner":  ["hair-repair,smooth", "scalp-care,balance"],
        "hair-mask":    ["hair-repair,smooth", "scalp-care,balance"],
        "hair-oil":     ["hair-repair,smooth", "scalp-care,balance"],
        "hair-essence": ["hair-repair,smooth", "scalp-care,balance", "scalp-care,herbal"],
        "sun-spray":    ["hydrating,barrier", "soothing,sensitive-skin"],
        "body-spray":   ["soothing,repairing", "soothing,sensitive-skin", "hydrating,barrier"],
        "jelly-mask":   ["hydrating,plumping", "soothing,sensitive-skin", "brightening,clarifying",
                         "barrier,repair", "herbal-repair,barrier", "polysaccharide,hydrating"],
    }
    PREFIX = {"skincare": "SK", "cleansing": "CN", "body": "BD", "suncare": "SN",
              "oral": "OC", "kids": "KD", "fragrance": "FR", "haircare": "HC"}

    # 两遍:先既有组合(编码不动),再追加 Q4 的草本组合(编码接在后面)
    for wave in (0, 1):
      for fmt, allow in ALLOW.items():
        cat, ph, visc, fill, shelf, moq, sd, bd, pres, fmt_zh = FMT[fmt]
        kits = ([k for k in KITS if k[0] not in NEW_LINE_BENEFITS] if allow is None
                else [k for k in KITS if k[0] in allow])
        kits = [k for k in kits if (k[0] in Q4_KITS) == bool(wave)]
        for ben, zh_claim, keys, texture, band, trend in kits:
              special = cat in SPECIAL_HINT
              n[cat] = n.get(cat, 0) + 1
              code = f"{PREFIX[cat]}-{fmt[:2].upper()}{n[cat]:03d}"
              rows.append({
                  "code": code, "category": cat, "format": fmt, "benefits": ben,
                  "actives_json": actives_json(keys), "texture": texture,
                  "moq": moq, "cost_band": band,
                  "lead_days": bd, "sample_days": sd, "bulk_days": bd,
                  "markets": MARKETS_BASE, "ph": ph, "viscosity": visc,
                  "fill_temp": fill, "shelf_life_m": shelf, "preservative": pres,
                  "reg_class": "special" if special else "general",
                  "reg_note": REG_BY_CAT.get(cat, REG_SPECIAL if special else REG_GENERAL),
                  "cert_notes": (
                      "可按目标市场出具资料:中国备案资料、欧盟 CPNP + 安全评估报告(CPSR)、"
                      "美国 MoCRA 设施注册与产品列名、印尼 BPOM 注册、HALAL 配套。"
                  ),
                  "ai_summary": (
                      f"{fmt_zh} · {zh_claim}。{texture}。"
                      f"关键活性物 {A[keys[0]][0]}({A[keys[0]][1]})、{A[keys[1]][0]}。"
                      f"工艺窗口:{ph},{visc},{fill};保质期 {shelf} 个月。"
                      f"打样 {sd} 天,大货 {bd} 天,起订 {moq}。"
                  ),
                  "trend_tags": trend,
                  "status": "sample",
              })
    return rows


COLS = ["code", "category", "format", "benefits", "actives_json", "texture", "moq",
        "cost_band", "lead_days", "markets", "cert_notes", "ai_summary", "trend_tags",
        "status", "reg_class", "reg_note", "ph", "viscosity", "sample_days",
        "bulk_days", "shelf_life_m", "fill_temp", "preservative"]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    rows = build()
    have = {r["code"] for r in d1("SELECT code FROM formulas")}
    new = [r for r in rows if r["code"] not in have]
    print(f"生成 {len(rows)} 条,其中新增 {len(new)} 条;库内现有 {len(have)} 条")
    by_cat = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
    for k, v in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {k:<12}{v:>4}")
    if a.dry:
        return

    # 走 SQL 文件,不走 --command。
    # 踩过的坑:Windows 上 wrangler 是 .CMD,subprocess 带 shell=True 转发命令行时
    # 长 SQL 会被截断/引号被吃掉,表现是 `[d1] 解析失败` 而不是明确报错 ——
    # 123 条只写进去 3 条,而脚本一路打印"写入 123/123"。
    # --file 把 SQL 交给文件,命令行长度与引号问题一次性消失。
    sql_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_formula-build.sql")
    with io.open(sql_path, "w", encoding="utf-8") as fh:
        upd = ",".join(f"{c}=excluded.{c}" for c in COLS if c != "code")
        for i in range(0, len(rows), 20):
            vals = ",".join("(" + ",".join(q(r[c]) for c in COLS) + ")" for r in rows[i:i + 20])
            fh.write(f"INSERT INTO formulas ({','.join(COLS)}) VALUES {vals} "
                     f"ON CONFLICT(code) DO UPDATE SET {upd};\n")
        # 既有 100 条的规格字段补齐:按剂型套工艺常量,套不上的留空(不编)
        for fmt, (cat, ph, visc, fill, shelf, moq, sd, bd, pres, _zh) in FMT.items():
            fh.write(f"UPDATE formulas SET ph={q(ph)}, viscosity={q(visc)}, fill_temp={q(fill)}, "
                     f"shelf_life_m={shelf}, preservative={q(pres)}, sample_days={sd}, "
                     f"bulk_days={bd} WHERE format={q(fmt)} AND ph='';\n")
        # 只补规格、不新生成的剂型 —— 键带品类,避免 powder 一条 UPDATE 洗掉四个品类
        for (_c, _f), (_ph, _v, _fill, _sh, _sd, _bd, _pr) in SPEC_ONLY.items():
            fh.write(f"UPDATE formulas SET ph={q(_ph)}, viscosity={q(_v)}, fill_temp={q(_fill)}, "
                     f"shelf_life_m={_sh}, preservative={q(_pr)}, sample_days={_sd}, "
                     f"bulk_days={_bd} WHERE category={q(_c)} AND format={q(_f)} "
                     f"AND COALESCE(ph,'')='';\n")
        # 防晒品类无论剂型一律按特殊化妆品标注
        fh.write(f"UPDATE formulas SET reg_class='special', reg_note={q(REG_SPECIAL)} "
                 f"WHERE category='suncare';\n")
        fh.write(f"UPDATE formulas SET reg_class='general', reg_note={q(REG_GENERAL)} "
                 f"WHERE reg_note='' AND category NOT IN ('oral','kids');\n")
        for _c, _note in REG_BY_CAT.items():
            fh.write(f"UPDATE formulas SET reg_class='general', reg_note={q(_note)} "
                     f"WHERE category={q(_c)};\n")
    wrote = d1_exec(sql_path)
    print(f"  SQL 文件 {os.path.getsize(sql_path):,} 字节,写入 {wrote} 行")

    tot = d1("SELECT COUNT(*) n FROM formulas WHERE status IN ('sample','active')")[0]["n"]
    spec = d1("SELECT COUNT(*) n FROM formulas WHERE ph<>''")[0]["n"]
    print(f"完成:在架 {tot} 条,其中带工艺规格 {spec} 条")


if __name__ == "__main__":
    main()
