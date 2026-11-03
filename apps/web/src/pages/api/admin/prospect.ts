import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/* 定向外联名单的状态机:new(待发) → sent(已发) → replied(已回复) → meeting(约谈) → quoted(已报价) → won / lost;skip = 不合适。
   三个数字框架(触达 / 回复 / 报价)就从这几档直接数出来,不另记表。 */
const OK = new Set(['new', 'sent', 'replied', 'meeting', 'quoted', 'won', 'lost', 'skip']);

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status, note } = (await request.json().catch(() => ({}))) as { id?: number; status?: string; note?: string };
  if (!id || (!status && !note)) return json({ ok: false, msg: '参数不合法' }, 400);
  if (status && !OK.has(status)) return json({ ok: false, msg: '状态不合法' }, 400);
  const row = await c.db.prepare(`SELECT id, note FROM prospects WHERE id=?`).bind(id).first<{ id: number; note: string | null }>();
  if (!row) return json({ ok: false, msg: '不存在' }, 404);
  const text = (note ?? '').trim().slice(0, 2000);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  // 跟进记录直接追加在 note 字段:一家一段流水,换人接手看这一段就够(ponytail: 量大了再拆 prospect_notes 表)
  const merged = text ? `${row.note ? row.note + '\n' : ''}[${stamp}] ${text}` : row.note;
  await c.db.prepare(`UPDATE prospects SET status=COALESCE(?, status), note=?, updated_at=datetime('now') WHERE id=?`)
    .bind(status ?? null, merged ?? null, id).run();
  return json({ ok: true });
};

/** 导出 CSV:业务拿去 Instantly / 邮箱群发工具用。BOM + 防公式注入,同询盘导出 */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  if (c.sess.role !== 'admin') return json({ ok: false, msg: '整份名单只有管理员能导出;页面里可以逐家看' }, 403);   // 同 guard.ts 的导出限制
  const u = new URL(request.url);
  const min = Number(u.searchParams.get('min')) || 0;
  const { results } = await c.db.prepare(
    `SELECT brand, website, country, segment, icp_score, status, hook, email_subject, email_body, next_step, contact_channels
       FROM prospects WHERE icp_score >= ? AND status <> 'skip' ORDER BY icp_score DESC`).bind(min).all<any>();
  const head = ['brand', 'website', 'country', 'segment', 'icp_score', 'status', 'hook', 'email_subject', 'email_body', 'next_step', 'contact_channels'];
  const body = [head.join(','), ...results.map((r) => head.map((k) => cell(r[k])).join(','))].join('\r\n');
  return new Response('\ufeff' + body, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="prospects-${new Date().toISOString().slice(0, 10)}.csv"` } });
};
