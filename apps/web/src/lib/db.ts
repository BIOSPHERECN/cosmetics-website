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

/**
 * 语种覆盖 —— 按创始人指定的出口市场排布。
 * 印尼语在列是因为集团现有业务的主战场就是印尼(旧站标题即「印尼美妆OEM头部供应商」)。
 * 葡语用 pt-BR(巴西)而非 pt-PT:美妆出口的葡语市场主体是巴西。
 */
/**
 * 全语种覆盖 —— **英文为源语言**,其余为译文。
 *
 * 为什么以英文为源而不是中文:出海站的第一读者是海外采购,英文是事实上的商务通用语;
 * 而且几十种译文若从中文出发,每多一门语言就多一次「中→X」的语义损耗,
 * 从英文出发则译文之间质量更齐。
 *
 * 分组是给下拉用的 —— 几十个语言平铺成一列没法找,按大区分组才选得动。
 */
export const LANG_GROUPS: { group: string; langs: [string, string][] }[] = [
  { group: 'Global', langs: [['en', 'English']] },
  { group: '亚太', langs: [['zh-cn', '中文'], ['ja', '日本語'], ['ko', '한국어'], ['id', 'Indonesia'], ['ms', 'Melayu'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['tl', 'Filipino']] },
  { group: '欧洲', langs: [['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['sv', 'Svenska'], ['da', 'Dansk'], ['fi', 'Suomi'], ['no', 'Norsk'], ['cs', 'Čeština'], ['el', 'Ελληνικά'], ['hu', 'Magyar'], ['ro', 'Română'], ['uk', 'Українська'], ['ru', 'Русский']] },
  { group: '美洲', langs: [['pt-br', 'Português (BR)'], ['es-mx', 'Español (MX)']] },
  { group: '中东非洲', langs: [['ar', 'العربية'], ['tr', 'Türkçe'], ['fa', 'فارسی'], ['he', 'עברית'], ['sw', 'Kiswahili']] },
  { group: '独联体', langs: [['kk', 'Қазақша']] },
];

export type Lang = string;
export const LANGS: Lang[] = LANG_GROUPS.flatMap((g) => g.langs.map(([c]) => c));
export const DEFAULT_LANG: Lang = 'en';

export const LANG_LABEL: Record<string, string> = Object.fromEntries(
  LANG_GROUPS.flatMap((g) => g.langs),
);

/** 从右向左书写的语言 —— 页面要整体镜像,不做的话阿拉伯语版会完全读不了 */
export const RTL = new Set(['ar', 'fa', 'he']);

/** hreflang:多数语言码即规范码,少数需要映射 */
export function hreflangOf(lang: Lang): string {
  // 与 packages/core/src/i18n 的 HREFLANG 保持一致 —— 以前这里写 zh-Hans、
  // 那边写 zh-CN,同一个语种在两处得出两个 hreflang,搜索引擎只会信其中一个。
  return ({ 'zh-cn': 'zh-CN', 'pt-br': 'pt-BR', 'es-mx': 'es-MX' } as Record<string, string>)[lang] ?? lang;
}

/**
 * 内容回退链 —— 七语站的关键设计。
 * 某语言还没翻译时,回落到英文、再回落到简体,**而不是给访客一个 404**。
 * 缺翻译是内容进度问题,不该变成访客看到的错误。后台另有「缺哪门语言」的清单来催补。
 */
export const FALLBACK: Lang[] = ['en', 'zh-cn'];

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as string[]).includes(x);
}

/** 依次尝试:目标语言 → 英文 → 简体,返回第一个有内容的 */
export function langChain(lang: Lang): Lang[] {
  return [lang, ...FALLBACK.filter((l) => l !== lang)];
}

export interface SiteRow {
  /** 视觉主题:noir(深金)/ summer(白底)—— 按站可切,不写死在代码里 */
  theme?: string;
  id: string;
  domain: string;
  brand_color: string;
  variant: string;
  is_live: number;
  name: string;
  tagline: string | null;
  description: string | null;
}

/**
 * 集团生态 —— 依据创始人品牌视觉图《品牌生态架构》。
 * BIOSPHERE-AI 是科技大脑,三个智造平台与一个自有品牌挂在它下面。
 * 五站平铺会丢掉这层关系,看起来像五个不相干的站;
 * 有了层级,访客一眼看懂「谁赋能谁」,这本身就是集团实力的表达。
 */
export interface EcoNode {
  id: string;
  name: string;
  domain: string;
  role: 'hub' | 'manufacturing' | 'brand' | string;
  tagline: string | null;
}

export async function getEcosystem(db: D1Database, lang: Lang): Promise<{ hub: EcoNode | null; children: EcoNode[] }> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.domain, s.role, i.name, i.tagline
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang IN (?,?,?)
        GROUP BY s.id
        ORDER BY (s.role <> 'hub'), s.sort_order`,
    )
    .bind(...chain(lang))
    .all<EcoNode & { role: string }>();

  const rows = (results ?? []) as EcoNode[];
  return {
    hub: rows.find((r) => r.role === 'hub') ?? null,
    children: rows.filter((r) => r.role !== 'hub'),
  };
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
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live, s.theme,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang = ?
        WHERE s.domain = ?`,
    )
    .bind(lang, clean)
    .first<SiteRow>();
  return row ?? null;
}

