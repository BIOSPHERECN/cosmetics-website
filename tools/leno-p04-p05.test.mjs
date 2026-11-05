// 莱诺鸟 P0-4 / P0-5：详情双 CTA + RFQ 四块视觉。node tools/leno-p04-p05.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waveRfqPath } from '../apps/web/src/lib/wave-products.ts';
import {
  gateProductRfqHref,
  productDetailRfqHref,
  productDosageLine,
} from '../apps/web/src/lib/product-cta.ts';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const page = read('apps/web/src/pages/[lang]/product/[pslug].astro');
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
const middleware = read('apps/web/src/middleware.ts');

assert.match(middleware, /const CACHE_V = 'v146'/);
assert.doesNotMatch(page, /setInterval/);
assert.match(page, /data-autoplay="off"/);
assert.match(page, /images = images\.slice\(0,\s*3\)/);
assert.match(page, /portfolioCoverSrc\(/);
assert.match(page, /#f6f5f2/);
assert.match(page, /@media \(prefers-reduced-motion:\s*reduce\)/);
assert.match(page, /transform:\s*none/);
assert.match(page, /-webkit-line-clamp:\s*3/);
assert.match(page, /if \(waveCard\) return waveRfqPath/);
assert.match(page, /按品类与包材书面确认/);
assert.doesNotMatch(page, /\{product\.moq\}/);
assert.doesNotMatch(page, /低\s*MOQ|普草|halal certified/i);
assert.doesNotMatch(page, /www\./);

assert.equal((page.match(/class="cta primary"/g) || []).length, 1);
assert.equal((page.match(/class="sample-btn"/g) || []).length, 1);
assert.match(page, /class="cta primary" href=\{inquiryHref\}/);
assert.match(page, /class="sample-btn" href=\{sampleHref\}/);
assert.match(page, /class="develop-link" href=\{developHref\}/);
assert.match(page, /inquiryHref = gateProductRfqHref\(rfqFor\('inquiry'\)\)/);
assert.match(page, /sampleHref = gateProductRfqHref\(rfqFor\('sample'\)\)/);
assert.doesNotMatch(page, /class="cta"/);
assert.doesNotMatch(page, /class="cta primary"[^>]*develop/i);

const primaryCss = page.match(/\.cta\.primary\s*\{[^}]+\}/);
const sampleCss = page.match(/\.sample-btn\s*\{[^}]+\}/);
const developCss = page.match(/\.develop-link\s*\{[^}]+\}/);
assert.ok(primaryCss && sampleCss && developCss);
assert.match(primaryCss[0], /background:\s*var\(--bio-primary/);
assert.match(sampleCss[0], /background:\s*transparent/);
assert.doesNotMatch(sampleCss[0], /background:\s*var\(--bio-primary/);
assert.match(developCss[0], /text-decoration:\s*underline/);
assert.doesNotMatch(developCss[0], /background:\s*var\(--bio-primary/);
assert.match(page, /\.wa\s*\{[^}]*background:\s*transparent/);

const built = {
  '.cta.primary': gateProductRfqHref(waveRfqPath('en', 'spf50-acne-gel-id', 'inquiry', 'Oil-control gel sunscreen (Indonesia)')),
  '.sample-btn': gateProductRfqHref(waveRfqPath('zh-cn', 'peptide-barrier-serum-eu', 'sample', '肽屏障精华')),
};
for (const [cls, href] of Object.entries(built)) {
  assert.match(href, /product_id=[^&]+/, cls);
  assert.match(href, /about=[^&]+/, cls);
  assert.equal(/[?&]product_id=(?:&|$)/.test(href), false, cls);
  assert.doesNotMatch(href, /www/, cls);
  assert.doesNotMatch(href, /^https?:/, cls);
  assert.equal(href.startsWith('/'), true, cls);
}
const plainSample = productDetailRfqHref({
  lang: 'en', intent: 'sample', productRef: '85', about: 'Night Cream', category: 'cream',
});
const plainInquiry = productDetailRfqHref({
  lang: 'zh-cn', intent: 'inquiry', productRef: 'night-cream', about: '夜霜', category: 'cream',
});
for (const href of [plainSample, plainInquiry]) {
  assert.match(href, /product_id=[^&]+/);
  assert.match(href, /about=[^&]+/);
  assert.equal(/[?&]product_id=(?:&|$)/.test(href), false);
}
assert.equal(new URL(plainSample, 'https://biosphere-ai.com').searchParams.get('product_id'), '85');
assert.equal(new URL(plainInquiry, 'https://biosphere-ai.com').searchParams.get('intent'), 'inquiry');
assert.equal(productDetailRfqHref({ lang: 'en', intent: 'inquiry', productRef: '', about: 'Night' }), '');
assert.equal(productDetailRfqHref({ lang: 'en', intent: 'sample', productRef: '85', about: '   ' }), '');
assert.equal(gateProductRfqHref('/en/rfq/?product_id=&about=Night'), '');
assert.equal(gateProductRfqHref('/en/rfq/?about=Night'), '');
assert.equal(gateProductRfqHref('https://www.biosphere-ai.com/en/rfq/?product_id=85&about=Night'), '');

assert.equal(productDosageLine('[{"label":"剂型","value":"serum"}]', 'body', true), '精华');
assert.equal(productDosageLine('[{"label":"texture","value":"gel"}]', 'suncare', false), 'Gel');
assert.equal(productDosageLine('[{"label":"texture","value":"fluid/gel"}]', 'suncare', true), '凝胶');
assert.equal(productDosageLine('[]', 'serum', false), 'Serum');

assert.equal((rfq.match(/<section class="rfq-block"/g) || []).length, 4);
assert.equal((rfq.match(/class="rfq-title"/g) || []).length, 4);
const gap = rfq.match(/--rfq-block-gap:\s*(\d+)px/);
assert.ok(gap, '缺块间距');
const gapPx = Number(gap[1]);
assert.ok(gapPx >= 24 && gapPx <= 32, `块间距 ${gapPx}px 不在 24–32`);
const blockCss = rfq.match(/\.rfq-block\s*\{[^}]+\}/);
assert.ok(blockCss);
assert.match(blockCss[0], /#f6f5f2/);
assert.match(blockCss[0], /border-inline-start:[^;]*var\(--bio-primary/);
assert.match(rfq, /margin-top:\s*calc\(var\(--rfq-block-gap\)/);
const titleSizes = [...rfq.matchAll(/\.rfq-title[^{]*\{[^}]*font-size:\s*([^;]+)/g)].map((m) => m[1].trim());
assert.ok(titleSizes.length >= 1);
assert.equal(new Set(titleSizes).size, 1, 'EN/ZH 块标题必须同一字阶');
assert.match(rfq, /@media \(max-width:\s*390px\)/);
assert.match(rfq, /overflow-wrap:\s*anywhere/);
const btnCss = rfq.match(/\.btn\s*\{[^}]+\}/);
assert.ok(btnCss);
assert.match(btnCss[0], /width:\s*100%/);
assert.match(btnCss[0], /background:\s*var\(--bio-primary/);
assert.equal((rfq.match(/<button class="btn"/g) || []).length, 1);

const form = rfq.slice(rfq.indexOf('<form id="rfq-form"'));
const cardAt = form.indexOf('{productId && (');
const blockAt = form.indexOf('<section class="rfq-block"');
assert.ok(cardAt >= 0 && cardAt < blockAt, '摘要卡贴在第一块上方');
assert.match(form, /rfq-summary/);
assert.doesNotMatch(rfq, /\{showCard && \(/);
assert.match(rfq, /\.scope\s*\{[^}]*visibility:\s*hidden/);
assert.match(rfq, /halal_ready"\]\[value="yes"\]:checked\)\s+\.scope\s*\{[^}]*visibility:\s*visible/);
assert.doesNotMatch(rfq, /\.scope\s*\{[^}]*display:\s*none/);

for (const key of ['target_market', 'halal_ready', 'notification_assist_country', 'first_order_band']) {
  assert.match(rfq, new RegExp(`name="${key}"`));
}
assert.match(rfq, /value="yes"/);
assert.match(rfq, /value="no"/);
assert.match(rfq, /value="unsure"/);
assert.doesNotMatch(rfq, /value="certified"/);
assert.doesNotMatch(rfq, /halal certified|低\s*MOQ|普草/i);
assert.match(rfq, /name="formula_path"/);
assert.match(rfq, /classList\.add\('is-quote'\)/);

const strip = read('apps/web/src/components/BioTrustStrip.astro');
const card = read('apps/web/src/components/PortfolioCard.astro');
const flow = read('apps/web/src/components/EvidenceFlow.astro');
assert.match(strip, /class="bio-trust-strip"/);
assert.match(card, /product_id=/);
assert.match(card, /pf-aspect-1x1/);
assert.match(flow, /class="ev-evidence"/);
assert.match(flow, /class="ev-pains"/);
assert.match(flow, /class="ev-steps"/);
assert.match(flow, /class="ev-cta"/);
assert.match(read('apps/web/src/lib/oem-evidence.ts'), /intent=oem-evidence/);

console.log('leno-p04-p05.test.mjs:全部通过');
