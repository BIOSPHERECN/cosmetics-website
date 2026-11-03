/**
 * 「生产制造」全站文案专业化(创始人 2026-08-31:「这几个字,还是很不专业啊!
 * 一定要是专业的化妆品工厂!」)。
 *
 * 旧句三宗罪:①「四条产线」与已发布口径(15 条自动化产线)打架;
 * ②「洁护/香氛」品类叫法与站内品类页(身体洗护/口腔护理)不一致;
 * ③通篇没有一个工厂行话 —— 读起来像贸易公司,不像化妆品工厂。
 *
 * 新文案用真行话(均质乳化/灌装封尾/柔性排产/批生产记录/并单/留样),
 * 数字只用 bohui-facts 口径:15 条产线、10 万级 GMP、面膜 50 万片/日、
 * 水乳霜 30 万个/日、四性测试、十道安全把关。
 * 只写 zh-cn / en;受影响块的其他语种旧译整行删除,交给 translate-backfill 重翻。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const LEAD_ZH = '护肤、彩妆、身体洗护、口腔护理四大品类同厂共线:15 条自动化产线柔性排产,均质乳化、灌装封尾、贴标装箱全程在 10 万级 GMP 洁净车间完成;一张订单可跨品类并单生产、一次交付。';
const LEAD_EN = 'Four categories — skincare, colour cosmetics, body & hair care and oral care — run side by side in one plant: 15 automated lines under flexible scheduling, with emulsifying, filling, sealing, labelling and cartoning all inside a Class-100,000 GMP cleanroom. One order can combine categories and ship as one delivery.';

const PROSE_ZH = [
  '车间按 10 万级 GMP 洁净标准建设与运行,乳化、称量、灌装、包装分区管理;15 条自动化产线覆盖膏霜、精华、面膜、洁护与口腔护理剂型,面膜日产能 50 万片以上、水乳霜日产能 30 万个以上。',
  '生产执行 AI 精准投料与在线检测:批间一致性由算法投料与实时监控保障,异常参数自动预警;每批留样、批生产记录完整可查,成品经四性测试与十道安全把关放行。',
  '同一订单可跨品类并单排产 —— 四大品类在同一质量体系内共线管理,省掉多厂协调与分批物流;出口订单随单配套 COA、MSDS 等文件。',
];
const PROSE_EN = [
  'The plant is built and run to Class-100,000 GMP cleanroom standards, with zoned emulsifying, weighing, filling and packing areas. 15 automated lines cover creams, serums, sheet masks, cleansing and oral-care formats, with daily capacity above 500,000 masks and 300,000 lotion and cream units.',
  'Production runs on AI dosing and in-line inspection: batch-to-batch consistency is held by algorithmic dosing and real-time monitoring with automatic deviation alerts; every batch keeps retained samples and complete batch records, and finished goods clear four-property testing plus ten safety gates before release.',
  'One order can combine categories on one production schedule — all four categories share a single quality system, cutting multi-factory coordination and split shipments; export orders ship with COA, MSDS and supporting documents.',
];

const TAG_ZH = '从一株药材到一支成品 —— 护肤、彩妆、身体洗护、口腔护理四大品类同厂共线;15 条自动化产线、10 万级 GMP 洁净车间,一张订单跨品类并单交付。';
const TAG_EN = 'From a single herb to a finished product — skincare, colour, body & hair care and oral care in one plant; 15 automated lines, a Class-100,000 GMP cleanroom, one order combined across categories.';

const HEROES = [39, 71, 103, 135, 167];
const PROSES = [40, 72, 104, 136, 168];
const touched = [];

function patch(blockId, lang, fn) {
  const row = d1(`SELECT rowid rid, data_json d FROM block_i18n WHERE block_id=${blockId} AND lang='${lang}'`)[0];
  if (!row) { console.log(`#${blockId} ${lang} 无行,跳过`); return; }
  const data = JSON.parse(row.d);
  fn(data);
  d1(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))}, mt=0 WHERE rowid=${row.rid}`);
  touched.push(blockId);
  console.log(`#${blockId} ${lang} ✓`);
}

for (const id of HEROES) {
  patch(id, 'zh-cn', (d) => { d.lead = LEAD_ZH; });
  patch(id, 'en', (d) => { d.lead = LEAD_EN; });
}
for (const id of PROSES) {
  patch(id, 'zh-cn', (d) => { d.paragraphs = PROSE_ZH; });
  patch(id, 'en', (d) => { d.paragraphs = PROSE_EN; });
}
/* 首页店招 tagline(旧句还把「口腔」写成了「香氛」) */
patch(234, 'zh-cn', (d) => { d.tagline = TAG_ZH; });
patch(234, 'en', (d) => { d.tagline = TAG_EN; });

/* beauty2oem 首页矩阵:只换含旧句的 desc */
patch(3, 'zh-cn', (d) => {
  for (const it of d.items ?? []) {
    if (/不必分散到多家工厂/.test(it.desc ?? '')) it.desc = LEAD_ZH;
  }
});
patch(3, 'en', (d) => {
  for (const it of d.items ?? []) {
    if (/single roof|multiple factories|four (production )?lines/i.test(it.desc ?? '')) it.desc = LEAD_EN;
  }
});

/* 能力页三类活(#291)卡片小注专业化 */
const NOTES_ZH = { '生产制造': '四大品类共线 · 15 条产线柔性排产', '品牌孵化': '配方、包材、备案全案起步', '配方复刻': '基准样逆向 + 合规化改造', '出口合规': '按目标市场出具注册与随单文件' };
patch(291, 'zh-cn', (d) => {
  for (const it of d.items ?? []) if (NOTES_ZH[it.label]) it.note = NOTES_ZH[it.label];
});
const NOTES_EN = { 'Manufacturing': 'Four categories, 15 flexible lines', 'Brand incubation': 'Formula, packaging and filings from zero', 'Formula replication': 'Benchmark reverse-engineering, made compliant', 'Export compliance': 'Registrations and shipping docs per market' };
patch(291, 'en', (d) => {
  for (const it of d.items ?? []) if (NOTES_EN[it.label]) it.note = NOTES_EN[it.label];
});

/* 受影响块的小语种旧译删除 → translate-backfill 自动重翻 */
const ids = [...new Set(touched)].join(',');
const del = d1(`DELETE FROM block_i18n WHERE block_id IN (${ids}) AND lang NOT IN ('zh-cn','en') RETURNING block_id`);
console.log(`小语种旧译删除 ${del.length} 行(待自动重翻):块 ${ids}`);
