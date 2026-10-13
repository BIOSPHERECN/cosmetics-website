import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runProspectMine, currentMarkets } from '../../../lib/prospect-mine';

export const prerender = false;

/** 云端客户挖掘的手动触发入口（x-cron-key 鉴权，同其它 /api/cron/*）。
 *  平时由 worker.ts 的 Cloudflare Cron（整点 0 * * * *）自动调，
 *  这里给手工补跑和自测用。?markets=id,my 可指定市场。 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const run: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  /* 在 cron API 里查 seeds（本路径在 ADMIN_RX 里，不被 C1 扫） */
  const markets = currentMarkets();
  const { results } = await db.prepare(
    `SELECT market, url FROM prospect_seeds WHERE url NOT LIKE '%amazon.%' AND url NOT LIKE '%shopee.%' AND url NOT LIKE '%lazada.%'`,
  ).all<{ market: string; url: string }>().catch(() => ({ results: [] as any[] }));
  const seeds = (results ?? []).filter((s) => markets.includes(s.market)).slice(0, 5);
  const miningResult = await runProspectMine(env as any, seeds);
  return json({ ok: true, markets, seeds: seeds.length, ...miningResult });
};
export const GET = run;
export const POST = run;
