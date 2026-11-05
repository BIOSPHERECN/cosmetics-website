// MM-SITE-03：US 七品类协助句 + MoCRA 协助独立落地页。
// node tools/mm-site-03-mocra.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const { OEM_CATEGORIES } = await import(new URL('../packages/core/src/content/oem.ts', import.meta.url));
const { certWallCopy, softenClaims } = await import(new URL('../apps/web/src/lib/comply-copy.ts', import.meta.url));
const { certMatrixCopy } = await import(new URL('../apps/web/src/lib/cert-matrix.ts', import.meta.url));

const EN = 'We can assist with U.S. facility registration and product listing paperwork under MoCRA; we do not guarantee FDA outcomes or "approved" status.';
const en = certWallCopy(false);
const zh = certWallCopy(true);

assert.equal(en.mocra, EN);
assert.equal(en.lede.includes(EN), true);
assert.match(en.lede, /product listing/);
assert.match(en.fda, /product listing assistance under MoCRA/i);
assert.match(en.fda, /not a factory certification/i);
assert.match(en.fda, /registration is not approval/i);

assert.match(zh.mocra, /备案/);
assert.match(zh.mocra, /上市资料/);
assert.match(zh.mocra, /产品列名/);
assert.match(zh.mocra, /MoCRA/);
assert.equal(zh.lede.includes(zh.mocra), true);
assert.match(zh.fda, /产品列名/);
assert.match(zh.fda, /备案/);
assert.match(zh.fda, /上市资料/);
for (const text of [zh.mocra, zh.lede, zh.fda, en.mocra, en.lede]) {
  assert.doesNotMatch(text, /FDA\s*批准/);
  assert.doesNotMatch(text, /FDA\s*认证/);
  assert.doesNotMatch(text, /FDA[\s-]+approved/i);
  assert.doesNotMatch(text, /FDA[\s-]+certified/i);
  assert.doesNotMatch(text, /FDA[\s-]+registered\s+product/i);
}

assert.deepEqual(OEM_CATEGORIES.map((c) => c.id), [
  'skincare', 'body-care', 'hair-care', 'cleansing', 'sun-care', 'makeup', 'oral-care',
]);

const cat = read('apps/web/src/pages/[lang]/oem/[market]/[category].astro');
assert.match(cat, /M\.id === 'us' \? certWallCopy\(zh\)\.mocra/);
assert.match(cat, /class="mocra"/);
assert.match(cat, /mocraDetail && <a class="more" href=\{mocraPagePath\(lang\)\}/);
assert.match(cat, /MOCRA_DETAIL_CATS/);

for (const file of [
  'apps/web/src/pages/[lang]/services/index.astro',
  'apps/web/src/pages/[lang]/oem/index.astro',
  'apps/web/src/pages/[lang]/services/product-development.astro',
  'apps/web/src/pages/[lang]/services/factory-quality.astro',
]) {
  const src = read(file);
  assert.match(src, /certWallCopy\(zh\)\.lede/, file);
  assert.doesNotMatch(src, /FDA[\s-]+approved|FDA[\s-]+certified|FDA[\s-]+registered\s+product/i, file);
}

const usEn = certMatrixCopy('en').rows.find((r) => r.market === 'United States');
const usZh = certMatrixCopy('zh-cn').rows.find((r) => r.market === '美国');
assert.equal(usEn.item.includes(EN), true);
assert.equal(usZh.item.includes(zh.mocra), true);
assert.equal(usEn.rfq, 'Whether FDA facility-registration assist is needed.');
assert.equal(usZh.rfq, '是否需要 FDA 设施注册协助。');

const assist = softenClaims(EN);
assert.equal(assist, EN);
assert.equal(softenClaims('This serum is FDA approved'), 'This serum is filing assist');
assert.equal(softenClaims('FDA certified cream'), 'filing assist cream');
assert.equal(softenClaims('FDA registered product'), 'product listing assist');
assert.equal(softenClaims('FDA-registered product'), 'product listing assist');
assert.equal(softenClaims('Is the factory FDA-registered?'), 'Is the factory FDA-registered?');

const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
for (const key of ['name="market"', 'name="category"', 'name="volume"', 'name="target_market"', 'name="halal_ready"', 'name="notification_assist_country"', 'name="first_order_band"']) {
  assert.match(rfq, new RegExp(key), key);
}
assert.doesNotMatch(rfq, /mocra/i);

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v143'/);

const {
  MOCRA_BOUNDARY_EN, MOCRA_DETAIL_CATS, MOCRA_DETAIL_LINK, MOCRA_SITEMAP_LANGS, MOCRA_SLUG,
  mocraCopy, mocraCopyProblems, mocraPagePath, mocraRfqPath, mocraStructuredData, mocraUsCategoryPath,
} = await import(new URL('../apps/web/src/lib/mocra-assistance.ts', import.meta.url));
const { canonical } = await import(new URL('../apps/web/src/lib/canon.ts', import.meta.url));

