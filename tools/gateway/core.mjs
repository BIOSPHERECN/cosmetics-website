/**
 * 帛卉网关核心 —— 本机版(bohui-gateway.mjs)与云版(worker/src/index.mjs)共用。
 * 纯 JS,不 import 任何 Node / Worker 专有模块;状态是一个普通对象(newState()),
 * 本机版常驻内存,云版每次请求从 KV 读、结束写回。
 *
 * 这里放的是「机制」:别名 → 候选链的路由策略、key 池轮询与冷却、请求前压缩、请求整形、状态视图。
 * 「怎么发 HTTP、怎么转发流」留在两边各自的入口文件。
 *
 * 2026-09-18 第二轮(创始人转发 OmniRoute 文章,铁令仍是「吸收机制改成自己的,不抄」):
 *   压缩层、四种路由策略、渠道权重、云版共用核心。
 */

/* ── 别名表 ─────────────────────────────────────────────────────────
   strategy:ordered(按序兜底)| least-latency(最近 20 次成功平均耗时最低者先)|
           longest-context(按渠道 ctx 上限降序,估算 tokens 超上限的跳过)| round-robin(按 weight 加权轮询)
   compress:请求前压缩,默认开;config.json 的 aliases 可覆盖(值写成数组即 ordered)。 */
/* 创始人 2026-09-18 14:1x 定:客户端模型菜单只三项(15:5x 定名)—— 帛卉通用模型 / 帛卉图片模型 / 帛卉视频模型(name 就是显示名);
   fast / reason / vision 留给脚本和后台(hidden,/v1/models 默认不列)。通用型带图时自动改走 vision 链(vision 字段)。 */
export const DEFAULT_ALIASES = {
  /* 09-21 09:4x:网关调用方(WorkBuddy / Marvis)一天 1.5 亿 token,把商汤日额度上午吃光 → 网关走 Agnes 优先、商汤只兜底;商汤留给员工电脑端(它自带 key 环,不经网关)。strategy 改 ordered,免得 least-latency 又把商汤排前面 */
  'bohui-chat':   { name: '帛卉通用模型', strategy: 'ordered', vision: 'bohui-vision', chain: [['agnes-30flash-cn', 'agnes-3.0-flash'], ['agnes-30flash', 'agnes-3.0-flash'], ['sensenova-dsflash', 'deepseek-v4-flash'], ['sensenova', 'glm-5.2']] },
  'bohui-image':  { name: '帛卉图片模型', strategy: 'ordered', kind: 'image', chain: [['sensenova-u15', 'sensenova-u1.5-lite'], ['agnes-image', 'agnes-image-2.5-flash']] },
  'bohui-video':  { name: '帛卉视频模型', strategy: 'ordered', kind: 'video', chain: [['agnes-video', 'agnes-video-v2.0']] },   // 2.5-flash 还要 mode 参数,值待 Agnes 文档;v2.0 直接受理
  'bohui-fast':   { hidden: true, strategy: 'ordered', vision: 'bohui-vision', chain: [['agnes-30flash-cn', 'agnes-3.0-flash'], ['sensenova-dsflash', 'deepseek-v4-flash'], ['sensenova-68', 'sensenova-6.8-flash-lite']] },
  'bohui-reason': { hidden: true, strategy: 'ordered', vision: 'bohui-vision', chain: [['sensenova-ds', 'deepseek-v4-pro'], ['sensenova', 'glm-5.2']] },
  'bohui-vision': { hidden: true, strategy: 'ordered', chain: [['sensenova-kimi', 'kimi-k3'], ['sensenova-68', 'sensenova-6.8-flash-lite'], ['agnes-30flash-cn', 'agnes-3.0-flash']] },
};
/* 上下文上限(tokens)。D1 providers 没这一列,先按各家文档口径估;config.json 渠道里写 ctx 可覆盖。 */
export const CTX_BY_MODEL = {
  'agnes-3.0-flash': 512_000, 'agnes-2.5-pro': 128_000, 'agnes-2.5-flash': 128_000, 'agnes-2.0-flash': 128_000,
  'glm-5.2': 128_000, 'deepseek-v4-pro': 128_000, 'deepseek-v4-flash': 128_000, 'kimi-k3': 256_000, 'sensenova-6.8-flash-lite': 32_000,
};
export const STRATEGIES = ['ordered', 'least-latency', 'longest-context', 'round-robin'];
export const COOL_BASE = 60_000, COOL_MAX = 15 * 60_000, LAT_WINDOW = 20, HIST_MAX = 600;
/* 换把 key 有意义的状态码:限流 / 额度尽 / 被拒 / key 错 / 上游挂;400、404 换 key 没用,直接换下一家 */
export const retryable = (s) => s === 429 || s === 402 || s === 403 || s === 401 || s >= 500;
export const coolMs = (strikes, why = '') => Math.min((/429|rpm|tpm|rate/i.test(String(why)) ? 20_000 : COOL_BASE) * 2 ** (strikes - 1), COOL_MAX);   // 09-18:限流类 20s 起步,别把整渠道锁死一分钟
/* ① 上游 retry-after 优先(秒 / 1h2m3s / epoch 秒或毫秒 / HTTP 日期):限流窗口按上游说的来,没有才走上面的规则 */
export function parseRetryAfterMs(v, now = Date.now()) {
  const s = String(v ?? '').trim(); if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n > 1e12 ? n - now : n > 1e9 ? n * 1000 - now : n * 1000; }
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(s);
  if (m && (m[1] || m[2] || m[3])) return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000;
  const t = Date.parse(s); return Number.isNaN(t) ? 0 : t - now;
}
/* ② 失败三分类:key(换下一把,冷却)| channel(整渠道跳过,锁到北京时间次日 0 点)| model(该渠道对该模型永久跳过)| nolock(换下一把但不冷却)| stop(换下一家) */
const QUOTA_RE = /quota (?:exhausted|exceeded)|entitlement exhausted|plan (?:exhausted|exceeded)|insufficient[_ ]?(?:balance|quota)|today'?s quota|daily (?:quota|limit)|余额不足|额度(?:已)?用(?:尽|完)|今日额度|欠费|arrears/i;
const NOMODEL_RE = /model|不存在|does not exist|not (?:found|exist)|unknown/i;
const DAILY_RE = /today|daily|per day|今日|每日|当日/i;
export function classify(status, text = '') {
  // 429 只有明说「今日/每日额度」才锁整天;分钟级配额(如 Gemini「quota exceeded … per minute」)仍按限流换 key
  if (status === 402 || (QUOTA_RE.test(text) && (status !== 429 || DAILY_RE.test(text)))) return 'channel';
  if (status === 404 && NOMODEL_RE.test(text)) return 'model';
  if (status === 403 && /api[-_ ]?key|apikey|permission|not allowed|无权/i.test(text)) return 'nolock';
  if (status === 429 || status === 401 || status === 403 || status >= 500 || status === 0) return 'key';
  return 'stop';
}
export const nextMidnightBeijing = (now) => { const d = new Date(now + 8 * 3_600_000); d.setUTCHours(24, 0, 0, 0); return d.getTime() - 8 * 3_600_000; };

