/**
 * 能力与服务页 · 深度化改版(创始人 2026-08-31:「这么简单没人感兴趣!
 * 要按 AI 分析/标杆研究,写清楚一家代工厂该具备什么能力」)。
 *
 * 版块骨架来自三路并行研究(国际代工巨头能力页 + GitHub UI 模式 + 现页差距):
 *   hero → GEO 直答+FAQ → 三类活 → 六大核心能力 → 数字条 → 三大技术壁垒
 *   → 智能生产六步闭环 → 商务走法六阶段 → 双基地 → 认证墙 → 不接什么 → 询盘
 *
 * ★ 数字纪律:所有数值只从 tools/bohui-facts.mjs 取;资料里没有的宁可不写。★
 * 只动 zh-cn / en 两语(mt=0);其余语种由 i18n-backfill 自动线补,
 * 补不上的语种前台按「无法翻译先不显示」纪律处理。
 */
import { d1 } from './d1.mjs';
import { writeFileSync } from 'node:fs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const PAGE = 40; // biosphere-ai /capabilities
const sql = [];

/* ── 0. hero(#101):一句话带上底牌数字 ─────────────────────── */
const heroZh = {
  eyebrow: 'BIOSPHERE-AI',
  title: '能力与服务',
  lead: '制造、品牌孵化、供应链整合、全球交付 —— 四件能力可以单独购买,也可以整包托付。底子是 20,000+ ㎡ 广州+印尼双基地、15 条智能产线、13,000+ 个成熟配方与 10 万级 GMP 洁净车间。',
  ctaPrimary: '发起询盘',
};
const heroEn = {
  eyebrow: 'BIOSPHERE-AI',
  title: 'Capabilities & Services',
  lead: 'Manufacturing, brand incubation, supply-chain integration and global delivery — buy any one capability on its own, or hand us the whole job. Behind it: 20,000+ m² across Guangzhou and Indonesia, 15 smart production lines, 13,000+ proven formulations and a Class-100,000 GMP cleanroom.',
  ctaPrimary: 'Start an inquiry',
};

/* ── 1. prose(#102)下线:内容与 hero lead 重复,是「单薄」的一部分 ── */

