/**
 * 内页补齐 —— 首页做成了阿里店铺,内页却还是「大标题 + 一段话」两块。
 * 采购从首页点进「生产线」看到半屏空白,比首页本身薄更伤:
 * 首页薄只是没展开,内页空是**证明不了**。
 *
 * 每页骨架都遵循同一条:说明 → 看图 → 讲顺序 → 给凭据 → 收口询盘。
 * 顺序类信息一律用 procribbon(编号在那里是真有含义的),
 * 并列类用 procgrid,展开与对比用 split —— 同一种形状不连排。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='帛卉实拍'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => { const v = M[n]; if (!v) throw new Error('缺图 ' + n); return v; };

const PAGES = {
  /* ── 公司介绍:创始人列的模块大半落在这一页 ─────────────── */
  'about': [
    { type: 'statsband', data: { tone: 'ink', items: [
      { value: '18', unit: '年', label: '代工经验' },
      { value: '28,000', unit: '㎡', label: 'GMPC 洁净厂房' },
      { value: '12', unit: '条', label: '乳化 / 灌装 / 压粉产线' },
      { value: '43', unit: '国', label: '出口目的地' },
    ] } },
    { type: 'bandimg', data: { image: P('workshop-corridor-w1600'),
      alt: '帛卉草本美妆 AI 智造平台车间分区', display: 'BOHUI',
      title: '六个车间,从原料预处理到冷链仓储在同一栋楼里',
      ctaText: '看生产实力', ctaHref: '/zh-cn/capabilities/manufacturing/' } },
    { type: 'procgrid', data: { eyebrow: 'COMPANY', tone: 'paper', cols: 3,
      title: '公司概况', intro: '厂区、办公与接待在同一园区。远程验厂可安排,客户到不了现场时我们用视频走一遍。',
      items: [
        { image: '/media/57', label: '厂区外观', note: '自有厂房,非租赁代工' },
        { image: P('workshop-corridor-w720'), label: '车间分区', note: '六区分离 · 人流物流分道' },
        { image: P('meeting-room-w720'), label: '战略会议室', note: '客户洽谈与方案评审' },
        { image: P('rnd-office-w720'), label: '技术部办公室', note: '研发协同 · 配方优化' },
        { image: '/media/56', label: '办公区', note: '接单、跟单与出口单证' },
        { image: '/media/58', label: '产品展厅', note: '在产品类实样陈列' },
      ] } },
    { type: 'split', data: { image: P('culture-corridor-w1600'), flip: false, tone: 'sand',
      eyebrow: '品牌介绍', title: '帛卉做的是「草本 + AI」,不是把两个词摆在一起',
      body: '草本是原料端:自有种植、道地产区、可追溯到地块。AI 是配方端:用检索与实测替代拍脑袋试错,把打样周期压下来。两头都落在同一条产线上,客户拿到的才是一支能复现的产品,而不是一次性的样品。',
      ctaText: '看研发与创新', ctaHref: '/zh-cn/rnd/' } },
    { type: 'procribbon', data: { eyebrow: 'HISTORY', tone: 'deep',
      title: '产能一直跟着订单走,没有一次是先建厂再找客户',
      intro: '每一步扩产都对应一个真实的交付压力 —— 这是我们敢承诺交期的原因。',
      steps: [
        { name: '单一车间起步', hand: '膏霜类代工', image: '/media/38' },
        { name: '增设灌装线', hand: '液体与油相分线', image: P('filling-line-w720') },
        { name: '建 GMPC 洁净区', hand: '十万级 · 风淋更衣', image: '/media/43' },
        { name: '自建实验室', hand: '稳定性与微生物自测', image: '/media/48' },
        { name: '扩彩妆压粉线', hand: '粉饼 / 散粉 / 眼影', image: '/media/42' },
        { name: '自有种植基地', hand: '道地产区 · GAP 规范', image: '/media/51' },
      ] } },
    { type: 'procgrid', data: { eyebrow: 'TEAM', tone: 'sand', cols: 3,
      title: '团队风采与展会',
      intro: '配方师、检测工程师、跟单与单证四类人在同一栋楼办公 —— 客户的问题不用跨部门转三次。',
      items: [
        { image: '/media/54', label: '研发团队', note: '配方师与检测工程师' },
        { image: '/media/45', label: '配方实验室', note: '定制与复刻' },
        { image: '/media/55', label: '客户洽谈', note: '打样评审与方案对齐' },
        { image: '/media/59', label: '展会展台', note: '国内外美妆展常设展位' },
        { image: '/media/58', label: '展厅陈列', note: '在产品类实样' },
        { image: '/media/60', label: '资质墙', note: '证书原件可核' },
      ] } },
    { type: 'statement', data: { eyebrow: '企业文化', tone: 'leaf',
      title: '安全第一 · 质量优先 · 数据追溯 · 责任到人',
      body: '这四句写在生产中心的墙上,也写在每一份批记录的签字栏里。代工这门生意最终卖的不是产能,是「出了问题查得到、下一批还能一样」这件事。' } },
    { type: 'certs', data: { title: '专利、认证与资质',
      note: '证书编号与有效期可对扫描件核验。出口目的地不同,需要的文件也不同 —— 这部分由我们按目的地清单统一备齐。',
      items: [
        { id: 'iso22716', label: 'ISO 22716', note: '化妆品良好生产规范 GMPC' },
        { id: 'iso9001', label: 'ISO 9001', note: '质量管理体系' },
        { id: 'gmpc', label: 'GMPC', note: '洁净车间等级认证' },
        { id: 'cpnp', label: '欧盟 CPNP', note: '出口欧盟备案,可协助办理' },
        { id: 'msds', label: 'MSDS / COA', note: '安全数据表与检测报告,随批出具' },
        { id: 'vegan', label: '纯素 / 零残忍', note: '按品牌需求申办' },
      ] } },
    { type: 'inquiry', data: { title: '想先看厂?远程验厂可以今天就安排',
      body: '视频走一遍产线、仓库与实验室,和亲自到场看到的是同一批画面。需要现场的,我们协助安排行程。',
      ctaText: '发起询盘' } },
  ],

  /* ── 生产线 ─────────────────────────────────────────── */
  'capabilities/manufacturing': [
    { type: 'bandimg', data: { image: P('bohui-scene-12-w1600'),
      alt: 'AI 智造生产中心:标准化、可视化、可追溯', display: 'LINES',
      title: '标准化 · 可视化 · 可追溯',
      ctaText: '看质量与合规', ctaHref: '/zh-cn/quality/' } },
    { type: 'procgrid', data: { eyebrow: 'WORKSHOP', tone: 'paper', cols: 3,
      title: '车间与设备',
      intro: '五道主工序全部自有。小批量试产与大货同线 —— 配方一致性不靠换厂来碰运气。',
      items: [
        { image: P('weighing-room-w720'), label: '称料间', note: '精准称量 · 配方核对 · 误差预警' },
        { image: P('emulsify-hall-w720'), label: '乳化车间', note: '真空乳化 · 常温与冷制可选' },
        { image: P('filling-line-w720'), label: '智能灌装区', note: '膏体 / 液体 / 油相分线' },
        { image: '/media/40', label: '封口与旋盖', note: '自动旋盖 · 扭力可控' },
        { image: '/media/42', label: '粉体压制', note: '压粉饼 / 散粉' },
        { image: '/media/43', label: '洁净车间', note: '十万级 · 风淋更衣' },
      ] } },
    { type: 'procribbon', data: { eyebrow: 'PROCESS', tone: 'deep',
      title: '一批料从进厂到出柜要走的七道',
      intro: '每一道都有交接物。采购真正要确认的不是我们有没有设备,是这条链完不完整、断在哪里能查到。',
      steps: [
        { name: '来料检验', hand: 'COA 复核 + 留样', image: '/media/49' },
        { name: '称量配料', hand: '配料单 + 双人复核签字', image: P('weighing-room-w720') },
        { name: '真空乳化', hand: '批记录 · 温度与转速曲线', image: P('emulsify-hall-w720') },
        { name: '半成品检验', hand: '外观 / pH / 黏度放行单', image: '/media/46' },
        { name: '灌装旋盖', hand: '装量抽检 · 扭力记录', image: P('filling-line-w720') },
        { name: '贴标包装', hand: '版面核对 + 首件确认', image: '/media/41' },
        { name: '成品放行', hand: '微生物报告 + 留样入库', image: '/media/47' },
      ] } },
    { type: 'split', data: { image: '/media/50', flip: true, tone: 'sand',
      eyebrow: '包材', title: '包材选错,成本结构和货架表现一起塌',
      body: '瓶罐、软管、泵头、纸盒同步打样,配套做相容性测试 —— 膏体和内壁不合、泵头回吸、印刷掉色这类问题在打样阶段就暴露,不留到量产。',
      ctaText: '看包装能力', ctaHref: '/zh-cn/capabilities/packaging/' } },
    { type: 'statsband', data: { tone: 'paper', items: [
      { value: '3,000', unit: '支', label: '最小起订量起' },
      { value: '25', unit: '天', label: '打样周期' },
      { value: '12', unit: '条', label: '在产产线' },
      { value: '100k', unit: '级', label: '洁净等级' },
    ] } },
    { type: 'inquiry', data: { title: '把品类、目标市场和预估量发过来',
      body: '两个工作日内回一份书面方案:产能匹配、可行的剂型、需要准备的文件清单。', ctaText: '发起询盘' } },
  ],

  /* ── 研发与创新 ─────────────────────────────────────── */
  'rnd': [
    { type: 'procgrid', data: { eyebrow: 'LAB', tone: 'paper', cols: 2,
      title: '实验室与检测能力',
      intro: '稳定性、相容性、微生物与防腐挑战在自有实验室完成;人体功效与安全性测试交第三方机构。',
      items: [
        { image: '/media/45', label: '配方实验室', note: '定制与复刻' },
        { image: '/media/46', label: '分析检测', note: '有效成分与理化指标' },
        { image: '/media/47', label: '微生物检测', note: '总数 / 致病菌' },
        { image: '/media/48', label: '稳定性测试', note: '高温 · 光照 · 冷热循环' },
      ] } },
    { type: 'split', data: { image: P('rnd-office-w1600'), flip: false, tone: 'sand',
      eyebrow: '研发团队', title: '配方师和检测工程师坐在同一间办公室',
      body: '配方改一版,检测当天就能排上;检测发现问题,配方师转过身就能改。这不是效率上的小优势 —— 打样周期能压到 25 天,靠的就是中间没有跨公司的等待。',
      ctaText: '看配方技术', ctaHref: '/zh-cn/rnd/formulation/' } },
    { type: 'procribbon', data: { eyebrow: 'HERITAGE', tone: 'sand',
      title: '古方研究:配伍思路来自古籍,配方仍以法规与实测为准',
      intro: '我们整理了 213 首见于《外台秘要》等古籍的面脂、澡豆、面膏方作为配方设计的思路来源。这是研究,不是复刻 —— 古籍记载不构成功效宣称。',
      steps: [
        { name: '千金面膏方', hand: '《外台秘要》· 青木香 / 白芷 / 茯苓配伍', image: '/media/94' },
        { name: '延年面脂方', hand: '《外台秘要》· 白术 / 葳蕤 / 木兰皮配伍', image: '/media/95' },
        { name: '广济澡豆方', hand: '《外台秘要》· 白芷 / 白蔹 / 天门冬配伍', image: '/media/96' },
        { name: '千金澡豆方', hand: '《外台秘要》· 桃花 / 樱桃花 / 白莲花配伍', image: '/media/51' },
        { name: '白附子膏方', hand: '《外台秘要》· 白附子 / 丁香 / 商陆配伍', image: '/media/94' },
        { name: '猪胰润肤方', hand: '《外台秘要》· 栝蒌子 / 桃仁 / 芜菁子配伍', image: '/media/95' },
      ] } },
    { type: 'statement', data: { eyebrow: '研发原则', tone: 'leaf',
      title: '每一条宣称都要配得出一份测试方案',
      body: '做不出佐证的方向,我们会直说做不了,而不是先接单再想办法。研发不是把活性物往上堆,是在法规允许的范围内找功效与稳定性的平衡点。' } },
    { type: 'inquiry', data: { title: '有配方要复刻,或者只有一个方向?',
      body: '两种都能谈。已有配方我们做逆向与合规改造;只有方向的,从品类定位倒推出可执行的配方路线。', ctaText: '发起询盘' } },
  ],

  /* ── 质量与合规 ─────────────────────────────────────── */
  'quality': [
    { type: 'procribbon', data: { eyebrow: 'QC', tone: 'deep',
      title: '质检流程:三道关口独立记录',
      intro: '进料、过程、成品各自留痕,互不覆盖 —— 出问题时能定位到是哪一关放过去的,而不是只知道「这批不合格」。',
      steps: [
        { name: '进料检验', hand: '供应商 COA 复核 + 自检留样', image: '/media/49' },
        { name: '过程巡检', hand: '每 30 分钟记录一次关键参数', image: P('emulsify-hall-w720') },
        { name: '半成品放行', hand: '外观 / pH / 黏度 / 离心', image: '/media/46' },
        { name: '微生物检验', hand: '总数与致病菌,不合格不灌装', image: '/media/47' },
        { name: '成品放行', hand: '全项检测报告 + 留样入库', image: '/media/48' },
        { name: '留样追溯', hand: '按保质期留样,可随时复检', image: '/media/52' },
      ] } },
    { type: 'split', data: { image: '/media/60', flip: true, tone: 'sand',
      eyebrow: '出口文件', title: '需要哪些文件,取决于货要去哪',
      body: '欧盟要 CPNP 备案与 PIF,东南亚多国要 Notification,中东要 SFDA 或 SASO。清单我们按目的地备齐,不是等客户被卡在海关时才开始找。',
      ctaText: '联系我们', ctaHref: '/zh-cn/contact/' } },
    { type: 'certs', data: { title: '认证与资质',
      note: '证书编号与有效期可对扫描件核验。',
      items: [
        { id: 'iso22716', label: 'ISO 22716', note: '化妆品良好生产规范 GMPC' },
        { id: 'iso9001', label: 'ISO 9001', note: '质量管理体系' },
        { id: 'gmpc', label: 'GMPC', note: '洁净车间等级认证' },
        { id: 'cpnp', label: '欧盟 CPNP', note: '出口欧盟备案,可协助办理' },
        { id: 'msds', label: 'MSDS / COA', note: '安全数据表与检测报告,随批出具' },
      ] } },
    { type: 'inquiry', data: { title: '目的地清单发我们,文件这块我们接',
      body: '告诉我们货要去哪个市场,我们回一份需要准备的文件清单和大致时间。', ctaText: '发起询盘' } },
  ],

  /* ── 产品 ───────────────────────────────────────────── */
  'products': [
    { type: 'procgrid', data: { eyebrow: 'CATEGORIES', tone: 'paper', cols: 3,
      title: '可做品类',
      intro: '一张订单可以跨品类。婴童与眼周产品单独排产,不与彩妆共线。',
      items: [
        { image: '/media/10', label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜' },
        { image: '/media/13', label: '彩妆', note: '粉体 / 唇部 / 底妆' },
        { image: '/media/11', label: '洁护', note: '洁面 / 沐浴 / 洗护' },
        { image: '/media/12', label: '口腔护理', note: '牙膏 / 漱口水' },
        { image: '/media/14', label: '身体与香氛', note: '身体乳 / 香水 / 皂类' },
        { image: '/media/17', label: '面膜', note: '片状 / 涂抹 / 冻膜' },
      ] } },
    { type: 'split', data: { image: P('weighing-room-w1600'), flip: false, tone: 'sand',
      eyebrow: '打样', title: '从收到需求到寄出样品,25 天',
      body: '第 1–5 天配方方向与法规预判,第 6–15 天小试与调整,第 16–22 天稳定性初测,第 23–25 天打样寄出。每个节点都会同步进度,不会到期才告诉你做不出来。',
      ctaText: '发起询盘', ctaHref: '/zh-cn/contact/' } },
    { type: 'statsband', data: { tone: 'ink', items: [
      { value: '3,000', unit: '支', label: '最小起订量起' },
      { value: '25', unit: '天', label: '打样周期' },
      { value: '6', unit: '类', label: '可做品类' },
      { value: '43', unit: '国', label: '出口目的地' },
    ] } },
    { type: 'inquiry', data: { title: '挑好规格,一次发过来',
      body: '把品类、剂型、预估量和目标市场写清楚,我们两个工作日内回可执行的方案。', ctaText: '发起询盘' } },
  ],
};

const sql = [];
let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;
let added = 0;

for (const [slug, blocks] of Object.entries(PAGES)) {
  const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug=${lit(slug)} LIMIT 1`)[0];
  if (!page) { console.warn(`  跳过:没有页面 ${slug}`); continue; }
  // 保留原有 hero + prose(它们是页头与导语),只在后面接内容;
  // 重复跑时先把上一轮加的收掉,不然会越叠越多
  sql.push(`UPDATE blocks SET is_visible = 0 WHERE page_id = ${page.id} AND type NOT IN ('hero','prose');`);
  const base = 100;
  blocks.forEach((b, i) => {
    const id = nextId++;
    sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${page.id},${lit(b.type)},${base + (i + 1) * 10},'{}',1);`);
    sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
              ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
    added++;
  });
  console.log(`  ${slug.padEnd(28)} +${blocks.length} 块 → ${blocks.map((b) => b.type).join(' → ')}`);
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/inner.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`\n共新增 ${added} 块,覆盖 ${Object.keys(PAGES).length} 个内页`);
