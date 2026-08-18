/**
 * 翻译接口 —— 后台「翻译中心」的引擎。
 *
 * GET  返回进度矩阵:每个语种翻了多少、还差多少、其中多少是机器译待校。
 * POST 翻一小批(默认 4 条)并写库,返回还剩多少 —— 前端据此循环调用。
 *
 * 为什么切成小批循环,而不是一个请求翻完:
 *   624 条内容 × 一次模型调用 ≈ 一小时。任何一个环节超时(浏览器、CF、模型)
 *   都会让这一小时白跑,而且中途断了没人知道翻到哪儿了。
 *   切成小批之后:每批都落库,断在哪儿下次从哪儿接着来,进度条也是真的。
 *
 * 源语言为什么用英文:
 *   出海站的第一读者是海外采购,英文本来就是最完整的一份;
 *   而且「中→印尼」这类小众方向的训练数据远少于「英→印尼」,英文起译质量更齐。
 *   英文缺失时才退回中文。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';
import { loadFleet } from '../../../lib/fleet';
import { translateJson, translateBatch, TARGETS } from '../../../lib/translate';
import { env } from 'cloudflare:workers';

export const prerender = false;

/** 已上线的语种 —— 与 packages/core/src/i18n 的 LOCALES 保持一致 */
const LOCALES = [
  'en', 'zh-cn', 'ja', 'ko', 'id', 'ms', 'th', 'vi', 'hi', 'bn', 'tl', 'ur', 'pa', 'te', 'ta', 'mr', 'gu', 'jv', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'cs', 'el', 'hu', 'ro', 'uk', 'ru', 'pt-br', 'es-mx', 'ar', 'tr', 'fa', 'he', 'sw', 'ha', 'am', 'kk', 'uz',
];

type Row = { kind: 'site' | 'page' | 'product' | 'block'; id: number | string; label: string };

/* ── 进度矩阵 ───────────────────────────────────────────────── */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const site = c.tenant.siteId;

  const one = async (sql: string, ...b: unknown[]) =>
    (await c.db.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0;

  const totals = {
    site: 1,
    page: await one(`SELECT COUNT(*) n FROM pages WHERE site_id=?`, site),
    product: await one(`SELECT COUNT(*) n FROM products WHERE site_id=?`, site),
    block: await one(`SELECT COUNT(*) n FROM blocks b JOIN pages p ON p.id=b.page_id WHERE p.site_id=?`, site),
  };

  const langs = [];
  for (const lang of LOCALES) {
    const have = {
      site: await one(`SELECT COUNT(*) n FROM site_i18n WHERE site_id=? AND lang=?`, site, lang),
      page: await one(`SELECT COUNT(*) n FROM page_i18n i JOIN pages p ON p.id=i.page_id WHERE p.site_id=? AND i.lang=?`, site, lang),
      product: await one(`SELECT COUNT(*) n FROM product_i18n i JOIN products p ON p.id=i.product_id WHERE p.site_id=? AND i.lang=?`, site, lang),
      block: await one(`SELECT COUNT(*) n FROM block_i18n i JOIN blocks b ON b.id=i.block_id JOIN pages p ON p.id=b.page_id WHERE p.site_id=? AND i.lang=?`, site, lang),
    };
    const mt = await one(
      `SELECT (SELECT COUNT(*) FROM page_i18n i JOIN pages p ON p.id=i.page_id WHERE p.site_id=?1 AND i.lang=?2 AND i.mt=1)
            + (SELECT COUNT(*) FROM block_i18n i JOIN blocks b ON b.id=i.block_id JOIN pages p ON p.id=b.page_id WHERE p.site_id=?1 AND i.lang=?2 AND i.mt=1)
            + (SELECT COUNT(*) FROM product_i18n i JOIN products p ON p.id=i.product_id WHERE p.site_id=?1 AND i.lang=?2 AND i.mt=1)
            + (SELECT COUNT(*) FROM site_i18n WHERE site_id=?1 AND lang=?2 AND mt=1) n`,
      site, lang,
    );
    const T = totals.site + totals.page + totals.product + totals.block;
    const H = have.site + have.page + have.product + have.block;
    langs.push({ lang, name: TARGETS[lang]?.name ?? lang, total: T, have: H, missing: T - H, mt, detail: { totals, have } });
  }
  return json({ ok: true, site, langs });
};

