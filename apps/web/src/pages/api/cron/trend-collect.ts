import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runTrendCollect } from '../../../lib/cron-tasks';

export const prerender = false;

/**
 * 爆款趋势收集 —— 手动触发 / 验证用(cron 每日 04:00 UTC 自动跑)。
 * 逻辑本体在 lib/cron-tasks.ts runTrendCollect,与 scheduled 共用一套,不再两边各写一份
 * (10-23:端点原来内嵌重复实现,与 cron 渐渐跑偏,诊断时两边结果还不一样)。
 * GET /api/cron/trend-collect   (header: x-cron-key)
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
    const sum = await runTrendCollect(env, db);
    return json({ ok: true, ms: Date.now() - t0, ...(sum || {}) });
  } catch (e) {
    return json({ ok: false, msg: String((e as Error).message || e).slice(0, 200) }, 500);
  }
};