/* ── 2. GEO 直答 + 采购 FAQ(AnswerBlock 本来就是为这个设计的)──── */
const ansZh = {
  tone: 'paper',
  question: '帛卉(BIOSPHERE-AI)能为品牌方提供什么代工能力?',
  answer: '广州市帛卉化妆品有限公司是 AI 驱动的草本美妆智造平台:广州与印尼双基地合计 20,000+ ㎡,15 条自动化产线,10 万级 GMP 洁净车间;面膜日产能 50 万片以上、水乳霜日产能 30 万个以上;13,000+ 个成熟配方储备支撑 3–7 天快速打样。GMPC、ISO 22716、HALAL 认证与美国 FDA 设施注册、欧盟 CPNP 通报经验,覆盖欧美、东南亚与中东的市场准入。从 OEM 贴牌、ODM 定制到品牌全案孵化都能承接。',
  faqs: [
    { q: 'OEM 和 ODM 在帛卉分别怎么走?', a: 'OEM:您带配方或标准来,我们负责按标生产与全程质控。ODM:从 13,000+ 配方储备里按品牌定位选型改良,3–7 天打样,确认后进入中试与量产。只有一个想法也可以 —— 那就从品牌孵化开始。' },
    { q: '起订量(MOQ)怎么算?', a: '按剂型与包材组合评估:成熟剂型走标准起订量(产品目录各剂型均已标注),特殊包材或定制配方在需求判定阶段给出明确门槛 —— 报价单一次说清,不藏后手。' },
    { q: '打样要多久?', a: '成熟配方方向 3–7 天出样。样品阶段就前置体验性与稳定性初筛,避免「样品好看、量产翻车」。' },
    { q: '出口认证与文件谁来准备?', a: '工厂持 GMPC、ISO 22716(DEKRA)与 HALAL 认证,有美国 FDA 化妆品设施注册与欧盟 CPNP 通报经验;COA、MSDS 等出口文件随单配套。' },
    { q: '可以只买其中一项能力吗?', a: '可以。制造、品牌孵化、供应链整合、全球交付四件能力独立计价 —— 已有成熟供应链的品牌只下制造单,新品牌可以整包托付。' },
    { q: '广州和印尼两个基地怎么选?', a: '面向中国与亚太的订单走广州总部(全球研发与品牌服务中心);东南亚与中东订单可走印尼工厂 —— 本土化交付、HALAL 合规、关税与物流占优。' },
  ],
};
const ansEn = {
  tone: 'paper',
  question: 'What manufacturing capabilities does BIOSPHERE-AI offer brands?',
  answer: 'Guangzhou Biosphere Cosmetics is an AI-driven herbal beauty manufacturing platform: 20,000+ m² across two plants in Guangzhou and Indonesia, 15 automated lines and a Class-100,000 GMP cleanroom; daily capacity above 500,000 sheet masks and 300,000 lotion/cream units. A library of 13,000+ proven formulations supports 3–7 day sampling. GMPC, ISO 22716 and HALAL certification plus US FDA facility registration and EU CPNP notification experience cover market entry across Europe, the Americas, Southeast Asia and the Middle East. We take on OEM, ODM and full brand incubation.',
  faqs: [
    { q: 'How do OEM and ODM work here?', a: 'OEM: you bring the formula or standard, we manufacture to it under full quality control. ODM: we shortlist from 13,000+ formulations on file to match your positioning, sample in 3–7 days, then move to pilot and mass production. Only an idea? Start with brand incubation.' },
    { q: 'How is MOQ calculated?', a: 'By format and packaging combination: mature formats run standard MOQs (marked on every format in the catalogue); special packaging or custom formulas get a clear threshold at the scoping stage — one quotation, nothing hidden.' },
    { q: 'How long does sampling take?', a: '3–7 days for mature formulation directions. Experience and stability screening starts at the sample stage, so what you approve is what scales.' },
    { q: 'Who prepares export certification and documents?', a: 'The factory holds GMPC, ISO 22716 (DEKRA) and HALAL certification, with US FDA facility registration and EU CPNP notification experience; COA, MSDS and other export documents ship with the order.' },
    { q: 'Can I buy just one capability?', a: 'Yes. Manufacturing, brand incubation, supply-chain integration and global delivery are priced independently — brands with a mature supply chain place manufacturing-only orders; new brands can hand over the whole job.' },
    { q: 'Guangzhou or Indonesia — which plant?', a: 'China and Asia-Pacific orders run through the Guangzhou headquarters (global R&D and brand-service centre); Southeast Asia and Middle East orders can run through the Indonesia plant — local delivery, HALAL compliance, tariff and logistics advantages.' },
  ],
};

/* ── 111. 平台六大核心能力(PDF 第 2 页)──────────────────────── */
const matrixZh = {
  title: '平台六大核心能力',
  intro: '从种植端到交付端,一条链上的每一环都自己握着 —— 这是「草本 AI 智造」与普通代工的差别。',
  items: [
    { id: 'cultivation', title: '种植基地', desc: '东方草本与亚马逊植物双源原料。', bullets: ['合作山地种植基地 20 余家', '覆盖贵州毕节、新疆喀什、广东清远', '分级采收 · 农残溯源台账'] },
    { id: 'classical', title: '古方研究', desc: '深挖千年草本智慧,现代科学验证。', bullets: ['20,000+ 篇古方文献数字化整理', '古方智慧 × 现代功效验证'] },
    { id: 'biosynthesis', title: '生物合成', desc: '发酵与低温闪萃,活性提升 10–20 倍。', bullets: ['稀有人参皂苷活性提升 10–20 倍', '农药残留降解 90%+', 'rhCOLL 重组胶原蛋白'] },
    { id: 'ai-select', title: 'AI 选品', desc: '大数据洞察趋势,精准定位爆款。', bullets: ['趋势数据驱动立项', '降低新品试错成本'] },
    { id: 'trace', title: '智能溯源', desc: '原料到成品,每瓶全程可追溯。', bullets: ['一瓶一码', '种植—提取—灌装全链路记录'] },
    { id: 'smart-mfg', title: '智能制造', desc: '15 条智能产线,柔性适配多批次。', bullets: ['10 万级 GMP 洁净车间', '面膜 50 万片/日 · 水乳霜 30 万个/日'] },
  ],
};
const matrixEn = {
  title: 'Six core platform capabilities',
  intro: 'From cultivation to delivery, every link in the chain is held in-house — that is what separates herbal AI manufacturing from ordinary contract work.',
  items: [
    { id: 'cultivation', title: 'Cultivation bases', desc: 'Dual-source raw materials: Eastern herbs and Amazonian botanicals.', bullets: ['20+ partner mountain cultivation bases', 'Bijie, Kashgar and Qingyuan growing regions', 'Graded harvesting · residue traceability ledger'] },
    { id: 'classical', title: 'Classical formula research', desc: 'Millennia of herbal knowledge, validated by modern science.', bullets: ['20,000+ classical formula texts digitised', 'Classical wisdom × modern efficacy validation'] },
    { id: 'biosynthesis', title: 'Biosynthesis', desc: 'Fermentation and cold flash extraction, 10–20× activity.', bullets: ['Rare ginsenoside activity up 10–20×', 'Pesticide residues degraded 90%+', 'rhCOLL recombinant collagen'] },
    { id: 'ai-select', title: 'AI product selection', desc: 'Trend insight from large-scale data.', bullets: ['Data-driven product briefs', 'Lower trial-and-error cost on launches'] },
    { id: 'trace', title: 'Smart traceability', desc: 'Every unit traceable from raw material to finished good.', bullets: ['One code per unit', 'Cultivation—extraction—filling, all logged'] },
    { id: 'smart-mfg', title: 'Smart manufacturing', desc: '15 smart lines, flexible across batch sizes.', bullets: ['Class-100,000 GMP cleanroom', '500k masks / 300k lotion-cream units daily'] },
  ],
};

