/**
 * 预算筛选计数,写进 facet_cache。
 *
 * 起因是一次真实事故(2026-09-07 凌晨):包材库接进三千六百款之后,
 * 货架页每次未命中边缘缓存的加载都要跑三条 GROUP BY 扫全表 —— 约 1.1 万行读。
 * 我整晚用 ?cb=随机数 绕过缓存做验证,几十次就把 D1 的每日读额度烧穿,
 * 三个库同时变成空货架。
 *
 * 筛选计数是「很少变、被反复读」的典型,本来就该预计算。
 * 现在货架页只读一行,读放大从上万降到个位数;数据变了跑一次这个接口即可。
 *
 * 用 x-cron-key 鉴权,和其它定时任务同一把钥匙。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, error: 'no-db' }, 503);

  const many = async <T,>(sql: string) => {
    try { return ((await db.prepare(sql).all<T>()).results ?? []) as T[]; } catch { return [] as T[]; }
  };

  /* 包材:类型 / 材质原文 / 适配剂型。归并成大类的逻辑留在页面侧(catalog.ts 是唯一真源),
     这里只把原始计数存下来 —— 归并规则改了不必重跑这个接口。 */
  const [types, mats, fmts, total] = await Promise.all([
    many<{ type: string; n: number }>(
      `SELECT type, COUNT(*) n FROM packaging WHERE status IN ('sample','active') GROUP BY type`),
    many<{ material: string; n: number }>(
      `SELECT material, COUNT(*) n FROM packaging WHERE status IN ('sample','active')
        GROUP BY material LIMIT 500`),
    many<{ compat_formats: string; n: number }>(
      `SELECT compat_formats, COUNT(*) n FROM packaging WHERE status IN ('sample','active')
        GROUP BY compat_formats LIMIT 300`),
    many<{ n: number }>(`SELECT COUNT(*) n FROM packaging WHERE status IN ('sample','active')`),
  ]);

  const payload = JSON.stringify({ types, mats, fmts });
  const n = total[0]?.n ?? 0;

  /* 算出 0 就绝不覆盖缓存。第一次跑这个接口时 D1 的日读额度正好耗尽,
     四条查询全部失败、catch 返回空数组,于是把一份空缓存写了进去 ——
     货架页读到空缓存就一件都不显示,比没有缓存还糟。
     统计类任务写回之前必须先问一句「这个结果合理吗」,不能拿失败当结果。 */
  if (n === 0 || types.length === 0) {
    return json({ ok: false, error: 'refused-empty', packaging: n, types: types.length,
                  hint: '统计结果为空,多半是数据层不可用;已拒绝覆盖缓存' }, 409);
  }
  try {
    await db.prepare(
      `INSERT INTO facet_cache (k, json, n_total, updated_at) VALUES ('packaging', ?, ?, datetime('now'))
         ON CONFLICT(k) DO UPDATE SET json = excluded.json, n_total = excluded.n_total,
                                      updated_at = excluded.updated_at`)
      .bind(payload, n).run();
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500);
  }

  return json({ ok: true, packaging: n, types: types.length, mats: mats.length, fmts: fmts.length,
                bytes: payload.length });
};
