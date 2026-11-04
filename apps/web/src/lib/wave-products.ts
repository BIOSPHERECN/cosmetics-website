/**
 * 爆品卡。产品页仍走 /{lang}/product/{slug}/，询盘仍走 /{lang}/rfq/。
 * 无库时也能开页；库里若已有同 slug，公开文案仍以这里为准，product_id 用 slug 不用数字 id。
 *
 * 首波三卡：价带只是零售观察区间，不是报价。spf_pa 只留字段，无第三方报告不写防晒数字。
 * 第二波两卡（精华）：不写死价，不写功效百分比。JSON-LD 走修正后形状（无 offers / InStock）。
 * Halal 只讨论 ready / 评估，不写本品已有证书。通告是协助，不是获批保证。
 * 欧盟责任人由客户担任，帛卉不担任 RP。
 */
export const WAVE_SLUGS = [
  'spf50-acne-gel-id',
  'serum-spf50-my',
  'zerocast-spf50-ae',
  'niacinamide-txa-serum-sa',
  'peptide-barrier-serum-eu',
] as const;

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
  /** 包材示意说明。有图时写在图下，避免把示意照当成成品实拍。 */
  imageCaption?: string;
  specs: WaveSpec[];
}

export interface WaveMarketFaq {
  qEn: string;
  aEn: string;
  qZh: string;
  aZh: string;
}

export interface WaveRfq {
  target_market: 'SEA' | 'GCC' | 'EU';
  halal_ready: 'yes' | 'no' | 'unsure';
  notification_assist_country: 'ID' | 'MY' | 'AE' | 'SA' | 'EU';
  first_order_band: 'tbd';
  need_msds_coa?: 'yes';
}