/* ── 112. 数字条 ─────────────────────────────────────────────── */
const statsZh = { tone: 'ink', items: [
  { value: '20,000+', unit: '㎡', label: '双基地总面积' },
  { value: '15', unit: '条', label: '自动化生产线' },
  { value: '13,000+', unit: '个', label: '成熟配方储备' },
  { value: '300+', unit: '家', label: '战略上游供应商' },
] };
const statsEn = { tone: 'ink', items: [
  { value: '20,000+', unit: 'm²', label: 'Across two plants' },
  { value: '15', unit: 'lines', label: 'Automated production' },
  { value: '13,000+', unit: '', label: 'Proven formulations' },
  { value: '300+', unit: '', label: 'Strategic suppliers' },
] };

/* ── 113. 三大核心技术壁垒(PDF 第 5 页)──────────────────────── */
const eviZh = {
  title: '三大核心技术壁垒',
  intro: '不是「有产线」而已 —— 三项自研技术决定配方的活性上限。',
  items: [
    { claim: '草本发酵转化:稀有人参皂苷活性提升 10–20 倍', proof: '特定微生物对植物原料进行生物转化,分解细胞壁、释放并转化活性成分;农药残留有效降解 90% 以上。', source: '自研发酵转化体系' },
    { claim: '低温闪萃提取:热敏活性成分保留率 95% 以上', proof: '0–10℃ 低温环境提取,高效溶剂体系与物理场辅助加速传质,提取效率提升 40%。', source: '低温闪萃工艺' },
    { claim: '生物合成:rhCOLL 重组人源化胶原蛋白', proof: '以合成生物学方法制备高活性功能成分,产学研联合攻关的核心成果。', source: '暨南大学产学研合作' },
  ],
};
const eviEn = {
  title: 'Three core technology moats',
  intro: 'More than production lines — three in-house technologies set the ceiling on formula activity.',
  items: [
    { claim: 'Herbal fermentation: rare ginsenoside activity up 10–20×', proof: 'Targeted microbes biotransform plant material, breaking cell walls to release and convert actives; pesticide residues degraded by 90%+.', source: 'In-house fermentation conversion system' },
    { claim: 'Cold flash extraction: 95%+ retention of heat-sensitive actives', proof: 'Extraction at 0–10℃ with high-efficiency solvent systems and physical-field assisted mass transfer; extraction efficiency up 40%.', source: 'Cold flash extraction process' },
    { claim: 'Biosynthesis: rhCOLL recombinant humanised collagen', proof: 'High-activity functional ingredients built with synthetic-biology methods — the flagship result of joint research.', source: 'Jinan University research partnership' },
  ],
};

