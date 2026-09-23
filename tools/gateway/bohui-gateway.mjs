#!/usr/bin/env node
/**
 * 帛卉网关(本机版)—— OpenAI 兼容模型网关。只用 Node 内置模块,不装依赖;机制都在 core.mjs(与云版共用)。
 *
 * 创始人 2026-09-18 13:2x:「抓紧配置 AI 模型的网关,要不然总是报错」(WorkBuddy 刚吃 429 rpm exhausted);
 * 铁令:「结合几十个开源,用他们好的部分,改成我们自己的,而不是抄」—— 所以不装 new-api / one-api / litellm / OmniRoute,
 * 只吸收它们的机制(见 core.mjs 头注释与 crm/开源分析-OmniRoute-2026-09-18.md)。
 *
 * 客户端只认三个模型名(创始人 14:1x 定):
 *   bohui-chat  通用型 AI —— 带图自动改走看图链;bohui-image 出图片;bohui-video 出视频。
 *   出图 / 出视频都挂在 /v1/chat/completions 上(OpenCode / WorkBuddy 只会调它):用户发一句话 → 网关出图/出视频 →
 *   回一条 assistant 消息带本地链接;图和视频转存到 ~/.bohui-gateway/{images,videos}/<日期>/,由本网关 GET /images/... 提供
 *  (商汤 / Agnes 的临时链接 1–24 小时就失效)。原生形状 /v1/images/generations、/v1/images/edits、/v1/videos/generations 也在。
 *
 * 配置:~/.bohui-gateway/config.json —— 由 tools/gateway/sync-config.py 从 D1 providers 生成,密钥不进仓库;改了下一个请求自动重载(端口除外)。
 * 起停:tools/gateway/start-gateway.bat / stop-gateway.bat;计划任务 Bohui-Gateway 登录自启。退出码 3 = 端口被占(不重试)。
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { normalizeConfig, newState, runChain, pushHist, recordLatency, modelsView, statusView, statusHtml, tokenMatches, bearer, sseUsage,
  resolveAlias, lastUserPrompt, chatEnvelope, findMediaUrl, rewritePrompt, parseRewrite, deptGuard, COST_DEPTS } from './core.mjs';

/* 状态目录放 ~/.bohui-gateway 而不是 %LOCALAPPDATA%:Claude 桌面版是 MSIX 打包,它里面起的进程写 AppData 会被虚拟化到
   Packages\Claude_xxx\LocalCache,真实系统(计划任务、WorkBuddy、创始人的终端)看不到(2026-09-18 实测);用户根目录两边一致。 */
const DIR = process.env.BOHUI_GATEWAY_DIR || path.join(os.homedir(), '.bohui-gateway');
const PROXY_FIRST = !!process.env.BOHUI_PROXY_FIRST;   // 配了 proxy 的渠道一律先走代理(测隧道 / 直连已知不通时用)
const CFG = path.join(DIR, 'config.json');
const TOKEN_FILE = path.join(DIR, 'TOKEN.txt');
const LOG_DIR = path.join(DIR, 'logs');
const CONNECT_MS = 8_000, BODY_MAX = 32 << 20, STARTED = Date.now();
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };
fs.mkdirSync(LOG_DIR, { recursive: true });
const say = (m) => console.log(`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${m}`);
const localDay = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 配置 + 状态(常驻内存)──────────────────────────────────────── */
let cfg = normalizeConfig({}), token = '', cfgMtime = 0;
const state = newState();
function loadConfig() {
  if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(32).toString('hex') + '\n');
  token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  try { cfg = normalizeConfig(JSON.parse(fs.readFileSync(CFG, 'utf8'))); }
  catch (e) { say(`config.json 读不到(${e.message})→ 先跑 python tools/gateway/sync-config.py`); }
}
const TPL_FILE = path.join(DIR, 'render_templates.json');   // 莱诺鸟提示词模板库,sync-config.py 从 D1 导出,daily.bat 每天刷
let templates = [], tplMtime = 0;
function loadTemplates() {
  let m = 0; try { m = fs.statSync(TPL_FILE).mtimeMs; } catch { }
  if (m === tplMtime) return; tplMtime = m;
  try { templates = JSON.parse(fs.readFileSync(TPL_FILE, 'utf8')); say(`模板库已载入:${templates.length} 条`); } catch (e) { templates = []; say(`模板库读不到(${e.message}),改写用通用骨架`); }
}
function maybeReload() {   // 每个请求 stat 一次,改了就重载 —— 比 watchFile 及时,代价一个系统调用
  loadTemplates();
  let m = 0; try { m = fs.statSync(CFG).mtimeMs; } catch { }
  if (m !== cfgMtime) { cfgMtime = m; loadConfig(); say(`配置已载入:${cfg.channels.length} 个渠道,${Object.keys(cfg.aliases).length} 个别名`); }
}

