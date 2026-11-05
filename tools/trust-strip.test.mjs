// 莱诺鸟 P0-2：首页信任带（#55 已撤 HomeLead；D+E 打开 TRUST）。node tools/trust-strip.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const { OEM_CERTS } = await import(new URL('../packages/core/src/content/oem.ts', import.meta.url));

const page = read('apps/web/src/pages/[...path].astro');
const strip = read('apps/web/src/components/BioTrustStrip.astro');

const stripAt = page.indexOf('<BioTrustStrip');
const funnelAt = page.indexOf('<Funnel locale={lang} heading="h2" />');
const fairAt = page.indexOf('<CosmopackInquiry');
assert.ok(stripAt >= 0 && funnelAt > stripAt && fairAt > funnelAt, '信任带 → funnel，展会条在 funnel 之后');
assert.doesNotMatch(page, /<HomeLead|可来厂核对的化妆品代工|bio-hero/);
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
assert.doesNotMatch(strip, /halal certified/i);
assert.doesNotMatch(strip, /FDA|CPNP|SFDA/);
assert.doesNotMatch(strip, /低\s*MOQ|No MOQ|low MOQ/i);
assert.doesNotMatch(strip, /普草/);
assert.doesNotMatch(strip, /cert-gmpc|cert-iso|cert-halal/);
assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v147'/);

assert.match(page, /const SHOW_HOME_TRUST_STRIP = true/);
assert.match(page, /const SHOW_HOME_COSMOPACK = false/);
assert.match(page, /const SHOW_HOME_HOT_SHELF = false/);
assert.match(page, /const SHOW_HOME_SHOWCASE = false/);
assert.match(page, /showHome\.TRUST && site\.id === 'biosphere-ai'/);
assert.match(page, /showHome\.COSMOPACK && site\.id === 'biosphere-ai'/);
assert.match(page, /showHome\.SHOWCASE && showcaseData\.items\.length > 0/);
assert.match(page, /b\.type === 'shelf' && site\.id === 'biosphere-ai' && !slug && !showHome\.HOT_SHELF/);

console.log('trust-strip.test.mjs:全部通过');
