/**
 * 种植基地页第三轮丰富(创始人:「继续丰富,而不是等待!」「要专业」)。
 * 新弹药:从《帛卉公司介绍_2026.pdf》抽出的两张真实图片(创始人现成给料):
 *   /media/191 种植大棚实拍(品种标识牌+分区) /media/192 本草纲目古籍图
 * 新增:全宽实拍带 → 古方智慧图文 → 一味原料的旅程(六站)→ 采购四问。
 * 数字纪律:全部出自 bohui-facts / PDF 原稿。
 */
import { d1 } from './d1.mjs';
import { writeFileSync } from 'node:fs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const PAGE = 96;
const sql = [];

const bandZh = {
  image: '/media/191', alt: '合作种植基地大棚实拍:品种标识牌与分区管理', display: 'FIELD',
  title: '基地实拍:每一畦都有名有姓',
  ctaText: '看五味原料档案',
};
const bandEn = {
  image: '/media/191', alt: 'Partner cultivation base: labelled plots under shade housing', display: 'FIELD',
  title: 'On the ground: every plot named and labelled',
  ctaText: 'Browse the botanical files',
};

const splitZh = {
  image: '/media/192', alt: '本草纲目古籍:人参、黄芪、当归条目', flip: true, tone: 'sand',
  eyebrow: 'CLASSICAL WISDOM',
  title: '古籍是灵感,数据说了算',
  body: '依托 20,000 余篇传统古方文献的数字化整理,原料的选育与配伍有典可依 ——《本草纲目》里的人参、黄芪、当归,先过现代功效验证,再进配方库。古方给方向,实测给答案。',
  ctaText: '看研发怎么验证',
};
const splitEn = {
  image: '/media/192', alt: 'Classical materia medica: ginseng, astragalus and angelica entries', flip: true, tone: 'sand',
  eyebrow: 'CLASSICAL WISDOM',
  title: 'Classics inspire; data decides',
  body: 'Built on 20,000+ digitised classical formula texts, our selection and pairing of botanicals is grounded in the canon — and every classical lead passes modern efficacy validation before it enters the formulation library. The classics point the way; measurements make the call.',
  ctaText: 'See how R&D validates',
};

const stagZh = {
  eyebrow: 'FROM FIELD TO PLANT',
  title: '一味原料的旅程',
  intro: '从山头到车间,一味原料要走完六站 —— 每一站都有记录,每一步都可回查。',
  stages: [
    { name: '择时采收', code: 'HARVEST', desc: '依据植物生长周期与活性成分峰值确定最佳采收时点 —— 采早了没劲,采晚了失活。' },
    { name: '分级入库', code: 'GRADE', desc: '同一味原料分级定价、分级入库,活性数据随批建档。' },
    { name: '农残检测', code: 'TEST', desc: '种植环境、施肥记录、采收批次、检测报告一批一档,采购可调档核验。' },
    { name: '直采运输', code: 'TRANSIT', desc: '基地直采、不经贩料中间层,运输链路全程留痕。' },
    { name: '低温闪萃', code: 'EXTRACT', desc: '0–10℃ 提取窗口保护热敏活性,提取效率提升 40%。' },
    { name: '活性转化', code: 'CONVERT', desc: '发酵转化把稀有人参皂苷活性提升 10–20 倍 —— 原料的最后一公里在车间完成。' },
  ],
  ctaLabel: '要这批原料的检测报告',
};
const stagEn = {
  eyebrow: 'FROM FIELD TO PLANT',
  title: 'The journey of one botanical',
  intro: 'From hillside to cleanroom, every botanical passes six stations — each one recorded, each one auditable.',
  stages: [
    { name: 'Timed harvest', code: 'HARVEST', desc: 'Harvest timing set to the peak of active content in the growth cycle — too early is weak, too late is spent.' },
    { name: 'Graded intake', code: 'GRADE', desc: 'Each botanical is graded, priced and stored by grade, with activity data filed per batch.' },
    { name: 'Residue testing', code: 'TEST', desc: 'Environment, fertiliser records, harvest batch and test reports — one file per batch, open to buyers.' },
    { name: 'Direct transit', code: 'TRANSIT', desc: 'Sourced straight from the base, no middlemen, transport chain logged end to end.' },
    { name: 'Cold extraction', code: 'EXTRACT', desc: 'A 0–10℃ window protects heat-sensitive actives; extraction efficiency up 40%.' },
    { name: 'Bio-conversion', code: 'CONVERT', desc: 'Fermentation lifts rare ginsenoside activity 10–20× — the last mile of a botanical happens in the plant.' },
  ],
  ctaLabel: 'Request batch test reports',
};

