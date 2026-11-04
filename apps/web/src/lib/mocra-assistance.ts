/**
 * MoCRA 协助落地页（MM-SITE-03）。
 * 只写资料协助，不承诺过审、不代拿证、不把注册写成批准。
 * 美国不在通告协助国枚举里：?notification_assist_country=US 会被 canon 整段丢掉。
 * 现网能留下的预填是国家/城市字段 ?market=US。本模块不改五键。
 */

export const MOCRA_SLUG = 'services/mocra-assistance/';
/** sitemap 只收这两条已写正文的语种。其它语种运行时回落英文，仍 200。 */
export const MOCRA_SITEMAP_LANGS = ['en', 'zh-cn'] as const;
/** 只在这两条美国品类页上加「详见」链，不改其余品类的协助句。 */
export const MOCRA_DETAIL_CATS = ['skincare', 'sun-care'] as const;

export const MOCRA_BOUNDARY_EN =
  'We can assist with U.S. facility registration and cosmetic product listing paperwork under MoCRA; we do not guarantee FDA outcomes or "approved" status.';

export const MOCRA_DETAIL_LINK = {
  en: 'See MoCRA assistance',
  zh: '详见 MoCRA assistance',
} as const;

const BANNED = /FDA[\s-]+approved|FDA[\s-]+certified|FDA[\s-]+registered\s+product|欧盟批准|Halal\s+certified|EU[\s-]+approved|普草|过敏原/i;

export interface MocraCopy {
  title: string;
  description: string;
  h1: string;
  serviceName: string;
  homeLabel: string;
  servicesLabel: string;
  crumb: string;
  lead: readonly string[];
  leadText: string;
  boundary: string;
  boundaryEn: string;
  note: string;
  doTitle: string;
  doItems: readonly string[];
  dontTitle: string;
  dontItems: readonly string[];
  primaryCta: string;
  secondaryCta: string;
  ctaNote: string;
  relatedTitle: string;
  links: readonly { tail: string; label: string }[];
  faqTitle: string;
  faq: readonly (readonly [string, string])[];
}

const EN_LEAD = [
  'We provide assistance with U.S. facility registration and cosmetic product listing under MoCRA.',
  'The work is for cosmetic OEM and private-label projects.',
  'We do not guarantee FDA outcomes.',
] as const;

const ZH_LEAD = [
  '我们协助准备美国 MoCRA 项下的设施注册与化妆品产品列名。',
  '对象是化妆品 OEM 与贴牌项目。',
  '我们不保证 FDA 结果。',
] as const;

const ZH_BOUNDARY =
  '我们可以协助准备美国 MoCRA 项下的设施注册与化妆品产品列名资料；不保证 FDA 结果，也不表示处于 “approved” 状态。';

