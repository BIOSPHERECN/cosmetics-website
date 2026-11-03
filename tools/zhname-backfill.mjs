/**
 * zh-cn 名称回译(2026-10-23)—— 库里 197 条产品的 zh-cn 行是英文名。
 * 复用 translate.ts 的 translateBatch + buildFleet(与 translate-backfill.mjs 同一套逻辑),
 * 输出 JSON 映射 { pid: 中文名 } 到 tools/_zhname-map.json,由 python 写回 D1。
 * 跑法: node tools/zhname-backfill.mjs
 */
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { translateBatch, translationFleet } from '../apps/web/src/lib/translate.ts';

const log = (m) => { try { writeSync(1, m + '\n'); } catch {} };
const DB = 'bohui-cms-v2';
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function wrangler(args) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', ...args],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.includes('"fetch failed"')) throw new Error('wrangler fetch failed');
      return out;
    } catch (e) { lastErr = e; execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${(i + 1) * 4000})`]); }
  }
  throw lastErr;
}

function qrows(sql) {
  const out = wrangler(['--command', sql.replace(/[\s　]+/g, ' ').trim()]);
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[j.length - 1].results ?? [];
}

/* 舰队真源是 D1 providers 表(与 translate-backfill 一致);.env 只当兜底 */
let fleet = (() => {
  const rows = qrows(`SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free
                      FROM providers WHERE enabled=1 ORDER BY tier,id`);
  const list = rows.map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
    image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
    visionModel: r.vision_model || r.model, free: !!r.is_free,
  })).filter((p) => p.keys.length > 0);
  return list.length ? translationFleet(list) : translationFleet(buildFleet(process.env));
})();
if (!fleet.length) { console.error('没有可用的模型 key'); process.exit(1); }
log(`翻译舰队: ${fleet.map((f) => f.id).join(' → ')}`);

const rows = qrows(
  `SELECT p.id AS pid, p.slug, i.name FROM products p JOIN product_i18n i ON i.product_id=p.id AND i.lang='zh-cn'
   WHERE p.site_id='biosphere-ai' AND p.status='published' AND p.is_showcase=1`);
const CJK = /[\u4e00-\u9fff]/;
const todo = rows.filter((r) => !CJK.test(r.name || ''));
log(`zh-cn 英文名行数: ${todo.length}`);

const map = {};
const CH = 32;
for (let i = 0; i < todo.length; i += CH) {
  const chunk = todo.slice(i, i + CH);
  const texts = chunk.map((r) => r.name);
  try {
    const res = await translateBatch(process.env, fleet, texts, 'zh-cn', '化妆品代工产品名称(简短标题,含剂型/卖点/容量)');
    for (let k = 0; k < texts.length; k++) {
      const t = (res[String(k)] || '').trim();
      // 翻译失败(返回原文/注水)的不要,留原文下次再修
      if (t && CJK.test(t) && t.length <= texts[k].length * 12) map[String(chunk[k].pid)] = t;
    }
  } catch (e) { log(`chunk ${i} 失败: ${e.message}`); }
  log(`chunk ${i}-${Math.min(i + CH, todo.length)} 完成, 累计 ${Object.keys(map).length}`);
}
writeFileSync('tools/_zhname-map.json', JSON.stringify(map, null, 1));
log(`写入 tools/_zhname-map.json: ${Object.keys(map).length} 条`);
// 抽样
let n = 0;
for (const [pid, t] of Object.entries(map)) {
  if (n++ < 8) log(`  例: ${t}`);
}