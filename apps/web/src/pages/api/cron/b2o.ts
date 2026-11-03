import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runB2oAuto } from '../../../lib/b2o-auto';

export const prerender = false;

/**
 * BEAUTY2OEM 第一期自动化的 Cron 路由(2026-09-24 C1)。平时由 bohui-web 自己的 Cloudflare Cron(每 10 分钟,src/worker.ts)直接调 runB2oAuto,
 * 不经过这里;本路由给手工补跑和自测用(x-cron-key 鉴权,同其它 /api/cron/*)。?max= 本次最多调几次模型(默认 2,上限 5)。
 */
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const run: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  const max = Math.min(5, Math.max(0, Number(new URL(request.url).searchParams.get('max') ?? 2) || 0));
  return json({ ok: true, ...(await runB2oAuto(db, max)) });
};
export const GET = run;
export const POST = run;
