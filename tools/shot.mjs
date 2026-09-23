/**
 * 无头 Chrome 截图 —— 视觉验证的自备通道。
 *
 * 为什么要自备:自带浏览器的策略服务和 Chrome 插件桥这两条 MCP 通道
 * 同一天先后故障,视觉验证被卡死。而创始人机器上本来就有 Chrome
 * (便携版,D:\ie\Chrome)。直接用 CDP 驱动一个独立无头实例:
 * 不碰他正开着的浏览器窗口,不依赖任何扩展或平台服务。
 *
 * 用法:
 *   node tools/shot.mjs <url> <out.png> [css选择器]
 *   给选择器就精确裁那一段(全页坐标),不给就截首屏 1280×900。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'D:/ie/Chrome/App/chrome.exe';
const [url, out, selector, widthArg] = process.argv.slice(2);
if (!url || !out) { console.error('用法: node tools/shot.mjs <url> <out.png> [selector] [宽度=1280]'); process.exit(1); }
/* 宽度可指定:创始人是缩放/窄窗看的,1280 一个口径会漏掉他那档的排版病 */
const W = Math.max(320, parseInt(widthArg, 10) || 1280);

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));

/* 独立无头实例:独立 profile + 独立端口,和创始人开着的 Chrome 互不打扰 */
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--window-size=${W},900`, '--proxy-server=127.0.0.1:1082', 'about:blank',
], { stdio: 'ignore' });

const kill = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', kill);

/* 等调试端口就绪 */
let target = null;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (r.ok) { target = await r.json(); break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
if (!target) { console.error('Chrome 调试端口没起来'); kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  } else if (m.method) events.push(m.method);
};
await new Promise((r) => { ws.onopen = r; });

await send('Page.enable');
/* --window-size 对 /json/new 开出的新 target 不生效(实测始终 1280),
   视口宽度用设备仿真压下去才可靠 */
if (W !== 1280) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 768 });
}
/* 等加载 + 静置一秒让懒加载图进来 */
for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 150));
await new Promise((r) => setTimeout(r, 1200));

/* ★ 懒加载驱动:captureBeyondViewport 不滚动页面,折叠线以下的
   loading="lazy" 图永远不触发 —— 全页截图里就是一排排空色块。
   这个假警报骗过我两轮验收(证书墙、车间第二排、商品卡全被当成缺图)。
   截图前先分屏滚到底再回顶,让 IntersectionObserver 把图都拉进来。 */
await send('Runtime.evaluate', {
  awaitPromise: true,
  expression: `(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 800) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    scrollTo(0, 0);
    await Promise.all([...document.images].filter(i => !i.complete)
      .map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 15000); })));
  })()`,
});
await new Promise((r) => setTimeout(r, 400));

/* 第 5 个参数:截图前在页面里执行的 JS(如点开汉堡菜单再拍)。
   例:node tools/shot.mjs URL out.png "" 375 "document.getElementById('mnav-t').click()" */
const PRE = process.argv[6];
if (PRE) {
  const r = await send('Runtime.evaluate', { expression: PRE, awaitPromise: true, returnByValue: true });
  if (r?.result?.value !== undefined) console.log('[pre]', typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
  await new Promise((rs) => setTimeout(rs, 600));
}

let clip;
if (selector) {
  const { result } = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null; el.scrollIntoView(); const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`,
  });
  if (!result.value) { console.error(`选择器没匹配到:${selector}`); kill(); process.exit(1); }
  const v = result.value;
  clip = { x: Math.max(0, v.x), y: Math.max(0, v.y), width: Math.min(v.w, W), height: Math.min(v.h, 24000), scale: 1 };
  /* 懒加载:滚到位后再等一拍 */
  await new Promise((r) => setTimeout(r, 800));
}

const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}),
});
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`${out}  ${clip ? `${Math.round(clip.width)}x${Math.round(clip.height)} @${Math.round(clip.y)}px` : '首屏'}`);
kill();
process.exit(0);
