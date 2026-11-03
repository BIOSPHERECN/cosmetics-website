/**
 * 帛卉网关 · 云版(Cloudflare Worker,gateway.biosphere-ai.com)。
 * 机制全在 ../../core.mjs(与本机版同一份):别名路由策略、key 池轮询与冷却、失败三分类、请求前压缩、状态视图。
 * 这里只做 Worker 特有的事:配置从 secret GW_CONFIG(或 KV 的 config 键)读、状态从 KV 读写、用 fetch 发上游并 tee 流。
 *
 * 云版与本机版的差别:出图的对话形状直接回上游临时链接(不落盘);出视频不做(要轮询几分钟 + 转存,走本机网关)。
 * ponytail: 状态存 KV 单键,并发请求会互相覆盖(冷却/计数偶尔少记一次),要严格一致换 Durable Object。
 */
import { normalizeConfig, newState, runChain, pushHist, recordLatency, modelsView, statusView, statusHtml, tokenMatches, bearer, sseUsage,
  resolveAlias, lastUserPrompt, chatEnvelope, rewritePrompt, parseRewrite, deptGuard, COST_DEPTS } from '../../core.mjs';
import { keysView, report } from './control.mjs';   // 控制面:发 key / 收上报(0.3.1)

const STATE_KEY = 'state';
const json = (code, obj, extra = {}) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const err = (message, code = 'invalid_request_error') => ({ error: { message, type: code, code } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '') || '/';
    let cfg;
    try { cfg = normalizeConfig(JSON.parse(env.GW_CONFIG || (await env.BOHUI_GW.get('config')) || '{}')); }
    catch (e) { return json(500, err(`GW_CONFIG 解析失败:${e.message}`, 'gateway_error')); }
    const state = (await env.BOHUI_GW.get(STATE_KEY, 'json').catch(() => null)) || newState();
    for (const k of Object.keys(newState())) state[k] ??= newState()[k];   // 旧状态体缺的字段补上
    const save = () => env.BOHUI_GW.put(STATE_KEY, JSON.stringify(state)).catch(() => { });
    const view = () => statusView(cfg, state, Date.now(), { where: `${url.host} · Cloudflare Worker`, up_s: 0 });

    if (req.method === 'GET' && p === '/') return new Response(statusHtml(view()), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (req.method === 'GET' && (p === '/status' || p === '/health')) return json(200, view());
    if (!tokenMatches(bearer(req.headers.get('authorization')), env.GW_TOKEN || '')) return json(401, err('令牌不对或没带:Authorization: Bearer <网关令牌>', 'unauthorized'));
    if (req.method === 'GET' && p === '/v1/models') return json(200, modelsView(cfg, url.searchParams.get('all') === '1'));
    // 控制面(0.3.1):客户端拉 key 直连官方模型;出错上报。project 固定 bohui —— 别的项目接进来时按令牌分。
    if (req.method === 'GET' && p === '/v1/keys') return json(200, await keysView(env.DB, 'bohui', { dept: url.searchParams.get('dept') || '', client: url.searchParams.get('client') || '' }), { 'cache-control': 'no-store' });
    if (req.method === 'POST' && p === '/v1/report') { let b; try { b = await req.json(); } catch { return json(400, err('请求体不是 JSON')); } return json(200, await report(env.DB, 'bohui', b)); }
    if (req.method !== 'POST') return json(404, err(`没有 ${req.method} ${p}`));
    let body; try { body = await req.json(); } catch (e) { return json(400, err(`请求体不是 JSON:${e.message}`)); }
    const isChat = p === '/v1/chat/completions', isImage = p === '/v1/images/generations' || p === '/v1/images/edits';
    if (!isChat && !isImage) return json(404, err(`没有 ${p} 这个路径;有的是 /v1/chat/completions /v1/images/generations /v1/images/edits /v1/models /status`));
    const name = String(body.model || (isChat ? 'bohui-chat' : 'bohui-image'));
    const aliasKind = cfg.aliases[resolveAlias(cfg, name) || '']?.kind;
    if (isChat && aliasKind === 'video') return json(501, err('出视频请走本机网关(云版不做轮询与转存)', 'not_implemented'));

    const record = (e) => {   // 内存环进 KV(供 /status);每次调用一行 JSON 进 Workers Logs(observability)
      const now = Date.now();
      pushHist(state, { t: now, ch: e.ch.id, idx: e.idx, ok: e.ok, status: e.status, ms: e.ms }, now);
      if (e.ok) recordLatency(state, e.ch, e.ms);
      console.log(JSON.stringify({ ts: new Date(now).toISOString(), alias: e.alias, provider: e.ch.id, model: e.model, key_idx: e.idx, status: e.status, ms: e.ms,
        tokens_in: e.usage?.prompt_tokens ?? null, tokens_out: e.usage?.completion_tokens ?? null, chars_in_raw: e.charsRaw ?? null, chars_in: e.chars ?? null, error: e.error ? String(e.error).slice(0, 200) : null }));
    };
    const attempt = (urlPath, timeoutMs) => async (ch, model, key, payload) => {
      const r = await fetch(ch.base_url + urlPath, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'bohui-gateway/2 (cf)' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
      return { status: r.status, res: r, retryAfter: r.headers.get('retry-after') ?? r.headers.get('x-ratelimit-reset-requests'), text: (max) => r.text().then((t) => t.slice(0, max)) };
    };
    const onFail = (f) => record({ ...f, ok: false, usage: null });
    const hdrs = (hit) => ({ 'x-bohui-provider': hit.ch.id, 'x-bohui-model': String(hit.model || hit.ch.model || ''), 'x-bohui-key': String(hit.idx), 'x-bohui-strategy': hit.strategy || 'ordered', 'x-bohui-chars': `${hit.charsRaw}/${hit.chars}` });

    if (isChat && aliasKind === 'image') {   // 客户端选「出图片」直接说话:最后一条 user → 提示词 → 回一条带图片链接的 assistant 消息
      const { text, images } = lastUserPrompt(body), stream = body.stream === true;
      if (!text && !images.length) return json(400, err('出图需要一句描述'));
      // 提示词改写:模板库在 KV 的 templates 键(deploy.py 从 ~/.bohui-gateway/render_templates.json 上传);改写失败就用原话
      const rw0 = rewritePrompt('image', text || '按参考图生成一张同风格的高端商业产品图', (await env.BOHUI_GW.get('templates', 'json').catch(() => null)) || []);
      let rw = { ...rw0, negative: '', note: rw0.raw ? '按你的原话,不改写' : '' };
      if (!rw0.raw) {
        const rh = await runChain({ cfg, state, name: 'bohui-fast', kind: 'chat', body: { messages: rw0.messages, max_tokens: 500, temperature: 0.4 }, compress: false, attempt: attempt('/chat/completions', 90_000), onFail });
        if (rh.ok) { try { const j = JSON.parse(rh.bodyText ?? await rh.r.res.text()); record({ ...rh, alias: 'rewrite:image', ok: true, status: 200, ms: Date.now() - rh.t0, usage: j.usage || null, error: null }); rw = { ...rw, ...parseRewrite(j.choices?.[0]?.message?.content, text) }; } catch { rw.prompt = text; } }
        else rw.prompt = text;
        console.log(JSON.stringify({ rewrite: 'image', template_id: rw0.template?.id ?? null, raw_text: text, prompt: rw.prompt, note: rw.note }));
      }
      const gen = { prompt: rw.prompt, n: 1, size: '1024x1024', ...(images.length ? { images: images.map((u) => ({ image_url: u })) } : {}) };
      const hit = await runChain({ cfg, state, name, kind: 'image', body: gen, attempt: attempt(images.length ? '/images/edits' : '/images/generations', 200_000), onFail });
      ctx.waitUntil(save());
      if (!hit.ok) return json(hit.status, err(hit.msg, 'upstream_error'));
      let j; try { j = JSON.parse(await hit.r.res.text()); } catch (e) { return json(502, err(`出图回包不是 JSON:${e.message}`, 'upstream_error')); }
      record({ ...hit, ok: true, status: hit.r.status, ms: Date.now() - hit.t0, usage: null, error: null });
      const links = (j.data || []).map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null)).filter(Boolean);
      const content = links.map((u) => `![出图](${u})`).join('\n') + `\n\n${rw.note || '我把你的描述改写成了英文提示词'}${rw0.template ? `(模板「${rw0.template.name}」)` : ''}\n改写后的提示词(可复制,改了再发一次就按你的来;开头写「原样:」则不改写):\n${rw.prompt}${rw.negative ? `\n负面词:${rw.negative}` : ''}\n\n模型 ${hit.model}(云版回的是上游临时链接,会过期)`;
      return new Response(chatEnvelope(name, content, stream), { headers: { ...hdrs(hit), 'content-type': stream ? 'text/event-stream' : 'application/json; charset=utf-8' } });
    }

    if (isChat) body = deptGuard(body, req.headers.get('x-bohui-dept'), cfg.cost_depts || COST_DEPTS);   // 部门守则(15:5x)
    const urlPath = isChat ? '/chat/completions' : p.slice(3), timeoutMs = isChat ? 120_000 : 200_000;
    const hit = await runChain({ cfg, state, name, kind: isChat ? 'chat' : 'image', body, attempt: attempt(urlPath, timeoutMs), onFail });
    if (!hit.ok) { ctx.waitUntil(save()); return json(hit.status, err(hit.msg, hit.status === 404 ? 'model_not_found' : 'upstream_error')); }
    const h = { ...hdrs(hit), 'content-type': hit.r.res.headers.get('content-type') || 'application/json' };
    if (isChat && body.stream === true && hit.r.res.body) {
      const [toClient, toTap] = hit.r.res.body.tee();
      ctx.waitUntil((async () => {   // 旁路读一份,只为捞最后一个 usage
        let usage = null, buf = '', error = null; const dec = new TextDecoder();
        try { for await (const chunk of toTap) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { usage = sseUsage(buf.slice(0, i), usage); buf = buf.slice(i + 1); } } }
        catch (e) { error = `流中断:${e.message}`; }
        record({ ...hit, ok: !error, status: 200, ms: Date.now() - hit.t0, usage, error }); await save();
      })());
      return new Response(toClient, { status: 200, headers: { ...h, 'cache-control': 'no-cache' } });
    }
    const text = hit.bodyText ?? await hit.r.res.text();
    let usage = null; try { usage = JSON.parse(text).usage || null; } catch { }
    record({ ...hit, ok: true, status: hit.r.status, ms: Date.now() - hit.t0, usage, error: null });
    ctx.waitUntil(save());
    return new Response(text, { status: hit.r.status, headers: h });
  },
};
