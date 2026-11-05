/**
 * 莱诺鸟 P0-6：证据页主 CTA 与厂证链。
 * 只带 intent=oem-evidence，不带 product_id。路径是 apex 相对路径。
 */

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;
const CERT_ID = /^(gmpc|iso-22716|halal)$/;

export function oemEvidenceLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

/** /{lang}/rfq/?intent=oem-evidence — 查询串只有 intent。 */
export function oemEvidenceRfqPath(lang: string): string {
  return `/${oemEvidenceLocale(lang)}/rfq/?intent=oem-evidence`;
}

/** 已持有三证。认不出的 id 回到 OEM hub，不拼出 404。 */
export function oemEvidenceCertPath(lang: string, id: string): string {
  const loc = oemEvidenceLocale(lang);
  if (!CERT_ID.test(id)) return `/${loc}/oem/`;
  return `/${loc}/oem/cert/${id}/`;
}

/** 链上文字：ISO 写到 2007 版；GMPC / HALAL 用原名。不写本品已获清真认证。 */
export function oemEvidenceCertLabel(id: string, name: string): string {
  return id === 'iso-22716' ? 'ISO 22716:2007' : name;
}
