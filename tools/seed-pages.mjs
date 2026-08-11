/**
 * 给「首页以外的 16 个页面」灌内容 —— 修「下一层全是空白」。
 *
 * 之前只给首页建了版块,其余页面是空壳:导航点进去有标题、没内容。
 * 那跟单页没有本质区别 —— 有导航不等于有网站。
 * 每页至少要有:首屏 + 正文。正文按各页职能写实,不是 lorem 占位。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from '../packages/core/src/registry.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh-cn', 'en'];
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => q(JSON.stringify(v));

const P = {
  about: {
    zh: ['帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。',
         '我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。'],
    en: ['BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.',
         'We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market.'],
  },
  'about/group': {
    zh: ['集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。',
         '这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。'],
    en: ['Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.',
         'This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand.'],
  },
  'about/history': {
    zh: ['从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。'],
    en: ['From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.'],
  },
  'about/plants': {
    zh: ['乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。',
         '洁净等级按剂型分区,关键工序局部提升至更高等级。'],
    en: ['Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.',
         'Cleanroom class is zoned by format, with critical steps locally upgraded.'],
  },
  capabilities: {
    zh: ['我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。',
         '品牌方可以只要其中一项,也可以整包交给我们。'],
    en: ['We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.',
         'Take one, or hand over the whole path.'],
  },
  'capabilities/manufacturing': {
    zh: ['护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。'],
    en: ['Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.'],
  },
  'capabilities/incubation': {
    zh: ['没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。'],
    en: ['No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.'],
  },
  'capabilities/packaging': {
    zh: ['包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。'],
    en: ['Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.'],
  },
  rnd: {
    zh: ['研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。',
         '每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。'],
    en: ['R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.',
         'Every claim needs a matching test plan. If a direction cannot be substantiated, we say so.'],
  },
  'rnd/formulation': {
    zh: ['配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。'],
    en: ['The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.'],
  },
  'rnd/lab': {
    zh: ['稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。'],
    en: ['Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.'],
  },
  products: {
    zh: ['下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。'],
    en: ['Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.'],
  },
  quality: {
    zh: ['出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。',
         '证书编号与有效期可在询盘后提供扫描件核验。'],
    en: ['Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.',
         'Certificate numbers and validity can be verified against scanned copies upon inquiry.'],
  },
  contact: {
    zh: ['把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。'],
    en: ['A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.'],
  },
  privacy: {
    zh: ['我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。',
         '这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。'],
    en: ['We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.',
         'This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email.'],
  },
  terms: {
    zh: ['本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。',
         '站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。'],
    en: ['Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.',
         'All trademarks and content belong to BOHUI Group and may not be reproduced without permission.'],
  },
};

const sql = ['-- 由 tools/seed-pages.mjs 生成,勿手改。重跑即刷新。'];
// 只清非首页版块;首页的不动
sql.push(`DELETE FROM block_i18n WHERE block_id IN (SELECT b.id FROM blocks b JOIN pages p ON p.id=b.page_id WHERE p.slug <> '');`);
sql.push(`DELETE FROM blocks WHERE page_id IN (SELECT id FROM pages WHERE slug <> '');`);

for (const s of SITES) {
  for (const [slug, copy] of Object.entries(P)) {
    sql.push(`INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id=${q(s.id)} AND slug=${q(slug)};`);
    for (const lang of LANGS) {
      const t = copy[lang === 'zh-cn' ? 'zh' : 'en'];
      const data = { eyebrow: s.name, title: '', lead: t[0], ctaPrimary: lang === 'zh-cn' ? '发起询盘' : 'Start an inquiry' };
      sql.push(`INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,${q(lang)},${j(data)} FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id=${q(s.id)} AND p.slug=${q(slug)} AND b.type='hero' AND b.sort_order=0;`);
    }
    sql.push(`INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id=${q(s.id)} AND slug=${q(slug)};`);
    for (const lang of LANGS) {
      const t = copy[lang === 'zh-cn' ? 'zh' : 'en'];
      sql.push(`INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,${q(lang)},${j({ paragraphs: t })} FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id=${q(s.id)} AND p.slug=${q(slug)} AND b.type='prose' AND b.sort_order=1;`);
    }
  }
}

mkdirSync(join(ROOT, 'packages/cms'), { recursive: true });
writeFileSync(join(ROOT, 'packages/cms/seed-pages.sql'), sql.join('\n') + '\n', 'utf8');
console.log(`✓ ${sql.length} 条语句 · ${SITES.length} 站 × ${Object.keys(P).length} 页`);
