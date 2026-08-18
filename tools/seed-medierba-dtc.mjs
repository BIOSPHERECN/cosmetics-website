/**
 * 给 MEDIERBA 首页铺 DTC 版式的内容。
 *
 * MEDIERBA 是集团**自有品牌**,面向消费者;另外四个站是代工,面向采购。
 * 两者本来就该是两种语言 —— 工厂站讲产能与合规,品牌站讲仪式感与成分故事。
 * 所以这里不是"换个皮肤",是换一套信息架构:
 *   轮播首屏 → 一句招揽 → 通栏图 → 商品架 → 系列对开 → 陈述 → 系列对开
 *   → 精选小架 → 品牌故事 → 会员权益 → 社媒墙 → 订阅
 *
 * ★ 全程不出价 ★
 *   参照站每张卡带 $36-$58。帛卉是接单方不是零售方 ——
 *   代工客户看到零售价会直接拿它反推我们的成本,那是自己给谈判设障。
 *   卡片底部那行改成「可做规格」,信息密度不降,话题从价格拉回能力。
 *
 * 跑法:node tools/seed-medierba-dtc.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PAGE = 52;             // medierba 首页
const SITE = 'medierba';
const IMG = '/media/medierba';
mkdirSync('node_modules/.cache', { recursive: true });

const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const d1 = (args) => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...args],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/* 十二个品:名字取自参照站,规格由我们按代工口径补 —— 不写价格 */
const PRODUCTS = [
  ['人参微光精华',   'Ginseng Glow Serum',      1,  '精华 · 30/50ml · 玻璃滴管瓶', ['#e8d5b7', '#d9b98c', '#c9a227']],
  ['灵芝修护面霜',   'Reishi Repair Cream',     2,  '面霜 · 30/50g · 玻璃罐',      ['#efe7db', '#cbb9a0']],
  ['积雪草舒缓水',   'Centella Soothing Water', 3,  '化妆水 · 150/200ml',          ['#dbe7d8', '#b9d0b3']],
  ['绿茶平衡洁面',   'Green Tea Balm Cleanser', 4,  '洁面 · 100/150ml · 膏/慕斯',  ['#d7e3cf', '#a8c39c']],
  ['红参紧致眼霜',   'Red Ginseng Eye Cream',   5,  '眼霜 · 15/20g',               ['#e6cfc4', '#c99e8c']],
  ['发酵新生面膜',   'Ferment Renewal Mask',    6,  '面膜 · 单片/盒装 5 片',        ['#efe3e6', '#d9bcc4']],
  ['烟酰胺控油精华', 'Niacinamide Control Oil', 7,  '精华 · 30ml · 按压瓶',         ['#e3e6ef', '#b9c2d9']],
  ['新草本旅行套装', 'Herbal Travel Set',       8,  '套装 · 四件 · 礼盒',           ['#e9e4d6', '#cfc4a8']],
  ['灵芝精华油',     'Reishi Facial Oil',       9,  '精华油 · 20/30ml · 滴管瓶',    ['#efe0c4', '#d8b877']],
  ['透明质酸保湿霜', 'Cloud Dew Gel Cream',     10, '凝霜 · 30/50g',               ['#dfeaf0', '#b6d0dd']],
  ['本草唇膏笔',     'Herbal Lip Crayon',       11, '唇部 · 管状 · 单色/定制',      ['#e8b4b8', '#c96f6f', '#8f3f3f']],
  ['本草淡香水',     'Herbal Eau de Toilette',  12, '香氛 · 30/50ml',              ['#efe9df', '#cdbfa8']],
];

const shelfItems = (list) => list.map(([zh, en, n, note, sw]) => ({
  name: zh, nameEn: en, image: `${IMG}/medierba-prod-${n}.jpg`, note, swatches: sw,
}));

