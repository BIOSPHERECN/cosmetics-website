import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/** 切换站点模板/风格 —— 只改 sites.variant 一个字段,前台下次请求即生效 */
export const POST: APIRoute = async ({ request }) => {
  /*
   * 鉴权从 readSession 改成 apiGuard。差别不是写法,是**作用域**:
   * readSession 只回答「登录了没」,apiGuard 还回答「这个账号能管哪个站」。
   *
   * 少了后半句,一个绑定在某一个站的运营账号,只要把请求体里的 site 换成别人的
   * 就能改别的站的外观 —— 越权不需要任何技术含量,改个字段就行。
   */
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const db = c.db;
  const sess = c.sess;

  const { site, variant } = (await request.json().catch(() => ({}))) as { site?: string; variant?: string };
  if (!site || !variant) return json({ ok: false, msg: '参数不全' }, 400);

  /* 目标站必须在这个账号能管的清单里:集团管理员是全部站点,站点运营只有自己那一个 */
  if (!c.tenant.options.some((o) => o.id === site)) {
    return json({ ok: false, msg: '无权修改该站点' }, 403);
  }

  // 记修订,便于回滚与追责
  const before = await db.prepare(`SELECT variant FROM sites WHERE id = ?`).bind(site).first<{ variant: string }>();
  await db.prepare(`UPDATE sites SET variant = ?, updated_at = datetime('now') WHERE id = ?`).bind(variant, site).run();
  await db
    .prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('site.variant', ?, ?, ?, ?)`)
    .bind(site, JSON.stringify(before ?? {}), JSON.stringify({ variant }), sess.uid)
    .run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
