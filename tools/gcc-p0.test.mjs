// GCC 三件套 P0：Beautyworld 状态条、认证三列表、GHAD 边界。node tools/gcc-p0.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const {
  BEAUTYWORLD_SCHEDULE, CONNECT_DUBAI_SCHEDULE,
  gccFairCopy, gccFairPlain, gccFairRfqPath, isGccOemMarket,
} = await import(new URL('../apps/web/src/lib/gcc-fair-status.ts', import.meta.url));
const { certMatrixCopy, certMatrixPlain } = await import(new URL('../apps/web/src/lib/cert-matrix.ts', import.meta.url));
const { ghadBoundaryCopy, ghadBoundaryPlain } = await import(new URL('../apps/web/src/lib/ghad-boundary.ts', import.meta.url));

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
  /我方已\s*HALAL/i,
  /普草/,
  /\$\s?\d/,
  /USD\s?\d/i,
  /¥\s?\d/,
  /MOQ\s*\d/i,
  /起订\s*\d/,
  /SFDA\s*批准/,
  /SFDA[-\s]?approv/i,
  /包过/,
  /代通知/,
  /代开\s*GHAD\s*账户/i,
];

const STATUS_ZH = 'Beautyworld 2026 已落幕 · 2027-10-19～21 · Dubai Exhibition Centre · Expo City · 现接受询盘';
const CONNECT_ZH = 'Connect Dubai → 2027-04 · 现接受 MENA 询盘';

for (const lang of ['en', 'zh-cn', 'zh-tw', 'jp']) {
  const fair = gccFairCopy(lang);
  const fairBlob = gccFairPlain(fair).join('\n');
  assert.match(fairBlob, /2027-10-19/);
  assert.match(fairBlob, /Dubai Exhibition Centre/);
  assert.match(fairBlob, /Expo City/);
  assert.match(fairBlob, /Connect Dubai/);
  assert.match(fairBlob, /2027-04/);
  assert.match(fairBlob, /MENA/);
  assert.match(fair.identity, /展商|exhibitor/);
  for (const re of BANNED) assert.doesNotMatch(fairBlob, re, `fair ${lang} ${re}`);

  const matrix = certMatrixCopy(lang);
  const matrixBlob = certMatrixPlain(matrix).join('\n');
  assert.equal(matrix.rows.length, 5);
  assert.match(matrixBlob, /GMPC/);
  assert.match(matrixBlob, /ISO 22716/);
  assert.match(matrixBlob, /HALAL/);
  assert.match(matrixBlob, /FDA/);
  assert.match(matrixBlob, /CPNP/);
  assert.match(matrixBlob, /GHAD/);
  assert.match(matrixBlob, /不能代开 GHAD|cannot open a GHAD account/);
  for (const re of BANNED) assert.doesNotMatch(matrixBlob, re, `matrix ${lang} ${re}`);

  const ghad = ghadBoundaryCopy(lang);
  const ghadBlob = ghadBoundaryPlain(ghad).join('\n');
  assert.match(ghadBlob, /SA/);
  assert.match(ghadBlob, /GHAD/);
  assert.match(ghadBlob, /不能代开 GHAD|cannot open a GHAD account/);
  assert.match(ghadBlob, /文件包与资料清单|document pack and a checklist/);
  assert.match(ghadBlob, /不替代沙特境内的通知主体|does not replace the in-Kingdom notification entity/);
  for (const re of BANNED) assert.doesNotMatch(ghadBlob, re, `ghad ${lang} ${re}`);

  if (lang.startsWith('zh')) {
    assert.equal(fair.beautyworld, STATUS_ZH);
    assert.equal(fair.connect, CONNECT_ZH);
    assert.equal(matrix.colMarket, '市场');
    assert.equal(matrix.colItem, '认证或协助项（仅已持有/可协助）');
    assert.equal(matrix.colRfq, 'RFQ 必答');
  } else {
    assert.match(fair.beautyworld, /Beautyworld 2026 has closed/);
    assert.match(fair.beautyworld, /inquiries are open now/);
    assert.match(fair.connect, /MENA inquiries are open now/);
  }
}