const ansZh = {
  tone: 'paper',
  question: '关于原料溯源,采购最常问的四件事',
  answer: '帛卉化妆品的原料端:合作山地种植基地 20 余家,覆盖贵州毕节、新疆喀什、广东清远三大产区,外加亚马逊植物双源布局;分级采收、农残台账、基地直采、古方选育四道关走完才进厂。批次检测报告(活性物含量、农残、重金属)按批出具。',
  faqs: [
    { q: '可以指定产区吗?', a: '可以谈。三大产区各有气候逻辑,我们按配方的活性需求推荐产区;有指定产区需求的订单,在需求判定阶段确认可行性与批次安排。' },
    { q: '每批原料能提供检测报告吗?', a: '能。活性物含量、农残、重金属按批出具;种植环境与施肥记录在溯源台账里,一批一档可调档。' },
    { q: '「古方」是营销话术吗?', a: '不是拿来当故事讲的。20,000+ 篇古方文献做了数字化整理,古籍记载只作选育与配伍的线索,进配方库之前必须过现代功效验证 —— 古方给方向,数据说了算。' },
    { q: '亚马逊植物原料怎么合规?', a: '双源战略的南美侧按目的地市场做合规预判;面向巴西与南美市场的订单,用本土认同的成分叙事切入,注册路径在需求判定阶段一并锁定。' },
  ],
};
const ansEn = {
  tone: 'paper',
  question: 'Four things buyers ask about our raw-material traceability',
  answer: 'The raw-material side of BIOSPHERE: 20+ partner mountain cultivation bases across Bijie (Guizhou), Kashgar (Xinjiang) and Qingyuan (Guangdong), plus an Amazonian dual-source strategy. Graded harvesting, residue ledgers, direct sourcing and classics-guided selection all run before material enters the plant. Batch test reports — actives, pesticide residues, heavy metals — ship with every lot.',
  faqs: [
    { q: 'Can we specify a growing region?', a: 'Negotiable. Each region has its own climate logic; we recommend by the formula\u2019s activity needs, and region-specific orders are confirmed for feasibility at the scoping stage.' },
    { q: 'Do you provide per-batch test reports?', a: 'Yes — actives content, pesticide residues and heavy metals, issued per batch; growing environment and fertiliser records live in the traceability ledger, one file per batch.' },
    { q: 'Is the "classical formula" story just marketing?', a: 'No. 20,000+ classical texts have been digitised; the canon supplies leads for selection and pairing, and every lead passes modern efficacy validation before entering the library.' },
    { q: 'How do Amazonian botanicals stay compliant?', a: 'The South-American side of the dual-source strategy is regulation-checked per destination market; for Brazil and South America, registration paths are locked in at the scoping stage.' },
  ],
};

sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order IN (18,24,26,28));`);
sql.push(`DELETE FROM blocks WHERE page_id=${PAGE} AND sort_order IN (18,24,26,28);`);
const plan = [
  ['bandimg', 18, bandZh, bandEn],
  ['split', 24, splitZh, splitEn],
  ['stages', 26, stagZh, stagEn],
  ['answer', 28, ansZh, ansEn],
];
for (const [type, order, zh, en] of plan) {
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${PAGE}, '${type}', ${order}, 1);`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(zh))}, 0),
    ((SELECT id FROM blocks WHERE page_id=${PAGE} AND sort_order=${order}), 'en', ${lit(JSON.stringify(en))}, 0);`);
}
const file = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/seed-origin3.sql';
writeFileSync(file, sql.join('\n'));
d1(file, { file: true });
for (const r of d1(`SELECT b.sort_order, b.type, length(i.data_json) zh FROM blocks b LEFT JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn' WHERE b.page_id=${PAGE} AND b.is_visible=1 ORDER BY b.sort_order`)) {
  console.log(r.sort_order, r.type, r.zh + '字');
}
