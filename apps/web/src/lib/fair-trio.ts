/**
 * 三展同期短卡。只转述主办方已公布档期，并链到询盘。
 * 外链是日程来源，不是我方展商身份，也不写奖项。
 * 深链只带 about=展名，不改 RFQ 五键字段名与枚举。
 * 其它语种没有独立译文时回落英文。
 */

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

export const FAIR_SOURCE_ASEAN = 'https://www.cosmoprof.com/en/media-room/news/cosmoprof-cbe-asean-2026-reinforces-its-position-as-the-leading-platform-for-the-beauty-business-in-southeast-asia/';
export const FAIR_SOURCE_DUBAI = 'https://beautyworld-dubai.ae.messefrankfurt.com/dubai/en/press/press-releases/all/20260818.html';
export const FAIR_SOURCE_ASIA = 'https://stylespeak.com/cosmoprof-asia-2026-previewed-at-hong-kong-press-conference/';

export interface FairCard {
  id: 'asean' | 'dubai' | 'asia';
  name: string;
  when: string;
  line: string;
  cta: string;
  about: string;
  source: string;
  sourceLabel: string;
}

export interface FairTrioCopy {
  title: string;
  note: string;
  cards: FairCard[];
}

const ZH: FairTrioCopy = {
  title: '三展档期',
  note: '日期与城市来自主办方已公布档期。外链只作日程参考，不是我方展商身份。',
  cards: [
    {
      id: 'asean',
      name: 'Cosmoprof CBE ASEAN 2026',
      when: '6/24–26 · 2026 · Bangkok · QSNCC',
      line: '含 Cosmopack · SEA 美妆 B2B / 包材供应链',
      cta: '提交询盘',
      about: 'Cosmoprof CBE ASEAN 2026',
      source: FAIR_SOURCE_ASEAN,
      sourceLabel: '档期来源',
    },
    {
      id: 'dubai',
      name: 'Beautyworld Dubai 2026',
      when: '10/6–8 · 2026 · DWTC',
      line: '原 Beautyworld ME · GCC 渠道 / 品牌对接',
      cta: '提交询盘',
      about: 'Beautyworld Dubai 2026',
      source: FAIR_SOURCE_DUBAI,
      sourceLabel: '档期来源',
    },
    {
      id: 'asia',
      name: 'Cosmopack Asia 2026',
      when: '11/10–12 · 2026 · AsiaWorld-Expo',
      line: '包材 / 私牌供应链',
      cta: '提交询盘',
      about: 'Cosmopack Asia 2026',
      source: FAIR_SOURCE_ASIA,
      sourceLabel: '档期来源',
    },
  ],
};

const EN: FairTrioCopy = {
  title: 'Three published fair dates',
  note: 'Dates and cities follow the organizer’s published schedule. Links are a schedule reference and do not identify us as an exhibitor.',
  cards: [
    {
      id: 'asean',
      name: 'Cosmoprof CBE ASEAN 2026',
      when: '6/24–26 · 2026 · Bangkok · QSNCC',
      line: 'Includes Cosmopack · SEA beauty B2B and packaging supply chain',
      cta: 'Open an RFQ',
      about: 'Cosmoprof CBE ASEAN 2026',
      source: FAIR_SOURCE_ASEAN,
      sourceLabel: 'Schedule source',
    },
    {
      id: 'dubai',
      name: 'Beautyworld Dubai 2026',
      when: '10/6–8 · 2026 · DWTC',
      line: 'Formerly Beautyworld ME · GCC channel and brand matching',
      cta: 'Open an RFQ',
      about: 'Beautyworld Dubai 2026',
      source: FAIR_SOURCE_DUBAI,
      sourceLabel: 'Schedule source',
    },
    {
      id: 'asia',
      name: 'Cosmopack Asia 2026',
      when: '11/10–12 · 2026 · AsiaWorld-Expo',
      line: 'Packaging and private-label supply chain',
      cta: 'Open an RFQ',
      about: 'Cosmopack Asia 2026',
      source: FAIR_SOURCE_ASIA,
      sourceLabel: 'Schedule source',
    },
  ],
};

export function fairLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

export function fairTrioCopy(lang: string): FairTrioCopy {
  return fairLocale(lang).startsWith('zh') ? ZH : EN;
}

/** /{lang}/rfq/?about=展名。不带五键，不预勾市场。 */
export function fairRfqPath(lang: string, about: string): string {
  const q = new URLSearchParams();
  q.set('about', about);
  return `/${fairLocale(lang)}/rfq/?${q.toString()}`;
}

export function fairTrioPlain(copy: FairTrioCopy): string[] {
  return [
    copy.title,
    copy.note,
    ...copy.cards.flatMap((card) => [
      card.name, card.when, card.line, card.cta, card.about, card.source, card.sourceLabel,
    ]),
  ];
}
