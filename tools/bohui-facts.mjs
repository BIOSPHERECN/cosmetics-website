/**
 * 帛卉真实企业数据 —— 唯一事实源。
 *
 * 来源:创始人提供的《帛卉公司介绍_2026.pdf》,数据截至 2026 年。
 *
 * 为什么要单独一个文件:此前站上的数字是我**编的**
 * (18 年经验、28,000 ㎡、12 条产线、43 国、25 天打样)——
 * 全部与真实资料不符。采购拿着这些数字来核对,一次就穿帮,
 * 而且是在最要命的地方穿帮:产能和交期。
 *
 * 从此凡是数字,只能从这里取;这里没有的,宁可不写,也不许现编。
 * 更新时改这一个文件,所有播种脚本跟着变。
 */

export const FACTS = {
  legal: {
    zh: '广州市帛卉化妆品有限公司',
    en: 'Guangzhou Biosphere Cosmetics Co., Ltd.',
    brand: 'BIOSPHERE',
    platform: { zh: '帛卉草本美妆 AI 智造平台', en: 'Biosphere Herbal Beauty AI Smart Manufacturing Platform' },
    positioning: { zh: 'AI 驱动的草本生物科技美妆产业创新平台', en: 'AI-Driven Herbal Biotech Beauty Industry Innovation Platform' },
  },

  /** 核心数据汇总(PDF 第 17 页原表)。带 > 的保留「超过」语气,不要写死成精确值 */
  figures: [
    { key: 'area', zh: '全球生产基地总面积', en: 'Total manufacturing floor area', value: '20,000', unit: '㎡', prefix: '>' },
    { key: 'lines', zh: '自动化生产流水线', en: 'Automated production lines', value: '15', unit: '条', unitEn: 'lines' },
    { key: 'mask', zh: '面膜类日生产能力', en: 'Daily sheet-mask capacity', value: '50万', unit: '片', prefix: '>', valueEn: '500,000', unitEn: 'sheets/day' },
    { key: 'cream', zh: '水乳霜类日生产能力', en: 'Daily lotion & cream capacity', value: '30万', unit: '个', prefix: '>', valueEn: '300,000', unitEn: 'units/day' },
    { key: 'warehouse', zh: '智能化自有仓储面积', en: 'Smart warehousing', value: '10,000', unit: '㎡', prefix: '>' },
    { key: 'formulas', zh: '成熟配方技术储备', en: 'Proven formulations on file', value: '13,000', unit: '个', prefix: '>', unitEn: '' },
    { key: 'rnd', zh: '资深研发团队规模', en: 'R&D specialists', value: '30', unit: '人', prefix: '>', unitEn: '' },
    { key: 'suppliers', zh: '战略合作上游供应商', en: 'Strategic upstream suppliers', value: '300', unit: '家', prefix: '>', unitEn: '' },
    { key: 'cleanroom', zh: '洁净生产车间标准', en: 'Cleanroom class', value: '10万级', unit: 'GMP', valueEn: 'Class 100,000', unitEn: 'GMP' },
  ],

  /** 打样周期 —— 09-26 总指挥按创始人授权定:营销文案一律「通常 3–7 天出样」(带「通常」,不写成承诺);条款页 lib/terms.ts 保留 5–14 天 */
  sampling: { zh: '通常 3–7 天出样', en: 'samples usually ready in 3–7 days' },

  bases: [
    /* 精确地点口径(PDF 第 2 页 KEY FIGURES 脚注):广州白云 + 印尼唐格朗 */
    { id: 'guangzhou', zh: '广州总部基地(白云)', en: 'Guangzhou Headquarters (Baiyun) · China',
      points: { zh: ['全球研发与品牌服务中心', '15 条现代化智能产线', '10 万级 GMP 洁净车间', '10,000+ ㎡ 智能仓储'],
                en: ['Global R&D and brand-service centre', '15 modern smart production lines', 'Class 100,000 GMP cleanroom', '10,000+ m² smart warehousing'] },
      role: { zh: '服务中国及亚太市场,承载核心研发与品牌赋能职能', en: 'Serves China and Asia-Pacific; carries core R&D and brand enablement' } },
    { id: 'indonesia', zh: '印尼海外工厂(唐格朗)', en: 'Indonesia Factory (Tangerang) · Southeast Asia',
      points: { zh: ['本土化生产与交付', '东南亚本地化合规', 'HALAL 清真认证', '关税与物流优势'],
                en: ['Local production and delivery', 'Southeast Asia local compliance', 'HALAL certified', 'Tariff and logistics advantage'] },
      role: { zh: '辐射东南亚及中东市场,提供出海一站式合规服务', en: 'Covers Southeast Asia and the Middle East with one-stop export compliance' } },
  ],

  markets: [
    { zh: '东南亚', en: 'Southeast Asia', note: { zh: '印尼工厂本土化交付', en: 'Local delivery from the Indonesia plant' } },
    { zh: '中东', en: 'Middle East', note: { zh: '持 HALAL 证书,覆盖范围以证书为准', en: 'HALAL certificate held, scope as stated on the certificate' } },
    { zh: '欧美', en: 'Europe & North America', note: { zh: 'ISO 22716 国际标准背书', en: 'Backed by ISO 22716' } },
    { zh: '巴西 / 南美', en: 'Brazil & South America', note: { zh: '亚马逊植物双源战略', en: 'Amazonian botanical dual-source strategy' } },
  ],

  /** 平台六大核心能力(PDF 第 2 页) */
  capabilities: [
    { n: '01', zh: '种植基地', en: 'Cultivation bases', note: { zh: '东方草本与亚马逊植物双源原料', en: 'Dual-source: Eastern herbs and Amazonian botanicals' } },
    { n: '02', zh: '古方研究', en: 'Classical formula research', note: { zh: '深挖千年草本智慧,现代科学验证', en: 'Millennia of herbal knowledge, validated by modern science' } },
    { n: '03', zh: '生物合成', en: 'Biosynthesis', note: { zh: '发酵与低温闪萃,活性提升 10–20 倍', en: 'Fermentation and cold flash extraction, 10–20× activity' } },
    { n: '04', zh: 'AI 选品', en: 'AI product selection', note: { zh: '大数据洞察趋势,精准定位爆款', en: 'Trend insight from large-scale data' } },
    { n: '05', zh: '智能溯源', en: 'Smart traceability', note: { zh: '原料到成品,每瓶全程可追溯', en: 'Every unit traceable from raw material to finished good' } },
    { n: '06', zh: '智能制造', en: 'Smart manufacturing', note: { zh: '15 条智能产线,柔性适配多批次', en: '15 smart lines, flexible across batch sizes' } },
  ],

  /** 三大核心技术壁垒(PDF 第 5 页)—— 数字全部来自原文 */
  tech: [
    { zh: '草本发酵转化', en: 'Herbal fermentation conversion',
      body: { zh: '利用特定微生物对植物原料进行生物转化,分解细胞壁,释放并转化活性成分,显著提升功效与生物利用度。',
              en: 'Targeted microbes biotransform plant material, breaking cell walls to release and convert actives.' },
      stats: [{ v: '10–20 倍', l: { zh: '稀有人参皂苷活性提升', en: 'Rare ginsenoside activity' } },
              { v: '90%+', l: { zh: '农药残留有效降解', en: 'Pesticide residue degraded' } }] },
    { zh: '低温闪萃提取', en: 'Cold flash extraction',
      body: { zh: '在 0–10℃ 低温环境下进行提取,保护热敏性活性成分,采用高效溶剂体系与物理场辅助加速传质。',
              en: 'Extraction at 0–10℃ protects heat-sensitive actives; high-efficiency solvent systems accelerate mass transfer.' },
      stats: [{ v: '>95%', l: { zh: '热敏活性成分保留率', en: 'Heat-sensitive actives retained' } },
              { v: '+40%', l: { zh: '提取效率提升', en: 'Extraction efficiency' } }] },
    { zh: '生物合成技术', en: 'Biosynthesis',
      body: { zh: '以合成生物学方法制备高活性功能成分,与暨南大学产学研合作攻关。核心成果:rhCOLL 重组胶原蛋白。',
              en: 'Synthetic-biology routes to high-activity actives, developed with Jinan University. Flagship: rhCOLL recombinant collagen.' },
      stats: [{ v: 'rhCOLL', l: { zh: '重组人源化胶原蛋白', en: 'Recombinant humanised collagen' } },
              { v: '暨南大学', l: { zh: '产学研合作', en: 'University research partnership' } }] },
  ],

  /** 智能生产六步闭环(PDF 第 11 页) */
  process: [
    { zh: '原料溯源', en: 'Raw-material tracing', hand: { zh: '九仙草等草本原料种植基地直采,批次信息全程可溯源', en: 'Direct from cultivation bases; batch data traceable end to end' } },
    { zh: '低温冷萃', en: 'Cold extraction', hand: { zh: '0–10℃ 低温提取,最大程度保护热敏性活性成分', en: '0–10℃ extraction to protect heat-sensitive actives' } },
    { zh: '智能配比', en: 'AI dosing', hand: { zh: 'AI 算法精准投料控制,确保每批次产品一致性', en: 'Algorithmic dosing control for batch-to-batch consistency' } },
    { zh: '在线检测', en: 'In-line inspection', hand: { zh: '生产过程实时质量监控,异常参数自动预警', en: 'Real-time monitoring with automatic deviation alerts' } },
    { zh: '质量检测', en: 'Quality testing', hand: { zh: '四性测试加十道安全把关,成品出厂前全检', en: 'Four-property testing plus ten safety gates before release' } },
    { zh: '成品追溯', en: 'Finished-goods traceability', hand: { zh: '每瓶绑定唯一溯源码,消费者扫码全链路可查', en: 'Unique code per unit; consumers can scan to verify' } },
  ],

  /** 严苛四性测试 + 十道安全把关(PDF 第 12 页) */
  quality: {
    four: [
      { zh: '体验性', en: 'Experience', note: { zh: '使用感、肤感、气味等消费者体验维度评估', en: 'Sensory, skin-feel and scent evaluation' } },
      { zh: '功效性', en: 'Efficacy', note: { zh: '功效成分验证与临床功效测试,确保真实有效', en: 'Active verification and clinical efficacy testing' } },
      { zh: '稳定性', en: 'Stability', note: { zh: '耐热、耐寒、离心等全周期稳定性考察', en: 'Heat, cold and centrifuge stability across the shelf life' } },
      { zh: '兼容性', en: 'Compatibility', note: { zh: '包材相容性与防腐挑战测试,确保长期安全', en: 'Packaging compatibility and preservative challenge testing' } },
    ],
    ten: { zh: ['原料验收', '配方审核', '中试放大', '在线巡检', '成品检验', '出厂放行'],
           en: ['Incoming inspection', 'Formula review', 'Pilot scale-up', 'In-line patrol', 'Finished-goods testing', 'Release'] },
    note: { zh: '含微生物检测、重金属检测、包材检测、稳定性考察等十道关卡 —— 源头可追溯、过程可管控、风险可预警。',
            en: 'Ten gates including microbiology, heavy metals, packaging and stability — traceable at source, controlled in process, risk flagged early.' },
  },

  /** 草本溯源体系(PDF 第 3 页) */
  origin: [
    { zh: '合作山地种植基地', en: 'Partner mountain cultivation bases', note: { zh: '合作 20 余家,覆盖贵州毕节、新疆喀什、广东清远等优质产区', en: '20+ partner bases across Bijie (Guizhou), Kashgar (Xinjiang) and Qingyuan (Guangdong)' } },
    { zh: '分级采收标准体系', en: 'Graded harvest standards', note: { zh: '依据植物生长周期与活性成分峰值确定最佳采收时点', en: 'Harvest timed to the peak of active content' } },
    { zh: '农残溯源台账系统', en: 'Residue traceability ledger', note: { zh: '记录种植环境、施肥记录、采收批次、检测报告等全链路数据', en: 'Environment, fertiliser, harvest batch and test reports all logged' } },
    { zh: '古方智慧传承', en: 'Classical formula heritage', note: { zh: '依托 20,000 余篇传统古方文献的数字化整理', en: 'Built on 20,000+ digitised classical formula texts' } },
  ],

  /** 认证(PDF 第 12、13 页) */
  certs: [
    { id: 'gmpc', label: 'GMPC', note: { zh: '化妆品良好生产规范(DEKRA 认证)', en: 'Good Manufacturing Practice of Cosmetics (DEKRA)' } },
    { id: 'iso22716', label: 'ISO 22716:2007', note: { zh: '化妆品 GMP 国际标准(DEKRA 认证)', en: 'Cosmetics GMP international standard (DEKRA)' } },
    { id: 'halal', label: 'HALAL', note: { zh: 'HALAL 认证(覆盖范围以证书为准)', en: 'HALAL certification (scope as stated on the certificate)' } },
    { id: 'fda', label: 'FDA', note: { zh: '美国 FDA 化妆品设施注册（注册≠批准、不发证书）', en: 'US FDA cosmetic facility registration (registration is not approval, and no certificate is issued)' } },
    { id: 'cpnp', label: 'CPNP', note: { zh: '欧盟化妆品通报', en: 'EU cosmetic product notification' } },
    { id: 'sgs', label: 'SGS', note: { zh: '第三方检测报告', en: 'Third-party testing reports' } },
    { id: 'ce', label: 'CE', note: { zh: '欧盟符合性标志', en: 'EU conformity marking' } },
    { id: 'patent', label: '发明专利', note: { zh: '核心技术发明专利证书', en: 'Invention patents on core technology' } },
  ],

  /** 上游原料品牌(PDF 第 14 页,均为公开的行业头部供应商) */
  suppliers: ['BASF 巴斯夫', 'TINCI 天赐', 'Evonik 赢创', 'Dow 陶氏', 'Clariant 科莱恩',
    'Givaudan 奇华顿', 'Symrise 德之馨', 'Ashland 亚什兰', 'IFF 国际香料',
    'Amcor 安姆科', 'CLC 联昌', 'KKP 江门联记', 'ALPLA 阿普拉', 'EPL 爱索尔'],

  /** 已服务品牌(PDF 第 15 页) */
  clients: ['ACNAWAY', 'BUHOTEI TOKYO', 'CAPPUVINI', 'LOMIRA', 'AMORTALS', 'NPURE',
    'MIHSOO', 'MILK RECIPE', 'CeraCode', 'BEEME', 'OYASUMI', 'SEXY WHITE', 'SKINHEAL',
    'ELFORMULA', 'SUNISA', 'V White', 'FAN BEAUTY SECRET', 'GLOWCODE', 'BIOAQUA',
    'CELO', 'GoSmile', 'YURIZUMI', 'Dentific'],
  ip: ['Disney 迪士尼', 'How to Train Your Dragon 驯龙高手', 'The Smurfs 蓝精灵'],

  /** 平台赋能四项(PDF 第 15 页) */
  services: [
    { n: '01', zh: '市场洞察与产品策划', en: 'Market insight and product planning', note: { zh: '基于大数据解析行业趋势,深挖消费需求,量身定制爆款策略', en: 'Category strategy built on large-scale trend data' } },
    { n: '02', zh: '品牌视觉与营销全案', en: 'Brand identity and marketing', note: { zh: '打造差异化视觉体系,输出整合营销策略', en: 'Differentiated visual system and integrated marketing' } },
    { n: '03', zh: '研发打样与量产交付', en: 'R&D, sampling and volume delivery', note: { zh: '配方定制、快速打样、柔性量产,15 条智能产线保障交付', en: 'Custom formulation, fast sampling, flexible volume across 15 lines' } },
    { n: '04', zh: '出海合规与物流护航', en: 'Export compliance and logistics', note: { zh: '依托印尼本地资源,搞定资质认证、合规清关与国际物流', en: 'Certification, customs and international logistics via our Indonesia base' } },
  ],

  /** 全品类配方覆盖(PDF 第 14 页) */
  categories: { zh: ['护肤', '彩妆', '口腔护理', '儿童护肤', '身体护理', '国际 IP 赋能'],
                en: ['Skincare', 'Colour cosmetics', 'Oral care', 'Kids skincare', 'Body care', 'Licensed IP'] },
};