/**
 * 回退优先级 SQL 片段:目标语言 0、英文 1、简体 2,取序号最小的那条。
 * 这样一条查询就完成「有译文用译文,没有就用英文」,不必查两次。
 */
const PRI = `CASE i.lang WHEN ? THEN 0 WHEN 'en' THEN 1 WHEN 'zh-cn' THEN 2 ELSE 3 END`;
const chain = (lang: Lang) => [lang, 'en', 'zh-cn'];

export async function getSiteById(db: D1Database, id: string, lang: Lang): Promise<SiteRow | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live, s.theme,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang IN (?,?,?)
        WHERE s.id = ?
        ORDER BY ${PRI} LIMIT 1`,
    )
    .bind(...chain(lang), id, lang)
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
      `SELECT p.id, p.slug, p.parent_id, i.nav_label,
              MIN(${PRI}) AS pri
         FROM pages p
         JOIN page_i18n i ON i.page_id = p.id AND i.lang IN (?,?,?)
        WHERE p.site_id = ? AND p.status = 'published' AND p.in_nav = 1
        GROUP BY p.id
        ORDER BY p.sort_order, p.id`,
    )
    .bind(lang, ...chain(lang), siteId)
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
         JOIN page_i18n i ON i.page_id = p.id AND i.lang IN (?,?,?)
        WHERE p.site_id = ? AND p.slug = ? ${statusClause}
        ORDER BY ${PRI} LIMIT 1`,
    )
    .bind(...chain(lang), siteId, slug, lang)
    .first<{ id: number; slug: string; template: string; title: string; seo_desc: string | null }>();
  if (!page) return null;

  // 一次取回该页全部版块及其本语言文案,避免 N+1
  const { results } = await db
    .prepare(
      // 每个版块各自回退:某版块有法语译文就用法语,没有的那个用英文,
      // 不会因为一个版块缺译文就整页退回英文。
      `SELECT b.id, b.type, b.sort_order, b.config_json,
              (SELECT bi.data_json FROM block_i18n bi
                WHERE bi.block_id = b.id AND bi.lang IN (?,?,?)
                ORDER BY CASE bi.lang WHEN ? THEN 0 WHEN 'en' THEN 1 ELSE 2 END
                LIMIT 1) AS data_json
         FROM blocks b
        WHERE b.page_id = ? AND b.is_visible = 1
        ORDER BY b.sort_order, b.id`,
    )
    .bind(...chain(lang), lang, page.id)
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
