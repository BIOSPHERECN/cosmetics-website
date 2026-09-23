import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 爆款情报的「配图派工 / 交图」接口 —— 给 GitHub Actions 的取图工人用。
 *
 * 为什么不在 Worker 里抓图:
 *   ① 抓一张图要打外站、跟跳转、下载、压缩,一条情报就能吃掉好几个子请求,
 *      而 Worker 单次调用只有 50 个;
 *   ② 不少站点直接挡数据中心 IP,GitHub 机器的成功率高得多;
 *   ③ 图片处理(缩到 600px、转 webp)在 Python 侧顺手,Worker 侧要另引依赖。
 *
 * 呈现立场(写在这里,免得以后有人改错):
 *   这些图是**来源页面的配图**,页面按「媒体引用」呈现 —— 缩略图必须挂出处、日期、
 *   原文链接,并标注「市场信息引用,非本厂产品」。绝不当作我们的产品图,
 *   也不得暗示我们为该品牌生产。工人交上来的 credit 字段是必填,交不上来就不收图。
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
  const n = Math.min(Math.max(Number(new URL(request.url).searchParams.get('n')) || 8, 1), 20);
  const { results } = await db.prepare(
    `SELECT id, title_zh, source_url, source_name, source_date
       FROM trends WHERE status='active' AND media_state='pending'
      ORDER BY source_date DESC LIMIT ?`).bind(n).all<any>();
  return json({ ok: true, jobs: results ?? [] });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const b = (await request.json().catch(() => ({}))) as {
    id?: number; r2_key?: string; bytes?: number; mime?: string;
    credit?: string; ref_url?: string; product_name?: string; none?: boolean;
  };
  const id = Number(b.id);
  if (!Number.isFinite(id)) return json({ ok: false, msg: 'id 缺失' }, 400);

  /* 找不到图不是错误 —— 标 none,下次不再派同一条,省得每天空转 */
  if (b.none) {
    await db.prepare(`UPDATE trends SET media_state='none' WHERE id=?`).bind(id).run();
    return json({ ok: true, state: 'none' });
  }

  const key = String(b.r2_key ?? '');
  if (!/^media\/trend\/\d+\.webp$/.test(key)) return json({ ok: false, msg: 'r2_key 不合法' }, 400);
  const credit = String(b.credit ?? '').trim();
  if (!credit) return json({ ok: false, msg: '缺图片出处署名 —— 无署名不收图' }, 400);

  const row = await db.prepare(
    `INSERT INTO media (r2_key, filename, mime, bytes, folder, alt_zh, alt_en, driver)
     VALUES (?,?,?,?,'trend',?,?,'r2') RETURNING id`)
    .bind(key, key.split('/').pop(), String(b.mime ?? 'image/webp').slice(0, 40), Number(b.bytes) || 0,
      `市场情报配图(来源:${credit.slice(0, 60)})`, `Market signal image (source: ${credit.slice(0, 60)})`)
    .first<{ id: number }>();

  await db.prepare(
    `UPDATE trends SET image_media_id=?, image_credit=?, media_state='done',
            ref_url=COALESCE(NULLIF(?,''), ref_url), product_name=COALESCE(NULLIF(?,''), product_name)
      WHERE id=?`)
    .bind(row?.id ?? null, credit.slice(0, 120), String(b.ref_url ?? '').slice(0, 400),
      String(b.product_name ?? '').slice(0, 160), id).run();

  return json({ ok: true, state: 'done', media_id: row?.id ?? null });
};
