import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { canSend, sendMail } from '../../../lib/mail';
import { acceptInquiry, assignInquiry, listPendingAccept, migrationHint, readInquiryLoop } from '../../../lib/rfq-loop';

export const prerender = false;

/* 询盘对话流:B2B 成单是多轮往来,单向收件盒记不住「聊到哪了」。
   状态五档覆盖完整生命周期;每次状态变更与每条跟进都进 inquiry_notes,
   详情页时间线按序回放 —— 换人接手时不用翻邮箱猜上下文。 */
const OK = new Set(['new', 'following', 'replied', 'won', 'archived']);

/** 指派通知。发信失败只返回 ok:false，调用方不回滚已写入的负责人。 */
async function notifyAssignee(m: { to: string; subject: string; text: string }): Promise<{ ok: boolean; msg?: string }> {
  if (!canSend(env)) return { ok: false, msg: 'mail-not-configured' };
  try {
    const r = await sendMail(env as any, { to: [m.to], subject: m.subject, text: m.text });
    return r.ok ? { ok: true } : { ok: false, msg: r.msg || 'send-failed' };
  } catch (e) {
    return { ok: false, msg: (e instanceof Error ? e.message : String(e)).slice(0, 180) };
  }
}

function fail(e: unknown, fallback: string): Response {
  const hint = migrationHint(e);
  return json({ ok: false, msg: hint ?? fallback }, hint ? 503 : 500);
}

/** 闭环查询。id=线索编号；pending=1 列出尚未接单的线索（仍可查）。 */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get('pending') === '1') {
      const rows = await listPendingAccept(c.db, c.tenant.siteId, url.searchParams.get('test') === '1');
      return json({ ok: true, pending: rows });
    }
    const id = Number(url.searchParams.get('id'));
    if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
    const loop = await readInquiryLoop(c.db, id, c.tenant.siteId);
    if (!loop) return json({ ok: false, msg: '询盘不存在' }, 404);
    return json(loop);
  } catch (e) {
    return fail(e, '读取失败');
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status } = (await request.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!id || !status || !OK.has(status)) return json({ ok: false, msg: '参数不合法' }, 400);
  /* 2026-09-26: every inquiry read/write is scoped to the caller's site, same as the list page (inquiries.astro). */
  const before = await c.db.prepare(`SELECT status FROM inquiries WHERE id=? AND site_id=?`).bind(id, c.tenant.siteId)
    .first<{ status: string }>();
  if (!before) return json({ ok: false, msg: '询盘不存在' }, 404);
  await c.db.prepare(`UPDATE inquiries SET status=? WHERE id=? AND site_id=?`).bind(status, id, c.tenant.siteId).run();
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
  const b = (await request.json().catch(() => ({}))) as { id?: number; text?: string; op?: string; assignee_uid?: number; assignee_email?: string; note?: string };
  if (b.op === 'assign' || b.op === 'accept') {
    try {
      const r = b.op === 'assign'
        ? await assignInquiry(c.db, {
          id: Number(b.id),
          siteId: c.tenant.siteId,
          actorUid: c.sess.uid,
          assigneeUid: b.assignee_uid != null ? Number(b.assignee_uid) : undefined,
          assigneeEmail: b.assignee_email,
          notify: notifyAssignee,
        })
        : await acceptInquiry(c.db, {
          id: Number(b.id),
          siteId: c.tenant.siteId,
          actorUid: c.sess.uid,
          actorRole: String(c.sess.role ?? ''),
          note: String(b.note ?? b.text ?? ''),
        });
      if (!r.ok) return json({ ok: false, msg: r.msg }, r.status);
      return json(r.loop);
    } catch (e) {
      return fail(e, b.op === 'assign' ? '指派失败' : '接单失败');
    }
  }
  const { id, text } = b;
  const body = (text ?? '').trim();
  if (!id || !body) return json({ ok: false, msg: '跟进内容不能为空' }, 400);
  if (body.length > 2000) return json({ ok: false, msg: '单条跟进最长 2000 字' }, 400);
  const exists = await c.db.prepare(`SELECT id FROM inquiries WHERE id=? AND site_id=?`).bind(id, c.tenant.siteId).first();
  if (!exists) return json({ ok: false, msg: '询盘不存在' }, 404);
  const r = await c.db.prepare(
    `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?,'note',?) RETURNING id, created_at`
  ).bind(id, c.sess.uid, body).first<{ id: number; created_at: string }>();
  return json({ ok: true, id: r?.id, created_at: r?.created_at });
};