/* ── 配置 ───────────────────────────────────────────────────────── */
export function normalizeConfig(raw = {}) {
  const channels = (raw.channels || [])
    .filter((c) => c && c.id && c.base_url && Array.isArray(c.keys) && c.keys.length)
    .map((c) => ({ ...c, base_url: String(c.base_url).replace(/\/+$/, ''), models: c.models?.length ? c.models : [c.model],
      weight: Math.min(10, Math.max(1, Number(c.weight) || 1)), ctx: Number(c.ctx) || CTX_BY_MODEL[c.model] || 32_000 }));
  const aliases = {};
  for (const [name, v] of Object.entries({ ...DEFAULT_ALIASES, ...(raw.aliases || {}) })) {
    const a = Array.isArray(v) ? { chain: v } : { ...v };
    aliases[name] = { strategy: STRATEGIES.includes(a.strategy) ? a.strategy : 'ordered', kind: a.kind === 'image' || a.kind === 'video' ? a.kind : 'chat', chain: (a.chain || []).filter((x) => Array.isArray(x) && x[0]),
      name: a.name || name, hidden: !!a.hidden, vision: a.vision || null,
      compress: a.compress !== undefined ? !!a.compress : (raw.compress !== undefined ? !!raw.compress : true) };
  }
  const byId = new Map(channels.map((c) => [c.id, c]));
  for (const a of Object.values(aliases)) for (const [id, m] of a.chain) { const c = byId.get(id); if (c && m && !c.models.includes(m)) c.models.push(m); }   // 链里点名的模型也算该渠道有
  return { ...raw, port: Number(raw.port) || 8787, compress: raw.compress !== undefined ? !!raw.compress : true, channels, aliases, byId };
}
/* 别名名解析:bohui-chat-cloud / bohui-chat-local 这种带后缀的也认(客户端里同名条目不能重复,靠后缀区分本机/云) */
export function resolveAlias(cfg, name) {
  if (cfg.aliases[name]) return name;
  const m = /^(.*)-(cloud|local)$/.exec(name);
  return m && cfg.aliases[m[1]] ? m[1] : null;
}

/* ── 状态(普通对象,可 JSON 序列化进 KV)────────────────────────────── */
export const newState = () => ({ keys: {}, rr: {}, wrr: {}, lat: {}, q: {}, chDown: {}, noModel: {}, hist: [], saved: { raw: 0, out: 0, n: 0 } });
const kid = (ch, i) => `${ch.id}#${i}`;
export function keyCooling(state, ch, idx, now) { const s = state.keys[kid(ch, idx)]; return !!s && s.until > now; }
export function pickKey(ch, state, now) {
  const n = ch.keys.length, start = state.rr[ch.id] || 0;
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    if (!keyCooling(state, ch, idx, now)) { state.rr[ch.id] = (idx + 1) % n; return idx; }
  }
  // 09-18:全部在冷却 → 挑最早到期的那把硬试一次(限流窗口是滚动的,多半已经能用),别直接对客户端报「全在冷却中」
  let best = -1, until = Infinity;
  for (let i = 0; i < n; i++) { const u = state.keys[kid(ch, i)]?.until ?? 0; if (u < until) { until = u; best = i; } }
  return best;
}
export function cool(ch, idx, why, state, now, hintMs = 0) {   // hintMs:上游 retry-after 换算的毫秒,有就按它(封顶 COOL_MAX)
  const s = state.keys[kid(ch, idx)] || { strikes: 0 };
  s.strikes += 1; s.until = now + (hintMs > 0 ? Math.min(hintMs, COOL_MAX) : coolMs(s.strikes, why)); s.why = String(why).slice(0, 120);
  state.keys[kid(ch, idx)] = s;
  return s.until - now;
}
export function heal(ch, idx, state) { delete state.keys[kid(ch, idx)]; }
/* ② 渠道级封锁:额度尽 → 整渠道锁到北京时间次日 0 点;模型不存在 → 该渠道对该模型永久跳过(重启 / 换配置才清) */
export const lockChannel = (ch, why, state, now) => { state.chDown[ch.id] = { until: nextMidnightBeijing(now), why: String(why).slice(0, 300) }; };
export const channelDown = (ch, state, now) => { const d = state.chDown[ch.id]; if (!d) return false; if (d.until > now) return true; delete state.chDown[ch.id]; return false; };
export const lockModel = (ch, model, state) => { state.noModel[`${ch.id}/${model}`] = true; };
export const modelDown = (ch, model, state) => !!state.noModel[`${ch.id}/${model}`];
export const hasFreeKey = (ch, state, now) => !channelDown(ch, state, now) && ch.keys.some((_, i) => !keyCooling(state, ch, i, now));
/* ④ 渠道质量 EWMA(α=0.2):成功 1、429 记 0.5、其它失败 0;样本少时向 0.5 收缩(50 次满置信) */
export function updateQuality(state, ch, score) { const q = state.q[ch.id] || (state.q[ch.id] = { e: score, n: 0 }); q.e = q.n ? q.e + 0.2 * (score - q.e) : score; q.n += 1; }
export const quality = (state, ch) => { const q = state.q[ch.id]; return q ? Math.round((0.5 + Math.min(q.n, 50) / 50 * (q.e - 0.5)) * 1000) / 1000 : null; };
export function recordLatency(state, ch, ms) { const a = state.lat[ch.id] || (state.lat[ch.id] = []); a.push(ms); if (a.length > LAT_WINDOW) a.splice(0, a.length - LAT_WINDOW); }
export const avgLatency = (state, ch) => { const a = state.lat[ch.id]; return a?.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null; };
export function pushHist(state, entry, now) {
  state.hist.push(entry);
  while (state.hist.length && (state.hist[0].t < now - 3_600_000 || state.hist.length > HIST_MAX)) state.hist.shift();
}
export function addSaving(state, raw, out) { state.saved.raw += raw; state.saved.out += out; state.saved.n += 1; }

