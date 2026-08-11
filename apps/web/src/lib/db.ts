/**
 * D1 数据访问层 —— 所有 SQL 集中在这里,页面与接口不写裸 SQL。
 *
 * 两条设计取舍写在前面:
 * 1. **一次查询取回整页**。页面渲染需要「站点 + 页面 + 全部版块 + 四语文案」,
 *    若分开查会变成 N+1(一个版块一次往返)。D1 在 Worker 里每次往返都有延迟,
 *    N+1 在版块多时会明显拖慢首屏,所以这里用 JOIN 一次取回再在内存里组装。
 * 2. **前台只读已发布内容**;后台才看得到草稿。这个判断放在 SQL 里而不是应用层,
 *    避免哪天漏了判断把草稿泄露到线上。
 */

export type Lang = 'zh-cn' | 'zh-tw' | 'en' | 'ja';
export const LANGS: Lang[] = ['zh-cn', 'zh-tw', 'en', 'ja'];
export const DEFAULT_LANG: Lang = 'zh-cn';

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as string[]).includes(x);
}

export interface SiteRow {
  id: string;
  domain: string;
  brand_color: string;
  variant: string;
  is_live: number;
  name: string;
  tagline: string | null;
  description: string | null;
}

export interface NavItem {
  slug: string;
  label: string;
  children: NavItem[];
}

export interface BlockRow {
  id: number;
  type: string;
  sort_order: number;
  config: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface PageBundle {
  site: SiteRow;
  page: { id: number; slug: string; template: string; title: string; seo_desc: string | null };
  blocks: BlockRow[];
  nav: NavItem[];
}

const parse = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

/** 按域名解析站点。本地开发与预览域名没有对应站点时,调用方可回退到 ?site= 参数 */
export async function getSiteByHost(db: D1Database, host: string, lang: Lang): Promise<SiteRow | null> {
  const clean = host.replace(/^www\./, '').split(':')[0];
  const row = await db
    .prepare(
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang = ?
        WHERE s.domain = ?`,
    )
    .bind(lang, clean)
    .first<SiteRow>();
  return row ?? null;
}

export async function getSiteById(db: D1Database, id: string, lang: Lang): Promise<SiteRow | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang = ?
        WHERE s.id = ?`,
    )
    .bind(lang, id)
    .first<SiteRow>();
  return row ?? null;
}

/**
 * 取导航树(两级)。
 * 标杆站 Intercos 是 6 顶级 × 15 二级、KDC-One 7 顶级,所以导航必须支持父子。
 * 只取 in_nav=1 且已发布的页面 —— 草稿页不出现在导航里。
 */
export async function getNav(db: D1Database, siteId: string, lang: Lang): Promise<NavItem[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.slug, p.parent_id, i.nav_label
         FROM pages p
         JOIN page_i18n i ON i.page_id = p.id AND i.lang = ?
        WHERE p.site_id = ? AND p.status = 'published' AND p.in_nav = 1
        ORDER BY p.sort_order, p.id`,
    )
    .bind(lang, siteId)
    .all<{ id: number; slug: string; parent_id: number | null; nav_label: string }>();

  const rows = results ?? [];
  const byId = new Map(rows.map((r) => [r.id, { slug: r.slug, label: r.nav_label, children: [] as NavItem[] }]));
  const top: NavItem[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.children.push(node);
    else top.push(node);
  }
  return top;
}

/**
 * 取整页内容(站点 + 页面 + 版块 + 导航)。
 * slug 传空字符串表示首页。
 * draft=true 时连草稿一起取 —— 只有后台预览会传 true。
 */
export async function getPageBundle(
  db: D1Database,
  siteId: string,
  slug: string,
  lang: Lang,
  opts: { draft?: boolean } = {},
): Promise<PageBundle | null> {
  const site = await getSiteById(db, siteId, lang);
  if (!site) return null;

  const statusClause = opts.draft ? '' : `AND p.status = 'published'`;
  const page = await db
    .prepare(
      `SELECT p.id, p.slug, p.template, i.title, i.seo_desc
         FROM pages p
         JOIN page_i18n i ON i.page_id = p.id AND i.lang = ?
        WHERE p.site_id = ? AND p.slug = ? ${statusClause}`,
    )
    .bind(lang, siteId, slug)
    .first<{ id: number; slug: string; template: string; title: string; seo_desc: string | null }>();
  if (!page) return null;

  // 一次取回该页全部版块及其本语言文案,避免 N+1
  const { results } = await db
    .prepare(
      `SELECT b.id, b.type, b.sort_order, b.config_json, bi.data_json
         FROM blocks b
    LEFT JOIN block_i18n bi ON bi.block_id = b.id AND bi.lang = ?
        WHERE b.page_id = ? AND b.is_visible = 1
        ORDER BY b.sort_order, b.id`,
    )
    .bind(lang, page.id)
    .all<{ id: number; type: string; sort_order: number; config_json: string; data_json: string | null }>();

  const blocks: BlockRow[] = (results ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    sort_order: r.sort_order,
    config: parse<Record<string, unknown>>(r.config_json, {}),
    data: parse<Record<string, unknown>>(r.data_json, {}),
  }));

  return { site, page, blocks, nav: await getNav(db, siteId, lang) };
}

/**
 * 内容完整度:查出每个版块缺哪几种语言。
 * 四语站最容易烂尾的地方就是「中文改了,英日繁没跟上」,
 * 后台据此把缺失语言标红,让问题在发布前就可见。
 */
export async function getMissingTranslations(
  db: D1Database,
  siteId: string,
): Promise<{ block_id: number; page_slug: string; type: string; missing: Lang[] }[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id AS block_id, p.slug AS page_slug, b.type,
              (SELECT GROUP_CONCAT(lang) FROM block_i18n WHERE block_id = b.id) AS langs
         FROM blocks b
         JOIN pages p ON p.id = b.page_id
        WHERE p.site_id = ?
        ORDER BY p.sort_order, b.sort_order`,
    )
    .bind(siteId)
    .all<{ block_id: number; page_slug: string; type: string; langs: string | null }>();

  return (results ?? []).map((r) => {
    const have = new Set((r.langs ?? '').split(',').filter(Boolean));
    return {
      block_id: r.block_id,
      page_slug: r.page_slug,
      type: r.type,
      missing: LANGS.filter((l) => !have.has(l)),
    };
  }).filter((x) => x.missing.length > 0);
}
