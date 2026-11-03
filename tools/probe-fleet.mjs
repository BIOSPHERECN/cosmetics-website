/**
 * 舰队体检 —— 与 translate-backfill 同一装载路径(D1 为准,.env 兜底),
 * 只报状态不回显任何 key。用于判断「翻译翻不动」到底是哪家在挡路。
 * 跑法:node tools/probe-fleet.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFleet, health } from '../apps/web/src/lib/fleet.ts';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

/* 单行 SQL;直接跑 wrangler 的 JS 入口(与 translate-backfill 同一手法)——
   Node 25 禁止 shell:false 下 spawn .cmd(EINVAL),开 shell 又得给 SQL 转义。 */
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SQL = `SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free,dialect FROM providers WHERE enabled=1 ORDER BY tier,id`;
const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', '--command', SQL],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const j = JSON.parse(out.slice(out.indexOf('[')));
const rows = j[j.length - 1].results ?? [];

const fleet = rows.map((r) => ({
  id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
  keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
  image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
  visionModel: r.vision_model || r.model, free: !!r.is_free, dialect: r.dialect,
})).filter((p) => p.keys.length > 0);

console.log(`库里 enabled 且带 key 的车道:${fleet.length} 家(另有 buildFleet(env) 兜底 ${buildFleet(process.env).length} 家)`);
const h = await health(process.env, fleet);
for (const x of h) console.log(`  ${x.ok ? 'OK ' : '×  '}tier=${String(x.tier).padStart(2)} ${x.id.padEnd(20)} keys=${x.keys} free=${x.free} ${String(x.ms).padStart(6)}ms  ${x.note}`);
const bad = h.filter((x) => !x.ok).length;
console.log(`\n可用 ${h.length - bad} / ${h.length}`);
