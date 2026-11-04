// P1-3: Mobile bottom bar dual CTA (WhatsApp + Request sample)
// node tools/p1-3-mobile-dual-cta.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mobileDualCta = readFileSync(
  new URL('../packages/core/src/components/MobileDualCta.astro', import.meta.url),
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

assert.match(mobileDualCta, /wa\.me/, 'must contain wa.me');
assert.match(mobileDualCta, /\/rfq\/\?product_id=|\/rfq\/`/, 'must link /rfq/');
assert.match(mobileDualCta, /max-width:\s*52rem/, 'mobile media query');
assert.match(mobileDualCta, /beauty2oem/, 'beauty2oem skip');
assert.match(mobileDualCta, /8613600050502/, 'WA placeholder');
assert.match(mobileDualCta, /待确认/, 'placeholder marked 待确认');
assert.equal(/href=["'][^"']*普草/.test(mobileDualCta), false, 'no 普草 href');
assert.match(middleware, /const CACHE_V = 'v\d+'/, 'CACHE_V present; do not assert exact bump here beyond existence');
assert.match(baseLayout, /import MobileDualCta from/, 'BaseLayout imports MobileDualCta');
assert.match(baseLayout, /<MobileDualCta\s+locale=\{locale\}\s+brand=\{brand\}\s*\/>/, 'BaseLayout mounts MobileDualCta');
assert.match(baseLayout, /<\/style>/, 'BaseLayout style tag closed');
assert.match(mobileDualCta, /display:\s*none/, 'hidden on desktop by default');
assert.match(mobileDualCta, /:global\(#bh-wa-fab\)/, 'hides conflicting WA FAB on mobile');

console.log('p1-3 mobile dual CTA test ok');

