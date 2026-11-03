/**
 * 把创始人放进来的原图转成站上能用的 webp。
 *
 * 两个尺寸,不是一个:
 *   w1600 —— 通栏大图 / 图文对开用
 *   w720  —— 网格小图用(阿里店铺里那种小方图,创始人明确说"不需要那么大的尺寸")
 * 只出一个尺寸的话,要么小图白下载 4MB,要么大图糊。
 *
 * 质量 82:webp 在 80 以上肉眼基本看不出差别,再往上只涨体积。
 */
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from '../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs';

const SRC = 'F:/0cosmetic/biosphere-ai-site/images';
const OUT = 'F:/0cosmetic/biosphere-ai-site/images/web';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f));
console.log(`原图 ${files.length} 张\n`);

let before = 0, after = 0;
for (const f of files) {
  const src = join(SRC, f);
  before += statSync(src).size;
  const base = f.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-|-$/g, '');
  const meta = await sharp(src).metadata();
  for (const w of [1600, 720]) {
    if (meta.width < w && w === 1600) continue;          // 本来就比目标小就不放大
    const dst = join(OUT, `${base}-w${w}.webp`);
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dst);
    after += statSync(dst).size;
  }
  console.log(`  ${f.padEnd(32)} ${meta.width}×${meta.height} → webp`);
}
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
console.log(`\n原图 ${mb(before)} → webp ${mb(after)}(省 ${Math.round((1 - after / before) * 100)}%)`);