/* ── 路由:请求的 model → 候选 [{ch, model}](已按策略排好)───────────── */
export function estimateTokens(body) {   // 粗估:中日韩一字一 token,其余 4 字符一 token
  const s = JSON.stringify(body?.messages ?? body ?? '');
  const cjk = (s.match(/[　-鿿가-힯＀-￯]/g) || []).length;
  return cjk + Math.ceil((s.length - cjk) / 4);
}
/* 消息里有没有图(image_url / input_image 块):通用型 AI 带图就自动改走 vision 链,客户端只需知道 bohui-chat */
export const hasImages = (body) => Array.isArray(body?.messages) && body.messages.some((m) => Array.isArray(m?.content) && m.content.some((p) => p && (p.type === 'image_url' || p.type === 'input_image')));
export function orderCandidates(cfg, name, kind, state, body, now) {
  let alias = resolveAlias(cfg, name);
  if (alias && kind === 'chat' && cfg.aliases[alias].vision && cfg.aliases[cfg.aliases[alias].vision] && hasImages(body)) alias = cfg.aliases[alias].vision;
  let cands, strategy = 'ordered';
  if (alias) {
    const a = cfg.aliases[alias]; strategy = a.strategy;
    cands = a.kind !== kind ? [] : a.chain.map(([id, m]) => cfg.byId.has(id) && { ch: cfg.byId.get(id), model: m || cfg.byId.get(id).model }).filter(Boolean);
  } else {
    cands = cfg.channels.filter((c) => c.models.includes(name) && (kind === 'image' ? c.can_image : (c.can_text || c.can_vision)))
      .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99)).map((ch) => ({ ch, model: name }));
    // 09-18:具体模型名也要有兜底——找第一个链里含该模型的别名,把它整条链追加到候选后面(去重),商汤限流时落到 Agnes
    const fam = Object.values(cfg.aliases).find((a) => a.kind === kind && a.chain.some(([id, m]) => (m || cfg.byId.get(id)?.model) === name));
    if (fam) for (const [id, m] of fam.chain) { const ch = cfg.byId.get(id); if (ch && !cands.some((c) => c.ch.id === id)) cands.push({ ch, model: m || ch.model }); }
  }
  cands = cands.filter((c) => !modelDown(c.ch, c.model, state));   // 该渠道已确认没有这个模型 → 直接不算候选
  if (strategy === 'least-latency') {
    // 冷却/封锁中的垫底;有数据的按平均耗时升序(按 500ms 分档),同档再按质量 EWMA 降序;没数据的排最前(先试一次才有数据)
    const rank = (c) => !hasFreeKey(c.ch, state, now) ? 1e12 : (avgLatency(state, c.ch) ?? -1);
    cands = cands.map((c, i) => ({ c, i, r: Math.round(rank(c) / 500), q: quality(state, c.ch) ?? 0.5 }))
      .sort((x, y) => x.r - y.r || y.q - x.q || x.i - y.i).map((x) => x.c);
  } else if (strategy === 'longest-context') {
    const need = Math.ceil(estimateTokens(body) * 1.1);
    cands = cands.filter((c) => c.ch.ctx >= need).sort((a, b) => b.ch.ctx - a.ch.ctx);
  } else if (strategy === 'round-robin') {
    // 按 weight 展开成环,指针每次前进一格;从指针处起绕一圈,同一渠道只出现一次
    const ring = cands.flatMap((c) => Array(c.ch.weight).fill(c));
    if (ring.length) {
      const p = (state.wrr[alias || name] || 0) % ring.length; state.wrr[alias || name] = p + 1;
      const seen = new Set(); cands = [];
      for (let i = 0; i < ring.length; i++) { const c = ring[(p + i) % ring.length]; if (!seen.has(c.ch.id)) { seen.add(c.ch.id); cands.push(c); } }
    }
  }
  return { alias: alias || name, strategy, cands };
}

/* ── 请求整形 ───────────────────────────────────────────────────── */
export function shapeChat(ch, model, body) {
  const out = { ...body, model }; delete out._noSummary;   // 网关内部标记不发上游
  const sensenova = /sensenova/.test(ch.base_url);
  if (sensenova && /^kimi-/.test(model)) out.temperature = 1;   // 商汤的 Kimi 只认 1,别的值 400
  /* 商汤 glm-5.2 / deepseek-v4 / kimi-k3 都是推理模型且默认开思考:max_tokens 全被 reasoning 吃光,content 为空。
     真正关掉要 reasoning_effort:'none' + thinking:{type:'disabled'} 一起给(单给 thinking 会 400)。请求显式给了就不动。 */
  if (sensenova && /^(glm-|deepseek-v4|kimi-)/.test(model) && out.reasoning_effort === undefined && out.thinking === undefined) {
    out.reasoning_effort = 'none'; out.thinking = { type: 'disabled' };
  }
  if (/^agnes-3/.test(model) && out.chat_template_kwargs === undefined) out.chat_template_kwargs = { enable_thinking: false };   // Agnes 3.0 不关思考国际端 37s+
  if (out.stream === true && out.stream_options === undefined) out.stream_options = { include_usage: true };   // 流式也要记 tokens(商汤 / Agnes 实测都认)
  return out;
}
export function shapeImage(ch, model, body) {
  const out = { ...body, model };
  if (/sensenova/.test(ch.base_url)) { out.response_format ??= 'url'; out.watermark ??= false; }   // 商汤默认 b64 + 水印
  return out;
}
export const shapeVideo = (ch, model, body) => ({ ...body, model });   // Agnes:POST /video/generations {model, prompt};2.5-flash 另要 mode
export const shapeFor = (kind) => kind === 'image' ? shapeImage : kind === 'video' ? shapeVideo : shapeChat;

