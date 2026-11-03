/**
 * 二级页补齐 —— 一级页(公司介绍/生产线/研发/质量/产品)已经排满,
 * 但导航二级项(集团、发展历程、工厂与产能、品牌孵化、包装、配方技术、实验室、联系)
 * 还是「大标题 + 一段话」。
 *
 * 二级页不需要和一级页一样长 —— 它回答的是一个更窄的问题。
 * 每页 3–5 块即可:一张能证明的图 + 一段讲清楚顺序或差别的内容 + 收口。
 * 关键是**不能空**:采购点进来看到半屏白,前面所有版块建立的印象一次清零。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='帛卉实拍'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => { const v = M[n]; if (!v) throw new Error('缺图 ' + n); return v; };

const PAGES = {
  'about/group': [
    { type: 'bandimg', data: { image: P('platform-map-w1600'), alt: '帛卉集团平台总览架构图',
      display: 'GROUP', title: '五个平台各司其职,研发成果在制造平台之间复用',
      ctaText: '看研发与创新', ctaHref: '/zh-cn/rnd/' } },
    { type: 'procgrid', data: { eyebrow: 'PLATFORMS', tone: 'paper', cols: 3,
      title: '五个平台的分工',
      intro: '两个制造平台负责产,一个 AI 平台负责研,两个品牌平台面向终端。这样研发产出可以在制造平台之间复用,而不是每个品牌各做一遍。',
      items: [
        { image: '/media/57', label: 'BEAUTY2OEM', note: '护肤与彩妆制造' },
        { image: P('filling-line-w720'), label: 'SKIN2OEM', note: '洁护与身体护理制造' },
        { image: P('rnd-office-w720'), label: 'BIOSPHERE-AI', note: 'AI 研发与配方中枢' },
        { image: '/media/10', label: 'MEDIERBA', note: '集团自有品牌' },
        { image: '/media/12', label: 'ORALCARE', note: '口腔护理品牌' },
        { image: P('meeting-room-w720'), label: '集团总部', note: '统一接单与出口单证' },
      ] } },
    { type: 'statement', data: { eyebrow: '为什么分平台', tone: 'leaf',
      title: '一个品牌做一套研发,是把同一笔钱花五遍',
      body: '把研发抽出来做成独立平台,配方库、检测方法与法规判断就成了共享资产。客户拿到的好处很具体:一个已经在别的品类验证过的乳化体系,可以直接拿来改,不用从零开始。' } },
    { type: 'inquiry', data: { title: '不确定该找哪个平台?', body: '把品类和目标市场发过来,我们内部转给对应的平台,不用你自己判断。', ctaText: '发起询盘' } },
  ],

  'about/history': [
    { type: 'procribbon', data: { eyebrow: 'HISTORY', tone: 'deep',
      title: '产能一直跟着订单走',
      intro: '每一次扩产背后都有一个真实的交付压力 —— 先建厂再找客户的做法,我们一次都没有过。',
      steps: [
        { name: '单一车间起步', hand: '膏霜类代工', image: '/media/38' },
        { name: '增设灌装线', hand: '液体与油相分线', image: P('filling-line-w720') },
        { name: '建 GMPC 洁净区', hand: '十万级 · 风淋更衣', image: '/media/43' },
        { name: '自建实验室', hand: '稳定性与微生物自测', image: '/media/48' },
        { name: '扩彩妆压粉线', hand: '粉饼 / 散粉 / 眼影', image: '/media/42' },
        { name: '自有种植基地', hand: '道地产区 · GAP 规范', image: '/media/51' },
        { name: 'AI 配方中枢', hand: '检索 + 实测替代试错', image: P('rnd-office-w720') },
      ] } },
    { type: 'statsband', data: { tone: 'paper', items: [
      { value: '18', unit: '年', label: '代工经验' },
      { value: '12', unit: '条', label: '在产产线' },
      { value: '6', unit: '类', label: '可做品类' },
      { value: '43', unit: '国', label: '出口目的地' },
    ] } },
    { type: 'inquiry', data: { title: '想知道我们做没做过你这个品类?', body: '直接问就行。做过的我们给案例方向,没做过的会直说。', ctaText: '发起询盘' } },
  ],

  'about/plants': [
    { type: 'bandimg', data: { image: P('workshop-corridor-w1600'), alt: '车间分区导视',
      display: 'PLANTS', title: '六个车间,人流物流分道',
      ctaText: '看生产线', ctaHref: '/zh-cn/capabilities/manufacturing/' } },
    { type: 'procgrid', data: { eyebrow: 'CAPACITY', tone: 'sand', cols: 3,
      title: '厂房与产能',
      intro: '乳化、灌装、压粉、冷制四类工艺并行。小批量试产与大货同线,样品和大货不是两条路。',
      items: [
        { image: P('emulsify-hall-w720'), label: '乳化车间', note: '真空乳化 · 常温与冷制' },
        { image: P('filling-line-w720'), label: '灌装区', note: '膏 / 液 / 油分线' },
        { image: '/media/42', label: '压粉线', note: '粉饼 / 散粉 / 眼影' },
        { image: '/media/43', label: '洁净车间', note: '十万级 · 28,000 ㎡' },
        { image: '/media/49', label: '原料仓', note: '分区存放 · 批次可追' },
        { image: '/media/52', label: '成品仓', note: '恒温恒湿' },
      ] } },
    { type: 'statsband', data: { tone: 'ink', items: [
      { value: '28,000', unit: '㎡', label: 'GMPC 洁净厂房' },
      { value: '100k', unit: '级', label: '洁净等级' },
      { value: '12', unit: '条', label: '在产产线' },
      { value: '3,000', unit: '支', label: '最小起订量起' },
    ] } },
    { type: 'inquiry', data: { title: '远程验厂可以今天安排', body: '视频走一遍产线、仓库与实验室 —— 和亲自到场看到的是同一批画面。', ctaText: '发起询盘' } },
  ],

  'capabilities': [
    { type: 'procgrid', data: { eyebrow: 'CAPABILITIES', tone: 'paper', cols: 3,
      title: '我们能接的三类活',
      intro: '从「已有配方要量产」到「只有一个想法」,起点不同,走法也不同。',
      items: [
        { image: P('emulsify-hall-w720'), label: '生产制造', note: '四条线并行,一单可跨品类' },
        { image: P('rnd-office-w720'), label: '品牌孵化', note: '没配方没包材也能开始' },
        { image: '/media/50', label: '包装开发', note: '结构打样 + 相容性测试' },
        { image: P('weighing-room-w720'), label: '配方复刻', note: '逆向 + 合规改造' },
        { image: '/media/46', label: '检测服务', note: '稳定性 / 微生物 / 相容性' },
        { image: '/media/60', label: '出口合规', note: '按目的地备文件' },
      ] } },
    { type: 'statement', data: { eyebrow: '我们不接什么', tone: 'sand',
      title: '一次性的单子我们不接',
      body: '每一单都从产能匹配和法规预判开始 —— 不是我们挑客户,是做不到这两步的单子,做出来也上不了市。与其收了钱再告诉你卡在备案,不如一开始就说清楚。' } },
    { type: 'inquiry', data: { title: '不确定属于哪一类?', body: '把手上有的东西发过来 —— 配方、样品、还是只有一句话的想法,我们都能判断下一步。', ctaText: '发起询盘' } },
  ],

  'capabilities/incubation': [
    { type: 'procribbon', data: { eyebrow: 'INCUBATION', tone: 'deep',
      title: '从一个想法到能上架的产品线',
      intro: '没有配方、没有包材、只有一个方向,也能开始。倒推的顺序是固定的。',
      steps: [
        { name: '品类定位', hand: '目标市场 + 价格带 + 竞品盘点', image: P('meeting-room-w720') },
        { name: '产品线规划', hand: 'SKU 结构与上市节奏', image: '/media/58' },
        { name: '配方方向', hand: '功效路线 + 法规预判', image: P('rnd-office-w720') },
        { name: '包材结构', hand: '成本与货架表现同时定', image: '/media/50' },
        { name: '打样评审', hand: '实样 + 稳定性初测报告', image: P('weighing-room-w720') },
        { name: '首单量产', hand: '批记录 + 全项报告', image: P('filling-line-w720') },
      ] } },
    { type: 'split', data: { image: '/media/58', flip: true, tone: 'sand',
      eyebrow: '孵化', title: '先定卖给谁,再定做什么',
      body: '很多新品牌一上来就问「有什么爆款配方」。顺序反了 —— 同一支面霜在东南亚和欧洲要走的宣称、包装和价格带完全不同。我们从目标市场倒推,得出的产品线才是能落地的。',
      ctaText: '联系我们', ctaHref: '/zh-cn/contact/' } },
    { type: 'inquiry', data: { title: '只有一个想法也可以谈', body: '把品类方向和目标市场写下来,我们回一份可执行的产品线草案。', ctaText: '发起询盘' } },
  ],

  'capabilities/packaging': [
    { type: 'procgrid', data: { eyebrow: 'PACKAGING', tone: 'paper', cols: 3,
      title: '包材开发与测试',
      intro: '瓶罐、软管、泵头、纸盒同步打样。相容性问题在打样阶段暴露,不留到量产。',
      items: [
        { image: '/media/50', label: '包材陈列', note: '在用规格实样可选' },
        { image: '/media/90', label: '瓶罐软管', note: '玻璃 / PET / PP' },
        { image: '/media/91', label: '泵头与盖', note: '回吸、扭力实测' },
        { image: '/media/41', label: '贴标与纸盒', note: '多规格快速换型' },
        { image: '/media/48', label: '相容性测试', note: '膏体与内壁 · 高温加速' },
        { image: '/media/46', label: '装量与密封', note: '装量抽检 · 密封性' },
      ] } },
    { type: 'statement', data: { eyebrow: '包材', tone: 'leaf',
      title: '泵头回吸这种问题,量产后再发现就晚了',
      body: '包材和膏体是一对,不是两件独立采购的东西。精华配错泵头会回吸变色,高油相配错内壁会溶胀 —— 这些都在打样阶段用加速试验测出来,成本是几百块;留到量产暴露,成本是一整批货。' } },
    { type: 'inquiry', data: { title: '有中意的包材?寄样过来测', body: '把包材寄给我们做相容性,或者告诉我们剂型,由我们推荐能配的结构。', ctaText: '发起询盘' } },
  ],

  'rnd/formulation': [
    { type: 'procgrid', data: { eyebrow: 'FORMULATION', tone: 'paper', cols: 3,
      title: '配方库覆盖的剂型',
      intro: '已有配方可复刻,也可按目标宣称新设计。两条路的起点不同,交付物是一样的:一份能量产、能过检、能报批的配方。',
      items: [
        { image: '/media/16', label: '精华与安瓶', note: '水基 / 油基 / 双相' },
        { image: '/media/10', label: '面霜与乳液', note: 'O/W · W/O · 冷制' },
        { image: '/media/17', label: '面膜', note: '片状 / 涂抹 / 冻膜' },
        { image: '/media/11', label: '洁面', note: '氨基酸 / 皂基 / 慕斯' },
        { image: '/media/13', label: '粉体', note: '压粉 / 散粉 / 眼影' },
        { image: '/media/15', label: '唇部与膏体', note: '口红 / 唇膏 / 唇釉' },
      ] } },
    { type: 'split', data: { image: P('weighing-room-w1600'), flip: false, tone: 'sand',
      eyebrow: '复刻', title: '拿一支样品来,我们能拆到能量产的程度',
      body: '逆向不是把 INCI 表抄一遍 —— 同一张成分表能做出十种手感。我们从质构、流变和稳定性三头逼近,再按目的地法规做替换,最后交出的是一份能跑量产的配方,不是一份实验室里能做出来的样品。',
      ctaText: '看实验室', ctaHref: '/zh-cn/rnd/lab/' } },
    { type: 'inquiry', data: { title: '有样品要复刻?', body: '寄样过来,我们先做一次可行性判断再报周期。', ctaText: '发起询盘' } },
  ],

  'rnd/lab': [
    { type: 'procribbon', data: { eyebrow: 'TESTING', tone: 'deep',
      title: '一支配方要过的六道测试',
      intro: '前四道在自有实验室完成,后两道交第三方机构 —— 分界线在于「能不能自己出具有效报告」。',
      steps: [
        { name: '理化检测', hand: 'pH / 黏度 / 离心 / 外观', image: '/media/46' },
        { name: '稳定性', hand: '高温、低温、光照、冷热循环', image: '/media/48' },
        { name: '微生物', hand: '总数 / 致病菌', image: '/media/47' },
        { name: '防腐挑战', hand: 'CTFA 接种试验', image: '/media/47' },
        { name: '人体功效', hand: '第三方机构 · 出具报告', image: '/media/74' },
        { name: '安全性', hand: '第三方机构 · 斑贴与刺激性', image: '/media/75' },
      ] } },
    { type: 'statement', data: { eyebrow: '实验室', tone: 'sand',
      title: '自己测得出来的,我们不外包;测不出来的,我们不假装',
      body: '稳定性和微生物在自有实验室做,是为了改配方时当天就能拿到数据。人体功效和安全性一律交有资质的第三方 —— 那类报告的价值恰恰在于不是我们自己出的。' } },
    { type: 'inquiry', data: { title: '需要哪些报告,取决于货去哪', body: '告诉我们目标市场,我们回一份需要做的测试清单和时间。', ctaText: '发起询盘' } },
  ],

  'contact': [
    { type: 'procgrid', data: { eyebrow: 'CONTACT', tone: 'paper', cols: 3,
      title: '你可以先看这些',
      intro: '发询盘之前,这几块能回答大部分常见问题。',
      items: [
        { image: P('workshop-corridor-w720'), label: '车间与产线', note: '六区分离 · 十万级洁净' },
        { image: '/media/60', label: '资质与认证', note: '证书原件可核' },
        { image: '/media/58', label: '产品展厅', note: '在产品类实样' },
        { image: P('rnd-office-w720'), label: '研发团队', note: '配方师与检测工程师' },
        { image: '/media/50', label: '包材选择', note: '在用规格实样' },
        { image: P('meeting-room-w720'), label: '远程验厂', note: '视频走一遍产线' },
      ] } },
    { type: 'statement', data: { eyebrow: '怎么写询盘', tone: 'leaf',
      title: '写清楚四件事,第一封回复就能用',
      body: '品类、目标市场、预估量、计划上市时间 —— 这四项越具体,我们第一封回复里能给的东西越多:能做的剂型、产能匹配、需要准备的文件清单、大致周期。只写「想做护肤品」,我们也只能回一句「可以做」。' } },
    { type: 'inquiry', data: { title: '两个工作日内书面回复', body: '不确定怎么写也没关系 —— 先把手上有的信息发过来,我们会追问缺的部分。', ctaText: '发起询盘' } },
  ],
};

const sql = [];
let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;
let added = 0;

for (const [slug, blocks] of Object.entries(PAGES)) {
  const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug=${lit(slug)} LIMIT 1`)[0];
  if (!page) { console.warn(`  跳过:没有页面 ${slug}`); continue; }
  sql.push(`UPDATE blocks SET is_visible = 0 WHERE page_id = ${page.id} AND type NOT IN ('hero','prose');`);
  blocks.forEach((b, i) => {
    const id = nextId++;
    sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${page.id},${lit(b.type)},${100 + (i + 1) * 10},'{}',1);`);
    sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
              ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
    added++;
  });
  console.log(`  ${slug.padEnd(26)} +${blocks.length} 块 → ${blocks.map((b) => b.type).join(' → ')}`);
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/inner2.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`\n共新增 ${added} 块,覆盖 ${Object.keys(PAGES).length} 个二级页`);
