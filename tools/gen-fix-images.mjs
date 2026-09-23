/**
 * 修两处「货不对板」+ 一处排版错误。创始人截图点名的三件事:
 *
 * ① 剂型图(/media/10–17)是早期从 CC0 池误抓的:
 *    「护肤」是一张 1900 年代的丰胸膏老广告、「口腔护理」是带透明格子的抠图、
 *    「洁护」是水龙头。这批整体重生成 —— 统一影棚风、无品牌白包装,
 *    然后**原地更新 media 10–17 的 url**:全站几十处引用(剂型网格、产品封面、
 *    品类网格)一行不用改就全部换新。
 *
 * ② 古方六步的配图是人参根 / 玫瑰田 / 茶园来回重复 —— 和「千金面膏方(青木香/白芷/茯苓)」
 *    这些方名完全对不上。按**剂型形态**重新生成:面膏是青瓷罐里的膏、
 *    澡豆是麻袋里的粉丸 —— 不假装是那味药材的照片,但画面和方子是一类东西。
 *
 * ③ 「开头直答」被我排到了店招前面,首页开门就是一大段 FAQ 文字。
 *    没有网站长这样。挪到询盘收口之前 —— FAQ 在真实网站上就住在那 —— 而
 *    FAQPage 结构化数据在页面哪个位置都一样生效,GEO 不受影响。
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
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1536x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()).data?.[0];
  const buf = d?.b64_json ? Buffer.from(d.b64_json, 'base64')
    : Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
  await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dst);
  return statSync(dst).size;
}

/* ── ① 剂型图:统一影棚风,原地替换 media 10–17 ─────────────── */
const FMT_STYLE = 'clean studio product photography, unbranded minimal white packaging, '
  + 'soft neutral warm-grey background, gentle shadow, no text, no logo, no hands, realistic, 3:2';
const FORMATS = [
  { id: 10, file: 'fmt-cream', zh: '面霜:广口罐装膏霜,开盖带膏体质地',
    p: `An open frosted-glass cosmetic cream jar with a smooth white cream texture swirl, lid beside it, ${FMT_STYLE}` },
  { id: 11, file: 'fmt-cleanser', zh: '洁面:泵头瓶与绵密泡沫',
    p: `A white foam pump bottle with a dollop of dense white cleansing foam beside it on the surface, ${FMT_STYLE}` },
  { id: 12, file: 'fmt-oral', zh: '口腔护理:牙膏管与膏体',
    p: `A matte white toothpaste tube lying flat with a neat stripe of white paste on a toothbrush next to it, ${FMT_STYLE}` },
  { id: 13, file: 'fmt-powder', zh: '粉体彩妆:压粉饼与散粉',
    p: `An open pressed powder compact with mirror and a small jar of loose powder with puff, neutral beige tones, ${FMT_STYLE}` },
  { id: 14, file: 'fmt-oil', zh: '护肤油:玻璃滴管瓶与油滴',
    p: `An amber glass dropper bottle with golden facial oil, one drop falling from the pipette, ${FMT_STYLE}` },
  { id: 15, file: 'fmt-lip', zh: '唇部:润唇膏管',
    p: `Three minimal white lip balm tubes, one uncapped showing the balm bullet, arranged diagonally, ${FMT_STYLE}` },
  { id: 16, file: 'fmt-serum', zh: '精华:滴管瓶精华液',
    p: `A clear glass serum bottle with dropper cap, transparent liquid catching soft light, water droplets on surface, ${FMT_STYLE}` },
  { id: 17, file: 'fmt-mask', zh: '面膜:片状面膜与包装袋',
    p: `A folded white sheet face mask draped over a stand beside its matte sachet packaging, ${FMT_STYLE}` },
];

/* ── ② 古方图:按剂型形态生成,和方子是一类东西 ────────────── */
const HER_STYLE = 'overhead still life, traditional Chinese apothecary aesthetic, aged rice paper '
  + 'and dark wood background, soft window daylight, muted earthy palette, no text, no people, realistic, 3:2';
const HERITAGE = [
  { file: 'her-mianyao', zh: '古方·面膏:青瓷小罐盛面膏,配干制白芷与茯苓片',
    p: `A small celadon ceramic pot of pale herbal face balm, dried white angelica root slices and poria pieces on rice paper beside it, ${HER_STYLE}` },
  { file: 'her-mianzhi', zh: '古方·面脂:白瓷盒膏脂,配白术与树皮药材',
    p: `A white porcelain box with soft ivory ointment, dried atractylodes rhizome and a curl of magnolia bark beside it, ${HER_STYLE}` },
  { file: 'her-zaodou-1', zh: '古方·澡豆:麻布袋与草本洁面粉',
    p: `A small linen pouch spilling fine pale herbal cleansing powder onto paper, dried roots arranged around, ${HER_STYLE}` },
  { file: 'her-zaodou-2', zh: '古方·澡豆:花瓣配伍的粉丸',
    p: `Round pale herbal powder balls on a bamboo tray with scattered dried peach blossom and lotus petals, ${HER_STYLE}` },
  { file: 'her-gaofang', zh: '古方·膏方:深釉陶罐药膏,配丁香',
    p: `A dark glazed ceramic jar of herbal ointment with a wooden spatula, dried clove buds scattered nearby, ${HER_STYLE}` },
  { file: 'her-runfu', zh: '古方·润肤:油润膏体,配桃仁与瓜蒌子',
    p: `A shallow ceramic dish of creamy balm with peach kernels and dried gourd seeds beside it on rice paper, ${HER_STYLE}` },
];

