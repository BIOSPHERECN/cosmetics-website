// 英文首页与 /en/oem/ 采购 FAQ。问句答句与 FAQPage 同一份原文。
// node tools/buyer-oem-faq.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUYER_OEM_FAQ, BUYER_OEM_FAQ_HEADING, BUYER_OEM_FAQ_LINKS } from '../apps/web/src/lib/buyer-oem-faq.ts';
import { oemPageTitle } from '../apps/web/src/lib/oem-index-seo.ts';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const EXPECTED = [
  ['Are you a private label cosmetics manufacturer in Guangzhou?',
    'Yes. Guangzhou Bohui Cosmetics Co., Ltd. (founded 2012) runs all production from its Guangzhou plant; BIOSPHERE is its export brand.'],
  ['Which factory certifications do you hold?',
    'The plant holds GMPC, ISO 22716:2007, and HALAL only. FDA facility registration and EU CPNP are filing assistance, not factory certifications; registration is not approval, and no certificate is issued.'],
  ['What is your MOQ?',
    'MOQ is not a single published figure. It follows the format and filling line, whether the packaging is a stock shape or a new mould, and whether the formula changes; terms are issued per project in a written quotation.'],
  ['How long does sampling take?',
    'Samples usually ship in 5–14 days (existing bases at the short end, new formulations at the long end), confirmed in writing. This is a sampling indication, not a mass-production lead time.'],
  ['What categories can you manufacture?',
    'The Guangzhou plant manufactures skincare, colour cosmetics, oral care, kids skincare, body care, hair care, cleansing, sun care and fragrance. The factory has more than 13,000 formulations on file in total; that figure is plant-wide, not a count for each category.'],
  ['How do I start an OEM or private-label project?',
    'Send a brief with category, target market, first-order volume, and a reference product or INCI, via WhatsApp or the RFQ form. Commercial terms are quoted per project in writing.'],
];

assert.equal(BUYER_OEM_FAQ_HEADING, 'Questions buyers ask before an OEM inquiry');
assert.equal(BUYER_OEM_FAQ.length, 6);
assert.deepEqual(BUYER_OEM_FAQ.map((x) => [x.q, x.a]), EXPECTED);
assert.equal(EXPECTED[3][1].includes('5\u201314'), true);

const links = [
  ['/en/answers/', 'All buyer questions'],
  ['/en/answers/moq-lead-skincare/', 'Skincare MOQ and lead time'],
  ['/en/answers/how-to-audit-oem/', 'How to check a contract manufacturer'],
  ['/en/capabilities/', 'Plant certifications'],
  ['/en/rfq/', 'Send a project brief'],
];
assert.deepEqual(BUYER_OEM_FAQ_LINKS.map((x) => [x.href, x.label]), links);

const blob = `${BUYER_OEM_FAQ_HEADING}\n${BUYER_OEM_FAQ.map((x) => `${x.q}\n${x.a}`).join('\n')}`;
for (const banned of ['MOQ 500', 'DDP Hamburg', '25 days', 'CE certified', 'CE held']) {
  assert.equal(blob.includes(banned), false, banned);
}
assert.equal(blob.includes('plant-wide, not a count for each category'), true);
assert.equal(/13,000\+/.test(blob), false);

/* 与 faqJsonLd 同一映射。jsonld.ts 还导出 core 的 Organization，单测不拉包，只钉函数形状。 */
const jsonld = read('apps/web/src/lib/jsonld.ts');
const faqFn = jsonld.slice(jsonld.indexOf('export function faqJsonLd'), jsonld.indexOf('export function siteJsonLd'));
assert.match(faqFn, /'@type': 'FAQPage'/);
assert.match(faqFn, /name: x\.q/);
assert.match(faqFn, /text: x\.a/);
assert.match(faqFn, /if \(!items\.length\) return null/);
const ld = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: BUYER_OEM_FAQ.map((x) => ({
    '@type': 'Question',
    name: x.q,
    acceptedAnswer: { '@type': 'Answer', text: x.a },
  })),
};
assert.equal(ld.mainEntity.length, 6);
for (let i = 0; i < 6; i++) {
  assert.equal(ld.mainEntity[i].name, EXPECTED[i][0]);
  assert.equal(ld.mainEntity[i].acceptedAnswer.text, EXPECTED[i][1]);
}

const home = read('apps/web/src/pages/[...path].astro');
const oem = read('apps/web/src/pages/[lang]/oem/index.astro');
const block = read('packages/core/src/components/dtc/AnswerBlock.astro');
const widget = read('apps/web/src/components/BuyerOemFaq.astro');

assert.match(home, /site\?\.id === 'biosphere-ai' && !slug && lang === 'en'/);
assert.match(home, /faqJsonLd\(BUYER_OEM_FAQ\)/);
assert.match(home, /siteJsonLd\(/);
assert.match(home, /breadcrumbJsonLd\(/);
assert.match(home, /<BuyerOemFaq \/>/);
assert.match(home, /b\.type === 'fx_contact' && i === buyerFaqBefore/);
assert.match(oem, /if \(lang === 'en'\) T = \{ \.\.\.T, title: 'Guangzhou private label cosmetics OEM by market' \}/);
assert.match(oem, /OEM \/ private label cosmetics manufacturer by market and category/);
assert.match(oem, /Find a cosmetics contract manufacturer by target market and category/);
assert.match(oem, /'@type': 'BreadcrumbList'/);
assert.match(oem, /'@type': 'ItemList'/);
assert.match(oem, /lang === 'en' \? faqJsonLd\(BUYER_OEM_FAQ\)/);
assert.match(oem, /\{lang === 'en' && <div class="buyer-faq"><BuyerOemFaq \/><\/div>\}/);
assert.match(oem, /What usually blocks an order/);
assert.match(oem, /Brief to shipment/);
assert.ok(oem.indexOf('<BuyerOemFaq />') > oem.indexOf('What usually blocks an order'));
assert.ok(oem.indexOf('<BuyerOemFaq />') > oem.indexOf('Brief to shipment'));
assert.match(block, /<h2 class="q">\{question\}<\/h2>/);
assert.match(block, /<dt>\{f\.q\}<\/dt>/);
assert.match(block, /<dd>\{f\.a\}<\/dd>/);
assert.match(block, /href=\{l\.href\}/);
assert.match(widget, /<AnswerBlock/);
assert.equal(widget.includes('8613600050502'), false);
assert.equal(read('apps/web/src/lib/buyer-oem-faq.ts').includes('8613600050502'), false);

const wa = read('packages/core/src/content/wa-link.mjs');
assert.match(wa, /https:\/\/wa\.me\/\$\{wa\}\?text=/);

function layoutTitle(title, siteName) {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}
const full = layoutTitle(oemPageTitle('Guangzhou private label cosmetics OEM by market'), 'BIOSPHERE-AI');
assert.equal(full, 'Guangzhou private label cosmetics OEM by market | BIOSPHERE-AI');

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v155'/);

console.log('buyer-oem-faq ok');
