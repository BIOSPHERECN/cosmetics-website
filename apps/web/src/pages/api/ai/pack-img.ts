/**
 * 客户定制出图的唯一取图口 —— GET /api/ai/pack-img?m={media id}(09-24 代码审计 P1-2,照平台同日的 pack-img)。
 * 以前出图落在 media(folder='packjob'),走公开的 /media/{顺序号}:从 1 数到 N 就能看到所有客户的图。
 * 现在 /media/{id} 对 packjob 一律 404;这里只放行下单的会员本人与后台员工,其余一律 404(不是 403,不透露那张图在不在)。
 * 放在 /api/ 下是有意的:中间件的边缘缓存不碰 /api/,私有图不会被缓存成别人也能拿到的副本。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { r2Get, type StorageEnv } from '../../../lib/storage';
import { viewer } from '../../../lib/member';

export const prerender = false;
const nf = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ url, request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const m = Number(url.searchParams.get('m'));
  if (!db || !Number.isInteger(m) || m <= 0) return nf();
  const v = await viewer(request, env);
  if (!v.staff && v.mid == null) return nf();   // 既不是员工也没登录:不查库
  const row = await db.prepare(
    `SELECT md.mime, md.r2_key, j.member_id FROM media md JOIN pack_jobs j ON j.media_id = md.id
      WHERE md.id = ? AND md.folder = 'packjob' AND md.driver = 'r2' LIMIT 1`,
  ).bind(m).first<{ mime: string; r2_key: string | null; member_id: number | null }>().catch(() => null);
  if (!row?.r2_key || (!v.staff && row.member_id !== v.mid)) return nf();
  const res = await r2Get(env as unknown as StorageEnv, row.r2_key).catch(() => null);
  if (!res || !res.ok) return nf();
  return new Response(res.body, {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};
