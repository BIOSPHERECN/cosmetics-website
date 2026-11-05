/**
 * Mobile dual CTA link targets (架构 §5 P1-3).
 * Pure functions so tools/p1-3-mobile-dual-cta.test.mjs can run them without Astro.
 *
 * Sample:
 *   - On /{lang}/rfq/ keep the current query. Rebuilding ?product_id= alone drops
 *     about / category / intent that the product page already put on the form.
 *   - Elsewhere, product_id is appended only when it matches the RFQ safe-id
 *     pattern (same shape as apps/web/src/lib/rfq-context.ts). Never emit
 *     product_id= with an empty or illegal value.
 *   - Detail pages are /{lang}/product/{slug}/. Canon strips ?product_id= on that
 *     path, so the slug is the W5 fallback. RFQ lookup matches p.id OR p.slug.
 */

/** Matches rfq-context SAFE_ID: 1–40 chars, no spaces, no empty string. */
export const SAFE_PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

function safeId(value) {
  const v = String(value ?? '').trim();
  return SAFE_PRODUCT_ID.test(v) ? v : '';
}

function localeSegment(locale) {
  const loc = String(locale ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return loc || 'en';
}

/**
 * @param {{ locale?: string, pathname?: string, search?: string }} input
 * @returns {string}
 */
export function sampleHref(input) {
  const loc = localeSegment(input?.locale);
  const rawPath = String(input?.pathname || '/');
  const path = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
  const search = String(input?.search || '');
  const searchNorm = search && !search.startsWith('?') ? `?${search}` : search;

  /* Already on the form: keep every query param and jump to the form.
     Replacing the URL with ?product_id= alone drops about/category/intent
     and a full navigation wipes fields the visitor already typed. */
  if (/\/rfq\/$/.test(path)) {
    const base = `${path}${searchNorm}`;
    return base.includes('#') ? base : `${base}#rfq-form`;
  }

  const sp = new URLSearchParams(searchNorm.startsWith('?') ? searchNorm.slice(1) : searchNorm);
  let pid = safeId(sp.get('product_id'));
  if (!pid) {
    const m = path.match(/\/product\/([^/]+)\/$/);
    if (m) {
      let slug = '';
      try { slug = decodeURIComponent(m[1]).trim().toLowerCase(); } catch { slug = ''; }
      pid = safeId(slug);
    }
  }
  return pid ? `/${loc}/rfq/?product_id=${encodeURIComponent(pid)}` : `/${loc}/rfq/`;
}
