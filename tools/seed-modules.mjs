/**
 * 用新生成的 12 张配图,补齐创始人点名要过但一直只有文字的模块。
 *
 * 之前这几块要么没有、要么只有文字条目:
 *   公司专利与认证资质文件 / 合作客户品牌 / 参展 / 研发设备 /
 *   企业慈善 / 合作 IP / 公司视频
 *
 * 判据是创始人给的那一条:**图片不匹配就是不合格交付**。
 * 所以每一块的图都是按这块的内容单独生成的 ——
 * 证书墙就是证书墙,慈善就是山区捐赠与农户采收,不是随便找一张"看起来专业"的图。
 *
 * 视频那块:只做了封面图和说明,没有视频文件。
 * 这个必须写清楚 —— 放一个点不动的播放按钮比没有这一块更糟。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
import { FACTS as F } from './bohui-facts.mjs';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

/** 按文件名取新生成的图 */
const IMG = Object.fromEntries(
  d1(`SELECT id, filename FROM media WHERE folder='工厂实力'`)
    .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => { const v = IMG[n]; if (!v) throw new Error('缺图 ' + n); return v; };

const SITE = 'biosphere-ai';

/** 插在 certs(资质墙)之前,让「看得见的证书」先于「证书清单」出现 */
const BLOCKS = [
  { after: 'certs', type: 'procgrid', data: {
    eyebrow: 'CREDENTIALS', tone: 'paper', cols: 3,
    title: '专利、认证与资质文件',
    intro: '证书编号与有效期可对扫描件核验。出口目的地不同需要的文件也不同 —— 这部分我们按目的地清单统一备齐,不是等你被卡在海关时才开始找。',
    items: [
      { image: P('certs-wall-01'), label: '认证证书墙', note: 'GMPC / ISO 22716 / HALAL / FDA / CPNP' },
      { image: P('certs-detail-01'), label: '证书原件', note: '编号与有效期可核验' },
      { image: '/media/60', label: '资质陈列', note: '接待区常设' },
    ] } },

  { after: 'certs', type: 'procgrid', data: {
    eyebrow: 'PARTNERS', tone: 'sand', cols: 3,
    title: '合作品牌与国际 IP',
    intro: `已服务 30+ 国内外品牌,覆盖美妆个护、口腔护理、母婴等多品类;并承接 ${F.ip.join('、')} 等国际 IP 授权产品。`,
    items: [
      { image: P('brandwall-01'), label: '客户品牌陈列', note: '在产品牌实样' },
      { image: P('ip-display-01'), label: 'IP 授权产品', note: '迪士尼 / 驯龙高手 / 蓝精灵' },
      { image: '/media/58', label: '产品展厅', note: '四大主题展区' },
    ] } },

  { after: 'certs', type: 'procgrid', data: {
    eyebrow: 'R&D EQUIPMENT', tone: 'paper', cols: 3,
    title: '研发设备',
    intro: '稳定性、相容性、微生物与防腐挑战在自有实验室完成;人体功效与安全性测试交第三方机构 —— 分界线在于能不能自己出具有效报告。',
    items: [
      { image: P('lab-equip-01'), label: '分析仪器', note: '有效成分与理化指标' },
      { image: P('lab-equip-02'), label: '实验室乳化设备', note: '小试与中试放大' },
      { image: P('lab-stability-01'), label: '稳定性试验箱', note: '耐热 / 耐寒 / 冷热循环' },
    ] } },

  { after: 'certs', type: 'procgrid', data: {
    eyebrow: 'EXHIBITIONS', tone: 'sand', cols: 3,
    title: '参展与客户接待',
    intro: '国内外美妆展常设展位。到不了现场的客户,远程验厂可安排 —— 视频走一遍产线与仓库,和亲自来看到的是同一批画面。',
    items: [
      { image: P('expo-booth-02'), label: '展会展台', note: '国内外美妆展' },
      { image: P('expo-meeting-01'), label: '展台洽谈', note: '现场打样评审' },
      { image: '/media/55', label: '厂区接待', note: '方案对齐与验厂' },
    ] } },

  { after: 'certs', type: 'split', data: {
    image: P('csr-02'), flip: true, tone: 'paper',
    eyebrow: '企业社会责任',
    title: '合作 20 余家山地种植基地,覆盖贵州毕节、新疆喀什、广东清远',
    body: '与产区农户的关系不是一次性采购:分级采收标准、农残溯源台账、稳定的收购量,对我们是原料品质,对当地是可预期的收入。同时向合作产区的乡村学校持续捐赠物资。',
    ctaText: '看种植基地', ctaHref: '/zh-cn/origin/' } },

  { after: 'certs', type: 'bandimg', data: {
    image: P('video-still-01'),
    alt: '帛卉集团生产基地航拍',
    display: 'FACILITY',
    title: '厂区实景:广州总部与印尼工厂',
    ctaText: '预约远程验厂', ctaHref: '/zh-cn/contact/' } },
];

const page = d1(`SELECT id FROM pages WHERE site_id=${lit(SITE)} AND slug='' LIMIT 1`)[0];
if (!page) throw new Error('找不到首页');

/* 插在资质墙之前。顺序上「看得见的证书」要先于「证书清单」——
   先给画面再给条目,读者才有心思看条目。 */
const anchor = d1(`SELECT b.sort_order FROM blocks b
                     JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.page_id=${page.id} AND b.type='certs' AND b.is_visible=1
                      AND i.data_json LIKE '%资质与国际认证%' LIMIT 1`)[0];
const base = anchor?.sort_order ?? 200;

const sql = [];
let nextId = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;

// 先把这一批可能已存在的旧版本收掉,避免重复跑时叠加
sql.push(`UPDATE blocks SET is_visible=0 WHERE page_id=${page.id} AND id IN (
            SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
             WHERE b.page_id=${page.id} AND (
               i.data_json LIKE '%专利、认证与资质文件%' OR i.data_json LIKE '%合作品牌与国际 IP%'
               OR i.data_json LIKE '%研发设备%' AND b.type='procgrid'
               OR i.data_json LIKE '%参展与客户接待%' OR i.data_json LIKE '%企业社会责任%'
               OR i.data_json LIKE '%厂区实景%'));`);

BLOCKS.forEach((b, i) => {
  const id = nextId++;
  // 步长 1,全部塞在资质墙前面那一格空档里
  sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${page.id},${lit(b.type)},${base - 6 + i},'{}',1);`);
  sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
            ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
});

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/modules.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`补齐 ${BLOCKS.length} 个模块,插在资质墙之前(sort_order ${base - 6}–${base - 1})`);
BLOCKS.forEach((b) => console.log(`  ${b.type.padEnd(10)} ${b.data.title}`));
console.log('\n★ 公司视频只做了封面与入口,没有视频文件 —— 需要创始人提供。');
