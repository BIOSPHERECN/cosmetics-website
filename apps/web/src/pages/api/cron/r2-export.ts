/**
 * R2 导出口(2026-09-21 01:4x)—— 给平台(beauty2ai,创始人个人账号)搬图用。
 *
 * 由来:创始人「图片是不是没有搬迁到我的 CF」。09-07 之后上传的对象(包材 /pack/、效果图等)只在公司账号桶里,
 * 平台 Worker 绑的是他账号里同名的 bohui-photo,取不到 → 全站破图。
 * wrangler 没有 r2 object list,面板也没法批量导;这里用 PHOTO 绑定把「列键」和「取对象」开出来,
 * 本机脚本 tools/r2-mirror.py 逐个拉走再用创始人账号的 S3 凭证放进他的桶(不在边缘上带对方密钥)。
 *
 * 鉴权:x-cron-key = CRON_KEY(与其它 cron 口一致)。只读,不删不改。
 *   GET ?list=1&prefix=media/&cursor=…&n=1000  → {keys:[{key,size}], cursor, truncated}
 *   GET ?get=<key>                              → 对象本体(content-type 原样)
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  const bucket = (env as any).PHOTO as R2Bucket | undefined;
  if (!bucket) return json({ ok: false, error: 'no-bucket' }, 503);
  const u = new URL(request.url);
  const get = u.searchParams.get('get');
  if (get) {
    if (get.includes('..') || get.length > 300) return json({ ok: false }, 400);
    const obj = await bucket.get(get).catch(() => null);
    if (!obj) return new Response('Not found', { status: 404 });
    const h = new Headers(); obj.writeHttpMetadata(h); h.set('x-size', String(obj.size));
    if (!h.has('content-type')) h.set('content-type', 'application/octet-stream');
    return new Response(obj.body, { headers: h });
  }
  const prefix = (u.searchParams.get('prefix') ?? '').slice(0, 120);
  const cursor = u.searchParams.get('cursor') || undefined;
  const n = Math.max(1, Math.min(1000, Number(u.searchParams.get('n') ?? 1000) || 1000));
  const r = await bucket.list({ prefix, cursor, limit: n });
  return json({ ok: true, keys: r.objects.map((o) => ({ key: o.key, size: o.size })), cursor: r.truncated ? r.cursor : null, truncated: r.truncated });
};
