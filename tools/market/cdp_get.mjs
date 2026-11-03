// cdp-get.mjs <url> [waitMs] [mode:text|links|html]  — 用 9222 那个抓取实例(WorkBuddy 的 Chrome)开新标签取页面,用完关标签
import WebSocket from "file:///F:/0cosmetic/_openwork-src/node_modules/.pnpm/ws@8.21.0/node_modules/ws/index.js";
const [url, waitMs = "6000", mode = "text"] = process.argv.slice(2);
const port = process.env.CDP_PORT || "9222";
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.on("message", (m) => { const j = JSON.parse(m); if (j.id && pending.has(j.id)) { const p = pending.get(j.id); pending.delete(j.id); j.error ? p.rej(new Error(j.error.message)) : p.res(j.result); } });
await new Promise((r) => ws.on("open", r));
await call("Page.enable");
await new Promise((r) => setTimeout(r, Number(waitMs)));
const expr = mode === "links"
  ? `JSON.stringify({title:document.title,url:location.href,links:[...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href))].slice(0,400)})`
  : mode === "html" ? `JSON.stringify({title:document.title,url:location.href,html:document.documentElement.outerHTML.slice(0,200000)})`
  : `JSON.stringify({title:document.title,url:location.href,text:document.body.innerText.slice(0,6000)})`;
const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true });
process.stdout.write(r.result.value + "\n");
await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
ws.close();
