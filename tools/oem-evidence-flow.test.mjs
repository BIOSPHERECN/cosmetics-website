// 莱诺鸟 P0-6：证据四段壳 + oem-evidence 主 CTA。node tools/oem-evidence-flow.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  oemEvidenceCertLabel,
  oemEvidenceCertPath,
  oemEvidenceRfqPath,
} from '../apps/web/src/lib/oem-evidence.ts';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const flow = read('apps/web/src/components/EvidenceFlow.astro');
const fq = read('apps/web/src/pages/[lang]/services/factory-quality.astro');
const pd = read('apps/web/src/pages/[lang]/services/product-development.astro');
const oem = read('apps/web/src/pages/[lang]/oem/index.astro');
const tokens = read('packages/core/src/styles/tokens.css');

const space = tokens.match(/--bio-space:\s*(\d+)px/);
assert.ok(space, '缺 --bio-space');
const spacePx = Number(space[1]);
assert.ok(spacePx >= 48 && spacePx <= 64, `四段上边距 ${spacePx}px 不在 48–64`);

const order = ['class="ev-evidence"', 'class="ev-pains"', 'class="ev-steps"', 'class="ev-cta"'];
let at = -1;
for (const cls of order) {
  const i = flow.indexOf(cls);
  assert.ok(i > at, `四段顺序坏了: ${cls}`);
  at = i;
}
assert.match(flow, /id="certs"/);
assert.equal((flow.match(/class="ev-btn"/g) || []).length, 1, '实心主 CTA 只能有一颗');
assert.ok((flow.match(/class="ev-btn ghost"/g) || []).length >= 1);
assert.match(flow, /\.oem-evidence-flow > \.ev-evidence,\s*\.oem-evidence-flow > \.ev-pains,\s*\.oem-evidence-flow > \.ev-steps,\s*\.oem-evidence-flow > \.ev-cta\s*\{[^}]*margin-top:\s*var\(--bio-space\)/);
assert.match(fq, /\.sq > \.oem-evidence-flow \{ margin-top: 0/);
assert.match(pd, /\.sq > \.oem-evidence-flow \{ margin-top: 0/);
assert.match(oem, /oem-evidence-flow\{margin-top:0\}/);
assert.match(flow, /background:\s*var\(--bio-primary\)/);
assert.match(flow, /var\(--bio-radius\)/);
assert.match(flow, /var\(--bio-fg\)/);
assert.match(flow, /#f6f5f2/);
assert.match(flow, /min-height:\s*44px/);
assert.match(flow, /\.ev-btn\.ghost\s*\{[^}]*background:\s*transparent/);
assert.match(flow, /oemEvidenceRfqPath/);
assert.match(flow, /oemEvidenceCertPath/);
assert.doesNotMatch(flow, /product_id/);
assert.doesNotMatch(flow, /www\./);
assert.doesNotMatch(flow, /--ck-/);
assert.doesNotMatch(flow, /<img\b/i);
assert.doesNotMatch(flow, /https?:\/\//);

for (const lang of ['en', 'zh-cn']) {
  const href = oemEvidenceRfqPath(lang);
  assert.equal(href, `/${lang}/rfq/?intent=oem-evidence`);
  const u = new URL(href, 'https://biosphere-ai.com');
  assert.equal(u.pathname, `/${lang}/rfq/`);
  assert.equal(u.searchParams.get('intent'), 'oem-evidence');
  assert.equal(u.searchParams.get('product_id'), null);
  assert.deepEqual([...u.searchParams.keys()], ['intent']);
  assert.doesNotMatch(href, /^https?:/);
  assert.doesNotMatch(href, /www/);
  for (const id of ['gmpc', 'iso-22716', 'halal']) {
    assert.equal(oemEvidenceCertPath(lang, id), `/${lang}/oem/cert/${id}/`);
  }
}
assert.equal(oemEvidenceCertPath('en', 'fda'), '/en/oem/');
assert.equal(oemEvidenceCertPath('ZH-CN', 'iso-22716'), '/zh-cn/oem/cert/iso-22716/');
assert.equal(oemEvidenceCertLabel('iso-22716', 'ISO 22716'), 'ISO 22716:2007');
assert.equal(oemEvidenceCertLabel('gmpc', 'GMPC'), 'GMPC');
assert.equal(oemEvidenceCertLabel('halal', 'HALAL'), 'HALAL');
assert.equal(oemEvidenceRfqPath(''), '/en/rfq/?intent=oem-evidence');

const pages = [
  ['factory-quality', fq],
  ['product-development', pd],
  ['oem', oem],
];
for (const [name, src] of pages) {
  assert.equal((src.match(/<EvidenceFlow\b/g) || []).length, 1, name);
  assert.match(src, /<\/header>\s*<EvidenceFlow/, name);
  const flowAt = src.indexOf('<EvidenceFlow');
  const endAt = src.indexOf('</EvidenceFlow>') >= 0 ? src.indexOf('</EvidenceFlow>') : src.indexOf('<EvidenceFlow');
  const cpkAt = src.indexOf('<CosmopackInquiry');
  assert.ok(cpkAt > flowAt && cpkAt > endAt, `${name} Cosmopack 必须在四段之后`);
  assert.match(src, /<CosmopackInquiry ctaGhost/, name);
  assert.match(src, /OEM_CERTS/, name);
  assert.doesNotMatch(src, /product_id/, name);
  assert.doesNotMatch(src, /https?:\/\/www\./, name);
  assert.doesNotMatch(src, /<img\b/i, name);
  assert.doesNotMatch(src, /Halal certified/i, name);
  assert.doesNotMatch(src, /FDA approved/i, name);
  assert.doesNotMatch(src, /CPNP certified/i, name);
  assert.doesNotMatch(src, /普草/, name);
  assert.doesNotMatch(src, /低\s*MOQ/, name);
  assert.doesNotMatch(src, /No MOQ/i, name);
  assert.equal(/low\s*MOQ/i.test(src.replace(/unapproved low MOQ/gi, '')), false, name);
  assert.doesNotMatch(src, /class="btn"/, name);
  assert.doesNotMatch(src, /class="evidence"/, name);
  assert.doesNotMatch(src, /--ck-accent/, name);
  assert.match(src, /ISO 22716:2007/, name);
  assert.match(src, /GMPC/, name);
  assert.match(src, /HALAL/, name);
}

assert.match(oem, /services\/factory-quality\//);
assert.match(oem, /<GccFairStatus ctaGhost/);
assert.match(fq, /<CertMatrix/);
assert.match(oem, /<CertMatrix/);
assert.ok(fq.indexOf('class="faq"') > fq.indexOf('</EvidenceFlow>'));
assert.ok(pd.indexOf('class="faq"') > pd.indexOf('<EvidenceFlow'));
assert.ok(fq.indexOf('class="proof"') > fq.indexOf('<CosmopackInquiry'));
assert.ok(pd.indexOf('class="proof"') > pd.indexOf('<CosmopackInquiry'));
assert.doesNotMatch(read('apps/web/src/pages/[...path].astro'), /ctaGhost/);
assert.doesNotMatch(read('apps/web/src/pages/[lang]/services/index.astro'), /ctaGhost/);

const strip = read('apps/web/src/components/BioTrustStrip.astro');
const card = read('apps/web/src/components/PortfolioCard.astro');
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
assert.match(strip, /class="bio-trust-strip"/);
assert.match(card, /pf-aspect-1x1/);
assert.match(card, /product_id=/);
assert.match(rfq, /name="target_market"/);
assert.match(rfq, /name="halal_ready"/);
assert.match(rfq, /name="notification_assist_country"/);
assert.match(rfq, /name="first_order_band"/);
assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v137'/);

console.log('oem-evidence-flow.test.mjs:全部通过');
