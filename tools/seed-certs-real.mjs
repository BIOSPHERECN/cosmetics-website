/**
 * 把 PPT P13 的**真证书扫描件**换进站点。
 *
 * 创始人:「资质和认证也参考 PPT 的图片」。
 * 这一版之前的资质区用的是 AI 生成的"证书墙"—— 构图对但内容是虚的。
 * PPT 里有 11 张真件:DEKRA 签发给广州帛卉的 GMPC 与 ISO 22716、
 * 发明专利证书、两张 HALAL、CPNP、FDA、营业执照、暨南大学 EMBA 基地牌、
 * 突出贡献奖、贸促会证明书。真件的可信度和生成图不是一个量级 ——
 * 尤其站上写着「证书编号与有效期可对扫描件核验」,现在扫描件就在页面上。
 *
 * 摆放:
 *   首页   六张核心认证(GMPC / ISO / 专利 / HALAL / CPNP / FDA)
 *   质量页 出口相关四张(两张 HALAL / CPNP / FDA)
 *   关于页 企业荣誉三张(营业执照 / EMBA 基地 / 突出贡献奖)
 *
 * 证书是竖幅(约 0.72:1),网格卡是 4:3 裁切 —— 全部补白边到 4:3,一字不裁。
 */
import { statSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => lit(JSON.stringify(o));
const T = 'C:/Users/Administrator/AppData/Local/Temp';
const D = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

const CERTS = [
  [132, 'cert-gmpc',    'GMPC 化妆品良好生产规范证书(DEKRA 签发,广州帛卉)'],
  [134, 'cert-iso',     'ISO 22716:2007 证书(DEKRA 签发,广州帛卉)'],
  [136, 'cert-patent',  '发明专利证书'],
  [142, 'cert-halal',   'HALAL 清真认证证书'],
  [140, 'cert-cpnp',    '欧盟 CPNP 注册证书'],
  [141, 'cert-fda',     '美国 FDA 注册证书'],
  [138, 'cert-halal-ahf', '美国清真基金会 AHF HALAL 证书'],
  [150, 'cert-ccpit',   '中国国际贸易促进委员会证明书'],
  [144, 'cert-license', '营业执照(广州市帛卉化妆品有限公司)'],
  [146, 'honor-emba',   '暨南大学管理学院 EMBA 创新实践基地'],
  [148, 'honor-award',  '2023 年度龙归街「四上企业」突出贡献奖'],
];

const sql = [];
for (const [xref, file, alt] of CERTS) {
  const src = `${T}/cert-x${xref}.png`;
  const dst = `${D}/${file}.webp`;
  const m = await sharp(src).metadata();
  // 补白边到 4:3:竖幅证书左右加白,横幅奖牌上下加白
  const targetRatio = 4 / 3;
  let w = m.width, h = m.height;
  if (w / h < targetRatio) w = Math.round(h * targetRatio);
  else h = Math.round(w / targetRatio);
  await sharp(src)
    .extend({ top: Math.floor((h - m.height) / 2), bottom: Math.ceil((h - m.height) / 2),
              left: Math.floor((w - m.width) / 2), right: Math.ceil((w - m.width) / 2),
              background: { r: 250, g: 250, b: 250 } })
    .resize({ width: 1000, withoutEnlargement: true })
    .webp({ quality: 87 }).toFile(dst);
  const bytes = statSync(dst).size;
  sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
    VALUES (${lit('static/shots/' + file + '.webp')},${lit(file + '.webp')},'image/webp',${bytes},
            '资质证书',${lit(alt)},'url',${lit('/media/shots/' + file + '.webp')},'公司介绍 PPT 抽取')
    ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, alt_zh=excluded.alt_zh;`);
  console.log(`  ${file}.webp ${(bytes / 1024).toFixed(0)}KB`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/certs1.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/certs1.sql', { file: true });

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='资质证书'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
console.log('入库:', Object.keys(M).length, '张');

/* ── 首页:专利认证网格换成六张真件 ─────────────────────── */
const sql2 = [];
const home = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0].id;
const grid = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                  WHERE b.page_id=${home} AND b.type='procgrid' AND b.is_visible=1
                    AND i.data_json LIKE '%专利、认证与资质文件%' LIMIT 1`)[0];
if (grid) {
  sql2.push(`UPDATE block_i18n SET data_json=${J({
    eyebrow: 'CREDENTIALS', tone: 'paper', cols: 3,
    title: '专利、认证与资质文件',
    intro: '以下均为证书原件扫描:编号与有效期页面上可直接核对。出口目的地不同需要的文件也不同,由我们按目的地清单统一备齐。',
    items: [
      { image: M['cert-gmpc'], label: 'GMPC', note: 'DEKRA 签发 · 化妆品良好生产规范' },
      { image: M['cert-iso'], label: 'ISO 22716:2007', note: 'DEKRA 签发 · 化妆品 GMP 国际标准' },
      { image: M['cert-patent'], label: '发明专利', note: '核心技术专利证书' },
      { image: M['cert-halal'], label: 'HALAL 清真认证', note: '中东与印尼市场准入' },
      { image: M['cert-cpnp'], label: '欧盟 CPNP', note: '欧盟化妆品注册' },
      { image: M['cert-fda'], label: '美国 FDA', note: '化妆品设施注册' },
    ],
  })}, mt=0 WHERE block_id=${grid.id} AND lang='zh-cn';`);
  sql2.push(`DELETE FROM block_i18n WHERE block_id=${grid.id} AND lang<>'zh-cn';`);
  console.log(`首页专利认证网格 #${grid.id} → 六张真件`);
}

/* ── 质量页:出口认证原件四张 ──────────────────────────── */
const quality = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='quality' LIMIT 1`)[0].id;
const qExist = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.page_id=${quality} AND i.data_json LIKE '%出口认证原件%' LIMIT 1`)[0];
const qData = {
  eyebrow: 'EXPORT CREDENTIALS', tone: 'paper', cols: 2,
  title: '出口认证原件',
  intro: '货要出到哪,对应的注册就在这。两张 HALAL(国际清真 + 美国 AHF)覆盖中东与东南亚,CPNP 与 FDA 分别对应欧盟与美国。',
  items: [
    { image: M['cert-halal'], label: 'HALAL 清真认证', note: '中东 / 印尼市场' },
    { image: M['cert-halal-ahf'], label: 'AHF HALAL(美国清真基金会)', note: '北美清真市场' },
    { image: M['cert-cpnp'], label: '欧盟 CPNP 注册', note: '欧盟全境' },
    { image: M['cert-fda'], label: '美国 FDA 注册', note: '化妆品设施注册' },
  ],
};
if (qExist) {
  sql2.push(`UPDATE block_i18n SET data_json=${J(qData)}, mt=0 WHERE block_id=${qExist.id} AND lang='zh-cn';`);
  sql2.push(`DELETE FROM block_i18n WHERE block_id=${qExist.id} AND lang<>'zh-cn';`);
} else {
  const nid = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 1;
  const certSort = d1(`SELECT sort_order FROM blocks WHERE page_id=${quality} AND type='certs' AND is_visible=1 LIMIT 1`)[0];
  sql2.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible)
             VALUES (${nid},${quality},'procgrid',${(certSort?.sort_order ?? 200) - 1},'{}',1);`);
  sql2.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${nid},'zh-cn',${J(qData)},0,datetime('now'));`);
  console.log(`质量页新增出口认证原件 #${nid}`);
}

