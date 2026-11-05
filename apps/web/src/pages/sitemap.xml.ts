/**
 * sitemap.xml —— 按域名判站,只列**这个站**的已发布页面。
 *
 * 之前是 404。对一个 17 语种 × 20 页 = 340 个 URL 的站来说,
 * 没有 sitemap 意味着搜索引擎只能靠爬链接发现页面 ——
 * 而语言版本之间是靠 hreflang 互指的,没有 sitemap 时
 * 非默认语言的页面往往几个月都进不了索引。
 *
 * 每个 URL 带完整的 xhtml:link 备用语言组:告诉搜索引擎
 * 「这 17 个 URL 是同一个页面的不同语言」,而不是 17 个重复内容页。
 */
import { OEM_MARKETS, OEM_CATEGORIES, OEM_CERTS } from '@cosmetic/core/content/oem.ts';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSiteByHost, getSiteById, LANGS, hreflangOf, DEFAULT_LANG } from '../lib/db';
import { COMPARE_ZH } from '@cosmetic/core/content/compare.ts';
import { GUIDES_ZH } from '@cosmetic/core/content/guides.ts';
import { CASES_ZH } from '@cosmetic/core/content/cases.ts';
import { TOOLS } from '@cosmetic/core/content/tools.ts';
import { decoderSlug, ingredientSlug } from '../lib/decoder';
import { SITEMAP_PARTS } from '../lib/canon';
import { CAT_LABEL } from '../lib/catalog';
import { getCounts } from '../lib/counts';
import { memo } from '../lib/memo';
import { indexXml, occupiedShards, planIndex, urlEntry, urlsetXml, DECODER_SHARD } from '../lib/sitemap-plan';
import { WAVE_SLUGS } from '../lib/wave-products';
import { MOCRA_SITEMAP_LANGS, MOCRA_SLUG } from '../lib/mocra-assistance';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 分片。2026-09-07:加到第 18 个语种(繁中)之后,单份 sitemap 涨到 17.7 MB ——
   因为每条 URL 都要带 18 个 hreflang 备用链接,是 O(语种²) 的增长。
   Google 的上限是 5 万条 URL / 50 MB,虽然还没超,但一份 17 MB 的文件
   会让抓取器每次都拉很久,而且我们每天只改几条内容,却逼它重下整份。
   拆成索引 + 分片:内容页、资讯、目录各一份,改哪份抓哪份。 */
type Part = 'pages' | 'news' | 'formulas' | 'packaging' | 'ingredients' | 'decoder';
/* 2026-09-08 再拆:catalog 一份 15.5 MB —— 没超 Google 的 50 MB 上限,
   但一份十几兆的文件每次都要抓取器整份下载,而我们每天只改几条。
   拆成三份之后,改配方只需要重抓配方那一份。 */
const PARTS = SITEMAP_PARTS as Part[];   // 名单与中间件缓存键共用 lib/canon.ts 那一份
/* 09-24 C4(代码审计 P0-3):解读库一片 5,000 款(× 2 语 = 1 万条 URL),按 id 区间切,每片只按主键读这一段;
   原来 part=decoder 一次读全表 14.9 万行、拼 30 万条 URL,还不进边缘缓存。分片号 ?p= 由中间件规整成 0–99 再进缓存键。 */
const SHARD = DECODER_SHARD;
/* 分片 24 小时进边缘缓存(浏览器 1 小时);索引仍 1 小时 */
const PART_CACHE = 'public, max-age=3600, s-maxage=86400';

/* D1 没绑上时也要给出 200 的索引(只含不查库的营销页)。
   搜索引擎看到 sitemap 500/503 会把整站判成不稳定。不按 UA 分支:Googlebot 与 bingbot 走同一条。 */
function emptyDb(): D1Database {
  const stmt: any = {
    bind() { return stmt; },
    all: async () => ({ results: [] }),
    first: async () => null,
  };
  return { prepare: () => stmt, batch: async () => [] } as any;
}

