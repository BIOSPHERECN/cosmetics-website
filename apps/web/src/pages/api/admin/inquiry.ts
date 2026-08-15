import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

const OK = new Set(['new', 'replied', 'archived']);

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status } = (await request.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!id || !status || !OK.has(status)) return json({ ok: false, msg: '参数不合法' }, 400);
  const before = await c.db.prepare(`SELECT status FROM inquiries WHERE id=?`).bind(id).first();
  await c.db.prepare(`UPDATE inquiries SET status=? WHERE id=?`).bind(status, id).run();
  await logRevision(c.db, 'inquiries', id, null, before, { status }, c.sess.uid);
  return json({ ok: true });
};
