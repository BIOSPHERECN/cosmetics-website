#!/usr/bin/env node
/**
 * 帛卉网关自检。两部分:
 *   ① core.mjs 机制(不发网络):路由策略 / 加权轮询 / 冷却与 retry-after / 失败三分类 / 空 2xx / 质量 EWMA / 压缩 / 带图改走 vision / 三项菜单;
 *   ② 对着正在跑的网关走真实 HTTP:鉴权 / 非流式 / 流式 / 带图自动看图 / key 轮询 / 错 key 自动切换(临时改 config.json 一位,跑完复原)/ 压缩生效。
 *
 *   node tools/gateway/smoke.mjs                                   # 本机版(~/.bohui-gateway/config.json 里的端口)
 *   node tools/gateway/smoke.mjs https://gateway.biosphere-ai.com   # 云版(跳过改 config 那一条)
 *   node tools/gateway/smoke.mjs --core                             # 只跑 ①
 * 只用 Node 内置 fetch。任一条不过退出码 1。出图 / 出视频不在这里跑(花额度),见 README 的手工验证。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as core from './core.mjs';

const fails = [];
const ok = (label, cond, extra = '') => { console.log(`  ${cond ? '✓' : '★'} ${label.padEnd(30)}${extra}`); if (!cond) fails.push(label); };

/* ── ① 核心机制 ─────────────────────────────────────────────────── */
console.log('core.mjs');
{
  const cfg = core.normalizeConfig({ channels: [
    { id: 'a', label: 'A', base_url: 'https://token.sensenova.cn/v1', model: 'glm-5.2', keys: ['k1', 'k2'], tier: 5, can_text: 1, weight: 3 },
    { id: 'b', label: 'B', base_url: 'https://token.sensenova.cn/v1', model: 'deepseek-v4-flash', keys: ['k3'], tier: 7, can_text: 1 },
    { id: 'c', label: 'C', base_url: 'https://apihub.agnes-ai.cn/v1', model: 'agnes-3.0-flash', keys: ['k4'], tier: 1, can_text: 1, ctx: 512000 },
    { id: 'v', label: 'V', base_url: 'https://token.sensenova.cn/v1', model: 'kimi-k3', keys: ['k5'], tier: 7, can_text: 1, can_vision: 1 }],
    aliases: { rr: { strategy: 'round-robin', chain: [['a', 'glm-5.2'], ['b', 'deepseek-v4-flash'], ['c', 'agnes-3.0-flash']] },
      lc: { strategy: 'longest-context', chain: [['a', 'glm-5.2'], ['c', 'agnes-3.0-flash']] },
      ll: { strategy: 'least-latency', chain: [['a', 'glm-5.2'], ['b', 'deepseek-v4-flash'], ['c', 'agnes-3.0-flash']] },
      od: [['b', 'deepseek-v4-flash'], ['a', 'glm-5.2']],
      see: { chain: [['v', 'kimi-k3']] }, gen: { strategy: 'ordered', vision: 'see', chain: [['a', 'glm-5.2']] } } });
  const st = core.newState(), now = Date.now();
  const first = (name, body = {}) => core.orderCandidates(cfg, name, 'chat', st, body, now).cands.map((x) => x.ch.id).join(' ');
  ok('ordered 按序', first('od') === 'b a');
  ok('round-robin 加权环 a a a b c', Array.from({ length: 5 }, () => first('rr').split(' ')[0]).join(' ') === 'a a a b c');
  core.recordLatency(st, cfg.byId.get('a'), 900); core.recordLatency(st, cfg.byId.get('b'), 300);
  ok('least-latency 无数据先试再按均值', first('ll') === 'c b a');
  core.recordLatency(st, cfg.byId.get('c'), 5000);
  ok('least-latency 有数据后 b<a<c', first('ll') === 'b a c');
  core.recordLatency(st, cfg.byId.get('a'), 300); core.recordLatency(st, cfg.byId.get('a'), 300);   // a 均 500 与 b 300 同档(500ms 分档)→ 看质量
  core.updateQuality(st, cfg.byId.get('a'), 1); core.updateQuality(st, cfg.byId.get('b'), 0);
  ok('least-latency 同档按质量 EWMA', first('ll') === 'a b c', first('ll'));
  core.cool(cfg.byId.get('a'), 0, 'x', st, now); core.cool(cfg.byId.get('a'), 1, 'x', st, now);
  ok('least-latency 冷却者垫底', first('ll') === 'b c a');
  ok('longest-context 大请求只剩 c', first('lc', { messages: [{ role: 'user', content: 'x'.repeat(800_000) }] }) === 'c' && first('lc', { messages: [{ role: 'user', content: 'hi' }] }) === 'c a');
  ok('冷却 60→120→…→900 封顶;限流 20s 起', [1, 2, 5, 9].map((n) => core.coolMs(n)).join() === '60000,120000,900000,900000' && core.coolMs(1, '429 rpm') === 20000);
  ok('retry-after 四种格式', core.parseRetryAfterMs('30', now) === 30000 && core.parseRetryAfterMs('1h2m3s', now) === 3723000 && Math.abs(core.parseRetryAfterMs(String(Math.floor(now / 1000) + 90), now) - 90000) < 1500 && Math.abs(core.parseRetryAfterMs(new Date(now + 120000).toUTCString(), now) - 120000) < 1500);
  { const s2 = core.newState(); core.cool(cfg.byId.get('b'), 0, '429', s2, now, 7000); ok('cool 优先用 retry-after', s2.keys['b#0'].until - now === 7000); }
  ok('失败三分类', ['key', 'channel', 'channel', 'model', 'stop', 'nolock', 'key', 'stop'].join() === [core.classify(429, ''), core.classify(402, ''), core.classify(200, 'quota exhausted'), core.classify(404, 'model not found'), core.classify(404, ''), core.classify(403, 'invalid api key'), core.classify(500, ''), core.classify(400, '')].join());
  { const s3 = core.newState(); core.lockChannel(cfg.byId.get('b'), '402', s3, now); core.lockModel(cfg.byId.get('a'), 'glm-5.2', s3);
    ok('额度尽锁整渠道到次日 0 点;无此模型永久跳过', core.channelDown(cfg.byId.get('b'), s3, now) && s3.chDown.b.until > now && !core.hasFreeKey(cfg.byId.get('b'), s3, now) && core.orderCandidates(cfg, 'od', 'chat', s3, {}, now).cands.map((x) => x.ch.id).join() === 'b'); }   // a 因「无此模型」被剔除;b 留在候选但 runChain 会跳过
  ok('空 2xx 判定(length 截断不算)', core.emptyCompletion(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })) && !core.emptyCompletion(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })) && !core.emptyCompletion(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{}] } }] })));
  { const s4 = core.newState(); for (const x of [1, 1, 0.5, 0]) core.updateQuality(s4, cfg.byId.get('a'), x); ok('质量 EWMA α=0.2 + 收缩', Math.abs(s4.q.a.e - 0.72) < 1e-6 && core.quality(s4, cfg.byId.get('a')) === 0.518); }
  ok('别名后缀 -cloud/-local', core.resolveAlias(cfg, 'rr-cloud') === 'rr' && core.resolveAlias(cfg, 'rr-local') === 'rr' && core.resolveAlias(cfg, 'nope') === null);
  ok('对话别名不能拿去出图', core.orderCandidates(cfg, 'rr', 'image', st, {}, now).cands.length === 0);
  const img = { messages: [{ role: 'user', content: [{ type: 'text', text: '这是什么' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] };
  ok('带图自动改走 vision 链', core.orderCandidates(cfg, 'gen', 'chat', st, img, now).alias === 'see' && first('gen') === 'a');
  ok('/v1/models 默认只列非 hidden 的别名', core.modelsView(core.normalizeConfig({})).data.map((m) => `${m.id}=${m.name}`).join() === 'bohui-chat=通用型 AI,bohui-image=出图片,bohui-video=出视频' && core.modelsView(core.normalizeConfig({}), true).data.length > 3);
  const big = JSON.stringify({ items: Array.from({ length: 50 }, (_, i) => ({ i, name: 'item' + i, extra: 'x'.repeat(60) })), meta: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, i])) });
  const r = core.compressBody({ model: 'm', messages: [{ role: 'system', content: 'a  b   \n\n\n\nc  ' }, { role: 'tool', tool_call_id: '1', content: big }, { role: 'user', content: '最后   一条\n\n\n\n' }] });
  const t = JSON.parse(r.body.messages[1].content);
  ok('压缩:工具 JSON 数组留 5+2、对象留 20 键', t.items.length === 8 && String(t.items[5]).startsWith('…省略') && Object.keys(t.meta).length === 21 && '_remaining_10_keys' in t.meta, `${r.charsRaw}→${r.chars}`);
  ok('压缩:空白折叠 / 最后 user 不动 / 代码缩进保留', r.body.messages[0].content === 'a b\n\nc' && r.body.messages[2].content === '最后   一条\n\n\n\n' && core.tidy('def f():\n    return 1  \n\n\n\nx = 1') === 'def f():\n    return 1\n\nx = 1');
  ok('lastUserPrompt 取文本与参考图', (() => { const q = core.lastUserPrompt(img); return q.text === '这是什么' && q.images.length === 1; })());
  ok('chatEnvelope 两种形状', JSON.parse(core.chatEnvelope('m', 'hi', false)).choices[0].message.content === 'hi' && core.chatEnvelope('m', 'hi', true).endsWith('data: [DONE]\n\n'));
  ok('findMediaUrl 挑 mp4', core.findMediaUrl({ a: { url: 'https://x/y.mp4?e=1' }, b: 'https://x/z' }) === 'https://x/y.mp4?e=1');
  ok('令牌定长比较', core.tokenMatches('abc', 'abc') && !core.tokenMatches('abc', 'abd') && !core.tokenMatches('', ''));
}
if (process.argv.includes('--core')) { console.log(fails.length ? `\n${fails.length} 处不过:${fails.join(' / ')}` : '\n核心全部通过'); process.exit(fails.length ? 1 : 0); }

