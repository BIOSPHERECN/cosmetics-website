/**
 * 把产品页的剂型清单从代码搬进数据库。
 *
 * 原来它是 [...path].astro 里的一个中文常量数组,两个后果:
 *  ① 英文访客看到整段中文 —— 翻译管线只处理数据库内容,碰不到代码里的字符串。
 *     出海站的产品页给英文客户看中文,比数字写错还伤。
 *  ② MOQ 数字(3,000 支 / 5,000 盒 / 10,000 片)是编的。
 *     公司资料写的是「柔性起订量」,没有任何具体值。
 *
 * 搬进来之后:运营能在后台改,回填能自动翻,数字回到资料口径。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const ITEMS = [
  { id: 'serum', name: '精华液', summary: '水感或油感基质,活性物浓度可定制', image: '/media/16',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['30ml', '50ml'] }, { label: "包材", values: ['玻璃滴管瓶', '真空泵瓶'] }] },
  { id: 'cream', name: '面霜', summary: '真空乳化,常温与冷制工艺可选', image: '/media/10',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['30g', '50g'] }, { label: "包材", values: ['玻璃罐', 'PP 罐'] }] },
  { id: 'mask', name: '面膜', summary: '水洗式与贴片式,精华液配比可调;日产能超 50 万片', image: '/media/17',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "规格", values: ['单片装', '盒装 5 片'] }, { label: "基布", values: ['天丝', '生物纤维'] }] },
  { id: 'cleanser', name: '洁面', summary: '氨基酸与皂基两条路线', image: '/media/11',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['100ml', '150ml'] }, { label: "形态", values: ['膏状', '慕斯'] }] },
  { id: 'toothpaste', name: '牙膏与口腔护理', summary: '低研磨配方;漱口水、固体洁牙片、口腔喷雾同线', image: '/media/12',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['100g', '120g'] }, { label: "管材", values: ['铝塑复合管', '可回收单材质管'] }] },
  { id: 'powder', name: '粉体彩妆', summary: '压粉与散粉,色号按 Pantone 打样', image: '/media/13',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "形态", values: ['压粉饼', '散粉'] }, { label: "盘型", values: ['单色', '四色'] }] },
  { id: 'oil', name: '精华油', summary: '植物基油相,冷压原料可溯源到地块', image: '/media/14',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['20ml', '30ml'] }, { label: "包材", values: ['滴管瓶', '按压瓶'] }] },
  { id: 'balm', name: '膏体唇部', summary: '润唇与有色唇膏,蜡体配比可调', image: '/media/15',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "形态", values: ['管状', '罐装'] }, { label: "色号", values: ['单色', '定制'] }] },
  { id: 'lotion', name: '水乳', summary: '爽肤水与乳液,日产能超 30 万个', image: '/media/16',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "容量", values: ['100ml', '150ml'] }, { label: "包材", values: ['按压瓶', '喷雾瓶'] }] },
  { id: 'body', name: '身体护理', summary: '身体乳、防晒喷雾与皂类', image: '/media/14',
    moq: '柔性起订量 · 按品类与包材议', options: [{ label: "形态", values: ['乳液', '喷雾', '皂'] }, { label: "容量", values: ['200ml', '300ml'] }] },
];

const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='products' LIMIT 1`)[0];
if (!page) throw new Error('找不到 products 页');

const exist = d1(`SELECT b.id FROM blocks b WHERE b.page_id=${page.id} AND b.type='formats' LIMIT 1`)[0];
const id = exist?.id ?? ((d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1);

const sql = [];
if (!exist) {
  // sort_order 给 5:排在 hero/prose 之后、其余内容版块之前
  sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${page.id},'formats',105,'{}',1);`);
}
sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${lit(JSON.stringify({ items: ITEMS }))},0,datetime('now'))
          ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
sql.push(`DELETE FROM block_i18n WHERE block_id=${id} AND lang<>'zh-cn';`);

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/formats.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`剂型清单入库:${ITEMS.length} 个剂型(版块 #${id}),MOQ 改为「柔性起订量」`);
