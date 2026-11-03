/**
 * 三件事一次做完:
 *
 * ① 品类卡换大片图 + 可点击。
 *    创始人:「图片完全没吸引力」「要可以点进去,看到更多的产品」。
 *    新图是 campaign 风(质地飞溅、成分环绕),每张卡 href 到
 *    /products/?cat=xxx —— 产品页那头的筛选已经接好。
 *
 * ② 证书清单全站去重。
 *    创始人:「资质认证有重复,注意全局检查」。
 *    规矩:**每站证书清单只出现一处** —— biosphere-ai 是首页那格真件网格。
 *    首页的文字版「资质与国际认证」、质量页与关于页的文字清单全部隐藏留底;
 *    质量页真件网格的导语补上 MSDS/COA 一句,信息不丢。
 *
 * ③ 首页「合作品牌与国际 IP」墙也加 href(点品牌墙 → 关于页)。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => lit(JSON.stringify(o));

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder IN ('品类大图','合作品牌','资质证书')`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => { const v = M[n]; if (!v) throw new Error('缺图 ' + n); return v; };

const sql = [];
const home = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0].id;

/* ── ① 首页品类卡:大片图 + href ───────────────────────── */
const catGrid = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                     WHERE b.page_id=${home} AND b.type='procgrid' AND b.is_visible=1
                       AND i.data_json LIKE '%全品类配方覆盖%' LIMIT 1`)[0];
if (catGrid) {
  sql.push(`UPDATE block_i18n SET data_json=${J({
    eyebrow: 'CATEGORIES', tone: 'paper', cols: 3,
    title: '全品类配方覆盖',
    intro: '> 13,000 个成熟配方储备,支持配方快速定制调整,柔性起订量,3–7 天快速打样。点任意品类看在售产品。',
    items: [
      { image: P('cat-skincare-h1'), label: '护肤', note: '精华 / 面霜 / 水乳 / 面膜', href: '/zh-cn/products/?cat=skincare' },
      { image: P('cat-makeup-h1'), label: '彩妆', note: '粉体 / 唇部 / 底妆', href: '/zh-cn/products/?cat=makeup' },
      { image: P('cat-oral-h1'), label: '口腔护理', note: '漱口水 / 洁牙片 / 口腔喷雾', href: '/zh-cn/products/?cat=oral' },
      { image: P('cat-kids-h1'), label: '儿童护肤', note: '低刺激体系 · 单独排产', href: '/zh-cn/products/?cat=kids' },
      { image: P('cat-body-h1'), label: '身体护理', note: '身体乳 / 防晒 / 香氛', href: '/zh-cn/products/?cat=body' },
      { image: P('cat-ip-h1'), label: '国际 IP 赋能', note: '迪士尼 / 驯龙高手 / 蓝精灵', href: '/zh-cn/products/' },
    ],
  })}, mt=0 WHERE block_id=${catGrid.id} AND lang='zh-cn';`);
  sql.push(`DELETE FROM block_i18n WHERE block_id=${catGrid.id} AND lang<>'zh-cn';`);
  console.log(`品类卡 #${catGrid.id}:大片图 + 全部可点`);
}

/* ── ② 证书清单全站去重 ───────────────────────────────── */
// 首页文字版「资质与国际认证」——真件网格(#402)已覆盖,隐藏
const dupes = d1(`SELECT b.id, p.slug FROM blocks b
                   JOIN pages p ON p.id=b.page_id
                   JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                  WHERE p.site_id='biosphere-ai' AND b.type='certs' AND b.is_visible=1
                    AND (i.data_json LIKE '%资质与国际认证%'
                      OR i.data_json LIKE '%"title":"认证与资质"%'
                      OR i.data_json LIKE '%专利、认证与资质%' AND b.type='certs')`);
for (const dU of dupes) {
  sql.push(`UPDATE blocks SET is_visible=0 WHERE id=${dU.id};`);
  console.log(`文字版证书清单 #${dU.id}(/${dU.slug || '首页'})已隐藏 —— 真件网格已覆盖`);
}
// 质量页真件网格导语补 MSDS/COA,别丢信息
const qGrid = d1(`SELECT b.id, i.data_json FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                   WHERE b.type='procgrid' AND b.is_visible=1 AND i.data_json LIKE '%出口认证原件%' LIMIT 1`)[0];
if (qGrid) {
  const dta = JSON.parse(qGrid.data_json);
  if (!/MSDS/.test(dta.intro ?? '')) {
    dta.intro = (dta.intro ?? '') + ' MSDS 安全数据表与 COA 检测报告随批出具。';
    sql.push(`UPDATE block_i18n SET data_json=${J(dta)}, mt=0 WHERE block_id=${qGrid.id} AND lang='zh-cn';`);
    sql.push(`DELETE FROM block_i18n WHERE block_id=${qGrid.id} AND lang<>'zh-cn';`);
    console.log(`质量页真件网格 #${qGrid.id} 导语补 MSDS/COA`);
  }
}

/* ── ③ 品牌墙加跳转 ───────────────────────────────────── */
const wallGrid = d1(`SELECT b.id, i.data_json FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                      WHERE b.page_id=${home} AND b.type='procgrid' AND b.is_visible=1
                        AND i.data_json LIKE '%合作品牌与战略供应商%' LIMIT 1`)[0];
if (wallGrid) {
  const dta = JSON.parse(wallGrid.data_json);
  const HREF = { '已服务品牌': '/zh-cn/about/', '战略原料与包材供应商': '/zh-cn/about/', '国际 IP 授权': '/zh-cn/products/' };
  for (const it of dta.items ?? []) if (HREF[it.label]) it.href = HREF[it.label];
  sql.push(`UPDATE block_i18n SET data_json=${J(dta)}, mt=0 WHERE block_id=${wallGrid.id} AND lang='zh-cn';`);
  sql.push(`DELETE FROM block_i18n WHERE block_id=${wallGrid.id} AND lang<>'zh-cn';`);
  console.log(`品牌墙 #${wallGrid.id} 三张卡已可点`);
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/catlinks.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log('完成');
