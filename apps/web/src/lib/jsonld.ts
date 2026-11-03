/**
 * 结构化数据(JSON-LD)。
 *
 * 做两件事,而且是两个不同的读者:
 *
 *  ① 搜索引擎 —— 靠它出富摘要(公司信息卡、面包屑、FAQ 折叠)。
 *  ② AI 答案引擎(GEO)—— 这一层现在更值钱。ChatGPT / Perplexity / Google AI
 *     回答「中国有哪些做草本护肤的 OEM 工厂」时,取的是它能**确定**的事实。
 *     页面正文里的「20,000+ ㎡」对机器是一串字符,要靠上下文猜;
 *     放进 JSON-LD 的 `value` 字段,它就是一条明确的数据。
 *     写不写这一层,决定的是被不被引用,而不只是排名高低。
 *
 * 原则:这里**只能**放页面上真实存在、且来自公司介绍资料的事实。
 * 结构化数据里写页面上没有的内容,搜索引擎判为 spam,得不偿失。
 */
/* ORG 与 orgJsonLd 已挪到 packages/core/src/content/org.ts —— 见那边的说明。
   这里再导出一次,站内所有既有 import 保持不变。 */
export { ORG, orgJsonLd } from '@cosmetic/core/content/org.ts';

/** 面包屑 —— 搜索结果里把路径显示成「首页 › 能力与服务 › 生产制造」而不是一串 URL */
export function breadcrumbJsonLd(base: string, locale: string, path: string, homeLabel: string, trail: { label: string; href: string }[]) {
  if (!trail.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeLabel, item: `${base}/${locale}/` },
      ...trail.map((t, i) => ({ '@type': 'ListItem', position: i + 2, name: t.label, item: `${base}${t.href}` })),
    ],
  };
}

/**
 * 产品结构化数据。
 *
 * AI 答案引擎回答「有没有能做草本精华的中国工厂」时,靠的是它能**确定**的事实。
 * 页面上的「双源草本精华水」对机器是一串字符;放进 Product schema
 * 的 name/category/brand,它就是一条可引用的数据。
 *
 * ── 和 DTC 商店的关键区别:不写价格 ──────────────────────────
 * 电商教程会让你把 price / availability 填满,因为那是购物场景。
 * 代工不是:价格按单报,写一个数字进结构化数据既不真实,
 * 也和创始人定的「不展现价格」冲突。
 * schema.org 允许 Offer 只声明 businessFunction 而不给 price ——
 * 用它表达「这是代工服务,不是现货零售」,比编一个价格诚实得多,
 * 也不会让 AI 拿一个假价格去回答用户。
 */
export function productJsonLd(
  base: string, locale: string,
  p: { slug: string; name: string; summary?: string | null; category?: string; moq?: string | null; image?: string | null },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${base}/${locale}/product/${p.slug}/`,
    name: p.name,
    ...(p.summary ? { description: p.summary } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.image ? { image: p.image.startsWith('http') ? p.image : `${base}${p.image}` } : {}),
    brand: { '@id': `${base}/#organization` },
    manufacturer: { '@id': `${base}/#organization` },
    offers: {
      '@type': 'Offer',
      // 代工:提供的是制造服务,不是现货零售。不给 price 是刻意的
      businessFunction: 'http://purl.org/goodrelations/v1#ProvideService',
      availability: 'https://schema.org/InStock',
      seller: { '@id': `${base}/#organization` },
      ...(p.moq ? { eligibleQuantity: { '@type': 'QuantitativeValue', description: p.moq } } : {}),
      url: `${base}/${locale}/portfolio/`,
    },
  };
}

/** 产品列表。让引擎知道这一页是个目录,而不是一篇散文 */
export function itemListJsonLd(base: string, locale: string, items: { slug: string; name: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.name,
      url: `${base}/${locale}/product/${p.slug}/`,
    })),
  };
}

/**
 * FAQ。
 *
 * 这是 GEO 里性价比最高的一块:AI 引擎优先抓「直接回答问题」的内容,
 * 而 FAQPage 是唯一能让它**确定**「这段文字是对这个问题的回答」的结构。
 * 同样一段话写在正文里要靠模型自己判断,放进 FAQPage 就是明示。
 *
 * 前提是页面上真的有这些问答 —— 结构化数据里写页面上没有的内容,
 * 搜索引擎判为 spam,得不偿失。
 */
/**
 * HowTo —— 2026-09-08 之前全站零命中。
 *
 * 外部 GEO 诊断:「『如何选 OEM』AI 引用率最高」。原因不神秘 ——
 * 采购问 AI 的问题里「怎么做」远多于「是什么」,
 * 而 HowTo 的步骤自带编号与顺序,AI 可以整段搬走,不用自己组织。
 *
 * 只输出真有内容的字段:totalTime 与 supply 拿不准就不写。
 * schema 里写一个猜的时长,比不写更糟 —— 它会被当成承诺。
 */
export function howToJsonLd(x: {
  name: string;
  description: string;
  url: string;
  totalTime?: string;
  supply?: string[];
  steps: { name: string; text: string }[];
}) {
  if (!x.steps.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: x.name,
    description: x.description,
    url: x.url,
    ...(x.totalTime ? { totalTime: x.totalTime } : {}),
    ...(x.supply?.length
      ? { supply: x.supply.map((s) => ({ '@type': 'HowToSupply', name: s })) }
      : {}),
    step: x.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((x) => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}

/**
 * 网站本体 + 站内搜索。
 * 这条让搜索引擎知道「这是一个站,不是一堆散页」。
 */
export function siteJsonLd(base: string, siteName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: base,
    name: siteName,
    publisher: { '@id': `${base}/#organization` },
  };
}
