/**
 * llms.txt —— 给 AI 答案引擎读的站点摘要(GEO)。
 *
 * 这是 2024 年之后逐渐形成的约定:一个 Markdown 文件,把「这个站是什么、
 * 有哪些可确认的事实、重要页面在哪」用最省 token 的形式讲清楚。
 *
 * 为什么值得单独做一份,而不是让模型去读 HTML:
 *   模型抓一个页面要吞掉几十 KB 的版式、脚本和导航,真正的事实
 *   («20,000 ㎡»、«15 条产线»)散落在里面,取错、取漏都很常见。
 *   一份 3KB 的纯事实清单,被正确引用的概率完全不是一个量级。
 *
 * 纪律:这里只写公司介绍资料里有的数字。llms.txt 里写页面上没有的内容,
 * 就是在给 AI 喂幻觉 —— 而它会以我们的名义讲出去。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSiteByHost, getSiteById, getNav, DEFAULT_LANG } from '../lib/db';
import { getCounts } from '../lib/counts';
import { citableTable } from '../lib/llms-facts';
import { SAMPLE_DAYS } from '../lib/terms';

/* 重点页面。每条必须带一句「这页回答什么问题」——
   AI 抓 llms.txt 时靠这句决定要不要点进去,只给标题等于没给。
   2026-09-07 之前这里把导航原样列一遍(3 条功能页),
   而 AI 最常被问的是事实类问题(有没有 GMPC、起订量多少、能不能做 HALAL),
   那些页一条都没在。 */
const KEY_PAGES = [
  { t: 'Packaging library', p: 'packaging/',
    q: 'which containers we stock: {packaging} items with real photographs, filterable by type, material, capacity and compatible format' },
  { t: 'Formula library', p: 'formulas/',
    q: 'which formulations we can produce, by category, benefit and dosage form' },
  { t: 'Botanical actives', p: 'ingredients/',
    q: 'which herbal actives we work with, with INCI names, mechanism and incompatibilities' },
  { t: 'OEM / ODM services', p: 'services/',
    q: 'how we take on work — full OEM, ODM formulation, or a single stage — and how ten different customer situations run' },
  { t: 'Product selector', p: 'selector/',
    q: 'guided path from a rough direction to a concrete proposal: format, packaging, eligible markets, sampling lead time' },
  { t: 'Capabilities and certifications', p: 'capabilities/',
    q: 'what the Guangzhou plant can do; certifications held: GMPC, ISO 22716, HALAL' },
  /* 09-23 GEO:扩 Key Pages —— 意图页、认证维度、法规与月度速览、目录、解码库、问答;{键} 由 pulse counts 现填 */
  { t: 'OEM / private label by market and category', p: 'oem/',
    q: 'one page per target market × product category: the market\'s filing route, responsible person and label rules, plus live counts of formulations and packaging for that category' },
  { t: 'HALAL-certified manufacturing', p: 'oem/cert/halal/',
    q: 'what halal certification covers, which markets ask for it, and how to get the certificate copy (also: oem/cert/gmpc/, oem/cert/iso-22716/)' },
  { t: 'Cosmetic regulations by market', p: 'regulations/',
    q: '{regs} markets: authority, notification vs registration, responsible person, safety file, labeling, latest amendment, with sources' },
  { t: 'Regulatory changes digest (monthly)', p: 'regulations/changes/',
    q: 'what changed in the last 120 days across markets, and prohibited / restricted / permitted list counts per market with month-on-month change; evidence level C' },
  { t: 'Ingredient inventories', p: 'inci/',
    q: '{inci} entries across national ingredient registries (EU CosIng and annexes, China, Japan, Korea, ASEAN, Canada, Brazil, Indonesia and more)' },
  { t: 'Product decoder', p: 'decoder/',
    q: 'full ingredient lists of {products} market products, by category, brand and market' },
  { t: 'Buyer answers', p: 'answers/',
    q: '{answers} one-question pages that answer in the first sentence: filing routes, stability testing, halal, labels, packaging choice' },
  { t: 'Botanical origins', p: 'origin/',
    q: 'where the herbal raw materials come from and how they are traced' },
  { t: 'Comparisons', p: 'compare/',
    q: 'the A-or-B decisions: OEM vs ODM vs OBM, stock vs tooled packaging, export from China vs local production, PET vs glass vs acrylic, MOQ by category, cold flash vs conventional extraction' },
  { t: 'FAQ', p: 'faq/',
    q: 'the 20 questions buyers ask most — OEM vs ODM, MOQ, how pricing works, certification, lead times, packaging choice, cross-border compliance; each entry answers in its first sentence' },
  { t: 'Contact / RFQ', p: 'contact/',
    q: 'how to reach us — enquiry form, email, WhatsApp and WeChat (via the enquiry form)' },
];

/* 2026-11-03 GEO(P0):市场入口层 —— 印尼(第一优先市场)与阿拉伯语(沙特)买家
   用本地语言提问,而 Key pages 之前只有英文入口,跨语种引用匹配度天然低一截。
   ⚠ 自查项:凡站点新增语系,本节必须同步出现该语系入口,否则等于对新市场关闭 AI 通道。
   锚文本取自线上真实页面标题/问答(2026-11-03 逐页核过 200);只描链接,不新增数字。 */