const EN: MocraCopy = {
  title: 'MoCRA assistance for U.S. cosmetic OEM and private label',
  description: 'MoCRA assistance with U.S. facility registration and cosmetic product listing paperwork for OEM and private label. We do not guarantee FDA outcomes.',
  h1: 'MoCRA assistance for U.S. cosmetic OEM / private label',
  serviceName: 'MoCRA assistance for U.S. cosmetic OEM / private label',
  homeLabel: 'Home',
  servicesLabel: 'Services',
  crumb: 'MoCRA assistance',
  lead: EN_LEAD,
  leadText: EN_LEAD.join(' '),
  boundary: MOCRA_BOUNDARY_EN,
  boundaryEn: MOCRA_BOUNDARY_EN,
  note: 'Factory-side paperwork assistance. The official text prevails. This page is not legal advice.',
  doTitle: 'What we do',
  doItems: [
    'Document checklist for facility registration and product listing',
    'Form-filling assistance',
    'Alignment with the responsible-person rules',
  ],
  dontTitle: 'What we do not do',
  dontItems: [
    'Guarantee clearance',
    'Impersonate an FDA endorsement',
    'Promise the review will pass',
  ],
  primaryCta: 'Start an RFQ',
  secondaryCta: 'U.S. skincare OEM',
  ctaNote: 'The inquiry opens with the country or city field set to US. For target market and filing assist, choose Other and write United States. Those lists have no US code.',
  relatedTitle: 'Related pages',
  links: [
    { tail: 'services/factory-quality/', label: 'Factory quality' },
    { tail: 'services/product-development/', label: 'Product development' },
    { tail: 'oem/us/skincare/', label: 'U.S. skincare OEM' },
    { tail: 'oem/us/sun-care/', label: 'U.S. sun care OEM' },
  ],
  faqTitle: 'FAQ',
  faq: [
    ['What is MoCRA?', 'MoCRA is the U.S. Modernization of Cosmetics Regulation Act. For cosmetic OEM and private label, buyers usually ask about facility registration and cosmetic product listing, plus safety records the brand keeps. This page is assistance with that paperwork. It is not a legal opinion.'],
    ['What is the difference between facility registration and product listing?', 'Facility registration names the manufacturing site. Product listing names each cosmetic and its category. They are two different filings. Finishing either one is not a product clearance, and it is not an endorsement.'],
    ['Who is the U.S. responsible person?', 'The U.S. responsible person is the party named to receive and record adverse-event reports. We can line the factory-side document list up with that role. We do not act as your responsible person, and we do not file in your name.'],
    ['What does this assistance include?', `${MOCRA_BOUNDARY_EN} In practice that means a document checklist, help filling the forms, and alignment with the responsible-person rules. It does not mean guaranteed clearance, an FDA endorsement, or a promise that review will pass.`],
    ['How is this different from calling a product "approved"?', 'Facility registration and product listing are records. They do not mean a cosmetic is cleared, and they do not create an "approved" status. We do not describe this assistance with endorsement language.'],
    ['How do I fill the RFQ for this assistance?', 'Open the inquiry on this page. The country or city field is already US. Under target market, choose Other and write United States. Under filing assist, choose Other and write United States, because that list has no US code. Say you want facility registration and product listing paperwork assistance. The form does not promise an outcome.'],
  ],
};

const ZH: MocraCopy = {
  title: 'MoCRA 协助：美国化妆品 OEM 设施注册与产品列名资料',
  description: 'MoCRA 协助：为美国化妆品 OEM 与贴牌准备设施注册和产品列名资料。不保证 FDA 结果。',
  h1: 'MoCRA / 美国上市资料协助',
  serviceName: 'MoCRA / 美国上市资料协助',
  homeLabel: '首页',
  servicesLabel: '服务',
  crumb: 'MoCRA 协助',
  lead: ZH_LEAD,
  leadText: ZH_LEAD.join(''),
  boundary: ZH_BOUNDARY,
  boundaryEn: MOCRA_BOUNDARY_EN,
  note: '工厂侧资料协助。条文以官方为准。本页不是法律意见。',
  doTitle: '做什么',
  doItems: [
    '设施注册与产品列名的资料清单',
    '表格填写协助',
    '与负责人规则对齐',
  ],
  dontTitle: '不做什么',
  dontItems: [
    '保证 clearance',
    '冒充 FDA 背书',
    '包过审',
  ],
  primaryCta: '发起询盘',
  secondaryCta: '美国护肤代工',
  ctaNote: '询盘页的国家或城市会预填 US。目标市场和备案协助请选「其他」，并写明美国。这两处选项里没有 US 代码。',
  relatedTitle: '相关页面',
  links: [
    { tail: 'services/factory-quality/', label: '工厂质量' },
    { tail: 'services/product-development/', label: '产品开发' },
    { tail: 'oem/us/skincare/', label: '美国护肤代工' },
    { tail: 'oem/us/sun-care/', label: '美国防晒代工' },
  ],
  faqTitle: '常见问题',
  faq: [
    ['MoCRA 是什么？', 'MoCRA 是美国化妆品监管现代化法案。对化妆品 OEM 与贴牌，买家通常问的是设施注册、化妆品产品列名，以及品牌自己留存的安全资料。本页是这些资料的协助，不是法律意见。'],
    ['设施注册和产品列名有什么区别？', '设施注册登记的是生产场所。产品列名登记的是每一件化妆品及其类别。这是两件不同的资料。做完其中一件不等于产品获准，也不是背书。'],
    ['美国负责人（responsible person）是谁？', '美国负责人是被指定接收并记录不良反应报告的一方。我们可以把工厂侧资料清单与这个角色对齐。我们不担任你的负责人，也不以你的名义递交。'],
    ['协助的边界是什么？', `${ZH_BOUNDARY} 具体是资料清单、表格填写协助，以及与负责人规则对齐。不包括保证 clearance、冒充 FDA 背书，或承诺包过审。`],
    ['这和把产品说成 “approved” 有什么不同？', '设施注册和产品列名是记录。它们不表示化妆品已获准，也不会变成 “approved” 状态。我们不用背书式说法描述这项协助。'],
    ['询盘表怎么填？', '从本页打开询盘。国家或城市一栏已是 US。目标市场请选「其他」并写明美国。备案协助也请选「其他」并写明美国，因为选项里没有 US 代码。写明你需要设施注册与产品列名的资料协助。表单不承诺结果。'],
  ],
};

