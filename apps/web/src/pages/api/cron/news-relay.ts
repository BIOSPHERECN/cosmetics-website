/**
 * 资讯管线的「本机中继」端点 —— 把被拦住的那一步搬出 Workers。
 *
 * 2026-09-07 的事故与诊断:
 *   资讯管线三天零产出。根因是 **AI 调用从 Cloudflare Workers 出去一律被拦**:
 *   Agnes 返回 `429 error code: 1015`(Cloudflare 自己的限流码),商汤同样超时。
 *   本机逐家探活的对照结果:11 家里 8 家通(Agnes 700ms、商汤 1.5s),
 *   失败的三家是供应商自己的额度问题。
 *   → 凭据和额度都没问题,**被拦的是 Workers 这条出口**。
 *
 * 所以把管线切成两段,各自待在能跑通的地方:
 *   GET  ?mode=leads     Workers 出线索(RSS 拉取在 Workers 里是通的)+ **连同提示词一起给**
 *   POST {articles:[…]}  本机写完的文章回传,这里走**原有的质量闸**再入库
 *
 * 为什么提示词由 Workers 下发而不是本机硬编码:
 *   两边各存一份,改了一边忘另一边,产出的稿子就会悄悄变形 ——
 *   而这种漂移不会报错,只会让文章一天天变差。一个来源,一处修改。
 *
 * 质量闸没有绕过:validateArticle 是原来那一套,本机写得再快也过不了这道门。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validateArticle, EDIT_RULES } from '../../../lib/news';

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const guard = (request: Request) => {
  const key = (env as any).CRON_KEY as string | undefined;
  return !!key && request.headers.get('x-cron-key') === key;
};

/** 下发「写稿要用的东西」:提示词 + 编辑规则 + 近期已入库的来源(用于本机去重)。
    不在这里做 RSS 发现 —— 那件事本机做更省事,而且抓取端本来就支持传线索。
    提示词只此一份,本机不硬编码:两边各存一份,改了一边忘另一边,
    稿子会一天天悄悄变形,而且不报错。 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!guard(request)) return json({ ok: false }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const rows = await db.prepare(
    `SELECT source_url FROM news WHERE published_at >= datetime('now', ?) LIMIT 800`)
    .bind(`-${days} days`).all<{ source_url: string }>().catch(() => ({ results: [] as any[] }));

  const mod: any = await import('../../../lib/news');
  return json({
    ok: true,
    seen: (rows.results ?? []).map((r) => r.source_url),
    rules: mod.EDIT_RULES ?? [],
    prompts: { deep: mod.REWRITE_DEEP ?? null, brief: mod.REWRITE_BRIEF ?? null },
  });
};

/** 回传:本机写好的文章进这道门。质量闸一步没少。 */
export const POST: APIRoute = async ({ request }) => {
  if (!guard(request)) return json({ ok: false }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const b = (await request.json().catch(() => ({}))) as { articles?: any[] };
  const arts = Array.isArray(b.articles) ? b.articles.slice(0, 20) : [];
  if (!arts.length) return json({ ok: false, msg: '没给 articles' }, 400);

  let inserted = 0, rejected = 0, dup = 0;
  const problems: string[] = [];

  for (const a of arts) {
    const srcUrl = String(a.source_url ?? '').slice(0, 500);
    if (!srcUrl) { rejected++; problems.push('缺 source_url'); continue; }

    const exists = await db.prepare(`SELECT id FROM news WHERE source_url = ?`)
      .bind(srcUrl).first().catch(() => null);
    if (exists) { dup++; continue; }

    /* 原有质量闸:编造数字、缺末节、伪引语等一律挡在这里。
       本机跑得再快,过不了这道门就不入库。 */
    /* validateArticle(d, material, deep) —— 三个参数缺一不可。
       material 是本机写稿时用的那份原始材料:数字校验就是拿正文里的数字
       去和材料里的数字比对,材料给空等于把这道闸拆了(而且会直接抛异常,
       表现是一个空 body 的 404 —— 2026-09-07 为这个绕了半小时)。 */
    const bad = validateArticle(a as any, String(a.material ?? ''), !!a.deep);
    if (bad && bad.length) {
      rejected++;
      problems.push(`${String(a.title_zh ?? srcUrl).slice(0, 40)}: ${bad.slice(0, 2).join(' / ')}`);
      continue;
    }

    await db.prepare(
      `INSERT INTO news (slug, source_url, source_name, topic, title_zh, title_en,
                         summary_zh, summary_en, body_zh, body_en, orig_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      String(a.slug ?? '').slice(0, 120), srcUrl, String(a.source_name ?? '').slice(0, 80),
      String(a.topic ?? 'industry').slice(0, 20),
      String(a.title_zh ?? '').slice(0, 120), String(a.title_en ?? '').slice(0, 200),
      String(a.summary_zh ?? '').slice(0, 300), String(a.summary_en ?? '').slice(0, 400),
      String(a.body_zh ?? '').slice(0, 3200), String(a.body_en ?? '').slice(0, 5200),
      String(a.orig_date ?? '').slice(0, 40),
    ).run();
    inserted++;
  }

  return json({ ok: true, inserted, rejected, dup, problems: problems.slice(0, 6) });
};
