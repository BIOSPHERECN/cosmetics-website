/**
 * 自家点选码 · 出题(安全架构 v1 L3,两站字节一致)。GET /api/cap/new?k=login|search|form|acct
 *
 * 零 D1:批次读 KV「cap:cur」(本隔离区记 60 秒);题图先查 Cache API(免费、同机房共享),
 * 未命中才读 KV「cap:{批次}:{题号}」—— 值是 webp,元数据 a 是答案密文 —— 并回填 7 天。
 * 同一 IP 段一小时答错满 6 次,交卷接口会在 Cache API 记 10 分钟冷却,这里回 429。
 * 返回 {t, img(base64 webp), w, h, hy, hw, n}:图的上 hy 像素是主图,下方左侧 hw 宽是提示字条;令牌 120 秒有效。
 * 图片随 JSON 下发,没有可枚举的图片地址;没配 CAP_SECRET 或 KV 绑定 CAPBANK 时 503(fail closed)。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { KINDS, b64u, ipNet, issueToken } from '../../../lib/captcha';

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

type Cur = { w: string; n: number; iw: number; ih: number; hy: number; hw: number; c: number };
let cur: { at: number; v: Cur } | null = null;

export const GET: APIRoute = async ({ request, url, locals }) => {
  const E = env as any, secret = String(E.CAP_SECRET ?? ''), kv = E.CAPBANK as KVNamespace | undefined;
  if (!secret || !kv) return json({ ok: false, code: 'off' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  if (await cache?.match(`https://cap.internal/cool/${encodeURIComponent(ipNet(ip, 24, 64))}`)) return json({ ok: false, code: 'limit' }, 429);

  if (!cur || Date.now() - cur.at > 60_000) {
    const v = await kv.get<Cur>('cap:cur', { type: 'json', cacheTtl: 300 });
    if (!v?.w || !(v.n > 0)) return json({ ok: false, code: 'off' }, 503);
    cur = { at: Date.now(), v };
  }
  const c = cur.v, i = crypto.getRandomValues(new Uint32Array(1))[0] % c.n;
  const key = `https://cap.internal/q/${c.w}/${i}`;
  let img: ArrayBuffer, a: string;
  const hit = await cache?.match(key);
  if (hit) {
    img = await hit.arrayBuffer();
    a = hit.headers.get('x-a') || '';
  } else {
    const r = await kv.getWithMetadata<{ a: string }>(`cap:${c.w}:${i}`, { type: 'arrayBuffer', cacheTtl: 3600 });
    if (!r.value || !r.metadata?.a) return json({ ok: false, code: 'off' }, 503);
    img = r.value;
    a = r.metadata.a;
    const put = cache?.put(key, new Response(img.slice(0), { headers: { 'cache-control': 'max-age=604800', 'x-a': a } }));
    const ctx = (locals as any)?.cfContext;
    if (put) ctx?.waitUntil ? ctx.waitUntil(put.catch(() => {})) : await put.catch(() => {});
  }
  const k = url.searchParams.get('k') || '';
  const t = await issueToken(secret, { w: c.w, a }, (KINDS as readonly string[]).includes(k) ? k : 'form', ip, request.headers.get('user-agent') || '');
  return json({ ok: true, t, img: b64u(new Uint8Array(img)), w: c.iw, h: c.ih, hy: c.hy, hw: c.hw, n: c.c });
};
