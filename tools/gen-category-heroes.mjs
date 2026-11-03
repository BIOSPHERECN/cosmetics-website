/**
 * 品类卡大片图 —— 创始人:「这图片完全没吸引力啊,现在都 AI 时代了」。
 *
 * 他说得对。上一批我按"极简影棚"生成:一只罐子居中、灰底 ——
 * 那是**剂型说明图**的做法,放在品类入口卡上就是没有食欲。
 * 品类卡是让人**想点进去**的,要的是电商 campaign 大片:
 * 质地飞溅、成分环绕、色彩有情绪 —— 美工在网上找的正是这类图,
 * 我们直接按品类精确生成,比找图对题得多。
 *
 * 文件名带 -h1 后缀:图片路径一律**只加不改** ——
 * /media/{id} 302 到静态路径且缓存 1 小时,同名换内容必然让
 * 浏览器/边缘端着旧图(创始人截图里丰胸膏广告阴魂不散就是这么来的)。
 */
import { statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { d1 } from './d1.mjs';

const D = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';
mkdirSync(D, { recursive: true });
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

const CATS = [
  ['cat-skincare-h1', '护肤品类大片:精华与面霜配草本与水纹,奶油质地飞痕',
    'luxury skincare campaign photography, glass serum bottle and open cream jar among fresh green botanical leaves, rippling water surface, elegant cream texture swoosh in foreground, soft golden backlight, rich and appetizing, high-end commercial beauty advertising, no text, 3:2'],
  ['cat-makeup-h1', '彩妆品类大片:口红眼影与色粉飞扬',
    'vibrant colour cosmetics campaign flat lay, lipstick bullets, eyeshadow palette and loose pigment powder bursting in motion, rich crimson pink and champagne gold palette, dramatic directional studio light, glossy premium advertising photography, no text, 3:2'],
  ['cat-oral-h1', '口腔护理大片:牙膏与薄荷冰水飞溅',
    'fresh oral care campaign photography, elegant white toothpaste tube and mouthwash bottle with mint leaves, splashing crystal water and ice cubes frozen mid-air, cool aqua and white palette, crisp clean commercial shot, no text, 3:2'],
  ['cat-kids-h1', '儿童护肤大片:柔和奶油色调与泡泡',
    'gentle baby skincare campaign photography, soft pastel lotion bottles beside fluffy cotton towel, floating soap bubbles catching light, warm cream and powder blue tones, cozy airy nursery light, tender commercial shot, no text, 3:2'],
  ['cat-body-h1', '身体护理大片:身体乳配丝绸与花',
    'luxury body care campaign photography, lotion pump bottle with flowing silk fabric, white orchid flowers and a swirl of body cream, warm beige and blush palette, soft window light with gentle shadows, premium spa mood, no text, 3:2'],
  ['cat-ip-h1', '国际 IP 赋能大片:多彩联名礼盒陈列',
    'playful cosmetics gift set campaign, colourful cartoon-styled packaging boxes and tubes arranged on a bright glossy display, confetti-like colour accents, cheerful festive lighting, generic characters only, no real brand logos, no text, 3:2'],
];

const sql = [];
for (const [file, alt, prompt] of CATS) {
  const dst = `${D}/${file}.webp`;
  try {
    if (!existsSync(dst)) {
      const r = await fetch(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1536x1024' }),
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dta = (await r.json()).data?.[0];
      const buf = dta?.b64_json ? Buffer.from(dta.b64_json, 'base64')
        : Buffer.from(await (await fetch(dta.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 84 }).toFile(dst);
    }
    const bytes = statSync(dst).size;
    sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
      VALUES (${lit('static/shots/' + file + '.webp')},${lit(file + '.webp')},'image/webp',${bytes},
              '品类大图',${lit(alt)},'url',${lit('/media/shots/' + file + '.webp')},'AI 生成 · agnes-image-2.1-flash')
      ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, alt_zh=excluded.alt_zh;`);
    console.log(`  ✓ ${file} ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${file} ${String(e.message).slice(0, 70)}`); }
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/cath.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/cath.sql', { file: true });
d1(`SELECT id, filename FROM media WHERE folder='品类大图' ORDER BY id`)
  .forEach((r) => console.log(`  /media/${r.id}  ${r.filename}`));
