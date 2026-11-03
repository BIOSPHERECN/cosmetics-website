/**
 * 页面编辑器验收:拖拽排序与实时预览。
 *
 * 拖拽本身是浏览器行为,脚本里模拟不了。但拖拽真正要证明的不是
 * 「鼠标能拖动」,而是**松手之后顺序真的存下来了** —— 那一步是接口,
 * 可以直接验:调 reorder → 查库 → 确认 sort_order 按新顺序重排。
 *
 * 顺带验两条越权:传别的页面的版块 id、传空数组,都必须被拒。
 * 这类接口最容易漏掉校验 —— 排序看起来"人畜无害",
 * 但它能把别的站点的版块搬进本页。
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = process.argv[2] || 'https://biosphere-ai.com';
const EMAIL = 'zz-editor-temp@biosphere-ai.com';
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/ed.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

const fail = [];
const ok = (l, c, x = '') => { console.log(`  ${c ? '✓' : '★'} ${String(l).padEnd(32)}${x}`); if (!c) fail.push(l); };

const pass = b64u(crypto.getRandomValues(new Uint8Array(24)));
const salt = crypto.getRandomValues(new Uint8Array(16));
const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 60_000, hash: 'SHA-256' }, k, 256);
run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email,pass_hash,pass_salt,role,display_name) VALUES (${lit(EMAIL)},${lit(b64u(bits))},${lit(b64u(salt))},'admin','编辑器验收(用完即删)');`);

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: pass }), signal: AbortSignal.timeout(45000),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const post = (b) => fetch(`${BASE}/api/admin/block`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(b), signal: AbortSignal.timeout(45000),
}).then((r) => r.json()).catch((e) => ({ ok: false, msg: String(e.message).slice(0, 40) }));

console.log('\n【编辑器页面】');
{
  const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0];
  const html = await fetch(`${BASE}/bohui/pages/${page.id}`, { headers: { cookie }, signal: AbortSignal.timeout(45000) }).then((r) => r.text());
  ok('拖拽手柄已渲染', (html.match(/class="grip"/g) || []).length > 5, `${(html.match(/class="grip"/g) || []).length} 个`);
  ok('实时预览面板存在', html.includes('id="pvframe"') && html.includes('id="pvtoggle"'));
  ok('预览用 iframe 而非另写一套', html.includes('<iframe id="pvframe"'));
}

console.log('\n【排序真的存下来了吗】');
const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about' LIMIT 1`)[0];
const before = d1(`SELECT id, sort_order FROM blocks WHERE page_id=${page.id} AND is_visible=1 ORDER BY sort_order, id`);
const ids = before.map((b) => b.id);
ok('取到原顺序', ids.length >= 3, `${ids.length} 个版块`);

if (ids.length >= 3) {
  // 把最后一个搬到最前 —— 跨多位的移动,正是「相邻互换」做不到的那种
  const moved = [ids[ids.length - 1], ...ids.slice(0, -1)];
  const r = await post({ action: 'reorder', pageId: page.id, ids: moved });
  ok('reorder 接口返回 ok', r.ok, r.ok ? `重排 ${r.n} 个` : r.msg);

  const after = d1(`SELECT id, sort_order FROM blocks WHERE page_id=${page.id} AND is_visible=1 ORDER BY sort_order, id`).map((b) => b.id);
  ok('库里顺序 = 提交的顺序', JSON.stringify(after) === JSON.stringify(moved),
    `${after.slice(0, 4).join(',')}…`);

  const steps = d1(`SELECT sort_order FROM blocks WHERE page_id=${page.id} AND is_visible=1 ORDER BY sort_order`).map((b) => b.sort_order);
  ok('序号留了空档(步长 10)', steps.every((s, i) => i === 0 || s - steps[i - 1] >= 10), steps.slice(0, 5).join(' '));

  // 前台立刻反映出来
  const html = await fetch(`${BASE}/zh-cn/about?nocache=${Date.now()}`, { signal: AbortSignal.timeout(45000) }).then((r) => r.text());
  const firstType = d1(`SELECT type FROM blocks WHERE id=${moved[0]}`)[0]?.type;
  ok('前台页面仍正常渲染', html.length > 20000, `${(html.length / 1024).toFixed(0)}KB · 首块现在是 ${firstType}`);

  // 还原
  await post({ action: 'reorder', pageId: page.id, ids });
  const back = d1(`SELECT id FROM blocks WHERE page_id=${page.id} AND is_visible=1 ORDER BY sort_order, id`).map((b) => b.id);
  ok('已还原成原顺序', JSON.stringify(back) === JSON.stringify(ids));
}

console.log('\n【越权与脏输入】');
{
  const other = d1(`SELECT b.id FROM blocks b JOIN pages p ON p.id=b.page_id
                     WHERE p.site_id='biosphere-ai' AND p.slug='products' LIMIT 1`)[0]?.id;
  const r = await post({ action: 'reorder', pageId: page.id, ids: [...ids, other] });
  ok('掺入别页的版块被拒', !r.ok, r.msg ?? '');
}
{
  const r = await post({ action: 'reorder', pageId: page.id, ids: [] });
  ok('空 ids 被拒', !r.ok, r.msg ?? '');
}
{
  const r = await fetch(`${BASE}/api/admin/block`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', pageId: page.id, ids }), signal: AbortSignal.timeout(30000),
  });
  ok('未登录被拒', r.status === 401, `HTTP ${r.status}`);
}

run(`DELETE FROM users WHERE email=${lit(EMAIL)};`);
console.log('\n临时账号已删');
console.log('\n════ 结论 ════');
console.log(fail.length ? `  ${fail.length} 处不通:\n   · ${fail.join('\n   · ')}` : '  拖拽排序与实时预览验收通过。');
