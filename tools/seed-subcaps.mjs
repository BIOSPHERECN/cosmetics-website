/**
 * 能力子页深化第三批:品牌孵化(42)+ 包材方案(43)。
 * 数字纪律:13,000+ 配方 / 3–7 天打样 / 四大市场与注记 / 包材供应商实名
 * 全部出自 bohui-facts;客户品牌墙已在首页,不重复铺。
 */
import { d1 } from './d1.mjs';
import { writeFileSync } from 'node:fs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [];

/* ══ 品牌孵化(42)══════════════════════════════════════════ */
const stagZh = {
  eyebrow: 'INCUBATION PATH',
  title: '孵化六步:从想法到上架',
  intro: '「没配方没包材也能开始」不是口号,是一条有交付物的流水线 —— 每一步结束,您手里都多一份能拍板的东西。',
  stages: [
    { name: '品类定位', code: 'INSIGHT', desc: 'AI 选品用大数据洞察趋势 —— 先定卖给谁、切哪个价位段,交付一页品类定位书。' },
    { name: '产品线规划', code: 'LINE', desc: '从定位倒推 SKU 组合与上市节奏,首发做几支、后续怎么补,写成产品线路线图。' },
    { name: '配方选型', code: 'FORMULA', desc: '在 13,000+ 成熟配方储备里按定位选型改良 —— 不从零试错,起点就是被验证过的方子。' },
    { name: '包材与视觉', code: 'PACK', desc: '结构打样与相容性测试同步走,包材和膏体当一对来配,不是两件独立采购的东西。' },
    { name: '备案与合规', code: 'FILE', desc: '按目标市场做注册备案预判 —— 中国备案、欧盟 CPNP、美国 FDA、中东 HALAL,路径提前锁定。' },
    { name: '打样到量产', code: 'LAUNCH', desc: '成熟方向 3–7 天出样,确认后进入中试与量产 —— 和所有大货同一套四性测试与十道把关。' },
  ],
  ctaLabel: '把想法发过来',
};
const stagEn = {
  eyebrow: 'INCUBATION PATH',
  title: 'Six steps from idea to shelf',
  intro: '"Start with nothing but an idea" is not a slogan — it is a pipeline with deliverables. Every step ends with something you can sign off on.',
  stages: [
    { name: 'Category positioning', code: 'INSIGHT', desc: 'AI product selection reads trend data at scale — who you sell to and at what price band, delivered as a one-page positioning brief.' },
    { name: 'Product-line planning', code: 'LINE', desc: 'Work backwards from positioning to SKU mix and launch cadence — a written product-line roadmap.' },
    { name: 'Formula selection', code: 'FORMULA', desc: 'Shortlist and adapt from 13,000+ proven formulations — you start from validated recipes, not trial and error.' },
    { name: 'Packaging & visuals', code: 'PACK', desc: 'Structural sampling and compatibility testing run in parallel — packaging and formula are matched as a pair.' },
    { name: 'Filings & compliance', code: 'FILE', desc: 'Registration mapped to your target market — China filing, EU CPNP, US FDA, HALAL for the Middle East — locked in early.' },
    { name: 'Sample to scale', code: 'LAUNCH', desc: '3–7 day sampling on mature directions, then pilot and mass production — same four-property tests and ten safety gates as every batch.' },
  ],
  ctaLabel: 'Send us the idea',
};

const mktZh = {
  title: '出海四条市场通道',
  intro: '孵化不止做出产品,还要送得进市场 —— 四条通道,各有各的合规底牌。',
  items: [
    { id: 'sea', title: '东南亚', desc: '印尼工厂本土化交付 —— 关税、物流与本地合规一次解决。' },
    { id: 'me', title: '中东', desc: 'HALAL 认证畅通准入,清真合规从原料端就开始管理。' },
    { id: 'west', title: '欧美', desc: 'ISO 22716 国际标准背书,欧盟 CPNP 通报与美国 FDA 设施注册经验支撑上架。' },
    { id: 'latam', title: '巴西 / 南美', desc: '亚马逊植物双源战略 —— 用本土认同的成分故事切入南美市场。' },
  ],
};
const mktEn = {
  title: 'Four market channels for going global',
  intro: 'Incubation is not finished when the product exists — it has to enter the market. Four channels, each with its own compliance card.',
  items: [
    { id: 'sea', title: 'Southeast Asia', desc: 'Local delivery from the Indonesia plant — tariffs, logistics and local compliance solved in one move.' },
    { id: 'me', title: 'Middle East', desc: 'HALAL certification clears entry; halal compliance is managed from the raw-material end.' },
    { id: 'west', title: 'Europe & North America', desc: 'Backed by ISO 22716, with EU CPNP notification and US FDA facility-registration experience behind listings.' },
    { id: 'latam', title: 'Brazil & South America', desc: 'The Amazonian-botanical dual-source strategy — enter South America with an ingredient story locals recognise.' },
  ],
};

