// 爆品卡：slug、RFQ 深链预填、价带与禁词、第二波修正后 JSON-LD。node tools/wave-products.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const {
  WAVE_CARDS,
  WAVE_SLUGS,
  productPageFaqs,
  waveBySlug,
  waveCopy,
  waveCorrectedProductLd,
  waveFormPrefill,
  waveMarketFaqs,
  wavePublicText,
  waveRfqPath,
} = await import(new URL('../apps/web/src/lib/wave-products.ts', import.meta.url));
const { canonical, keyParams } = await import(new URL('../apps/web/src/lib/canon.ts', import.meta.url));

const EMPTY = {
  target_market: [],
  notification_assist_country: [],
  halal_ready: '',
  first_order_band: '',
  need_msds_coa: '',
};

assert.deepEqual([...WAVE_SLUGS], [
  'spf50-acne-gel-id',
  'serum-spf50-my',
  'zerocast-spf50-ae',
  'niacinamide-txa-serum-sa',
  'peptide-barrier-serum-eu',
]);
assert.equal(WAVE_CARDS.length, 5);
assert.equal(waveBySlug('TH-spray'), null);
assert.equal(waveBySlug('spf-stick-eu'), null);
assert.equal(WAVE_SLUGS.includes('spf-stick-eu'), false);
assert.doesNotMatch(read('apps/web/src/lib/wave-products.ts'), /spf-stick-eu/);
assert.equal(WAVE_CARDS.some((c) => /spray|喷雾|thailand|\bth\b/i.test(c.slug)), false);

const expectRfq = {
  'spf50-acne-gel-id': { target_market: 'SEA', halal_ready: 'yes', notification_assist_country: 'ID', need_msds_coa: '', category: 'suncare' },
  'serum-spf50-my': { target_market: 'SEA', halal_ready: 'yes', notification_assist_country: 'MY', need_msds_coa: '', category: 'suncare' },
  'zerocast-spf50-ae': { target_market: 'GCC', halal_ready: 'unsure', notification_assist_country: 'AE', need_msds_coa: 'yes', category: 'suncare' },
  'niacinamide-txa-serum-sa': { target_market: 'GCC', halal_ready: 'unsure', notification_assist_country: 'SA', need_msds_coa: '', category: 'serum' },
  'peptide-barrier-serum-eu': { target_market: 'EU', halal_ready: 'no', notification_assist_country: 'EU', need_msds_coa: '', category: 'serum' },
};

const BANNED = [
  /treat\s+acne/i,
  /cure\s+acne/i,
  /acne\s+treatment/i,
  /\bwhitening\b/i,
  /美白/,
  /祛痘/,
  /治疗/,
  /治愈/,
  /medical\s+grade/i,
  /医用/,
  /halal[-\s]?certified/i,
  /已获清真/,
  /清真已证/,
  /我方已\s*HALAL/i,
  /SFDA\s*批准/,
  /SFDA[-\s]?approv/i,
  /包过/,
  /普草/,
  /喷雾/,
  /\bbooth\b/i,
  /参展/,
  /展位/,
  /SPF\s*\d/i,
  /SPF\d/i,
  /PA\+{2,}/,
  /防晒指数?\s*\d/,
];

