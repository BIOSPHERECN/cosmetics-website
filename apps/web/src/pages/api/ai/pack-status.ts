import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 定制出图进度查询 —— 前端下单后每几秒问一次。
 *
 * 公开接口但只按 id 回一条极少的信息(状态 + 图片地址),不回提示词、不回客户填的需求,
 * 所以即便被人乱猜 id,也拿不到别人的内容。
 */
export const GET: APIRoute = async ({ url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const id = Number(url.searchParams.get('id'));
  if (!db || !Number.isFinite(id)) {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const row = await db.prepare(`SELECT status, media_id FROM pack_jobs WHERE id=?`).bind(id)
    .first<{ status: string; media_id: number | null }>().catch(() => null);
  return new Response(JSON.stringify({
    ok: true,
    status: row?.status ?? 'unknown',
    url: row?.media_id ? `/media/${row.media_id}` : null,
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
