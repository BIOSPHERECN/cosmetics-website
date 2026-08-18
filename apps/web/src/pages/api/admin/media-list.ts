/**
 * 媒体清单 —— 给编辑器里的图片选择器用。
 * 只回展示需要的字段,不回 blob 本身(那是 /media/<id> 的事)。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const q = (url.searchParams.get('q') ?? '').trim();
  const where = q ? `WHERE filename LIKE ? OR IFNULL(alt_zh,'') LIKE ? OR folder LIKE ?` : '';
  const bind = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const { results } = await c.db.prepare(
    `SELECT id, filename, folder, width, height, bytes, mime
       FROM media ${where} ORDER BY created_at DESC, id DESC LIMIT 120`
  ).bind(...bind).all<any>();
  return json({ ok: true, list: results ?? [] });
};