/* ── 对话形状的出图 / 出视频:客户端只会调 chat/completions,这里把「最后一条 user」变成提示词,结果包成一条 assistant 消息 ──
   lastUserPrompt:文本块拼成 prompt,image_url 块作参考图(出图时走 /images/edits)。 */
export function lastUserPrompt(body) {
  const m = [...(body?.messages || [])].reverse().find((x) => x?.role === 'user');
  if (!m) return { text: '', images: [] };
  if (typeof m.content === 'string') return { text: m.content.trim(), images: [] };
  const parts = Array.isArray(m.content) ? m.content : [];
  return { text: parts.filter((p) => p?.type === 'text').map((p) => p.text).join('\n').trim(),
    images: parts.filter((p) => p?.type === 'image_url' || p?.type === 'input_image').map((p) => p.image_url?.url || p.image_url || p.url).filter(Boolean) };
}
export function chatEnvelope(model, content, stream, extra = {}) {
  const id = 'chatcmpl-' + Math.random().toString(36).slice(2, 12), created = Math.floor(Date.now() / 1000);
  if (!stream) return JSON.stringify({ id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, ...extra });
  const chunk = (delta, finish = null) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  return chunk({ role: 'assistant', content }) + chunk({}, 'stop') + 'data: [DONE]\n\n';
}
/* 从任意 JSON 里找第一个像媒体链接的 http(s) URL(视频任务完成体的字段名各家不同) */
export function findMediaUrl(obj, ext = /\.(mp4|webm|mov|png|jpe?g|webp)(\?|$)/i) {
  const seen = new Set(); let fallback = null;
  const walk = (v) => {
    if (typeof v === 'string') { if (/^https?:\/\//.test(v)) { if (ext.test(v)) return v; fallback ??= /video|image|media|oss|cdn/i.test(v) ? v : null; } return null; }
    if (v && typeof v === 'object' && !seen.has(v)) { seen.add(v); for (const x of Object.values(v)) { const r = walk(x); if (r) return r; } }
    return null;
  };
  return walk(obj) || fallback;
}

/* ── 请求前压缩(⑤ 只做两件事,默认开、别名 compress:false 可关)────────────────
   原则:不改语义。user 最后一条原文不动;图片等非文本块不动;tools 定义不动;代码缩进不动。
   ① 空白折叠:行尾空白去掉、行内连续空白压一、3 个以上空行压成 1 个;
   ② 工具结果 JSON 精简(role=tool、>2000 字、能 JSON.parse):数组留首 5 末 2,对象留前 20 键,其余以 "…省略 N 项 / _remaining_N_keys" 标注。
   去重、日志折叠、字段剔除等其它 16 类(见 crm/开源分析-OmniRoute-2026-09-18.md)不做。 */
export const SLIM_MIN = 2000, SLIM_ARR_HEAD = 5, SLIM_ARR_TAIL = 2, SLIM_OBJ_KEYS = 20;
export function tidy(text) {
  return text.replace(/[ \t]+$/gm, '').replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/\n{3,}/g, '\n\n');
}
function slim(v) {
  if (Array.isArray(v)) return v.length > SLIM_ARR_HEAD + SLIM_ARR_TAIL ? [...v.slice(0, SLIM_ARR_HEAD).map(slim), `…省略 ${v.length - SLIM_ARR_HEAD - SLIM_ARR_TAIL} 项`, ...v.slice(-SLIM_ARR_TAIL).map(slim)] : v.map(slim);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v), out = {};
    for (const k of keys.slice(0, SLIM_OBJ_KEYS)) out[k] = slim(v[k]);
    if (keys.length > SLIM_OBJ_KEYS) out[`_remaining_${keys.length - SLIM_OBJ_KEYS}_keys`] = keys.slice(SLIM_OBJ_KEYS).join(',').slice(0, 200);
    return out;
  }
  return v;
}
export function slimToolJson(text) {
  const t = text.trim();
  if (t.length < SLIM_MIN || !/^[\[{]/.test(t)) return text;
  try { return JSON.stringify(slim(JSON.parse(t))); } catch { return text; }
}
/* ── 部门守则(创始人 2026-09-18 15:5x「原料成本不可以公开,只有技术研发部和财务、老板看到」)──
   客户端登录后每个请求带 x-bohui-dept;不在 cost_depts 里的部门,对话前插一条 system:不给原料单价 / 配方成本 / 供应商报价。
   没带头的请求(脚本、后台)按「可见」处理 —— 后台自己有角色门。config.json 的 cost_depts 可覆盖默认名单。 */
export const COST_DEPTS = ['技术研发部', '研发部', '开发部', '财务部', '财务', '管理层', '老板', 'rd', 'dev', 'finance', 'boss', 'admin', 'management'];
export function deptGuard(body, dept, costDepts = COST_DEPTS) {
  let d = String(dept || '').trim();
  try { d = decodeURIComponent(d); } catch {}   // HTTP 头只能 ASCII:客户端传 encodeURIComponent('销售部') 或英文 id(sales / rd / finance)
  if (!Array.isArray(body?.messages)) return body;
  /* 所有部门共用:价格不许编(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」)—— 模型对研发部会张口报「80–150 元/kg」,那是它编的 */
  const noInvent = '涉及原料单价、配方成本、供应商报价:只能引用帛卉原料库里「财务已确认」的价,对话里没给就答「原料库暂无确认价,请采购 / 财务补录」,不得估算、不给区间、不引用市场行情。';
  const noRight = d && !costDepts.map((x) => x.toLowerCase()).includes(d.toLowerCase());
  const rules = noRight
    ? [`对话方是帛卉「${d}」员工,无权知道原料单价、配方成本、供应商报价与毛利。被问到时只答「成本由技术研发部与财务提供」,不给任何数字、区间或估算。其余问题照常回答。`]
    : [noInvent];
  return { ...body, messages: [{ role: 'system', content: rules.join(String.fromCharCode(10)) }, ...body.messages] };
}

const NL = String.fromCharCode(10);
export const MAX_INPUT_TOKENS = 32000;   // 09-21:单次输入上限。WorkBuddy 循环把整段历史 + 工具结果一起塞,平均 10 万、最高 20 万 token,一天烧 1.5 亿
export function trimToBudget(body, budget = MAX_INPUT_TOKENS) {
  if (!Array.isArray(body?.messages) || estimateTokens(body) <= budget) return { body, dropped: 0, droppedMessages: [] };
  const msgs = body.messages.slice(); const keepTail = 6; let dropped = 0; const droppedMessages = [];
  // 先砍单条超长的工具结果(>8k 字符只留头尾),再从最早的非 system 消息开始整条丢
  for (let i = 0; i < msgs.length - keepTail; i++) { const m = msgs[i]; if (m && m.role === 'tool' && typeof m.content === 'string' && m.content.length > 8000) msgs[i] = { ...m, content: m.content.slice(0, 4000) + NL + '…(工具结果中段已省略)…' + NL + m.content.slice(-2000) }; }
  while (estimateTokens({ messages: msgs }) > budget) {
    const i = msgs.findIndex((m, k) => m && m.role !== 'system' && k < msgs.length - keepTail);
    if (i < 0) break; droppedMessages.push(msgs[i]); msgs.splice(i, 1); dropped += 1;
  }
  if (dropped) { const si = msgs.findIndex((m) => m && m.role === 'system'); const note = { role: 'system', content: `(网关提示:对话较长,已省略最早的 ${dropped} 条消息,只保留最近内容;需要旧内容请让用户重新提供)` }; msgs.splice(si >= 0 ? si + 1 : 0, 0, note); }
  return { body: { ...body, messages: msgs }, dropped, droppedMessages };
}
/* 09-21 11:4x 永续会话(吸收 WorkSwarm 机制,不整包):trimToBudget 丢掉的消息不干丢,用 bohui-fast 压成一段「记忆」回填到网关提示里。
   小请求、compress:false、带 _noSummary 防递归;失败就退回只提示条数。config.json 可写 summarize_dropped:false 关掉。 */
export const SUMMARY_MAX_CHARS = 24000;
export function droppedDigest(dropped = []) {
  const parts = [];
  for (const m of dropped) {
    if (!m || m.role === 'system') continue;
    const c = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p) => (p && p.type === 'text' ? p.text : '')).join(' ') : '';
    const t = tidy(c).slice(0, 2000);
    if (t) parts.push(`[${m.role}] ${t}`);
  }
  let text = parts.join(NL);
  if (text.length > SUMMARY_MAX_CHARS) text = text.slice(0, SUMMARY_MAX_CHARS / 2) + NL + '…(中段略)…' + NL + text.slice(-SUMMARY_MAX_CHARS / 2);
  return text;
}
export function summaryRequest(dropped) {
  return {
    _noSummary: true, stream: false, max_tokens: 700, temperature: 0.2,
    messages: [
      { role: 'system', content: '你是对话记忆压缩器。把下面这段较早的对话压成一段中文记忆,供后续对话继续使用:只保留任务目标、已确认的事实与数字、用户明确的要求与偏好、已完成/未完成的事项、文件名与路径。不评价,不补充,不超过 400 字,用短句分行。' },
      { role: 'user', content: droppedDigest(dropped) },
    ],
  };
}
export function withSummaryNote(body, summary, dropped) {
  const msgs = body.messages.map((m) => (m && m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('(网关提示:对话较长')
    ? { ...m, content: `(网关记忆:对话较长,最早的 ${dropped} 条消息已压成下面这段记忆;需要原文请让用户重新提供)${NL}${summary}` } : m));
  return { ...body, messages: msgs };
}
export async function summarizeDropped({ cfg, state, attempt, now, dropped, onFail }) {
  if (!dropped?.length || cfg.summarize_dropped === false) return null;
  const digest = droppedDigest(dropped);
  if (digest.length < 200) return null;   // 太短不值一次调用
  try {
    const hit = await runChain({ cfg, state, name: 'bohui-fast', kind: 'chat', body: summaryRequest(dropped), attempt, onFail, now, compress: false });
    if (!hit.ok) return null;
    const j = JSON.parse(hit.bodyText ?? await hit.r.text(1 << 20));
    const text = String(j?.choices?.[0]?.message?.content ?? '').trim();
    return text ? { text, hit, usage: j.usage || null } : null;
  } catch { return null; }
}
export function compressBody(body, budget = MAX_INPUT_TOKENS) {
  const raw = JSON.stringify(body).length;
  if (!Array.isArray(body.messages)) return { body, charsRaw: raw, chars: raw, dropped: 0, droppedMessages: [] };
  let dropped = 0, droppedMessages = [];
  ({ body, dropped, droppedMessages } = trimToBudget(body, budget));
  const lastUser = body.messages.map((m) => m?.role).lastIndexOf('user');
  const fix = (m, text) => m.role === 'tool' ? tidy(slimToolJson(text)) : tidy(text);
  const messages = body.messages.map((m, i) => {
    if (!m || typeof m !== 'object' || i === lastUser) return m;               // 最后一条 user 原文不动
    if (typeof m.content === 'string') return { ...m, content: fix(m, m.content) };
    if (Array.isArray(m.content)) return { ...m, content: m.content.map((p) => p && p.type === 'text' && typeof p.text === 'string' ? { ...p, text: fix(m, p.text) } : p) };
    return m;
  });
  const out = { ...body, messages };
  return { body: out, charsRaw: raw, chars: JSON.stringify(out).length, dropped, droppedMessages };
}

