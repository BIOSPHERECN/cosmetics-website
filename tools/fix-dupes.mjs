/**
 * 终检第 10 项抓出的重复标题,逐一处置。
 *
 * 处置不是一律隐藏 —— 三种情况三种做法:
 *   同页同题(真重复)    → 改题:两块内容其实不同(种植基地 vs 慈善),是标题偷懒
 *   跨页同题、内容分层    → 改题区分层级(首页概览 vs 详情页)
 *   平行模板(五个原料页) → 白名单,写清原因
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const sql = [];
const retitle = (id, oldT, newT, why) => {
  const row = d1(`SELECT data_json FROM block_i18n WHERE block_id=${id} AND lang='zh-cn'`)[0];
  if (!row) { console.log(`  ★ #${id} 找不到`); return; }
  const dta = JSON.parse(row.data_json);
  if (dta.title !== oldT) { console.log(`  ★ #${id} 标题已不是「${oldT}」,跳过`); return; }
  dta.title = newT;
  sql.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(dta))}, mt=0 WHERE block_id=${id} AND lang='zh-cn';`);
  sql.push(`DELETE FROM block_i18n WHERE block_id=${id} AND lang<>'zh-cn';`);
  console.log(`  #${id} 「${oldT}」→「${newT}」(${why})`);
};

// 首页真重复:#406 是企业社会责任角度(捐赠+农户),标题却抄了 #351 的种植基地
retitle(406, '合作 20 余家山地种植基地,覆盖贵州毕节、新疆喀什、广东清远',
  '与产区共生:企业社会责任', '同页同题,实为两块不同内容');

// 首页概览 vs 生产线详情页:层级不同,标题要分层
retitle(348, '车间与设备', '生产实力', '首页是概览,详情在 capabilities/manufacturing');

// skin2oem:首页与 about 各一份证书清单,留首页那份
sql.push(`UPDATE blocks SET is_visible=0 WHERE id=390;`);
console.log('  #390 skin2oem/about 证书清单隐藏(首页已有)');

// oralcare:首页与 capabilities 同题「生产基地」,capabilities 改成产能角度
retitle(196, '生产基地', '双基地产能布局', '与首页同题,改为产能角度');

writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/dupes.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/dupes.sql', { file: true });
console.log('完成');
