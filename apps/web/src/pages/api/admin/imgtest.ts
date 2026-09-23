import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/**
 * 出图连通性诊断 —— 只在排查时用,管理员限定。
 *
 * 立此接口的原因(2026-09-02):创始人说「网页上传也是可以出图」,
 * 而我们从 Worker 调必 429。要分清是**出口 IP 被拦**还是**同一请求里连打两条线
 * 触发了突发限流**,就得让 Worker 单独只打一次出图、前面什么都不做。
 * 不做这个隔离测试,就只能靠猜。
 */
export const GET: APIRoute = async ({ request, url }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  const row = await c.db.prepare(
    `SELECT base_url, model, api_keys FROM providers WHERE id=? AND enabled=1`
  ).bind(url.searchParams.get('id') ?? 'agnes-image')
    .first<{ base_url: string; model: string; api_keys: string }>();
  if (!row) return json({ ok: false, msg: '找不到该供应商' }, 404);

  const t0 = Date.now();
  const r = await fetch(`${row.base_url.replace(/\/+$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${row.api_keys.split(',')[0].trim()}`,
      /* 带上浏览器味道的头:若对方是按 UA/来源判定,这一组能验证出来 */
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      Accept: 'application/json',
    },
    body: JSON.stringify({ model: row.model, prompt: 'a plain white paper box on white background', n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(150_000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as any));

  const body = await r.text().catch(() => '');
  return json({
    ok: r.ok, status: r.status, ms: Date.now() - t0,
    body: body.slice(0, 300),
  });
};
