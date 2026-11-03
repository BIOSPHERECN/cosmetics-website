/**
 * 补产品英文行 —— 巡检实拍抓到:en 产品集页整页阿拉伯语。
 * 根因:translate-backfill 的目标语种循环不含 en(en 被当成源语言),
 * 10 款产品 15 个小语种全有、唯独没有英文 —— 出海站的主语言被漏了。
 * 本脚本用同一套翻译管线把 zh-cn → en 补齐;顺手把 360 号 formats 版块
 * en 版里残留的中文 moq 值(「柔性起订量…」)换成英文口径。
 * 运行需带代理(gemini):NODE_USE_ENV_PROXY=1 HTTPS_PROXY=…
 */
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { translateBatch, translationFleet } from '../apps/web/src/lib/translate.ts';
import { d1 } from './d1.mjs';

for (const line of readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const lit = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/pen.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

const rows = d1(`SELECT id,label,base_url,model,api_keys,tier FROM providers WHERE enabled=1 ORDER BY tier,id`);
const fleet = translationFleet(rows.map((r) => ({
  id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
  keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
})).filter((p) => p.keys.length));

const prods = d1(`SELECT p.id, p.slug, z.name, z.summary, z.description
  FROM products p JOIN product_i18n z ON z.product_id = p.id AND z.lang = 'zh-cn'
 WHERE p.site_id = 'biosphere-ai'
   AND NOT EXISTS (SELECT 1 FROM product_i18n x WHERE x.product_id = p.id AND x.lang = 'en')`);
console.log(`待补 en:${prods.length} 款`);

const sql = [];
for (const p of prods) {
  const texts = [p.name ?? '', p.summary ?? '', p.description ?? ''].map((s) => s || ' ');
  try {
    const out = await translateBatch(process.env, fleet, texts, 'en', '化妆品产品名与说明(B2B 目录)');
    sql.push(`INSERT INTO product_i18n (product_id, lang, name, summary, description, mt)
      VALUES (${p.id}, 'en', ${lit(out['0']?.trim())}, ${lit(out['1']?.trim())}, ${lit(out['2']?.trim())}, 1);`);
    console.log(`  ✓ ${p.slug} → ${out['0']}`);
  } catch (e) { console.log(`  ★ ${p.slug}: ${String(e.message ?? e).slice(0, 80)}`); }
}
if (sql.length) run(sql.join('\n'));

/* formats 版块 en 版的中文 moq 残留 */
const fen = d1(`SELECT data_json FROM block_i18n WHERE block_id = 360 AND lang = 'en'`)[0];
if (fen) {
  const data = JSON.parse(fen.data_json);
  let n = 0;
  for (const it of data.items ?? []) {
    if (it.moq && /[一-鿿]/.test(it.moq)) { it.moq = 'Flexible MOQ · negotiated by category & packaging'; n++; }
  }
  if (n) {
    run(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))} WHERE block_id=360 AND lang='en';`);
    console.log(`formats en:修正 ${n} 处中文 moq`);
  } else console.log('formats en:moq 无中文残留');
}
console.log('完成');
