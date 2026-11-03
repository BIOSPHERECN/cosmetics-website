/**
 * 种植基地页深化(创始人 2026-08-31:「种植基地也继续深挖,地点一定要准确!」)。
 *
 * 地点纪律:只用资料有据的产区 —— 贵州毕节、新疆喀什、广东清远(PDF 第 3 页
 * 「合作 20 余家,覆盖…等优质产区」)+ 亚马逊植物双源战略(PDF 市场页)。
 * 产区的气候地理特征用公开常识(毕节=乌蒙山区高海拔;喀什=绿洲农业带;
 * 清远=粤北、毗邻广州),不落具体亩数/证书号 —— 那些依旧留给运营按实补。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const PAGE = 96;
const sql = [];

const statsZh = { tone: 'paper', items: [
  { value: '20+', unit: '家', label: '合作山地种植基地' },
  { value: '3', unit: '大产区', label: '贵州毕节 · 新疆喀什 · 广东清远' },
  { value: '5', unit: '味', label: '核心原料溯源档案' },
  { value: '20,000+', unit: '篇', label: '古方文献数字化整理' },
] };
const statsEn = { tone: 'paper', items: [
  { value: '20+', unit: '', label: 'Partner mountain bases' },
  { value: '3', unit: '', label: 'Growing regions: Bijie · Kashgar · Qingyuan' },
  { value: '5', unit: '', label: 'Core botanicals with trace files' },
  { value: '20,000+', unit: '', label: 'Classical formula texts digitised' },
] };

const basesZh = {
  eyebrow: 'GROWING REGIONS',
  title: '合作产区,指得出来的地',
  intro: '「优质产区」四个字谁都会写 —— 我们直接给地名。三大产区各有各的气候逻辑,亩数与认证编号按实补录,资料未到不上墙。',
  items: [
    { type: 'grow', kind: '合作山地基地', name: '贵州 · 毕节产区', region: '乌蒙山区', focus: '高海拔山地地块,昼夜温差大、云雾多 —— 山地药材经典产区;执行分级采收与农残溯源台账', cert: '分级采收 · 一批一档' },
    { type: 'grow', kind: '合作山地基地', name: '新疆 · 喀什产区', region: '南疆绿洲农业带', focus: '日照长、气候干燥、病虫害压力小;种植环境与施肥记录随批建档', cert: '农残溯源台账' },
    { type: 'grow', kind: '合作山地基地', name: '广东 · 清远产区', region: '粤北山地', focus: '距广州基地最近的产区,鲜料在途时间短,采后尽快进厂初加工', cert: '就近直采' },
    { type: 'grow', kind: '双源战略', name: '亚马逊植物原料', region: '巴西 / 南美', focus: '东方草本 + 亚马逊植物的双源原料战略,支撑巴西与南美市场的本土成分需求', cert: '双源布局' },
  ],
  footnote: '合作山地种植基地 20 余家;各基地亩数、GAP/有机认证编号与当季采收批次由运营按实补充 —— 资料未到,宁可留白。',
};
const basesEn = {
  eyebrow: 'GROWING REGIONS',
  title: 'Named regions, not vague claims',
  intro: 'Anyone can write "premium growing regions" — we name them. Three regions, each with its own climate logic; plot sizes and certificate numbers are added as documents arrive, never before.',
  items: [
    { type: 'grow', kind: 'Partner mountain base', name: 'Bijie, Guizhou', region: 'Wumeng mountains', focus: 'High-altitude plots with big day–night temperature swings and frequent cloud cover — a classic mountain-herb region; graded harvesting and residue ledgers apply', cert: 'Graded harvest · one file per batch' },
    { type: 'grow', kind: 'Partner mountain base', name: 'Kashgar, Xinjiang', region: 'Southern Xinjiang oasis belt', focus: 'Long sunshine hours, dry climate, low pest pressure; growing environment and fertiliser records filed per batch', cert: 'Residue traceability ledger' },
    { type: 'grow', kind: 'Partner mountain base', name: 'Qingyuan, Guangdong', region: 'Northern Guangdong hills', focus: 'The region closest to the Guangzhou plant — short transit for fresh material, first processing soon after harvest', cert: 'Direct sourcing nearby' },
    { type: 'grow', kind: 'Dual-source strategy', name: 'Amazonian botanicals', region: 'Brazil / South America', focus: 'Eastern herbs plus Amazonian botanicals — a dual-source strategy supporting local-ingredient demand in Brazil and South America', cert: 'Dual sourcing' },
  ],
  footnote: '20+ partner mountain bases in total; plot sizes, GAP/organic certificate numbers and current-season harvest batches are added by operations as documents arrive — blank beats invented.',
};

const eviZh = {
  title: '原料进厂前的四道关',
  intro: '产区只是起点 —— 一味原料要过完这四道,才有资格进 10 万级车间。',
  items: [
    { claim: '分级采收标准体系', proof: '依据植物生长周期与活性成分峰值确定最佳采收时点;同一味原料分级入库,活性数据随批可查。', source: '采收标准体系' },
    { claim: '农残溯源台账', proof: '种植环境、施肥记录、采收批次、检测报告全链路建档 —— 一批一档,采购可调档核验。', source: '溯源台账系统' },
    { claim: '基地直采进厂', proof: '九仙草等草本原料由种植基地直采,批次信息与运输链路全程留痕,不经中间贩料。', source: '智能溯源体系' },
    { claim: '古方智慧选育', proof: '依托 20,000 余篇传统古方文献的数字化整理,原料选育与配伍有典可依、有据可查。', source: '古方文献库' },
  ],
};
const eviEn = {
  title: 'Four gates before raw material enters the plant',
  intro: 'The growing region is only the start — every botanical clears four gates before it may enter the Class-100,000 cleanroom.',
  items: [
    { claim: 'Graded harvest standards', proof: 'Harvest timing is set to the peak of active content in the growth cycle; each botanical is graded into storage with activity data filed per batch.', source: 'Harvest standard system' },
    { claim: 'Residue traceability ledger', proof: 'Growing environment, fertiliser records, harvest batches and test reports are filed end to end — one file per batch, open to buyer verification.', source: 'Traceability ledger' },
    { claim: 'Direct sourcing from bases', proof: 'Herbs such as jiuxiancao come straight from cultivation bases with batch and transport records intact — no middlemen.', source: 'Smart traceability system' },
    { claim: 'Classical-text guided selection', proof: 'Selection and pairing of botanicals draws on 20,000+ digitised classical formula texts — documented, not guessed.', source: 'Classical formula library' },
  ],
};

sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order IN (15,22,25));`);
sql.push(`DELETE FROM blocks WHERE page_id=${PAGE} AND sort_order IN (15,22,25);`);
const inserts = [
  ['statsband', 15, statsZh, statsEn],
  ['bases', 22, basesZh, basesEn],
  ['evidence', 25, eviZh, eviEn],
];
for (const [type, order, zh, en] of inserts) {
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${PAGE}, '${type}', ${order}, 1);`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(zh))}, 0),
    ((SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order=${order}), 'en', ${lit(JSON.stringify(en))}, 0);`);
}

import { writeFileSync } from 'node:fs';
const file = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/seed-origin2.sql';
writeFileSync(file, sql.join('\n'));
d1(file, { file: true });
console.log('完成。页 96 现有版块:');
for (const r of d1(`SELECT b.sort_order, b.type, length(i.data_json) zh FROM blocks b LEFT JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn' WHERE b.page_id=${PAGE} AND b.is_visible=1 ORDER BY b.sort_order`)) {
  console.log(r.sort_order, r.type, r.zh + '字');
}
