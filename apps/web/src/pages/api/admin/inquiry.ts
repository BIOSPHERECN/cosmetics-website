import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

/* 询盘对话流:B2B 成单是多轮往来,单向收件盒记不住「聊到哪了」。
   状态五档覆盖完整生命周期;每次状态变更与每条跟进都进 inquiry_notes,
   详情页时间线按序回放 —— 换人接手时不用翻邮箱猜上下文。 */
const OK = new Set(['new', 'following', 'replied', 'won', 'archived']);

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status } = (await request.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!id || !status || !OK.has(status)) return json({ ok: false, msg: '参数不合法' }, 400);
  const before = await c.db.prepare(`SELECT status FROM inquiries WHERE id=?`).bind(id)
    .first<{ status: string }>();
  if (!before) return json({ ok: false, msg: '询盘不存在' }, 404);
  await c.db.prepare(`UPDATE inquiries SET status=? WHERE id=?`).bind(status, id).run();
  /* 状态变更进时间线:text 存机器码,展示层翻中文 —— 时间线不该被未来的改文案改历史 */
  await c.db.prepare(
    `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?,'status',?)`
  ).bind(id, c.sess.uid, `${before.status}→${status}`).run();
  await logRevision(c.db, 'inquiries', id, null, before, { status }, c.sess.uid);
  return json({ ok: true });
};

/** 追加一条跟进记录(打电话说了什么、发了什么报价、客户的口头反馈) */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, text } = (await request.json().catch(() => ({}))) as { id?: number; text?: string };
  const body = (text ?? '').trim();
  if (!id || !body) return json({ ok: false, msg: '跟进内容不能为空' }, 400);
  if (body.length > 2000) return json({ ok: false, msg: '单条跟进最长 2000 字' }, 400);
  const exists = await c.db.prepare(`SELECT id FROM inquiries WHERE id=?`).bind(id).first();
  if (!exists) return json({ ok: false, msg: '询盘不存在' }, 404);
  const r = await c.db.prepare(
    `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?,'note',?) RETURNING id, created_at`
  ).bind(id, c.sess.uid, body).first<{ id: number; created_at: string }>();
  return json({ ok: true, id: r?.id, created_at: r?.created_at });
};
