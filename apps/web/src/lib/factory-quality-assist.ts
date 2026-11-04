/**
 * factory-quality 证据块里的一条协助句。
 * 只说明 Halal OEM 路径与目标市场注册协助，不是 SKU 证书，也不保证获批。
 */

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

const ZH = 'Halal OEM 路径与目标市场注册协助（MY NPRA / ID BPOM·BPJPH）。只做文件支持，不是该 SKU 的 Halal 证书，也不保证获批。';
const EN = 'Halal OEM pathway and target-market registration assistance (Malaysia NPRA / Indonesia BPOM·BPJPH). Document support only — not a Halal certificate on your SKU, not guaranteed approval.';

export function factoryQualityAssist(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  const loc = LOCALE.test(l) ? l : 'en';
  return loc.startsWith('zh') ? ZH : EN;
}
