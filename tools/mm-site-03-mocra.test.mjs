// MM-SITE-03 A：US 七品类协助句 + services/oem 共用旁注。不建 /services/mocra-assistance/。
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
assert.equal(existsSync(new URL('../apps/web/src/pages/[lang]/services/mocra-assistance.astro', import.meta.url)), false);
assert.equal(existsSync(new URL('../apps/web/src/pages/[lang]/services/mocra-assistance', import.meta.url)), false);

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

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v135'/);

console.log('mm-site-03-mocra.test.mjs: US 七品类协助句与共用旁注通过');
