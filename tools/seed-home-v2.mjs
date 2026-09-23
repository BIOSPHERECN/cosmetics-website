/**
 * biosphere-ai 首页重排 —— 解决「五个工艺网格连着排,节奏是平的」。
 *
 * 阿里工厂店铺耐看不是因为图多,是因为**图网格之间夹着别的形状在换气**:
 * 网格 → 流程带 → 图文对开 → 网格 → 通栏大图 → 网格 → 对开 → …
 * 连续五屏同一种网格,读者到第三屏就开始滑而不是看。
 *
 * 同时补上创始人点名要的版块:种植基地(老板要)、古方研究、企业文化、客户见证、参展与展厅。
 */
import { d1 } from './d1.mjs';
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

const page = d1(`SELECT p.id FROM pages p WHERE p.site_id='biosphere-ai' AND p.slug='' LIMIT 1`)[0];
if (!page) throw new Error('找不到 biosphere-ai 首页');
const PID = page.id;

/* 版块顺序即节奏。★ 标的是「换气」块 —— 它们的存在就是为了不让网格连排。 */
const BLOCKS = [
  { type: 'announce', keep: 233 },
  { type: 'storehero', keep: 234 },
  { type: 'statsband', keep: 235 },
  { type: 'procgrid', keep: 236 },                       // 生产实力(6 图)

  // ★ 流程带:网格表达「我们有这些东西」,流程带表达「顺序」—— 工厂真正独有的信息
  { type: 'procribbon', data: {
    eyebrow: 'PROCESS', tone: 'deep',
    title: '一批料从进厂到出柜要走的七道',
    intro: '每一道都有交接物。采购最想确认的不是我们有没有设备,而是这条链完不完整、断在哪里能查到。',
    steps: [
      { name: '来料检验', hand: 'COA 复核 + 留样', image: '/media/49' },
      { name: '称量配料', hand: '配料单 + 双人复核签字', image: '/media/45' },
      { name: '真空乳化', hand: '批记录 · 温度与转速曲线', image: '/media/38' },
      { name: '半成品检验', hand: '外观 / pH / 黏度放行单', image: '/media/46' },
      { name: '灌装旋盖', hand: '装量抽检 · 扭力记录', image: '/media/39' },
      { name: '贴标包装', hand: '版面核对 + 首件确认', image: '/media/41' },
      { name: '成品放行', hand: '微生物报告 + 留样入库', image: '/media/47' },
    ] } },

  { type: 'split', keep: 238 },                          // ★ 图文对开:品质管控
  { type: 'procgrid', keep: 237 },                       // 研发与检测(4 图)

  // ★ 通栏大图:一整屏只有一张图和一行字,是这一页唯一的"留白"
  { type: 'bandimg', data: {
    image: '/media/57', alt: '帛卉集团生产基地厂区',
    display: 'BOHUI', title: '一个厂区,四条线,不用把订单拆到几家工厂',
    ctaText: '看生产实力', ctaHref: '/zh-cn/capabilities/manufacturing/' } },

  { type: 'procgrid', keep: 239 },                       // 产品品类(6 图)

  // ★ 图文对开:种植基地 —— 创始人明确说"老板需要这个"
  { type: 'split', data: {
    image: '/media/51', flip: true, tone: 'sand',
    eyebrow: '种植基地',
    title: '原料不是一个批号,是一片能指得出来的地',
    body: '东方草本与巴西雨林植物两个种源体系,自有种植与代工在同一套体系内。道地产区、GAP 规范种植、采收期与初加工全程留痕 —— 客户问"这批积雪草是哪来的",我们答得出地块和采收日期,而不是只报一个供应商名。',
    ctaText: '看原料与种植', ctaHref: '/zh-cn/capabilities/manufacturing/' } },

  // ★ 古方研究:借 SueAI 的古籍资源,但**定位完全不同**——
  //   那边是中医文献研究,这边是配方灵感来源。所以只讲配伍思路,
  //   不写功效宣称、不写剂量、不暗示疗效,每条都挂出处。
  { type: 'procribbon', data: {
    eyebrow: 'HERITAGE', tone: 'sand',
    title: '古方研究:配伍思路来自古籍,配方仍以法规与实测为准',
    intro: '我们整理了 213 首见于《外台秘要》等古籍的面脂、澡豆、面膏方,作为配方设计的思路来源。这是研究,不是复刻 —— 古籍记载不构成功效宣称,现代配方一律按目的地法规与第三方实测走。',
    steps: [
      { name: '千金面膏方', hand: '《外台秘要》· 面脂类 · 青木香 / 白芷 / 茯苓配伍', image: '/media/94' },
      { name: '延年面脂方', hand: '《外台秘要》· 面脂类 · 白术 / 葳蕤 / 木兰皮配伍', image: '/media/95' },
      { name: '广济澡豆方', hand: '《外台秘要》· 澡豆类 · 白芷 / 白蔹 / 天门冬配伍', image: '/media/96' },
      { name: '千金澡豆方', hand: '《外台秘要》· 澡豆类 · 桃花 / 樱桃花 / 白莲花配伍', image: '/media/51' },
      { name: '白附子膏方', hand: '《外台秘要》· 面方类 · 白附子 / 丁香 / 商陆配伍', image: '/media/94' },
      { name: '猪胰润肤方', hand: '《外台秘要》· 面方类 · 栝蒌子 / 桃仁 / 芜菁子配伍', image: '/media/95' },
    ] } },

  { type: 'procgrid', keep: 240 },                       // 原料与交付(4 图)

  // ★ 陈述屏:企业文化,整屏只有几行字
  { type: 'statement', data: {
    eyebrow: '企业文化', tone: 'leaf',
    title: '把能查证的东西做扎实,不做查不到的承诺',
    body: '代工这门生意里,客户最怕的不是价格高,是交付之后发现和样品不一样、文件补不齐、出了问题找不到记录。我们把留样、批记录、第三方报告当成产品的一部分,而不是出问题后才去补的材料。' } },

  // 团队 · 展厅 · 参展 · 办公 —— 把"公司"这一块补全
  { type: 'procgrid', data: {
    eyebrow: 'COMPANY', tone: 'paper', cols: 3,
    title: '团队、展厅与展会',
    intro: '远程验厂可安排。到不了现场的客户,我们用视频走一遍产线和仓库,和亲自来看到的是同一批画面。',
    items: [
      { image: '/media/54', label: '研发团队', note: '配方师与检测工程师' },
      { image: '/media/55', label: '客户洽谈', note: '打样评审与方案对齐' },
      { image: '/media/56', label: '办公区', note: '接单、跟单与单证' },
      { image: '/media/58', label: '产品展厅', note: '在产品类实样陈列' },
      { image: '/media/59', label: '展会展台', note: '国内外美妆展常设展位' },
      { image: '/media/50', label: '包材陈列', note: '瓶罐软管泵头同步打样' },
    ] } },

  { type: 'certs', keep: 242 },

  // ★ 陈述屏:客户见证 —— 用客户的话收口,比自夸有力
  { type: 'statement', data: {
    eyebrow: '客户见证', tone: 'sand',
    title: '「第二批和第一批是一样的」——这是我们听过最好的评价',
    body: '合作品牌覆盖东南亚、中东与拉美市场。多数客户从一个品类的小批量试单开始,第二年扩到三到四个品类。复购不是靠销售跟得紧,是靠上一批货没出问题。' } },

  { type: 'inquiry', keep: 243 },
];

const sql = [];
sql.push(`UPDATE blocks SET is_visible = 0 WHERE page_id = ${PID};`);
let nextId = (d1(`SELECT MAX(id) m FROM blocks`)[0].m ?? 0) + 1;

BLOCKS.forEach((b, i) => {
  const order = (i + 1) * 10;
  if (b.keep) {
    sql.push(`UPDATE blocks SET sort_order = ${order}, is_visible = 1 WHERE id = ${b.keep};`);
  } else {
    const id = nextId++;
    sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${PID},${lit(b.type)},${order},'{}',1);`);
    // 只写中文源;其余语种由回填补 —— 播种时硬塞英文会让回填以为"已经有了"而跳过
    sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
              ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
  }
});

import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/home.sql';
 mkdirSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache', { recursive: true });
writeFileSync('node_modules/.cache/home.sql', sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`首页重排完成:${BLOCKS.length} 块`);
console.log('  ' + BLOCKS.map((b) => b.type).join(' → '));
console.log(`  沿用 ${BLOCKS.filter((b) => b.keep).length} 块,新建 ${BLOCKS.filter((b) => !b.keep).length} 块`);