/* ── 提示词改写(创始人 14:3x:「有的时候他们的提示词不行,出的效果就很差」)────────────────────
   用户一句中文 → 先让文本模型(bohui-fast)按「视觉内容总监」口径 + 莱诺鸟模板库(D1 render_templates)改写成英文成图 / 分镜提示词,
   再拿去出图 / 出视频。这里是纯函数:pickTemplate 选模板、rewritePrompt 组请求、parseRewrite 解析回包;调模型由两边入口做。
   用户原话以「原样:」或「/raw」开头则不改写。主站 fleet.image 也可直接调这三个函数。 */
export const RAW_RE = /^\s*(?:原样[:：]|\/raw\b)\s*/;
const CAT_RE = [
  ['gift-set', /套装|礼盒|全套|gift|set\b/i], ['lifestyle', /模特|手持|人物|生活|场景|户外|森林|海边|窗边|lifestyle|hand|model/i],
  ['dropper-bottle', /滴管|精华|安瓿|serum|dropper|essence/i], ['tube', /软管|管装|洁面|牙膏|tube|cleanser/i],
  ['pump-bottle', /泵|按压|乳液|洗发|沐浴|喷雾|pump|lotion|spray/i], ['jar', /罐|面霜|乳霜|膏|jar|cream|balm/i],
];
export function pickTemplate(text, templates = []) {
  const cat = (CAT_RE.find(([, re]) => re.test(text)) || [])[0];
  return (cat && templates.find((t) => t.category === cat)) || null;   // 匹配不到 → null,用通用商业产品摄影骨架
}
const GENERIC = 'Skeleton: subject + material + blank minimalist label → surface/props echoing the product benefit → soft key light + rim light + white reflector fill → 85mm shallow depth of field, eye-level or slight high angle → high-end commercial beauty photography, clean color grading, no brand logos, no text claims.';
export function rewritePrompt(kind, text, templates = []) {
  const t = String(text || '').trim();
  if (RAW_RE.test(t)) return { raw: true, prompt: t.replace(RAW_RE, '').trim(), template: null, messages: null };
  const tpl = pickTemplate(t, templates);
  const video = kind === 'video';
  const system = `你是帛卉化妆品(OEM/ODM 工厂)视觉内容总监手下的提示词改写员。把用户的一句中文需求改写成${video ? '英文分镜式视频提示词' : '英文成图提示词'},只为一个目的:让客户在 30 秒内相信这家厂能做出这个品。
规则:
1. ${video ? '写成 3 个镜头各 5 秒(Shot 1 0-5s 开场建立场景 / Shot 2 5-10s 主体细节 / Shot 3 10-15s 收尾定格),每镜头写清镜头运动(push in / orbit / tilt / rack focus 等)、光线变化、主体动作;总长 80-140 个英文词' : '60-110 个英文词,一段话,依次写:主体与材质 / 光位 / 背景与台面 / 道具(呼应功效)/ 机位与焦段 / 构图 / 后期色调'}。
2. 画面里不出现任何真实品牌、logo、明星、平台标识、对标品牌包装;标签只写 blank minimalist label;不写价格、起订量、功效宣称文字、前后对比。
3. 用户没说的按中性高端商业美妆摄影补全:中性包材、柔光主光+轮廓光+白反光板、85mm 浅景深。用户说了的(瓶型/材质/颜色/盖子/场景/风格)必须保留。
4. 输出严格三行,不要其它内容:
PROMPT: <英文提示词>
NEGATIVE: <英文负面词,逗号分隔,含 text, logo, watermark, brand, extra fingers, blurry, low quality, distorted proportions>
NOTE: 我把你的描述改写成了:<一句中文,说清补了什么、沿用了什么模板>
${tpl ? `参考模板「${tpl.name}」(类目 ${tpl.category}),沿用它的骨架、光位、焦段与后期词,把 {product}{material}{color}{cap} 等占位按用户描述填实:\n${tpl.template_en}\n中文骨架:${tpl.template_zh || ''}` : `没有匹配到类目模板,用通用骨架:${GENERIC}`}`;
  return { raw: false, template: tpl, messages: [{ role: 'system', content: system }, { role: 'user', content: t }] };
}
export function parseRewrite(content, fallback) {
  const s = String(content || '').replace(/\r/g, '').replace(/```[a-z]*\n?/gi, '');
  const grab = (k) => { const m = new RegExp(`^\\s*${k}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:PROMPT|NEGATIVE|NOTE)\\s*[:：]|$)`, 'im').exec(s); return m ? m[1].trim() : ''; };
  const prompt = grab('PROMPT');
  return { prompt: prompt || fallback, negative: grab('NEGATIVE'), note: grab('NOTE'), parsed: !!prompt };
}

/* ── 视图:/v1/models、/status、状态页 HTML ─────────────────────────── */
export function modelsView(cfg, all = false) {   // 默认只列客户端该看到的三项;?all=1 连 hidden 别名和各渠道模型一起列
  const seen = new Set(), data = [];
  for (const [a, v] of Object.entries(cfg.aliases)) if (all || !v.hidden) data.push({ id: a, object: 'model', created: 0, owned_by: 'bohui', name: v.name, kind: v.kind, strategy: v.strategy, compress: v.compress, chain: v.chain.filter(([id]) => cfg.byId.has(id)).map(([id, m]) => `${id}/${m}`) });
  if (all) for (const c of cfg.channels) for (const m of c.models) if (!seen.has(m)) { seen.add(m); data.push({ id: m, object: 'model', created: 0, owned_by: c.id }); }
  return { object: 'list', data };
}
export function statusView(cfg, state, now, extra = {}) {
  while (state.hist.length && state.hist[0].t < now - 3_600_000) state.hist.shift();
  const hh = state.hist;
  const keyRow = (ch, idx) => {
    const s = state.keys[kid(ch, idx)], cooling = !!s && s.until > now;
    const h = hh.filter((x) => x.ch === ch.id && x.idx === idx), good = h.filter((x) => x.ok);
    return { idx, key: '…' + ch.keys[idx].slice(-4), state: cooling ? 'cooling' : 'ok',
      until: cooling ? new Date(s.until).toISOString() : null, until_local: cooling ? fmtTime(s.until) : null, strikes: s?.strikes || 0, why: cooling ? s.why : null,
      h1: { ok: good.length, fail: h.length - good.length, r429: h.filter((x) => x.status === 429).length,
        avg_ms: good.length ? Math.round(good.reduce((a, x) => a + x.ms, 0) / good.length) : null } };
  };
  const sv = state.saved;
  return { ok: true, name: '帛卉网关', ...extra,
    h1: { total: hh.length, ok: hh.filter((x) => x.ok).length, r429: hh.filter((x) => x.status === 429).length },
    compress: { requests: sv.n, chars_raw: sv.raw, chars_out: sv.out, saved_pct: sv.raw ? Math.round((1 - sv.out / sv.raw) * 1000) / 10 : 0 },
    channels: cfg.channels.map((ch) => ({ id: ch.id, label: ch.label, models: ch.models, base_url: ch.base_url, proxy: ch.proxy || '', weight: ch.weight, ctx: ch.ctx,
      avg_ms: avgLatency(state, ch), quality: quality(state, ch), down: channelDown(ch, state, now) ? { until_local: fmtTime(state.chDown[ch.id].until), why: state.chDown[ch.id].why } : null,
      no_model: Object.keys(state.noModel).filter((k) => k.startsWith(ch.id + '/')).map((k) => k.slice(ch.id.length + 1)),
      keys: ch.keys.map((_, i) => keyRow(ch, i)) })),
    aliases: Object.fromEntries(Object.entries(cfg.aliases).map(([a, v]) => [a, { name: v.name, kind: v.kind, hidden: v.hidden, strategy: v.strategy, compress: v.compress, vision: v.vision, chain: v.chain }])) };
}
const fmtTime = (t) => { const d = new Date(t + 8 * 3_600_000); return d.toISOString().slice(11, 19) + '(北京)'; };
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function statusHtml(s) {
  const rows = s.channels.flatMap((ch) => ch.keys.map((k, i) => `<tr${k.state === 'cooling' ? ' class=cool' : ''}>` +
    `<td>${i ? '' : `<b>${esc(ch.id)}</b><br><small>${esc(ch.label)}</small>`}</td><td>${i ? '' : esc(ch.models.join(' / '))}</td>` +
    `<td>${i ? '' : `${ch.proxy ? '直连,失败走代理' : '直连'}<br><small>权重 ${ch.weight} · ctx ${Math.round(ch.ctx / 1000)}K · 均 ${ch.avg_ms ?? '—'} ms · 质量 ${ch.quality ?? '—'}</small>${ch.down ? `<br><b>整渠道封锁至 ${esc(ch.down.until_local)}</b><br><small>${esc(ch.down.why)}</small>` : ''}${ch.no_model?.length ? `<br><small>无此模型:${esc(ch.no_model.join(' '))}</small>` : ''}`}</td>` +
    `<td>#${k.idx} ${esc(k.key)}</td><td>${k.state === 'cooling' ? `冷却至 ${esc(k.until_local)}(第 ${k.strikes} 次)<br><small>${esc(k.why)}</small>` : '正常'}</td>` +
    `<td>${k.h1.ok}</td><td>${k.h1.fail}</td><td>${k.h1.r429}</td><td>${k.h1.avg_ms ?? '—'}</td></tr>`)).join('');
  const al = Object.entries(s.aliases).map(([a, v]) => `<tr><td><code>${esc(a)}</code>${v.name && v.name !== a ? `<br><small>${esc(v.name)}</small>` : ''}${v.hidden ? '<br><small>(后台用,客户端不展示)</small>' : ''}</td><td>${esc(v.strategy)}${v.compress ? '' : ' · 不压缩'}${v.vision ? ` · 带图走 ${esc(v.vision)}` : ''}</td><td>${v.chain.map(([id, m]) => s.channels.some((c) => c.id === id) ? `${esc(id)} / ${esc(m)}` : `<s>${esc(id)} / ${esc(m)}</s>`).join(' → ')}</td></tr>`).join('');
  return `<!doctype html><html lang=zh-CN><meta charset=utf-8><meta http-equiv=refresh content=10><title>帛卉网关</title>
<style>body{font:16px/1.5 system-ui,"Microsoft YaHei",sans-serif;margin:2rem;color:#111}table{border-collapse:collapse;margin:1rem 0 2rem}td,th{border:1px solid #ddd;padding:.4rem .7rem;text-align:left;vertical-align:top}th{background:#f4f4f4}tr.cool{background:#fff3e0}small{color:#666}code{background:#f4f4f4;padding:0 .3rem}</style>
<h1>帛卉网关 <small>${esc(s.where || '')} · 已运行 ${Math.round((s.up_s || 0) / 60)} 分钟 · 10 秒自刷</small></h1>
<p>近 1 小时:${s.h1.total} 次上游调用,成功 ${s.h1.ok},失败 ${s.h1.total - s.h1.ok}(其中 429 ${s.h1.r429})。
压缩:${s.compress.requests} 次请求,${s.compress.chars_raw} → ${s.compress.chars_out} 字符,<b>累计节省 ${s.compress.saved_pct}%</b>。${s.config ? `配置 <code>${esc(s.config)}</code>,` : ''}JSON 版 <a href="/status">/status</a></p>
<table><tr><th>渠道</th><th>模型</th><th>出口</th><th>key</th><th>状态</th><th>成功</th><th>失败</th><th>429</th><th>平均 ms</th></tr>${rows}</table>
<h2>别名 → 策略 → 候选链</h2><table><tr><th>别名</th><th>策略</th><th>候选链</th></tr>${al}</table>`;
}

