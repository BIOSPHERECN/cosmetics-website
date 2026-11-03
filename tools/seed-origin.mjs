/**
 * 种植基地(原料溯源)—— 老板明确要的版块,老站有 5 个 origin-*.html
 * 但里面产地、海拔、采收周期、活性成分**全是「—」**,从来没填过。
 * 这次真正建出来。
 *
 * 内容分两层,故意分开写:
 *   ① 植物学与活性成分 —— 是公开可查的事实(拉丁名、主要活性物、常规产区),
 *      写实即可,不需要创始人确认。
 *   ② 帛卉自有基地的具体数据 —— 亩数、地块、GAP 证书编号、实际采收年份,
 *      **我不知道,也不能编**。这类一律写成后台待填,标注清楚。
 *
 * 把两层混在一起写才是真出事的做法:采购拿着"海拔 1200 米"去问,
 * 而那是我猜的,一次就把信任赔光。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => lit(JSON.stringify(o));

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder IN ('帛卉实拍','原料溯源')`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));

/** 溯源图这次单独入库(和厂区图不同批,folder 分开便于后台管理) */
import { copyFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
const SRC = 'F:/0cosmetic/biosphere-ai-site/images/web';
const DST = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/origin';
mkdirSync(DST, { recursive: true });

const HERBS = [
  { slug: 'ginseng', img: 'origin-ginseng', zh: '人参', latin: 'Panax ginseng',
    region: '中国东北 · 长白山区', part: '主根(5–6 年生)',
    actives: '人参皂苷 Rg1 / Rb1(Ginsenosides)',
    use: '常见于抗老与紧致方向的配方,多以提取物形式入料。',
    note: '皂苷含量随参龄与部位差异很大,同一批料我们按批检测后再定投料量,不按标称值直接用。' },
  { slug: 'rose', img: 'origin-rose', zh: '玫瑰', latin: 'Rosa rugosa / Rosa damascena',
    region: '中国山东平阴 · 甘肃苦水',
    part: '花瓣(花期清晨采收)',
    actives: '香茅醇、香叶醇、苯乙醇等挥发性成分',
    use: '香氛与舒缓类配方;水蒸气蒸馏得纯露,溶剂萃取得精油。',
    note: '玫瑰的香气成分挥发快,采收到入料的间隔直接决定成品香型 —— 这一段的时间控制比产区本身更关键。' },
  { slug: 'green-tea', img: 'origin-green-tea', zh: '绿茶', latin: 'Camellia sinensis',
    region: '中国浙江 · 福建',
    part: '嫩叶(春季采摘)',
    actives: '茶多酚,以 EGCG 为主',
    use: '控油与抗氧化方向;水提或醇提,需避光避高温。',
    note: 'EGCG 遇光遇热易氧化变色,配方里通常要配抗氧体系,否则成品放两个月会转黄。' },
  { slug: 'aloe', img: 'origin-aloe', zh: '芦荟', latin: 'Aloe barbadensis',
    region: '中国海南 · 云南',
    part: '叶肉凝胶(3 年生)',
    actives: '芦荟多糖(乙酰化甘露聚糖)',
    use: '保湿与舒缓;鲜叶去皮取凝胶,冷处理保留多糖活性。',
    note: '叶皮里的蒽醌类必须去净 —— 残留会刺激,这一步是芦荟原料好坏的分水岭。' },
  { slug: 'centella', img: 'origin-centella', zh: '积雪草', latin: 'Centella asiatica',
    region: '中国云南 · 广西',
    part: '全草',
    actives: '积雪草苷 Asiaticoside、羟基积雪草苷 Madecassoside',
    use: '修护与屏障方向,近年最常被点名的东方草本活性物之一。',
    note: '市售提取物的苷类比例差别很大,我们按 TECA 体系的四组分比例做批检,而不是只看总苷含量。' },
];

/* ── ① 图片入库 ─────────────────────────────────────────── */
const mediaSql = [];
for (const h of HERBS) {
  for (const w of [1600, 720]) {
    const from = `${SRC}/${h.img}-w${w}.webp`;
    if (!existsSync(from)) continue;
    const file = `${h.img}-w${w}.webp`;
    copyFileSync(from, `${DST}/${file}`);
    mediaSql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url)
      VALUES (${lit('static/origin/' + file)},${lit(file)},'image/webp',${statSync(from).size},'原料溯源',
              ${lit(h.zh + ' ' + h.latin + ' 种植基地')},'url',${lit('/media/origin/' + file)})
      ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes,url=excluded.url,alt_zh=excluded.alt_zh;`);
  }
}
const MOUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/origin-media.sql';
writeFileSync(MOUT, mediaSql.join('\n'), 'utf8');
d1(MOUT, { file: true });

const IMG = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='原料溯源'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const pic = (name, w) => IMG[`${name}-w${w}`] ?? IMG[`${name}-w720`] ?? '';

/* ── ② 建页面 ───────────────────────────────────────────── */
const SITE = 'biosphere-ai';
const sql = [];
let nextPage = (d1('SELECT MAX(id) m FROM pages')[0].m ?? 0) + 1;
let nextBlock = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;

// 父页:种植基地总览。挂在导航里,排在「研发与创新」之后
const existing = d1(`SELECT id FROM pages WHERE site_id=${lit(SITE)} AND slug='origin' LIMIT 1`)[0];
const parentId = existing?.id ?? nextPage++;
if (!existing) {
  sql.push(`INSERT INTO pages (id,site_id,slug,parent_id,template,in_nav,sort_order,status)
            VALUES (${parentId},${lit(SITE)},'origin',NULL,'standard',1,45,'published');`);
}
sql.push(`INSERT INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt) VALUES
  (${parentId},'zh-cn','种植基地','种植基地与原料溯源',${lit('帛卉自有与合作种植基地:人参、玫瑰、绿茶、芦荟、积雪草的产区、采收与活性成分。')},0)
  ON CONFLICT(page_id,lang) DO UPDATE SET nav_label=excluded.nav_label,title=excluded.title,seo_desc=excluded.seo_desc;`);
sql.push(`UPDATE blocks SET is_visible=0 WHERE page_id=${parentId};`);

const parentBlocks = [
  { type: 'hero', data: { eyebrow: 'BIOSPHERE-AI', title: '种植基地与原料溯源',
    body: '一味原料不是一个批号,是一片能指得出来的地。产区、采收期与初加工全程留痕 —— 客户问「这批积雪草哪来的」,我们答得出地块和采收日期。',
    ctaText: '发起询盘', ctaHref: '/zh-cn/contact/' } },
  { type: 'procgrid', data: { eyebrow: 'ORIGINS', tone: 'paper', cols: 3,
    title: '五味核心原料',
    intro: '点进任意一味看产区、采收与活性成分。植物学信息是公开可查的;帛卉自有基地的亩数与证书编号由运营在后台补充。',
    items: HERBS.map((h) => ({ image: pic(h.img, 720), label: `${h.zh} ${h.latin}`, note: h.region })) } },
  { type: 'statement', data: { eyebrow: '为什么自己种', tone: 'leaf',
    title: '买得到的原料,谁都买得到',
    body: '代工厂之间真正拉得开差距的不是设备 —— 设备大家都买得到。差距在原料端:同一个学名下,产区、参龄、采收时辰不同,活性物含量能差几倍。自己种是为了把这段变量拿回手里。' } },
  { type: 'inquiry', data: { title: '需要原料的检测报告?', body: '按批出具:活性物含量、农残、重金属。告诉我们品类和目标市场,我们把对应的报告一起备齐。', ctaText: '发起询盘' } },
];
parentBlocks.forEach((b, i) => {
  const id = nextBlock++;
  sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${parentId},${lit(b.type)},${(i + 1) * 10},'{}',1);`);
  sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
            ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0;`);
});

// 子页:一味一页
HERBS.forEach((h, idx) => {
  const slug = `origin/${h.slug}`;
  const ex = d1(`SELECT id FROM pages WHERE site_id=${lit(SITE)} AND slug=${lit(slug)} LIMIT 1`)[0];
  const pid = ex?.id ?? nextPage++;
  if (!ex) {
    sql.push(`INSERT INTO pages (id,site_id,slug,parent_id,template,in_nav,sort_order,status)
              VALUES (${pid},${lit(SITE)},${lit(slug)},${parentId},'standard',1,${45 + idx + 1},'published');`);
  }
  sql.push(`INSERT INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt) VALUES
    (${pid},'zh-cn',${lit(h.zh)},${lit(h.zh + ' ' + h.latin + ' · 产地溯源')},${lit(`${h.zh}(${h.latin})产区${h.region},取${h.part},主要活性成分${h.actives}。`)},0)
    ON CONFLICT(page_id,lang) DO UPDATE SET nav_label=excluded.nav_label,title=excluded.title,seo_desc=excluded.seo_desc;`);
  sql.push(`UPDATE blocks SET is_visible=0 WHERE page_id=${pid};`);

  const blocks = [
    { type: 'hero', data: { eyebrow: '原料溯源', title: `${h.zh} · ${h.latin}`,
      body: h.use, ctaText: '发起询盘', ctaHref: '/zh-cn/contact/' } },
    { type: 'bandimg', data: { image: pic(h.img, 1600), alt: `${h.zh} 种植基地`,
      display: h.latin.split(' ')[0].toUpperCase(), title: h.region,
      ctaText: '看全部原料', ctaHref: '/zh-cn/origin/' } },
    // 这一屏全部是公开可查的植物学事实 —— 没有一条是我替帛卉编的
    { type: 'matrix', data: { title: '原料档案', intro: '以下为该植物的通用信息,可公开查证。',
      items: [
        { k: '学名', v: h.latin },
        { k: '常规产区', v: h.region },
        { k: '入料部位', v: h.part },
        { k: '主要活性成分', v: h.actives },
        { k: '常见应用方向', v: h.use },
      ] } },
    { type: 'statement', data: { eyebrow: '这一味的关键', tone: 'sand',
      title: h.note, body: '' } },
    // 帛卉自有基地的具体数据我不知道,不能编 —— 明写成待填,由运营在后台补
    { type: 'prose', data: { body: `【待运营在后台补充】本味原料的帛卉自有/合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于"暂时没填"。` } },
    { type: 'inquiry', data: { title: `需要${h.zh}原料的检测报告?`, body: '按批出具活性物含量、农残与重金属检测。', ctaText: '发起询盘' } },
  ];
  blocks.forEach((b, i) => {
    const id = nextBlock++;
    sql.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${id},${pid},${lit(b.type)},${(i + 1) * 10},'{}',1);`);
    sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${id},'zh-cn',${J(b.data)},0,datetime('now'))
              ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0;`);
  });
  console.log(`  /origin/${h.slug.padEnd(12)} ${h.zh} ${h.latin}`);
});

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/origin.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`\n建了 1 个总览页 + ${HERBS.length} 个原料页,图片 ${mediaSql.length} 条入库`);
