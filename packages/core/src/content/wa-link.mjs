/**
 * 公网 WhatsApp 触点。号码只来自 locals.contact.whatsapp 或组件 props，
 * 只留数字。有号则 https://wa.me/${digits}?text= 预填代工话术（语种随 lang）。
 * 无号则 /{lang}/contact/。不写死站点号码。
 *
 * 预填只带站名、规范路径、可靠的产品/品类名和 OEM/ODM 意向。
 * 不把查询串、令牌、邮箱、电话或身份写进 text=。
 */

export function waDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function localeSegment(locale) {
  const loc = String(locale ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return loc || 'en';
}

/** 只保留规范路径，丢掉查询串和片段。不合规则返回空。 */
export function safeSourcePath(raw) {
  let path = String(raw ?? '').trim().split('#')[0].split('?')[0];
  if (!path) return '';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (path.includes('..')) return '';
  if (!/^\/[A-Za-z0-9/_.+\-]*$/.test(path)) return '';
  if (!path.endsWith('/')) path += '/';
  if (path.length > 96) {
    const cut = path.lastIndexOf('/', 96);
    path = cut > 0 ? path.slice(0, cut + 1) : '';
  }
  return path;
}

/** 产品或品类短名。含邮箱、链接或长数字串则丢弃。 */
export function safePrefillSubject(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!s) return '';
  if (/@|https?:\/\/|wa\.me|\d{8,}/i.test(s)) return '';
  return s;
}

/** 与 2026-09 工厂块同一句；有可靠来源页/产品时再追加，无额外字段时原文不动。 */
export function oemWaText(lang, siteName, extras) {
  const name = String(siteName || 'BIOSPHERE').trim() || 'BIOSPHERE';
  const loc = String(lang ?? '').toLowerCase();
  const path = safeSourcePath(extras?.path);
  const about = safePrefillSubject(extras?.product) || safePrefillSubject(extras?.category);

  if (loc.startsWith('ar')) {
    let t = `مرحبا، أطلع على موقع ${name}`;
    if (path) t += `، الصفحة ${path}`;
    if (about) t += `، حول ${about}`;
    t += '، وأرغب في مناقشة تصنيع OEM/ODM.';
    return t;
  }
  if (loc.startsWith('zh')) {
    if (!path && !about) return `你好,我在看 ${name} 的网站,想了解代工。`;
    let t = `你好,我在看 ${name} 的网站`;
    if (path) t += `，页面 ${path}`;
    if (about) t += `，关于 ${about}`;
    t += '，想了解代工。';
    return t;
  }
  if (!path && !about) {
    return `Hi, I am looking at the ${name} site and would like to discuss OEM/ODM.`;
  }
  let t = `Hi, I am looking at the ${name} site`;
  if (path) t += ` (page ${path})`;
  if (about) t += `, about ${about}`;
  t += ' and would like to discuss OEM/ODM.';
  return t;
}

/**
 * @param {{ whatsapp?: string | null, lang?: string, siteName?: string, path?: string, product?: string, category?: string }} input
 * @returns {string} wa.me URL, or '' when there are no digits
 */
export function waMeHref(input) {
  const wa = waDigits(input?.whatsapp);
  if (!wa) return '';
  const text = oemWaText(input?.lang, input?.siteName, {
    path: input?.path,
    product: input?.product,
    category: input?.category,
  });
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {{ whatsapp?: string | null, lang?: string, siteName?: string, path?: string, product?: string, category?: string }} input
 * @returns {string}
 */
export function waOrContact(input) {
  return waMeHref(input) || `/${localeSegment(input?.lang)}/contact/`;
}