/* ── 鉴权:定长比较,不依赖平台 crypto ───────────────────────────────── */
export function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}
export const bearer = (h) => String(h || '').replace(/^Bearer\s+/i, '').trim();

/* ── 候选链 × key 池:逐个试,2xx 就交还给调用方转发 ─────────────────────
   attempt(ch, model, key, payload) → { status, text(max) → Promise<string>, ...原响应 };连不上就 throw。
   onFail({ch, idx, status, ms, error}) 每次失败回调(记日志);成功那次由调用方在转发结束后自己记(流式要等 usage)。 */
export async function runChain({ cfg, state, name, kind, body, attempt, onFail, onSummary, now = () => Date.now(), shape = shapeFor(kind), compress }) {
  const { alias, strategy, cands } = orderCandidates(cfg, name, kind, state, body, now());
  if (!cands.length) return { ok: false, status: 404, alias, msg: strategy === 'longest-context' ? `没有渠道装得下约 ${estimateTokens(body)} tokens 的请求` : `没有叫「${name}」的别名或模型(见 GET /v1/models)` };
  let charsRaw = JSON.stringify(body).length, chars = charsRaw, reqBody = body;
  const doCompress = compress !== undefined ? compress : (cfg.aliases[alias]?.compress ?? cfg.compress);
  let summarized = 0;
  if (doCompress && kind === 'chat') {
    const c = compressBody(body, Number(cfg.max_input_tokens) || MAX_INPUT_TOKENS);
    ({ body: reqBody, charsRaw, chars } = c);
    if (c.dropped && !body._noSummary) {
      const sum = await summarizeDropped({ cfg, state, attempt, now, dropped: c.droppedMessages, onFail });
      if (sum) { reqBody = withSummaryNote(reqBody, sum.text, c.dropped); summarized = c.dropped; chars = JSON.stringify(reqBody).length; onSummary?.({ dropped: c.dropped, hit: sum.hit, usage: sum.usage }); }
    }
  }
  addSaving(state, charsRaw, chars);
  let last = { status: 503, msg: '候选渠道的 key 全在冷却中' };
  const wantText = kind === 'chat' && body.stream !== true;   // ③ 非流式对话:核心先读完正文,2xx 但内容为空也算失败换下一把
  const slowAll = cands.length > 0 && cands.every(({ ch }) => (state.chSlow?.[ch.id] ?? 0) > now());   // 全部候选都在「慢」名单里就照常试,别把请求饿死
  for (const { ch, model } of cands) {
    if (!slowAll && (state.chSlow?.[ch.id] ?? 0) > now()) { last = { status: 503, msg: `${ch.id} 最近超时,5 分钟内绕开` }; continue; }
    if (channelDown(ch, state, now())) { last = { status: 503, msg: `${ch.id} 整渠道封锁至次日 0 点:${state.chDown[ch.id].why}` }; continue; }
    for (let n = 0; n < ch.keys.length; n++) {
      const t = now(), idx = pickKey(ch, state, t);
      if (idx < 0) break;
      const forced = keyCooling(state, ch, idx, t);   // 全冷时 pickKey 给的是最早到期那把:只硬试这一次,失败就换下一家
      const payload = shape(ch, model, reqBody);
      let r;
      try { r = await attempt(ch, model, ch.keys[idx], payload); }
      catch (e) {
        const msg = String(e?.message || e); cool(ch, idx, msg, state, now()); updateQuality(state, ch, 0);
        onFail?.({ ch, idx, status: 0, ms: now() - t, error: msg, alias, model, charsRaw, chars });
        last = { status: 502, msg: `${ch.id}/${model} key#${idx} ${msg}` }; if (forced) break;
        if (/timeout|timed out|aborted|无响应|超时/i.test(msg)) { (state.chSlow ||= {})[ch.id] = now() + 5 * 60_000; break; }   // 09-21:超时是整个渠道慢(Agnes 午后 100s 全超)——换下一家,且这家 5 分钟内后面的请求也先绕开(全都慢才硬试)
        continue;
      }
      if (r.status >= 200 && r.status < 300) {
        let bodyText;
        if (wantText) {
          bodyText = await r.text(64 << 20);
          if (emptyCompletion(bodyText)) {
            cool(ch, idx, '2xx 但内容为空', state, now()); updateQuality(state, ch, 0);
            onFail?.({ ch, idx, status: r.status, ms: now() - t, error: '2xx 但 content/tool_calls 全空', alias, model, charsRaw, chars });
            last = { status: 502, msg: `${ch.id}/${model} key#${idx} 2xx 但内容为空` }; if (forced) break; continue;
          }
        }
        heal(ch, idx, state); updateQuality(state, ch, 1);
        return { ok: true, alias, strategy, ch, model, idx, r, bodyText, t0: t, charsRaw, chars, summarized };
      }
      const text = (await r.text(65_536)).replace(/\s+/g, ' ').slice(0, 300);
      const kindOf = classify(r.status, text);
      updateQuality(state, ch, r.status === 429 ? 0.5 : 0);
      onFail?.({ ch, idx, status: r.status, ms: now() - t, error: `${r.status} ${text}`, alias, model, charsRaw, chars, kind: kindOf });
      last = { status: r.status, msg: `${ch.id}/${model} key#${idx} HTTP ${r.status}:${text}` };
      if (kindOf === 'key') { cool(ch, idx, `${r.status} ${text.slice(0, 80)}`, state, now(), parseRetryAfterMs(r.retryAfter, now())); if (forced) break; continue; }
      if (kindOf === 'nolock') { if (forced) break; continue; }             // 403 apikey / 权限类:换下一把,不锁这把
      if (kindOf === 'channel') { lockChannel(ch, `${r.status} ${text}`, state, now()); break; }   // 额度尽:整渠道锁到次日 0 点(why 留全文,便于核对是哪句话触发的)
      if (kindOf === 'model') { lockModel(ch, model, state); break; }      // 模型不存在:该渠道对该模型永久跳过
      break;   // stop:400 之类换 key 没用,换下一家
    }
  }
  return { ok: false, alias, status: last.status, msg: `全部渠道失败,最后一个:${last.msg}` };
}
/* ③ 2xx 却什么都没给:content / reasoning_content / tool_calls 全空,且不是因为 max_tokens 截断 */
export function emptyCompletion(text) {
  try {
    const j = JSON.parse(text); const c = j.choices?.[0]; if (!c) return !j.data;   // 非对话形状(出图)看 data
    const m = c.message || {}; if (c.finish_reason === 'length') return false;
    return !(String(m.content || '').trim() || String(m.reasoning_content || '').trim() || (Array.isArray(m.tool_calls) && m.tool_calls.length));
  } catch { return false; }
}

/* 从 SSE 文本行里捞最后一个 usage(两边的流式旁路解析共用) */
export function sseUsage(line, prev) {
  const l = line.trim();
  if (!l.startsWith('data:') || !l.includes('"usage"')) return prev;
  try { const j = JSON.parse(l.slice(5)); return j.usage || prev; } catch { return prev; }
}
