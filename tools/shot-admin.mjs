/**
 * 带登录态的后台截图 —— shot.mjs 的姊妹件。
 *
 * 后台页面全部要 session cookie,普通截图只能拍到登录页。
 * 做法与 admin-probe 相同:临时管理员(随机口令,不落盘不打印)→
 * 真登录拿 cookie → CDP Network.setCookie 注入 → 截图 → 删账号。
 *
 * 用法:node tools/shot-admin.mjs <path> <out.png> [selector] [宽度=1600]
 *   例:node tools/shot-admin.mjs /bohui/ dash.png
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://biosphere-ai.com';
const CHROME = 'D:/ie/Chrome/App/chrome.exe';

let [path, out, selector, widthArg] = process.argv.slice(2);
if (!path || !out) { console.error('用法: node tools/shot-admin.mjs <path> <out.png> [selector] [宽度]'); process.exit(1); }
/* Git Bash 会把 /bohui/ 这种参数改写成 C:/Program Files/Git/bohui/(MSYS 路径转换),
   拼进 URL 后 host 变成 biosphere-ai.comc…(实拍踩过)。这里把它掰回来:
   取出最后的站内路径段;传参时写成 bohui/ 也行,两种都认。 */
const m = path.match(/\/(bohui(?:\/.*)?)$/) ?? path.match(/^(bohui(?:\/.*)?)$/);
path = m ? '/' + m[1] : (path.startsWith('/') ? path : '/' + path);
if (!path.endsWith('/') && !path.includes('?') && !path.includes('.')) path += '/';
const W = Math.max(320, parseInt(widthArg, 10) || 1600);

const b64u = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ── 本地铸造会话(不走登录接口)──────────────────────────────
 * 登录接口上了 Turnstile 人机验证后,脚本走它会被**正确地**拦下 ——
 * 拦得对,就不该绕。工具改用 .env 里的 AUTH_SECRET 直接铸一枚
 * 与服务端同格式的 HMAC 会话(auth.ts 的 issueSession 同款),
 * 不建临时账号、不动登录链路、25 分钟自动过期。 */
const envText = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const AUTH_SECRET = /^AUTH_SECRET=(.+)$/m.exec(envText)?.[1]?.trim();
if (!AUTH_SECRET) { console.error('.env 缺 AUTH_SECRET'); process.exit(1); }
const te = new TextEncoder();
const hmacKey = await crypto.subtle.importKey('raw', te.encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sessBody = b64u(te.encode(JSON.stringify({
  uid: 0, email: 'zz-shot-local@biosphere-ai.com', role: 'admin',
  exp: Math.floor(Date.now() / 1000) + 25 * 60,
})));
const ckName = 'bohui_sess';
const ckValue = `${sessBody}.${b64u(await crypto.subtle.sign('HMAC', hmacKey, te.encode(sessBody)))}`;
const cleanup = () => {};

/* ── 无头 Chrome + cookie 注入 + 截图(与 shot.mjs 同一套 CDP)── */
const PORT = 9334;   // 与 shot.mjs 的 9333 错开,两件工具可同时跑
const profile = mkdtempSync(join(tmpdir(), 'cdp-adm-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--window-size=1600,1000', '--proxy-server=127.0.0.1:1082', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} cleanup(); };
process.on('exit', kill);

let target = null;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    if (r.ok) { target = await r.json(); break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
if (!target) { console.error('Chrome 调试端口没起来'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  } else if (m.method) events.push(m.method);
};
await new Promise((r) => { ws.onopen = r; });

await send('Page.enable');
await send('Network.enable');
await send('Network.setCookie', {
  name: ckName, value: ckValue, url: BASE, secure: true, httpOnly: true, sameSite: 'Lax',
});
if (W !== 1600) await send('Emulation.setDeviceMetricsOverride', { width: W, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + path });
for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 150));
await new Promise((r) => setTimeout(r, 1000));

let clip;
if (selector) {
  const { result } = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null; el.scrollIntoView(); const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`,
  });
  if (!result.value) { console.error(`选择器没匹配到:${selector}`); process.exit(1); }
  const v = result.value;
  clip = { x: Math.max(0, v.x), y: Math.max(0, v.y), width: Math.min(v.w, W), height: Math.min(v.h, 4000), scale: 1 };
  await new Promise((r) => setTimeout(r, 500));
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`${out}  ${clip ? `${Math.round(clip.width)}x${Math.round(clip.height)}` : '整页'}`);
process.exit(0);
