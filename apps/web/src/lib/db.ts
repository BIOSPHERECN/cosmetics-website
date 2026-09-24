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
import { getDraft } from './page-versions';
import { memo } from './memo';

export const LANG_GROUPS: { group: string; langs: [string, string][] }[] = [
  { group: '主要语言', langs: [['en', 'English'], ['zh-cn', '简体中文'], ['zh-tw', '繁體中文'], ['jp', '日本語'], ['kr', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский']] },
  { group: '东南亚', langs: [['id', 'Indonesia'], ['my', 'Malaysia'], ['th', 'ไทย'], ['vn', 'Tiếng Việt'], ['ph', 'Filipino']] },
  { group: '拉丁美洲', langs: [['es', 'Español'], ['pt', 'Português']] },
  { group: '中东与南亚', langs: [['ar', 'العربية'], ['tr', 'Türkçe'], ['in', 'हिन्दी']] },
];

export type Lang = string;
export const LANGS: Lang[] = LANG_GROUPS.flatMap((g) => g.langs.map(([c]) => c));
export const DEFAULT_LANG: Lang = 'en';

export const LANG_LABEL: Record<string, string> = Object.fromEntries(
  LANG_GROUPS.flatMap((g) => g.langs),
);

/** 从右向左书写的语言 —— 页面要整体镜像,不做的话阿拉伯语版会完全读不了 */
export const RTL = new Set(['ar']);

/** hreflang:多数语言码即规范码,少数需要映射 */
export function hreflangOf(lang: Lang): string {
  // 与 packages/core/src/i18n 的 HREFLANG 保持一致 —— 以前这里写 zh-Hans、
  // 那边写 zh-CN,同一个语种在两处得出两个 hreflang,搜索引擎只会信其中一个。
  return ({ 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', 'jp': 'ja', 'kr': 'ko', 'my': 'ms', 'vn': 'vi', 'ph': 'tl', 'in': 'hi' } as Record<string, string>)[lang] ?? lang;
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
  /** 对外联系邮箱,后台站点总览可改;空则回落 inquiry@域名 */
  contact_email: string | null;
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
/* 按域名取站点记录。
   2026-09-07 修:这里原来是 `i.lang = ?` —— **精确匹配、没有任何回退**。
   新加一个语种(zh-tw)当天就炸了:site_i18n 里没有 zh-tw 行,查询返回 null,
   页面掉进硬编码的默认站,于是 biosphere-ai.com/zh-tw/ 显示的是 BEAUTY2OEM 的标题。
   跨站串内容比"标题没翻"严重得多 —— 站点身份不能依赖"每个语种都恰好有行"。
   现在和 getSiteById 走同一条回退链。 */
export async function getSiteByHost(db: D1Database, host: string, lang: Lang): Promise<SiteRow | null> {
  const clean = host.replace(/^www\./, '').split(':')[0];
  const row = await db
    .prepare(
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live, s.theme, s.contact_email,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang IN (?,?,?)
        WHERE s.domain = ?
        ORDER BY ${PRI(lang)} LIMIT 1`,
    )
    .bind(...chain(lang), clean)
    .first<SiteRow>();
  return row ?? null;
}

/**
 * 回退优先级 SQL 片段:目标语言 0、英文 1、简体 2,取序号最小的那条。
 * 这样一条查询就完成「有译文用译文,没有就用英文」,不必查两次。
 */
/* 优先级必须和 chain 完全一致。上一版把 en=1 / zh-cn=2 写死在 SQL 里,
   于是即便 chain 把 zh-cn 排在 en 前面,排序仍会挑英文 ——
   两处口径不一致时,SQL 说了算。zh-tw 上线当天首页标题落成英文就是这么来的。

   改成按 chain 的位置生成。语种码直接嵌进 SQL 而不是用占位符:
   占位符会让 PRI 多出三个 ?,打乱每一处 bind 的参数顺序(四个调用点、
   参数位置各不相同,改错一个就是静默取错语言)。嵌字面量之前先做字符过滤,
   语种码本来就来自固定白名单,过滤后只剩 a-z 与连字符,注入面为零。 */
const PRI = (col: Lang | string, lang?: Lang) => {
  const [c0, l] = lang === undefined ? ['i.lang', col as Lang] : [col as string, lang];
  const [a, b, c] = chain(l).map((x) => `'${String(x).replace(/[^a-z-]/g, '')}'`);
  return `CASE ${c0.replace(/[^\w.]/g, '')} WHEN ${a} THEN 0 WHEN ${b} THEN 1 WHEN ${c} THEN 2 ELSE 3 END`;
};
/* 回退链。默认是 [当前语种, en, zh-cn] ——
   但繁体中文不该退到英文:台港读者看简体虽然不地道,至少读得懂;
   退成英文则是彻底的降级。2026-09-07 实测:zh-tw 上线当天首页标题
   落成了英文那句,正是这条链的锅。
   同理,将来若加 zh-hk,也应先退 zh-tw 再退 zh-cn。 */
const chain = (lang: Lang) =>
  lang === 'zh-tw' ? [lang, 'zh-cn', 'en']
  : lang === 'zh-hk' ? [lang, 'zh-tw', 'zh-cn']
  : [lang, 'en', 'zh-cn'];

export async function getSiteById(db: D1Database, id: string, lang: Lang): Promise<SiteRow | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.domain, s.brand_color, s.variant, s.is_live, s.theme, s.contact_email,
              i.name, i.tagline, i.description
         FROM sites s
         JOIN site_i18n i ON i.site_id = s.id AND i.lang IN (?,?,?)
        WHERE s.id = ?
        ORDER BY ${PRI(lang)} LIMIT 1`,
    )
    .bind(...chain(lang), id)
    .first<SiteRow>();
  return row ?? null;
}

/**
 * 取导航树(两级)。
 * 标杆站 Intercos 是 6 顶级 × 15 二级、KDC-One 7 顶级,所以导航必须支持父子。
 * 只取 in_nav=1 且已发布的页面 —— 草稿页不出现在导航里。
 */
export async function getNav(db: D1Database, siteId: string, lang: Lang): Promise<NavItem[]> {
  /* 一次 batch 拿两份数据,别拆成两轮往返:
     ① 导航本身(in_nav=1);
     ② 每个父页**被藏起来的**子页数量。
     ②的用处:原料溯源有 100 个子页,菜单里只放 13 个 —— 创始人看到的就是
     「基地依然还是那几个」。挂一条「全部 N 种」到菜单末尾,余下 87 个才有入口。
     用聚合查询而不是相关子查询:相关子查询在这张表上曾把 3,716 行读成 392 万行。 */
  /* 09-24 R2:每次渲染都查(一天 30 万次 × 638 行),导航几天才改一次 —— 记 10 分钟,和页面缓存同寿命 */
  const rows = await memo(`nav:${siteId}:${lang}`, 600, async () => {
  const [navRes] = await db.batch<any>([
    db.prepare(
      `SELECT p.id, p.slug, p.parent_id, i.nav_label,
              MIN(${PRI(lang)}) AS pri
         FROM pages p
         JOIN page_i18n i ON i.page_id = p.id AND i.lang IN (?,?,?)
        WHERE p.site_id = ? AND p.status = 'published' AND p.in_nav = 1
        GROUP BY p.id
        ORDER BY p.sort_order, p.id`,
    )
      .bind(...chain(lang), siteId),
    /* 「父标签 · N」自动项 2026-09-11 已去掉,这里原来还带着一条 in_nav=0 的分组计数:
       每次渲染多读 250 行,罗盘实测一天 64,408 次 = 1,600 万行,结果没人用。删。 */
  ]);
  return (navRes?.results ?? []) as
    { id: number; slug: string; parent_id: number | null; nav_label: string }[];
  });
  const byId = new Map(rows.map((r) => [r.id, { slug: r.slug, label: r.nav_label, children: [] as NavItem[] }]));
  const top: NavItem[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.children.push(node);
    else top.push(node);
  }
  /* 2026-09-11:不再自动挂「父标签 · N」那条(创始人问「104 是什么概念」);被藏起来的子页由父页正文自己列。 */
  return top;
}

/**
 * 取整页内容(站点 + 页面 + 版块 + 导航)。
 * slug 传空字符串表示首页。
 * draft=true 时连草稿一起取 —— 只有后台预览会传 true。
 * withDraft=true(A9 · 09-23):把后台「存草稿」的未发布文案盖到这一页上 —— 只给已登录后台的预览请求传,
 *   调用方负责判登录(接入说明见 助手交付/23-后台易用/给A7-草稿预览接入说明.md)。
 */
export async function getPageBundle(
  db: D1Database,
  siteId: string,
  slug: string,
  lang: Lang,
  opts: { draft?: boolean; withDraft?: boolean } = {},
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
        ORDER BY ${PRI(lang)} LIMIT 1`,
    )
    .bind(...chain(lang), siteId, slug)
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
                /* 版块文案的优先级也走同一张表 —— 这里以前单独写死了
                   「当前语种 → en → 其余」,和 chain 不一致:zh-tw 的版块
                   会退到英文,而页面标题退到简体,同一页两种语言。 */
                ORDER BY ${PRI('bi.lang', lang)}
                LIMIT 1) AS data_json
         FROM blocks b
        WHERE b.page_id = ? AND b.is_visible = 1
        ORDER BY b.sort_order, b.id`,
    )
    .bind(...chain(lang), page.id)
    .all<{ id: number; type: string; sort_order: number; config_json: string; data_json: string | null }>();

  const blocks: BlockRow[] = (results ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    sort_order: r.sort_order,
    config: parse<Record<string, unknown>>(r.config_json, {}),
    data: parse<Record<string, unknown>>(r.data_json, {}),
  }));

  if (opts.withDraft) {
    const d = await getDraft(db, page.id);
    if (d) {
      const byId = new Map((d.blocks ?? []).map((b) => [b.id, b]));
      for (let i = blocks.length - 1; i >= 0; i--) {
        const x = byId.get(blocks[i].id);
        if (!x) continue;
        if (!x.is_visible) { blocks.splice(i, 1); continue; }
        const data = x.data?.[lang];
        if (data && Object.keys(data).length) blocks[i].data = data;
      }
      const m = (d.meta ?? []).find((r) => r.lang === lang && r.title);
      if (m) { page.title = m.title; page.seo_desc = m.seo_desc || page.seo_desc; }
    }
  }

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
