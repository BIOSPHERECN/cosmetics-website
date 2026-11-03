import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { LANGS } from '../../../lib/db';

export const prerender = false;

/**
 * 新建页面 —— 后台「页面与版块」唯一缺的新建入口。
 *
 * 2026-10-28 创始人:「后台没有新建的功能」。核查后发现 pages 模块只有筛选与编辑,
 * 编辑器对不存在的页面直接 404,等于内容站无法新增一页 —— 这在 CMS 里是硬伤。
 * 这里补齐:插入 pages 一行 + 为 18 个语种各插 page_i18n 一行(nav_label/title 同源),
 * 返回新页 id,前端跳到版块编辑器继续做内容。
 */
const TPL = new Set(['standard', 'legal', 'external', 'products', 'contact', 'news', 'home']);

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const { site_id, slug, title, template, in_nav, parent_id } = (await request.json()) as {
      site_id?: string; slug?: string; title?: string; template?: string; in_nav?: boolean; parent_id?: number | null;
    };

    if (!site_id || !/^[a-z0-9-]{1,32}$/.test(site_id)) return json({ ok: false, msg: '请选择站点' }, 400);
    const cleanSlug = String(slug ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(cleanSlug)) return json({ ok: false, msg: '链接(slug)只能用小写字母、数字、- _ /，且不能以 / 开头' }, 400);
    const cleanTitle = String(title ?? '').trim().slice(0, 120);
    if (!cleanTitle) return json({ ok: false, msg: '请填页面标题' }, 400);
    const tpl = template && TPL.has(template) ? template : 'standard';
    if (!c.tenant.isGroup && site_id !== c.tenant.siteId) return json({ ok: false, msg: '无权在该站点建页' }, 403);

    const dup = await c.db.prepare(`SELECT id FROM pages WHERE site_id=? AND slug=?`).bind(site_id, cleanSlug).first();
    if (dup) return json({ ok: false, msg: `链接 ${cleanSlug} 在该站点已存在（页面 #${(dup as any).id}）` }, 409);

    const pid = (await c.db.prepare(
      `INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status, updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ).bind(site_id, cleanSlug, parent_id ?? null, tpl, in_nav ? 1 : 0, 999, 'draft').run());

    const newId = (pid as any).meta?.last_row_id;
    if (!newId) return json({ ok: false, msg: '插入页面失败' }, 500);

    /* 18 语种同步建译文,避免前端渲染英文回退 —— 与 nav-stages.py 的批量写法一致 */
    for (const lang of LANGS) {
      await c.db.prepare(
        `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc, mt, mt_at) VALUES (?,?,?,?,'',0,datetime('now'))`,
      ).bind(newId, lang, cleanTitle, cleanTitle).run().catch(() => {});
    }

    await logRevision(c.db, 'pages', newId, null, null, { action: 'create', site: site_id, slug: cleanSlug, template: tpl }, c.sess.uid);
    return json({ ok: true, id: newId });
  } catch (e: any) {
    return json({ ok: false, msg: String(e?.message ?? e).slice(0, 200) }, 500);
  }
};
