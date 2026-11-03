import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { collectNews, publishLead } from '../../../lib/news';

export const prerender = false;

/** 行业资讯管理:手动采集一轮 / 投喂线索(小红书、公众号等国内渠道)/ 上下线 / 删除。
 *  定时采集走 /api/cron/news(独立钥匙)。 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;

  if (b.action === 'feed') {
    const title = String(b.title ?? '').trim().slice(0, 200);
    const url = String(b.url ?? '').trim().slice(0, 500);
    const source = String(b.source ?? '').trim().slice(0, 80) || '人工投喂';
    if (!title || !/^https?:\/\//.test(url)) return json({ ok: false, msg: '标题和来源链接必填(链接要带 http)' }, 400);
    const r = await publishLead(env, c.db, { title, url, source, notes: String(b.notes ?? '') });
    if (r.ok) await logRevision(c.db, 'news', 0, null, null, { feed: title }, c.sess.uid);
    return json(r, r.ok ? 200 : 502);
  }

  const r = await collectNews(env, c.db, 15);
  await logRevision(c.db, 'news', 0, null, null, { collected: r.inserted }, c.sess.uid);
  return json({ ok: true, ...r });
};

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, is_published } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  await c.db.prepare(`UPDATE news SET is_published=? WHERE id=?`).bind(is_published ? 1 : 0, id).run();
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  const before = await c.db.prepare(`SELECT slug, title_zh FROM news WHERE id=?`).bind(id).first();
  await c.db.prepare(`DELETE FROM news WHERE id=?`).bind(id).run();
  await logRevision(c.db, 'news', id, null, before, null, c.sess.uid);
  return json({ ok: true });
};
