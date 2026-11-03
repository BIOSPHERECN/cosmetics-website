import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runDesign, capabilities, type DesignTask } from '../../../lib/design-models';
import { overQuota, recordUse, tooMany, clientId } from '../../../lib/ratelimit';
import { aiDailyCheck, aiBudgetResponse } from '../../../lib/fuse';

export const prerender = false;

/**
 * 设计任务端点（2026-10-29）—— 先服务「视频」这一类，同时暴露能力清单。
 *
 * GET  /api/ai/video            → 当前能做什么（哪些任务已就绪、缺什么密钥）
 * POST /api/ai/video            → 提交一次生成任务
 *      { task: 't2v'|'i2v', prompt, imageUrl?, duration?, aspect? }
 *
 * LibTV 未接入时返回 503 + need:'config' + 缺哪个 secret，**不假装成功**。
 * 接入后（wrangler secret put LIBTV_API_KEY）本端点无需改动。
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async () => {
  return json({ ok: true, capabilities: await capabilities(env as any) });
};

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const who = clientId(request);
  if (await overQuota(db, 'ai.video', who)) return tooMany('ai.video');

  let body: any = {};
  try { body = await request.json(); } catch { return json({ ok: false, msg: 'bad json' }, 400); }

  const task = String(body.task ?? 't2v') as DesignTask;
  if (task !== 't2v' && task !== 'i2v') return json({ ok: false, msg: '仅支持 t2v / i2v' }, 400);

  const prompt = String(body.prompt ?? '').trim().slice(0, 800);
  const imageUrl = body.imageUrl ? String(body.imageUrl).slice(0, 500) : undefined;
  if (task === 't2v' && prompt.length < 3) return json({ ok: false, msg: '请填写视频描述（至少 3 个字）' }, 400);
  if (task === 'i2v' && !imageUrl) return json({ ok: false, msg: '图生视频需要 imageUrl' }, 400);

  /* 全站日预算:视频单价最高,按 2 计(生成 + 可能的重试);
     计在生成**之前** —— 模型被调用了就是花了钱,不论这次是否成功。 */
  if (!(await aiDailyCheck({ db, cap: (env as any).AI_DAILY_CAP, cost: 2 })).ok) return aiBudgetResponse();

  try {
    const r = await runDesign(env as any, {
      task, prompt, imageUrl,
      duration: Number(body.duration) || 5,
      aspect: ['1:1', '16:9', '9:16', '4:3'].includes(body.aspect) ? body.aspect : '1:1',
    });
    await recordUse(db, 'ai.video', who);
    await db?.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('ai-video',?,?,datetime('now'),datetime('now'))`)
      .bind(`task=${task} provider=${r.provider} n=${r.urls.length}`, r.urls.length ? 'ok' : 'fail').run().catch(() => {});
    return json({ ok: true, provider: r.provider, urls: r.urls });
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    const needConfig = /缺 |未接入|LIBTV_API_KEY/.test(msg);
    return json({ ok: false, need: needConfig ? 'config' : undefined, msg, capabilities: needConfig ? await capabilities(env as any) : undefined },
      needConfig ? 503 : 502);
  }
};
