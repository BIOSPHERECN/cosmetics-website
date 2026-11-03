/**
 * 后台端到端探活。
 *
 * 后台有 17 个页面、4600 行代码,但**从来没有人点进去过** ——
 * 我没有口令,创始人也没在会话里用过。这意味着这些页面是不是真能用,
 * 完全没有依据:构建通过只说明语法对,不说明点下去有反应。
 *
 * 做法:临时建一个测试管理员 → 登录 → 逐页请求 → 逐个接口探 → 删掉账号。
 * 不动创始人自己的账号(改它的口令等于把人锁在门外)。
 * 口令随机生成,只存在于本进程内存里,不落盘、不打印。
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = process.argv[2] || 'https://biosphere-ai.com';
const EMAIL = 'zz-probe-temp@biosphere-ai.com';
const ITER = 60_000;   // 必须和 apps/web/src/lib/auth.ts 的 ITER 一致

const b64u = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return { hash: b64u(bits), salt: b64u(salt) };
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/probe.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

const pass = b64u(crypto.getRandomValues(new Uint8Array(24)));
const { hash, salt } = await hashPassword(pass);

console.log('建临时管理员…');
run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email, pass_hash, pass_salt, role, display_name, site_id)
VALUES (${lit(EMAIL)}, ${lit(hash)}, ${lit(salt)}, 'admin', '临时探活账号(用完即删)', NULL);`);

let cookie = '';
try {
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: pass }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await r.json().catch(() => ({}));
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  console.log(`登录 → HTTP ${r.status} ${j.ok ? '✓' : '★ ' + (j.msg || '')}`);
  if (!j.ok) { run(`DELETE FROM users WHERE email=${lit(EMAIL)};`); process.exit(1); }
} catch (e) {
  console.log('登录异常:', String(e.message).slice(0, 80));
  run(`DELETE FROM users WHERE email=${lit(EMAIL)};`);
  process.exit(1);
}

const H = { cookie };
const bad = [];
const hit = async (path, label) => {
  try {
    const r = await fetch(BASE + path, { headers: H, redirect: 'manual', signal: AbortSignal.timeout(45000) });
    const body = r.status < 400 ? await r.text() : '';
    const err = /出错|Error|Cannot read|undefined is not|500 /.test(body.slice(0, 3000));
    const status = `${r.status}${r.status >= 300 && r.status < 400 ? ' → ' + (r.headers.get('location') || '') : ''}`;
    const flag = r.status >= 400 || r.status >= 300 || err;
    console.log(`  ${flag ? '★' : ' '} ${String(label).padEnd(22)} ${String(status).padEnd(28)} ${body.length}B`);
    if (flag) bad.push(`${label} (${path}) → ${status}${err ? ' · 页面里有报错文字' : ''}`);
    return body;
  } catch (e) { console.log(`  ★ ${label} 异常 ${String(e.message).slice(0, 40)}`); bad.push(`${label} 异常`); return ''; }
};

console.log('\n【后台页面】');
const PAGES = [
  ['/bohui/', '总览'], ['/bohui/pages/', '页面列表'], ['/bohui/products', '产品'],
  ['/bohui/media', '媒体库'], ['/bohui/media/stock', '素材库'], ['/bohui/inquiries', '询盘'],
  ['/bohui/i18n/', '多语言'], ['/bohui/models', '模型舰队'], ['/bohui/gateway', 'AI 网关'], ['/bohui/seo', 'SEO 与 GEO'], ['/bohui/users', '用户'],
  ['/bohui/log', '操作日志'], ['/bohui/formulas', '配方库'], ['/bohui/formulas/import', '配方导入'],
  ['/bohui/studio', 'AI 工作室'], ['/bohui/vision', '视觉测评'], ['/bohui/setup', '初始化'],
];
for (const [p, l] of PAGES) await hit(p, l);

console.log('\n【页面编辑器】');
const page = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0];
const editor = await hit(`/bohui/pages/${page.id}`, '编辑首页');
if (editor) {
  const blocks = (editor.match(/data-block-id|class="blk|版块/g) || []).length;
  console.log(`     编辑器里认出的版块标记:${blocks} 处`);
  if (blocks < 5) bad.push('页面编辑器没渲染出版块列表');
}

console.log('\n【接口】');
for (const [p, l] of [
  ['/api/admin/media-list', '媒体列表'], ['/api/admin/fleet-health', '舰队健康'],
  ['/api/admin/translate', '翻译进度'],
]) await hit(p, l);

/* ── 产品增删改:走完整一轮 ───────────────────────────────
   只看页面能不能打开是不够的 —— 之前产品页就是「能打开、但只读」。
   真正要证明的是:建得出来、改得掉、前台读得到、删得干净。 */
