/**
 * 补两张剂型专属图:水乳(lotion)、身体护理(body)。
 * 第一批里它们还在借 /media/16(精华滴管瓶)和 /media/14(护肤油滴管瓶)——
 * 和创始人点名的「产品共用图」是同一种病,剂型卡也一并一卡一图。
 * 新 media 行 + 全语种 formats 版块按 item.id 换引用(id 是机器名,不受译文影响)。
 */
import { writeFileSync, statSync, existsSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const OUT_DIR = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';

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

const STYLE = 'premium cosmetic product photography, the packaging has a fully printed label design '
  + 'with elegant minimal typography and the brand wordmark "BIOSPHERE" in small clean capitals, '
  + 'refined botanical line-art motif on the label, soft studio lighting, warm ivory seamless background, '
  + 'gentle natural shadow, centered composition, photorealistic, no hands, no people, square format';

const EXTRA = [
  { itemId: 'lotion', file: 'fmt-lotion-pkg', zh: '水乳:印刷包装爽肤水与乳液',
    p: `A pair of matching skincare bottles, a tall toner bottle and a pump lotion bottle, both with printed ivory-and-blush labels, standing together, ${STYLE}` },
  { itemId: 'body', file: 'fmt-body-pkg', zh: '身体护理:印刷包装身体乳泵瓶',
    p: `A large body lotion pump bottle with printed warm-beige label, a folded cotton towel and a sprig of dried grass beside it, ${STYLE}` },
];

const sql = [];
for (const x of EXTRA) {
  const dst = `${OUT_DIR}/${x.file}.webp`;
  const bytes = existsSync(dst) ? statSync(dst).size : await gen(x.p, dst);
  sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
    VALUES (${lit('static/shots/' + x.file + '.webp')},${lit(x.file + '.webp')},'image/webp',${bytes},
            '产品包装',${lit(x.zh)},'url',${lit('/media/shots/' + x.file + '.webp')},'AI 生成 · agnes-image-2.1-flash')
    ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes;`);
  console.log(`  ✓ ${x.file}.webp ${(bytes / 1024).toFixed(0)}KB`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg2.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg2.sql', { file: true });

/* 拿到新 id,把 formats 版块所有语种里 lotion/body 两项的 image 换掉。
   按 item.id 匹配而不是下标 —— 译文语种的 items 顺序理论上一致,
   但 id 是机器名,永远不会被翻译管线动到,最稳。 */
const idOf = {};
for (const x of EXTRA) {
  idOf[x.itemId] = d1(`SELECT id FROM media WHERE r2_key=${lit('static/shots/' + x.file + '.webp')}`)[0].id;
}
console.log('  新 media id:', JSON.stringify(idOf));

const rows = d1(`SELECT i.block_id, i.lang, i.data_json FROM block_i18n i
                  JOIN blocks b ON b.id=i.block_id
                  JOIN pages g ON g.id=b.page_id
                 WHERE g.site_id='biosphere-ai' AND b.type='formats' AND b.is_visible=1`);
const sql2 = [];
for (const r of rows) {
  let data; try { data = JSON.parse(r.data_json); } catch { continue; }
  let n = 0;
  for (const it of data.items ?? []) {
    if (idOf[it.id]) { it.image = '/media/' + idOf[it.id]; n++; }
  }
  if (n) sql2.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))} WHERE block_id=${r.block_id} AND lang=${lit(r.lang)};`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg3.sql', sql2.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/pkg3.sql', { file: true });
console.log(`  formats 版块引用已换:${sql2.length} 行(全语种)`);
