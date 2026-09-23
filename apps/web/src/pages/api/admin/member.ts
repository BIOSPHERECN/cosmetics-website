/**
 * 网站会员改档位 / 停用(2026-09-23)。后台「网站会员」页的表单提交到这里;只给 admin(lib/guard ADMIN_ONLY 'member')。
 * 付费不接线上支付:谈妥后管理员把 free 改成 pro,下一次打开详情页即按每天 100 条算。
 */
import type { APIRoute } from 'astro';
import { apiGuard, logRevision } from '../../../lib/guard';

export const prerender = false;
const PLANS = ['free', 'pro'];
const STATUS = ['active', 'disabled'];
const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/bohui/members/?${q}` } });

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const f = await request.formData().catch(() => null);
  const id = Number(f?.get('id') ?? 0);
  const plan = String(f?.get('plan_id') ?? '');
  const status = String(f?.get('status') ?? 'active');
  if (!id || !PLANS.includes(plan) || !STATUS.includes(status)) return back('e=1');
  const before = await c.db.prepare(`SELECT plan_id, status FROM mb_members WHERE id = ?`).bind(id).first();
  if (!before) return back('e=1');
  await c.db.prepare(`UPDATE mb_members SET plan_id = ?, status = ? WHERE id = ?`).bind(plan, status, id).run();
  await logRevision(c.db, 'mb_members', id, null, before, { plan_id: plan, status }, c.sess.uid);
  return back(`ok=${id}`);
};
