import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { upgradeArticles } from '../../../lib/news';

export const prerender = false;

/**
 * 存量薄稿升级:早期 200 字快讯 ≠ 现行深度稿标准(创始人:「内容编辑的太少了」)。
 * 本机驱动器抓回原文底料 → 这里按现行 EDIT_RULES + 校验闸门重写正文,
 * 只更新 body/summary(标题、slug、日期、浏览数全部不动 —— URL 与统计连续性优先)。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || !timingSafeEqual(request.headers.get('x-cron-key') ?? '', key)) {
    return new Response(JSON.stringify({ ok: false }), { status: 403 });
  }
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return new Response(JSON.stringify({ ok: false, msg: 'no db' }), { status: 500 });

  const b = (await request.json().catch(() => ({}))) as {
    upgrades?: { id: number; excerpt: string }[];
  };
  const ups = (Array.isArray(b.upgrades) ? b.upgrades : [])
    .filter((u) => Number.isFinite(u?.id) && typeof u?.excerpt === 'string' && u.excerpt.length > 400)
    .slice(0, 8)
    .map((u) => ({ id: Number(u.id), excerpt: String(u.excerpt).slice(0, 3500) }));
  const r = await upgradeArticles(env, db, ups);
  return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'content-type': 'application/json' } });
};