assert.deepEqual([...MOCRA_DETAIL_CATS], ['skincare', 'sun-care']);
assert.equal(MOCRA_DETAIL_LINK.zh, '详见 MoCRA assistance');
assert.equal(MOCRA_DETAIL_LINK.en, 'See MoCRA assistance');
assert.equal(mocraPagePath('en'), '/en/services/mocra-assistance/');
assert.equal(mocraPagePath('zh-cn'), '/zh-cn/services/mocra-assistance/');
assert.equal(mocraUsCategoryPath('en'), '/en/oem/us/skincare/');
assert.equal(mocraUsCategoryPath('zh-cn', 'sun-care'), '/zh-cn/oem/us/sun-care/');
/* US 不在通告国枚举里，这个参数会被规范成空并 301。落地页改走能留下的 market=US。 */
assert.equal(canonical('/en/rfq/', '?notification_assist_country=US'), '/en/rfq/');
assert.equal(canonical('/en/rfq/', '?market=US'), null);
assert.equal(mocraRfqPath('en'), '/en/rfq/?market=US');
assert.equal(mocraRfqPath('zh-cn'), '/zh-cn/rfq/?market=US');

const page = read('apps/web/src/pages/[lang]/services/mocra-assistance.astro');
assert.equal(existsSync(new URL('../apps/web/src/pages/[lang]/services/mocra-assistance.astro', import.meta.url)), true);
assert.doesNotMatch(page, /Astro\.redirect/);
assert.match(page, /path = `\$\{B\}\/services\/mocra-assistance\/`/);
assert.match(page, /mocraStructuredData/);
assert.match(page, /copy\.faq\.map/);
assert.match(page, /copy\.boundary/);
assert.match(page, /mocraRfqPath/);
assert.doesNotMatch(page, /GhadBoundary|过敏原|allergen|普草|offers/i);

for (const lang of ['en', 'zh-cn', 'fr']) {
  const copy = mocraCopy(lang);
  assert.deepEqual(mocraCopyProblems(copy), [], lang);
  assert.equal(copy.boundaryEn, MOCRA_BOUNDARY_EN);
  assert.equal(copy.doItems.length, 3);
  assert.equal(copy.dontItems.length, 3);
  assert.ok(copy.links.some((l) => l.tail === 'services/factory-quality/'));
  assert.ok(copy.links.some((l) => l.tail === 'services/product-development/'));
  assert.ok(copy.links.some((l) => l.tail.startsWith('oem/us/')));
  const ld = mocraStructuredData({
    lang, origin: 'https://biosphere-ai.com', path: mocraPagePath(lang), siteName: 'BIOSPHERE-AI',
  });
  const raw = JSON.stringify(ld);
  assert.equal(raw.includes('"@type":"Product"'), false, lang);
  assert.equal(raw.includes('"offers"'), false, lang);
  const faqLd = ld.find((b) => b['@type'] === 'FAQPage');
  assert.deepEqual(
    faqLd.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]),
    copy.faq.map(([q, a]) => [q, a]),
  );
  const crumbs = ld.find((b) => b['@type'] === 'BreadcrumbList').itemListElement;
  assert.deepEqual(crumbs.map((c) => c.name), [copy.homeLabel, copy.servicesLabel, copy.crumb]);
  assert.equal(crumbs[2].item, `https://biosphere-ai.com${mocraPagePath(lang)}`);
  const service = ld.find((b) => b['@type'] === 'Service');
  assert.match(service.name, /assistance|协助/);
  assert.doesNotMatch(service.name, /approved/i);
}

const enPage = mocraCopy('en');
const zhPage = mocraCopy('zh-cn');
assert.equal(enPage.h1, 'MoCRA assistance for U.S. cosmetic OEM / private label');
assert.equal(zhPage.h1, 'MoCRA / 美国上市资料协助');
assert.equal(enPage.boundary, MOCRA_BOUNDARY_EN);
assert.ok(enPage.leadText.includes('facility registration'));
assert.ok(enPage.leadText.includes('product listing'));
assert.ok(enPage.leadText.includes('assistance'));
assert.ok(zhPage.leadText.includes('设施注册'));
assert.ok(zhPage.leadText.includes('产品列名'));
assert.ok(zhPage.leadText.includes('协助'));
assert.ok(enPage.title.length >= 50 && enPage.title.length <= 65, String(enPage.title.length));
assert.ok([...zhPage.title].length >= 24 && [...zhPage.title].length <= 36, String([...zhPage.title].length));
assert.match(enPage.description, /MoCRA/);
assert.match(enPage.description, /assistance/);
assert.match(zhPage.description, /MoCRA/);
assert.match(zhPage.description, /协助/);
assert.equal(zhPage.boundaryEn !== zhPage.boundary, true);

assert.deepEqual([...MOCRA_SITEMAP_LANGS], ['en', 'zh-cn']);
assert.equal(MOCRA_SLUG, 'services/mocra-assistance/');
const sitemap = read('apps/web/src/pages/sitemap.xml.ts');
assert.match(sitemap, /push\(MOCRA_SLUG, '0\.8', undefined, MOCRA_SITEMAP_LANGS\)/);
assert.match(sitemap, /hreflang="x-default"/);

console.log('mm-site-03-mocra.test.mjs: 协助句、落地页与 v139 通过');
