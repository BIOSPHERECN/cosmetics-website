import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runBuyerRadar } from '../../../lib/cron-tasks';

export const prerender = false;

/** 买家信号雷达 —— 手动触发 / 验证用(cron 每日 03:00 UTC 自动跑)
 *  GET /api/cron/buyer-radar   (header: x-cron-key) */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false, msg: 'forbidden' }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  const t0 = Date.now();
  try {
    const sum = await runBuyerRadar(env, db);
    return json({ ...sum, ms: Date.now() - t0 });
  } catch (e) {
    return json({ ok: false, msg: String((e as Error).message || e).slice(0, 200) }, 500);
  }
};