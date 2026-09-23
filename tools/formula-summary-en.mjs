/**
 * 把配方检索摘要(ai_summary)整体改成英文。
 *
 * ai_summary 不是给客户看的文案,是**喂给模型的检索素材**。
 * 它现在长这样:
 *   SR-1001 · skincare/serum · 功效 hydrating,barrier · 主要活性物 Sodium Hyaluronate …
 *            · 肤感 水感清爽,吸收快 · 起订 3000 · 打样 25 天 · 可去市场 CN,EU,US,JP,ID
 * 字段标签和肤感描述还是中文。模型大多数时候会顺手翻掉,但总有漏网的 ——
 * 韩语版实测漏出 3 个汉字,阿拉伯语版漏过整词。
 *
 * 与其反复调提示词让它"记得翻",不如让它**没有中文可漏**:
 * 素材全英文,模型只做"英文 → 目标语"这一次转换,链路短一环,出错面少一半。
 * 中文字段原样留在库里,中文站和后台照常用。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { translateBatch } from '../apps/web/src/lib/translate.ts';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const W = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (a) => execFileSync(process.execPath, [W, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => { const o = run(['--command', sql.replace(/\s+/g, ' ').trim()]); const j = JSON.parse(o.slice(o.indexOf('['))); return j[j.length - 1].results ?? []; };
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const fleet = q(`SELECT id,label,base_url,model,api_keys,tier FROM providers WHERE enabled=1 AND length(api_keys)>0 ORDER BY tier`)
  .map((r) => ({ id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
                 keys: String(r.api_keys).split(',').map((x) => x.trim()).filter(Boolean) }));

const rows = q(`SELECT code, category, format, benefits, actives_json, texture, moq, lead_days, markets, cert_notes FROM formulas ORDER BY code`);

/* 肤感与合规备注是自由文本,得真翻;其余字段本来就是英文枚举或数字 */
const zh = [...new Set(rows.flatMap((r) => [r.texture, r.cert_notes]).filter((x) => x && /[一-鿿]/.test(x)))];
console.log(`需要译成英文的自由文本 ${zh.length} 条`);
const got = zh.length ? await translateBatch(process.env, fleet, zh, 'en', '化妆品配方的肤感描述与合规备注', 120_000) : {};
const EN = Object.fromEntries(zh.map((t, i) => [t, got[String(i)] || t]));

const stmts = rows.map((r) => {
  let actives = [];
  try { actives = JSON.parse(r.actives_json); } catch {}
  const act = actives.map((a) => `${a.inci || a.name} ${a.pct || ''}`.trim()).join(', ');
  const sum = [
    `${r.code} · ${r.category}/${r.format}`,
    r.benefits ? `benefits: ${r.benefits}` : '',
    act ? `actives: ${act}` : '',
    r.texture ? `texture: ${EN[r.texture] || r.texture}` : '',
    r.moq ? `MOQ ${r.moq}` : '',
    r.lead_days ? `sampling ${r.lead_days} days` : '',
    r.markets ? `markets: ${r.markets}` : '',
    r.cert_notes ? `notes: ${EN[r.cert_notes] || r.cert_notes}` : '',
  ].filter(Boolean).join(' · ');
  return `UPDATE formulas SET ai_summary=${lit(sum)} WHERE code=${lit(r.code)};`;
});

mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync('node_modules/.cache/sum.sql', stmts.join('\n'), 'utf8');
run(['--file', 'node_modules/.cache/sum.sql', '-y']);
console.log(`已重写 ${rows.length} 条配方摘要为全英文`);
const chk = q(`SELECT COUNT(*) n FROM formulas WHERE ai_summary GLOB '*[一-鿿]*'`);
console.log(chk[0].n ? `★ 仍有 ${chk[0].n} 条摘要含汉字` : '✓ 30 条摘要均无汉字残留');
