/**
 * 手机端量化审计:node tools/m-audit.mjs <URL> [宽=375]
 * 输出 JSON:横向溢出元素 / 超宽块 / 巨型字号 / 页头吸顶高度 / 触控目标不足 / 图片加载失败。
 * 与 shot.mjs 同一套 CDP 管道;判据全部量化,给 QA 智能体当眼睛用。
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const URL_ = process.argv[2];
const W = Number(process.argv[3] || 375);
if (!URL_) { console.error('用法: node tools/m-audit.mjs <URL> [宽]'); process.exit(1); }

/* 便携 Chrome —— 与 shot.mjs 同一份(本机没有装机版) */
const CHROME = 'D:/ie/Chrome/App/chrome.exe';

const PORT = 9000 + Math.floor(Math.random() * 900);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', `--window-size=${W},900`,
  '--user-data-dir=' + process.env.TEMP + '/m-audit-' + PORT,
  '--proxy-server=127.0.0.1:1082', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { proc.kill(); } catch {} };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 新版 Chrome 的 /json/new 必须 PUT(shot.mjs 同款教训) */
let target;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' });
    if (r.ok) { target = await r.json(); break; }
  } catch {}
  await wait(200);
}
if (!target) { console.error('Chrome 起不来'); kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let mid = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data.toString());
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
};
await new Promise((r) => { ws.onopen = r; });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: true });
await wait(3500);

const AUDIT = `(async () => {
  const H = document.body.scrollHeight;
  for (let y = 0; y < H; y += 800) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
  scrollTo(0, 0);
  const vw = innerWidth;
  const out = { url: location.pathname, vw, pageH: H, problems: [] };
  // 1. 横向溢出
  if (document.documentElement.scrollWidth > vw + 1)
    out.problems.push({ type: 'h-overflow', detail: '文档宽 ' + document.documentElement.scrollWidth + ' > 视口 ' + vw });
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 2 && el.children.length === 0)
      out.problems.push({ type: 'wide-el', detail: el.tagName + '.' + String(el.className).slice(0, 30) + ' 宽 ' + Math.round(r.width) });
    if (out.problems.length > 12) break;
  }
  // 2. 巨型字号 —— 阈值按视口分档:手机(<480)h1>40/其他>34;
  //    平板(≥480)h1>52/其他>44。一刀切曾在 768 把 35px 的合理 H2 报成病。
  const phone = vw < 480;
  for (const el of document.querySelectorAll('h1,h2,h3,.v b,.val,dt.v')) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const cap = el.tagName === 'H1' ? (phone ? 40 : 52) : (phone ? 34 : 44);
    if (fs > cap) out.problems.push({ type: 'big-font', detail: el.tagName + '.' + String(el.className).slice(0, 20) + ' ' + Math.round(fs) + 'px「' + (el.textContent || '').trim().slice(0, 12) + '」' });
  }
  // 3. 页头
  const hdr = document.querySelector('.hdr');
  if (hdr) {
    const hh = hdr.getBoundingClientRect().height;
    if (hh > 140) out.problems.push({ type: 'header-tall', detail: '页头 ' + Math.round(hh) + 'px' });
    const burger = document.querySelector('.burger');
    if (!burger || getComputedStyle(burger).display === 'none')
      out.problems.push({ type: 'no-burger', detail: '汉堡未显示' });
  }
  // 4. 触控目标(页头与面板里的链接 < 40px 高即报)
  const t = document.getElementById('mnav-t'); if (t) { t.checked = true; await new Promise(r => setTimeout(r, 250)); }
  for (const a of document.querySelectorAll('.hdr .nav a')) {
    const h = a.getBoundingClientRect().height;
    if (h > 0 && h < 40) { out.problems.push({ type: 'tap-small', detail: '「' + a.textContent.trim().slice(0, 8) + '」' + Math.round(h) + 'px' }); break; }
  }
  if (t) t.checked = false;
  // 5. 图片失败
  let bad = 0; for (const i of document.images) if (i.complete && i.naturalWidth === 0 && i.getAttribute('src')) bad++;
  if (bad) out.problems.push({ type: 'img-broken', detail: bad + ' 张图 naturalWidth=0' });
  return JSON.stringify(out);
})()`;

const { result } = await send('Runtime.evaluate', { expression: AUDIT, awaitPromise: true, returnByValue: true });
console.log(result.value);
kill();
process.exit(0);
