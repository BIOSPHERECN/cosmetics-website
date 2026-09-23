/**
 * 网关端到端验收。
 *
 * 验的是「一个外部客户端能不能真的接进来」,不是「代码能不能编译」:
 *   签发 key → 用它调 /models → 调 /chat/completions → 试错误 key → 试超限 → 吊销后失效。
 * 每一步都用**真实 HTTP**,不走任何内部捷径 —— 内部调通不代表外部能用。
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = process.argv[2] || 'https://biosphere-ai.com';
const EMAIL = 'zz-gwprobe-temp@biosphere-ai.com';
const ITER = 60_000;
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/gwprobe.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return { hash: b64u(bits), salt: b64u(salt) };
}

const fail = [];
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '★'} ${String(label).padEnd(34)}${extra}`);
  if (!cond) fail.push(label);
};

/* ── 登录后台 ─────────────────────────────────────────── */
const pass = b64u(crypto.getRandomValues(new Uint8Array(24)));
const { hash, salt } = await hashPassword(pass);
run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email, pass_hash, pass_salt, role, display_name) VALUES (${lit(EMAIL)},${lit(hash)},${lit(salt)},'admin','网关探活(用完即删)');`);

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: pass }), signal: AbortSignal.timeout(45000),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
ok('后台登录', login.status === 200);

/* ── 签发 key ────────────────────────────────────────── */
let gwKey = '', keyId = 0;
{
  const r = await fetch(`${BASE}/api/admin/gateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'create', name: '探活临时 key', hourlyLimit: 5, scopes: ['chat'] }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await r.json().catch(() => ({}));
  gwKey = j.key ?? ''; keyId = j.id ?? 0;
  ok('签发网关 key', !!gwKey && gwKey.startsWith('bh-'), gwKey ? `(前缀 ${gwKey.slice(0, 11)}…)` : JSON.stringify(j).slice(0, 80));
}
if (!gwKey) { run(`DELETE FROM users WHERE email=${lit(EMAIL)};`); process.exit(1); }

const GW = `${BASE}/api/gateway/v1`;
const call = (path, opts = {}) => fetch(GW + path, {
  ...opts,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.key ?? gwKey}`, ...(opts.headers ?? {}) },
  signal: AbortSignal.timeout(120000),
});

/* ── 模型列表 ────────────────────────────────────────── */
{
  const r = await call('/models');
  const j = await r.json().catch(() => ({}));
  const ids = (j.data ?? []).map((m) => m.id);
  ok('GET /models', r.status === 200 && ids.includes('auto'), `${ids.length} 个:${ids.slice(0, 5).join(' ')}…`);
}

/* ── 鉴权必须真的挡住 ─────────────────────────────────── */
{
  const r = await call('/models', { key: 'bh-definitely-not-a-real-key' });
  ok('错误 key 被拒', r.status === 401, `HTTP ${r.status}`);
}
{
  const r = await fetch(`${GW}/models`, { signal: AbortSignal.timeout(30000) });
  ok('无 key 被拒', r.status === 401, `HTTP ${r.status}`);
}

/* ── 对话:自动挡 ────────────────────────────────────── */
{
  const t0 = Date.now();
  const r = await call('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: '把「真空乳化」翻成泰语,只输出译文' }], max_tokens: 60 }),
  });
  const j = await r.json().catch(() => ({}));
  const text = j.choices?.[0]?.message?.content ?? '';
  ok('POST /chat/completions 自动挡', r.status === 200 && text.length > 0,
    `${Date.now() - t0}ms · 由 ${r.headers.get('x-bohui-provider') ?? '?'} 应答 · ${String(text).replace(/\s+/g, ' ').slice(0, 40)}`);
  // 形状必须是 OpenAI 的,否则那些 SDK 接不进来
  ok('回包形状符合 OpenAI', j.object === 'chat.completion' && Array.isArray(j.choices) && !!j.choices[0]?.message?.role);
}

/* ── 对话:指定某一家 ─────────────────────────────────── */
{
  const r = await call('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'orfree', messages: [{ role: 'user', content: 'reply with the single word OK' }], max_tokens: 10 }),
  });
  const j = await r.json().catch(() => ({}));
  ok('指定 model=orfree', r.status === 200, `实际应答 ${r.headers.get('x-bohui-provider') ?? '?'}`);
}

/* ── 传一个我们没有的模型名,必须退回自动挡而不是报错 ───── */
{
  const r = await call('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'reply OK' }], max_tokens: 10 }),
  });
  ok('未知 model 名退回自动挡', r.status === 200, `HTTP ${r.status}`);
}

/* ── 限流:上面已经打了 3 次对话,限额设的是 5 ────────── */
{
  let hit429 = false, n = 0;
  for (let i = 0; i < 6; i++) {
    const r = await call('/chat/completions', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
    });
    n++;
    if (r.status === 429) { hit429 = true; break; }
  }
  ok('超过限额返回 429', hit429, `第 ${n} 次触发`);
}

/* ── 吊销后立刻失效 ──────────────────────────────────── */
{
  await fetch(`${BASE}/api/admin/gateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'delete', id: keyId }),
  });
  const r = await call('/models');
  ok('吊销后立刻 401', r.status === 401, `HTTP ${r.status}`);
}

/* ── 流水有没有记下来 ────────────────────────────────── */
{
  const rows = d1(`SELECT COUNT(*) n, SUM(ok) good FROM gateway_calls WHERE key_id=${keyId}`);
  const n = rows[0]?.n ?? 0;
  ok('调用流水已记账', n > 0, `${n} 条,成功 ${rows[0]?.good ?? 0} 条`);
}

run(`DELETE FROM users WHERE email=${lit(EMAIL)}; DELETE FROM gateway_calls WHERE key_id=${keyId};`);
console.log('\n临时账号与探活流水已清理');

console.log('\n════ 结论 ════');
if (!fail.length) console.log('  网关全部通过,外部客户端可以直接接入。');
else { console.log(`  ${fail.length} 处不通过:`); fail.forEach((f) => console.log('   · ' + f)); }
