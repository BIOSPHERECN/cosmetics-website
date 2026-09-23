/**
 * biosphere-ai 首页铺成「阿里国际站化妆品工厂店」的样子。
 *
 * 参照的是 chingocosmetic / gdmengfan / 名臣健康 这类工厂店铺的**版块顺序**,
 * 不是阿里全站。两者是完全不同的东西:
 *   全站是撮合市场(搜索 + 供应商列表),工厂店是一家厂在自证实力。
 *
 * 从参照店铺量出来的顺序:
 *   店招(厂区全景 + 公司名 + 资质角标)
 *   → 数字条(年限/面积/产线/出口国)
 *   → 核心能力
 *   → 生产实力(带标题条的图网格,3×2)← 最标志性的一块
 *   → 研发实力(同样的网格)
 *   → 品质管控
 *   → 可做品类
 *   → 供应链与交付
 *   → 团队与场所
 *   → 资质与认证
 *   → 询盘收口
 *
 * 与参照站的一个关键差别:**文字不烤进图里**。
 * 阿里店铺是整块做成 1920 宽的设计图,改一个字要重做图 ——
 * 而我们有 46 个语种,那等于要 46 套图。
 * 所以图归图、字归字:视觉密度一样,但每个字都能翻译、能搜、能在后台改。
 *
 * 跑法:node tools/seed-storefront.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SITE = 'biosphere-ai';
mkdirSync('node_modules/.cache', { recursive: true });
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const d1 = (args) => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...args],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => {
  const out = d1(['--command', sql.replace(/\s+/g, ' ').trim()]);
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[j.length - 1].results ?? [];
};

/* 媒体库里那 23 张按名字取 id —— 写死数字的话,重跑一次出图就全错位了 */
const media = Object.fromEntries(
  q(`SELECT id, filename FROM media WHERE folder='工厂实力'`).map((r) => [String(r.filename).replace('.png', ''), `/media/${r.id}`]),
);
const img = (k) => media[k] ?? '';
console.log(`媒体库取到 ${Object.keys(media).length} 张工厂图`);

const PAGE = q(`SELECT id FROM pages WHERE site_id='${SITE}' AND slug=''`)[0]?.id;
if (!PAGE) { console.error('找不到 biosphere-ai 首页'); process.exit(1); }
console.log(`首页 page_id = ${PAGE}`);

