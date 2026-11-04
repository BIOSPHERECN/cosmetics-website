/**
 * 爆品首波三卡。产品页仍走 /{lang}/product/{slug}/，询盘仍走 /{lang}/rfq/。
 * 无库时也能开页；库里若已有同 slug，公开文案仍以这里为准，product_id 用 slug 不用数字 id。
 *
 * 口径：价带只是零售观察区间，不是报价。spf_pa 只留字段，无第三方报告不写防晒数字。
 * Halal 只讨论 ready，不写本品已有证书。通告是协助，不是获批保证。
 */
export const WAVE_SLUGS = ['spf50-acne-gel-id', 'serum-spf50-my', 'zerocast-spf50-ae'] as const;

export type WaveSlug = (typeof WAVE_SLUGS)[number];

export interface WaveSpec {
  label: string;
  value: string;
}

export interface WaveLang {
  name: string;
  summary: string;
  description: string;
  assure: string;
  certAnswer: string;
  footnote: string;
  specs: WaveSpec[];
}

export interface WaveRfq {
  target_market: 'SEA' | 'GCC';
  halal_ready: 'yes' | 'unsure';
  notification_assist_country: 'ID' | 'MY' | 'AE';
  first_order_band: 'tbd';
  need_msds_coa?: 'yes';
}

export interface WaveCard {
  slug: WaveSlug;
  category: 'suncare';
  source: string;
  rfq: WaveRfq;
  en: WaveLang;
  zh: WaveLang;
}

const SPF_FIELD = 'Pending third-party report';
const MOQ_EN = 'Per category and packaging, confirmed in writing. No fixed quantity on this page.';
const MOQ_ZH = '按品类与包材议定，以书面确认为准。本页不写死数量。';
const LEAD_EN = 'Interval only, after written confirmation. Sampling 5–14 days is a sample indication, not a production lead time.';
const LEAD_ZH = '交期只给区间，并以书面确认为准。打样通常 5–14 天，这是样品指示，不是大货交期。';
const ASSURE_EN = 'Factory certificates listed: GMPC, ISO 22716, HALAL (scope as on the certificate). This item only discusses halal-ready. It does not say this item already has a halal certificate.';
const ASSURE_ZH = '工厂持证只列 GMPC、ISO 22716、HALAL（范围以证书为准）。本品只讨论 Halal-ready，不表示本品已有清真证书。';
const CERT_EN = 'Factory certificates held are GMPC, ISO 22716 and HALAL only, scope as on the certificate. Halal on this item is a project question (ready or not). This page does not say the item already has a halal certificate. Notification assist is not an approval guarantee.';
const CERT_ZH = '工厂已持有认证只列 GMPC、ISO 22716、HALAL，范围以证书为准。本品只把清真当作 Halal-ready 需求来讨论，不表示本品已有清真证书。通告协助不是获批保证。';

function langBlock(partial: Omit<WaveLang, 'assure' | 'certAnswer'> & { footnote: string }): WaveLang {
  return {
    ...partial,
    assure: partial.footnote.startsWith('零售') ? ASSURE_ZH : ASSURE_EN,
    certAnswer: partial.footnote.startsWith('零售') ? CERT_ZH : CERT_EN,
  };
}

