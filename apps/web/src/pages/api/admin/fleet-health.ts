import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE } from '../../../lib/auth';
import { health } from '../../../lib/fleet';

export const prerender = false;

/**
 * 舰队体检 —— 后台「模型」页调用。
 * 只回状态与耗时,**永不回显任何 key**。
 * 古方线吃过亏:配错 base 导致整批 0 产出却无人察觉,所以体检必须是随手可点的。
 */
export const GET: APIRoute = async ({ request, url }) => {
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(request.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess) return new Response('未登录', { status: 401 });

  const only = url.searchParams.get('id');
  let list = await health(env as any);
  if (only) list = list.filter((x) => x.id === only);

  return new Response(JSON.stringify({ ok: true, list }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