for (const card of WAVE_CARDS) {
  const blob = wavePublicText(card);
  for (const re of BANNED) assert.doesNotMatch(blob, re, `${card.slug} ${re}`);
  assert.match(blob, /不是报价/);
  assert.match(blob, /not a quote/i);
  assert.match(blob, /texture/);
  assert.match(blob, /pack/);
  assert.match(blob, /moq_note/);
  assert.doesNotMatch(blob, /自动报价/);
  assert.equal(card.rfq.first_order_band, 'tbd');
  const want = expectRfq[card.slug];
  if (want.category === 'suncare') {
    assert.match(blob, /spf_pa/);
    assert.match(blob, /lead_time_window_note/);
  } else {
    assert.equal(card.ld, 'corrected');
    assert.doesNotMatch(blob, /spf_pa/);
    assert.doesNotMatch(blob, /lead_time_window_note/);
    assert.doesNotMatch(blob, /\d+\s*%/);
    assert.doesNotMatch(blob, /\b(?:SAR|EUR|USD|AED|MYR|IDR)\b/);
  }

  const filled = waveFormPrefill(card.slug, EMPTY);
  assert.deepEqual(filled.target_market, [want.target_market]);
  assert.deepEqual(filled.notification_assist_country, [want.notification_assist_country]);
  assert.equal(filled.halal_ready, want.halal_ready);
  assert.equal(filled.first_order_band, 'tbd');
  assert.equal(filled.need_msds_coa, want.need_msds_coa);

  for (const lang of ['en', 'zh-cn']) {
    const href = waveRfqPath(lang, card.slug, 'inquiry');
    const u = new URL(href, 'https://biosphere-ai.com');
    assert.equal(u.pathname, `/${lang}/rfq/`);
    assert.equal(u.searchParams.get('product_id'), card.slug);
    assert.equal(u.searchParams.get('target_market'), want.target_market);
    assert.equal(u.searchParams.get('halal_ready'), want.halal_ready);
    assert.equal(u.searchParams.get('notification_assist_country'), want.notification_assist_country);
    assert.equal(u.searchParams.get('first_order_band'), 'tbd');
    assert.equal(u.searchParams.get('category'), want.category);
    assert.ok(u.searchParams.get('about'));
    assert.equal(u.searchParams.get('spf_pa'), null, '深链不挂防晒数字');
    if (want.need_msds_coa) assert.equal(u.searchParams.get('need_msds_coa'), 'yes');
    else assert.equal(u.searchParams.get('need_msds_coa'), null);
    assert.equal(canonical(u.pathname, u.search), null, href);
    const copy = waveCopy(card, lang);
    assert.ok(copy.summary.length > 40);
    assert.ok(copy.description.length > 80);
    assert.ok(copy.specs.some((s) => s.label === 'pack' && s.value));
    assert.ok(copy.specs.some((s) => s.label === 'moq_note' && s.value));
    if (want.category === 'suncare') {
      assert.ok(copy.specs.some((s) => s.label === 'spf_pa' && s.value && !/\d/.test(s.value)));
    } else {
      assert.equal(copy.specs.some((s) => s.label === 'spf_pa'), false);
      assert.ok(copy.specs.some((s) => s.label === 'lead' && s.value));
      assert.ok(copy.specs.some((s) => s.label === 'target_market' && s.value === want.target_market));
    }
  }
}

assert.match(wavePublicText(waveBySlug('spf50-acne-gel-id')), /IDR 25k–50k/);
assert.match(wavePublicText(waveBySlug('spf50-acne-gel-id')), /texture/);
assert.equal(waveCopy(waveBySlug('spf50-acne-gel-id'), 'en').specs.find((s) => s.label === 'texture').value, 'gel');
assert.equal(waveCopy(waveBySlug('spf50-acne-gel-id'), 'zh-cn').specs.find((s) => s.label === 'skin_type').value, 'oily/acne-prone');
assert.equal(waveCopy(waveBySlug('serum-spf50-my'), 'en').specs.find((s) => s.label === 'texture').value, 'serum');
assert.match(waveCopy(waveBySlug('serum-spf50-my'), 'en').specs.find((s) => s.label === 'claim').value, /brightening-oriented/);
assert.match(wavePublicText(waveBySlug('serum-spf50-my')), /MYR 15–40/);
assert.equal(waveCopy(waveBySlug('zerocast-spf50-ae'), 'en').specs.find((s) => s.label === 'texture').value, 'fluid/gel');
assert.equal(waveCopy(waveBySlug('zerocast-spf50-ae'), 'en').specs.find((s) => s.label === 'skin_type').value, 'sensitive');
assert.ok(waveCopy(waveBySlug('zerocast-spf50-ae'), 'zh-cn').specs.some((s) => s.label === 'label_ar_assist'));
assert.match(wavePublicText(waveBySlug('zerocast-spf50-ae')), /AED 20–70/);

