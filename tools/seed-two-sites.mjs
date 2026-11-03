/**
 * beauty2oem 与 skin2oem 补内容。
 *
 * 两站现状:19 个页面,除首页外**每页只有 2 块**(大标题 + 一段话)。
 * 采购从任何入口进来,点两下就看到半屏空白。
 *
 * ── 最要紧的一条纪律:三个站不能说同一套话 ────────────────────
 * 同一个工厂、同一批真实数据,但三个站是三个角度。照抄一遍等于没做:
 * 客户同时收到三个域名,一看文案一样,只会得出「这家在批量刷站」的结论。
 *
 *   biosphere-ai  草本溯源 + 古方研究 + AI 配方   —— 讲「原料与技术的独特性」
 *   beauty2oem    全品类广度 + 从 0 到 1 孵化      —— 讲「一家能包住整个品牌」
 *   skin2oem      护肤专精 + 功效验证 + 稳定性     —— 讲「难做的护肤我们做得住」
 *
 * 所以数字共用(都来自 bohui-facts),但**切入角度、版块顺序、每一句话都重写**。
 * 比如同样是 13,000 个配方储备:
 *   beauty2oem 说的是「六大品类都有存货,不用为一个新品类重开研发」
 *   skin2oem   说的是「护肤占大头,一个功效方向通常有多条路线可选」
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
import { FACTS as F } from './bohui-facts.mjs';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));
const fig = (k) => F.figures.find((f) => f.key === k);
const st = (k, label) => { const f = fig(k); return { value: (f.prefix ? f.prefix + ' ' : '') + f.value, unit: f.unit, label }; };

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder IN ('帛卉实拍','原料溯源')`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => M[n] ?? '';

/* ══════════════════════════════════════════════════════════════
   BEAUTY2OEM —— 全品类 + 品牌孵化 + 供应链
   讲的是「一家能包住整个品牌」,所以主线是**广度**和**从 0 到 1**。
   ══════════════════════════════════════════════════════════════ */
