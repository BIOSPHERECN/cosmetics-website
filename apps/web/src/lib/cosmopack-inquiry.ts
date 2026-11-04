/**
 * Cosmopack Asia 2026 同期可询文案与深链。
 *
 * 只说明展会日期内可以提交 OEM / 私牌 / 供应链询盘。
 * 日期与外链是主办方日程，不是我方展商身份。
 * 不写价格、不写起订数字、不写未核实的清真结论。
 * 其它语种没有独立译文时跟 OEM 索引页一样回落英文。
 */

export const COSMOPACK_FAIR_INFO = 'https://www.cosmoprof-asia.com/fair-info/';
export const COSMOPACK_VENUE = 'https://www.asiaworld-expo.com/en-us/whats-on/upcoming-events/events/cosmopack-asia-2026-oem-odm-ingredients/';
export const COSMOPACK_INTENT = 'cosmopack-asia-2026';

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

export interface CosmopackCopy {
  kicker: string;
  title: string;
  lede: string;
  catsLabel: string;
  cats: string[];
  docsTitle: string;
  docs: string[];
  heldBefore: string;
  heldLink: string;
  heldAfter: string;
  quoteNote: string;
  scheduleNote: string;
  fairInfoLabel: string;
  venueLabel: string;
  cta: string;
}

const ZH: CosmopackCopy = {
  kicker: '11/10–12 · 2026 · 香港 AsiaWorld-Expo',
  title: 'Cosmopack Asia 同期 · 私牌/OEM 可询',
  lede: '11/10–12（2026，香港 AsiaWorld-Expo）同期，私牌、OEM/ODM 与供应链询盘照常开放。日期与场地只作展会日程参考，并链到主办方页面，不是我方展商身份。',
  catsLabel: '可询品类',
  cats: ['OEM/ODM', 'Private Label（私牌）', '供应链可询'],
  docsTitle: '询盘建议带上',
  docs: [
    '产品 brief（品类与参考方向）',
    '目标市场',
    '剂型',
    '是否需要 COA、MSDS，以及 ISO 22716 相关交付说明',
  ],
  heldBefore: '工厂已持有的 ',
  heldLink: 'ISO 22716',
  heldAfter: ' 相关交付说明见认证页。COA 与 MSDS 是可在询盘中提出的文件类型，是否提供按项目书面确认。',
  quoteNote: '本页不标价格。起订量与交期按项目书面确认。',
  scheduleNote: '展会日程（主办方页面，不是我方展商名录）：',
  fairInfoLabel: 'Cosmoprof Asia Fair Info',
  venueLabel: 'AsiaWorld-Expo 活动页',
  cta: '提交同期询盘',
};

const EN: CosmopackCopy = {
  kicker: '11/10–12 · 2026 · AsiaWorld-Expo, Hong Kong',
  title: 'Concurrent inquiry during Cosmopack Asia · private label / OEM',
  lede: 'During 11/10–12 (2026, AsiaWorld-Expo, Hong Kong), private-label, OEM/ODM and supply-chain inquiries stay open. Dates and venue are a fair-schedule reference and link to the organizer. They do not identify us as an exhibitor.',
  catsLabel: 'Open for inquiry',
  cats: ['OEM/ODM', 'Private label', 'Supply-chain inquiry'],
  docsTitle: 'Useful to include with the inquiry',
  docs: [
    'Product brief (category and reference direction)',
    'Target market',
    'Dosage form',
    'Whether you need COA, MSDS, or ISO 22716 delivery notes',
  ],
  heldBefore: 'Notes on held ',
  heldLink: 'ISO 22716',
  heldAfter: ' are on the certification page. COA and MSDS are document types you can request in the inquiry; whether they are provided is confirmed in writing per project.',
  quoteNote: 'This page does not list a price. MOQ and lead time are confirmed in writing per project.',
  scheduleNote: 'Fair schedule (organizer pages, not our exhibitor listing):',
  fairInfoLabel: 'Cosmoprof Asia Fair Info',
  venueLabel: 'AsiaWorld-Expo event page',
  cta: 'Open an RFQ',
};

export function cosmopackLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

export function cosmopackCopy(lang: string): CosmopackCopy {
  return cosmopackLocale(lang).startsWith('zh') ? ZH : EN;
}

/** 深链预勾 SEA。intent 只留在地址上，不改表单字段。 */
export function cosmopackRfqPath(lang: string): string {
  return `/${cosmopackLocale(lang)}/rfq/?target_market=SEA&intent=${COSMOPACK_INTENT}`;
}

export function cosmopackIsoPath(lang: string): string {
  return `/${cosmopackLocale(lang)}/oem/cert/iso-22716/`;
}

export function cosmopackPlain(copy: CosmopackCopy): string[] {
  return [
    copy.kicker, copy.title, copy.lede, copy.catsLabel, ...copy.cats,
    copy.docsTitle, ...copy.docs, copy.heldBefore, copy.heldLink, copy.heldAfter,
    copy.quoteNote, copy.scheduleNote, copy.fairInfoLabel, copy.venueLabel, copy.cta,
  ];
}