/* 中文是源,英文同步给一份 —— 其余 44 语由翻译中心补 */
const ZH = [
  ['announce', {
    // 原站这里写的是「FREE SHIPPING ON ORDERS ¥300+」。那句对帛卉不成立:
    // 我们不做零售、不谈运费、不出价,挂包邮门槛招来的是买一支的散客。
    text: 'MEDIERBA · 帛卉集团自有品牌 · 本草生物科技',
    linkText: '了解品牌', linkHref: '/zh-cn/about/',
  }],
  ['slideshow', {
    slides: [1, 2, 3, 4, 5].map((i) => ({
      image: i === 1 ? `${IMG}/medierba-hero.png` : `${IMG}/medierba-slide-${i}.jpg`,
      alt: 'MEDIERBA 本草生物科技',
    })),
    eyebrow: 'MEDIERBA',
    title: '草本为先，\n生物科技驱动。',
    lead: '本草生物科技护肤：发酵、低温闪萃与合成生物，让每一支产品都有数据背书。',
    ctaText: '现在看看', ctaHref: '/zh-cn/products/', interval: 6000,
  }],
  ['centercta', {
    title: '为你的肌肤找到完美仪式',
    body: '30 秒 AI 肌肤检测，找到属于你的本草护肤流程。',
    ctaText: '开始肤质测试', ctaHref: '/zh-cn/skin/', tone: 'sand',
  }],
  ['bandimg', {
    image: `${IMG}/medierba-body.jpg`, alt: '本草身体养护',
    display: 'body essentials', title: '本草身体养护',
    ctaText: '看身体系列', ctaHref: '/zh-cn/products/',
  }],
  ['shelf', {
    title: '发现社区挚爱精选', moreText: '查看全部', moreHref: '/zh-cn/products/',
    items: shelfItems(PRODUCTS), tone: 'paper',
  }],
  ['split', {
    image: `${IMG}/medierba-collection-1.jpg`, eyebrow: '新品', title: '本草显色唇部系列',
    body: '染唇液 × 护唇精华二合一，让色彩同时成为滋养。蜡体配比与显色度可按品牌方需求打样。',
    ctaText: '选购唇部护理', ctaHref: '/zh-cn/products/', flip: false, tone: 'sand',
  }],
  ['statement', {
    title: '科学护肤 + 天然彩妆',
    body: '科学护肤与天然彩妆的融合 —— MEDIERBA 让每一抹色彩，都同时是滋养。',
    tone: 'leaf',
  }],
  ['split', {
    image: `${IMG}/medierba-collection-2.jpg`, eyebrow: '经典', title: '润唇膏系列',
    body: '发酵油脂 × 本草提取，全天候锁水修护。管型、香型与色号均可定制。',
    ctaText: '选购润唇膏', ctaHref: '/zh-cn/products/', flip: true, tone: 'paper',
  }],
  ['shelf', {
    title: '水润夏日肌肤', moreText: '保湿 × 防护 × 焕亮', moreHref: '/zh-cn/products/',
    items: shelfItems([PRODUCTS[9], PRODUCTS[2], PRODUCTS[0], PRODUCTS[6]]), tone: 'sand',
  }],
  ['split', {
    image: `${IMG}/medierba-story.jpg`, eyebrow: '品牌故事', title: '来自中国本草实验室的精华配方',
    body: '为肌肤与感官而生。东方草本与巴西雨林两条原料线，种植端与制造端同属一个体系。',
    ctaText: '发现品牌故事', ctaHref: '/zh-cn/about/', flip: false, tone: 'paper',
  }],
  ['perks', {
    image: `${IMG}/medierba-perks.jpg`, veil: 0.55,
    items: [
      { icon: '★', title: '加入本草会员俱乐部', note: '会员积分 · 生日礼遇 · 专属新品' },
      { icon: '↻', title: '订阅制持续供应', note: '锁定产能档期，随时更换或取消' },
      { icon: '♻', title: '空瓶回收计划', note: '环保回收，回馈礼遇' },
    ],
  }],
  ['social', {
    title: '关注我们', handle: '@medierba',
    items: [1, 2, 3, 4].map((i) => ({ image: `${IMG}/medierba-social-${i}.jpg`, href: '#' })),
    tone: 'paper',
  }],
  ['signup', {
    title: '订阅最新资讯',
    body: '每期分享配方手记、成分科学与新品体验，还有会员专属礼遇。',
    placeholder: '邮箱地址', button: '订阅',
    note: '订阅即表示同意接收品牌邮件，可随时退订。', tone: 'sand',
  }],
];

