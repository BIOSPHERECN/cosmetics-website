// 莱诺鸟 P0-2：首页 HomeLead 正下方一条信任带。node tools/trust-strip.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const { OEM_CERTS } = await import(new URL('../packages/core/src/content/oem.ts', import.meta.url));

const page = read('apps/web/src/pages/[...path].astro');
const strip = read('apps/web/src/components/BioTrustStrip.astro');
const hero = read('apps/web/src/components/HomeLead.astro');

const leadAt = page.indexOf('<HomeLead');
const stripAt = page.indexOf('<BioTrustStrip');
const fairAt = page.indexOf('<CosmopackInquiry');
assert.ok(leadAt >= 0 && stripAt > leadAt && fairAt > stripAt, '信任带紧接 HomeLead，位于展会条之前');
assert.match(page, /<BioTrustStrip locale=\{lang\} \/>/);

assert.deepEqual(OEM_CERTS.map((c) => c.id), ['gmpc', 'iso-22716', 'halal']);
assert.match(strip, /OEM_CERTS/);
assert.match(strip, /oem\/cert\/\$\{c\.id\}\//);
assert.match(strip, /href=\{`\$\{base\}\/rfq\/`\}/);
assert.doesNotMatch(strip, /product_id/);
assert.doesNotMatch(strip, /https?:\/\//);
assert.doesNotMatch(strip, /www\./);
assert.match(strip, /Lead time confirmed in writing/);
assert.match(strip, /交期以书面确认为准/);
assert.match(strip, /Request sample/);
assert.match(strip, /申请样品/);
assert.match(strip, /class="bio-trust-strip"/);
assert.match(strip, /background:\s*var\(--bio-bg\)/);
assert.match(strip, /padding-block:\s*32px/);
assert.match(strip, /max-width:\s*390px/);
assert.match(strip, /overflow-x:\s*auto/);
assert.doesNotMatch(strip, /--bio-primary/);
assert.match(hero, /--bio-primary/);
assert.match(hero, /bio-hero-cta/);
assert.doesNotMatch(strip, /halal certified/i);
assert.doesNotMatch(strip, /FDA|CPNP|SFDA/);
assert.doesNotMatch(strip, /低\s*MOQ|No MOQ|low MOQ/i);
assert.doesNotMatch(strip, /普草/);
assert.doesNotMatch(strip, /cert-gmpc|cert-iso|cert-halal/);
assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v140'/);

console.log('trust-strip.test.mjs:全部通过');
