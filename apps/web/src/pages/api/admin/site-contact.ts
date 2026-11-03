import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/**
 * 全局联系邮箱 —— 后台站点总览那一格。
 *
 * 为什么单独开一个接口而不是塞进 site-variant:
 * 那个接口的语义是「换模板」,把不相干的字段并进去,以后谁改都得先读懂两件事。
 * 一个接口一件事,鉴权与修订记录各自完整。
 *
 * 清空 = 回落到 inquiry@域名(见 lib/shell.ts 与 [...path].astro),
 * 所以这里允许空串,不当成参数缺失。
 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  const { site, email, whatsapp, wechat } = (await request.json().catch(() => ({}))) as { site?: string; email?: string; whatsapp?: string; wechat?: string };
  if (!site) return json({ ok: false, msg: '参数不全' }, 400);

  /* 越权防线与 site-variant 同款:只能改自己管得到的站 */
  if (!c.tenant.options.some((o) => o.id === site)) {
    return json({ ok: false, msg: '无权修改该站点' }, 403);
  }

  /* WhatsApp / 微信号(2026-09-16):各自一列,单独保存;页脚与 Organization schema 由 middleware 注入,最迟 10 分钟生效 */
  if (whatsapp !== undefined || wechat !== undefined) {
    if (!c.tenant.options.some((o) => o.id === site)) return json({ ok: false, msg: '无权修改该站点' }, 403);
    const wa = whatsapp === undefined ? undefined : String(whatsapp).replace(/[^+\d\s()-]/g, '').trim().slice(0, 40);
    if (wa && wa.replace(/\D/g, '').length < 8) return json({ ok: false, msg: 'WhatsApp 要带国家码,至少 8 位数字' }, 400);
    const wx = wechat === undefined ? undefined : String(wechat).trim().slice(0, 60);
    const before = await c.db.prepare(`SELECT contact_whatsapp, contact_wechat FROM sites WHERE id = ?`).bind(site).first<any>();
    if (wa !== undefined) await c.db.prepare(`UPDATE sites SET contact_whatsapp = ?, updated_at = datetime('now') WHERE id = ?`).bind(wa || null, site).run();
    if (wx !== undefined) await c.db.prepare(`UPDATE sites SET contact_wechat = ?, updated_at = datetime('now') WHERE id = ?`).bind(wx || null, site).run();
    await c.db.prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('site.contact', ?, ?, ?, ?)`)
      .bind(site, JSON.stringify(before ?? {}), JSON.stringify({ contact_whatsapp: wa ?? before?.contact_whatsapp ?? null, contact_wechat: wx ?? before?.contact_wechat ?? null }), c.sess.uid).run();
    return json({ ok: true, whatsapp: wa ?? null, wechat: wx ?? null });
  }
  const value = (email ?? '').trim();
  /* 邮箱要真能收信 —— 存错一个字符,整站的询盘入口就静默失效,
     而这种故障没人会报,只会表现为「怎么最近没询盘」。 */
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return json({ ok: false, msg: '邮箱格式不对' }, 400);
  }
  if (value.length > 120) return json({ ok: false, msg: '邮箱过长' }, 400);

  const before = await c.db.prepare(`SELECT contact_email FROM sites WHERE id = ?`)
    .bind(site).first<{ contact_email: string | null }>();

  await c.db.prepare(`UPDATE sites SET contact_email = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(value || null, site).run();

  await c.db
    .prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('site.contact', ?, ?, ?, ?)`)
    .bind(site, JSON.stringify(before ?? {}), JSON.stringify({ contact_email: value || null }), c.sess.uid)
    .run();

  return json({ ok: true, email: value || null });
};
