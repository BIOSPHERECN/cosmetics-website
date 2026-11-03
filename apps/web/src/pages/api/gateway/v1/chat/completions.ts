/**
 * 网关的对话端点 —— 形状照抄 OpenAI 的 /v1/chat/completions。
 *
 * 照抄不是偷懒,是**唯一能让别的工具零改动接进来**的形状:
 * 任何支持 OpenAI 的客户端(SDK、n8n、Dify、公众号排版脚本、Cursor)
 * 只要把 base_url 换成这里、key 换成网关 key,就直接能跑。
 * 自定义一套协议的下场是每接一个工具都要写一次适配器。
 *
 * 背后复用 fleet.ts:9 家分档降级、Anthropic 方言、失败原因记录,
 * 全部是现成的 —— 网关这一层只负责认人、限流、记账。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chat, loadFleet, paidFirst } from '../../../../../lib/fleet';
import { authKey, hasScope, bill, gwError } from '../../../../../lib/gateway';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return gwError('gateway not configured', 503, 'api_error');

  const auth = await authKey(db, request.headers.get('authorization'));
  if ('error' in auth) return gwError(auth.error, auth.status, auth.status === 429 ? 'rate_limit_error' : 'authentication_error');
  if (!hasScope(auth.key, 'chat')) return gwError('this key is not allowed to call chat', 403, 'permission_error');

  let body: any;
  try { body = await request.json(); } catch { return gwError('invalid JSON body', 400); }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages?.length) return gwError('messages is required', 400);
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(m.role)) {
      return gwError('each message needs a role of system/user/assistant and a string content', 400);
    }
  }

  const fleet = paidFirst(await loadFleet(db, env as any));
  if (!fleet.length) return gwError('no upstream model configured', 503, 'api_error');

  /* model 字段的处理值得说清楚:
     调用方传的 "gpt-4o" 之类我们并没有,但**不能报错** ——
     OpenAI 客户端几乎都会带一个 model 名,报错会让它们全部接不进来。
     所以:能对上舰队里某一家就用那家,对不上就按分档自动选,
     像一个"自动挡"。想指定的人传 provider id(如 "gemini")即可。 */
  const want = String(body?.model ?? '').trim();
  const picked = want ? fleet.filter((p) => p.id === want || p.model === want) : [];
  const use = picked.length ? picked : fleet;

  const t0 = Date.now();
  try {
    const r = await chat(env as any, messages, {
      fleet: use,
      temperature: typeof body?.temperature === 'number' ? body.temperature : undefined,
      maxTokens: typeof body?.max_tokens === 'number' ? body.max_tokens : undefined,
      json: body?.response_format?.type === 'json_object',
      timeoutMs: 60_000,
    });
    await bill(db, auth.key.id, { kind: 'chat', provider: r.provider, model: r.model, ms: r.ms, ok: true });

    // 回一个完整的 OpenAI 形状。usage 我们拿不到准确值,
    // 与其编一个数字,不如给 0 并在 x-bohui-* 头里说明真实来源。
    return new Response(JSON.stringify({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: r.model,
      choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), {
      headers: {
        'content-type': 'application/json',
        'x-bohui-provider': r.provider,     // 实际由哪一家应答 —— 排查时最想知道的一条
        'x-bohui-latency-ms': String(r.ms),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upstream failed';
    await bill(db, auth.key.id, { kind: 'chat', ms: Date.now() - t0, ok: false, err: msg });
    return gwError(msg, 502, 'api_error');
  }
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
    },
  });