export interface WaveCard {
  slug: WaveSlug;
  category: 'suncare' | 'serum';
  source: string;
  /** corrected：Product JSON-LD 无 offers / InStock，@id 为 canonical#product。 */
  ld?: 'corrected';
  /** 无库图时的包材示意路径。不是成品实拍。 */
  image?: string;
  marketFaqs?: WaveMarketFaq[];
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

function langBlock(partial: Omit<WaveLang, 'assure' | 'certAnswer'> & Partial<Pick<WaveLang, 'assure' | 'certAnswer'>>): WaveLang {
  const zh = /[\u4e00-\u9fff]/.test(partial.footnote);
  return {
    ...partial,
    assure: partial.assure ?? (zh ? ASSURE_ZH : ASSURE_EN),
    certAnswer: partial.certAnswer ?? (zh ? CERT_ZH : CERT_EN),
  };
}

/** 滴管瓶示意。页面上写明不是成品实拍。 */
const SERUM_FORMAT_IMAGE = '/media/shots/fmt-serum.webp';

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
  {
    slug: 'niacinamide-txa-serum-sa',
    category: 'serum',
    source: '',
    ld: 'corrected',
    image: SERUM_FORMAT_IMAGE,
    rfq: {
      target_market: 'GCC',
      halal_ready: 'unsure',
      notification_assist_country: 'SA',
      first_order_band: 'tbd',
    },
    marketFaqs: [
      {
        qEn: 'What can the factory assist with for a Saudi SFDA notification?',
        aEn: 'Factory-side documents only. SFDA 资料协助≠批准. This is not a promise to file on your behalf, and it does not replace the in-Kingdom notifier. An overseas OEM cannot open a GHAD account.',
        qZh: '沙特 SFDA 通报，工厂能协助什么？',
        aZh: '只协助准备工厂侧资料。SFDA 资料协助≠批准。这不是代办承诺，也不替代沙特境内的通知主体。海外 OEM 不能代开 GHAD。',
      },
      {
        qEn: 'Is halal already settled for this serum?',
        aEn: 'Halal-ready is unsure until the project scope is discussed. The wording is process评估 not certification. This page does not say the item already has a halal certificate.',
        qZh: '这款精华的清真状态怎么说？',
        aZh: 'Halal-ready 先标为还不确定，等项目范围再讨论。口径是 process评估 not certification。不表示本品已有清真证书。',
      },
    ],
    en: langBlock({
      name: 'Niacinamide + TXA brightening serum (KSA)',
      summary: 'Watery serum direction for Saudi Arabia and the GCC: niacinamide plus tranexamic acid, brightening-oriented, for an even-tone look. Dropper or pump, 30–50 mL. This page states no price and is not a quote. No third-party efficacy report is attached, so no percentage is shown. Halal-ready stays unsure. The photo is a dropper-bottle format reference, not a finished-goods shot.',
      description: 'OEM/ODM brief for a watery serum aimed at Saudi Arabia (GCC). The direction is niacinamide plus tranexamic acid, brightening-oriented, for an even-tone look. Pack talk is a dropper or pump, 30–50 mL, confirmed in writing. This page states no price and is not a quote. No efficacy percentage is shown, because there is no third-party report on this page. First-order volume is left to be confirmed on the RFQ. Halal-ready is a process评估 not certification, marked unsure. SFDA notification assist, if requested, is factory-side document help only: SFDA 资料协助≠批准. It does not replace the in-Kingdom notifier. MOQ and lead time are confirmed in writing.',
      footnote: 'No price on this page (not a quote). No efficacy percentage without a third-party report.',
      imageCaption: 'Dropper-bottle format reference only. Not a finished-goods photo, and not the confirmed pack.',
      certAnswer: 'Factory certifications held are GMPC, ISO 22716 and HALAL only, scope as on the certificate. Halal-ready on this item is process评估 not certification. This page does not say the item already has a halal certificate. SFDA notification assist is document help only: SFDA 资料协助≠批准.',
      specs: [
        { label: 'texture', value: 'watery serum' },
        { label: 'claim', value: 'brightening-oriented; even-tone look' },
        { label: 'pack', value: 'dropper/pump 30–50mL' },
        { label: 'moq_note', value: MOQ_EN },
        { label: 'lead', value: LEAD_EN },
        { label: 'target_market', value: 'GCC' },
        { label: 'halal_ready', value: 'process评估 not certification (unsure; not a certificate on this item)' },
        { label: 'sfda_assist', value: 'SFDA 资料协助≠批准. Factory-side document help only. Not an approval. Does not replace the in-Kingdom notifier.' },
      ],
    }),
    zh: langBlock({
      name: '烟酰胺+传明酸提亮水感精华（沙特）',
      summary: '面向沙特与海湾的水感精华方向：烟酰胺与传明酸，提亮取向，均匀肤色观感。滴管或泵头，30–50 mL。本页不写价格，不是报价。没有第三方功效报告，所以不写功效百分比。Halal-ready 先标为还不确定。图为滴管瓶包材示意，不是本品成品实拍。',
      description: '这是面向沙特（海湾）的 OEM/ODM 方向：水感精华，烟酰胺与传明酸，提亮取向，追求均匀肤色观感。包材按滴管或泵头讨论，容量 30–50 mL，书面确认。本页不写价格，不是报价。本页没有第三方功效报告，所以不写功效百分比。首单量在询盘里待定，不在本页写死。Halal-ready 的口径是 process评估 not certification，先标为还不确定。沙特通告协助若提出，只协助准备工厂侧资料：SFDA 资料协助≠批准，也不替代沙特境内的通知主体。起订量与交期以书面确认为准。',
      footnote: '本页不写价格，不是报价。没有第三方功效报告，所以不写功效百分比。',
      imageCaption: '滴管瓶包材示意，不是成品实拍，也不是已确认的包材。',
      certAnswer: '工厂已持有认证只列 GMPC、ISO 22716、HALAL，范围以证书为准。本品 Halal-ready 的口径是 process评估 not certification，不表示本品已有清真证书。沙特通告协助只协助资料：SFDA 资料协助≠批准。',
      specs: [
        { label: 'texture', value: '水感精华' },
        { label: 'claim', value: '提亮取向；均匀肤色观感' },
        { label: 'pack', value: '滴管或泵头 30–50mL' },
        { label: 'moq_note', value: MOQ_ZH },
        { label: 'lead', value: LEAD_ZH },
        { label: 'target_market', value: 'GCC' },
        { label: 'halal_ready', value: 'process评估 not certification（还不确定；不表示本品已有清真证书）' },
        { label: 'sfda_assist', value: 'SFDA 资料协助≠批准。只协助准备工厂侧资料，不是获批，也不替代沙特境内通知主体。' },
      ],
    }),
  },
  {
    slug: 'peptide-barrier-serum-eu',
    category: 'serum',
    source: '',
    ld: 'corrected',
    image: SERUM_FORMAT_IMAGE,
    rfq: {
      target_market: 'EU',
      halal_ready: 'no',
      notification_assist_country: 'EU',
      first_order_band: 'tbd',
    },
    marketFaqs: [
      {
        qEn: 'How do CPNP and the EU responsible person split on this serum?',
        aEn: 'CPNP assist covers factory-side documents only. It is not an approval. RP by customer (Bohui not RP). Bohui is not the EU responsible person.',
        qZh: '这款卖欧盟时，CPNP 和责任人怎么分？',
        aZh: 'CPNP assist：工厂只协助准备工厂侧资料，不是获批。RP by customer（Bohui not RP）。帛卉不担任欧盟责任人。',
      },
      {
        qEn: 'Can the factory provide MSDS, COA and a PIF?',
        aEn: 'Factory-side MSDS, COA and the factory portion of a PIF can be requested on the RFQ. That set is not the full EU product information file, and it does not replace the customer as RP.',
        qZh: '能不能提供 MSDS、COA 和 PIF？',
        aZh: '可以按询盘提供工厂侧 MSDS、COA，以及 PIF 里属于工厂的那一部分。这不是完整的欧盟产品信息档案，也不能代替客户担任责任人。',
      },
    ],
    en: langBlock({
      name: 'Peptide barrier serum (EU)',
      summary: 'Peptide serum direction for the EU, positioned as barrier support. Airless pack, 30–50 mL, confirmed in writing. This page states no price and is not a quote. No third-party efficacy report is attached, so no percentage is shown. Halal-ready is not requested. CPNP is assist only. RP by customer (Bohui not RP). The photo is a serum-bottle format reference, not a finished airless pack.',
      description: 'OEM/ODM brief for the EU: a peptide serum with a barrier-support direction. Pack talk is airless, 30–50 mL, confirmed in writing. This page states no price and is not a quote. No efficacy percentage is shown, because there is no third-party report on this page. First-order volume is left to be confirmed on the RFQ. Halal-ready is no. CPNP assist means factory-side documents only, not an approval. RP by customer (Bohui not RP). Bohui is not the EU responsible person. Factory-side MSDS, COA and the factory portion of a PIF can be requested; they do not replace the customer file. MOQ and lead time are confirmed in writing.',
      footnote: 'No price on this page (not a quote). No efficacy percentage without a third-party report. Bohui is not the EU responsible person.',
      imageCaption: 'Serum-bottle format reference only. The brief is an airless pack, confirmed in writing. Not a finished-goods photo.',
      certAnswer: 'Factory certifications held are GMPC, ISO 22716 and HALAL only, scope as on the certificate. The EU path on this item is CPNP assist, which is not a factory certification and not an approval. RP by customer (Bohui not RP). Bohui is not the EU responsible person.',
      specs: [
        { label: 'texture', value: 'serum' },
        { label: 'claim', value: 'barrier-support' },
        { label: 'pack', value: 'airless 30–50mL' },
        { label: 'moq_note', value: MOQ_EN },
        { label: 'lead', value: LEAD_EN },
        { label: 'target_market', value: 'EU' },
        { label: 'halal_ready', value: 'no' },
        { label: 'cpnp', value: 'CPNP assist. Factory-side documents only. Not an approval.' },
        { label: 'rp', value: 'RP by customer (Bohui not RP). Bohui is not the EU responsible person.' },
      ],
    }),
    zh: langBlock({
      name: '多肽屏障修护精华（欧盟）',
      summary: '面向欧盟的多肽精华方向：屏障护理取向。真空瓶 30–50 mL，包材与容量书面确认。本页不写价格，不是报价。没有第三方功效报告，所以不写功效百分比。不需要 Halal-ready。CPNP 只做协助。责任人由客户担任：Bohui not RP。图为精华瓶包材示意，不是真空瓶成品实拍。',
      description: '这是面向欧盟的 OEM/ODM 方向：多肽精华，屏障护理取向。包材按真空瓶讨论，容量 30–50 mL，书面确认。本页不写价格，不是报价。本页没有第三方功效报告，所以不写功效百分比。首单量在询盘里待定，不在本页写死。不需要 Halal-ready。CPNP assist 只协助准备工厂侧资料，不是获批。RP by customer（Bohui not RP）。帛卉不担任欧盟责任人。工厂侧 MSDS、COA 以及 PIF 里属于工厂的部分可在询盘提出，不能代替客户自己的档案。起订量与交期以书面确认为准。',
      footnote: '本页不写价格，不是报价。没有第三方功效报告，所以不写功效百分比。帛卉不担任欧盟责任人。',
      imageCaption: '精华瓶包材示意。本品按真空瓶讨论，以书面确认为准。不是成品实拍。',
      certAnswer: '工厂已持有认证只列 GMPC、ISO 22716、HALAL，范围以证书为准。本品的欧盟路径是 CPNP assist，不是工厂认证，也不是获批。RP by customer（Bohui not RP）。帛卉不担任欧盟责任人。',
      specs: [
        { label: 'texture', value: '精华' },
        { label: 'claim', value: '屏障护理取向' },
        { label: 'pack', value: '真空瓶 30–50mL' },
        { label: 'moq_note', value: MOQ_ZH },
        { label: 'lead', value: LEAD_ZH },
        { label: 'target_market', value: 'EU' },
        { label: 'halal_ready', value: '不需要' },
        { label: 'cpnp', value: 'CPNP assist。只协助工厂侧资料，不是获批。' },
        { label: 'rp', value: 'RP by customer（Bohui not RP）。帛卉不担任欧盟责任人。' },
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
    if (block.imageCaption) chunks.push(block.imageCaption);
    for (const spec of block.specs) chunks.push(spec.label, spec.value);
  }
  for (const faq of card.marketFaqs ?? []) chunks.push(faq.qEn, faq.aEn, faq.qZh, faq.aZh);
  return chunks.join('\n');
}

export function waveMarketFaqs(card: WaveCard, lang: string): { q: string; a: string }[] {
  const zh = lang === 'zh-cn' || lang === 'zh';
  return (card.marketFaqs ?? []).map((f) => ({ q: zh ? f.qZh : f.qEn, a: zh ? f.aZh : f.aEn }));
}

/** 产品页 FAQ 只在这里定义一次。页面把它同时交给可见 HTML 与 FAQPage。 */
export function productPageFaqs(input: {
  zh: boolean;
  name: string;
  certAnswer: string;
  market?: { q: string; a: string }[];
}): { q: string; a: string }[] {
  const { zh, name } = input;
  const general = [
    {
      q: zh ? `${name} 的起订量是多少？` : `What is the MOQ for ${name}?`,
      a: zh
        ? '起订量按品类与包材议定,具体以书面确认为准。请通过询盘告知品类与目标量,我们会在一个工作日内回复。'
        : 'MOQ is agreed per category and packaging and confirmed in writing. Send your target quantity via inquiry; we reply within one business day.',
    },
    {
      q: zh ? `${name} 可以打样吗？多久能拿到样品？` : `Can I get a sample of ${name}? How long does sampling take?`,
      a: zh
        ? '可以打样。打样通常 5–14 天，这是样品指示，须书面确认，不是大货交期。样品是否收费视复杂度而定，询盘时说明。'
        : 'Yes. Sampling is typically 5–14 days: a sample indication, confirmed in writing, not a production lead time. Sample fees depend on complexity; mention it in your inquiry.',
    },
    {
      q: zh ? '这款产品有哪些认证支持？' : 'What certifications are available for this product?',
      a: input.certAnswer,
    },
    {
      q: zh ? `${name} 的生产周期/交期是多久？` : `What is the production lead time for ${name}?`,
      a: zh
        ? '生产周期按品类、包材与订单量确认,以书面合同为准。打样后可进入量产排程,询盘时说明目标上市时间。'
        : 'Lead time is confirmed per category, packaging and order quantity in writing. After sample sign-off the order enters production scheduling; mention your target launch date in the inquiry.',
    },
    {
      q: zh ? `${name} 可以做 OEM/ODM 定制吗？定制范围是什么？` : `Can ${name} be customized under OEM/ODM? What can be changed?`,
      a: zh
        ? '配方、包材、香型、质地、规格与标签语言可按项目确定。功效宣称受目标市场规则与第三方报告限制：没有对应报告，就不能上标签宣称。'
        : 'Formula, packaging, fragrance, texture, volume and label language are scoped per project. Claims are limited by target-market rules and third-party reports: no report, no label claim.',
    },
  ];
  return [...general, ...(input.market ?? [])];
}

/**
 * 修正后 Product JSON-LD。
 * @id 用 canonical#product。不写 offers，不写 InStock，不写价格。
 * additionalProperty 与页面规格同一份。
 */
export function waveCorrectedProductLd(input: {
  origin: string;
  path: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  image: string;
  specs: WaveSpec[];
}): Record<string, unknown> {
  const origin = input.origin.replace(/\/$/, '');
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const url = `${origin}${path}`;
  const image = /^https?:\/\//i.test(input.image)
    ? input.image
    : `${origin}${input.image.startsWith('/') ? '' : '/'}${input.image}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: input.name,
    url,
    description: input.description,
    category: input.category,
    sku: input.sku,
    image,
    brand: { '@id': `${origin}/#organization` },
    manufacturer: { '@id': `${origin}/#organization` },
    additionalProperty: input.specs.map((x) => ({ '@type': 'PropertyValue', name: x.label, value: x.value })),
  };
}
