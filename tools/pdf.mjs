/**
 * HTML → PDF —— 交付文档的打印通道(与 shot.mjs 同一套 CDP)。
 * 用法:node tools/pdf.mjs <input.html 或 URL> <out.pdf>
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'D:/ie/Chrome/App/chrome.exe';
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('用法: node tools/pdf.mjs <input.html|URL> <out.pdf>'); process.exit(1); }
const url = /^https?:/.test(src) ? src : 'file:///' + src.replace(/\\/g, '/');

const PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), 'cdp-pdf-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--proxy-server=127.0.0.1:1082', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', kill);

let target = null;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (r.ok) { target = await r.json(); break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
if (!target) { console.error('Chrome 调试端口没起来'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
const send = (m, p = {}) => new Promise((res, rej) => {
  const i2 = ++id; pending.set(i2, { res, rej });
  ws.send(JSON.stringify({ id: i2, method: m, params: p }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method) events.push(m.method);
};
await new Promise((r) => { ws.onopen = r; });
await send('Page.enable');
for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 150));
await new Promise((r) => setTimeout(r, 1200));

const pdf = await send('Page.printToPDF', {
  printBackground: true,
  paperWidth: 8.27, paperHeight: 11.69,           /* A4 */
  marginTop: 0.55, marginBottom: 0.55, marginLeft: 0.5, marginRight: 0.5,
  displayHeaderFooter: false,
  preferCSSPageSize: true,
});
writeFileSync(out, Buffer.from(pdf.data, 'base64'));
console.log(out, Math.round(Buffer.byteLength(pdf.data, 'base64') / 1024) + 'KB');
process.exit(0);
