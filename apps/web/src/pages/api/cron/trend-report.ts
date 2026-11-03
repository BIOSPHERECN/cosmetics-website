import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runBuildTrendReport } from '../../../lib/cron-tasks';

export const prerender = false;

/**
 * 爆款监控报告生成端点 —— 手动触发 / 验证用(cron 每天 04:00 UTC 自动跑,这里留个门把手)。
 * GET /api/cron/trend-report?mode=day|week   (header: x-cron-key)
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false, msg: 'forbidden' }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
const qs = new URL(request.url).searchParams;
  const mode = qs.get('mode') === 'week' ? 'week' : 'day';
  const from = qs.get('from') ?? undefined;
  const backfill = qs.get('backfill') === '1';
  const t0 = Date.now();
  try {
    const sum = await runBuildTrendReport(env, db, { mode, from, backfill });
    const bj = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
    return json({ ok: true, mode, from: from ?? (mode === 'day' ? bj : (() => {
      const d = new Date(Date.now() + 8 * 36e5); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
      return d.toISOString().slice(0, 10);
    })()), ...(sum || {}), ms: Date.now() - t0 });
  } catch (e) {
    return json({ ok: false, msg: String((e as Error).message || e).slice(0, 200) }, 500);
  }
};