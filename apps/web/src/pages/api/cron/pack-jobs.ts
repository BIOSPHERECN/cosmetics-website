import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 定制出图任务的「领单 / 交单」接口 —— 给云端工人(GitHub Actions)用。
 *
 * 为什么不让工人直接连 D1:那要把 Cloudflare 账号 token 放进 GitHub,
 * 一旦泄漏就是整个账号。这里只暴露两个动作,凭 x-cron-key 校验,
 * 工人手里只有 CRON_KEY + Agnes key + R2 上传凭据,拿不到别的。
 *
 *   GET  → 领单:排队中(或租约过期)的任务最多 2 条,领到即标 processing 并记租约
 *   POST → 交单:{id, r2_key, bytes, mime} 登记 media 并把任务标 done;
 *          或 {id, err} 标 failed
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function guard(request: Request): Response | null {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  /* 领单要有租约(2026-09-03 审计):以前 GET 不改状态,工人被 GitHub 12 分钟超时杀掉后
     单子永远 queued 堵在队头,每 30 分钟重烧一次 Agnes 额度。现在:
       · 可领 = queued,或 processing 但租约超过 20 分钟(工人死了)
       · 领单即原子 UPDATE(changes=1 才算领到),attempts+1
       · attempts 已到 3 的直接置 failed,不再无限重试 */
  const claimable = `(status='queued' OR (status='processing' AND leased_at < datetime('now','-20 minutes')))`;
  await db.prepare(`UPDATE pack_jobs SET status='failed', err='3 次出图均未完成', done_at=datetime('now') WHERE ${claimable} AND attempts >= 3`).run();
  const { results } = await db
    .prepare(`SELECT id, prompt, lang FROM pack_jobs WHERE ${claimable} ORDER BY id LIMIT 2`)
    .all<{ id: number; prompt: string; lang: string }>();
  const jobs: { id: number; prompt: string; lang: string }[] = [];
  for (const j of results ?? []) {
    const r = await db.prepare(`UPDATE pack_jobs SET status='processing', leased_at=datetime('now'), attempts=attempts+1 WHERE id=? AND ${claimable}`).bind(j.id).run();
    if ((r.meta?.changes ?? 0) === 1) jobs.push(j);
  }
  return json({ ok: true, jobs });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);
  const b = (await request.json().catch(() => ({}))) as {
    id?: number; r2_key?: string; bytes?: number; mime?: string; err?: string;
  };
  const id = Number(b.id);
  if (!Number.isFinite(id)) return json({ ok: false, msg: 'id 缺失' }, 400);

  if (b.err) {
    await db.prepare(`UPDATE pack_jobs SET status='failed', err=?, done_at=datetime('now') WHERE id=? AND status IN ('queued','processing')`)
      .bind(String(b.err).slice(0, 200), id).run();
    return json({ ok: true, status: 'failed' });
  }
  /* 交单:键名必须落在 media/packjob/ 下 —— 工人只能往这一个"抽屉"放东西 */
  const key = String(b.r2_key ?? '');
  if (!/^media\/packjob\/\d+\.(webp|png|jpg)$/.test(key)) return json({ ok: false, msg: 'r2_key 不合法' }, 400);
  const row = await db
    .prepare(`INSERT INTO media (r2_key, filename, mime, bytes, folder, alt_zh, alt_en, driver)
              VALUES (?,?,?,?,'packjob',?,?,'r2') RETURNING id`)
    .bind(key, key.split('/').pop(), String(b.mime ?? 'image/webp').slice(0, 40), Number(b.bytes) || 0,
          `定制外包装图 #${id}`, `Custom packaging render #${id}`)
    .first<{ id: number }>();
  await db.prepare(`UPDATE pack_jobs SET status='done', media_id=?, done_at=datetime('now') WHERE id=?`)
    .bind(row?.id ?? null, id).run();
  return json({ ok: true, status: 'done', media_id: row?.id ?? null });
};
