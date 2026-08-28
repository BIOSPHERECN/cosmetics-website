/**
 * 媒体分发 —— 公开路由,前台 <img src="/media/12"> 直接取。
 *
 * 走 immutable 长缓存:媒体一旦上传就不再变(要换图就换 id),
 * 这样 Cloudflare 边缘会替我们扛住绝大多数请求,D1 只被回源打一次。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const id = Number(params.id);
  if (!db || !Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const row = await db.prepare(`SELECT mime, data, url, driver FROM media WHERE id=?`).bind(id)
    .first<{ mime: string; data: unknown; url: string | null; driver: string }>();
  if (!row) return new Response('Not found', { status: 404 });

  // 外链驱动(R2 / 站内静态)只做 302,不代理流量。
  // 注意 Response.redirect 只吃绝对地址,给它 '/media/shots/x.jpg' 会直接抛 —— 
  // 而抛在这里的表现是整张图 500,页面上只剩一个破图标,不容易联想到是这一行。
  if (row.driver !== 'd1' && row.url) {
    const to = new URL(row.url, request.url).toString();
    return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'public, max-age=3600' } });
  }

  // D1 取回 BLOB 时给的是**数字数组**,不是 ArrayBuffer。
  // 直接塞进 Response 会得到一个 0 字节的空体 —— 存进去是对的、传出来是空的,
  // 这种错最难查,因为两端各看一半都"正常"。所以三种形态都显式处理。
  const body =
    row.data instanceof ArrayBuffer ? row.data
    : ArrayBuffer.isView(row.data) ? (row.data as ArrayBufferView)
    : Array.isArray(row.data) ? new Uint8Array(row.data as number[])
    : null;
  if (!body || (body as ArrayBuffer).byteLength === 0) return new Response('Not found', { status: 404 });

  /*
   * SVG 是可执行文档,不是图片。
   *
   * 它能内嵌 <script>,而 /media/12 这种地址是**可以被直接打开**的 ——
   * 一旦有人上传一张带脚本的 SVG,那段脚本就在本站域下运行。
   * 会话 cookie 是 HttpOnly 偷不走,但同源意味着它能替登录中的运营
   * 去调后台接口(SameSite=Lax 不挡同站请求)。
   * nosniff 只防"把别的类型嗅探成 HTML",防不住 SVG 本来就该被当文档渲染。
   *
   * 处置:不下架 SVG(logo 用矢量是正当需求),而是给它一条最严的 CSP。
   * sandbox 让它以无源方式载入,script 直接不执行;
   * default-src 'none' 断掉它对外发请求的能力。
   */
  const headers: Record<string, string> = {
    'Content-Type': row.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  if (row.mime === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new Response(body as BodyInit, { headers });
};
