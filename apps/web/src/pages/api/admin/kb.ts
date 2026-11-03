import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

/** AI 客服知识库 CRUD —— 运营改条目,客服下一句就用新口径(现查现拼,无缓存层) */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  const category = String(b.category ?? '').trim().slice(0, 40);
  const title = String(b.title ?? '').trim().slice(0, 200);
  const content = String(b.content ?? '').trim().slice(0, 4000);
  const keywords = String(b.keywords ?? '').trim().slice(0, 400);
  const sort = Number(b.sort_order) || 100;
  if (!category || !title || !content) return json({ ok: false, msg: '分类、标题、内容都不能为空' }, 400);

  if (b.id) {
    const before = await c.db.prepare(`SELECT * FROM kb_entries WHERE id=?`).bind(b.id).first();
    if (!before) return json({ ok: false, msg: '条目不存在' }, 404);
    await c.db.prepare(
      `UPDATE kb_entries SET category=?, title=?, content=?, keywords=?, sort_order=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(category, title, content, keywords, sort, b.id).run();
    await logRevision(c.db, 'kb_entries', b.id, null, before, { category, title, content, keywords }, c.sess.uid);
    return json({ ok: true, id: b.id });
  }
  const r = await c.db.prepare(
    `INSERT INTO kb_entries (category, title, content, keywords, sort_order) VALUES (?,?,?,?,?) RETURNING id`,
  ).bind(category, title, content, keywords, sort).first<{ id: number }>();
  await logRevision(c.db, 'kb_entries', r?.id ?? 0, null, null, { category, title }, c.sess.uid);
  return json({ ok: true, id: r?.id });
};

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, is_published } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  await c.db.prepare(`UPDATE kb_entries SET is_published=?, updated_at=datetime('now') WHERE id=?`)
    .bind(is_published ? 1 : 0, id).run();
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  const before = await c.db.prepare(`SELECT * FROM kb_entries WHERE id=?`).bind(id).first();
  await c.db.prepare(`DELETE FROM kb_entries WHERE id=?`).bind(id).run();
  await logRevision(c.db, 'kb_entries', id, null, before, null, c.sess.uid);
  return json({ ok: true });
};
