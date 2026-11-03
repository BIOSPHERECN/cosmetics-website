import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { viewer } from '../../../lib/member';

export const prerender = false;

/**
 * 定制出图进度查询 —— 前端下单后每几秒问一次。
 *
 * 09-24(代码审计 P1-2,照平台同日的改法):以前「公开接口、按 id 回状态 + 图片地址」,id 是顺序号,
 * 从 1 数到 N 就能拿到所有客户的定制效果图。现在只回给下单的会员本人(或后台员工),其余一律 404,不透露那一单存不存在;
 * 图片地址换成按归属放行的 /api/ai/pack-img(/media/{id} 对客户出图已 404)。
 */
const nf = () => new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ url, request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const id = Number(url.searchParams.get('id'));
  if (!db || !Number.isInteger(id) || id <= 0) return nf();
  const v = await viewer(request, env);
  if (!v.staff && v.mid == null) return nf();   // 既不是员工也没登录:不查库
  const row = await db.prepare(`SELECT status, media_id, member_id FROM pack_jobs WHERE id=?`).bind(id)
    .first<{ status: string; media_id: number | null; member_id: number | null }>().catch(() => null);
  if (!row || (!v.staff && row.member_id !== v.mid)) return nf();
  return new Response(JSON.stringify({
    ok: true,
    status: row.status ?? 'unknown',
    url: row.media_id ? `/api/ai/pack-img?m=${row.media_id}` : null,
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
