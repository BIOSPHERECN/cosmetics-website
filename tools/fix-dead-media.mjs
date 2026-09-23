/**
 * 清掉指向不存在文件的 media 行,并修好引用了它们的版块。
 *
 * 这 16 行(/media/61–76)是当初抓 CC0 工厂素材失败后留下的:
 * 搜索返回的是汽车厂和鸡蛋,素材没入库,但 media 行先建了 ——
 * 于是库里存在一批"看起来可用、实际 404"的图。
 * 它们不报错、不在任何列表里显红,只有真被用到那一天才暴露。
 *
 * 处理方式是**删行**而不是留着标记:留着的下场就是下一次
 * 又有人从图库里挑到它。真要补素材时重新建行即可。
 */
import { writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { d1 } from './d1.mjs';

const rows = d1(`SELECT id, url FROM media WHERE driver='url'`);
const dead = rows.filter((r) => r.url && !existsSync('F:/0cosmetic/cosmetic-sites/apps/web/public' + r.url));
if (!dead.length) { console.log('没有死引用'); process.exit(0); }
const deadIds = new Set(dead.map((r) => String(r.id)));
console.log(`死引用 ${dead.length} 行:${dead.map((r) => r.id).join(' ')}`);

/* 先看有哪些版块正在用它们 —— 直接删行会让那些版块变成空图框 */
const blocks = d1(`SELECT block_id, lang, data_json FROM block_i18n WHERE data_json LIKE '%/media/6%' OR data_json LIKE '%/media/7%'`);
const REPLACE = {
  // 用真实存在的同类图顶上;顶不上的置空(ProcRibbon / ProcGrid 允许无图)
  '61': '/media/38', '62': '/media/39', '63': '/media/40',
  '64': '/media/43', '65': '/media/44', '66': '/media/43',
  '67': '/media/45', '68': '/media/45', '69': '/media/46', '70': '/media/46',
  '71': '/media/46', '72': '/media/48', '73': '/media/48',
  '74': '', '75': '', '76': '',      // 人体功效与安全性是第三方做的,没有自家照片才诚实
};

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [];
let fixed = 0;
for (const b of blocks) {
  let s = b.data_json, touched = false;
  for (const id of deadIds) {
    const re = new RegExp('"/media/' + id + '"', 'g');
    if (re.test(s)) {
      s = s.replace(re, '"' + (REPLACE[id] ?? '') + '"');
      touched = true;
    }
  }
  if (touched) { sql.push(`UPDATE block_i18n SET data_json=${lit(s)} WHERE block_id=${b.block_id} AND lang=${lit(b.lang)};`); fixed++; }
}
sql.push(`DELETE FROM media WHERE id IN (${[...deadIds].join(',')});`);

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/deadmedia.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`修好 ${fixed} 条版块文案,删掉 ${deadIds.size} 行死图`);