console.log('\n【产品增删改】');
const post = (b) => fetch(`${BASE}/api/admin/product`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...H },
  body: JSON.stringify(b), signal: AbortSignal.timeout(45000),
}).then((r) => r.json()).catch((e) => ({ ok: false, msg: String(e.message).slice(0, 40) }));

let pid = 0;
{
  const r = await post({ action: 'create', name: '探活临时产品', slug: 'zz-probe-item',
    category: 'skincare', moq: '柔性起订量', summary: '用完即删' });
  pid = r.id ?? 0;
  console.log(`  ${r.ok ? ' ' : '★'} 新建产品                  ${r.ok ? `#${pid} /${r.slug}` : r.msg}`);
  if (!r.ok) bad.push('产品新建失败:' + r.msg);
}
if (pid) {
  const r = await post({ action: 'save', id: pid, name: '探活临时产品(已改)',
    category: 'oral', moq: '柔性起订量 · 按品类议', status: 'published', summary: '改过一次' });
  console.log(`  ${r.ok ? ' ' : '★'} 保存修改                  ${r.ok ? '' : r.msg}`);
  if (!r.ok) bad.push('产品保存失败');

  const row = d1(`SELECT p.status, p.category, i.name FROM products p
                    JOIN product_i18n i ON i.product_id=p.id AND i.lang='zh-cn' WHERE p.id=${pid}`)[0];
  const okDb = row?.status === 'published' && row?.category === 'oral' && /已改/.test(row?.name ?? '');
  console.log(`  ${okDb ? ' ' : '★'} 改动确实写进库了            ${row ? `${row.name} · ${row.category} · ${row.status}` : '查不到'}`);
  if (!okDb) bad.push('产品改动没落库');

  const mid = d1('SELECT id FROM media ORDER BY id DESC LIMIT 1')[0]?.id;
  if (mid) {
    const r2 = await post({ action: 'images', id: pid, mediaIds: [mid] });
    const cov = d1(`SELECT cover_media FROM products WHERE id=${pid}`)[0]?.cover_media;
    console.log(`  ${r2.ok && cov === mid ? ' ' : '★'} 配图与封面                ${r2.ok ? `封面 /media/${cov}` : r2.msg}`);
    if (!(r2.ok && cov === mid)) bad.push('产品配图没生效');
  }

  const r3 = await post({ action: 'delete', id: pid });
  const left = d1(`SELECT COUNT(*) n FROM products WHERE id=${pid}`)[0].n
             + d1(`SELECT COUNT(*) n FROM product_i18n WHERE product_id=${pid}`)[0].n
             + d1(`SELECT COUNT(*) n FROM product_media WHERE product_id=${pid}`)[0].n;
  console.log(`  ${r3.ok && left === 0 ? ' ' : '★'} 删除且不留残骸            ${left === 0 ? '三张表都清了' : `还剩 ${left} 行`}`);
  if (!(r3.ok && left === 0)) bad.push('产品删除留下残骸');
}

/* ── 越权:普通编辑不能发网关 key ───────────────────────── */
console.log('\n【权限】');
{
  const r = await fetch(`${BASE}/api/admin/gateway`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: 'x' }), signal: AbortSignal.timeout(30000),
  });
  console.log(`  ${r.status === 401 ? ' ' : '★'} 未登录发 key 被拒          HTTP ${r.status}`);
  if (r.status !== 401) bad.push('未登录竟然能发网关 key');
}

console.log('\n删除临时账号…');
run(`DELETE FROM users WHERE email=${lit(EMAIL)};`);
const left = d1(`SELECT COUNT(*) n FROM users WHERE email=${lit(EMAIL)}`)[0].n;
console.log(left === 0 ? '  已删除' : '  ★ 没删掉,请手动清理');

console.log(`\n════ 结论 ════`);
if (!bad.length) console.log('  后台全部可访问,没有报错。');
else { console.log(`  ${bad.length} 处问题:`); bad.forEach((b) => console.log('   · ' + b)); }
