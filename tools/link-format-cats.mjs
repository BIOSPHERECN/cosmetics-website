/**
 * 产品页「可做品类」网格加跳转 —— 创始人确认了这个模式
 * (「这可以点击进入,我们后面会添加大量的产品」),
 * 这一格是他截图指的那一块,补上和首页品类卡同样的 href。
 * 面膜类产品归在护肤品类下,所以面膜卡也指 ?cat=skincare。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const HREF = {
  '护肤': '/zh-cn/products/?cat=skincare',
  '彩妆': '/zh-cn/products/?cat=makeup',
  '洁护': '/zh-cn/products/?cat=cleansing',
  '口腔护理': '/zh-cn/products/?cat=oral',
  '身体与香氛': '/zh-cn/products/?cat=body',
  '身体护理': '/zh-cn/products/?cat=body',
  '儿童护肤': '/zh-cn/products/?cat=kids',
  '面膜': '/zh-cn/products/?cat=skincare',
  '国际 IP 赋能': '/zh-cn/products/',
};

const rows = d1(`SELECT b.id, i.data_json FROM blocks b
                  JOIN pages p ON p.id=b.page_id
                  JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                 WHERE p.site_id='biosphere-ai' AND b.type='procgrid' AND b.is_visible=1
                   AND (i.data_json LIKE '%可做品类%' OR i.data_json LIKE '%全品类配方覆盖%')`);
const sql = [];
for (const r of rows) {
  const dta = JSON.parse(r.data_json);
  let n = 0;
  for (const it of dta.items ?? []) {
    if (!it.href && HREF[it.label]) { it.href = HREF[it.label]; n++; }
  }
  if (!n) { console.log(`  #${r.id} 已全部可点,跳过`); continue; }
  sql.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(dta))}, mt=0 WHERE block_id=${r.id} AND lang='zh-cn';`);
  sql.push(`DELETE FROM block_i18n WHERE block_id=${r.id} AND lang<>'zh-cn';`);
  console.log(`  #${r.id} 「${dta.title}」补 ${n} 个跳转`);
}
if (sql.length) {
  writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/fcat.sql', sql.join('\n'), 'utf8');
  d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/fcat.sql', { file: true });
}
console.log('完成');
