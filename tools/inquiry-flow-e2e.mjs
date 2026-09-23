/**
 * 询盘对话流端到端:
 *   公共接口提交一条测试询盘 → 管理端 状态→跟进中 → 记两条跟进 → 状态→成交 →
 *   后台页面拉回 HTML 验证时间线渲染 → 清理测试数据。
 */
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = 'https://biosphere-ai.com';
const MARK = 'ZZ-FLOW-E2E';

/* 铸会话(真实 admin uid,Origin 头必带) */
const envText = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const AUTH_SECRET = /^AUTH_SECRET=(.+)$/m.exec(envText)[1].trim();
const te = new TextEncoder();
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const admin = d1(`SELECT id, email FROM users WHERE role='admin' ORDER BY id LIMIT 1`)[0];
const k = await crypto.subtle.importKey('raw', te.encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sb = b64u(te.encode(JSON.stringify({ uid: admin.id, email: admin.email, role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 })));
const cookie = `bohui_sess=${sb}.${b64u(await crypto.subtle.sign('HMAC', k, te.encode(sb)))}`;
const H = { cookie, origin: BASE, 'content-type': 'application/json' };

const step = async (label, fn) => {
  const r = await fn();
  console.log(`${r.pass ? '✔' : '★'} ${label}${r.extra ? ' — ' + r.extra : ''}`);
  if (!r.pass) { cleanup(); process.exit(1); }
  return r;
};
const cleanup = () => {
  try {
    const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/flowclean.sql';
    writeFileSync(f, `DELETE FROM inquiries WHERE name='${MARK}';`, 'utf8');
    d1(f, { file: true });
  } catch {}
};

/* ① 公共接口提交(带站内来源页,模拟真实动线) */
let inqId = 0;
await step('公共询盘提交', async () => {
  const r = await fetch(`${BASE}/api/inquiry`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, referer: `${BASE}/zh-cn/products/?cat=skincare` },
    body: JSON.stringify({ name: MARK, email: 'flow-e2e@biosphere-ai.com', message: '对话流端到端自检(可删)', site: 'biosphere-ai' }),
  });
  const j = await r.json().catch(() => ({}));
  const row = d1(`SELECT id, status FROM inquiries WHERE name='${MARK}' ORDER BY id DESC LIMIT 1`)[0];
  inqId = row?.id ?? 0;
  return { pass: r.status === 200 && !!inqId && row.status === 'new', extra: `id=${inqId} HTTP ${r.status} ${JSON.stringify(j).slice(0, 60)}` };
});

/* ② 状态与跟进的往来 */
await step('状态 → 跟进中', async () => {
  const r = await fetch(`${BASE}/api/admin/inquiry`, { method: 'PATCH', headers: H, body: JSON.stringify({ id: inqId, status: 'following' }) });
  return { pass: (await r.json()).ok === true };
});
await step('记跟进 ×2', async () => {
  for (const text of ['电话联系,客户要 500ml 身体乳报价单', '报价单已发,约定下周二回访']) {
    const r = await fetch(`${BASE}/api/admin/inquiry`, { method: 'POST', headers: H, body: JSON.stringify({ id: inqId, text }) });
    if (!(await r.json()).ok) return { pass: false, extra: text };
  }
  return { pass: true };
});
await step('状态 → 成交', async () => {
  const r = await fetch(`${BASE}/api/admin/inquiry`, { method: 'PATCH', headers: H, body: JSON.stringify({ id: inqId, status: 'won' }) });
  return { pass: (await r.json()).ok === true };
});

/* ③ 库与页面双向验证 */
await step('时间线落库(2 状态 + 2 跟进,顺序正确)', async () => {
  const tl = d1(`SELECT kind, text FROM inquiry_notes WHERE inquiry_id=${inqId} ORDER BY id`);
  const shape = tl.map((x) => x.kind).join(',');
  return { pass: shape === 'status,note,note,status' && tl[3].text === 'following→won', extra: shape };
});
await step('后台页渲染时间线', async () => {
  const html = await (await fetch(`${BASE}/bohui/inquiries/?q=${MARK}`, { headers: { cookie } })).text();
  const ok = html.includes('跟进记录') && html.includes('报价单已发') && html.includes('跟进中 → 已成交') && html.includes('已成交');
  return { pass: ok, extra: ok ? '「跟进记录/报价单已发/跟进中→已成交」都在' : '页面缺片段' };
});

cleanup();
const left = d1(`SELECT COUNT(*) n FROM inquiries WHERE name='${MARK}'`)[0].n;
console.log(`清理完成,残留 ${left} 条(级联删跟进)`);
console.log('✔ 询盘对话流全绿');
