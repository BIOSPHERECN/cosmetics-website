// 点选码接口端到端(2026-09-24):在 Node 里直接跑 pages/api/cap/new.ts 与 pass.ts —— 假 KV、真 SQLite 当 D1、假 Cache API,不连任何站点。
// node tools/cap-api-e2e.mjs <仓库根目录>;tools/cap-parity.mjs 会对两站各跑一遍。退出码只给真失败。
// 覆盖:出题图与 KV 一致、第二次出题 0 次 KV 读 0 次 D1、答对发 __Host-cap 且 verifyPass 认、答对只写 1 行 D1、重交 403、
//       同一 IP 段一小时错满 6 次交卷与出题都 429、冷却中交卷不碰 D1、别段不受影响、令牌绑 IP 段、别段来交不消耗令牌、坏令牌 403、超长 413、坏 JSON 400、没配密钥 503、AE 三种事件。
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = globalThis.__env;', shortCircuit: true };
    if (spec.startsWith('.') && !/\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const R = process.argv[2];
const lib = await import(`file:///${R}/apps/web/src/lib/captcha.ts`);
const SECRET = 'e2e-secret-not-real', W = 'E2E', T = [[100, 80, 36], [250, 120, 36], [400, 60, 36]];
const img = crypto.getRandomValues(new Uint8Array(3000));
const a = await lib.sealAnswer(SECRET, W, T);
const kvData = new Map([['cap:cur', JSON.stringify({ w: W, n: 1, iw: 480, ih: 318, hy: 270, hw: 180, c: 3 })]]);
let kvReads = 0;
const KV = {
  async get(k, o) { kvReads++; const v = kvData.get(k); return v == null ? null : (o?.type === 'json' ? JSON.parse(v) : v); },
  async getWithMetadata(k) { kvReads++; return k === `cap:${W}:0` ? { value: img.buffer.slice(0), metadata: { a } } : { value: null, metadata: null }; },
};
const sq = new DatabaseSync(':memory:');
const mig = readdirSync(`${R}/db/migrations`).find((f) => f.endsWith('_cap_seen.sql'));
sq.exec(readFileSync(`${R}/db/migrations/${mig}`, 'utf8'));
let d1Stmts = 0;
const DB = { prepare(sql) { return { bind(...x) { this.x = x; return this; }, async first() { d1Stmts++; return sq.prepare(sql).get(...this.x); }, async run() { d1Stmts++; return sq.prepare(sql).run(...this.x); } }; } };
const store = new Map();
globalThis.caches = { default: { async match(k) { const r = store.get(String(k)); return r ? r.clone() : undefined; }, async put(k, r) { store.set(String(k), r.clone()); } } };
const aeEvents = [];
globalThis.__env = { CAP_SECRET: SECRET, CAPBANK: KV, DB, PULSE: { writeDataPoint: (p) => aeEvents.push(p.blobs[0]) } };
const pending = [];
const locals = { cfContext: { waitUntil: (p) => pending.push(p) } };
const { GET } = await import(`file:///${R}/apps/web/src/pages/api/cap/new.ts`);
const { POST } = await import(`file:///${R}/apps/web/src/pages/api/cap/pass.ts`);
const H = { 'cf-connecting-ip': '198.51.100.23', 'user-agent': 'Mozilla/5.0 E2E Chrome/130' };
const realNow = Date.now;
const newQ = async (h = H) => { const u = new URL('https://site.test/api/cap/new?k=login'); const r = await GET({ request: new Request(u, { headers: h }), url: u, locals }); await Promise.all(pending.splice(0)); return r; };
const pass = async (body, h = H) => { Date.now = () => realNow() + 2000; try { return await POST({ request: new Request('https://site.test/api/cap/pass', { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(body) }), locals }); } finally { Date.now = realNow; await Promise.all(pending.splice(0)); } };
const clicks = (pts) => ({ c: pts.map((p, i) => [p[0] + 2, p[1] - 3, i ? 400 : 900]), m: [0, 12, 9], pt: 'mouse', tr: true });

let r = await newQ(); assert.equal(r.status, 200); let q = await r.json();
assert.equal(q.ok, true); assert.deepEqual(Buffer.from(lib.unb64u(q.img)), Buffer.from(img)); assert.equal(q.n, 3); assert.equal(q.hy, 270);
assert.equal(r.headers.get('cache-control'), 'no-store');
const readsAfterFirst = kvReads;
r = await newQ(); await r.json(); assert.equal(kvReads, readsAfterFirst, '第二次出题应命中隔离区 cap:cur 与 Cache API,不再读 KV');
console.log('出题:返回图与 KV 一致;第二次出题 0 次 KV 读、0 次 D1');
assert.equal(d1Stmts, 0);

r = await pass({ t: q.t, ...clicks(T) }); assert.equal(r.status, 200);
const ck = r.headers.get('set-cookie'); assert.match(ck, /^__Host-cap=/);
assert.equal(await lib.verifyPass(new Request('https://site.test/x', { headers: { ...H, cookie: ck.split(';')[0] } }), globalThis.__env), true);
console.log('答对:200 + __Host-cap,verifyPass 认');
assert.equal(d1Stmts, 1, '答对只写 1 行');
r = await pass({ t: q.t, ...clicks(T) }); assert.equal(r.status, 403); assert.equal((await r.json()).code, 'no');
console.log('同一令牌重交:403');
for (let i = 1; i <= 4; i++) { const t = (await (await newQ()).json()).t; r = await pass({ t, ...clicks([T[1], T[0], T[2]]) }); assert.equal(r.status, 403, `第 ${i} 次错`); }
const t6 = (await (await newQ()).json()).t; r = await pass({ t: t6, ...clicks([T[1], T[0], T[2]]) });
assert.equal(r.status, 429, '同一 IP 段一小时错满 6 次(含上面的重放那次)回 429');
r = await newQ(); assert.equal(r.status, 429);
const d1Before = d1Stmts; r = await pass({ t: t6, ...clicks(T) }); assert.equal(r.status, 429); assert.equal(d1Stmts, d1Before, '冷却中的段交卷不碰 D1');
console.log('错满 6 次:交卷 429,出题也 429(冷却);冷却中再交卷 0 次 D1');
r = await newQ({ ...H, 'cf-connecting-ip': '203.0.113.9' }); assert.equal(r.status, 200); console.log('别的 IP 段不受影响');
const t7 = (await r.json()).t;
r = await pass({ t: t7, ...clicks(T) }, { ...H, 'cf-connecting-ip': '192.0.2.50' }); assert.equal(r.status, 403, '令牌绑 IP 段:拿题的是 203.0.113.x,换 192.0.2.x 来交不认');
r = await pass({ t: t7, ...clicks(T) }, { ...H, 'cf-connecting-ip': '203.0.113.77' }); assert.equal(r.status, 200, '别段来交的在验签那步就被拒,不消耗 nonce:原段本人照常能交(与 L3 6.3 顺序一致)');
r = await pass({ t: 'garbage', ...clicks(T) }, { ...H, 'cf-connecting-ip': '192.0.2.1' }); assert.equal(r.status, 403);
r = await POST({ request: new Request('https://site.test/api/cap/pass', { method: 'POST', body: 'x'.repeat(5000) }), locals }); assert.equal(r.status, 413);
r = await POST({ request: new Request('https://site.test/api/cap/pass', { method: 'POST', body: '{bad' }), locals }); assert.equal(r.status, 400);
globalThis.__env.CAP_SECRET = '';
assert.equal((await newQ()).status, 503); assert.equal((await pass({ t: q.t, ...clicks(T) })).status, 503);
console.log('坏令牌 403、超长 413、坏 JSON 400、没配密钥两个接口都 503');
console.log('AE 事件', [...new Set(aeEvents)].join(' '));
console.log('接口端到端通过:', R);
