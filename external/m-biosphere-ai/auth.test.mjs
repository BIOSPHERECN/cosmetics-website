/**
 * 鉴权层自测 —— 安全代码不该只靠"看着对"就上线。
 * Node 的 webcrypto 与 Workers 是同一套 API,所以这里跑过 = 线上行为一致。
 * 跑法:node external/m-biosphere-ai/auth.test.mjs
 */
import { hashPassword, verifyPassword, makeToken, verifyToken } from './auth.js';

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { const ok = await fn(); ok ? (pass++, console.log('  ✓', name)) : (fail++, console.log('  ✗', name)); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
};

const SECRET = 'test-secret-do-not-use';

console.log('密码哈希');
const h = await hashPassword('correct horse battery staple');
await t('新格式验得过', async () => (await verifyPassword('correct horse battery staple', h)).ok);
await t('错密码验不过', async () => !(await verifyPassword('wrong', h)).ok);
await t('带 pbkdf2 前缀与迭代次数', () => /^pbkdf2\$60000\$/.test(h));
await t('两次哈希盐不同(不会退化成确定值)', async () => (await hashPassword('x')) !== (await hashPassword('x')));

console.log('旧格式迁移');
const legacy = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('oldpwd'))))
  .map((b) => b.toString(16).padStart(2, '0')).join('');
await t('旧的裸 SHA-256 仍认', async () => { const r = await verifyPassword('oldpwd', legacy); return r.ok && r.legacy; });
await t('旧格式错密码不认', async () => !(await verifyPassword('nope', legacy)).ok);

console.log('会话令牌');
const tok = await makeToken(SECRET, 1);
await t('自签自验通过', async () => await verifyToken(tok, SECRET, 1));
await t('换密钥验不过', async () => !(await verifyToken(tok, 'other-secret', 1)));
await t('改了 payload 验不过', async () => {
  const [p, s] = tok.split('.');
  const evil = Buffer.from(JSON.stringify({ exp: Date.now() + 1e9, sub: 'bhbohui', pv: 1 })).toString('base64url');
  return !(await verifyToken(`${evil}.${s}`, SECRET, 1));
});
await t('密码版本变了就失效(改密码能踢下线)', async () => !(await verifyToken(tok, SECRET, 2)));
await t('过期的验不过', async () => {
  const p = Buffer.from(JSON.stringify({ exp: Date.now() - 1000, sub: 'bhbohui', pv: 1 })).toString('base64url');
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', SECRET).update(p).digest('hex');
  return !(await verifyToken(`${p}.${sig}`, SECRET, 1));
});
await t('乱码不崩', async () => !(await verifyToken('garbage', SECRET, 1)) && !(await verifyToken('a.b.c', SECRET, 1)));

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
