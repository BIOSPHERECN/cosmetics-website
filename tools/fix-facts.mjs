/**
 * 把散落在内页里的编造数字换成真实数据,并打散首页尾部三个认证墙连排。
 *
 * 编造的数字比缺数字危险得多:采购一定会拿产能和交期去核对,
 * 而这两项恰恰是我编得最"具体"的地方(28,000 ㎡、25 天打样、43 国)。
 * 真实值来自创始人提供的公司介绍,见 tools/bohui-facts.mjs。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
import { FACTS as F } from './bohui-facts.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const fig = (k) => F.figures.find((f) => f.key === k);
const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder IN ('帛卉实拍','原料溯源')`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));

const st = (k, label) => { const f = fig(k); return { value: (f.prefix ? f.prefix + ' ' : '') + f.value, unit: f.unit, label: label ?? f.zh }; };

/** 每个要改的版块给一份新数据。改整块而不是做字符串替换 ——
 *  替换会留下语义不通的句子(把 28,000 换成 20,000 后"经验 18 年"还在)。 */
const FIX = {
  252: { tone: 'ink', items: [st('area', '全球生产基地总面积'), st('lines', '自动化生产流水线'),
                              st('formulas', '成熟配方技术储备'), st('suppliers', '战略合作供应商')] },
  289: { tone: 'ink', items: [st('area', '全球生产基地总面积'), st('warehouse', '智能化自有仓储'),
                              st('mask', '面膜类日产能'), st('cream', '水乳霜类日产能')] },
  265: { tone: 'paper', items: [st('lines', '自动化生产流水线'), st('cleanroom', '洁净车间标准'),
                                st('mask', '面膜类日产能'), st('cream', '水乳霜类日产能')] },
};

const sql = [];
for (const [id, data] of Object.entries(FIX)) {
  sql.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))}, mt=0 WHERE block_id=${id} AND lang='zh-cn';`);
  sql.push(`DELETE FROM block_i18n WHERE block_id=${id} AND lang<>'zh-cn';`);   // 旧译文对应的是旧数字,必须重翻
}

/* 288(about/plants 的车间网格)与 268 / 277(打样周期)只改其中一句 */
const rows = d1(`SELECT block_id, data_json FROM block_i18n WHERE block_id IN (288,268,277) AND lang='zh-cn'`);
for (const r of rows) {
  let s = r.data_json;
  s = s.replace(/十万级 · 28,?000 ㎡/g, '10 万级 GMP · 20,000+ ㎡ 双基地')
       .replace(/28,?000\s*㎡/g, '20,000+ ㎡')
       .replace(/从收到需求到寄出样品,25 天/g, '从收到需求到寄出样品,3–7 天')
       .replace(/第 1–5 天配方方向与法规预判,第 6–15 天小试与调整,第 16–22 天稳定性初测,第 23–25 天打样寄出。/g,
                '依托 13,000+ 成熟配方储备与 15 条智能产线,支持配方快速定制调整与柔性起订量。')
       .replace(/打样周期能压到 25 天,靠的就是中间没有跨公司的等待。/g,
                '打样能做到 3–7 天,靠的就是中间没有跨公司的等待。')
       .replace(/25 天/g, '3–7 天');
  if (s !== r.data_json) {
    sql.push(`UPDATE block_i18n SET data_json=${lit(s)}, mt=0 WHERE block_id=${r.block_id} AND lang='zh-cn';`);
    sql.push(`DELETE FROM block_i18n WHERE block_id=${r.block_id} AND lang<>'zh-cn';`);
  }
}

/* ── 首页尾部三个认证墙连排,插东西换气 ──────────────────────
   合作品牌 → 全球化布局(陈述) → 原料供应商 → 企业文化通栏 → 资质认证 */
const home = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0].id;
const tail = d1(`SELECT b.id, b.type, b.sort_order, i.data_json FROM blocks b
                   JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                  WHERE b.page_id=${home} AND b.is_visible=1 AND b.type IN ('certs','statement','inquiry')
                  ORDER BY b.sort_order`);
const brand = tail.find((b) => /合作品牌/.test(b.data_json));
const supply = tail.find((b) => /战略原料供应商/.test(b.data_json));
const cert = tail.find((b) => /资质与国际认证/.test(b.data_json));
const globalStmt = tail.find((b) => b.type === 'statement');
const inq = tail.find((b) => b.type === 'inquiry');

let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;
const cultureId = nextId++;
sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${cultureId},${home},'bandimg',0,'{}',1);`);
sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${cultureId},'zh-cn',${lit(JSON.stringify({
  image: M['culture-corridor-w1600'] ?? '', alt: 'AI 智造走廊:从草本原料到智能护肤方案',
  display: 'CULTURE', title: '专业 · 创新 · 纯净 · 长效 —— 写在走廊上,也写在批记录的签字栏里',
  ctaText: '看公司介绍', ctaHref: '/zh-cn/about/',
}))},0,datetime('now')) ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json;`);

const order = [brand, globalStmt, supply, { id: cultureId }, cert, inq].filter(Boolean);
order.forEach((b, i) => sql.push(`UPDATE blocks SET sort_order=${200 + i * 10}, is_visible=1 WHERE id=${b.id};`));

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/facts.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`改了 ${Object.keys(FIX).length + rows.length} 个版块的数字,并把尾部三个认证墙打散`);
console.log('  新尾部顺序:合作品牌 → 全球化布局 → 原料供应商 → 企业文化通栏 → 资质认证 → 询盘');
