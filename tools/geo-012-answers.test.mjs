// GEO-012: 买手问答 Article 补齐 datePublished、publisher @id、image。
// node tools/geo-012-answers.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const { answerArticleJsonLd, answerIso8601, DEFAULT_OG_PATH } = await import(
  new URL('apps/web/src/lib/answer-article.ts', root)
);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const ORG = 'https://biosphere-ai.com/#organization';

function orgEntities(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) orgEntities(item, acc);
    return acc;
  }
  if (node['@type'] === 'Organization') acc.push(node);
  for (const value of Object.values(node)) orgEntities(value, acc);
  return acc;
}

/* 页上「Updated」用的是 updated_at 的日期前缀。schema 不挪时钟，所以日历日相同。 */
assert.equal(answerIso8601('2026-09-16 10:03:04'), '2026-09-16T10:03:04+08:00');
assert.equal(answerIso8601('2026-09-16T10:03:04+08:00'), '2026-09-16T10:03:04+08:00');
assert.equal(answerIso8601('2026-09-16 02:03:04Z'), '2026-09-16T02:03:04Z');
assert.equal(answerIso8601('2026-09-16'), '2026-09-16T00:00:00+08:00');
assert.equal(answerIso8601(''), '');

const samples = [
  ['halal-cosmetics', '2026-09-16 10:03:04', 'Is HALAL required for cosmetics exported to Indonesia?'],
  ['us-mocra', '2026-09-16 02:03:04', 'What does MoCRA require of a US cosmetics responsible person?'],
  ['eu-cpnp-cpsr', '2026-09-18 08:11:00', 'What is filed in CPNP, and who signs the CPSR?'],
  ['stability-how-long', '2026-09-16T10:03:04+08:00', 'How long is a stability test for a new formula?'],
  ['china-filing', '2026-10-01 00:00:00', 'How is a general cosmetic filed in China?'],
  ['moq-lead-skincare', '2026-10-02 12:30:45', 'How are MOQ and lead time set for skincare OEM?'],
  ['moq-lead-body', '2026-09-20', 'How are MOQ and lead time set for body care OEM?'],
  ['notify-id', '2026-09-21 09:15:00', 'How is a cosmetic notified in Indonesia?'],
  ['notify-my', '2026-09-22 11:00:00', 'How is a cosmetic notified in Malaysia?'],
  ['notify-th', '2026-09-23 16:45:30', 'How is a cosmetic notified in Thailand?'],
  ['notify-vn', '2026-09-24 07:00:01', 'How is a cosmetic notified in Vietnam?'],
  ['notify-ph', '2026-09-25 18:20:00', 'How is a cosmetic notified in the Philippines?'],
];

assert.ok(samples.length >= 10);

for (const [slug, updatedAt, headline] of samples) {
  const path = `/en/answers/${slug}/`;
  const lead = `Lead for ${slug}.`;
  const article = answerArticleJsonLd({
    origin: 'https://biosphere-ai.com',
    path,
    headline,
    description: lead,
    updatedAt,
  });
  assert.equal(article['@type'], 'Article', slug);
  assert.equal(article.headline, headline, slug);
  assert.equal(article.description, lead, slug);
  assert.match(article.datePublished, ISO, slug);
  assert.match(article.dateModified, ISO, slug);
  assert.equal(article.datePublished.slice(0, 10), String(updatedAt).slice(0, 10), slug);
  assert.equal(article.dateModified.slice(0, 10), String(updatedAt).slice(0, 10), slug);
  assert.deepEqual(article.publisher, { '@id': ORG }, slug);
  assert.deepEqual(article.author, { '@id': ORG }, slug);
  assert.equal(article.image, `https://biosphere-ai.com${DEFAULT_OG_PATH}`, slug);
  assert.equal(article.mainEntityOfPage, `https://biosphere-ai.com${path}`, slug);
  assert.equal(orgEntities(article).length, 0, slug);
  assert.equal(Object.keys(article.publisher).join(','), '@id', slug);
  const baked = JSON.stringify(article);
  assert.equal(baked.includes('"@type":"Organization"'), false, slug);
  assert.equal(baked.includes('"logo"'), false, slug);
}

/* 有主图就用主图；作者若是名字，只出字符串，不包 Organization。 */
const pictured = answerArticleJsonLd({
  origin: 'https://biosphere-ai.com/',
  path: '/en/answers/halal-cosmetics/',
  headline: 'HALAL',
  description: 'Lead',
  updatedAt: '2026-09-16 10:03:04',
  image: '/media/99',
  authorName: 'BIOSPHERE',
});
assert.equal(pictured.image, 'https://biosphere-ai.com/media/99');
assert.equal(pictured.author, 'BIOSPHERE');
assert.equal(pictured.publisher['@id'], ORG);
assert.equal(orgEntities(pictured).length, 0);

const absolute = answerArticleJsonLd({
  origin: 'https://biosphere-ai.com',
  path: '/zh-cn/answers/china-filing/',
  headline: '备案',
  description: '结论',
  updatedAt: '2026-09-16 10:03:04',
  publishedAt: '2026-09-01 09:00:00',
  image: 'https://cdn.example/hero.jpg',
});
assert.equal(absolute.datePublished, '2026-09-01T09:00:00+08:00');
assert.equal(absolute.dateModified, '2026-09-16T10:03:04+08:00');
assert.equal(absolute.image, 'https://cdn.example/hero.jpg');

const page = readFileSync(new URL('apps/web/src/pages/[lang]/answers/[slug].astro', root), 'utf8');
assert.equal((page.match(/'@type': 'FAQPage'/g) ?? []).length, 1);
assert.equal((page.match(/'@type': 'BreadcrumbList'/g) ?? []).length, 1);
assert.equal((page.match(/answerArticleJsonLd\(/g) ?? []).length, 1);
assert.equal(/orgJsonLd\s*\(/.test(page), false);
assert.equal(/'@type': 'Organization'/.test(page), false);
assert.match(page, /name: q, acceptedAnswer: \{ '@type': 'Answer', text: lead \}/);
assert.match(page, /name: f\.q/);
assert.match(page, /text: f\.a/);
assert.match(page, /<h1>\{q\}<\/h1>/);
assert.match(page, /<p class="lead">\{lead\}<\/p>/);
assert.match(page, /<dt>Q:\{f\.q\}<\/dt>/);
assert.match(page, /<dd>A:\{f\.a\}<\/dd>/);
assert.match(page, /ogImage=\{DEFAULT_OG_PATH\}/);

const layout = readFileSync(new URL('packages/core/src/layouts/BaseLayout.astro', root), 'utf8');
assert.match(layout, /\$\{base\}\/media\/57/);
assert.equal(DEFAULT_OG_PATH, '/media/57');
assert.equal((layout.match(/orgJsonLd\s*\(/g) ?? []).length, 1);

const middleware = readFileSync(new URL('apps/web/src/middleware.ts', root), 'utf8');
assert.match(middleware, /const CACHE_V = 'v151'/);

console.log(`geo-012 ok · ${samples.length} answer samples`);