/* ── 114. 智能生产六步闭环(PDF 第 11 页)─────────────────────── */
const procZh = {
  title: '智能生产六步闭环',
  intro: '每一批货走同一条闭环:进来的是可溯源的原料,出去的是可扫码回查的成品。',
  steps: [
    { no: '01', title: '原料溯源', desc: '九仙草等草本原料种植基地直采,批次信息全程可溯源。' },
    { no: '02', title: '低温冷萃', desc: '0–10℃ 低温提取,最大程度保护热敏性活性成分。' },
    { no: '03', title: '智能配比', desc: 'AI 算法精准投料控制,确保每批次产品一致性。' },
    { no: '04', title: '在线检测', desc: '生产过程实时质量监控,异常参数自动预警。' },
    { no: '05', title: '质量检测', desc: '四性测试加十道安全把关,成品出厂前全检。' },
    { no: '06', title: '成品追溯', desc: '每瓶绑定唯一溯源码,扫码全链路可查。' },
  ],
};
const procEn = {
  title: 'Six-step smart production loop',
  intro: 'Every batch runs the same loop: traceable raw material in, scan-to-verify finished goods out.',
  steps: [
    { no: '01', title: 'Raw-material tracing', desc: 'Direct from cultivation bases; batch data traceable end to end.' },
    { no: '02', title: 'Cold extraction', desc: '0–10℃ extraction protects heat-sensitive actives.' },
    { no: '03', title: 'AI dosing', desc: 'Algorithmic dosing control for batch-to-batch consistency.' },
    { no: '04', title: 'In-line inspection', desc: 'Real-time monitoring with automatic deviation alerts.' },
    { no: '05', title: 'Quality testing', desc: 'Four-property testing plus ten safety gates before release.' },
    { no: '06', title: 'Finished-goods traceability', desc: 'A unique code per unit; scan to verify the whole chain.' },
  ],
};

/* ── 115. 商务走法六阶段 ─────────────────────────────────────── */
const stagZh = {
  eyebrow: 'HOW WE WORK',
  title: '从对接到量产,怎么走',
  intro: '起点不同走法不同,但每一单都要过完这六道。',
  stages: [
    { name: '需求与法规预判', code: 'SCOPE', desc: '产能匹配 + 目标市场法规预判 —— 做不成的单子当场说清,不收了钱再谈备案。' },
    { name: '配方选型', code: 'FORMULA', desc: '在 13,000+ 成熟配方储备里按定位选型,或按 brief 定制;四性测试维度这一步就前置进来。' },
    { name: '快速打样', code: 'SAMPLE', desc: '成熟方向 3–7 天出样;样品阶段先过体验性与稳定性初筛。' },
    { name: '中试放大', code: 'PILOT', desc: '配方审核、中试放大、全周期稳定性考察 —— 样品到量产之间的翻车,多半死在跳过这一步。' },
    { name: '量产与全检', code: 'SCALE', desc: '10 万级 GMP 车间,在线巡检加成品全检,十道安全把关放行。' },
    { name: '交付与追溯', code: 'SHIP', desc: '出口文件随单配套;每瓶绑定唯一溯源码,全链路可回查。' },
  ],
  ctaLabel: '把需求发过来',
};
const stagEn = {
  eyebrow: 'HOW WE WORK',
  title: 'From first contact to mass production',
  intro: 'Different starting points, different routes — but every order passes all six gates.',
  stages: [
    { name: 'Scoping & regulatory pre-check', code: 'SCOPE', desc: 'Capacity match plus target-market regulatory pre-check — if it cannot be done, we say so up front.' },
    { name: 'Formula selection', code: 'FORMULA', desc: 'Shortlist from 13,000+ proven formulations or customise to your brief; four-property test criteria are set here, not later.' },
    { name: 'Rapid sampling', code: 'SAMPLE', desc: '3–7 days for mature directions; experience and stability screening starts at the sample stage.' },
    { name: 'Pilot scale-up', code: 'PILOT', desc: 'Formula review, pilot batches and full-cycle stability — most sample-to-scale failures die from skipping this step.' },
    { name: 'Mass production & inspection', code: 'SCALE', desc: 'Class-100,000 GMP cleanroom, in-line patrols plus finished-goods testing, ten safety gates before release.' },
    { name: 'Delivery & traceability', code: 'SHIP', desc: 'Export documents ship with the order; every unit carries a unique traceability code.' },
  ],
  ctaLabel: 'Send us your brief',
};

