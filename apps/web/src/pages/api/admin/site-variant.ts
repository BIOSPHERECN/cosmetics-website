import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE } from '../../../lib/auth';

export const prerender = false;

/** 切换站点模板/风格 —— 只改 sites.variant 一个字段,前台下次请求即生效 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(request.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess) return new Response('未登录', { status: 401 });

  const { site, variant } = (await request.json().catch(() => ({}))) as { site?: string; variant?: string };
  if (!site || !variant) return new Response('参数不全', { status: 400 });

  // 记修订,便于回滚与追责
  const before = await db.prepare(`SELECT variant FROM sites WHERE id = ?`).bind(site).first<{ variant: string }>();
  await db.prepare(`UPDATE sites SET variant = ?, updated_at = datetime('now') WHERE id = ?`).bind(variant, site).run();
  await db
    .prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('site.variant', ?, ?, ?, ?)`)
    .bind(site, JSON.stringify(before ?? {}), JSON.stringify({ variant }), sess.uid)
    .run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
