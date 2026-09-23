/**
 * 把已在站上的 PNG/JPG 静态图转成 webp,并把 media 表指过去。
 * factory/ 一个目录 40MB,首页一屏就要拉十几张 —— 这不是"可以优化",是首屏根本打不开。
 * 转完保留原图不删:万一 webp 哪张出问题,把 url 改回去就行,不用重新生成。
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from '../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs';
import { d1 } from './d1.mjs';

const ROOT = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [];
let before = 0, after = 0, n = 0;

for (const folder of ['factory', 'shots', 'medierba', 'demo']) {
  const dir = join(ROOT, folder);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => /\.(png|jpe?g)$/i.test(x))) {
    const src = join(dir, f);
    const web = f.replace(/\.[^.]+$/, '.webp');
    const dst = join(dir, web);
    before += statSync(src).size;
    // 网站上最宽的用法是通栏 1600;再大的像素在任何断点都用不上
    await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dst);
    after += statSync(dst).size;
    n++;
    sql.push(`UPDATE media SET url=${lit(`/media/${folder}/${web}`)}, mime='image/webp', bytes=${statSync(dst).size}
               WHERE url=${lit(`/media/${folder}/${f}`)};`);
  }
}
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/shrink.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
if (sql.length) d1(OUT, { file: true });
const mb = (x) => (x / 1048576).toFixed(1) + 'MB';
console.log(`转了 ${n} 张:${mb(before)} → ${mb(after)}(省 ${Math.round((1 - after / before) * 100)}%)`);
console.log(`media 表更新 ${sql.length} 条`);