/* ── 记账:内存环(供 /status)+ jsonl ───────────────────────────── */
function record({ ch, idx, ok, status, ms, alias, model, usage, error, charsRaw, chars, summarized }) {
  const now = Date.now();
  pushHist(state, { t: now, ch: ch.id, idx, ok, status, ms }, now);
  if (ok) recordLatency(state, ch, ms);
  const line = { ts: new Date(now).toISOString(), alias, provider: ch.id, model, key_idx: idx, status, ms,
    tokens_in: usage?.prompt_tokens ?? null, tokens_out: usage?.completion_tokens ?? null, chars_in_raw: charsRaw ?? null, chars_in: chars ?? null, error: error ? String(error).slice(0, 200) : null };
  fs.appendFile(path.join(LOG_DIR, `${localDay()}.jsonl`), JSON.stringify(line) + '\n', () => { });
  say(`${ok ? 'ok ' : 'ERR'} ${alias} → ${ch.id}/${model} key#${idx} ${status} ${ms}ms${usage?.prompt_tokens != null ? ` ${usage.prompt_tokens}+${usage.completion_tokens ?? 0}` : ''}${charsRaw && chars < charsRaw ? ` 压缩 ${charsRaw}→${chars}` : ''}${summarized ? ` 摘要回填 ${summarized} 条` : ''}${error ? ' ' + String(error).replace(/\s+/g, ' ').slice(0, 160) : ''}`);
}
const onFail = (f) => { record({ ...f, ok: false, usage: null }); if (f.kind && f.kind !== 'stop') say(`  ↳ 处置:${f.kind}`); };

