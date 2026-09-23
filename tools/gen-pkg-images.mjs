/**
 * 产品/剂型图全面换代:光瓶 → 带印刷包装设计的成品图。
 *
 * 创始人指令:「要有印刷的AI生成的包装设计才可以」。
 * 之前一批刻意做成 unbranded 白包装,现在明确不合格 —— 采购看目录,
 * 看的就是「你们能把包装做出什么水平」,光瓶传递不了这个。
 *
 * 两组动作:
 * ① 10 个产品 SKU:各自生成**专属**包装图(新 media 行 + 回写 cover_media)。
 *    原来 10 个产品共用 5 张剂型图 —— 两支精华同一张滴管瓶,
 *    创始人截图里的「重复感」就是这么来的。产品必须一品一图。
 * ② 8 张剂型图(media 10–17):原地升级为印刷包装版。
 *    新文件名 fmt-*-pkg(缓存铁律:内容变=文件名变),id 不动,
 *    剂型网格的引用自动跟上。
 *
 * 图面统一 1:1 1024²(创始人的「标准 1:1,后面好管理」)。
 * 品牌字用短词 BIOSPHERE —— 生成模型对短大写词的排版最稳,长句必翻车。
 */
import { writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const OUT_DIR = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';
mkdirSync(OUT_DIR, { recursive: true });

const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

async function gen(prompt, dst) {
  const r = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()).data?.[0];
  const buf = d?.b64_json ? Buffer.from(d.b64_json, 'base64')
    : Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
  await sharp(buf).resize(1024, 1024, { fit: 'cover' }).webp({ quality: 82 }).toFile(dst);
  return statSync(dst).size;
}

/* 统一风格底座:印刷包装 + 影棚 + 1:1。
   「fully printed label design」是这次的核心诉求,放最前面加权。 */
const STYLE = 'premium cosmetic product photography, the packaging has a fully printed label design '
  + 'with elegant minimal typography and the brand wordmark "BIOSPHERE" in small clean capitals, '
  + 'refined botanical line-art motif on the label, soft studio lighting, warm ivory seamless background, '
  + 'gentle natural shadow, centered composition, photorealistic, no hands, no people, square format';

/* ── ① 产品 SKU:一品一图 ─────────────────────────────────── */
const PRODUCTS = [
  { slug: 'murumuru-hair-mask', file: 'pkg-murumuru-hair-mask', zh: '木鲁星果脂发膜 · AI 包装概念图',
    p: `A wide amber glass hair mask jar with cream-colored printed lid and warm caramel label, a small murumuru butter swirl on a wooden dish beside it, ${STYLE}` },
  { slug: 'sage-acne-serum', file: 'pkg-sage-acne-serum', zh: '鼠尾草清痘精华 · AI 包装概念图',
    p: `A frosted glass serum dropper bottle with a sage-green printed label, fresh sage leaves arranged at its base, ${STYLE}` },
  { slug: 'herbal-anti-itch-sun', file: 'pkg-herbal-anti-itch-sun', zh: '草本止痒防晒 · AI 包装概念图',
    p: `A slim white sunscreen tube standing upright with a printed pale-blue and white label with subtle sun motif, ${STYLE}` },
  { slug: 'herbal-mouthwash', file: 'pkg-herbal-mouthwash', zh: '草本抑菌漱口水 · AI 包装概念图',
    p: `A clear mouthwash bottle with pale green liquid and a printed mint-green label, a sprig of fresh herbs beside it, ${STYLE}` },
  { slug: 'dual-source-essence', file: 'pkg-dual-source-essence', zh: '双源草本精华水 · AI 包装概念图',
    p: `A tall slender glass essence bottle with a printed two-tone ivory and jade label, soft water ripple at the base, ${STYLE}` },
  { slug: 'solid-tooth-tablet', file: 'pkg-solid-tooth-tablet', zh: '便携固体洁牙片 · AI 包装概念图',
    p: `A small aluminium travel tin with printed white-and-teal lid design, white tooth tablets spilling neatly beside it, ${STYLE}` },
  { slug: 'cooling-after-sun-spray', file: 'pkg-cooling-after-sun-spray', zh: '冰感止痒修护防晒喷雾 · AI 包装概念图',
    p: `A white fine-mist spray bottle with printed ice-blue gradient label, faint cool mist in the air beside it, ${STYLE}` },
  { slug: 'post-hair-removal-spray', file: 'pkg-post-hair-removal-spray', zh: '止痒冰感脱毛后护理喷雾 · AI 包装概念图',
    p: `A matte lavender-white spray bottle with a printed soothing lavender label, a single lavender stem beside it, ${STYLE}` },
  { slug: 'brightening-body-lotion', file: 'pkg-brightening-body-lotion', zh: '身体美白留香身体乳 · AI 包装概念图',
    p: `A pearl-white pump lotion bottle with printed champagne-gold label accents, a silk ribbon loosely at the base, ${STYLE}` },
  { slug: 'nine-herb-jelly-mask', file: 'pkg-nine-herb-jelly-mask', zh: '九大仙草东方草本修护冻膜 · AI 包装概念图',
    p: `A wide frosted jar of translucent amber jelly mask with printed deep-green and gold oriental label, dried ginseng and goji berries arranged beside it, ${STYLE}` },
];

