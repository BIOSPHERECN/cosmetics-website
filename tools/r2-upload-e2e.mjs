/**
 * R2 上传链路端到端实测:
 *   铸会话 → 生成一张 >0.9MB 的图(证明走的是 R2 不是 D1 回退)→
 *   POST /api/admin/upload → GET /media/{id} 全字节取回比对 → 库里核 driver。
 * 「先放到 hosonzuo 的 R2」这句话必须以这条链路全绿为完成标准。
 */
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = 'https://biosphere-ai.com';

/* ── 铸会话(与 shot-admin 同款)── */
const envText = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const AUTH_SECRET = /^AUTH_SECRET=(.+)$/m.exec(envText)[1].trim();
const te = new TextEncoder();
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const k = await crypto.subtle.importKey('raw', te.encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
/* uid 必须是真实账号:media.uploaded_by 有外键,假 uid 落库会撞 FOREIGN KEY(实测撞过) */
const admin = d1(`SELECT id, email FROM users WHERE role='admin' ORDER BY id LIMIT 1`)[0];
if (!admin) { console.error('库里没有管理员账号'); process.exit(1); }
const body = b64u(te.encode(JSON.stringify({ uid: admin.id, email: admin.email, role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 })));
const cookie = `bohui_sess=${body}.${b64u(await crypto.subtle.sign('HMAC', k, te.encode(body)))}`;

/* ── 生成 >0.9MB 的 webp(无损噪点图压不下去,天然大)── */
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;
/* 必须是真随机 —— 周期性噪点会被无损压缩压到几乎为零(实测 0KB),
   测试图就掉回 D1 档,测不到 R2 路径 */
const { randomFillSync } = await import('node:crypto');
const noise = randomFillSync(Buffer.alloc(1024 * 1024 * 3));
const img = await sharp(noise, { raw: { width: 1024, height: 1024, channels: 3 } })
  .webp({ lossless: true }).toBuffer();
console.log(`测试图 ${(img.length / 1024).toFixed(0)}KB(> 900KB ⇒ 只有 R2 路径能收)`);
if (img.length < 950_000) { console.error('★ 测试图不够大,换参数重来'); process.exit(1); }

/* ── 上传 ── */
const fd = new FormData();
fd.set('file', new File([img], 'e2e-noise.webp', { type: 'image/webp' }));
fd.set('folder', '链路自检');
fd.set('alt_zh', 'R2 上传链路端到端自检图(可删)');
/* Astro 内建 CSRF 防护:表单类 POST 必须带同源 Origin(浏览器自动带,脚本要显式) */
const headers = { cookie, origin: BASE };
let res = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', headers, body: fd });
if (res.status === 404 || res.status === 405) {
  res = await fetch(`${BASE}/api/admin/upload/`, { method: 'POST', headers, body: fd });
}
const j = await res.json().catch(() => ({}));
console.log(`上传 → HTTP ${res.status}`, JSON.stringify(j));
if (!j.ok) process.exit(1);

/* ── 取回比对 ── */
const back = await fetch(`${BASE}/media/${j.id}?cb=${Math.random()}`, { redirect: 'follow' });
const buf = Buffer.from(await back.arrayBuffer());
const same = buf.length === img.length && buf.equals(img);
console.log(`取回 → HTTP ${back.status} ${back.headers.get('content-type')} ${(buf.length / 1024).toFixed(0)}KB 字节一致=${same}`);

/* ── 库里核驱动 ── */
const row = d1(`SELECT id, driver, r2_key, bytes, url FROM media WHERE id=${Number(j.id)}`)[0];
console.log('库中记录:', JSON.stringify(row));
const pass = j.driver === 'r2' && row?.driver === 'r2' && same && back.status === 200;
console.log(pass ? '✔ R2 链路全绿(hosonzuo 桶,私有签名代理)' : '★ 链路未通,逐项看上面输出');
process.exit(pass ? 0 : 1);
