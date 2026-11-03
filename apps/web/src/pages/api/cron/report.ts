import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 深度专题的「派题 / 交稿」接口 —— 给 GitHub Actions 的写稿工人用。
 *
 * 为什么整条线在 GitHub 上跑:
 *   一篇万字专题要分 7–9 节生成,每节前还要抓 2–4 个来源核事实,
 *   加起来几十次外部请求 —— Worker 免费档单次调用只有 50 个子请求,写不完一节就断。
 *   而且这类稿子慢一点没关系,天生适合定时任务。
 *
 * 所以分工是:
 *   GET  /api/cron/report      → 领一个题,连同我们库里已有的证据一起给它(情报 + 快讯)
 *   POST /api/cron/report      → 交稿:标题、结论、正文(Markdown)、来源清单
 * 工人手里只有 CRON_KEY 与模型 key,拿不到 D1 凭据。
 *
 * 交稿有三条硬校验,不合格直接退回(宁可没有,不要糊弄):
 *   ① 中文正文 ≥ 4000 字 —— 低于这个数说明又写成快讯了;
 *   ② 至少 5 个「## 」小节;
 *   ③ 来源清单 ≥ 5 条,每条必须有 URL 与日期。
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

  const url = new URL(request.url);
  const want = url.searchParams.get('slug');

  /* 领题:queued,或 writing 但租约过期(工人被 GitHub 超时杀掉了) */
  const claimable = `(status='queued' OR (status='writing' AND leased_at < datetime('now','-40 minutes')))`;
  await db.prepare(`UPDATE reports SET status='failed', err='三次未能完成' WHERE ${claimable} AND attempts >= 3`).run();

  const row = want
    ? await db.prepare(`SELECT * FROM reports WHERE slug=? AND ${claimable}`).bind(want).first<any>()
    : await db.prepare(`SELECT * FROM reports WHERE ${claimable} ORDER BY id LIMIT 1`).first<any>();
  if (!row) return json({ ok: true, job: null });

  const claimed = await db.prepare(
    `UPDATE reports SET status='writing', leased_at=datetime('now'), attempts=attempts+1, updated_at=datetime('now')
      WHERE id=? AND ${claimable}`).bind(row.id).run();
  if ((claimed.meta?.changes ?? 0) !== 1) return json({ ok: true, job: null });

  /* 把我们自己库里的证据一起交给工人 —— 专题的价值在于「我们有的别人没有」:
     带出处与日期的情报、以及自己发过的相关快讯。工人在此基础上再去补外部来源。 */
  const like = `%${row.category ?? ''}%`;
  const ev = await db.prepare(
    `SELECT title_zh, market, category, claim_tag, figure, source_name, source_url, source_date, so_what_zh
       FROM trends WHERE status='active' AND (market=? OR market='GLOBAL' OR category LIKE ?)
      ORDER BY source_date DESC LIMIT 24`).bind(row.market, like).all<any>();
  const prev = await db.prepare(
    `SELECT title_zh, source_url, COALESCE(orig_date, published_at) d
       FROM news ORDER BY id DESC LIMIT 12`).all<any>();

  return json({
    ok: true,
    job: {
      id: row.id, slug: row.slug, kind: row.kind, topic: row.topic,
      market: row.market, category: row.category,
      evidence: ev.results ?? [],
      recent_news: prev.results ?? [],
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const b = (await request.json().catch(() => ({}))) as any;
  const id = Number(b.id);
  if (!Number.isFinite(id)) return json({ ok: false, msg: 'id 缺失' }, 400);

  if (b.err) {
    await db.prepare(`UPDATE reports SET status='queued', err=?, updated_at=datetime('now') WHERE id=?`)
      .bind(String(b.err).slice(0, 300), id).run();
    return json({ ok: true, status: 'requeued' });
  }

  const bodyZh = String(b.body_zh ?? '');
  const words = bodyZh.replace(/\s/g, '').length;
  const secs = (bodyZh.match(/^## /gm) ?? []).length;
  const sources = Array.isArray(b.sources) ? b.sources.filter((s: any) => s && s.url && s.date) : [];

  /* 三条硬校验 —— 不合格退回重写,别让「又一篇快讯」混进专题栏目 */
  const bad: string[] = [];
  if (words < 4000) bad.push(`中文正文 ${words} 字,专题下限 4000`);
  if (secs < 5) bad.push(`只有 ${secs} 个小节,下限 5`);
  if (sources.length < 5) bad.push(`来源 ${sources.length} 条,下限 5(每条须有 URL 与日期)`);
  if (bad.length) {
    await db.prepare(`UPDATE reports SET status='queued', err=?, updated_at=datetime('now') WHERE id=?`)
      .bind(bad.join(';').slice(0, 300), id).run();
    return json({ ok: false, msg: '未过校验', problems: bad }, 422);
  }

  await db.prepare(
    `UPDATE reports SET title_zh=?, title_en=?, summary_zh=?, summary_en=?, body_zh=?, body_en=?,
            sources_json=?, outline_json=?, words_zh=?, status='drafted', err=NULL, updated_at=datetime('now')
      WHERE id=?`)
    .bind(String(b.title_zh ?? '').slice(0, 200), String(b.title_en ?? '').slice(0, 300),
      String(b.summary_zh ?? '').slice(0, 600), String(b.summary_en ?? '').slice(0, 900),
      bodyZh.slice(0, 90000), String(b.body_en ?? '').slice(0, 120000),
      JSON.stringify(sources).slice(0, 20000), JSON.stringify(b.outline ?? []).slice(0, 6000),
      words, id).run();

  return json({ ok: true, status: 'drafted', words, sections: secs, sources: sources.length });
};