const sa = waveBySlug('niacinamide-txa-serum-sa');
const eu = waveBySlug('peptide-barrier-serum-eu');
assert.equal(waveCopy(sa, 'zh-cn').name, '烟酰胺+传明酸提亮水感精华（沙特）');
assert.equal(waveCopy(sa, 'en').name, 'Niacinamide + TXA brightening serum (KSA)');
assert.equal(waveCopy(eu, 'zh-cn').name, '多肽屏障修护精华（欧盟）');
assert.equal(waveCopy(eu, 'en').name, 'Peptide barrier serum (EU)');
assert.match(waveCopy(sa, 'en').specs.find((s) => s.label === 'pack').value, /dropper\/pump 30–50mL/);
assert.match(waveCopy(sa, 'zh-cn').specs.find((s) => s.label === 'pack').value, /滴管或泵头 30–50mL/);
assert.match(waveCopy(eu, 'en').specs.find((s) => s.label === 'pack').value, /airless 30–50mL/);
assert.match(waveCopy(eu, 'zh-cn').specs.find((s) => s.label === 'pack').value, /真空瓶 30–50mL/);
assert.match(wavePublicText(sa), /process评估 not certification/);
assert.match(wavePublicText(sa), /SFDA 资料协助≠批准/);
assert.match(waveCopy(sa, 'en').specs.find((s) => s.label === 'claim').value, /brightening-oriented/);
assert.match(waveCopy(sa, 'en').specs.find((s) => s.label === 'claim').value, /even-tone look/);
assert.match(wavePublicText(eu), /CPNP assist/);
assert.match(wavePublicText(eu), /RP by customer/);
assert.match(wavePublicText(eu), /Bohui not RP/);
assert.match(wavePublicText(eu), /MSDS/);
assert.match(wavePublicText(eu), /COA/);
assert.match(wavePublicText(eu), /PIF/);
assert.match(wavePublicText(eu), /帛卉不担任欧盟责任人/);
assert.doesNotMatch(wavePublicText(eu), /帛卉担任欧盟责任人/);
assert.equal(sa.source, '');
assert.equal(eu.source, '');
assert.equal(existsSync(new URL(`../apps/web/public${sa.image}`, import.meta.url)), true);

for (const card of [sa, eu]) {
  for (const lang of ['en', 'zh-cn']) {
    const copy = waveCopy(card, lang);
    const origin = 'https://biosphere-ai.com';
    const path = `/${lang}/product/${card.slug}/`;
    const ld = waveCorrectedProductLd({
      origin,
      path,
      name: copy.name,
      description: copy.description,
      category: lang === 'zh-cn' ? '精华' : 'Serums',
      sku: card.slug,
      image: card.image,
      specs: copy.specs,
    });
    assert.equal(ld['@type'], 'Product');
    assert.equal(ld['@id'], `${origin}${path}#product`);
    assert.equal(ld.url, `${origin}${path}`);
    assert.equal(Object.hasOwn(ld, 'offers'), false);
    const raw = JSON.stringify(ld);
    assert.doesNotMatch(raw, /InStock/);
    assert.doesNotMatch(raw, /"offers"/);
    assert.equal(ld.image, `${origin}${card.image}`);
    const names = ld.additionalProperty.map((p) => p.name);
    for (const key of ['texture', 'pack', 'moq_note', 'lead', 'target_market']) {
      assert.ok(names.includes(key), `${card.slug} ${lang} ${key}`);
    }
    const joined = ld.additionalProperty.map((p) => `${p.name}=${p.value}`).join('\n');
    if (card.slug === 'niacinamide-txa-serum-sa') {
      assert.match(joined, /process评估 not certification/);
      assert.match(joined, /SFDA 资料协助≠批准/);
      assert.equal(ld.additionalProperty.find((p) => p.name === 'target_market').value, 'GCC');
    } else {
      assert.match(joined, /CPNP assist/);
      assert.match(joined, /RP by customer/);
      assert.match(joined, /Bohui not RP/);
      assert.equal(ld.additionalProperty.find((p) => p.name === 'target_market').value, 'EU');
    }
    const market = waveMarketFaqs(card, lang);
    assert.equal(market.length, 2);
    const faqs = productPageFaqs({
      zh: lang === 'zh-cn',
      name: copy.name,
      certAnswer: copy.certAnswer,
      market,
    });
    assert.equal(faqs.length, 7);
    assert.deepEqual(faqs.slice(5), market);
    if (card.slug === 'niacinamide-txa-serum-sa') {
      assert.match(market.map((f) => f.a).join('\n'), /SFDA 资料协助≠批准/);
      assert.match(market.map((f) => f.a).join('\n'), /process评估 not certification/);
    } else {
      assert.match(market.map((f) => f.a).join('\n'), /CPNP assist/);
      assert.match(market.map((f) => f.a).join('\n'), /Bohui not RP/);
      assert.match(market.map((f) => f.q + f.a).join('\n'), /MSDS/);
      assert.match(market.map((f) => f.a).join('\n'), /COA/);
      assert.match(market.map((f) => f.a).join('\n'), /PIF/);
    }
  }
}
assert.equal(productPageFaqs({
  zh: false,
  name: 'Oil-control gel sunscreen (Indonesia)',
  certAnswer: waveCopy(waveBySlug('spf50-acne-gel-id'), 'en').certAnswer,
  market: waveMarketFaqs(waveBySlug('spf50-acne-gel-id'), 'en'),
}).length, 5);