export const WAVE_CARDS: WaveCard[] = [
  {
    slug: 'spf50-acne-gel-id',
    category: 'suncare',
    source: 'https://magpieiq.com/insights/top-sunscreen-brands-indonesia-2026/',
    rfq: {
      target_market: 'SEA',
      halal_ready: 'yes',
      notification_assist_country: 'ID',
      first_order_band: 'tbd',
    },
    en: langBlock({
      name: 'Oil-control gel sunscreen (Indonesia)',
      summary: 'Lightweight gel sunscreen direction for Indonesia: oil-control, blemish-care, oily and acne-prone skin. Tube or pump, 30–50 mL. Observed retail band IDR 25k–50k — a range only, not a quote. No SPF or PA number is shown: there is no third-party report on this page.',
      description: 'OEM/ODM brief for a lightweight gel sunscreen aimed at Indonesia. Positioning is oil-control and blemish-care for oily, acne-prone skin. Pack talk is a tube or pump, 30–50 mL. The observed retail band IDR 25k–50k is a market range only, not a factory quote and not an automatic price. The spf_pa field stays empty of numbers until a third-party report exists. Halal-ready can be discussed for the project. Indonesia notification assist, if requested, is factory-side document help, not an approval guarantee. MOQ and lead time are confirmed in writing.',
      footnote: 'Retail-band note (public page, not a quote for this item):',
      specs: [
        { label: 'spf_pa', value: SPF_FIELD },
        { label: 'texture', value: 'gel' },
        { label: 'skin_type', value: 'oily/acne-prone' },
        { label: 'pack', value: 'tube/pump 30–50mL' },
        { label: 'moq_note', value: MOQ_EN },
        { label: 'lead_time_window_note', value: LEAD_EN },
        { label: 'price_band', value: 'IDR 25k–50k (range only, not a quote)' },
      ],
    }),
    zh: langBlock({
      name: '控油凝胶防晒（印尼）',
      summary: '面向印尼的轻薄凝胶防晒方向：控油、油痘肌护理，适合油性与易出痘肌肤。软管或泵头，30–50 mL。零售观察区间 IDR 25k–50k，只是区间，不是报价。本页没有第三方报告，所以不写防晒数字。',
      description: '这是面向印尼的 OEM/ODM 方向：轻薄凝胶防晒，控油，油痘肌护理，适合油性与易出痘肌肤。包材按软管或泵头讨论，容量 30–50 mL。零售观察区间 IDR 25k–50k 只展示区间，不是工厂报价，本页不生成报价。spf_pa 只留字段；本页没有第三方报告，所以不写防晒数字。清真只讨论项目是否需要 Halal-ready。印尼通告协助若提出，只协助准备工厂侧资料，不是代办承诺，也不保证获批。起订量与交期以书面确认为准。',
      footnote: '零售区间观察来源（公开页面，不是本品报价）：',
      specs: [
        { label: 'spf_pa', value: '待第三方报告' },
        { label: 'texture', value: 'gel' },
        { label: 'skin_type', value: 'oily/acne-prone' },
        { label: 'pack', value: '软管或泵头 30–50mL' },
        { label: 'moq_note', value: MOQ_ZH },
        { label: 'lead_time_window_note', value: LEAD_ZH },
        { label: 'price_band', value: 'IDR 25k–50k（仅展示区间，不是报价）' },
      ],
    }),
  },
  {
    slug: 'serum-spf50-my',
    category: 'suncare',
    source: 'https://www.minimeinsights.com/2025/12/09/safi-launches-its-first-serum-sunscreen-safi-perfect-white-3x-advance-watery-light-serum-sunscreen/',
    rfq: {
      target_market: 'SEA',
      halal_ready: 'yes',
      notification_assist_country: 'MY',
      first_order_band: 'tbd',
    },
    en: langBlock({
      name: 'Watery serum sunscreen (Malaysia)',
      summary: 'Watery serum sunscreen for Malaysia: brightening-oriented, and it can sit as a makeup base. Observed retail band MYR 15–40 — a range only, not a quote. No SPF or PA number is shown: there is no third-party report on this page.',
      description: 'OEM/ODM brief for Malaysia: a watery serum sunscreen that can work as a makeup base. The claim field is brightening-oriented. Pack is a serum bottle or tube; fill volume is confirmed in writing. The observed retail band MYR 15–40 is a market range only, not a factory quote and not an automatic price. The spf_pa field stays empty of numbers until a third-party report exists. Halal-ready can be discussed. Malaysia notification assist, if requested, is factory-side document help, not an approval guarantee. MOQ and lead time are confirmed in writing.',
      footnote: 'Retail-band note (public page, not a quote for this item):',
      specs: [
        { label: 'spf_pa', value: SPF_FIELD },
        { label: 'texture', value: 'serum' },
        { label: 'claim', value: 'brightening-oriented' },
        { label: 'pack', value: 'serum bottle or tube' },
        { label: 'moq_note', value: MOQ_EN },
        { label: 'lead_time_window_note', value: LEAD_EN },
        { label: 'price_band', value: 'MYR 15–40 (range only, not a quote)' },
      ],
    }),
    zh: langBlock({
      name: '水感精华防晒（马来西亚）',
      summary: '面向马来西亚的水感精华防晒：提亮取向，可作妆前基底。零售观察区间 MYR 15–40，只是区间，不是报价。本页没有第三方报告，所以不写防晒数字。',
      description: '这是面向马来西亚的 OEM/ODM 方向：水感精华防晒，可作妆前基底。宣称口径是提亮取向。包材按精华瓶或软管讨论，容量书面确认。零售观察区间 MYR 15–40 只展示区间，不是工厂报价，本页不生成报价。spf_pa 只留字段；本页没有第三方报告，所以不写防晒数字。清真只讨论是否需要 Halal-ready。马来西亚通告协助若提出，只协助准备工厂侧资料，不是代办承诺，也不保证获批。起订量与交期以书面确认为准。',
      footnote: '零售区间观察来源（公开页面，不是本品报价）：',
      specs: [
        { label: 'spf_pa', value: '待第三方报告' },
        { label: 'texture', value: 'serum' },
        { label: 'claim', value: 'brightening-oriented（提亮取向）' },
        { label: 'pack', value: '精华瓶或软管' },
        { label: 'moq_note', value: MOQ_ZH },
        { label: 'lead_time_window_note', value: LEAD_ZH },
        { label: 'price_band', value: 'MYR 15–40（仅展示区间，不是报价）' },
      ],
    }),
  },
  {
    slug: 'zerocast-spf50-ae',
    category: 'suncare',
    source: 'https://www.amazon.ae/gp/bestsellers/beauty/12149885031',
    rfq: {
      target_market: 'GCC',
      halal_ready: 'unsure',
      notification_assist_country: 'AE',
      first_order_band: 'tbd',
      need_msds_coa: 'yes',
    },
    en: langBlock({
      name: 'Zero-white-cast fluid sunscreen (UAE)',
      summary: 'Invisible fluid or aqua gel for the UAE: zero-white-cast, lightweight, sensitive-friendly. Observed retail band AED 20–70 — a range only, not a quote. No SPF or PA number is shown: there is no third-party report on this page. Halal-ready is unsure until the project scope is discussed.',
      description: 'OEM/ODM brief for the UAE: an invisible fluid or aqua gel sunscreen, zero-white-cast, lightweight, and sensitive-friendly. Pack format is confirmed in writing. The observed retail band AED 20–70 is a market range only, not a factory quote and not an automatic price. The spf_pa field stays empty of numbers until a third-party report exists. Halal-ready is marked unsure until the project scope is discussed. Arabic label assist and UAE notification assist are document help only, not an approval guarantee. An MSDS/COA file pack can be requested on the RFQ. MOQ and lead time are confirmed in writing.',
      footnote: 'Retail-band note (public bestseller page, not a listing of this item and not a quote):',
      specs: [
        { label: 'spf_pa', value: SPF_FIELD },
        { label: 'texture', value: 'fluid/gel' },
        { label: 'skin_type', value: 'sensitive' },
        { label: 'label_ar_assist', value: 'Arabic label assist (documents only, not an approval)' },
        { label: 'pack', value: 'fluid or aqua-gel bottle' },
        { label: 'moq_note', value: MOQ_EN },
        { label: 'lead_time_window_note', value: LEAD_EN },
        { label: 'price_band', value: 'AED 20–70 (range only, not a quote)' },
      ],
    }),
    zh: langBlock({
      name: '无白痕流体防晒（阿联酋）',
      summary: '面向阿联酋的隐形流体或水感凝胶：无白痕、轻薄、敏感肌友好。零售观察区间 AED 20–70，只是区间，不是报价。本页没有第三方报告，所以不写防晒数字。Halal-ready 先标为还不确定。',
      description: '这是面向阿联酋的 OEM/ODM 方向：隐形流体或水感凝胶防晒，无白痕、轻薄、敏感肌友好。包材形式书面确认。零售观察区间 AED 20–70 只展示区间，不是工厂报价，本页不生成报价。spf_pa 只留字段；本页没有第三方报告，所以不写防晒数字。Halal-ready 先标为还不确定，等项目范围再讨论。阿拉伯语标签协助与阿联酋通告协助都只协助资料，不保证获批。MSDS/COA 文件包可在询盘里提出需要。起订量与交期以书面确认为准。',
      footnote: '零售区间观察来源（公开榜单页，不是本品在售链接，也不是报价）：',
      specs: [
        { label: 'spf_pa', value: '待第三方报告' },
        { label: 'texture', value: 'fluid/gel' },
        { label: 'skin_type', value: 'sensitive' },
        { label: 'label_ar_assist', value: '阿拉伯语标签协助（只协助资料，不保证获批）' },
        { label: 'pack', value: '流体或水感凝胶瓶' },
        { label: 'moq_note', value: MOQ_ZH },
        { label: 'lead_time_window_note', value: LEAD_ZH },
        { label: 'price_band', value: 'AED 20–70（仅展示区间，不是报价）' },
      ],
    }),
  },
];

