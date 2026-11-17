// P0: restore WhatsApp as the primary en/ar sales path, with safe source-page prefill.
// node tools/wa-p0-cta.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  oemWaText, waMeHref, safeSourcePath, safePrefillSubject,
} from '../packages/core/src/content/wa-link.mjs';

const root = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

// Existing OEM line stays unchanged when no page/product is passed.
assert.equal(
  oemWaText('en', 'BIOSPHERE'),
  'Hi, I am looking at the BIOSPHERE site and would like to discuss OEM/ODM.',
);
assert.equal(
  oemWaText('zh-cn', 'BIOSPHERE'),
  '你好,我在看 BIOSPHERE 的网站,想了解代工。',
);

const en = waMeHref({
  whatsapp: '+86 136-0005-0502',
  lang: 'en',
  siteName: 'BIOSPHERE-AI',
  path: '/en/?utm=x&email=buyer@example.com&token=secret',
});
const enText = decodeURIComponent(en.slice(en.indexOf('text=') + 5));
assert.equal(en.startsWith('https://wa.me/8613600050502?text='), true);
assert.match(enText, /BIOSPHERE-AI/);
assert.match(enText, /page \/en\//);
assert.match(enText, /OEM\/ODM/);
assert.doesNotMatch(enText, /utm=|email=|buyer@|token=|secret/);

const ar = waMeHref({
  whatsapp: '8613600050502',
  lang: 'ar',
  siteName: 'BIOSPHERE-AI',
  path: '/ar/',
  product: 'Hyaluronic serum',
});
const arText = decodeURIComponent(ar.slice(ar.indexOf('text=') + 5));
assert.match(arText, /مرحبا/);
assert.match(arText, /\/ar\//);
assert.match(arText, /Hyaluronic serum/);
assert.match(arText, /OEM\/ODM/);

assert.equal(safeSourcePath('/en/product/foo-bar/?token=abc#x'), '/en/product/foo-bar/');
assert.equal(safeSourcePath('../etc/passwd'), '');
assert.equal(safePrefillSubject('buyer@example.com'), '');
assert.equal(safePrefillSubject('https://evil.example/x'), '');
assert.equal(safePrefillSubject('call 8613600050502 now'), '');
assert.equal(safePrefillSubject('Niacinamide Serum'), 'Niacinamide Serum');

const product = waMeHref({
  whatsapp: '8613600050502',
  lang: 'en',
  siteName: 'BIOSPHERE-AI',
  path: '/en/product/niacinamide-serum/',
  product: 'Niacinamide Serum',
});
const pText = decodeURIComponent(product.slice(product.indexOf('text=') + 5));
assert.match(pText, /page \/en\/product\/niacinamide-serum\//);
assert.match(pText, /about Niacinamide Serum/);

const home = read('apps/web/src/components/HomeShowroom.astro');
assert.match(home, /locale === 'en' \|\| locale === 'ar'/);
assert.match(home, /class="show-pri" href=\{chat\}/);
assert.match(home, /class="show-ghost" href=\{`\/\$\{locale\}\/rfq\/`\}/);
assert.match(home, /data-wa-placement="home-hero"/);
assert.match(home, /waMeHref/);
assert.doesNotMatch(home, /function chatHref/);

const detail = read('apps/web/src/pages/[lang]/product/[pslug].astro');
assert.match(detail, /data-wa-placement="product-hero"/);
assert.match(detail, /product: displayName/);
const waIdx = detail.indexOf('data-wa-placement="product-hero"');
const inquiryIdx = detail.indexOf('{productWa && inquiryHref && <a class="sample-btn" href={inquiryHref}>{T.inquiry}</a>}');
assert.equal(waIdx > 0 && inquiryIdx > waIdx, true, 'product WhatsApp primary must precede the RFQ button');

const gcc = read('apps/web/src/components/GccFairStatus.astro');
assert.match(gcc, /data-wa-placement="gcc-fair"/);
assert.match(gcc, /class="gcc-btn" href=\{gccWa\}/);
assert.match(gcc, /class="gcc-btn ghost" href=\{rfq\}/);

const market = read('apps/web/src/pages/[lang]/oem/[market]/[category].astro');
assert.match(market, /data-wa-placement="oem-market"/);
assert.match(market, /isGccOemMarket\(M\.id\) \? waMeHref/);

const pulse = read('apps/web/src/pages/api/pulse.ts');
assert.match(pulse, /sp\.get\('pl'\)/);
assert.match(pulse, /place \|\| '-'/);

const layout = read('packages/core/src/layouts/BaseLayout.astro');
assert.match(layout, /data-wa-placement/);
assert.match(layout, /&wa=1&pl=/);

const ledger = read('docs/sales-whatsapp-ledger.template.md');
assert.match(ledger, /source_path/);
assert.match(ledger, /placement/);
assert.doesNotMatch(ledger, /8613600050502/);

console.log('wa-p0-cta.test.mjs ok');
