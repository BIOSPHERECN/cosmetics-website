/** 顽固缺译块解剖:拿 343(storehero,12 语全缺)手动翻一个语种,看真实死因。 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { translateJson, translationFleet } from '../apps/web/src/lib/translate.ts';
import { d1 } from './d1.mjs';

for (const line of readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const row = d1(`SELECT data_json, lang FROM block_i18n WHERE block_id=343 ORDER BY CASE lang WHEN 'zh-cn' THEN 0 WHEN 'en' THEN 1 ELSE 2 END LIMIT 1`)[0];
console.log('源语种:', row.lang, '长度:', row.data_json.length);
console.log('内容:', row.data_json.slice(0, 400));

const rows = d1(`SELECT id,label,base_url,model,api_keys,tier,is_free FROM providers WHERE enabled=1 ORDER BY tier,id`);
const list = rows.map((r) => ({
  id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
  keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean), free: !!r.is_free,
})).filter((p) => p.keys.length > 0);
const fleet = translationFleet(list);
console.log('舰队:', fleet.map((p) => p.id).join(' → '));

try {
  const out = await translateJson(process.env, fleet, row.data_json, 'kr', '公司门户店招版块');
  console.log('✔ ja 翻译成功:', JSON.stringify(out).slice(0, 200));
} catch (e) {
  console.log('★ 失败:', e instanceof Error ? e.message : e);
}