/* ── 116. 双基地 ─────────────────────────────────────────────── */
const baseZh = {
  eyebrow: 'DUAL BASES',
  title: '广州 + 印尼,双基地交付',
  intro: '一个面向中国与亚太,一个面向东南亚与中东 —— 订单落在哪个市场,就近走哪个基地。',
  items: [
    { type: 'make', kind: '总部基地', name: '广州总部基地', region: '中国 · 广州', focus: '全球研发与品牌服务中心;15 条现代化智能产线;10,000+ ㎡ 智能仓储', cert: '10 万级 GMP · GMPC · ISO 22716' },
    { type: 'make', kind: '海外工厂', name: '印尼海外工厂', region: '印度尼西亚', focus: '本土化生产与交付;东南亚本地化合规;关税与物流优势', cert: 'HALAL 清真认证' },
  ],
  footnote: '双基地合计 20,000+ ㎡;认证与检测明细见「质量与合规」。',
};
const baseEn = {
  eyebrow: 'DUAL BASES',
  title: 'Guangzhou + Indonesia, dual-base delivery',
  intro: 'One base serves China and Asia-Pacific, the other Southeast Asia and the Middle East — orders run through whichever sits closer to the market.',
  items: [
    { type: 'make', kind: 'Headquarters', name: 'Guangzhou Headquarters', region: 'Guangzhou · China', focus: 'Global R&D and brand-service centre; 15 modern smart lines; 10,000+ m² smart warehousing', cert: 'Class-100,000 GMP · GMPC · ISO 22716' },
    { type: 'make', kind: 'Overseas plant', name: 'Indonesia Factory', region: 'Indonesia', focus: 'Local production and delivery; Southeast-Asia compliance; tariff and logistics advantage', cert: 'HALAL certified' },
  ],
  footnote: '20,000+ m² across both bases; certification and testing details under Quality & Compliance.',
};

/* ── 117. 认证墙(PDF 第 12、13 页)──────────────────────────── */
const certZh = {
  title: '认证与市场准入',
  note: '认证不是墙上的装饰 —— 每一张对应一个市场的入场券:GMPC 与 ISO 22716(DEKRA)是欧美订单的验厂底线,HALAL 打开中东与印尼,FDA 注册与 CPNP 通报支撑美欧上架。',
  items: [
    { id: 'gmpc', label: 'GMPC', note: '化妆品良好生产规范(DEKRA 认证)' },
    { id: 'iso22716', label: 'ISO 22716:2007', note: '化妆品 GMP 国际标准(DEKRA 认证)' },
    { id: 'halal', label: 'HALAL', note: '清真认证 —— 中东与印尼市场准入' },
    { id: 'fda', label: 'FDA', note: '美国 FDA 化妆品设施注册' },
    { id: 'cpnp', label: 'CPNP', note: '欧盟化妆品通报' },
    { id: 'sgs', label: 'SGS', note: '第三方检测报告' },
    { id: 'ce', label: 'CE', note: '欧盟符合性标志' },
    { id: 'patent', label: '发明专利', note: '核心技术发明专利证书' },
  ],
};
const certEn = {
  title: 'Certification & market access',
  note: 'Certificates are entry tickets, not wall decoration: GMPC and ISO 22716 (DEKRA) clear factory audits for Western orders, HALAL opens the Middle East and Indonesia, FDA registration and CPNP notification support US and EU listings.',
  items: [
    { id: 'gmpc', label: 'GMPC', note: 'Good Manufacturing Practice of Cosmetics (DEKRA)' },
    { id: 'iso22716', label: 'ISO 22716:2007', note: 'Cosmetics GMP international standard (DEKRA)' },
    { id: 'halal', label: 'HALAL', note: 'Halal certification for Middle East and Indonesia' },
    { id: 'fda', label: 'FDA', note: 'US FDA cosmetic facility registration' },
    { id: 'cpnp', label: 'CPNP', note: 'EU cosmetic product notification' },
    { id: 'sgs', label: 'SGS', note: 'Third-party testing reports' },
    { id: 'ce', label: 'CE', note: 'EU conformity marking' },
    { id: 'patent', label: 'Invention patents', note: 'Patents on core technology' },
  ],
};

/* ── 118. 配方安全与保密(Kolmar「1 Prescription to 1 Company」打法:
   六大代工站里唯一把保密做成正式版块的 —— 采购评估 ODM 时,
   IP 泄露风险与产能同权重,这是明显的差异化空位)──────────── */
