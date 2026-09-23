/**
 * 找出「存进去的译文其实是英文」的条目并重翻。
 *
 * 判据很硬:某语种的 data_json 与英文那行**逐字节相同**。
 * 这不是"翻得不好",是根本没翻 —— 而它最阴的地方在于:
 * 条数是满的、后台显示"已翻译"、审计脚本数条数也过关,
 * 只有真人打开那一页才看得出来。实测在五个站上一共 55 条。
 *
 * 少数是合理的:整块只有 "BIOSPHERE-AI"、"ISO 22716" 这类不该翻的词。
 * 所以重翻之后如果**还是**相同,就不再当作失败 —— 留一次判断,不无限重试。
 */
import { writeFileSync } from 'node:fs';
import { translateJson, translationFleet } from '../apps/web/src/lib/translate.ts';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const SITE = process.argv[2] || null;

let fleet = (() => {
  const rows = d1(`SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free
                     FROM providers WHERE enabled=1 ORDER BY tier,id`);
  const list = rows.map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
    image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
    visionModel: r.vision_model || r.model, free: !!r.is_free,
  })).filter((p) => p.keys.length > 0);
  return list.length ? list : buildFleet(process.env);
})();
fleet = translationFleet(fleet);
console.log(`翻译用 ${fleet.length} 家:${fleet.map((p) => p.id).join(' → ')}`);

const where = SITE ? `AND p.site_id = ${lit(SITE)}` : '';
const rows = d1(`
  SELECT i.block_id, i.lang, b.type, p.site_id, e.data_json AS src
    FROM block_i18n i
    JOIN blocks b ON b.id = i.block_id
    JOIN pages  p ON p.id = b.page_id
    JOIN block_i18n e ON e.block_id = i.block_id AND e.lang = 'en'
   WHERE b.is_visible = 1 ${where}
     AND i.lang NOT IN ('en','zh-cn')
     AND i.data_json = e.data_json
   ORDER BY p.site_id, i.lang`);

console.log(`\n译文与英文逐字节相同:${rows.length} 条`);
if (!rows.length) process.exit(0);

const sql = [];
let fixed = 0, stillSame = 0, failed = 0;

async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch (e) { failed++; console.log(`   × #${items[k].block_id}/${items[k].lang}:${String(e.message).slice(0, 60)}`); }
      if (++done % 10 === 0) console.log(`   …${done}/${items.length}`);
    }
  }));
}

await pool(rows, 3, async (r) => {
  const out = await translateJson(process.env, fleet, r.src, r.lang,
    `化妆品代工工厂站的「${r.type}」版块。上一次翻译原样退回了英文,这次务必译成目标语言。`);
  if (out === r.src) { stillSame++; return; }   // 整块只有品牌名/证书号之类,合理
  sql.push(`UPDATE block_i18n SET data_json=${lit(out)}, mt=1, mt_at=datetime('now')
             WHERE block_id=${r.block_id} AND lang=${lit(r.lang)};`);
  fixed++;
});

if (sql.length) {
  const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/untrans.sql';
  writeFileSync(OUT, sql.join('\n'), 'utf8');
  d1(OUT, { file: true });
}
console.log(`\n重翻成功 ${fixed} 条 · 仍与英文相同 ${stillSame} 条(多半整块只有品牌名,合理)· 失败 ${failed} 条`);
