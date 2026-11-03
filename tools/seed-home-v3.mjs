/**
 * 首页按**真实企业资料**重排(数据源:tools/bohui-facts.mjs)。
 *
 * 上一版首页的数字是我编的:18 年经验、28,000 ㎡、12 条产线、43 国、25 天打样。
 * 创始人提供的公司介绍显示真实数据是 20,000+ ㎡、15 条产线、3–7 天打样,
 * 而且有一大批我完全不知道的内容:三大核心技术、六步闭环、四性测试十道关、
 * 30+ 合作品牌、300+ 原料供应商、迪士尼等 IP 授权。
 *
 * 编的数字最危险的地方不是"不准",是**它出现在采购最会去核对的位置**:
 * 产能和交期。这一版把每个数字都换成资料里的原值。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
import { FACTS as F } from './bohui-facts.mjs';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder IN ('帛卉实拍','原料溯源')`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => M[n] ?? '';

const fig = (k) => F.figures.find((f) => f.key === k);
const stat = (k, label) => { const f = fig(k); return { value: (f.prefix ? f.prefix + ' ' : '') + f.value, unit: f.unit, label: label ?? f.zh }; };

const BLOCKS = [
  { keep: 233, type: 'announce' },

  { type: 'storehero', data: {
    image: '/media/57',
    company: '广州市帛卉化妆品有限公司 · BIOSPHERE',
    title: '帛卉草本美妆 AI 智造平台',
    intro: '立足广州、布局印尼,集数据洞察、智能研发、柔性智造、品牌孵化、全球服务于一体的草本美妆产业平台。以东方草本与亚马逊植物双源原料为根基,AI 算法贯穿配方研发与生产全流程,为美妆品牌提供从 0 到 1 的全链路赋能。',
    badges: ['ISO 22716', 'GMPC', 'HALAL', 'FDA', 'CPNP', 'OEM / ODM / OBM'],
    ctaText: '发起询盘', ctaHref: '/zh-cn/contact/',
    linkText: '看可做品类' } },

  // 数字条:全部来自公司介绍第 17 页「核心数据汇总」原表
  { type: 'statsband', data: { tone: 'ink', items: [
    stat('area', '全球生产基地总面积'),
    stat('lines', '自动化生产流水线'),
    stat('mask', '面膜类日产能'),
    stat('formulas', '成熟配方技术储备'),
  ] } },

  // 六大核心能力 —— 这是资料里的第一层结构,原来完全没有
  { type: 'procgrid', data: { eyebrow: 'CAPABILITIES', tone: 'paper', cols: 3,
    title: '平台六大核心能力',
    intro: '从一株药材到一支成品,六件事在同一个体系里完成 —— 这是平台和单纯代工厂的区别。',
    items: F.capabilities.map((c, i) => ({
      image: [P('workshop-corridor-w720') || '/media/51', '/media/94', P('emulsify-hall-w720'),
              P('rnd-office-w720'), '/media/49', P('filling-line-w720')][i] || '/media/38',
      label: `${c.n} ${c.zh}`, note: c.note.zh,
    })) } },

  // 智能生产六步闭环 —— 编号在这里是真有含义的
  { type: 'procribbon', data: { eyebrow: 'END-TO-END PROCESS', tone: 'deep',
    title: '每一瓶产品都有草本溯源与 AI 质量记录',
    intro: '从原料到成品六步闭环管控。全流程数据上链留存 —— 客户可通过专属后台实时查看生产进度与质检报告,消费者扫码即可验证产品真伪与溯源信息。',
    steps: F.process.map((s, i) => ({
      name: s.zh, hand: s.hand.zh,
      image: ['/media/51', P('weighing-room-w720'), P('emulsify-hall-w720'), '/media/46', '/media/47', P('filling-line-w720')][i],
    })) } },

  // 品质:四性测试 + 十道安全把关
  { type: 'split', data: { image: '/media/46', flip: false, tone: 'paper',
    eyebrow: '全链路品质保障',
    title: '严苛四性测试,十道安全把关',
    body: `体验性、功效性、稳定性、兼容性四个维度独立评估;原料验收 → 配方审核 → 中试放大 → 在线巡检 → 成品检验 → 出厂放行,${F.quality.note.zh}`,
    ctaText: '看质量与合规', ctaHref: '/zh-cn/quality/' } },

  { type: 'procgrid', data: { eyebrow: 'WORKSHOP', tone: 'sand', cols: 3,
    title: '车间与设备',
    intro: `10 万级 GMP 洁净车间,${fig('lines').value} 条现代化智能产线,配备 IoT 实时数据采集、AI 智能排产与预测性维护系统。`,
    items: [
      { image: P('weighing-room-w720'), label: '称料间', note: '精准称量 · 配方核对 · 误差预警' },
      { image: P('emulsify-hall-w720'), label: '乳化车间', note: '10 万级 GMP 洁净生产' },
      { image: P('filling-line-w720'), label: '智能灌装区', note: '全自动流水线作业' },
      { image: '/media/40', label: '封口与旋盖', note: '自动旋盖 · 扭力可控' },
      { image: '/media/42', label: '粉体压制', note: '压粉饼 / 散粉' },
      { image: '/media/43', label: '洁净车间', note: 'IoT 实时监测温湿度与菌落' },
    ] } },

  { type: 'bandimg', data: { image: P('workshop-corridor-w1600'),
    alt: '帛卉草本美妆 AI 智造平台车间分区', display: 'BIOSPHERE',
    title: '双基地全球化产能布局 —— 广州总部 + 印尼工厂',
    ctaText: '看生产实力', ctaHref: '/zh-cn/capabilities/manufacturing/' } },

  // 三大核心技术壁垒 —— 资料里最硬的一块,原来完全没有
  { type: 'procgrid', data: { eyebrow: 'CORE TECHNOLOGY', tone: 'paper', cols: 3,
    title: '三大核心技术壁垒',
    intro: '三大技术协同应用,实现「草本原料高活性化 + 提取过程高效化 + 功能成分精准化」的技术闭环。',
    items: F.tech.map((t, i) => ({
      image: ['/media/47', '/media/48', '/media/46'][i],
      label: t.zh,
      note: t.stats.map((s) => `${s.v} ${s.l.zh}`).join(' · '),
    })) } },

  // 种植基地 —— 老板要的
  { type: 'split', data: { image: '/media/51', flip: true, tone: 'sand',
    eyebrow: '草本溯源体系',
    title: '合作 20 余家山地种植基地,覆盖贵州毕节、新疆喀什、广东清远',
    body: '依据植物生长周期与活性成分峰值确定最佳采收时点;种植环境、施肥记录、采收批次、检测报告全部进农残溯源台账 —— 客户问「这批料哪来的」,我们答得出地块和采收日期,而不是只报一个供应商名。',
    ctaText: '看种植基地', ctaHref: '/zh-cn/origin/' } },

  // 古方研究
  { type: 'procribbon', data: { eyebrow: 'HERITAGE', tone: 'sand',
    title: '古方研究:20,000 余篇传统古方文献的数字化整理',
    intro: '深挖千年草本智慧,以现代科学验证。这是配方设计的思路来源 —— 古籍记载不构成功效宣称,现代配方一律按目的地法规与第三方实测走。',
    steps: [
      { name: '千金面膏方', hand: '《外台秘要》· 青木香 / 白芷 / 茯苓配伍', image: '/media/94' },
      { name: '延年面脂方', hand: '《外台秘要》· 白术 / 葳蕤 / 木兰皮配伍', image: '/media/95' },
      { name: '广济澡豆方', hand: '《外台秘要》· 白芷 / 白蔹 / 天门冬配伍', image: '/media/96' },
      { name: '千金澡豆方', hand: '《外台秘要》· 桃花 / 樱桃花 / 白莲花配伍', image: '/media/51' },
      { name: '白附子膏方', hand: '《外台秘要》· 白附子 / 丁香 / 商陆配伍', image: '/media/94' },
      { name: '猪胰润肤方', hand: '《外台秘要》· 栝蒌子 / 桃仁 / 芜菁子配伍', image: '/media/95' },
    ] } },

  { type: 'procgrid', data: { eyebrow: 'CATEGORIES', tone: 'paper', cols: 3,
    title: '全品类配方覆盖',
    intro: `${fig('formulas').prefix} ${fig('formulas').value} 个成熟配方储备,支持配方快速定制调整,柔性起订量,${F.sampling.zh}。`,
    items: [
      { image: '/media/10', label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜' },
      { image: '/media/13', label: '彩妆', note: '粉体 / 唇部 / 底妆' },
      { image: '/media/12', label: '口腔护理', note: '漱口水 / 洁牙片 / 口腔喷雾' },
      { image: '/media/11', label: '儿童护肤', note: '低刺激体系 · 单独排产' },
      { image: '/media/14', label: '身体护理', note: '身体乳 / 防晒 / 香氛' },
      { image: '/media/58', label: '国际 IP 赋能', note: '迪士尼 / 驯龙高手 / 蓝精灵' },
    ] } },

  // 双基地
  { type: 'statsband', data: { tone: 'paper', items: [
    stat('lines', '广州总部智能产线'),
    stat('warehouse', '智能化自有仓储'),
    stat('cream', '水乳霜类日产能'),
    stat('rnd', '资深研发团队'),
  ] } },

  // 合作客户品牌墙 —— 创始人点名要的模块
  { type: 'certs', data: { title: '合作品牌',
    note: '已服务 30+ 国内外知名品牌,覆盖美妆个护、口腔护理、母婴等多品类;并承接迪士尼、驯龙高手、蓝精灵等国际 IP 授权产品。',
    items: [...F.clients.slice(0, 18).map((c) => ({ id: c.toLowerCase().replace(/\W+/g, '-'), label: c, note: '' })),
            ...F.ip.map((c) => ({ id: c.toLowerCase().replace(/\W+/g, '-'), label: c, note: 'IP 授权' }))] } },

  // 合作原料品牌方 —— 同上
  { type: 'certs', data: { title: '战略原料供应商',
    note: `${fig('suppliers').prefix} ${fig('suppliers').value} 家全球战略供应商。汇聚全球顶尖原料资源,与行业头部供应商建立深度战略合作,从源头把控原料品质。`,
    items: F.suppliers.map((s) => ({ id: s.toLowerCase().replace(/\W+/g, '-'), label: s, note: '' })) } },

  { type: 'certs', data: { title: '资质与国际认证',
    note: '证书编号与有效期可对扫描件核验。出口目的地不同,需要的文件也不同 —— 这部分由我们按目的地清单统一备齐。',
    items: F.certs.map((c) => ({ id: c.id, label: c.label, note: c.note.zh })) } },

  { type: 'statement', data: { eyebrow: '全球化布局', tone: 'leaf',
    title: '立足中国,服务世界 —— 从本土制造迈向全球产业平台',
    body: F.markets.map((m) => `${m.zh}(${m.note.zh})`).join(' · ') + '。广州总部承载核心研发与品牌赋能,印尼工厂提供东南亚本地化生产、HALAL 认证与关税物流优势。' } },

  { keep: 243, type: 'inquiry' },
];

const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0];
const PID = page.id;
const sql = [`UPDATE blocks SET is_visible = 0 WHERE page_id = ${PID};`];
let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;

BLOCKS.forEach((b, i) => {
  const order = (i + 1) * 10;
  if (b.keep) { sql.push(`UPDATE blocks SET sort_order=${order}, is_visible=1 WHERE id=${b.keep};`); return; }
  const id = nextId++;
  sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${PID},${lit(b.type)},${order},'{}',1);`);
  sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
            ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
});

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/home3.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`首页重排:${BLOCKS.length} 块(数据全部来自公司介绍资料)`);
console.log('  ' + BLOCKS.map((b) => b.type).join(' → '));
