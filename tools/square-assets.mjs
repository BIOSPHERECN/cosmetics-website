/**
 * 网格卡资产统一 1:1 —— 创始人定的标准:「品类这些图片用标准的 1:1,后面好管理」。
 *
 * 他点的是真痛点:此前 3:2(生成图)、4:3(补边证书)、2:1(logo 墙)混着,
 * 运营在媒体库里挑图、以后换图,每次都要先想"这张是什么比例、放哪个格子会不会裁"。
 * 统一成方图后,任何网格位随便放。
 *
 * 三类三种做法,不一刀切:
 *   品类大片   重新按 1024×1024 生成 —— 裁旧的 3:2 会把 campaign 构图毁掉
 *   证书/墙   从原件重新补白边成方图 —— cover 裁切会切掉证书边和 logo
 *   实拍照片   不动文件,CSS cover 居中裁切就够(车间照裁成方图仍然成立)
 *
 * 全部落**新文件名**(-sq 后缀)再改 media.url —— 图片路径只加不改的缓存规矩。
 */
import { statSync, existsSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const T = 'C:/Users/Administrator/AppData/Local/Temp';
const D = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');

const sql = [];
const point = (oldUrl, file, bytes) =>
  sql.push(`UPDATE media SET url=${lit('/media/shots/' + file)}, bytes=${bytes} WHERE url=${lit(oldUrl)};`);

/* ── ① 品类大片:原生 1024×1024 重生成 ─────────────────── */
const STYLE = 'square composition, centered subject, no text, no logos, realistic, 1:1';
const CATS = [
  ['cat-skincare-h1', 'cat-skincare-sq',
    `luxury skincare campaign photography, glass serum bottle and open cream jar among fresh green botanical leaves, rippling water, cream texture swoosh, soft golden backlight, high-end commercial beauty advertising, ${STYLE}`],
  ['cat-makeup-h1', 'cat-makeup-sq',
    `vibrant colour cosmetics campaign, lipstick bullets, eyeshadow palette and pigment powder burst in motion, crimson pink and champagne gold, dramatic studio light, glossy premium advertising, ${STYLE}`],
  ['cat-oral-h1', 'cat-oral-sq',
    `fresh oral care campaign, white toothpaste tube and mouthwash bottle with mint leaves, splashing water and ice frozen mid-air, cool aqua palette, crisp commercial shot, ${STYLE}`],
  ['cat-kids-h1', 'cat-kids-sq',
    `gentle baby skincare campaign, pastel lotion bottles beside fluffy cotton towel, floating soap bubbles, warm cream and powder blue, cozy nursery light, ${STYLE}`],
  ['cat-body-h1', 'cat-body-sq',
    `luxury body care campaign, lotion pump bottle with flowing silk, white orchid and a swirl of cream, warm beige and blush palette, soft window light, ${STYLE}`],
  ['cat-ip-h1', 'cat-ip-sq',
    `playful cosmetics gift set campaign, colourful cartoon-styled packaging boxes on a bright glossy display, festive lighting, generic characters only, ${STYLE}`],
];
console.log('【① 品类大片 1:1 重生成】');
for (const [oldName, file, prompt] of CATS) {
  const dst = `${D}/${file}.webp`;
  try {
    if (!existsSync(dst)) {
      const r = await fetch(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1024x1024' }),
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dta = (await r.json()).data?.[0];
      const buf = dta?.b64_json ? Buffer.from(dta.b64_json, 'base64')
        : Buffer.from(await (await fetch(dta.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      await sharp(buf).resize(1080, 1080, { fit: 'cover' }).webp({ quality: 84 }).toFile(dst);
    }
    point(`/media/shots/${oldName}.webp`, `${file}.webp`, statSync(dst).size);
    console.log(`  ✓ ${file} ${(statSync(dst).size / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${file} ${String(e.message).slice(0, 60)}`); }
}

/* ── ② 证书与墙:原件补边成方图 ───────────────────────── */
async function padSquare(src, dst, bg) {
  const m = await sharp(src).metadata();
  const side = Math.max(m.width, m.height);
  await sharp(src).extend({
    top: Math.floor((side - m.height) / 2), bottom: Math.ceil((side - m.height) / 2),
    left: Math.floor((side - m.width) / 2), right: Math.ceil((side - m.width) / 2),
    background: bg,
  }).resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 87 }).toFile(dst);
  return statSync(dst).size;
}

console.log('【② 证书 + 墙 补边成方图】');
const WHITE = { r: 250, g: 250, b: 250 };
const JOBS = [
  // [原件, 新文件, 现 media.url(要改指向的那条), 补边底色]
  [`${T}/ppt-clientwall-raw.png`, 'wall-suppliers-sq', '/media/shots/wall-suppliers-43.webp', { r: 255, g: 255, b: 255 }],
  [`${T}/ppt15-x157.png`, 'wall-clients-sq', '/media/shots/wall-clients-43.webp', { r: 255, g: 255, b: 255 }],
  [`${T}/ppt-ipstrip.png`, 'wall-ip-sq', '/media/shots/wall-ip-43.webp', { r: 232, g: 228, b: 244 }],
  [`${T}/cert-x132.png`, 'cert-gmpc-sq', '/media/shots/cert-gmpc.webp', WHITE],
  [`${T}/cert-x134.png`, 'cert-iso-sq', '/media/shots/cert-iso.webp', WHITE],
  [`${T}/cert-x136.png`, 'cert-patent-sq', '/media/shots/cert-patent.webp', WHITE],
  [`${T}/cert-x142.png`, 'cert-halal-sq', '/media/shots/cert-halal.webp', WHITE],
  [`${T}/cert-x140.png`, 'cert-cpnp-sq', '/media/shots/cert-cpnp.webp', WHITE],
  [`${T}/cert-x141.png`, 'cert-fda-sq', '/media/shots/cert-fda.webp', WHITE],
  [`${T}/cert-x138.png`, 'cert-halal-ahf-sq', '/media/shots/cert-halal-ahf.webp', WHITE],
  [`${T}/cert-x150.png`, 'cert-ccpit-sq', '/media/shots/cert-ccpit.webp', WHITE],
  [`${T}/cert-x144.png`, 'cert-license-sq', '/media/shots/cert-license.webp', WHITE],
  [`${T}/cert-x146.png`, 'honor-emba-sq', '/media/shots/honor-emba.webp', WHITE],
  [`${T}/cert-x148.png`, 'honor-award-sq', '/media/shots/honor-award.webp', WHITE],
];
for (const [src, file, oldUrl, bg] of JOBS) {
  try {
    if (!existsSync(src)) throw new Error('原件不在,需从 PDF 重抽');
    const bytes = await padSquare(src, `${D}/${file}.webp`, bg);
    point(oldUrl, `${file}.webp`, bytes);
    console.log(`  ✓ ${file} ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${file} ${String(e.message).slice(0, 50)}`); }
}

writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/sq.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/sq.sql', { file: true });
console.log(`\nmedia.url 改指方图:${sql.length} 条(media id 不变,全站引用自动跟随)`);
