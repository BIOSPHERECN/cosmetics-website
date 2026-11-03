/**
 * 修「版块里写死的静态图路径指向不存在的文件」。
 *
 * 起因是我自己造的回退:之前把站上的图批量转成 webp,
 * 原图移出了 public/,`media` 表的 url 也跟着改了 ——
 * 但 medierba 的版块里是**硬编码的 `/media/medierba/xxx.jpg`**,
 * 不走 `/media/{id}` 那条路,于是一个都没跟着改。
 * 结果:26 张图 404,而 media 表看起来完全正常,终检也查不出来
 * (终检只验「页面上出现的图能不能打开」,而这些图确实出现了、确实打不开 ——
 *  之前没查 medierba,所以一直没暴露)。
 *
 * 两件事:
 *   ① 把 .jpg/.png/.jpeg 的引用改成同名 .webp(前提是 webp 确实存在)
 *   ② 剩下仍然指向不存在文件的,列出来 —— 那类要人工决定换成哪张
 */
import { existsSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const PUB = 'F:/0cosmetic/cosmetic-sites/apps/web/public';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const APPLY = process.argv.includes('--apply');

const rows = d1(`SELECT i.block_id, i.lang, i.data_json, b.type, p.site_id, p.slug
                   FROM block_i18n i
                   JOIN blocks b ON b.id = i.block_id
                   JOIN pages  p ON p.id = b.page_id
                  WHERE b.is_visible = 1`);

/* 只看写死的静态路径。/media/123 这种走的是 media 表,由别的机制保证 */
const STATIC = /\/media\/[a-z0-9_-]+\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp|svg)/gi;

const missing = new Map();   // 路径 → 引用次数
const fixable = new Map();   // 坏路径 → 可用的 webp 路径

for (const r of rows) {
  for (const m of String(r.data_json).matchAll(STATIC)) {
    const p = m[0];
    if (existsSync(PUB + p)) continue;
    missing.set(p, (missing.get(p) ?? 0) + 1);
    const webp = p.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    if (webp !== p && existsSync(PUB + webp)) fixable.set(p, webp);
  }
}

console.log(`\n写死的静态图路径中指向不存在文件的:${missing.size} 个(共被引用 ${[...missing.values()].reduce((a, b) => a + b, 0)} 次)`);
if (!missing.size) { console.log('  没有问题。'); process.exit(0); }

console.log(`  其中改成同名 .webp 就能修好的:${fixable.size} 个`);
const hopeless = [...missing.keys()].filter((p) => !fixable.has(p));
if (hopeless.length) {
  console.log(`  ★ 改后缀也修不好的 ${hopeless.length} 个(文件根本不存在,要人工换图):`);
  hopeless.slice(0, 10).forEach((p) => console.log(`     ${p} ×${missing.get(p)}`));
}

if (!APPLY) { console.log('\n(只是检查。加 --apply 才会改数据)'); process.exit(hopeless.length ? 1 : 0); }

const sql = [];
let touched = 0, swapped = 0;
for (const r of rows) {
  let s = r.data_json, changed = false;
  for (const [bad, good] of fixable) {
    if (s.includes(bad)) {
      s = s.split(bad).join(good);
      changed = true;
      swapped++;
    }
  }
  if (changed) { sql.push(`UPDATE block_i18n SET data_json=${lit(s)} WHERE block_id=${r.block_id} AND lang=${lit(r.lang)};`); touched++; }
}
if (sql.length) {
  const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/deadstatic.sql';
  writeFileSync(OUT, sql.join('\n'), 'utf8');
  d1(OUT, { file: true });
}
console.log(`\n改了 ${touched} 条译文,${swapped} 处引用改成 .webp`);
if (hopeless.length) console.log(`★ 仍有 ${hopeless.length} 个路径没有对应文件,需要人工换图`);