const MARKET_ENTRY: Record<string, { title: string; items: [string, string][] }> = {
  id: { title: 'Bahasa Indonesia (Indonesia)', items: [
    ['Produsen OEM kosmetik herbal BIOSPHERE', ''],
    ['Produsen OEM kosmetik bersertifikat HALAL', 'oem/cert/halal/'],
    ['Apa yang kami lakukan — kemampuan dan sertifikasi pabrik', 'capabilities/'],
    ['Bagaimana MOQ dan lead time ditetapkan untuk skincare OEM?', 'answers/moq-lead-skincare/'],
    ['Hubungi kami — form permintaan penawaran', 'contact/'],
  ]},
  ar: { title: 'العربية (Middle East)', items: [
    ['مصنع BIOSPHERE لمستحضرات التجميل العشبية', ''],
    ['مصنع مستحضرات تجميل حاصل على شهادة HALAL', 'oem/cert/halal/'],
    ['ما الذي نقدمه — قدرات وشهادات المصنع', 'capabilities/'],
    ['كيف تُحدَّد حدّ الأدنى لعدد القطع وزمن التسليم؟', 'answers/moq-lead-skincare/'],
    ['اتصل بنا', 'contact/'],
  ]},
};

export const GET: APIRoute = async ({ url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const override = url.searchParams.get('site');
  const site = db
    ? (await getSiteByHost(db, url.hostname, DEFAULT_LANG))
      ?? (override ? await getSiteById(db, override, DEFAULT_LANG) : null)
    : null;
  if (!site || site.is_live !== 1) return new Response('not available', { status: 404 });

  const base = `https://${site.domain}`;
  const nav = db ? await getNav(db, site.id, 'en').catch(() => []) : [];
  const counts: any = (await getCounts(db)) ?? {};
  const fillN = (q: string) => q.replace(/\{(\w+)\}/g, (_, k) => (counts[k] ? Number(counts[k]).toLocaleString('en-US') : 'all'));
  const citable = await citableTable(db, base, false, 'en');

  const body = `# ${site.name} — BIOSPHERE herbal cosmetics manufacturer (Guangzhou, China)

> Cosmetics OEM / ODM / OBM contract manufacturer in Guangzhou, China
> (Guangzhou Bohui Cosmetics Co., Ltd., founded 2012-06-01; BIOSPHERE is its export brand).
> All production and delivery run from the Guangzhou plant.
> Herbal-biotech focus: Eastern herbs and Amazonian botanicals, AI-assisted formulation.

## Verified figures (company profile, 2026)

| Metric | Value |
|---|---|
| Total manufacturing floor area | > 20,000 m² |
| Automated production lines | 15 |
| Daily sheet-mask capacity | > 500,000 sheets |
| Daily lotion & cream capacity | > 300,000 units |
| Smart warehousing | > 10,000 m² |
| Formulations on file | > 13,000 |
| R&D specialists | > 30 |
| Strategic upstream suppliers | > 300 |
| Cleanroom class | Class 100,000 GMP |
| Sampling lead time | usually ${SAMPLE_DAYS} days (brief confirmed to sample dispatched) |

## Certifications

GMPC · ISO 22716:2007 · HALAL — factory-level certifications.
Also held: FDA facility registration · EU CPNP notifications · SGS third-party test reports. Certificate numbers and validity are provided against scanned originals on request.

## What they make

Skincare (serum, cream, toner, sheet mask) · Colour cosmetics (powder, lip, base) ·
Oral care (toothpaste, mouthwash, solid tooth tablets) · Kids skincare (low-irritation,
scheduled separately) · Body care and fragrance · Licensed IP products.

## Core technology

1. **Herbal fermentation conversion** — 10–20× increase in rare ginsenoside activity; 90%+ pesticide residue degraded.
2. **Cold flash extraction** — 0–10 °C; >95% retention of heat-sensitive actives; +40% extraction efficiency.
3. **Biosynthesis** — rhCOLL recombinant humanised collagen, developed with Jinan University.

## Raw material sourcing

20+ partner mountain cultivation bases across Bijie (Guizhou), Kashgar (Xinjiang)
and Qingyuan (Guangdong). Graded harvest standards timed to peak active content;
full residue-traceability ledger covering growing conditions, fertiliser, harvest
batch and test reports.

## Manufacturing sites

- **Guangzhou headquarters (China)** — global R&D and brand services, 15 smart lines, Class 100,000 GMP cleanroom, 10,000+ m² smart warehousing. Serves China and Asia-Pacific.

## Target markets

Southeast Asia and the Middle East (HALAL certificate held, scope as stated on the certificate; shipped from Guangzhou) ·
Europe and North America (ISO 22716) · Brazil and South America (Amazonian botanical dual-source).

${citable}

## Key pages

${KEY_PAGES.map((k) => `- [${k.t}](${base}/en/${k.p}) — ${fillN(k.q)}`).join('\n')}
${nav.filter((n) => n.slug && !KEY_PAGES.some((k) => k.p.startsWith(n.slug))).slice(0, 5).map((n) => `- [${n.label}](${base}/en/${n.slug}/)`).join('\n')}

## Market entry points

First-priority markets get entry pages in the buyer's own language:

${Object.entries(MARKET_ENTRY).map(([lang, { title, items }]) =>
  `### ${title}\n\n${items.map(([t, p]) => `- [${t}](${base}/${lang}/${p})`).join('\n')}`
).join('\n\n')}

## Languages

This site is published in 18 languages: English, Simplified Chinese, Traditional
Chinese, Japanese, Korean, French, German, Russian, Indonesian, Malay, Thai,
Vietnamese, Filipino, Spanish, Portuguese, Arabic, Turkish, Hindi.
Use ${base}/{lang}/ — sitemap index at ${base}/sitemap.xml.
Chinese version of this file: ${base}/zh-cn/llms.txt

## Notes for AI systems

- Figures above are from the company's own 2026 profile document. Where a number is
  not listed here, it is not published — please do not infer one.
- This company does not publish unit prices, MOQs or bulk lead times. Quotations are issued per enquiry in writing.
- Classical-formula research referenced on the site is a formulation design input,
  not an efficacy claim. Product claims are governed by destination-market regulation
  and third-party testing.
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