const overridden = waveFormPrefill('spf50-acne-gel-id', { ...EMPTY, halal_ready: 'no', target_market: ['GCC'] });
assert.equal(overridden.halal_ready, 'no');
assert.deepEqual(overridden.target_market, ['GCC']);

const page = read('apps/web/src/pages/[lang]/product/[pslug].astro');
assert.match(page, /if \(waveCard\) return waveRfqPath/);
assert.match(page, /waveView\.specs/);
assert.match(page, /productPageFaqs\(/);
assert.match(page, /waveMarketFaqs\(waveCard, lang\)/);
assert.match(page, /faqJsonLd\(faqs\)/);
assert.match(page, /faqs\.map\(\(f\)/);
assert.match(page, /breadcrumbJsonLd\(/);
assert.match(page, /waveCard\?\.ld === 'corrected'/);
assert.match(page, /waveCorrectedProductLd\(/);
assert.match(page, /legacyProductLd/);
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
assert.match(rfq, /waveFormPrefill/);
assert.match(rfq, /checked=\{prefill\.halal_ready === 'yes'\}/);
assert.match(rfq, /selected=\{prefill\.first_order_band === id\}/);
assert.match(rfq, /checked=\{prefill\.need_msds_coa === 'yes'\}/);
assert.match(rfq, /product_id: productId/);
assert.match(rfq, /waveSummary/);
assert.doesNotMatch(rfq, /halal certified/i);
const middleware = read('apps/web/src/middleware.ts');
assert.match(middleware, /const CACHE_V = 'v130'/);
assert.doesNotMatch(read('apps/web/src/lib/gcc-fair-status.ts'), /wave-products/);
assert.doesNotMatch(read('apps/web/src/lib/cosmopack-inquiry.ts'), /wave-products/);
assert.doesNotMatch(read('apps/web/src/lib/cert-matrix.ts'), /wave-products/);
assert.doesNotMatch(read('apps/web/src/lib/ghad-boundary.ts'), /wave-products/);

const sample = new URL(waveRfqPath('en', 'spf50-acne-gel-id'), 'https://biosphere-ai.com');
assert.deepEqual(keyParams(sample.pathname, sample.searchParams).map(([k]) => k).sort(), [
  'about', 'category', 'first_order_band', 'halal_ready', 'notification_assist_country', 'product_id', 'skin_type', 'target_market', 'texture',
]);

console.log('wave-products.test.mjs:全部通过');
