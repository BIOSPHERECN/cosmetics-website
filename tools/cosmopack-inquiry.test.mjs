// Cosmopack Asia 同期可询：文案红线、深链、挂载页。node tools/cosmopack-inquiry.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const {
  COSMOPACK_FAIR_INFO, COSMOPACK_VENUE,
  cosmopackCopy, cosmopackIsoPath, cosmopackPlain, cosmopackRfqPath,
} = await import(new URL('../apps/web/src/lib/cosmopack-inquiry.ts', import.meta.url));

const BANNED = [
  /\bbooth\b/i,
  /参展/,
  /展台/,
  /展位/,
  /join us at/i,
  /exhibiting/i,
  /we are at the show/i,
  /欢迎到展/,
  /halal[-\s]?certified/i,
  /已获清真/,
  /清真已证/,
  /普草/,
  /\$\s?\d/,
  /USD\s?\d/i,
  /¥\s?\d/,
  /MOQ\s*\d/i,
  /起订\s*\d/,
];

for (const lang of ['en', 'zh-cn', 'zh-tw', 'jp']) {
  const copy = cosmopackCopy(lang);
  const blob = cosmopackPlain(copy).join('\n');
  assert.match(blob, /11\/10/);
  assert.match(blob, /OEM\/ODM/);
  assert.match(blob, /COA/);
  assert.match(blob, /MSDS/);
  assert.match(blob, /ISO 22716/);
  for (const re of BANNED) assert.doesNotMatch(blob, re, `${lang} ${re}`);
  if (lang.startsWith('zh')) {
    assert.match(copy.title, /Cosmopack Asia 同期 · 私牌\/OEM 可询/);
    assert.ok(copy.cats.some((c) => c.includes('私牌')));
    assert.ok(copy.cats.some((c) => c.includes('供应链可询')));
  } else {
    assert.match(copy.title, /Concurrent inquiry during Cosmopack Asia/i);
    assert.ok(copy.cats.some((c) => /private label/i.test(c)));
    assert.ok(copy.cats.some((c) => /supply-chain inquiry/i.test(c)));
  }
}

assert.equal(cosmopackRfqPath('en'), '/en/rfq/?target_market=SEA&intent=cosmopack-asia-2026');
assert.equal(cosmopackRfqPath('zh-cn'), '/zh-cn/rfq/?target_market=SEA&intent=cosmopack-asia-2026');
assert.equal(cosmopackRfqPath('ZH-CN'), '/zh-cn/rfq/?target_market=SEA&intent=cosmopack-asia-2026');
assert.equal(cosmopackIsoPath('en'), '/en/oem/cert/iso-22716/');
assert.equal(cosmopackIsoPath('zh-cn'), '/zh-cn/oem/cert/iso-22716/');
assert.equal(COSMOPACK_FAIR_INFO, 'https://www.cosmoprof-asia.com/fair-info/');
assert.match(COSMOPACK_VENUE, /^https:\/\/www\.asiaworld-expo\.com\//);

const sources = [
  'apps/web/src/lib/cosmopack-inquiry.ts',
  'apps/web/src/components/CosmopackInquiry.astro',
].map(read).join('\n');
for (const re of BANNED) assert.doesNotMatch(sources, re, String(re));
assert.match(sources, /cosmoprof-asia\.com\/fair-info/);
assert.match(sources, /asiaworld-expo\.com/);
assert.match(sources, /target_market=SEA/);
assert.match(sources, /oem\/cert\/iso-22716/);

const mounted = [
  'apps/web/src/pages/[...path].astro',
  'apps/web/src/pages/[lang]/oem/index.astro',
  'apps/web/src/pages/[lang]/services/index.astro',
  'apps/web/src/pages/[lang]/services/factory-quality.astro',
  'apps/web/src/pages/[lang]/services/product-development.astro',
];
for (const file of mounted) {
  const src = read(file);
  assert.match(src, /<CosmopackInquiry/, file);
}

const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
assert.match(rfq, /rfqQueryPrefill\(\{ market: marketQ, target_market: targetQ \}\)/);
assert.match(rfq, /name="market"[^>]*value=\{marketQ\}/);
assert.doesNotMatch(rfq, /value=\{targetQ\}/);

const cache = read('apps/web/src/middleware.ts');
assert.match(cache, /CACHE_V = 'v146'/);

console.log('cosmopack-inquiry.test.mjs:全部通过');
