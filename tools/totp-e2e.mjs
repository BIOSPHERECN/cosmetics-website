/**
 * 两步验证端到端:
 *   ① RFC 6238 官方测试向量验算法(SHA-1/T=59→287082 等三组);
 *   ② 临时管理员账号走 setup → activate → 登录判定(库层)→ disable 全流程。
 * 全程不碰创始人账号(uid=2)—— 中途崩了留着半开的 TOTP 等于把人锁在门外。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = 'https://biosphere-ai.com';
const EMAIL = 'zz-totp-e2e@biosphere-ai.com';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/totpe2e.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

/* ── 与 auth.ts 同实现(复制自实现,用官方向量互证) ── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32decode = (s) => {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out = []; let bits = 0, val = 0;
  for (const ch of clean) { val = (val << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return new Uint8Array(out);
};
async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = h[h.length - 1] & 0x0f;
  return String(((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1_000_000).padStart(6, '0');
}

/* ① RFC 6238 向量:secret=ASCII "12345678901234567890" */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const VECTORS = [[59, '287082'], [1111111109, '081804'], [1234567890, '005924']];
for (const [t, want] of VECTORS) {
  const got = await totpAt(RFC_SECRET, Math.floor(t / 30));
  console.log(`${got === want ? '✔' : '★'} RFC T=${t} → ${got}(期望 ${want})`);
  if (got !== want) process.exit(1);
}

/* ── ② 流程:临时账号 ── */
const envText = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const AUTH_SECRET = /^AUTH_SECRET=(.+)$/m.exec(envText)[1].trim();
const te = new TextEncoder();
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email, pass_hash, pass_salt, role, display_name) VALUES (${lit(EMAIL)}, 'x', 'y', 'admin', '临时TOTP自检(用完即删)');`);
const uid = d1(`SELECT id FROM users WHERE email=${lit(EMAIL)}`)[0].id;
const cleanup = () => { try { run(`DELETE FROM users WHERE email=${lit(EMAIL)};`); } catch {} };

const k = await crypto.subtle.importKey('raw', te.encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sb = b64u(te.encode(JSON.stringify({ uid, email: EMAIL, role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 })));
const H = { cookie: `bohui_sess=${sb}.${b64u(await crypto.subtle.sign('HMAC', k, te.encode(sb)))}`,
  origin: BASE, 'content-type': 'application/json' };
const call = (body) => fetch(`${BASE}/api/admin/totp`, { method: 'POST', headers: H, body: JSON.stringify(body) }).then((r) => r.json());

const setup = await call({ action: 'setup' });
console.log(`${setup.ok ? '✔' : '★'} setup(secret ${String(setup.secret ?? '').length} 位,otpauth ${setup.otpauth ? '有' : '无'})`);
if (!setup.ok) { cleanup(); process.exit(1); }

const wrong = await call({ action: 'activate', code: '000000' });
console.log(`${!wrong.ok ? '✔' : '★'} 错码激活被拒:${wrong.msg}`);

const now = Math.floor(Date.now() / 1000 / 30);
const good = await call({ action: 'activate', code: await totpAt(setup.secret, now) });
console.log(`${good.ok ? '✔' : '★'} 正码激活`);
if (!good.ok) { cleanup(); process.exit(1); }
console.log(`${d1(`SELECT totp_secret IS NOT NULL n FROM users WHERE id=${uid}`)[0].n ? '✔' : '★'} 库中已启用`);

const off = await call({ action: 'disable', code: await totpAt(setup.secret, Math.floor(Date.now() / 1000 / 30)) });
console.log(`${off.ok ? '✔' : '★'} 验码关闭`);
console.log(`${d1(`SELECT totp_secret IS NULL n FROM users WHERE id=${uid}`)[0].n ? '✔' : '★'} 库中已清除`);

cleanup();
console.log('清理完成 ✔ 两步验证全链路绿');
