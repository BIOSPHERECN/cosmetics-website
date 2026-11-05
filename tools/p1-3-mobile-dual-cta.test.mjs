// P1-3: Mobile bottom bar is WhatsApp + Request sample.
// node tools/p1-3-mobile-dual-cta.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleHref, whatsappHref } from '../packages/core/src/components/mobile-dual-cta.mjs';

const mobileDualCta = readFileSync(
  new URL('../packages/core/src/components/MobileDualCta.astro', import.meta.url),
  'utf8',
);
const logic = readFileSync(
  new URL('../packages/core/src/components/mobile-dual-cta.mjs', import.meta.url),
  'utf8',
);
const baseLayout = readFileSync(
  new URL('../packages/core/src/layouts/BaseLayout.astro', import.meta.url),
  'utf8',
);
const middleware = readFileSync(
  new URL('../apps/web/src/middleware.ts', import.meta.url),
  'utf8',
);

assert.match(logic + baseLayout, /wa\.me/, 'public bar helper and layout must be able to emit wa.me');
assert.equal(/8613600050502/.test(logic + mobileDualCta + baseLayout), false, 'public bar must not embed the site number');
assert.match(logic, /\/rfq\/\?product_id=|\/rfq\/`/, 'must link /rfq/');
assert.match(mobileDualCta, /max-width:\s*52rem/, 'mobile media query');
assert.match(mobileDualCta, /beauty2oem/, 'beauty2oem skip');
assert.equal(/href=["'][^"']*普草/.test(mobileDualCta + logic), false, 'no 普草 href');
assert.match(middleware, /const CACHE_V = 'v153'/, 'CACHE_V is v153 for home showroom');
assert.match(baseLayout, /import MobileDualCta from/, 'BaseLayout imports MobileDualCta');
assert.match(baseLayout, /<MobileDualCta\s+locale=\{locale\}\s+brand=\{brand\}\s*\/>/, 'BaseLayout mounts MobileDualCta');
assert.match(baseLayout, /<\/style>/, 'BaseLayout style tag closed');
assert.match(mobileDualCta, /display:\s*none/, 'hidden on desktop by default');
assert.match(mobileDualCta, /class="wa-btn"/, 'WhatsApp button sits beside Request sample');
assert.match(mobileDualCta, /whatsappHref\(/);
assert.match(mobileDualCta, /sampleHref\(/, 'sample href comes from the helper');
assert.match(mobileDualCta, /body:has\(\.mobile-dual-cta\)/, 'body padding only when the bar is rendered');
assert.equal(/:global\(body\)\s*\{[^}]*padding-bottom/.test(mobileDualCta), false, 'do not pad body when beauty2oem skips the bar');
assert.match(mobileDualCta, /env\(safe-area-inset-bottom/, 'clear the home indicator');
assert.match(mobileDualCta, /z-index:\s*49/, 'stay under the sticky header (z-index 50)');
assert.match(mobileDualCta, /\.ck-top/, 'lift back-to-top above the bar');
assert.match(mobileDualCta, /bh-dual-cta-typing/, 'hide the bar while a text field is focused');
const noneAt = mobileDualCta.search(/\.mobile-dual-cta \{[^}]*display:\s*none/s);
const mediaAt = mobileDualCta.indexOf('@media (max-width: 52rem)');
const flexAt = mobileDualCta.indexOf('.mobile-dual-cta { display: flex; }');
assert.ok(noneAt !== -1 && noneAt < mediaAt, 'desktop hide is the default, before the mobile query');
assert.ok(flexAt > mediaAt, 'flex only inside the mobile query');

assert.equal(sampleHref({ locale: 'en', pathname: '/en/', search: '' }), '/en/rfq/');
assert.equal(sampleHref({ locale: 'zh-cn', pathname: '/zh-cn/about/', search: '' }), '/zh-cn/rfq/');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/', search: '?product_id=' }), '/en/rfq/', 'never empty product_id');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/', search: '?product_id=%20%20' }), '/en/rfq/', 'whitespace is empty');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/about/', search: '?product_id=<bad>' }), '/en/rfq/', 'illegal id is dropped');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/portfolio/', search: '?product_id=85' }), '/en/rfq/?product_id=85');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/product/sage-acne-serum/', search: '' }), '/en/rfq/?product_id=sage-acne-serum');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/product/sage-acne-serum', search: '' }), '/en/rfq/?product_id=sage-acne-serum', 'missing trailing slash');
assert.equal(sampleHref({ locale: 'zh-cn', pathname: '/zh-cn/product/Sage-Acne/', search: '' }), '/zh-cn/rfq/?product_id=sage-acne');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/product/a%2Bb/', search: '' }), '/en/rfq/?product_id=a%2Bb');
assert.equal(sampleHref({ locale: 'en', pathname: '/en/products/sage-acne-serum/', search: '' }), '/en/rfq/', 'plural list is not a detail page');
assert.equal(
  sampleHref({ locale: 'en', pathname: '/en/product/sage-acne-serum/', search: '?product_id=85' }),
  '/en/rfq/?product_id=85',
  'explicit product_id wins over the slug',
);
assert.equal(
  sampleHref({ locale: 'en', pathname: '/en/rfq/', search: '?product_id=85&about=Night%20Cream&intent=sample' }),
  '/en/rfq/?product_id=85&about=Night%20Cream&intent=sample#rfq-form',
  'do not strip the RFQ query',
);
assert.equal(sampleHref({ locale: 'en', pathname: '/en/rfq', search: '' }), '/en/rfq/#rfq-form');
assert.equal(sampleHref({ locale: '', pathname: '/en/', search: '' }), '/en/rfq/');
assert.equal(sampleHref({ locale: '/evil.com', pathname: '/en/', search: '' }), '/evilcom/rfq/');
assert.equal(sampleHref({ locale: 'en', pathname: `/en/product/${'a'.repeat(41)}/`, search: '' }), '/en/rfq/', 'over-long slug is not a safe id');
assert.equal(/product_id=$/.test(sampleHref({ locale: 'en', pathname: '/en/', search: '?product_id=' })), false);
assert.equal(/product_id=&/.test(sampleHref({ locale: 'zh-tw', pathname: '/zh-tw/', search: '' })), false);

const zhWa = whatsappHref('+86 136-0005-0502', 'zh-cn', 'BIOSPHERE');
assert.equal(zhWa.startsWith('https://wa.me/8613600050502?text='), true);
assert.match(decodeURIComponent(zhWa), /想了解代工/);
const enWa = whatsappHref('8613600050502', 'en', 'BIOSPHERE');
assert.match(decodeURIComponent(enWa), /OEM\/ODM/);
assert.equal(whatsappHref('', 'en'), '/en/contact/');
assert.equal(whatsappHref(null, 'zh-tw'), '/zh-tw/contact/');
assert.equal(whatsappHref('not-a-number', 'ja'), '/ja/contact/');

console.log('p1-3 mobile dual CTA test ok');
