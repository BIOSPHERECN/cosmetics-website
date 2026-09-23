/**
 * 推演沙盘接口(任务 S,2026-09-18)。op 式单 POST,照 formula-lab.ts。
 * 分步推进:Worker 单请求有时限,一次跑完「抽实体 + 建 Agent + 3 轮 × 8 人 + 报告」必超时;
 * 所以 op=step 每次只按 sandbox_runs.step 推一格,页面每 3 秒调一次直到 done / failed。
 * 角色:admin / editor / lab / sales(guard.ts 的 SALES_OK 与 lab 分支放行 'sandbox');viewer 只能 GET(list / get 走 POST,所以 viewer 看不了 —— 与 formula-lab 同口径)。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, type Ctx } from '../../../lib/guard';
import { extractEntities, buildAgents, runRound, report, nextStep, type RunRow, type StepOut } from '../../../lib/sandbox';

export const prerender = false;
const str = (v: unknown, max = 2000): string => String(v ?? '').trim().slice(0, max);
const COLS = `id,title,brief,market,category,entities_json,agents_json,rounds,step,transcript_json,report_json,status,tokens_in,tokens_out,error,created_by,created_at,finished_at`;

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  try {
    switch (b.op) {
      case 'create': return await opCreate(c, b);
      case 'step':   return await opStep(c, b);
      case 'get':    return await opGet(c, b);
      case 'list':   return await opList(c);
      default:       return json({ ok: false, msg: '未知操作' }, 400);
    }
  } catch (e) {
    return json({ ok: false, msg: `失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};

async function opCreate(c: Ctx, b: any) {
  const brief = str(b.brief, 2000);
  if (!brief) return json({ ok: false, msg: '议题必填' }, 400);
  const rounds = Math.min(4, Math.max(1, Number(b.rounds) || 3));   // 上限 4:每轮 8 次 chat,再多就是烧算力不是推演
  const market = str(b.market, 8).toLowerCase() || 'gl';           // market_products.country 口径
  const category = str(b.category, 40);
  const title = str(b.title, 120) || brief.slice(0, 40);
  const r = await c.db.prepare(`INSERT INTO sandbox_runs (title, brief, market, category, rounds, step, status, created_by) VALUES (?,?,?,?,?,'new','running',?) RETURNING id`)
    .bind(title, brief, market, category, rounds, c.sess.email ?? null).first<{ id: number }>();
  return json({ ok: true, id: r?.id });
}

async function load(c: Ctx, id: number): Promise<RunRow | null> {
  return await c.db.prepare(`SELECT ${COLS} FROM sandbox_runs WHERE id=?`).bind(id).first<RunRow>();
}

/** 按 step 推一格;失败写 error + status='failed',页面停轮询 */
async function opStep(c: Ctx, b: any) {
  const id = Number(b.id);
  const run = await load(c, id);
  if (!run) return json({ ok: false, msg: '没有这条推演' }, 404);
  if (run.status !== 'running') return json({ ok: true, step: run.step, status: run.status });
  const next = nextStep(run.step, run.rounds);
  try {
    let out: StepOut;
    if (next === 'entities') out = await extractEntities(env as any, c.db, run.brief, run.market, run.category, run.id);
    else if (next === 'agents') out = { patch: { agents_json: JSON.stringify(await buildAgents(c.db, JSON.parse(run.entities_json ?? '{}'))) }, tokens: { in: 0, out: 0 } };
    else if (/^round\d+$/.test(next)) out = await runRound(env as any, c.db, run, Number(next.slice(5)));
    else if (next === 'report') out = await report(env as any, c.db, run);
    else out = { patch: {}, tokens: { in: 0, out: 0 } };
    const done = next === 'report';   // 报告写完即 done(nextStep('report') 才是 'done',这里一步并掉,省一次轮询)
    const step = done ? 'done' : next;
    const keys = Object.keys(out.patch);
    await c.db.prepare(
      `UPDATE sandbox_runs SET step=?, tokens_in=tokens_in+?, tokens_out=tokens_out+?${keys.map((k) => `, ${k}=?`).join('')}${done ? `, status='done', finished_at=CURRENT_TIMESTAMP` : ''} WHERE id=?`,
    ).bind(step, out.tokens.in, out.tokens.out, ...keys.map((k) => out.patch[k]), id).run();   // 列名来自 lib 固定集合(entities_json/agents_json/transcript_json/report_json),值全部绑定
    return json({ ok: true, step, status: done ? 'done' : 'running' });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await c.db.prepare(`UPDATE sandbox_runs SET status='failed', error=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).bind(`${next}:${msg}`, id).run();
    return json({ ok: false, step: run.step, status: 'failed', msg }, 500);
  }
}

async function opGet(c: Ctx, b: any) {
  const run = await load(c, Number(b.id));
  return run ? json({ ok: true, run }) : json({ ok: false, msg: '没有这条推演' }, 404);
}

async function opList(c: Ctx) {
  const { results } = await c.db.prepare(`SELECT id,title,market,category,rounds,step,status,tokens_in,tokens_out,created_by,created_at FROM sandbox_runs ORDER BY id DESC LIMIT 30`).all();
  return json({ ok: true, runs: results ?? [] });
}