/* ── 关于页:企业荣誉三张 ─────────────────────────────── */
const about = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about' LIMIT 1`)[0].id;
const aExist = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.page_id=${about} AND i.data_json LIKE '%企业资质与荣誉%' LIMIT 1`)[0];
const aData = {
  eyebrow: 'HONORS', tone: 'sand', cols: 3,
  title: '企业资质与荣誉',
  intro: '主体资质与近年荣誉。营业执照原件页面可核。',
  items: [
    { image: M['cert-license'], label: '营业执照', note: '广州市帛卉化妆品有限公司' },
    { image: M['honor-emba'], label: 'EMBA 创新实践基地', note: '暨南大学管理学院授牌' },
    { image: M['honor-award'], label: '突出贡献奖', note: '2023 年度「四上企业」' },
  ],
};
if (aExist) {
  sql2.push(`UPDATE block_i18n SET data_json=${J(aData)}, mt=0 WHERE block_id=${aExist.id} AND lang='zh-cn';`);
  sql2.push(`DELETE FROM block_i18n WHERE block_id=${aExist.id} AND lang<>'zh-cn';`);
} else {
  const nid = (d1('SELECT MAX(id) m FROM blocks')[0].m ?? 0) + 2;
  const certSort = d1(`SELECT sort_order FROM blocks WHERE page_id=${about} AND type='certs' AND is_visible=1 LIMIT 1`)[0];
  sql2.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible)
             VALUES (${nid},${about},'procgrid',${(certSort?.sort_order ?? 200) - 1},'{}',1);`);
  sql2.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${nid},'zh-cn',${J(aData)},0,datetime('now'));`);
  console.log(`关于页新增企业荣誉 #${nid}`);
}

writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/certs2.sql', sql2.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/certs2.sql', { file: true });
console.log('完成');
