/**
 * 研发创新页(44)+ 质量与合规页(48)深化 —— 能力页同款打法第二批
 * (创始人:「很多版块都要丰富到专业的程度」)。
 *
 * 标杆依据(三路研究工作流):研发版块=信任引擎(人数/配方储备/技术路线三件套);
 * 质量版块=把「质量」从口号变成可追问的制度(测试维度+关卡流程图)。
 * ★ 数字纪律:全部出自 bohui-facts;年开发数等资料没有的指标不编。★
 * 标题与能力页/首页同数据版块刻意错开,避免 audit-live 撞标题。
 */
import { d1 } from './d1.mjs';
import { writeFileSync } from 'node:fs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [];

/* ══ 研发创新页(44)══════════════════════════════════════════ */
const rndStatsZh = { tone: 'ink', items: [
  { value: '30+', unit: '人', label: '资深研发团队' },
  { value: '13,000+', unit: '个', label: '成熟配方技术储备' },
  { value: '3', unit: '条', label: '自研技术路线(发酵 · 闪萃 · 生物合成)' },
  { value: '20,000+', unit: '篇', label: '古方文献数字化整理' },
] };
const rndStatsEn = { tone: 'ink', items: [
  { value: '30+', unit: '', label: 'Senior R&D specialists' },
  { value: '13,000+', unit: '', label: 'Proven formulations on file' },
  { value: '3', unit: '', label: 'In-house routes: fermentation · extraction · biosynthesis' },
  { value: '20,000+', unit: '', label: 'Classical formula texts digitised' },
] };

const rndEviZh = {
  title: '自研技术:三条路线的实测数据',
  intro: '研发页不该只有形容词 —— 三条自研路线,每条给出可复核的数据与出处。',
  items: [
    { claim: '发酵转化路线:稀有人参皂苷活性提升 10–20 倍', proof: '特定微生物分解植物细胞壁,释放并转化活性成分;同一路线可将农药残留降解 90% 以上 —— 活性与安全同一步提升。', source: '自研发酵转化体系' },
    { claim: '低温闪萃路线:热敏活性保留率 95% 以上', proof: '0–10℃ 提取窗口保护热敏成分,物理场辅助传质将提取效率再提 40% —— 保留率与效率不是二选一。', source: '低温闪萃工艺' },
    { claim: '生物合成路线:rhCOLL 重组人源化胶原蛋白', proof: '以合成生物学制备高活性功能成分;与暨南大学的产学研合作是这条路线的学术底座。', source: '暨南大学产学研合作' },
  ],
};
const rndEviEn = {
  title: 'In-house technology: measured results on three routes',
  intro: 'An R&D page should carry more than adjectives — three in-house routes, each with verifiable numbers and their source.',
  items: [
    { claim: 'Fermentation route: rare ginsenoside activity up 10–20×', proof: 'Targeted microbes break down plant cell walls to release and convert actives; the same route degrades pesticide residues by 90%+ — activity and safety rise together.', source: 'In-house fermentation system' },
    { claim: 'Cold flash extraction route: 95%+ retention of heat-sensitive actives', proof: 'A 0–10℃ extraction window protects sensitive actives while physical-field assisted mass transfer lifts efficiency another 40% — retention and speed are not a trade-off.', source: 'Cold flash extraction process' },
    { claim: 'Biosynthesis route: rhCOLL recombinant humanised collagen', proof: 'High-activity functional ingredients built with synthetic biology; the joint programme with Jinan University is the academic base of this route.', source: 'Jinan University partnership' },
  ],
};

/* ══ 质量与合规页(48)════════════════════════════════════════ */
const qStatsZh = { tone: 'paper', items: [
  { value: '2', unit: '张', label: 'DEKRA 双认证(GMPC · ISO 22716)' },
  { value: '4', unit: '性', label: '体验 · 功效 · 稳定 · 兼容全维测试' },
  { value: '10', unit: '道', label: '安全把关关卡' },
  { value: '10万级', unit: 'GMP', label: '洁净生产车间标准' },
] };
const qStatsEn = { tone: 'paper', items: [
  { value: '2', unit: '', label: 'DEKRA certificates: GMPC · ISO 22716' },
  { value: '4', unit: '', label: 'Test dimensions: experience · efficacy · stability · compatibility' },
  { value: '10', unit: '', label: 'Safety gates before release' },
  { value: 'Class 100k', unit: 'GMP', label: 'Cleanroom standard' },
] };