const BEAUTY = {
  '': [
    { type: 'statsband', data: { tone: 'ink', items: [
      st('formulas', '成熟配方储备,六大品类都有存货'),
      st('lines', '自动化产线,柔性适配多批次'),
      st('suppliers', '战略供应商,原料不用你自己找'),
      st('area', '双基地生产面积'),
    ] } },
    { type: 'procgrid', data: { eyebrow: 'CATEGORIES', tone: 'paper', cols: 3,
      title: '一家做完,不用把品牌拆给几家工厂',
      intro: '新品牌最耗人的不是生产,是同时对接六家供应商 —— 护肤找 A、彩妆找 B、口腔找 C,每家的排期、包材、单证都要各谈一遍。六大品类在同一条体系里,一张订单就能跨品类。',
      items: [
        { image: '/media/10', label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜' },
        { image: '/media/13', label: '彩妆', note: '粉体 / 唇部 / 底妆' },
        { image: '/media/12', label: '口腔护理', note: '牙膏 / 漱口水 / 洁牙片' },
        { image: '/media/11', label: '儿童护肤', note: '低刺激体系,单独排产' },
        { image: '/media/14', label: '身体护理', note: '身体乳 / 防晒 / 香氛' },
        { image: '/media/58', label: '国际 IP 产品', note: '迪士尼 / 驯龙高手 / 蓝精灵' },
      ] } },
    { type: 'procribbon', data: { eyebrow: 'FROM ZERO', tone: 'deep',
      title: '从一个想法到能上架的产品线,中间这五步我们都接',
      intro: '没有配方、没有包材、只有一个方向,也能开始。倒推的顺序是固定的 —— 先定卖给谁,再定做什么。',
      steps: F.services.map((s, i) => ({
        name: s.zh, hand: s.note.zh,
        image: [P('meeting-room-w720'), '/media/58', P('weighing-room-w720'), P('filling-line-w720')][i] || '/media/55',
      })) } },
    { type: 'split', data: { image: P('meeting-room-w1600'), flip: false, tone: 'sand',
      eyebrow: '品牌孵化', title: '很多新品牌一上来就问「有什么爆款配方」—— 顺序反了',
      body: '同一支面霜在东南亚和欧洲要走的宣称、包装和价格带完全不同。我们从目标市场倒推:先定品类定位与价格带,再定 SKU 结构与上市节奏,最后才谈配方。这样得出的产品线才落得了地。',
      ctaText: '看品牌孵化', ctaHref: '/zh-cn/capabilities/incubation/' } },
    { type: 'bandimg', data: { image: P('workshop-corridor-w1600'),
      alt: '帛卉智造平台车间分区', display: 'BEAUTY2OEM',
      title: '广州总部 + 印尼工厂,东南亚订单可本地化交付',
      ctaText: '看生产实力', ctaHref: '/zh-cn/capabilities/manufacturing/' } },
    { type: 'procgrid', data: { eyebrow: 'SUPPLY CHAIN', tone: 'sand', cols: 3,
      title: '供应链整合:原料不用你自己去谈',
      intro: `${fig('suppliers').prefix} ${fig('suppliers').value} 家战略供应商,覆盖活性物、乳化体系、香精与全套包材。新品牌单独去找这些公司,通常连最小起订量都过不了。`,
      items: [
        { image: '/media/49', label: '活性原料', note: '巴斯夫 / 赢创 / 亚什兰' },
        { image: '/media/45', label: '乳化与助剂', note: '陶氏 / 科莱恩 / 天赐' },
        { image: '/media/14', label: '香精', note: '奇华顿 / 德之馨 / 国际香料' },
        { image: '/media/50', label: '包材', note: '安姆科 / 阿普拉 / 爱索尔' },
        { image: '/media/41', label: '印刷与纸盒', note: '联昌 / 江门联记' },
        { image: '/media/53', label: '国际物流', note: '依托印尼基地,一站式出海' },
      ] } },
    { type: 'certs', data: { title: '已服务的品牌',
      note: '覆盖美妆个护、口腔护理、母婴等多品类;并承接迪士尼、驯龙高手、蓝精灵等国际 IP 授权产品。',
      items: [...F.clients.slice(0, 15).map((c) => ({ id: c.toLowerCase().replace(/\W+/g, '-'), label: c, note: '' })),
              ...F.ip.map((c) => ({ id: c.toLowerCase().replace(/\W+/g, '-'), label: c, note: 'IP 授权' }))] } },
    { type: 'statement', data: { eyebrow: '我们不接什么', tone: 'leaf',
      title: '一次性的单子我们不接',
      body: '每一单都从产能匹配和法规预判开始。不是挑客户 —— 是做不到这两步的单子,做出来也上不了市。与其收了钱再告诉你卡在备案,不如一开始就说清楚。' } },
    { type: 'inquiry', data: { title: '只有一个想法也可以谈',
      body: '把品类方向、目标市场和预估量写下来,两个工作日内回一份可执行的产品线草案。', ctaText: '发起询盘' } },
  ],
  about: [
    { type: 'statsband', data: { tone: 'ink', items: [
      st('area', '双基地生产面积'), st('lines', '自动化产线'),
      st('formulas', '成熟配方储备'), st('rnd', '资深研发团队'),
    ] } },
    { type: 'procgrid', data: { eyebrow: 'COMPANY', tone: 'paper', cols: 3,
      title: '公司概况',
      intro: '广州市帛卉化妆品有限公司。立足广州、布局印尼,双基地覆盖亚洲、辐射全球。',
      items: [
        { image: '/media/57', label: '厂区外观', note: '自有厂房,非租赁代工' },
        { image: P('workshop-corridor-w720'), label: '车间分区', note: '六区分离 · 人流物流分道' },
        { image: P('meeting-room-w720'), label: '战略会议室', note: '客户洽谈与方案评审' },
        { image: P('rnd-office-w720'), label: '技术部办公室', note: '研发协同 · 配方优化' },
        { image: '/media/56', label: '办公区', note: '接单、跟单与出口单证' },
        { image: '/media/58', label: '产品展厅', note: '在产品类实样陈列' },
      ] } },
    { type: 'certs', data: { title: '资质与国际认证',
      note: '证书编号与有效期可对扫描件核验。出口目的地不同,需要的文件也不同 —— 这部分由我们按目的地清单统一备齐。',
      items: F.certs.map((c) => ({ id: c.id, label: c.label, note: c.note.zh })) } },
    { type: 'inquiry', data: { title: '远程验厂可以今天安排',
      body: '视频走一遍产线、仓库与实验室,和亲自到场看到的是同一批画面。', ctaText: '发起询盘' } },
  ],
  'capabilities/incubation': [
    { type: 'procribbon', data: { eyebrow: 'INCUBATION', tone: 'deep',
      title: '从一个想法到能上架的产品线',
      intro: '没有配方、没有包材、只有一个方向,也能开始。',
      steps: [
        { name: '品类定位', hand: '目标市场 + 价格带 + 竞品盘点', image: P('meeting-room-w720') },
        { name: '产品线规划', hand: 'SKU 结构与上市节奏', image: '/media/58' },
        { name: '配方方向', hand: '功效路线 + 法规预判', image: P('rnd-office-w720') },
        { name: '包材结构', hand: '成本与货架表现同时定', image: '/media/50' },
        { name: '打样评审', hand: '实样 + 稳定性初测', image: P('weighing-room-w720') },
        { name: '首单量产', hand: '批记录 + 全项报告', image: P('filling-line-w720') },
      ] } },
    { type: 'statement', data: { eyebrow: '孵化', tone: 'sand',
      title: '先定卖给谁,再定做什么',
      body: `${F.sampling.zh};${fig('formulas').prefix} ${fig('formulas').value} 个成熟配方储备意味着多数方向不用从零开始 —— 挑一条最接近的改,比重新研发快得多,也稳得多。` } },
    { type: 'inquiry', data: { title: '把方向写下来就行', body: '不需要你先想清楚配方。品类、目标市场、预算区间,这三样够我们回一份草案了。', ctaText: '发起询盘' } },
  ],
  products: [
    { type: 'procgrid', data: { eyebrow: 'CATEGORIES', tone: 'paper', cols: 3,
      title: '六大品类',
      intro: '一张订单可以跨品类。婴童与眼周产品单独排产,不与彩妆共线。',
      items: [
        { image: '/media/10', label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜' },
        { image: '/media/13', label: '彩妆', note: '粉体 / 唇部 / 底妆' },
        { image: '/media/12', label: '口腔护理', note: '牙膏 / 漱口水 / 洁牙片' },
        { image: '/media/11', label: '儿童护肤', note: '低刺激体系' },
        { image: '/media/14', label: '身体护理', note: '身体乳 / 防晒 / 香氛' },
        { image: '/media/17', label: '面膜', note: `日产能 ${fig('mask').prefix} ${fig('mask').value} 片` },
      ] } },
    { type: 'inquiry', data: { title: '挑好品类一次发过来', body: '写清品类、剂型、预估量和目标市场,两个工作日内回可执行方案。', ctaText: '发起询盘' } },
  ],
};

/* ══════════════════════════════════════════════════════════════
   SKIN2OEM —— 护肤专精 + 功效验证 + 稳定性
   讲的是「难做的护肤我们做得住」,所以主线是**深度**和**验证**。
   ══════════════════════════════════════════════════════════════ */
const SKIN = {
  '': [
    { type: 'statsband', data: { tone: 'ink', items: [
      st('formulas', '配方储备,护肤占大头'),
      st('rnd', '研发人员,覆盖化学 / 药学 / 生物 / 植物学'),
      st('cream', '水乳霜类日产能'),
      st('cleanroom', '洁净车间标准'),
    ] } },
    { type: 'procgrid', data: { eyebrow: 'FORMATS', tone: 'paper', cols: 3,
      title: '护肤做深,不是做全',
      intro: '同一张成分表能做出十种手感。护肤的难点从来不在「能不能做出来」,而在质构、稳定性和肤感三者同时成立 —— 这三样任缺一样,消费者第二次就不买了。',
      items: [
        { image: '/media/16', label: '精华与安瓶', note: '水基 / 油基 / 双相' },
        { image: '/media/10', label: '面霜与乳液', note: 'O/W · W/O · 冷制' },
        { image: '/media/17', label: '面膜', note: '片状 / 涂抹 / 冻膜' },
        { image: '/media/11', label: '洁面', note: '氨基酸 / 皂基 / 慕斯' },
        { image: '/media/14', label: '护肤油', note: '植物基油相,冷压可溯源' },
        { image: '/media/13', label: '眼周护理', note: '低刺激体系,单独排产' },
      ] } },
    { type: 'procribbon', data: { eyebrow: 'VALIDATION', tone: 'deep',
      title: '一支护肤配方要过的六道',
      intro: '前四道在自有实验室完成,后两道交第三方机构。分界线在于「能不能自己出具有效报告」—— 人体功效与安全性报告的价值,恰恰在于不是我们自己出的。',
      steps: [
        { name: '理化检测', hand: 'pH / 黏度 / 离心 / 外观', image: '/media/46' },
        { name: '稳定性', hand: '耐热、耐寒、循环全周期考察', image: '/media/48' },
        { name: '微生物', hand: '总数 / 致病菌', image: '/media/47' },
        { name: '防腐挑战', hand: 'CTFA 接种试验', image: '/media/47' },
        { name: '人体功效', hand: '第三方机构出具报告', image: P('rnd-office-w720') },
        { name: '安全性', hand: '第三方斑贴与刺激性测试', image: '/media/46' },
      ] } },
    { type: 'split', data: { image: P('weighing-room-w1600'), flip: false, tone: 'sand',
      eyebrow: '配方定制', title: '拿一支样品来,我们能拆到能量产的程度',
      body: '逆向不是把 INCI 表抄一遍 —— 同一张成分表能做出十种手感。我们从质构、流变和稳定性三头逼近,再按目的地法规做替换,最后交出的是一份能跑量产的配方,不是实验室里能做出来的样品。',
      ctaText: '看技术与配方', ctaHref: '/zh-cn/rnd/formulation/' } },
    { type: 'bandimg', data: { image: P('emulsify-hall-w1600'),
      alt: '乳化车间 · 10 万级 GMP 洁净生产', display: 'SKIN2OEM',
      title: '真空乳化,常温与冷制工艺可选',
      ctaText: '看生产制造', ctaHref: '/zh-cn/capabilities/manufacturing/' } },
    { type: 'procgrid', data: { eyebrow: 'CORE TECH', tone: 'sand', cols: 3,
      title: '三大核心技术',
      intro: '三项协同,构成「原料高活性化 + 提取高效化 + 成分精准化」的闭环。',
      items: F.tech.map((t, i) => ({
        image: ['/media/47', '/media/48', '/media/46'][i],
        label: t.zh, note: t.stats.map((s) => `${s.v} ${s.l.zh}`).join(' · '),
      })) } },
    { type: 'certs', data: { title: '资质与国际认证',
      note: '证书编号与有效期可对扫描件核验。功效宣称一律配得出第三方报告 —— 做不出佐证的方向,我们会直说做不了。',
      items: F.certs.map((c) => ({ id: c.id, label: c.label, note: c.note.zh })) } },
    { type: 'statement', data: { eyebrow: '研发原则', tone: 'leaf',
      title: '每一条宣称都要配得出一份测试方案',
      body: '研发不是把活性物往上堆,是在法规允许的范围内找功效与稳定性的平衡点。堆料做出来的东西,往往在第三个月的稳定性考察里就败下来。' } },
    { type: 'inquiry', data: { title: '有配方要复刻,或者只有一个功效方向?',
      body: '两种都能谈。已有配方我们做逆向与合规改造;只有方向的,从目标宣称倒推配方路线与测试方案。', ctaText: '发起询盘' } },
  ],
  about: [
    { type: 'statsband', data: { tone: 'ink', items: [
      st('rnd', '资深研发团队'), st('formulas', '成熟配方储备'),
      st('cleanroom', '洁净车间标准'), st('area', '双基地生产面积'),
    ] } },
    { type: 'split', data: { image: P('rnd-office-w1600'), flip: false, tone: 'sand',
      eyebrow: '研发团队', title: '配方师和检测工程师坐在同一间办公室',
      body: `配方改一版,检测当天就能排上;检测发现问题,配方师转过身就能改。${F.sampling.zh}靠的就是中间没有跨公司的等待。团队 ${fig('rnd').prefix} ${fig('rnd').value} 人,覆盖化学、药学、生物与植物学。`,
      ctaText: '看实验室与检测', ctaHref: '/zh-cn/rnd/lab/' } },
    { type: 'certs', data: { title: '资质与国际认证', note: '证书编号与有效期可对扫描件核验。',
      items: F.certs.map((c) => ({ id: c.id, label: c.label, note: c.note.zh })) } },
    { type: 'inquiry', data: { title: '远程验厂可以今天安排', body: '视频走一遍实验室、产线与仓库。', ctaText: '发起询盘' } },
  ],
  'rnd/lab': [
    { type: 'procribbon', data: { eyebrow: 'TESTING', tone: 'deep',
      title: '一支配方要过的六道测试',
      intro: '前四道自有实验室完成,后两道交第三方机构。',
      steps: [
        { name: '理化检测', hand: 'pH / 黏度 / 离心 / 外观', image: '/media/46' },
        { name: '稳定性', hand: '高温、低温、光照、冷热循环', image: '/media/48' },
        { name: '微生物', hand: '总数 / 致病菌', image: '/media/47' },
        { name: '防腐挑战', hand: 'CTFA 接种试验', image: '/media/47' },
        { name: '人体功效', hand: '第三方机构出具报告', image: P('rnd-office-w720') },
        { name: '安全性', hand: '第三方斑贴与刺激性', image: '/media/46' },
      ] } },
    { type: 'statement', data: { eyebrow: '实验室', tone: 'sand',
      title: '自己测得出来的不外包,测不出来的不假装',
      body: '稳定性和微生物在自有实验室做,是为了改配方时当天就能拿到数据。人体功效和安全性一律交有资质的第三方 —— 那类报告的价值恰恰在于不是我们自己出的。' } },
    { type: 'inquiry', data: { title: '需要哪些报告,取决于货去哪', body: '告诉我们目标市场,回一份需要做的测试清单与时间。', ctaText: '发起询盘' } },
  ],
  products: [
    { type: 'procgrid', data: { eyebrow: 'FORMATS', tone: 'paper', cols: 3,
      title: '可做剂型',
      intro: `${fig('formulas').prefix} ${fig('formulas').value} 个成熟配方储备,一个功效方向通常有多条路线可选。${F.sampling.zh}。`,
      items: [
        { image: '/media/16', label: '精华与安瓶', note: '水基 / 油基 / 双相' },
        { image: '/media/10', label: '面霜与乳液', note: 'O/W · W/O · 冷制' },
        { image: '/media/17', label: '面膜', note: '片状 / 涂抹 / 冻膜' },
        { image: '/media/11', label: '洁面', note: '氨基酸 / 皂基 / 慕斯' },
        { image: '/media/14', label: '护肤油', note: '植物基油相' },
        { image: '/media/13', label: '眼周护理', note: '低刺激体系' },
      ] } },
    { type: 'inquiry', data: { title: '挑好剂型一次发过来', body: '写清剂型、目标宣称、预估量与目标市场。', ctaText: '发起询盘' } },
  ],
};

/* ── 写库 ──────────────────────────────────────────────── */
const sql = [];
let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;
let total = 0;

for (const [site, pages] of [['beauty2oem', BEAUTY], ['skin2oem', SKIN]]) {
  console.log(`\n【${site}】`);
  for (const [slug, blocks] of Object.entries(pages)) {
    const page = d1(`SELECT id FROM pages WHERE site_id=${lit(site)} AND slug=${lit(slug)} LIMIT 1`)[0];
    if (!page) { console.warn(`  跳过:没有页面 /${slug}`); continue; }
    // 重复跑时先收掉上一轮加的,只留 hero/prose/announce,不然会越叠越多
    sql.push(`UPDATE blocks SET is_visible=0 WHERE page_id=${page.id} AND type NOT IN ('hero','prose','announce');`);
    blocks.forEach((b, i) => {
      const id = nextId++;
      sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${page.id},${lit(b.type)},${100 + (i + 1) * 10},'{}',1);`);
      sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
                ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
      total++;
    });
    console.log(`  /${(slug || '首页').padEnd(26)} +${blocks.length} 块 → ${blocks.map((b) => b.type).join(' → ')}`);
  }
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/two.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`\n共新增 ${total} 块`);
