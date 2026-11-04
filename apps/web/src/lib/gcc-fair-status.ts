/**
 * Beautyworld 2027 / Connect Dubai 状态条。
 *
 * 只转述主办方已公布的日程，并说明现接受 MENA / GCC 询盘。
 * 外链是主办方页面，不是我方展商身份。
 * 不写价格、不写起订数字。深链只预勾目标市场，不预填清真作答。
 * 其它语种没有独立译文时回落英文。
 */

export const BEAUTYWORLD_SCHEDULE = 'https://beautyworld-dubai.ae.messefrankfurt.com/dubai/en.html';
export const CONNECT_DUBAI_SCHEDULE = 'https://www.cosmoprof.com/en/corporate/cosmoprof-network/other-exhibitions/cosmoprof-connect-dubai/';

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;
const GCC_OEM = new Set(['ae', 'sa']);

export interface GccFairCopy {
  title: string;
  beautyworld: string;
  connect: string;
  identity: string;
  beautyworldLabel: string;
  connectLabel: string;
  cta: string;
}

const ZH: GccFairCopy = {
  title: '海湾展会日程 · 现接受询盘',
  beautyworld: 'Beautyworld 2026 已落幕 · 2027-10-19～21 · Dubai Exhibition Centre · Expo City · 现接受询盘',
  connect: 'Connect Dubai → 2027-04 · 现接受 MENA 询盘',
  identity: '日期与场地来自主办方公布的日程。下面的外链只作日程参考，不是我方展商身份。',
  beautyworldLabel: 'Beautyworld 主办方页面',
  connectLabel: 'Connect Dubai 主办方页面',
  cta: '提交 GCC 询盘',
};

const EN: GccFairCopy = {
  title: 'Gulf fair schedule · inquiries are open',
  beautyworld: 'Beautyworld 2026 has closed · 2027-10-19～21 · Dubai Exhibition Centre · Expo City · inquiries are open now',
  connect: 'Connect Dubai → 2027-04 · MENA inquiries are open now',
  identity: 'Dates and venue follow the organizer’s published schedule. The links below are a schedule reference and do not identify us as an exhibitor.',
  beautyworldLabel: 'Beautyworld organizer page',
  connectLabel: 'Connect Dubai organizer page',
  cta: 'Open a GCC inquiry',
};

export function gccFairLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

export function gccFairCopy(lang: string): GccFairCopy {
  return gccFairLocale(lang).startsWith('zh') ? ZH : EN;
}

/** 深链只预勾 GCC。 */
export function gccFairRfqPath(lang: string): string {
  return `/${gccFairLocale(lang)}/rfq/?target_market=GCC`;
}

/** 阿联酋 / 沙特意图页是海湾着陆页。 */
export function isGccOemMarket(id: string): boolean {
  return GCC_OEM.has(String(id || '').trim().toLowerCase());
}

export function gccFairPlain(copy: GccFairCopy): string[] {
  return [
    copy.title, copy.beautyworld, copy.connect, copy.identity,
    copy.beautyworldLabel, copy.connectLabel, copy.cta,
  ];
}