console.log('【① 重生成剂型图,原地替换 media 10–17】');
const sql = [];
for (const f of FORMATS) {
  const dst = `${OUT_DIR}/${f.file}.webp`;
  try {
    const bytes = existsSync(dst) ? statSync(dst).size : await gen(f.p, dst);
    sql.push(`UPDATE media SET url=${lit('/media/shots/' + f.file + '.webp')}, mime='image/webp',
              bytes=${bytes}, alt_zh=${lit(f.zh)}, creator='AI 生成 · agnes-image-2.1-flash' WHERE id=${f.id};`);
    console.log(`  ✓ /media/${f.id} → ${f.file}.webp ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${f.file} ${String(e.message).slice(0, 60)}`); }
}

console.log('\n【② 生成古方图并换进两条流程带】');
const herIds = [];
for (const h of HERITAGE) {
  const dst = `${OUT_DIR}/${h.file}.webp`;
  try {
    const bytes = existsSync(dst) ? statSync(dst).size : await gen(h.p, dst);
    sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
      VALUES (${lit('static/shots/' + h.file + '.webp')},${lit(h.file + '.webp')},'image/webp',${bytes},
              '古方研究',${lit(h.zh)},'url',${lit('/media/shots/' + h.file + '.webp')},'AI 生成 · agnes-image-2.1-flash')
      ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes;`);
    console.log(`  ✓ ${h.file}.webp ${(bytes / 1024).toFixed(0)}KB`);
  } catch (e) { console.log(`  ★ ${h.file} ${String(e.message).slice(0, 60)}`); }
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/img1.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/img1.sql', { file: true });

const herMedia = d1(`SELECT id, filename FROM media WHERE folder='古方研究' ORDER BY id`);
herMedia.forEach((m) => herIds.push('/media/' + m.id));
console.log('  古方图 media id:', herIds.join(' '));

/* 两条《外台秘要》流程带,按 zh-cn 的步骤下标给每个语种换图 ——
   各语种的步骤名是译文,但顺序一致,按下标替换才不会张冠李戴。 */
const ribbons = d1(`SELECT DISTINCT b.id FROM blocks b
                      JOIN block_i18n z ON z.block_id=b.id AND z.lang='zh-cn'
                     WHERE b.type='procribbon' AND b.is_visible=1 AND z.data_json LIKE '%外台秘要%'`);
const sql2 = [];
for (const rb of ribbons) {
  const langs = d1(`SELECT lang, data_json FROM block_i18n WHERE block_id=${rb.id}`);
  for (const row of langs) {
    let data; try { data = JSON.parse(row.data_json); } catch { continue; }
    if (!Array.isArray(data.steps)) continue;
    data.steps.forEach((s, i) => { if (herIds[i]) s.image = herIds[i]; });
    sql2.push(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))} WHERE block_id=${rb.id} AND lang=${lit(row.lang)};`);
  }
  console.log(`  流程带 #${rb.id}:全语种步骤图已按下标替换`);
}

/* ── ③ 开头直答挪到询盘收口之前 ────────────────────────────── */
console.log('\n【③ FAQ 挪到询盘之前】');
const answers = d1(`SELECT b.id, b.page_id FROM blocks b WHERE b.type='answer' AND b.is_visible=1`);
for (const a of answers) {
  const inq = d1(`SELECT sort_order FROM blocks WHERE page_id=${a.page_id} AND type='inquiry' AND is_visible=1 ORDER BY sort_order LIMIT 1`)[0];
  const mx = d1(`SELECT MAX(sort_order) m FROM blocks WHERE page_id=${a.page_id} AND is_visible=1`)[0];
  const target = inq ? inq.sort_order - 1 : (mx.m ?? 0) + 10;
  sql2.push(`UPDATE blocks SET sort_order=${target} WHERE id=${a.id};`);
  console.log(`  answer #${a.id} → sort ${target}(询盘之前)`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/img2.sql', sql2.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/img2.sql', { file: true });
console.log('\n完成。记得 build + deploy —— 上一批 12 张图 404 就是生成后忘了部署静态资源。');
