import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { LANGS } from '../../../lib/db';
import { parseParentId, resolveCreateSite } from '../../../lib/page-create-site';

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
      site_id?: unknown; slug?: string; title?: string; template?: string; in_nav?: boolean; parent_id?: unknown;
    };

    /* 先定站点再校验其它字段:伪造别的站必须是 403,不能被后面的 400 盖住。
       落库只用这里算出来的 site,请求体里的 site_id 不再进入 SQL。 */
    const decided = resolveCreateSite(c.tenant, site_id);
    if (!decided.ok) return json({ ok: false, msg: decided.msg }, decided.status);
    const site = decided.siteId;

    const cleanSlug = String(slug ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(cleanSlug)) return json({ ok: false, msg: '链接(slug)只能用小写字母、数字、- _ /，且不能以 / 开头' }, 400);
    const cleanTitle = String(title ?? '').trim().slice(0, 120);
    if (!cleanTitle) return json({ ok: false, msg: '请填页面标题' }, 400);
    const tpl = template && TPL.has(template) ? template : 'standard';
    const parent = parseParentId(parent_id);
    if (!parent.ok) return json({ ok: false, msg: parent.msg }, parent.status);

    const dup = await c.db.prepare(`SELECT id FROM pages WHERE site_id=? AND slug=?`).bind(site, cleanSlug).first();
    if (dup) return json({ ok: false, msg: `链接 ${cleanSlug} 在该站点已存在（页面 #${(dup as any).id}）` }, 409);

    if (parent.id != null) {
      const prow = await c.db.prepare(`SELECT site_id FROM pages WHERE id=?`).bind(parent.id).first<{ site_id: string }>();
      if (!prow || prow.site_id !== site) return json({ ok: false, msg: '无权把页面挂到该父页' }, 403);
    }

    const pid = (await c.db.prepare(
      `INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status, updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ).bind(site, cleanSlug, parent.id, tpl, in_nav ? 1 : 0, 999, 'draft').run());

    const newId = (pid as any).meta?.last_row_id;
    if (!newId) return json({ ok: false, msg: '插入页面失败' }, 500);

    /* 18 语种同步建译文,避免前端渲染英文回退 —— 与 nav-stages.py 的批量写法一致 */
    for (const lang of LANGS) {
      await c.db.prepare(
        `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc, mt, mt_at) VALUES (?,?,?,?,'',0,datetime('now'))`,
      ).bind(newId, lang, cleanTitle, cleanTitle).run().catch(() => {});
    }

    await logRevision(c.db, 'pages', newId, null, null, { action: 'create', site, slug: cleanSlug, template: tpl }, c.sess.uid);
    return json({ ok: true, id: newId });
  } catch (e: any) {
    return json({ ok: false, msg: String(e?.message ?? e).slice(0, 200) }, 500);
  }
};
