import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { r2Get, type StorageEnv } from '../../lib/storage';

export const prerender = false;

/**
 * 站内静态资产分发 —— 设计效果图与视频。
 *
 * 为什么不复用 /media/{id}:那条路要先查 D1 拿 r2_key,一次一行虽然便宜,
 * 但这批东西的地址是要写进页面、写进 JSON-LD、被 AI 抓走的 ——
 * 地址应该是**人能读懂的路径**,而不是一个自增数字。
 * `/asset/design/ST-A1044-4-light.png` 一眼看得出是什么;`/media/318` 看不出。
 *
 * 为什么不复用 /pack/{code}:那条按编码拼 `media/pack/{目录}/{编码}.webp`,
 * 规则写死在里面。这里要的是任意子路径,两件事不该挤在一条路由上。
 *
 * 安全:**前缀白名单 + 挡路径穿越**。不做形状正则去猜文件名长什么样 ——
 * 2026-09-07 的教训:形状正则挡掉了 182 款图在 R2 里、库里也有的包材,
 * 页面上全是破图。取不到就 404 是 R2 该管的事,路由只该管安全。
 *
 * 缓存:这批资产一旦生成就不再变(要换就换文件名),给 immutable 长缓存。
 */
const OK_PREFIX = ['design/', 'video/', 'origin/', 'ingredients/'];   // ingredients/structures/<slug>.png 结构图(创始人 09-17:「他们还有图片…图文的方式展示」)

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', avif: 'image/avif',
};

export const GET: APIRoute = async ({ params }) => {
  const rel = String(params.path ?? '').replace(/^\/+/, '');
  if (!rel || rel.includes('..') || !OK_PREFIX.some((p) => rel.startsWith(p))) {
    return new Response('Not found', { status: 404 });
  }
  const ext = (rel.split('.').pop() ?? '').toLowerCase();
  const type = MIME[ext];
  if (!type) return new Response('Not found', { status: 404 });

  const res = await r2Get(env as unknown as StorageEnv, `media/${rel}`).catch(() => null);
  if (!res || !res.ok) return new Response('Not found', { status: 404 });

  return new Response(res.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