assert.equal(gccFairRfqPath('en'), '/en/rfq/?target_market=GCC');
assert.equal(gccFairRfqPath('zh-cn'), '/zh-cn/rfq/?target_market=GCC');
assert.equal(gccFairRfqPath('ZH-CN'), '/zh-cn/rfq/?target_market=GCC');
assert.doesNotMatch(gccFairRfqPath('en'), /halal_ready/);
assert.doesNotMatch(gccFairRfqPath('zh-cn'), /halal_ready/);
assert.equal(BEAUTYWORLD_SCHEDULE, 'https://beautyworld-dubai.ae.messefrankfurt.com/dubai/en.html');
assert.match(CONNECT_DUBAI_SCHEDULE, /^https:\/\/www\.cosmoprof\.com\//);
assert.equal(isGccOemMarket('ae'), true);
assert.equal(isGccOemMarket('SA'), true);
assert.equal(isGccOemMarket('id'), false);

const sources = [
  'apps/web/src/lib/gcc-fair-status.ts',
  'apps/web/src/lib/cert-matrix.ts',
  'apps/web/src/lib/ghad-boundary.ts',
  'apps/web/src/components/GccFairStatus.astro',
  'apps/web/src/components/CertMatrix.astro',
  'apps/web/src/components/GhadBoundary.astro',
].map(read).join('\n');
for (const re of BANNED) assert.doesNotMatch(sources, re, String(re));
assert.match(sources, /beautyworld-dubai\.ae\.messefrankfurt\.com\/dubai\/en\.html/);
assert.match(sources, /target_market=GCC/);
assert.doesNotMatch(read('apps/web/src/lib/gcc-fair-status.ts'), /halal_ready/);
assert.doesNotMatch(read('apps/web/src/components/GccFairStatus.astro'), /halal_ready/);
assert.doesNotMatch(read('apps/web/src/components/CertMatrix.astro'), /<img/i);
assert.match(sources, /不能代开 GHAD/);
assert.doesNotMatch(sources, /代通知/);
assert.doesNotMatch(sources, /包过/);
assert.doesNotMatch(sources, /SFDA\s*批准/);

const fairMounted = [
  'apps/web/src/pages/[lang]/oem/index.astro',
  'apps/web/src/pages/[lang]/oem/[market]/[category].astro',
];
for (const file of fairMounted) {
  const src = read(file);
  assert.match(src, /<GccFairStatus/, file);
}
assert.match(read('apps/web/src/pages/[lang]/oem/[market]/[category].astro'), /isGccOemMarket\(M\.id\)/);
assert.match(read('apps/web/src/pages/[lang]/oem/[market]/[category].astro'), /M\.id === 'sa'/);
assert.match(read('apps/web/src/pages/[lang]/oem/[market]/[category].astro'), /<GhadBoundary/);

const matrixMounted = [
  'apps/web/src/pages/[lang]/oem/index.astro',
  'apps/web/src/pages/[lang]/oem/cert/[cert].astro',
  'apps/web/src/pages/[lang]/services/factory-quality.astro',
  'apps/web/src/pages/[lang]/services/index.astro',
  'apps/web/src/pages/[...path].astro',
];
for (const file of matrixMounted) {
  assert.match(read(file), /<CertMatrix/, file);
}
assert.match(read('apps/web/src/pages/[...path].astro'), /slug === 'quality'/);
assert.match(read('apps/web/src/pages/[lang]/rfq/index.astro'), /<GhadBoundary/);

const cache = read('apps/web/src/middleware.ts');
assert.match(cache, /CACHE_V = 'v128'/);

console.log('gcc-p0.test.mjs:全部通过');