export function waveSiblings(slug: string, lang: string): { slug: string; name: string }[] {
  const key = slug.trim().toLowerCase();
  return WAVE_CARDS.filter((c) => c.slug !== key).map((c) => ({ slug: c.slug, name: waveCopy(c, lang).name }));
}

export function waveBySlug(slug: string): WaveCard | null {
  const key = slug.trim().toLowerCase();
  return WAVE_CARDS.find((c) => c.slug === key) ?? null;
}

export function waveCopy(card: WaveCard, lang: string): WaveLang {
  return lang === 'zh-cn' || lang === 'zh' ? card.zh : card.en;
}

export interface WaveFormState {
  target_market: string[];
  notification_assist_country: string[];
  halal_ready: string;
  first_order_band: string;
  need_msds_coa: string;
}

/** 深链参数优先；缺了再用这张卡的默认值。短链 ?product_id=slug 也能预填。 */
export function waveFormPrefill(slug: string, query: WaveFormState): WaveFormState {
  const card = waveBySlug(slug);
  if (!card) return query;
  return {
    target_market: query.target_market.length ? query.target_market : [card.rfq.target_market],
    notification_assist_country: query.notification_assist_country.length
      ? query.notification_assist_country
      : [card.rfq.notification_assist_country],
    halal_ready: query.halal_ready || card.rfq.halal_ready,
    first_order_band: query.first_order_band || card.rfq.first_order_band,
    need_msds_coa: query.need_msds_coa || card.rfq.need_msds_coa || '',
  };
}