const ZH = [
  ['announce', {
    text: 'BIOSPHERE-AI · 帛卉集团智造平台 · 护肤 / 彩妆 / 口腔 / 香氛四线并行',
    linkText: '发起询盘', linkHref: '/zh-cn/contact/',
  }],

  ['storehero', {
    image: img('exterior'), alt: '帛卉集团生产基地',
    company: '帛卉集团 · BIOSPHERE 智造平台',
    tagline: '从一株药材到一支成品。护肤、彩妆、洁护、香氛四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。',
    badges: [
      { text: '已核验制造商', kind: 'verified' },
      { text: 'ISO 22716 认证' },
      { text: 'GMPC 车间' },
      { text: '支持 OEM / ODM / OBM' },
    ],
    ctaText: '发起询盘', ctaHref: '/zh-cn/contact/',
    secondText: '看可做剂型', secondHref: '/zh-cn/products/',
  }],

  /* 数字紧跟店招 —— 采购判断「这家够不够大」最快的入口。
     数值先用占位,创始人给真实产能后一处就改完。 */
  ['statsband', {
    tone: 'ink',
    items: [
      { value: '12', unit: '年', label: '专注化妆品受托制造' },
      { value: '28,000', unit: '㎡', label: 'GMPC 洁净厂房' },
      { value: '16', unit: '条', label: '乳化 / 灌装 / 压粉产线' },
      { value: '43', unit: '国', label: '出口目的地' },
      { value: '3,000', unit: '支起', label: '最小起订量' },
    ],
  }],

  ['procgrid', {
    eyebrow: 'MANUFACTURING', title: '生产实力',
    intro: '乳化、灌装、封口、贴标、压粉五道主工序全部自有,小批量试产与大货同线 —— 配方一致性不靠换厂来碰运气。',
    cols: 3, tone: 'paper',
    items: [
      { image: img('line-emulsify'), label: '乳化车间', note: '真空乳化 · 常温与冷制可选' },
      { image: img('line-filling'), label: '灌装线', note: '膏体 / 液体 / 油相分线' },
      { image: img('line-capping'), label: '封口与旋盖', note: '自动旋盖 · 扭力可控' },
      { image: img('line-labeling'), label: '贴标与包装', note: '多规格快速换型' },
      { image: img('line-powder'), label: '粉体压制', note: '压粉饼 / 散粉' },
      { image: img('cleanroom'), label: '洁净车间', note: '十万级 · 风淋更衣' },
    ],
  }],

  ['procgrid', {
    eyebrow: 'R&D', title: '研发与检测',
    intro: '配方定制、既有配方复刻、稳定性与相容性验证在同一栋楼里完成 —— 打样周期短在这儿,不在催货上。',
    cols: 4, tone: 'sand',
    items: [
      { image: img('lab-formulation'), label: '配方实验室', note: '定制与复刻' },
      { image: img('lab-analysis'), label: '分析检测', note: '活性物含量与指标' },
      { image: img('lab-micro'), label: '微生物检测', note: '菌落总数 / 致病菌' },
      { image: img('lab-stability'), label: '稳定性测试', note: '高低温 / 光照 / 循环' },
    ],
  }],

  ['split', {
    image: img('gowning'), eyebrow: '品质管控', title: '每一批都留样,每一条宣称都有报告',
    body: '进料检验、过程巡检、成品放行三道关口独立记录。功效宣称一律配得出第三方报告 —— 出口目的地不同,需要的文件也不同,这部分由我们统一备齐。',
    ctaText: '看质量与合规', ctaHref: '/zh-cn/quality/', flip: false, tone: 'paper',
  }],

  ['procgrid', {
    eyebrow: 'CATEGORIES', title: '可做品类',
    intro: '同一订单可跨品类组合。婴童与眼周这类高敏感品类单独排产、单独留样。',
    cols: 3, tone: 'sand',
    items: [
      { image: img('packaging'), label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜' },
      { image: img('line-powder'), label: '彩妆', note: '粉体 / 唇部 / 底妆' },
      { image: img('lab-formulation'), label: '婴童护理', note: '低敏体系 · 单独排产' },
      { image: img('lab-micro'), label: '眼周护理', note: '眼霜 / 眼部精华' },
      { image: img('line-capping'), label: '口腔护理', note: '牙膏 / 漱口水' },
      { image: img('herb-field'), label: '香氛与身体', note: '淡香水 / 身体乳 / 皂类' },
    ],
  }],

  ['procgrid', {
    eyebrow: 'SUPPLY CHAIN', title: '原料与交付',
    intro: '东方草本与巴西雨林两条原料线,种植端与制造端同属一个体系 —— 原料不是买来的批号,是能追到源头的土地。',
    cols: 4, tone: 'paper',
    items: [
      { image: img('herb-field'), label: '自有种植基地', note: '道地产区 · GAP 规范' },
      { image: img('material'), label: '原料仓', note: '分区存放 · 批号可追' },
      { image: img('warehouse'), label: '成品仓', note: '恒温恒湿' },
      { image: img('shipping'), label: '发货装柜', note: '拼柜与整柜均可' },
    ],
  }],

  ['procgrid', {
    eyebrow: 'COMPANY', title: '团队与场所',
    intro: '',
    cols: 4, tone: 'sand',
    items: [
      { image: img('team-rnd'), label: '研发团队', note: '配方师与检测工程师' },
      { image: img('office'), label: '办公区', note: '' },
      { image: img('meeting'), label: '客户洽谈', note: '可安排线上验厂' },
      { image: img('showroom'), label: '产品展厅', note: '在产剂型实物陈列' },
    ],
  }],

  ['certs', {
    title: '资质与认证',
    note: '证书编号与有效期可对照扫描件核验。目的地市场不同,所需文件不同 —— 我们按你的目标市场逐项备齐。',
    /* 字段名跟 CertWall 走:label 不是 name。
       第一次写成 name,结果 c.label.slice() 抛异常,整页返回 200 + 0 字节。 */
    items: [
      { id: 'iso22716', label: 'ISO 22716', note: '化妆品良好生产规范 GMPC' },
      { id: 'iso9001', label: 'ISO 9001', note: '质量管理体系' },
      { id: 'gmpc', label: 'GMPC', note: '洁净车间等级认证' },
      { id: 'cpnp', label: '欧盟 CPNP', note: '出口欧盟备案,可协助办理' },
      { id: 'msds', label: 'MSDS / COA', note: '安全数据表与检测报告,随批出具' },
      { id: 'vegan', label: '纯素 / 零残忍', note: '按品牌需求申办' },
    ],
  }],

  ['inquiry', {
    title: '把需求发给我们,回一份可执行的方案',
    body: '无论是复刻现有配方、开一个新品类,还是只想问问产能与起订量 —— 一封邮件就能开始。两个工作日内书面回复。',
    ctaText: '发起询盘',
  }],
];

/* 英文版:结构一致,只换文字。图片与数值是语言无关的,直接沿用 */
const EN = {
  announce: { text: 'BIOSPHERE-AI · Manufacturing platform of BOHUI GROUP · Skincare / Colour / Oral / Fragrance', linkText: 'Start an inquiry', linkHref: '/en/contact/' },
  storehero: {
    company: 'BOHUI GROUP · BIOSPHERE Manufacturing',
    tagline: 'From the plant to the finished unit. Four lines — skincare, colour, cleansing and fragrance — run in parallel, so one order can span categories without splitting it across factories.',
    badges: [{ text: 'Verified manufacturer', kind: 'verified' }, { text: 'ISO 22716' }, { text: 'GMPC facility' }, { text: 'OEM / ODM / OBM' }],
    ctaText: 'Start an inquiry', ctaHref: '/en/contact/', secondText: 'Formats we make', secondHref: '/en/products/',
  },
  statsband: [
    { value: '12', unit: 'yrs', label: 'In contract manufacturing' },
    { value: '28,000', unit: 'm²', label: 'GMPC cleanroom floor' },
    { value: '16', unit: '', label: 'Emulsifying / filling / pressing lines' },
    { value: '43', unit: '', label: 'Export destinations' },
    { value: '3,000', unit: 'units', label: 'Minimum order' },
  ],
  proc: [
    { eyebrow: 'MANUFACTURING', title: 'Manufacturing', intro: 'Emulsifying, filling, capping, labelling and powder pressing are all in-house. Pilot batches run on the same line as production — formula consistency is not left to a change of supplier.',
      labels: ['Emulsifying', 'Filling line', 'Capping', 'Labelling & cartoning', 'Powder pressing', 'Cleanroom'],
      notes: ['Vacuum emulsifying · hot or cold process', 'Separate lines for cream, liquid and oil', 'Automatic capping with torque control', 'Fast changeover across sizes', 'Pressed and loose powder', 'Class 100k · air shower gowning'] },
    { eyebrow: 'R&D', title: 'R&D and testing', intro: 'Custom formulation, reverse engineering, stability and compatibility testing all happen in one building — that is where a short sampling cycle comes from.',
      labels: ['Formulation lab', 'Analytical testing', 'Microbiology', 'Stability chamber'],
      notes: ['Custom and reverse engineering', 'Active content and specifications', 'Total count / pathogens', 'Heat, light and cycling'] },
    { eyebrow: 'CATEGORIES', title: 'What we make', intro: 'One order can span categories. Baby and eye-area products are scheduled and retained separately.',
      labels: ['Skincare', 'Colour cosmetics', 'Baby care', 'Eye care', 'Oral care', 'Fragrance & body'],
      notes: ['Serum / cream / toner / mask', 'Powder / lip / base', 'Low-irritation system', 'Eye cream and serum', 'Toothpaste / mouthwash', 'EDT / body lotion / soap'] },
    { eyebrow: 'SUPPLY CHAIN', title: 'Materials and delivery', intro: 'Eastern herbs and Brazilian rainforest botanicals — cultivation and manufacturing inside one system. A raw material is not a batch number we buy in; it is land we can point to.',
      labels: ['Own cultivation', 'Raw material store', 'Finished goods', 'Container loading'],
      notes: ['Authentic origin · GAP', 'Zoned, batch traceable', 'Climate controlled', 'LCL and FCL'] },
    { eyebrow: 'COMPANY', title: 'Team and premises', intro: '',
      labels: ['R&D team', 'Offices', 'Client meetings', 'Showroom'],
      notes: ['Formulators and test engineers', '', 'Remote factory audit available', 'Live samples of everything we run'] },
  ],
  split: { eyebrow: 'Quality control', title: 'Every batch retained, every claim documented',
    body: 'Incoming inspection, in-process checks and release testing are recorded independently. Every efficacy claim can be backed by a third-party report — and since required documents differ by destination, we assemble that set for you.',
    ctaText: 'Quality & compliance', ctaHref: '/en/quality/' },
  certs: { title: 'Certifications & compliance', note: 'Certificate numbers and validity can be checked against scanned originals. Required documentation differs by destination market — we prepare each item against your target.' },
  inquiry: { title: 'Send us the brief — we reply with an actionable plan', body: 'Reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We reply in writing within two working days.', ctaText: 'Start an inquiry' },
};

let procN = 0;
function toEn(type, zh) {
  const d = structuredClone(zh);
  if (type === 'announce') Object.assign(d, EN.announce);
  if (type === 'storehero') Object.assign(d, EN.storehero);
  if (type === 'statsband') d.items = EN.statsband;
  if (type === 'split') Object.assign(d, EN.split);
  if (type === 'certs') Object.assign(d, EN.certs);
  if (type === 'inquiry') Object.assign(d, EN.inquiry);
  if (type === 'procgrid') {
    const e = EN.proc[procN++];
    if (e) {
      d.eyebrow = e.eyebrow; d.title = e.title; d.intro = e.intro;
      d.items = zh.items.map((it, i) => ({ ...it, label: e.labels[i] ?? it.label, note: e.notes[i] ?? '' }));
    }
  }
  return d;
}

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [`DELETE FROM blocks WHERE page_id=${PAGE};`];
ZH.forEach(([type, data], i) => {
  const en = toEn(type, data);
  const order = type === 'announce' ? -1 : i;
  sql.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json) VALUES (${PAGE}, ${esc(type)}, ${order}, 1, '{}');`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json) VALUES (last_insert_rowid(), 'zh-cn', ${esc(JSON.stringify(data))});`);
  sql.push(`INSERT INTO block_i18n (block_id, lang, data_json) SELECT MAX(id), 'en', ${esc(JSON.stringify(en))} FROM blocks;`);
});
sql.push(`UPDATE sites SET theme='dtc' WHERE id='${SITE}';`);

const f = 'node_modules/.cache/storefront.sql';
writeFileSync(f, sql.join('\n'), 'utf8');
console.log(`SQL ${Math.round(sql.join('\n').length / 1024)}KB · ${ZH.length} 个版块 × 2 语`);
d1(['--file', f, '-y']);

console.log('\n落库结果:');
for (const r of q(`SELECT b.type, b.sort_order, length(i.data_json) n FROM blocks b
                     JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.page_id=${PAGE} ORDER BY b.sort_order`)) {
  console.log(`  ${String(r.sort_order).padStart(3)}  ${String(r.type).padEnd(11)} ${r.n} 字节`);
}