const qMatrixZh = {
  title: '严苛四性测试',
  intro: '「测过了」三个字不算数 —— 四个维度,每个维度都有明确的测试内容,报告随批可查。',
  items: [
    { id: 'exp', title: '体验性', desc: '使用感、肤感、气味等消费者体验维度评估 —— 样品阶段就测,不等大货。' },
    { id: 'eff', title: '功效性', desc: '功效成分验证与临床功效测试,确保宣称真实有效 —— 做不出证据的宣称不上标签。' },
    { id: 'stab', title: '稳定性', desc: '耐热、耐寒、离心等全周期稳定性考察 —— 货架期内不分层、不变色、不失效。' },
    { id: 'comp', title: '兼容性', desc: '包材相容性与防腐挑战测试 —— 料体和瓶子的化学反应,出厂前就要打完。' },
  ],
};
const qMatrixEn = {
  title: 'Four-property testing',
  intro: '"It was tested" is not an answer — four dimensions, each with defined test content and batch-linked reports.',
  items: [
    { id: 'exp', title: 'Experience', desc: 'Sensory, skin-feel and scent evaluation — run at the sample stage, not after mass production.' },
    { id: 'eff', title: 'Efficacy', desc: 'Active verification and clinical efficacy testing — claims without evidence never reach the label.' },
    { id: 'stab', title: 'Stability', desc: 'Heat, cold and centrifuge testing across the shelf life — no separation, discolouration or loss of potency.' },
    { id: 'comp', title: 'Compatibility', desc: 'Packaging compatibility and preservative challenge testing — formula-and-bottle chemistry settled before shipping.' },
  ],
};

const qProcZh = {
  title: '十道安全把关:六个关键节点',
  intro: '含微生物、重金属、包材、稳定性等十道关卡 —— 源头可追溯、过程可管控、风险可预警。这里列出采购最常追问的六个节点:',
  steps: [
    { no: '01', title: '原料验收', desc: '进厂原料逐批检验,不合格不入库。' },
    { no: '02', title: '配方审核', desc: '功效、合规与成本三方会审后才放行进产。' },
    { no: '03', title: '中试放大', desc: '样品到大货之间的工艺验证,批间一致性在这一步锁定。' },
    { no: '04', title: '在线巡检', desc: '生产过程实时质量监控,异常参数自动预警。' },
    { no: '05', title: '成品检验', desc: '成品出厂前全检,四性测试报告随批归档。' },
    { no: '06', title: '出厂放行', desc: '质量负责人签字放行,批生产记录与留样可回查。' },
  ],
};
const qProcEn = {
  title: 'Ten safety gates: six key checkpoints',
  intro: 'Ten gates in total — microbiology, heavy metals, packaging, stability and more — traceable at source, controlled in process, risk flagged early. The six checkpoints buyers ask about most:',
  steps: [
    { no: '01', title: 'Incoming inspection', desc: 'Every raw-material batch tested on arrival; failures never enter storage.' },
    { no: '02', title: 'Formula review', desc: 'Efficacy, compliance and cost reviewed together before production release.' },
    { no: '03', title: 'Pilot scale-up', desc: 'Process validation between sample and mass production — batch consistency is locked here.' },
    { no: '04', title: 'In-line patrol', desc: 'Real-time quality monitoring with automatic deviation alerts.' },
    { no: '05', title: 'Finished-goods testing', desc: 'Full inspection before release, with four-property reports filed per batch.' },
    { no: '06', title: 'Release sign-off', desc: 'Quality lead signs off; batch records and retained samples stay auditable.' },
  ],
};

/* ══ 组 SQL ══════════════════════════════════════════════════ */
const plan = [
  [44, 'statsband', 5, rndStatsZh, rndStatsEn],
  [44, 'evidence', 105, rndEviZh, rndEviEn],
  [48, 'statsband', 5, qStatsZh, qStatsEn],
  [48, 'matrix', 112, qMatrixZh, qMatrixEn],
  [48, 'process', 115, qProcZh, qProcEn],
];
for (const [page] of plan) {
  // 每页只清本脚本自己的 sort 槽,幂等重跑安全
}
sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE (page_id=44 AND sort_order IN (5,105)) OR (page_id=48 AND sort_order IN (5,112,115)));`);
sql.push(`DELETE FROM blocks WHERE (page_id=44 AND sort_order IN (5,105)) OR (page_id=48 AND sort_order IN (5,112,115));`);
for (const [page, type, order, zh, en] of plan) {
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${page}, '${type}', ${order}, 1);`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(zh))}, 0),
    ((SELECT id FROM blocks WHERE page_id=${page} AND sort_order=${order}), 'en', ${lit(JSON.stringify(en))}, 0);`);
}

const file = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/seed-rnd-quality.sql';
writeFileSync(file, sql.join('\n'));
d1(file, { file: true });
for (const pid of [44, 48]) {
  console.log(`页 ${pid}:`);
  for (const r of d1(`SELECT b.sort_order, b.type, length(i.data_json) zh FROM blocks b LEFT JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn' WHERE b.page_id=${pid} AND b.is_visible=1 ORDER BY b.sort_order`)) {
    console.log(' ', r.sort_order, r.type, r.zh + '字');
  }
}