const secZh = {
  title: '配方安全与保密',
  intro: '品牌方最深的顾虑不是产能,是「我的爆品配方会不会流到竞品」。三条原则,白纸黑字:',
  items: [
    { claim: '一配方一客户', proof: '为您定制或改良的配方只服务您一家 —— 不复用、不改头换面卖给第二家。', source: '合作协议条款' },
    { claim: '保密先行', proof: '打样前先签保密协议;配方、包材方案与商业信息按客户隔离管理。', source: 'NDA 流程' },
    { claim: '技术自主', proof: '发酵、闪萃与生物合成均为自研体系,不依赖客户输入,也不留客户的技术依赖。', source: '自研技术体系' },
  ],
};
const secEn = {
  title: 'Formula security & confidentiality',
  intro: 'A brand’s deepest worry is not capacity — it is whether a hero formula leaks to a competitor. Three principles, in writing:',
  items: [
    { claim: 'One formula, one client', proof: 'A formula customised or adapted for you serves you alone — never reused or repackaged for anyone else.', source: 'Contract clause' },
    { claim: 'NDA before sampling', proof: 'Confidentiality agreements come before samples; formulas, packaging plans and business information are segregated per client.', source: 'NDA process' },
    { claim: 'Technology independence', proof: 'Fermentation, cold flash extraction and biosynthesis are in-house systems — no reliance on client input, no lock-in created.', source: 'In-house technology' },
  ],
};

/* ══ 组 SQL ══════════════════════════════════════════════════ */
/* 更新 hero;下线 prose */
sql.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(heroZh))}, mt=0 WHERE block_id=101 AND lang='zh-cn';`);
sql.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(heroEn))}, mt=0 WHERE block_id=101 AND lang='en';`);
sql.push(`UPDATE blocks SET is_visible=0 WHERE id=102;`);

/* 幂等:先清掉本脚本此前插过的新版块(按 type+sort_order 特征识别) */
sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order IN (2,111,112,113,114,115,116,117,118));`);
sql.push(`DELETE FROM blocks WHERE page_id=${PAGE} AND sort_order IN (2,111,112,113,114,115,116,117,118);`);

const inserts = [
  ['answer', 2, ansZh, ansEn],
  ['matrix', 111, matrixZh, matrixEn],
  ['statsband', 112, statsZh, statsEn],
  ['evidence', 113, eviZh, eviEn],
  ['process', 114, procZh, procEn],
  ['stages', 115, stagZh, stagEn],
  ['bases', 116, baseZh, baseEn],
  ['certs', 117, certZh, certEn],
  ['evidence', 118, secZh, secEn],
];
for (const [type, order, zh, en] of inserts) {
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${PAGE}, '${type}', ${order}, 1);`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(zh))}, 0),
    ((SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order=${order}), 'en', ${lit(JSON.stringify(en))}, 0);`);
}

/* 页面 SEO 描述同步升级 */
sql.push(`UPDATE page_i18n SET seo_desc=${lit('帛卉 BIOSPHERE-AI 能力与服务:20,000+㎡ 广州+印尼双基地、15 条智能产线、13,000+ 配方储备、3–7 天打样;GMPC / ISO 22716 / HALAL / FDA / CPNP 认证,OEM、ODM 与品牌孵化一站式。')} WHERE page_id=${PAGE} AND lang='zh-cn';`);
sql.push(`UPDATE page_i18n SET seo_desc=${lit('BIOSPHERE-AI capabilities: 20,000+ m² across Guangzhou and Indonesia, 15 smart lines, 13,000+ formulations, 3–7 day sampling; GMPC / ISO 22716 / HALAL / FDA / CPNP certified. OEM, ODM and brand incubation.')} WHERE page_id=${PAGE} AND lang='en';`);

const file = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/seed-cap2.sql';
writeFileSync(file, sql.join('\n'));
console.log('SQL 语句', sql.length, '条,执行…');
d1(file, { file: true });
console.log('完成。验证:');
for (const r of d1(`SELECT b.sort_order, b.type, b.is_visible, length(i.data_json) zh FROM blocks b LEFT JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn' WHERE b.page_id=${PAGE} ORDER BY b.sort_order`)) {
  console.log(r.sort_order, r.type, r.is_visible ? '' : '(hidden)', r.zh + '字');
}