export function waveRfqPath(lang: string, slug: string, intent = '', about = ''): string {
  const card = waveBySlug(slug);
  if (!card) return `/${lang}/rfq/`;
  const copy = waveCopy(card, lang);
  const qs = new URLSearchParams();
  qs.set('product_id', card.slug);
  qs.set('about', (about || copy.name).slice(0, 160));
  qs.set('category', card.category);
  qs.set('target_market', card.rfq.target_market);
  qs.set('halal_ready', card.rfq.halal_ready);
  qs.set('notification_assist_country', card.rfq.notification_assist_country);
  qs.set('first_order_band', card.rfq.first_order_band);
  if (card.rfq.need_msds_coa) qs.set('need_msds_coa', card.rfq.need_msds_coa);
  const texture = copy.specs.find((s) => s.label === 'texture')?.value ?? '';
  const skin = copy.specs.find((s) => s.label === 'skin_type')?.value ?? '';
  if (texture) qs.set('texture', texture);
  if (skin) qs.set('skin_type', skin);
  if (intent) qs.set('intent', intent);
  return `/${lang}/rfq/?${qs.toString()}`;
}

export function wavePublicText(card: WaveCard): string {
  const chunks: string[] = [];
  for (const block of [card.en, card.zh]) {
    chunks.push(block.name, block.summary, block.description, block.assure, block.certAnswer, block.footnote);
    for (const spec of block.specs) chunks.push(spec.label, spec.value);
  }
  return chunks.join('\n');
}