export function mocraCopy(lang: string): MocraCopy {
  return lang.startsWith('zh') ? ZH : EN;
}

export function mocraPagePath(lang: string): string {
  return `/${lang}/${MOCRA_SLUG}`;
}

export function mocraRfqPath(lang: string): string {
  return `/${lang}/rfq/?market=US`;
}

export function mocraUsCategoryPath(lang: string, category = 'skincare'): string {
  return `/${lang}/oem/us/${category}/`;
}

export function mocraStructuredData(input: {
  lang: string;
  origin: string;
  path: string;
  siteName: string;
}): Record<string, unknown>[] {
  const copy = mocraCopy(input.lang);
  const origin = input.origin.replace(/\/$/, '');
  const home = `${origin}/${input.lang}/`;
  const services = `${origin}/${input.lang}/services/`;
  const page = `${origin}${input.path}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: copy.homeLabel, item: home },
        { '@type': 'ListItem', position: 2, name: copy.servicesLabel, item: services },
        { '@type': 'ListItem', position: 3, name: copy.crumb, item: page },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: copy.faq.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: copy.serviceName,
      serviceType: input.lang.startsWith('zh') ? '美国化妆品上市资料协助' : 'MoCRA paperwork assistance',
      description: copy.description,
      areaServed: 'US',
      provider: { '@type': 'Organization', name: input.siteName },
      url: page,
    },
  ];
}

/** 文案自检：禁词、导语句数、FAQ 条数。页面与测例共用。 */
export function mocraCopyProblems(copy: MocraCopy): string[] {
  const problems: string[] = [];
  const blob = JSON.stringify(copy);
  if (BANNED.test(blob)) problems.push('banned phrase');
  if (copy.lead.length < 1 || copy.lead.length > 3) problems.push('lead length');
  if (copy.faq.length < 4 || copy.faq.length > 6) problems.push('faq length');
  if (!/MoCRA/.test(copy.description)) problems.push('description MoCRA');
  if (!/assistance|协助/.test(copy.description)) problems.push('description assistance');
  if (/approved/i.test(copy.title) || /approved/i.test(copy.h1) || /approved/i.test(copy.description) || /approved/i.test(copy.serviceName)) {
    problems.push('approved in title fields');
  }
  if (!/assistance|协助/.test(copy.serviceName)) problems.push('service name assistance');
  if (/"offers"/.test(blob) || blob.includes('"@type":"Product"')) problems.push('product offers');
  return problems;
}