/* ── ② 真实 HTTP ────────────────────────────────────────────────── */
const DIR = process.env.BOHUI_GATEWAY_DIR || path.join(os.homedir(), '.bohui-gateway');
const CFG = path.join(DIR, 'config.json');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const BASE = (process.argv.find((a) => a.startsWith('http')) || `http://127.0.0.1:${cfg.port || 8787}`).replace(/\/+$/, '');
const isLocal = BASE.includes('127.0.0.1');
const TOKEN = fs.readFileSync(path.join(DIR, 'TOKEN.txt'), 'utf8').trim();
const H = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };
const chat = (body) => fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
const status = async () => (await fetch(`${BASE}/status`)).json();

console.log(`\n网关 ${BASE}`);
{ const r = await fetch(`${BASE}/v1/models`, { headers: H }); const j = await r.json(); ok('GET /v1/models 三项菜单', r.status === 200 && j.data?.map((m) => m.id).join() === 'bohui-chat,bohui-image,bohui-video', j.data?.map((m) => m.name).join(' / ')); }
{ const r = await fetch(`${BASE}/v1/models`); ok('不带令牌 → 401', r.status === 401); }
{
  const t0 = Date.now(); const r = await chat({ model: 'bohui-chat', messages: [{ role: 'user', content: '只回复 OK' }], max_tokens: 20 });
  const j = await r.json().catch(() => ({})); const text = j.choices?.[0]?.message?.content ?? '';
  ok('通用型 非流式', r.status === 200 && text.trim().length > 0, `${Date.now() - t0}ms · ${r.headers.get('x-bohui-provider')} key#${r.headers.get('x-bohui-key')} · 策略 ${r.headers.get('x-bohui-strategy')} · ${text.slice(0, 30)}`);
  ok('通用型 策略 least-latency', r.headers.get('x-bohui-strategy') === 'least-latency');
}
{
  const r = await chat({ model: 'bohui-chat', stream: true, messages: [{ role: 'user', content: '数到 3' }], max_tokens: 40 });
  const text = await r.text(); const n = (text.match(/^data: /gm) || []).length;
  ok('通用型 stream:true', r.status === 200 && n > 1 && text.includes('data: [DONE]'), `${n} 个 data: 块${text.includes('"usage"') ? ',末块带 usage' : ''}`);
}
{
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  const r = await chat({ model: 'bohui-chat', max_tokens: 30, messages: [{ role: 'user', content: [{ type: 'text', text: '只回复 OK' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }] }] });
  await r.text(); const vision = (cfg.aliases?.['bohui-vision']?.chain || core.DEFAULT_ALIASES['bohui-vision'].chain).map(([id]) => id);
  ok('通用型带图 → 自动走看图链', r.status === 200 && vision.includes(r.headers.get('x-bohui-provider')), `${r.headers.get('x-bohui-provider')}`);
}
{
  const big = JSON.stringify({ rows: Array.from({ length: 60 }, (_, i) => ({ i, sku: 'SKU' + i, note: 'x'.repeat(50) })) });
  const r = await chat({ model: 'bohui-chat', messages: [{ role: 'user', content: '查库存' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'stock', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: big }, { role: 'user', content: '只回复 OK' }], max_tokens: 10 });
  await r.text(); const [raw, out] = (r.headers.get('x-bohui-chars') || '0/0').split('/').map(Number);
  ok('压缩层生效(工具结果 JSON)', r.status === 200 && out < raw, `${raw} → ${out} 字符`);
}
{
  const seen = new Set(); let allOk = true;
  for (let i = 0; i < 6; i++) { const r = await chat({ model: 'bohui-fast', messages: [{ role: 'user', content: '只回复 OK' }], max_tokens: 10 }); allOk &&= r.status === 200; seen.add(`${r.headers.get('x-bohui-provider')}#${r.headers.get('x-bohui-key')}`); await r.text(); }
  ok('bohui-fast ×6 轮询(round-robin)', allOk && seen.size > 1, [...seen].join(' '));
}
if (isLocal) {
  // 把 bohui-chat 某渠道下一把要轮到的 key 改错一位:请求仍应 200,且 /status 里那把 key 变 cooling;然后复原
  const st = await status(); const chId = st.aliases['bohui-chat'].chain[0][0];
  const raw = fs.readFileSync(CFG, 'utf8'); const c = JSON.parse(raw); const ch = c.channels.find((x) => x.id === chId);
  const idx = (st.channels.find((x) => x.id === chId).keys.filter((k) => k.state === 'ok').at(-1) || { idx: 0 }).idx;
  const good = ch.keys[idx]; ch.keys[idx] = good.slice(0, -1) + (good.at(-1) === 'A' ? 'B' : 'A');
  fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
  try {
    let hit = null;
    for (let i = 0; i < ch.keys.length + 1 && !hit; i++) { const r = await chat({ model: 'bohui-chat', messages: [{ role: 'user', content: '只回复 OK' }], max_tokens: 10 }); await r.text(); if (r.status !== 200) { hit = 'HTTP ' + r.status; break; } const k = (await status()).channels.find((x) => x.id === chId).keys[idx]; if (k.state === 'cooling') hit = `${chId} key#${idx} cooling 至 ${k.until_local}`; }
    ok('错 key 自动切换 + 冷却', !!hit && !hit.startsWith('HTTP'), hit || '没轮到那把 key(策略把该渠道排后了),不算失败');
    if (!hit) fails.pop();
  } finally { fs.writeFileSync(CFG, raw); }
} else console.log('  · 云版跳过「改 config 错 key」一条(config 在 KV 里)');
{ const s = await status(); ok('/status 有压缩累计、策略、质量', typeof s.compress?.saved_pct === 'number' && s.aliases['bohui-fast'].strategy === 'round-robin' && 'quality' in s.channels[0], `累计节省 ${s.compress.saved_pct}% · 近 1 小时 ${s.h1.total} 次`); }
console.log(fails.length ? `\n${fails.length} 处不过:${fails.join(' / ')}` : '\n全部通过');
process.exit(fails.length ? 1 : 0);
