import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runEcomCollect } from '../../../lib/cron-tasks';

export const prerender = false;

/**
 * 爆款单品采集 —— 手动触发 / 验证用(cron 每日 04:00 UTC 自动跑,与 trend-collect 并行)。
 * 逻辑本体在 lib/cron-tasks.ts runEcomCollect,与 scheduled 共用一套。
 * GET /api/cron/ecom-collect   (header: x-cron-key)
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false, msg: 'forbidden' }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  const t0 = Date.now();
  try {
    const sum = await runEcomCollect(env, db);
    return json({ ok: true, ms: Date.now() - t0, ...(sum || {}) });
  } catch (e) {
    return json({ ok: false, msg: String((e as Error).message || e).slice(0, 200) }, 500);
  }
};