/* ── 翻一小批 ───────────────────────────────────────────────── */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const body = (await request.json()) as { lang?: string; limit?: number };
    const lang = String(body.lang ?? '');
    if (!TARGETS[lang]) return json({ ok: false, msg: `不支持的语种:${lang}` }, 400);

    const limit = Math.min(8, Math.max(1, Number(body.limit) || 4));
    const site = c.tenant.siteId;
    const fleet = await loadFleet(c.db, env as any);
    if (!fleet.length) return json({ ok: false, msg: '没有可用的模型 key,先去「模型舰队」配一个' }, 400);

    /** 源语言优先英文,英文没有才用中文 —— 两条都没有的内容跳过,不硬翻空字符串 */
    const pri = `CASE i.lang WHEN 'en' THEN 0 WHEN 'zh-cn' THEN 1 ELSE 2 END`;
    const done: Row[] = [];

    /* ① 站点介绍(每站一行,最先翻 —— 它决定页头页脚的品牌名与定位) */
    if (done.length < limit) {
      const src = await c.db.prepare(
        `SELECT i.name, i.tagline, i.description FROM site_i18n i
          WHERE i.site_id=? AND i.lang IN ('en','zh-cn')
            AND NOT EXISTS (SELECT 1 FROM site_i18n x WHERE x.site_id=i.site_id AND x.lang=?)
          ORDER BY ${pri} LIMIT 1`,
      ).bind(site, lang).first<{ name: string; tagline: string | null; description: string | null }>();
      if (src) {
        const fields = ['name', 'tagline', 'description'] as const;
        const texts = fields.map((f) => src[f] ?? '');
        const got = await translateBatch(env as any, fleet, texts, lang, '站点品牌名与一句话定位');
        await c.db.prepare(
          `INSERT INTO site_i18n (site_id,lang,name,tagline,description,mt,mt_at)
           VALUES (?,?,?,?,?,1,datetime('now'))
           ON CONFLICT(site_id,lang) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,
             description=excluded.description,mt=1,mt_at=excluded.mt_at`,
        ).bind(site, lang, got['0'] || src.name, got['1'] ?? src.tagline, got['2'] ?? src.description).run();
        done.push({ kind: 'site', id: site, label: '站点介绍' });
      }
    }

    /* ② 页面标题与导航标签(缺了导航会露出英文,最显眼) */
    if (done.length < limit) {
      const { results } = await c.db.prepare(
        `SELECT p.id, p.slug, i.nav_label, i.title, i.seo_desc, MIN(${pri}) AS _pri FROM pages p
           JOIN page_i18n i ON i.page_id=p.id AND i.lang IN ('en','zh-cn')
          WHERE p.site_id=?
            AND NOT EXISTS (SELECT 1 FROM page_i18n x WHERE x.page_id=p.id AND x.lang=?)
          GROUP BY p.id ORDER BY p.sort_order LIMIT ?`,
      ).bind(site, lang, limit - done.length).all<any>();
      for (const r of results ?? []) {
        const got = await translateBatch(env as any, fleet,
          [r.nav_label ?? '', r.title ?? '', r.seo_desc ?? ''], lang,
          `网站页面「${r.slug || '首页'}」的导航标签、页面标题、SEO 描述`);
        await c.db.prepare(
          `INSERT INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt,mt_at)
           VALUES (?,?,?,?,?,1,datetime('now'))
           ON CONFLICT(page_id,lang) DO UPDATE SET nav_label=excluded.nav_label,title=excluded.title,
             seo_desc=excluded.seo_desc,mt=1,mt_at=excluded.mt_at`,
        ).bind(r.id, lang, got['0'] || r.nav_label, got['1'] || r.title, got['2'] ?? r.seo_desc).run();
        done.push({ kind: 'page', id: r.id, label: `页面 /${r.slug}` });
      }
    }

    /* ③ 版块正文 —— 量最大的一档 */
    if (done.length < limit) {
      const { results } = await c.db.prepare(
        `SELECT b.id, b.type, p.slug, i.data_json, MIN(${pri}) AS _pri FROM blocks b
           JOIN pages p ON p.id=b.page_id
           JOIN block_i18n i ON i.block_id=b.id AND i.lang IN ('en','zh-cn')
          WHERE p.site_id=?
            AND NOT EXISTS (SELECT 1 FROM block_i18n x WHERE x.block_id=b.id AND x.lang=?)
          GROUP BY b.id ORDER BY p.sort_order, b.sort_order LIMIT ?`,
      ).bind(site, lang, limit - done.length).all<any>();
      for (const r of results ?? []) {
        const out = await translateJson(env as any, fleet, r.data_json, lang,
          `网站页面「${r.slug || '首页'}」上的「${r.type}」版块文案`);
        await c.db.prepare(
          `INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (?,?,?,1,datetime('now'))
           ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=1,mt_at=excluded.mt_at`,
        ).bind(r.id, lang, out).run();
        done.push({ kind: 'block', id: r.id, label: `/${r.slug} 的 ${r.type} 版块` });
      }
    }

    /* ④ 产品文案 */
    if (done.length < limit) {
      const { results } = await c.db.prepare(
        `SELECT p.id, i.name, i.summary, i.description, i.specs_json, i.highlights_json, MIN(${pri}) AS _pri FROM products p
           JOIN product_i18n i ON i.product_id=p.id AND i.lang IN ('en','zh-cn')
          WHERE p.site_id=?
            AND NOT EXISTS (SELECT 1 FROM product_i18n x WHERE x.product_id=p.id AND x.lang=?)
          GROUP BY p.id LIMIT ?`,
      ).bind(site, lang, limit - done.length).all<any>();
      for (const r of results ?? []) {
        const got = await translateBatch(env as any, fleet,
          [r.name ?? '', r.summary ?? '', r.description ?? ''], lang, `产品「${r.name}」的名称、摘要、详情`);
        const specs = await translateJson(env as any, fleet, r.specs_json || '[]', lang, '产品规格参数表(标签与取值)');
        const hl = await translateJson(env as any, fleet, r.highlights_json || '[]', lang, '产品成分亮点');
        await c.db.prepare(
          `INSERT INTO product_i18n (product_id,lang,name,summary,description,specs_json,highlights_json,mt,mt_at)
           VALUES (?,?,?,?,?,?,?,1,datetime('now'))
           ON CONFLICT(product_id,lang) DO UPDATE SET name=excluded.name,summary=excluded.summary,
             description=excluded.description,specs_json=excluded.specs_json,
             highlights_json=excluded.highlights_json,mt=1,mt_at=excluded.mt_at`,
        ).bind(r.id, lang, got['0'] || r.name, got['1'] ?? r.summary, got['2'] ?? r.description, specs, hl).run();
        done.push({ kind: 'product', id: r.id, label: `产品 ${r.name}` });
      }
    }

    /* 还剩多少 —— 让前端的进度条说真话,而不是自己数循环次数 */
    const remaining = (await c.db.prepare(
      `SELECT (SELECT COUNT(*) FROM pages p WHERE p.site_id=?1
                 AND NOT EXISTS (SELECT 1 FROM page_i18n x WHERE x.page_id=p.id AND x.lang=?2))
            + (SELECT COUNT(*) FROM blocks b JOIN pages p ON p.id=b.page_id WHERE p.site_id=?1
                 AND NOT EXISTS (SELECT 1 FROM block_i18n x WHERE x.block_id=b.id AND x.lang=?2))
            + (SELECT COUNT(*) FROM products p WHERE p.site_id=?1
                 AND NOT EXISTS (SELECT 1 FROM product_i18n x WHERE x.product_id=p.id AND x.lang=?2))
            + (SELECT COUNT(*) FROM sites s WHERE s.id=?1
                 AND NOT EXISTS (SELECT 1 FROM site_i18n x WHERE x.site_id=s.id AND x.lang=?2)) n`,
    ).bind(site, lang).first<{ n: number }>())?.n ?? 0;

    return json({ ok: true, done: done.length, items: done, remaining });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return json({ ok: false, msg: `翻译失败:${m.slice(0, 200)}` }, 500);
  }
};
