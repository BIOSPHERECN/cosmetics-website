/**
 * 媒体分发 —— 公开路由,前台 <img src="/media/12"> 直接取。
 *
 * 走 immutable 长缓存:媒体一旦上传就不再变(要换图就换 id),
 * 这样 Cloudflare 边缘会替我们扛住绝大多数请求,D1 只被回源打一次。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const db = (env as any).DB as D1Database | undefined;
  const id = Number(params.id);
  if (!db || !Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const row = await db.prepare(`SELECT mime, data, url, driver FROM media WHERE id=?`).bind(id)
    .first<{ mime: string; data: unknown; url: string | null; driver: string }>();
  if (!row) return new Response('Not found', { status: 404 });

  // 外链驱动(将来 R2)只做 302,不代理流量
  if (row.driver !== 'd1' && row.url) return Response.redirect(row.url, 302);

  // D1 取回 BLOB 时给的是**数字数组**,不是 ArrayBuffer。
  // 直接塞进 Response 会得到一个 0 字节的空体 —— 存进去是对的、传出来是空的,
  // 这种错最难查,因为两端各看一半都"正常"。所以三种形态都显式处理。
  const body =
    row.data instanceof ArrayBuffer ? row.data
    : ArrayBuffer.isView(row.data) ? (row.data as ArrayBufferView)
    : Array.isArray(row.data) ? new Uint8Array(row.data as number[])
    : null;
  if (!body || (body as ArrayBuffer).byteLength === 0) return new Response('Not found', { status: 404 });

  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