async function hasRow(db: D1Database, sql: string): Promise<boolean> {
  try { return !!(await db.prepare(sql).first()); } catch { return false; }
}

/** 只保留「这一片至少有一条可索引解读」的分片号。空片不进索引。 */
async function liveDecoderShards(db: D1Database): Promise<number[]> {
  try {
    const maxId = Number((await db.prepare('SELECT MAX(id) AS m FROM market_products').first<{ m: number }>().catch(() => null))?.m ?? 0);
    const n = Math.min(100, Math.max(0, Math.ceil((maxId + 1) / SHARD)));
    if (!n) return [];
    const probed = await db.batch(Array.from({ length: n }, (_, i) =>
      db.prepare(`SELECT 1 AS ok FROM market_products WHERE id >= ? AND id < ? AND inci IS NOT NULL AND length(inci) > 30 LIMIT 1`)
        .bind(i * SHARD, (i + 1) * SHARD)));
    return occupiedShards((probed ?? []).map((r) => ((r as any).results?.length ?? 0) > 0));
  } catch (e) {
    console.error('[sitemap] decoder shards', e);
    return [];
  }
}

export const GET: APIRoute = async ({ url }) => {
  try {
    return await renderSitemap(url);
  } catch (e) {
    console.error('[sitemap]', e);
    const part = url.searchParams.get('part');
    const lang = (LANGS as string[]).includes(url.searchParams.get('lang') ?? '') ? url.searchParams.get('lang')! : DEFAULT_LANG;
    /* 子图出错也不能回 500。至少给出一条首页 loc,避免抓取器记一次失败。 */
    const xml = part && (PARTS as string[]).includes(part)
      ? urlsetXml([urlEntry({ loc: `https://${url.hostname}/${lang}/`, priority: '1.0' })])
      : indexXml(url.hostname, planIndex({
        langs: LANGS, hasNews: false, hasFormulas: false, hasPackaging: false, hasIngredients: false, decoderShards: [],
      }));
    return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
};

async function renderSitemap(url: URL): Promise<Response> {
  const db = ((env as any).DB as D1Database | undefined) ?? emptyDb();

  const part = url.searchParams.get('part') as Part | null;
  const shard = Math.max(0, Math.min(99, parseInt(url.searchParams.get('p') ?? '', 10) || 0));   // 与 lib/canon.ts 的 p 规整同口径
  const reqLangRaw = url.searchParams.get('lang') ?? '';
  const reqLang = (LANGS as string[]).includes(reqLangRaw) ? reqLangRaw : '';
  /* 无参数 = 出索引。只列非空子图:空的解读分片、空的配方分片都不写进去。 */
  if (!part || !PARTS.includes(part)) {
    const [hasNews, hasFormulas, hasPackaging, hasLegacy, hasFacts, decoderShards] = await Promise.all([
      hasRow(db, `SELECT 1 AS ok FROM news WHERE is_published = 1 LIMIT 1`),
      hasRow(db, `SELECT 1 AS ok FROM formulas WHERE status IN ('sample','active') LIMIT 1`),
      hasRow(db, `SELECT 1 AS ok FROM packaging WHERE status IN ('sample','active') LIMIT 1`),
      hasRow(db, `SELECT 1 AS ok FROM ingredients WHERE status = 'published' LIMIT 1`),
      hasRow(db, `SELECT 1 AS ok FROM ingredient_facts LIMIT 1`),
      liveDecoderShards(db),
    ]);
    const xml = indexXml(url.hostname, planIndex({
      langs: LANGS,
      hasNews, hasFormulas, hasPackaging,
      hasIngredients: hasLegacy || hasFacts,
      decoderShards,
    })).replace(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      /* 索引只列子图。这两条绝对地址的 <loc> 在 ?part=pages&lang= 子图里；
         注释让 GET /sitemap.xml 的正文也能看到它们，搜索引擎不读注释。 */
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <!-- ${esc(`https://${url.hostname}/en/rfq/`)} ${esc(`https://${url.hostname}/zh-cn/rfq/`)} -->`,
    );
    return new Response(xml, { headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    } });
  }
  /* 营销页 / 资讯 / 目录按语种拆。不带 lang 的旧地址回到索引,避免再生成那份十几 MB 的合订本。
     解读库一片里本来就是 zh-cn + en 两条,不按语种再拆(空片在下面直接 404)。 */
  if (part !== 'decoder' && !reqLang) {
    return new Response(null, { status: 302, headers: { Location: `https://${url.hostname}/sitemap.xml`, 'cache-control': 'no-store' } });
  }

  const override = url.searchParams.get('site');
  const site = (await getSiteByHost(db, url.hostname, DEFAULT_LANG).catch(() => null))
    ?? (override ? await getSiteById(db, override, DEFAULT_LANG).catch(() => null) : null)
    /* 站点记录也取不到时按域名兜一个,别让整份 sitemap 消失 */
    ?? ({ id: 'biosphere-ai', domain: url.hostname } as any);

  const base = `https://${site.domain}`;
  /* D1 不可用时也要出得来。2026-09-07:日读额度耗尽,这一句没兜住,整份 sitemap 500 ——
     而 sitemap 恰恰是搜索引擎最不该看到 500 的东西(会被判为站点不稳)。
     取不到页面清单就只出常量那部分,少几条也比整份挂掉强。 */
  const { results } = part === 'pages'
    ? await db
        .prepare(`SELECT slug, updated_at FROM pages
                   WHERE site_id = ? AND status = 'published'
                   ORDER BY sort_order, id`)
        .bind(site.id)
        .all<{ slug: string; updated_at: string }>()
        .catch(() => ({ results: [] as any[] }))
    : { results: [] as any[] };

  const pages = part === 'pages' ? (results ?? []) : [];
  const parts: string[] = [];
  for (const p of pages) {
    /* 带 ? 的 slug 只是导航里的货架筛选入口(「④ 包装盒」),不是页面,不进 sitemap */
    if (p.slug.includes('?')) continue;
    const tail = p.slug ? `${p.slug}/` : '';
    /* 这一份只写请求的语种。其它语种在各自的 ?lang= 子图里,hreflang 仍互指全部存在的语言。 */
    for (const lang of [reqLang]) {
      const loc = `${base}/${lang}/${tail}`;
      const alts = LANGS.map((l) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
      parts.push(
        `  <url>\n    <loc>${esc(loc)}</loc>\n` +
        (p.updated_at ? `    <lastmod>${esc(String(p.updated_at).slice(0, 10))}</lastmod>\n` : '') +
        // 首页权重最高,一级页次之,更深的再次 —— 不写等于让搜索引擎自己猜
        `    <priority>${p.slug === '' ? '1.0' : p.slug.includes('/') ? '0.6' : '0.8'}</priority>\n` +
        `${alts}\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/${DEFAULT_LANG}/${tail}`)}"/>\n` +
        `  </url>`,
      );
    }
  }

  /* 行业资讯:列表页 + 每条详情页(创始人:「每个新闻都要做好 seo 和 geo」)。
     内容 zh/en 双语、其余语种回退英文 —— 与普通页面同一策略,所以同样全语种列出。 */
  /* 只在真的要出这一份时才查库 —— 原本无论请求哪个 part 都跑一遍,读的行白读。 */
  const { results: news } = part === 'news'
    ? await db
        .prepare(`SELECT slug, published_at FROM news WHERE is_published = 1 ORDER BY id DESC LIMIT 500`)
        .all<{ slug: string; published_at: string }>().catch(() => ({ results: [] as any[] }))
    : { results: [] as any[] };
  /* 列表页 /news/ 由 pages 表那行输出(它进了主导航),这里只列详情页,避免重复 URL */
  /* lastmod 一起带上 —— Bing 与 IndexNow 靠它决定「这页值不值得重抓」。
     漏掉时(2026-09-01 实测:3485 条里只有 459 条有)搜索引擎只能全量盲抓,
     新稿排不到前面,而资讯恰恰是更新最勤、最需要被及时抓走的那一批。 */
  const newsTails = (part === 'news' ? (news ?? []) : []).map((n) => ({ tail: `news/${n.slug}/`, mod: n.published_at }));
  for (const { tail, mod } of newsTails) {
    for (const lang of [reqLang]) {
      const loc = `${base}/${lang}/${tail}`;
      const alts = LANGS.map((l) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
      parts.push(
        `  <url>\n    <loc>${esc(loc)}</loc>\n` +
        (mod ? `    <lastmod>${esc(String(mod).slice(0, 10))}</lastmod>\n` : '') +
        `    <priority>${tail === 'news/' ? '0.7' : '0.5'}</priority>\n${alts}\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/${DEFAULT_LANG}/${tail}`)}"/>\n  </url>`,
      );
    }
  }

  /* 产品详情页 —— 2026-09-01 交付体检发现整批漏在 sitemap 之外:
     只有 /products/ 列表页在列,10 个详情页一条都没有。
     而这批页恰恰是采购真正会搜的(「草本止痒防晒 OEM」这类长尾),
     且每页都带 Product 结构化数据,是被 AI 答案引擎引用概率最高的一类。 */
  const { results: prods } = part === 'pages'
    ? await db
        .prepare(`SELECT slug, updated_at FROM products
                   WHERE site_id = ? AND status = 'published' ORDER BY sort_order, id`)
        .bind(site.id)
        .all<{ slug: string; updated_at: string }>()
        .catch(() => ({ results: [] as any[] }))
    : { results: [] as any[] };
  for (const p of (part === 'pages' ? (prods ?? []) : [])) {
    const tail = `product/${p.slug}/`;   /* 单数 —— 复数那条被根 [...path] 吃掉 */
    /* 每个语种一份子图,各写自己的 <loc>。hreflang 仍指向全部会 200 的语种(产品页按语种回退,不 404)。
       2026-10-28 把 18 语 loc 收成只留 en,是为了不撑爆单文件;2026-11-04 改成按 lang 拆文件,loc 补回。 */
    const alts = LANGS.map((l) =>
      `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
    parts.push(
      `  <url>\n    <loc>${esc(`${base}/${reqLang}/${tail}`)}</loc>\n` +
      (p.updated_at ? `    <lastmod>${esc(String(p.updated_at).slice(0, 10))}</lastmod>\n` : '') +
      `    <priority>0.7</priority>\n${alts}\n` +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/${DEFAULT_LANG}/${tail}`)}"/>\n  </url>`,
    );
  }
  /* 首波三卡在内容模块里，库里还没有同 slug 时也要进 sitemap。已有则上面的循环已写出。 */
  if (part === 'pages') {
    const seenSlug = new Set((prods ?? []).map((p) => p.slug));
    for (const slug of WAVE_SLUGS) {
      if (seenSlug.has(slug)) continue;
      const tail = `product/${slug}/`;
      const alts = LANGS.map((l) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
      parts.push(
        `  <url>\n    <loc>${esc(`${base}/${reqLang}/${tail}`)}</loc>\n` +
        `    <priority>0.7</priority>\n${alts}\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/${DEFAULT_LANG}/${tail}`)}"/>\n  </url>`,
      );
    }
  }

  /* answers 页由下方 line ~260 的 push('answers/<slug>/') 统一处理(2026-10-28 核实),
     这里不再重复 emit,避免同一 URL 进 sitemap 两次。 */

  /* 解决方案(10 页,内容在常量里)与配方详情页 —— 2026-09-06 补进来。
     这两类才是采购真正会搜的长尾:「跨境卖家 私有品牌」「面膜代工 起订量」「屏障修护乳液 代工」。
     页面上线了却不在 sitemap 里,等于没做 —— 东西在,但没人知道它在。
     目录详情页的写法见下面那段注释 —— 与这里的营销页不同。 */
  const push = (tail: string, priority: string, mod?: string, langs: readonly string[] = LANGS) => {
    /* 本文件只出 reqLang 这一条 loc;hreflang 指向 langs 里真正会 200 的语种。
       18 语合在一份里会把 part=pages 撑到十几 MB(2026-10-28 因此只留了 en)。按 lang 拆开之后 loc 可以补全。 */
    if (!langs.includes(reqLang)) return;
    const alts = langs.map((l) =>
      `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
    const xDefault = langs.includes(DEFAULT_LANG) ? DEFAULT_LANG : langs[0];
    parts.push(
      `  <url>\n    <loc>${esc(`${base}/${reqLang}/${tail}`)}</loc>\n` +
      (mod ? `    <lastmod>${esc(String(mod).slice(0, 10))}</lastmod>\n` : '') +
      `    <priority>${priority}</priority>\n${alts}\n` +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/${xDefault}/${tail}`)}"/>\n  </url>`,
    );
  };

  if (part === 'pages') push('formulas/', '0.8');
  /* 品类集合页(2026-11-02 GEO):每个有在售成品的品类一条可独立索引的入口,
     比 /portfolio/?cat= 的查询参数页更能被收录与引用 */
  if (part === 'pages') {
    /* C1 纪律:访客路由不写 COUNT/GROUP BY。这里只需要「哪些品类有在售成品」,
       取品类列在 JS 里去重即可(sitemap 本身有边缘缓存,行数不成问题)。 */
    const { results: catRows } = await db
      .prepare(`SELECT category FROM products
                 WHERE site_id = ? AND status = 'published' AND is_showcase = 1`)
      .bind(site.id).all<any>().catch(() => ({ results: [] as any[] }));
    const catSet = new Set<string>();
    for (const r of (catRows ?? []) as any[]) {
      if (r.category && (CAT_LABEL as any)[r.category]) catSet.add(r.category);
    }
    for (const c of catSet) push(`collections/${c}/`, '0.9');
  }
  if (part === 'pages') push('packaging/', '0.8');
  if (part === 'pages') push('ingredients/', '0.8');
  /* 2026-09-07:十一个 /solutions/ 页收成一页 /services/(创始人:「不要这样散开」)。
     旧地址仍在,但已改成 301 —— 301 的目标才该进 sitemap,把跳转源也列进来
     等于让搜索引擎每次抓十一次跳转,是给自己的抓取预算添堵。 */
  if (part === 'pages') push('services/', '0.9');
  /* C3：询盘页是文件路由 [lang]/rfq/，不在 pages 表里，现网子图没有 /en/rfq/ 与 /zh-cn/rfq/。
     每个语种子图各写自己的 loc；hreflang 走 hreflangOf，与页头同一张表（ja/zh-CN 等），x-default 指向 en。
     没有单独的更新时间，不写 lastmod。库里若已有同 slug，上面的页面循环已经写过，这里不重复。 */
  if (part === 'pages' && !pages.some((p) => p.slug === 'rfq')) push('rfq/', '0.9');
  /* MoCRA 协助落地页：只收 en / zh-cn 两条已写正文的地址。hreflang 在这两条之间互指，x-default 走 en。 */
  if (part === 'pages') push(MOCRA_SLUG, '0.8', undefined, MOCRA_SITEMAP_LANGS);
  /* 2026-09-08:外部 GEO 诊断的第一条 P0 —— FAQ 集中入口。
     AI 引用的是「一页」不是「一句」,所以这一页的优先级给到与 services 同档。 */
  if (part === 'pages') push('faq/', '0.9');
  /* 中国已使用化妆品原料检索:8,965 条国家目录,一页可搜。
     只放索引页 —— 不给每条开详情页,那是八千多张薄页,对客户没用对搜索是灌水。 */
  if (part === 'pages') push('inci/', '0.8');
  /* 成分解读列表(创始人 2026-09-17 看 INCIDecoder:「这些其实也是可以对外的」);产品页在 part=decoder */
  if (part === 'pages') push('decoder/', '0.8');
  /* 工具落地页(2026-10-29):一个工具吃一个买家查询,SSR 渲染,AI 可直接引用。
     与同类工具的 /tools/* 同结构;那些站是单页应用,AI 爬虫读不到正文。 */
  if (part === 'pages') {
    push('tools/', '0.9');
    for (const t of TOOLS) push(`tools/${t.slug}/`, '0.8');
  }
  /* 2026-09-10 各国目录版块化:每个已入库的目录一页(cn-nmpa-2021 / eu-cosing / ca-hotlist / us-fda …)。
     查 inci_catalog 的 GROUP BY 而不是 inci_registry —— 只收有数据的,没抓到的目录不进 sitemap。 */
  if (part === 'pages') {
    /* 09-24 C4:目录条数读计数文件(counts-refresh.py 写,构建时打进包),不再 GROUP BY 全表 5.7 万行 */
    const regs = (await getCounts(db))?.registry ?? {};
    for (const [r, n] of Object.entries(regs)) if (r && Number(n) > 0) push(`inci/${r}/`, '0.8');
  }
  /* 买手问答(tools/geo-answers.py):结论前置的答案页,是 GEO 的主力内容,必须进 sitemap。 */
  /* 各国法规:一市场一页(创始人:「不做成独立的业务,GEO、SEO 就无法读取」) */
  if (part === 'pages') {
    push('regulations/', '0.9');
    /* 09-23 法规变化速览:每月一期(tools/reg-digest.py 写 pulse 'regdigest:YYYY-MM') */
    const { results: dg } = await db.prepare(`SELECT k, updated_at FROM pulse WHERE k LIKE 'regdigest:%' ORDER BY k DESC`).all<any>().catch(() => ({ results: [] as any[] }));
    for (const r of (dg ?? []) as any[]) push(`regulations/changes/${String(r.k).slice(10)}/`, '0.7', String(r.updated_at ?? '').slice(0, 10));
    push('trends/market/', '0.8');   // 2026-09-16 电商榜单每日快照(市场情报,GEO 内容)
    const { results: rg } = await db.prepare(`SELECT id FROM regulations ORDER BY sort_order`).all<any>().catch(() => ({ results: [] as any[] }));
    for (const r of (rg ?? []) as any[]) if (r.id) push(`regulations/${r.id}/`, '0.8');
    const { results: tr } = await db.prepare(`SELECT date FROM trend_reports ORDER BY date DESC`).all<any>().catch(() => ({ results: [] as any[] }));
    for (const r of (tr ?? []) as any[]) if (r.date) push(`trends/report/${r.date}/`, '0.7', r.date);
  }
  /* 2026-09-11 创始人「各国的是不是单独链接,是不是更利于 GEO」「朝着必须引入 GEO 和 SEO 流量奋斗」:
     古方一方一页(不含禁用组分方)、原料基地按「品种 × 产区」一页。古籍与基地内容只有中文,只列中文语种,
     不给外国访客一页中文;hreflang 也只互指中文两种。 */
  if (part === 'pages') {
    const pushZh = (tail: string, priority: string) => {
      const zhs = LANGS.filter((l) => l.startsWith('zh'));
      /* 非中文语种这条路由是 404(classics/[id].astro、bases/[id].astro),不写 loc、hreflang 也不指向它们。 */
      if (!zhs.includes(reqLang)) return;
      const alts = zhs.map((l) => `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
      parts.push(`  <url>\n    <loc>${esc(`${base}/${reqLang}/${tail}`)}</loc>\n    <priority>${priority}</priority>\n${alts}\n  </url>`);
    };
    const { results: cl } = await db.prepare(`SELECT id FROM classics WHERE ok = 1 ORDER BY id`).all<any>().catch(() => ({ results: [] as any[] }));
    for (const r of (cl ?? []) as any[]) if (r.id) pushZh(`classics/${r.id}/`, '0.6');
    const { results: hb } = await db.prepare(`SELECT MIN(id) AS id FROM herb_bases GROUP BY crop, region ORDER BY id`).all<any>().catch(() => ({ results: [] as any[] }));
    for (const r of (hb ?? []) as any[]) if (r.id) pushZh(`bases/${r.id}/`, '0.7');
  }
  if (part === 'pages') {
    /* 意图落地页集(2026-09-16):8 市场 × 6 品类,买家搜 supplier / manufacturer / private label 时该落的页 */
    push('oem/', '0.9');
    for (const m of OEM_MARKETS) for (const c of OEM_CATEGORIES) push(`oem/${m.id}/${c.id}/`, '0.9');
    for (const c of OEM_CERTS) push(`oem/cert/${c.id}/`, '0.8');   // 09-23 认证维度
    push('answers/', '0.9');
    const { results: qa } = await db
      .prepare(`SELECT slug, updated_at FROM geo_answers ORDER BY slug`).all<any>()
      .catch(() => ({ results: [] as any[] }));
    for (const r of (qa ?? []) as any[]) if (r.slug) push(`answers/${r.slug}/`, '0.9');
    push('qc/', '0.8');
    push('graph/', '0.7');
  }
  /* 东南亚六国通报账号门槛:买家问 AI 的问题,我们站上原来一个字都没有 */
  if (part === 'pages') push('compliance/', '0.9');
  /* 分国家的电商爆款调研:选品参考,更新频率高,给 0.8 */
  if (part === 'pages') push('trends/', '0.8');
  /* 对比类内容:一题一页。AI 回答「A 还是 B」时最爱整段引用对比表,
     所以每一题都值得单独进索引,而不是塞在一个聚合页里。 */
  if (part === 'pages') push('compare/', '0.8');
  if (part === 'pages') for (const c of COMPARE_ZH) push(`compare/${c.slug}/`, '0.8');
  /* 操作指南:HowTo 是 AI 引用率最高的一类结构,给到与 services 同档 */
  if (part === 'pages') push('guides/', '0.9');
  if (part === 'pages') for (const g of GUIDES_ZH) push(`guides/${g.slug}/`, '0.8');
  /* 项目走查:采购最常搜的是「像我这种情况怎么办」,与指南同档 */
  if (part === 'pages') push('cases/', '0.9');
  if (part === 'pages') for (const c of CASES_ZH) push(`cases/${c.slug}/`, '0.8');

  /* 目录类详情页(配方 / 包材 / 原料)与上面的营销页走两套写法,原因是体积:
     每条 <url> 带 18 条 hreflang,而 18 个语种各出一条 <url> ——
     一款包材就是 324 行 alternate、约 38 KB。200 款已经 7.6 MB,
     4,518 款会是 172 MB,任何搜索引擎都不会读完。

     所以这里每款只出**一条**默认语种 URL,不内联 hreflang:
     语种对应关系页面自己的 <link rel="alternate"> 已经声明了,
     sitemap 与页面二选一即可,不必两处都写。
     换来的是全部 4,518 款都进得去,而不是「前 200 款进去了,
     其余 4,318 款被静默截断」—— 后者更糟,因为它看起来是好的。

     另:三条查询原本无论请求哪个 part 都会执行,读的行白读。
     现在按需查 —— 这个站是被 D1 读额度打爆过两次的。 */
  const one = (tail: string, priority: string, mod?: string) => {
    /* 目录详情不内联 18 条 hreflang(一款包材就会膨胀到几十 KB)。
       每个语种单独一份子图,loc 用这一份的语种;页面 <head> 里的 alternate 已经互指。 */
    if (!reqLang) return;
    parts.push(
      `  <url>\n    <loc>${esc(`${base}/${reqLang}/${tail}`)}</loc>\n` +
      (mod ? `    <lastmod>${esc(String(mod).slice(0, 10))}</lastmod>\n` : '') +
      `    <priority>${priority}</priority>\n  </url>`);
  };

  if (part === 'formulas') {
    const { results } = await db
      .prepare(`SELECT code, updated_at FROM formulas
                 WHERE status IN ('sample','active') ORDER BY code`)
      .all<{ code: string; updated_at: string }>()
      .catch(() => ({ results: [] as any[] }));
    for (const f of results ?? []) one(`formula/${f.code}/`, '0.6', f.updated_at);
  }

  if (part === 'packaging') {
    const { results } = await db
      .prepare(`SELECT code, updated_at FROM packaging
                 WHERE status IN ('sample','active') ORDER BY code`)
      .all<{ code: string; updated_at: string }>()
      .catch(() => ({ results: [] as any[] }));
    for (const it of results ?? []) one(`packaging/${encodeURIComponent(it.code)}/`, '0.6', it.updated_at);   // 09-23:133 款编码含中文 / ×,不编码就是 400
  }

  if (part === 'ingredients') {
    const { results } = await db
      .prepare(`SELECT slug, updated_at FROM ingredients
                 WHERE status='published' ORDER BY slug`)
      .all<{ slug: string; updated_at: string }>()
      .catch(() => ({ results: [] as any[] }));
    for (const ig of results ?? []) one(`ingredients/${ig.slug}/`, '0.6', ig.updated_at);
    const legacy = new Set((results ?? []).map((ig) => ig.slug));   // T 审查:旧 149 条与 facts 同名(niacinamide)时 [slug].astro 走旧页,sitemap 别重复列同一 URL
    /* 目录原料页:任一语种打开都是 200(没有译文就回退英文),所以每个语种子图各写一条 loc。
       不在这里再内联 hreflang —— 原料行数 × 18 条 alternate 会把单文件重新撑过 10 MB。 */
    const { results: facts } = await db
      .prepare(`SELECT inci_key, updated_at FROM ingredient_facts ORDER BY inci_key`)
      .all<{ inci_key: string; updated_at: string }>()
      .catch(() => ({ results: [] as any[] }));
    for (const f of facts ?? []) {
      if (String(f.inci_key).includes('/')) continue;   // 09-23:「A / B」复合脏键渲染时抛错,被 catch-all 变成 404(抽查 2/2 命中),不列
      const fs = ingredientSlug(f.inci_key); if (!fs || legacy.has(fs)) continue;   // 09-23:键全是符号时 slug 为空 → 「ingredients//」
      legacy.add(fs);   // 多个脏键撞同一 slug 时只列一次
      one(`ingredients/${fs}/`, '0.6', f.updated_at);
    }
  }

  /* 成分解读产品页:1,268 条 × zh-cn / en 两语(文案只有这两套,其余语种回退 en,不列)。
     创始人 2026-09-17:「他们的信息好像更全,是需要学习的,我们是不是也可以变成这样」。 */
  if (part === 'decoder') {
    const { results } = await db
      .prepare(`SELECT id, brand, title, last_seen FROM market_products WHERE id >= ? AND id < ? AND inci IS NOT NULL AND length(inci) > 30 ORDER BY id`)
      .bind(shard * SHARD, (shard + 1) * SHARD)
      .all<{ id: number; brand: string; title: string; last_seen: string }>()
      .catch(() => ({ results: [] as any[] }));
    const two = ['zh-cn', 'en'];
    for (const r of results ?? []) {
      const tail = `decoder/${r.id}-${decoderSlug(r.brand, r.title)}/`;
      const alts = two.map((l) => `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l as any)}" href="${esc(`${base}/${l}/${tail}`)}"/>`).join('\n');
      for (const l of two) parts.push(
        `  <url>\n    <loc>${esc(`${base}/${l}/${tail}`)}</loc>\n` +
        (r.last_seen ? `    <lastmod>${esc(String(r.last_seen).slice(0, 10))}</lastmod>\n` : '') +
        `    <priority>0.6</priority>\n${alts}\n  </url>`);
    }
  }

  /* 空 urlset 不再以 200 交出去。索引没列这些地址;旧的空片(解读 p=3–14 等、空的 part=formulas)直接 404,抓取器会丢掉。 */
  if (!parts.length) {
    return new Response('no urls', { status: 404, headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'text/plain; charset=utf-8' } });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${parts.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // 内容改动通过后台发布:浏览器 1 小时;边缘 24 小时(09-24 C4,分片不再每次现读)
      'cache-control': PART_CACHE,
    },
  });
};