/* ── 上游 HTTPS:先直连,连不上且渠道配了 proxy 再走 CONNECT 隧道 ───── */
function connectVia(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const p = new URL(proxy);
    const req = http.request({ host: p.hostname, port: +p.port || 80, method: 'CONNECT', path: `${host}:${port}`, headers: { host: `${host}:${port}` } });
    req.once('connect', (r, socket) => r.statusCode === 200 ? resolve(tls.connect({ socket, servername: host })) : (socket.destroy(), reject(new Error(`代理 CONNECT 返回 ${r.statusCode}`))));
    req.once('error', (e) => reject(new Error(`代理 ${p.host} 连不上:${e.message}`)));
    req.setTimeout(CONNECT_MS, () => req.destroy(new Error(`代理 ${p.host} 连接超时`)));
    req.end();
  });
}
function send(u, method, headers, body, timeoutMs, socket) {
  return new Promise((resolve, reject) => {
    let connected = false;
    const req = https.request({ host: u.hostname, port: +u.port || 443, path: u.pathname + u.search, method, headers, agent: false, servername: u.hostname,
      ...(socket ? { createConnection: () => socket } : {}) }, resolve);
    req.on('socket', (s) => {
      const t = setTimeout(() => { if (!connected) req.destroy(new Error(`连接 ${u.host} 超时 ${CONNECT_MS / 1000}s`)); }, CONNECT_MS);
      s.once('secureConnect', () => { connected = true; clearTimeout(t); });
    });
    req.once('error', (e) => reject(Object.assign(e, { preConnect: !connected })));
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${u.host} ${timeoutMs / 1000}s 无响应`)));
    req.end(body);
  });
}
const directBad = new Map();   // host → 直连失败的时刻:5 分钟内该主机代理优先,免得直连黑洞时每次白等 8 秒
async function upstream(ch, urlPath, key, payload, timeoutMs, method = 'POST') {
  const u = new URL(ch.base_url + urlPath), body = payload == null ? null : Buffer.from(JSON.stringify(payload));
  const headers = { authorization: `Bearer ${key}`, 'user-agent': 'bohui-gateway/2', ...(body ? { 'content-type': 'application/json', 'content-length': body.length } : {}) };
  const viaProxy = () => connectVia(ch.proxy, u.hostname, +u.port || 443).then((sock) => send(u, method, headers, body, timeoutMs, sock));
  let res;
  if (ch.proxy && (PROXY_FIRST || Date.now() - (directBad.get(u.host) || 0) < 300_000)) res = await viaProxy();
  else {
    try { res = await send(u, method, headers, body, timeoutMs); }
    catch (e) {
      if (!ch.proxy || !e.preConnect) throw e;
      directBad.set(u.host, Date.now());
      say(`${u.host} 直连失败(${e.message})→ 改走 ${ch.proxy},5 分钟内代理优先`);
      res = await viaProxy();
    }
  }
  const h = res.headers;
  return { status: res.statusCode, res, retryAfter: h['retry-after'] ?? h['x-ratelimit-reset-requests'] ?? h['x-ratelimit-reset'] ?? null, text: (max) => readAll(res, max) };
}
const readAll = (res, max) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  res.on('data', (c) => { n += c.length; if (n <= max) chunks.push(c); else res.destroy(); });
  res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  res.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
  res.on('error', reject);
});

/* ── 媒体转存:商汤 / Agnes 的临时链接下载到 ~/.bohui-gateway/{images,videos}/<日期>/,回本地链接 ── */
async function storeMedia(kind, src, extHint) {
  const ext = (extHint || (src.url && (src.url.match(/\.(png|jpe?g|webp|gif|mp4|webm)(\?|$)/i) || [])[1]) || (kind === 'videos' ? 'mp4' : 'png')).toLowerCase();
  const rel = `${kind}/${localDay()}/${crypto.randomBytes(6).toString('hex')}.${ext}`, file = path.join(DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let buf;
  if (src.b64) buf = Buffer.from(src.b64, 'base64');
  else { const r = await fetch(src.url, { signal: AbortSignal.timeout(180_000) }); if (!r.ok) throw new Error(`下载 ${r.status}`); buf = Buffer.from(await r.arrayBuffer()); }
  fs.writeFileSync(file, buf);
  return { rel, local: `http://127.0.0.1:${PORT}/${rel}`, bytes: buf.length };
}
async function localizeImages(j) {   // OpenAI 出图回包 data[]:url → 本地链接(original_url 保留);b64_json → 落盘并补 url
  for (const d of j?.data || []) {
    try {
      const s = await storeMedia('images', d.url ? { url: d.url } : { b64: d.b64_json });
      if (d.url) d.original_url = d.url;
      d.url = s.local;
    } catch (e) { say(`图片转存失败(保留原链接):${e.message}`); }
  }
  return j;
}
function serveMedia(res, p) {   // GET /images/<日期>/<id>.png · GET /videos/<日期>/<id>.mp4(本机,免鉴权,给客户端渲染用)
  const m = /^\/(images|videos)\/(\d{4}-\d{2}-\d{2})\/([a-f0-9]{8,16}\.(png|jpe?g|webp|gif|mp4|webm))$/i.exec(p);
  const file = m && path.join(DIR, m[1], m[2], m[3]);
  if (!file || !fs.existsSync(file)) return json(res, 404, err('没有这个文件'));
  const st = fs.statSync(file);
  res.writeHead(200, { 'content-type': MIME[m[4].toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'private, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

/* ── 转发 ─────────────────────────────────────────────────────── */
const hdrs = (hit, extra = {}) => ({ 'x-bohui-provider': hit.ch.id, 'x-bohui-key': String(hit.idx), 'x-bohui-strategy': hit.strategy || 'ordered', 'x-bohui-chars': `${hit.charsRaw}/${hit.chars}`, ...extra });
async function relayJson(res, hit, transform) {
  let text = hit.bodyText ?? await hit.r.text(64 << 20);
  let usage = null; try { const j = JSON.parse(text); usage = j.usage || null; if (transform) text = JSON.stringify(await transform(j)); } catch { }
  record({ ...hit, ok: true, status: hit.r.status, ms: Date.now() - hit.t0, usage, error: null });
  res.writeHead(hit.r.status, hdrs(hit, { 'content-type': hit.r.res.headers['content-type'] || 'application/json' }));
  res.end(text);
}
function pipeStream(res, hit) {
  const up = hit.r.res;
  res.writeHead(200, hdrs(hit, { 'content-type': up.headers['content-type'] || 'text/event-stream', 'cache-control': 'no-cache' }));
  res.flushHeaders();
  const dec = new StringDecoder('utf8'); let buf = '', usage = null, done = false;
  up.on('data', (chunk) => {   // 旁路解析,只为拿最后一个 usage;转发本身交给 pipe
    buf += dec.write(chunk); let i;
    while ((i = buf.indexOf('\n')) >= 0) { usage = sseUsage(buf.slice(0, i), usage); buf = buf.slice(i + 1); }
  });
  const finish = (error) => { if (done) return; done = true; record({ ...hit, ok: !error, status: 200, ms: Date.now() - hit.t0, usage, error }); };
  up.on('end', () => finish(null));
  up.on('error', (e) => { finish(`流中断:${e.message}`); res.end(); });
  res.on('close', () => { if (!done) { finish('客户端断开'); up.destroy(); } });
  up.pipe(res);
}
/* 对话形状的回包:一条 assistant 消息(流式就发一个 chunk + [DONE]) */
function sendEnvelope(res, alias, content, stream, hit, headersSent = false) {
  if (!headersSent) res.writeHead(200, hdrs(hit, { 'content-type': stream ? 'text/event-stream' : 'application/json; charset=utf-8', ...(stream ? { 'cache-control': 'no-cache' } : {}) }));
  res.end(chatEnvelope(alias, content, stream));
}

/* ── 提示词改写:用户一句中文 → bohui-fast 按视觉内容总监口径 + 模板库改写成英文提示词;失败就用原话,不挡出图 ── */
async function rewrite(kind, text) {
  const rw = rewritePrompt(kind, text, templates);
  if (rw.raw) return { ...rw, negative: '', note: '按你的原话,不改写', provider: null };
  let out = { prompt: text, negative: '', note: '', parsed: false }, provider = null, error = null;
  try {
    const hit = await runChain({ cfg, state, name: 'bohui-fast', kind: 'chat', body: { messages: rw.messages, max_tokens: 500, temperature: 0.4 }, compress: false,
      attempt: (ch, model, key, payload) => upstream(ch, '/chat/completions', key, payload, 90_000), onFail });
    if (hit.ok) {
      const j = JSON.parse(hit.bodyText ?? await hit.r.text(1 << 20));
      record({ ...hit, alias: `rewrite:${kind}`, ok: true, status: 200, ms: Date.now() - hit.t0, usage: j.usage || null, error: null });
      out = parseRewrite(j.choices?.[0]?.message?.content, text); provider = `${hit.ch.id}/${hit.model}`;
    } else error = hit.msg;
  } catch (e) { error = e.message; }
  if (!out.parsed) say(`提示词改写没成功,用原话:${(error || '回包没有 PROMPT 行').slice(0, 120)}`);
  fs.appendFile(path.join(LOG_DIR, `rewrites-${localDay()}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), kind, template_id: rw.template?.id ?? null, template: rw.template?.name ?? null,
    raw_text: text, prompt: out.prompt, negative: out.negative, note: out.note, parsed: out.parsed, provider, error }) + '\n', () => { });
  return { ...out, raw: false, template: rw.template, provider };
}
const rewriteNote = (rw) => (rw.raw ? '\n\n按你的原话出的(开头「原样:」)。' : `\n\n${rw.note || '我把你的描述改写成了英文提示词'}${rw.template ? `(模板「${rw.template.name}」)` : '(通用商业产品摄影骨架)'}`) +
  `\n改写后的提示词(可复制,改了再发一次就按你的来;开头写「原样:」则不改写):\n${rw.prompt}${rw.negative ? `\n负面词:${rw.negative}` : ''}`;

/* ── 出图片:对话形状(客户端选「出图片」直接说话)与原生形状共用一条链 ── */
async function chatImage(res, body, alias) {
  const { text, images } = lastUserPrompt(body), stream = body.stream === true;
  if (!text && !images.length) return json(res, 400, err('出图需要一句描述(最后一条 user 消息为空)'));
  const rw = await rewrite('image', text || '按参考图生成一张同风格的高端商业产品图');
  const gen = { prompt: rw.prompt, n: 1, size: '1024x1024', ...(images.length ? { images: images.map((u) => ({ image_url: u })) } : {}) };
  const urlPath = images.length ? '/images/edits' : '/images/generations';
  const hit = await runChain({ cfg, state, name: alias, kind: 'image', body: gen, attempt: (ch, model, key, payload) => upstream(ch, urlPath, key, payload, 240_000), onFail });
  if (!hit.ok) return json(res, hit.status, err(hit.msg, 'upstream_error'));
  let j; try { j = JSON.parse(await hit.r.text(64 << 20)); } catch (e) { return json(res, 502, err(`出图回包不是 JSON:${e.message}`, 'upstream_error')); }
  record({ ...hit, ok: true, status: hit.r.status, ms: Date.now() - hit.t0, usage: null, error: null });
  await localizeImages(j);
  const links = (j.data || []).map((d) => d.url).filter(Boolean);
  if (!links.length) return json(res, 502, err(`出图回包里没有图片:${JSON.stringify(j).slice(0, 200)}`, 'upstream_error'));
  const content = links.map((u) => `![出图](${u})`).join('\n') + `\n\n${links.join('\n')}` + rewriteNote(rw) +
    `\n\n模型 ${hit.model}${images.length ? ` · 参考图 ${images.length} 张(走改图)` : ''} · 图存在本机 ~/.bohui-gateway/images/`;
  sendEnvelope(res, alias, content, stream, hit);
}

/* ── 出视频:Agnes POST /video/generations 受理 → GET /videos/{id} 轮询 → 转存 mp4 → 回本地链接 ──
   接口真相(2026-09-18 实测):受理体 {id: task_…, status: queued};完成体 {status: completed, url: …mp4};
   agnes-video-v2.0 直接受理(71 秒出 5 秒 1088x832);agnes-video-2.5-flash 另要 mode 参数(值未知,免费额度秒 429)。 */
async function chatVideo(res, body, alias) {
  const { text } = lastUserPrompt(body), stream = body.stream === true;
  if (!text) return json(res, 400, err('出视频需要一句描述(最后一条 user 消息为空)'));
  const rw = await rewrite('video', text);
  const hit = await runChain({ cfg, state, name: alias, kind: 'video', body: { prompt: rw.prompt, ...(rw.negative ? { negative_prompt: rw.negative } : {}) }, attempt: (ch, model, key, payload) => upstream(ch, '/video/generations', key, payload, 120_000), onFail });
  if (!hit.ok) return json(res, hit.status, err(hit.msg, 'upstream_error'));
  let task; try { task = JSON.parse(await hit.r.text(1 << 20)); } catch (e) { return json(res, 502, err(`视频受理回包不是 JSON:${e.message}`, 'upstream_error')); }
  const id = task.id || task.task_id;
  record({ ...hit, ok: true, status: hit.r.status, ms: Date.now() - hit.t0, usage: null, error: null });
  say(`视频任务受理 ${id} (${hit.ch.id}/${hit.model})`);
  if (stream) { res.writeHead(200, hdrs(hit, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })); res.flushHeaders(); }
  const key = hit.ch.keys[hit.idx]; let final = null, lastErr = '';
  for (let i = 0; i < 75 && !final; i++) {   // 最多 ~10 分钟;流式期间发 SSE 注释保活并报进度
    await sleep(8_000);
    try {
      const r = await upstream(hit.ch, `/videos/${id}`, key, null, 30_000, 'GET'); const j = JSON.parse(await r.text(1 << 20));
      const st = j.status || j.data?.status || '';
      if (stream) res.write(`: 生成中 ${st} ${j.progress ?? ''}%\n\n`);
      if (/completed|succeed|success|done/i.test(st)) final = j;
      else if (/fail|error|cancel/i.test(st) || j.error) { lastErr = `任务失败:${JSON.stringify(j.error || j).slice(0, 200)}`; break; }
    } catch (e) { lastErr = e.message; }
  }
  if (!final) { const msg = `视频任务 ${id} 未完成:${lastErr || '超过 10 分钟'}`; say(msg); return stream ? sendEnvelope(res, alias, msg, true, hit, true) : json(res, 504, err(msg, 'upstream_error')); }
  const url = findMediaUrl(final);
  let saved = null; if (url) { try { saved = await storeMedia('videos', { url }, 'mp4'); } catch (e) { say(`视频转存失败(保留原链接):${e.message}`); } }
  const content = `视频已生成(${final.seconds || ''}s · ${final.size || ''} · ${hit.model}):\n${saved?.local || url || '(回包里没有链接)'}` +
    `${saved ? `\n\n原始链接(会过期):${url}\n本机文件:~/.bohui-gateway/${saved.rel}` : ''}` + rewriteNote(rw);
  sendEnvelope(res, alias, content, stream, hit, stream);
}

/* ── HTTP 入口 ────────────────────────────────────────────────── */
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const err = (message, code = 'invalid_request_error') => ({ error: { message, type: code, code } });
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > BODY_MAX) { reject(new Error('请求体超过 32MB')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
const view = () => statusView(cfg, state, Date.now(), { where: `127.0.0.1:${PORT} · pid ${process.pid}`, port: PORT, pid: process.pid, up_s: Math.round((Date.now() - STARTED) / 1000), config: CFG });
async function handle(req, res) {
  const [p0, qs = ''] = (req.url || '/').split('?'); const p = p0.replace(/\/+$/, '') || '/';
  try {
    maybeReload();
    if (req.method === 'GET' && p === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(statusHtml(view())); }
    if (req.method === 'GET' && (p === '/status' || p === '/health')) return json(res, 200, view());
    if (req.method === 'GET' && /^\/(images|videos)\//.test(p)) return serveMedia(res, p);
    if (!tokenMatches(bearer(req.headers.authorization), token)) return json(res, 401, err(`令牌不对或没带:Authorization: Bearer <${TOKEN_FILE} 里的令牌>`, 'unauthorized'));
    if (req.method === 'GET' && p === '/v1/models') return json(res, 200, modelsView(cfg, /(^|&)all=1/.test(qs)));
    if (req.method === 'GET' && /^\/v1\/videos\/[\w-]+$/.test(p)) {   // 轮询视频任务:走出视频链的第一家、第一把没冷却的 key
      const [chId] = cfg.aliases['bohui-video']?.chain[0] || [], ch = cfg.byId.get(chId);
      if (!ch) return json(res, 404, err('没有配置视频渠道'));
      const r = await upstream(ch, p.slice(3), ch.keys[0], null, 30_000, 'GET');
      res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'x-bohui-provider': ch.id }); return res.end(await r.text(1 << 20));
    }
    if (req.method !== 'POST') return json(res, 404, err(`没有 ${req.method} ${p}`));
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, err(`请求体不是 JSON:${e.message}`)); }
    const isChat = p === '/v1/chat/completions', isImage = p === '/v1/images/generations' || p === '/v1/images/edits', isVideo = p === '/v1/videos/generations' || p === '/v1/video/generations';
    if (!isChat && !isImage && !isVideo) return json(res, 404, err(`没有 ${p} 这个路径;有的是 /v1/chat/completions /v1/images/generations /v1/images/edits /v1/videos/generations /v1/models /status`));
    const name = String(body.model || (isChat ? 'bohui-chat' : isImage ? 'bohui-image' : 'bohui-video'));
    const aliasKind = cfg.aliases[resolveAlias(cfg, name) || '']?.kind;
    if (isChat && aliasKind === 'image') return chatImage(res, body, name);   // 客户端选「出图片」直接说话
    if (isChat && aliasKind === 'video') return chatVideo(res, body, name);   // 客户端选「出视频」直接说话
    const kind = isChat ? 'chat' : isImage ? 'image' : 'video';
    const urlPath = isChat ? '/chat/completions' : isVideo ? '/video/generations' : p.slice(3), timeoutMs = isChat ? 100_000 : 240_000;   // 09-21:对话 180s → 100s(Agnes 正常 15–40s,超 100s 就该换家)
    if (isChat && cfg.dump_dir) {   // 排查用:config.json 写 dump_dir 就把每个对话请求体落盘(看 13 万 tokens 从哪来),看完删掉字段
      try { fs.mkdirSync(cfg.dump_dir, { recursive: true }); fs.writeFileSync(path.join(cfg.dump_dir, `${Date.now()}-${name}.json`), JSON.stringify(body)); } catch {}
    }
    if (isChat) body = deptGuard(body, req.headers['x-bohui-dept'], cfg.cost_depts || COST_DEPTS);   // 部门守则:非研发/财务/管理层不给成本(15:5x)
    const hit = await runChain({ cfg, state, name, kind, body, attempt: (ch, model, key, payload) => upstream(ch, urlPath, key, payload, timeoutMs), onFail });
    if (!hit.ok) return json(res, hit.status, err(hit.msg, hit.status === 404 ? 'model_not_found' : 'upstream_error'));
    if (isChat && body.stream === true) return pipeStream(res, hit);
    if (isImage) return relayJson(res, hit, localizeImages);
    if (isVideo) return relayJson(res, hit, (j) => ({ ...j, poll: `/v1/videos/${j.id || j.task_id}` }));
    return relayJson(res, hit);
  } catch (e) {
    say(`处理 ${p} 出错:${e.stack || e}`);
    if (!res.headersSent) json(res, 500, err(String(e.message || e), 'gateway_error')); else res.end();
  }
}

/* ── 启动 ─────────────────────────────────────────────────────── */
maybeReload();
const PORT = Number(process.env.BOHUI_GATEWAY_PORT || cfg.port || 8787);
const server = http.createServer(handle);
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { say(`端口 ${PORT} 被占(另一个网关实例?或 new-api)→ 退出码 3,不循环重试`); process.exit(3); }
  say(`监听失败:${e.message}`); process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  fs.writeFileSync(path.join(DIR, 'gateway.pid'), `${process.pid}\n`);
  say(`帛卉网关 http://127.0.0.1:${PORT}  渠道 ${cfg.channels.length}  令牌 ${TOKEN_FILE}(前 6 位 ${token.slice(0, 6)})`);
});
process.on('uncaughtException', (e) => say(`uncaught:${e.stack || e}`));       // 单个请求的意外别拖死整个网关
process.on('unhandledRejection', (e) => say(`unhandled:${e?.stack || e}`));
