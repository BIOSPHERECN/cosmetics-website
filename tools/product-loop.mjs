/**
 * 产品闭环验收:后台建 → 前台看得到 → 后台删 → 前台消失。
 *
 * 只测后台接口是不够的。之前的状态正是「后台能写、前台不读」——
 * 接口每一步都返回 ok,运营录完产品去前台一看,什么都没有。
 * 所以必须两头都验,而且要**真去请求前台页面**。
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = process.argv[2] || 'https://biosphere-ai.com';
const EMAIL = 'zz-loop-temp@biosphere-ai.com';
const NAME = '闭环验收用·草本修护精华';
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/loop.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

const fail = [];
const ok = (label, cond, extra = '') => { console.log(`  ${cond ? '✓' : '★'} ${String(label).padEnd(30)}${extra}`); if (!cond) fail.push(label); };

const pass = b64u(crypto.getRandomValues(new Uint8Array(24)));
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 60_000, hash: 'SHA-256' }, key, 256);
run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email,pass_hash,pass_salt,role,display_name) VALUES (${lit(EMAIL)},${lit(b64u(bits))},${lit(b64u(salt))},'admin','闭环验收(用完即删)');`);

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: pass }), signal: AbortSignal.timeout(45000),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const post = (b) => fetch(`${BASE}/api/admin/product`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(b), signal: AbortSignal.timeout(45000),
}).then((r) => r.json());

const front = async () => {
  const r = await fetch(`${BASE}/zh-cn/products`, { signal: AbortSignal.timeout(45000) });
  return await r.text();
};

console.log('\n【闭环】');
const before = await front();
ok('前台原本没有这个产品', !before.includes(NAME));

const mid = d1('SELECT id FROM media ORDER BY id DESC LIMIT 1')[0]?.id;
const c = await post({ action: 'create', name: NAME, slug: 'zz-loop-item',
  category: 'skincare', moq: '柔性起订量 · 按品类议', summary: '闭环验收用,跑完即删' });
ok('后台新建', c.ok, c.ok ? `#${c.id}` : c.msg);
if (!c.ok) { run(`DELETE FROM users WHERE email=${lit(EMAIL)};`); process.exit(1); }

await post({ action: 'save', id: c.id, name: NAME, category: 'skincare',
  moq: '柔性起订量 · 按品类议', summary: '闭环验收用,跑完即删', status: 'published' });
if (mid) await post({ action: 'images', id: c.id, mediaIds: [mid] });

const after = await front();
ok('前台产品页出现了', after.includes(NAME));
ok('带上了封面图', !mid || after.includes(`/media/${mid}`), mid ? `/media/${mid}` : '(库里没图,跳过)');
ok('出现了「产品目录」标题', after.includes('产品目录'));

// 草稿不该出现在前台 —— 这条比"能显示"更重要:漏了它,未定稿的产品会直接对外
await post({ action: 'toggle', id: c.id });
const drafted = await front();
ok('下架后前台立刻消失', !drafted.includes(NAME));

await post({ action: 'delete', id: c.id });
const gone = await front();
ok('删除后前台干净', !gone.includes(NAME));

run(`DELETE FROM users WHERE email=${lit(EMAIL)};`);
console.log('\n临时账号已删');
console.log('\n════ 结论 ════');
console.log(fail.length ? `  ${fail.length} 处不通:\n   · ${fail.join('\n   · ')}` : '  后台 ↔ 前台闭环打通。');