/* ══ 包材方案(43)══════════════════════════════════════════ */
const packZh = {
  title: '包材四道验证',
  intro: '包材不是「买个瓶子」—— 从结构到灌装,四道验证做完才允许上产线。',
  items: [
    { claim: '结构打样:瓶罐、软管、泵头、纸盒同步出样', proof: '结构、容量、口径一次定齐 —— 改结构比改配方便宜,但只在打样阶段成立。', source: '结构打样流程' },
    { claim: '相容性测试:料体和包材当一对来验', proof: '包材相容性与防腐挑战测试(四性测试之「兼容性」)—— 精华胀瓶、泵头回吸这类问题必须死在出厂前。', source: '四性测试 · 兼容性' },
    { claim: '头部包材供应链直采', proof: 'Amcor 安姆科、ALPLA 阿普拉、EPL 爱索尔与联昌、江门联记 —— 300+ 战略供应商体系内的包材线,新品牌也拿得到大厂起订量。', source: '战略供应商体系' },
    { claim: '灌装适配:中试线上验完才放量产', proof: '封尾良率、泵头出液量、贴标定位 —— 包材问题在中试放大阶段暴露,不带进大货。', source: '中试放大流程' },
  ],
};
const packEn = {
  title: 'Four packaging verifications',
  intro: 'Packaging is not "buying a bottle" — four verifications stand between a structure and the production line.',
  items: [
    { claim: 'Structural sampling: bottles, tubes, pumps and cartons together', proof: 'Structure, volume and neck size settled in one pass — changing structure is cheap, but only at the sampling stage.', source: 'Structural sampling process' },
    { claim: 'Compatibility: formula and packaging tested as a pair', proof: 'Packaging compatibility and preservative challenge testing (the compatibility leg of four-property testing) — swelling bottles and pump suck-back must die before shipping.', source: 'Four-property testing' },
    { claim: 'Direct lines to top packaging suppliers', proof: 'Amcor, ALPLA, EPL, CLC and KKP — packaging lines inside our 300+ strategic-supplier system, giving new brands access to big-factory MOQs.', source: 'Strategic supplier system' },
    { claim: 'Filling fit: verified on the pilot line before scale', proof: 'Seal yield, pump dosage, label registration — packaging issues surface at pilot scale-up, never in mass production.', source: 'Pilot scale-up process' },
  ],
};

sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE (page_id=42 AND sort_order IN (115,118)) OR (page_id=43 AND sort_order=115));`);
sql.push(`DELETE FROM blocks WHERE (page_id=42 AND sort_order IN (115,118)) OR (page_id=43 AND sort_order=115);`);
const plan = [
  [42, 'stages', 115, stagZh, stagEn],
  [42, 'matrix', 118, mktZh, mktEn],
  [43, 'evidence', 115, packZh, packEn],
];
for (const [page, type, order, zh, en] of plan) {
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${page}, '${type}', ${order}, 1);`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(zh))}, 0),
    ((SELECT id FROM blocks WHERE page_id=${page} AND sort_order=${order}), 'en', ${lit(JSON.stringify(en))}, 0);`);
}

const file = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/seed-subcaps.sql';
writeFileSync(file, sql.join('\n'));
d1(file, { file: true });
for (const pid of [42, 43]) {
  console.log(`页 ${pid}:`, d1(`SELECT GROUP_CONCAT(b.sort_order || ':' || b.type, ' | ') s FROM blocks b WHERE b.page_id=${pid} AND b.is_visible=1 ORDER BY b.sort_order`)[0].s);
}