/* ── ② 剂型图升级:原地换印刷包装版(id 不动,文件名换) ────── */
const FORMATS = [
  { id: 10, file: 'fmt-cream-pkg', zh: '面霜:印刷包装膏霜罐',
    p: `An open cosmetic cream jar with printed ivory label and patterned lid beside it, smooth cream swirl inside, ${STYLE}` },
  { id: 11, file: 'fmt-cleanser-pkg', zh: '洁面:印刷包装泵头瓶与泡沫',
    p: `A foam cleanser pump bottle with printed soft-grey label, a dollop of dense white foam beside it, ${STYLE}` },
  { id: 12, file: 'fmt-oral-pkg', zh: '口腔护理:印刷包装牙膏管',
    p: `A toothpaste tube with printed white-and-teal label lying flat, a neat stripe of paste on a brush next to it, ${STYLE}` },
  { id: 13, file: 'fmt-powder-pkg', zh: '粉体彩妆:印刷包装粉饼与散粉',
    p: `An open pressed powder compact with printed patterned lid and a loose powder jar with puff, neutral beige tones, ${STYLE}` },
  { id: 14, file: 'fmt-oil-pkg', zh: '护肤油:印刷包装滴管瓶',
    p: `An amber glass dropper bottle of golden facial oil with printed botanical label, one drop falling from the pipette, ${STYLE}` },
  { id: 15, file: 'fmt-lip-pkg', zh: '唇部:印刷包装润唇膏',
    p: `Three lip balm tubes with printed pastel labels, one uncapped showing the balm bullet, arranged diagonally, ${STYLE}` },
  { id: 16, file: 'fmt-serum-pkg', zh: '精华:印刷包装滴管精华瓶',
    p: `A clear glass serum bottle with dropper cap and printed minimal label, transparent liquid catching soft light, ${STYLE}` },
  { id: 17, file: 'fmt-mask-pkg', zh: '面膜:印刷包装面膜袋',
    p: `A folded sheet face mask draped over a stand beside its printed matte sachet with elegant label design, ${STYLE}` },
];

const sql = [];

console.log('【① 产品一品一图】');
for (const x of PRODUCTS) {
  const dst = `${OUT_DIR}/${x.file}.webp`;
  try {
    const bytes = existsSync(dst) ? statSync(dst).size : await gen(x.p, dst);
    sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
      VALUES (${lit('static/shots/' + x.file + '.webp')},${lit(x.file + '.webp')},'image/webp',${bytes},
              '产品包装',${lit(x.zh)},'url',${lit('/media/shots/' + x.file + '.webp')},'AI 生成 · agnes-image-2.1-flash')
      ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes;`);
    sql.push(`UPDATE products SET cover_media=(SELECT id FROM media WHERE r2_key=${lit('static/shots/' + x.file + '.webp')})
       WHERE site_id='biosphere-ai' AND slug=${lit(x.slug)};`);
    console.log(`  ✓ ${x.slug} → ${x.file}.webp ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${x.slug} ${String(e.message).slice(0, 80)}`); }
}

console.log('【② 剂型图印刷包装版】');
for (const f of FORMATS) {
  const dst = `${OUT_DIR}/${f.file}.webp`;
  try {
    const bytes = existsSync(dst) ? statSync(dst).size : await gen(f.p, dst);
    sql.push(`UPDATE media SET url=${lit('/media/shots/' + f.file + '.webp')}, mime='image/webp',
              bytes=${bytes}, alt_zh=${lit(f.zh)}, creator='AI 生成 · agnes-image-2.1-flash' WHERE id=${f.id};`);
    console.log(`  ✓ /media/${f.id} → ${f.file}.webp ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${f.file} ${String(e.message).slice(0, 80)}`); }
}

writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg.sql', { file: true });
console.log('DB 已更新。记得 build + deploy(静态资源要随构建上去,上次 12 张 404 的教训)。');
