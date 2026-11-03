import type { APIRoute } from 'astro';
import { apiGuard, json, requireAdmin } from '../../../lib/guard';
import { briefFlags } from '../../../lib/b2o';
import { genBrief, b2oLedger } from '../../../lib/b2o-auto';

export const prerender = false;

/* 机会简报生成助手(2026-09-24 W3):按 SOP 执行版《客户产品机会简报》v2 模板(表单模板/客户产品机会简报-v2.md)出**草稿**。
   - POST 手工出稿:只出稿、不落库、不发送;生成逻辑与自动流水线共用 lib/b2o-auto.ts 的 genBrief(提示词、脱敏、白名单模型都在那里);
   - PUT(09-24 C1)处理自动草稿 b2o_auto_drafts:save 顾问改稿 / approve、reject 只给管理员(审批人没定前默认管理员)/ sent 人在企业微信发完回来点 / replied 客户回了(停再触达阶梯)。
     批准时对正文算 SHA-256,点「已发」时重算,不一致(批准后又被改过)就拒绝,要重审。机检有商务数字或禁词的不能批,先改稿。 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as { id?: number; notes?: string; cat?: string };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, msg: '先选一个客户档案' }, 400);
  const g = await genBrief(c.db, id, String(b.notes ?? ''), String(b.cat ?? ''));
  return g.ok ? json(g) : json({ ok: false, msg: g.msg }, g.status ?? 502);
};

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const BLOCK = (f: string[]) => f.some((x) => x.startsWith('疑似商务数字') || x.startsWith('禁词'));

export const PUT: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as { draft?: number; op?: string; body?: string };
  const d = await c.db.prepare(`SELECT * FROM b2o_auto_drafts WHERE id=?`).bind(Number(b.draft) || 0).first<any>();
  if (!d) return json({ ok: false, msg: '草稿不存在' }, 404);
  const who = `uid:${c.sess.uid}`, db = c.db;

  if (b.op === 'save') {
    if (d.status !== 'draft') return json({ ok: false, msg: '只有待审草稿能改;已批准的要先退回' }, 409);
    const body = String(b.body ?? '').slice(0, 20000);
    const flags = briefFlags(body);
    await db.prepare(`UPDATE b2o_auto_drafts SET body=?, flags=?, updated_at=datetime('now') WHERE id=?`).bind(body, JSON.stringify(flags), d.id).run();
    return json({ ok: true, flags });
  }
  if (b.op === 'approve' || b.op === 'reject') {
    const deny = requireAdmin(c); if (deny) return deny;
    if (b.op === 'reject') {
      if (!['draft', 'approved'].includes(d.status)) return json({ ok: false, msg: '这条不能退回' }, 409);
      await db.prepare(`UPDATE b2o_auto_drafts SET status='draft', approved_by=NULL, approved_at=NULL, approved_hash=NULL, updated_at=datetime('now') WHERE id=?`).bind(d.id).run();
      return json({ ok: true, msg: '已退回,顾问改完再批' });
    }
    if (d.status !== 'draft') return json({ ok: false, msg: '只有待审草稿能批' }, 409);
    const flags = briefFlags(String(d.body ?? ''));
    if (BLOCK(flags)) return json({ ok: false, msg: `机检没过,先改稿:${flags.join(';')}` }, 422);
    const h = await sha(String(d.body ?? ''));
    await db.prepare(`UPDATE b2o_auto_drafts SET status='approved', approved_by=?, approved_at=datetime('now'), approved_hash=?, updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(who, h, d.id).run();
    await b2oLedger(db, d.profile_id, 'send_approval', { draft_id: d.id, kind: d.kind, approved_hash: h }, who, 'human');
    return json({ ok: true, msg: '已批准:顾问现在可以复制,在企业微信里发出后点「已发」' });
  }
  if (b.op === 'sent') {
    if (d.status !== 'approved') return json({ ok: false, msg: '没批准的不能发' }, 409);
    if ((await sha(String(d.body ?? ''))) !== d.approved_hash) return json({ ok: false, msg: '批准后正文被改过,要重新审批' }, 409);
    await db.prepare(`UPDATE b2o_auto_drafts SET status='sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).bind(d.id).run();
    if (d.kind === 'brief') await db.prepare(`UPDATE b2o_profiles SET brief_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).bind(d.profile_id).run();
    await b2oLedger(db, d.profile_id, 'sent_marked', { draft_id: d.id, kind: d.kind, approved_hash: d.approved_hash }, who, 'human');
    return json({ ok: true, msg: d.kind === 'brief' ? '已记「已发」:第 3 / 7 / 14 天会自动出再触达草稿' : '已记「已发」' });
  }
  if (b.op === 'replied') {
    await db.prepare(`UPDATE b2o_profiles SET status='replied', updated_at=datetime('now') WHERE id=?`).bind(d.profile_id).run();
    await b2oLedger(db, d.profile_id, 'status_change', { to: 'replied', draft_id: d.id }, who, 'human');
    return json({ ok: true, msg: '已记「客户回了」,再触达阶梯停止' });
  }
  return json({ ok: false, msg: '未知操作' }, 400);
};