/* 英文版:结构完全一致,只换文案。图片与规格是语言无关的,直接沿用 */
const EN_TEXT = {
  announce: { text: 'MEDIERBA · An own brand of BIOSPHERE GROUP · Herb-biotech skincare', linkText: 'Our story', linkHref: '/en/about/' },
  slideshow: { eyebrow: 'MEDIERBA', title: 'Botanicals first,\nbiotech driven.', lead: 'Herbal biotechnology skincare: fermentation, low-temperature extraction and synthetic biology — every product backed by data.', ctaText: 'See the range', ctaHref: '/en/products/' },
  centercta: { title: 'Find the ritual your skin is asking for', body: 'A 30-second AI skin reading points you to the routine that fits.', ctaText: 'Start the reading', ctaHref: '/en/skin/' },
  bandimg: { display: 'body essentials', title: 'Herbal body care', ctaText: 'Shop body', ctaHref: '/en/products/' },
  shelf1: { title: 'Community favourites', moreText: 'See all', moreHref: '/en/products/' },
  split1: { eyebrow: 'New', title: 'Herbal tinted lip collection', body: 'A lip tint and a lip serum in one — colour that also nourishes. Wax ratio and coverage are developed to the brand brief.', ctaText: 'Shop lip care', ctaHref: '/en/products/' },
  statement: { title: 'Skin science + natural colour', body: 'Where skin science meets natural colour — at MEDIERBA every shade is also care.' },
  split2: { eyebrow: 'Classic', title: 'Lip balm collection', body: 'Fermented lipids and botanical extracts for all-day moisture and repair. Tube, scent and shade are all specifiable.', ctaText: 'Shop lip balm', ctaHref: '/en/products/' },
  shelf2: { title: 'Summer-dewy skin', moreText: 'Hydrate × protect × glow', moreHref: '/en/products/' },
  split3: { eyebrow: 'Our story', title: 'Formulated in a Chinese herbal laboratory', body: 'Made for skin and for the senses. Eastern herbs and Brazilian rainforest botanicals — cultivation and manufacturing inside one system.', ctaText: 'Read our story', ctaHref: '/en/about/' },
  perks: [
    { icon: '★', title: 'Join the herbal club', note: 'Points · birthday gifts · early access' },
    { icon: '↻', title: 'Subscribe for continuity', note: 'Lock in capacity, change or cancel anytime' },
    { icon: '♻', title: 'Empty-bottle return', note: 'Recycle with us, get rewarded' },
  ],
  social: { title: 'Follow us', handle: '@medierba' },
  signup: { title: 'Stay in the loop', body: 'Formulation notes, ingredient science, new launches and member-only offers.', placeholder: 'Email address', button: 'Subscribe', note: 'By subscribing you agree to receive brand emails. Unsubscribe anytime.' },
};

/** 英文块:拿中文块做骨架,只覆盖文字字段 */
function toEn(type, zh, seenShelf, seenSplit) {
  const d = structuredClone(zh);
  const put = (o) => Object.assign(d, o);
  if (type === 'announce') put(EN_TEXT.announce);
  if (type === 'slideshow') { put(EN_TEXT.slideshow); d.slides = zh.slides.map((s) => ({ ...s, alt: 'MEDIERBA herb-biotech' })); }
  if (type === 'centercta') put(EN_TEXT.centercta);
  if (type === 'bandimg') put(EN_TEXT.bandimg);
  if (type === 'statement') put(EN_TEXT.statement);
  if (type === 'perks') d.items = EN_TEXT.perks;
  if (type === 'social') put(EN_TEXT.social);
  if (type === 'signup') put(EN_TEXT.signup);
  if (type === 'shelf') {
    put(seenShelf === 0 ? EN_TEXT.shelf1 : EN_TEXT.shelf2);
    /* 商品卡英文名本来就有,直接升为主名;规格这类结构化描述留给翻译中心补 */
    d.items = zh.items.map((it) => ({ ...it, name: it.nameEn, nameEn: undefined }));
  }
  if (type === 'split') put([EN_TEXT.split1, EN_TEXT.split2, EN_TEXT.split3][seenSplit]);
  return d;
}

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [
  `UPDATE sites SET theme='dtc' WHERE id=${esc(SITE)};`,
  `DELETE FROM blocks WHERE page_id=${PAGE};`,
];
let shelfN = 0, splitN = 0;
ZH.forEach(([type, data], i) => {
  const en = toEn(type, data, type === 'shelf' ? shelfN : 0, type === 'split' ? splitN : 0);
  if (type === 'shelf') shelfN++;
  if (type === 'split') splitN++;
  const order = type === 'announce' ? -1 : i;
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json) VALUES (${PAGE}, ${esc(type)}, ${order}, 1, '{}');`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json) VALUES (last_insert_rowid(), 'zh-cn', ${esc(JSON.stringify(data))});`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json) SELECT MAX(id), 'en', ${esc(JSON.stringify(en))} FROM blocks;`);
});

const f = 'node_modules/.cache/medierba-dtc.sql';
writeFileSync(f, sql.join('\n'), 'utf8');
console.log(`SQL ${Math.round(sql.join('\n').length / 1024)}KB · ${ZH.length} 个版块 × 2 语`);
d1(['--file', f, '-y']);

const out = d1(['--command', `SELECT b.type, b.sort_order, length(i.data_json) n FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn' WHERE b.page_id=${PAGE} ORDER BY b.sort_order`]);
const rows = JSON.parse(out.slice(out.indexOf('['))).at(-1).results ?? [];
console.log('\n落库结果:');
rows.forEach((r) => console.log(`  ${String(r.sort_order).padStart(3)}  ${r.type.padEnd(11)} ${r.n} 字节`));
