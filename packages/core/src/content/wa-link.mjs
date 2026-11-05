/**
 * 公网 WhatsApp 触点。号码只来自 locals.contact.whatsapp 或组件 props，
 * 只留数字。有号则 https://wa.me/${digits}?text= 预填代工话术（中/英随 lang）。
 * 无号则 /{lang}/contact/。不写死站点号码。
 */

export function waDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function localeSegment(locale) {
  const loc = String(locale ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return loc || 'en';
}

/** 与 2026-09 工厂块同一句。 */
export function oemWaText(lang, siteName) {
  const name = String(siteName || 'BIOSPHERE').trim() || 'BIOSPHERE';
  return String(lang ?? '').startsWith('zh')
    ? `你好,我在看 ${name} 的网站,想了解代工。`
    : `Hi, I am looking at the ${name} site and would like to discuss OEM/ODM.`;
}

/**
 * @param {{ whatsapp?: string | null, lang?: string, siteName?: string }} input
 * @returns {string} wa.me URL, or '' when there are no digits
 */
export function waMeHref(input) {
  const wa = waDigits(input?.whatsapp);
  if (!wa) return '';
  const text = oemWaText(input?.lang, input?.siteName);
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {{ whatsapp?: string | null, lang?: string, siteName?: string }} input
 * @returns {string}
 */
export function waOrContact(input) {
  return waMeHref(input) || `/${localeSegment(input?.lang)}/contact/`;
}
