/**
 * 给「同名换过内容」的图换文件名,破缓存。
 *
 * 教训:/media/{id} 是 302 到静态路径、缓存 1 小时;静态文件本身还有边缘缓存。
 * 我重生成剂型图时写回了**同名文件** —— 于是创始人的浏览器里,
 * 丰胸膏老广告在我"修完"之后照样端出来。
 * 图片路径从此一律**只加不改**:内容变 = 文件名变(-v2 后缀),改 media.url 指过去。
 */
import { copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const D = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

// 这 5 个是"删旧文件后同名重生成"的 —— 正是会被缓存坑的那批
const STALE = ['fmt-cream', 'fmt-cleanser', 'fmt-mask', 'fmt-oil', 'fmt-powder'];

const sql = [];
for (const name of STALE) {
  const src = `${D}/${name}.webp`, dst = `${D}/${name}-v2.webp`;
  if (!existsSync(src)) { console.log(`  ★ 缺 ${name}.webp`); continue; }
  copyFileSync(src, dst);   // 留旧名文件避免历史引用 404,新引用一律走 -v2
  sql.push(`UPDATE media SET url=${lit(`/media/shots/${name}-v2.webp`)}, bytes=${statSync(dst).size}
             WHERE url=${lit(`/media/shots/${name}.webp`)};`);
  console.log(`  ${name}.webp → ${name}-v2.webp`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/bust.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/bust.sql', { file: true });
console.log('media.url 已指向 -v2,浏览器与边缘缓存全部失效');
