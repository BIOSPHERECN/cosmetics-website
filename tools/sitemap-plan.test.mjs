// sitemap 索引只列非空子图,解读分片按真实有行的 id 区间,语种 loc 拆开。
// node tools/sitemap-plan.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lib = new URL('../apps/web/src/lib/sitemap-plan.ts', import.meta.url);
const s = await import(lib);

const HOLLOW = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 65, 67, 68, 69, 70, 71]);
const flags = Array.from({ length: 80 }, (_, i) => !HOLLOW.has(i) && i !== 2);
const shards = s.occupiedShards(flags);

const plan = s.planIndex({
  langs: ['en', 'zh-cn', 'id', 'ar'],
  hasNews: true,
  hasFormulas: false,
  hasPackaging: true,
  hasIngredients: true,
  decoderShards: shards,
});

const dec = plan.filter((c) => c.part === 'decoder').map((c) => c.p);
for (const h of HOLLOW) assert.equal(dec.includes(h), false, `hollow shard ${h} listed`);
assert.equal(dec.includes(0), true);
assert.equal(dec.includes(15), true);
assert.equal(dec.includes(66), true);
assert.equal(plan.some((c) => c.part === 'formulas'), false);
assert.equal(plan.some((c) => c.part === 'pages' && c.lang === 'id'), true);
assert.equal(plan.some((c) => c.part === 'pages' && !c.lang), false);
assert.equal(plan.filter((c) => c.part === 'news').length, 4);
assert.equal(plan.filter((c) => c.part === 'packaging' && c.lang === 'ar').length, 1);

const xml = s.indexXml('biosphere-ai.com', plan);
assert.match(xml, /<sitemapindex /);
assert.match(xml, /sitemap\.xml\?part=pages&amp;lang=id/);
assert.equal(xml.includes('part=formulas'), false);
assert.equal(xml.includes('part=decoder&amp;p=3</loc>'), false);
assert.equal(xml.includes('part=decoder&amp;p=14</loc>'), false);
assert.equal(xml.includes('part=decoder&amp;p=71</loc>'), false);
assert.equal(xml.includes('part=decoder&amp;p=15</loc>'), true);
assert.equal(xml.includes('part=decoder&amp;p=66</loc>'), true);
// 索引里的每个 decoder 子图都对应一个有行的分片,数量等于真实分片数而不是 MAX(id)
assert.equal(dec.length, flags.filter(Boolean).length);

// 五片解读的 URL 互不重复(空片不再占一个相同的空文档)
const sampleShards = [0, 1, 15, 20, 66];
const locSets = sampleShards.map((shard) => {
  const id = shard * s.DECODER_SHARD + 7;
  assert.equal(s.inDecoderShard(id, shard), true);
  assert.equal(s.inDecoderShard(id, shard + 1), false);
  return [`https://biosphere-ai.com/zh-cn/decoder/${id}-brand/`, `https://biosphere-ai.com/en/decoder/${id}-brand/`];
});
const flat = locSets.flat();
assert.equal(new Set(flat).size, flat.length);
for (let i = 0; i < locSets.length; i++) {
  for (let j = i + 1; j < locSets.length; j++) {
    assert.equal(locSets[i].some((u) => locSets[j].includes(u)), false);
  }
}

// 产品:请求的语种自己有 <loc>,hreflang 只指向传入的、会 200 的语种
const entry = s.urlEntry({
  loc: 'https://biosphere-ai.com/id/product/serum/',
  priority: '0.7',
  lastmod: '2026-11-04T00:00:00Z',
  alternates: [
    { hreflang: 'en', href: 'https://biosphere-ai.com/en/product/serum/' },
    { hreflang: 'id', href: 'https://biosphere-ai.com/id/product/serum/' },
    { hreflang: 'ar', href: 'https://biosphere-ai.com/ar/product/serum/' },
  ],
  xDefaultHref: 'https://biosphere-ai.com/en/product/serum/',
});
assert.match(entry, /<loc>https:\/\/biosphere-ai.com\/id\/product\/serum\/<\/loc>/);
assert.match(entry, /<lastmod>2026-11-04<\/lastmod>/);
assert.match(entry, /hreflang="id"/);
assert.match(entry, /hreflang="x-default" href="https:\/\/biosphere-ai.com\/en\/product\/serum\/"/);
assert.equal(entry.includes('hreflang="fr"'), false);
assert.equal(entry.includes('hreflang="zh-CN"'), false);
const set = s.urlsetXml([entry]);
assert.match(set, /<url>/);
assert.match(set, /<loc>/);

// C3：RFQ 不在 pages 表，必须由 pages 子图显式列出。默认语种表含 en 与 zh-cn，不写 lastmod。
const pageSrc = readFileSync(new URL('../apps/web/src/pages/sitemap.xml.ts', import.meta.url), 'utf8');
assert.equal(pageSrc.includes("p.slug === 'rfq'"), true);
assert.equal(pageSrc.includes("push('rfq/', '0.9')"), true);
assert.equal(pageSrc.includes("push('rfq/', '0.9',"), false);
assert.equal(pageSrc.includes('https://${url.hostname}/en/rfq/'), true);
assert.equal(pageSrc.includes('https://${url.hostname}/zh-cn/rfq/'), true);
const robotsSrc = readFileSync(new URL('../apps/web/src/pages/robots.txt.ts', import.meta.url), 'utf8');
assert.match(robotsSrc, /Allow: \//);
assert.match(robotsSrc, /ai-input=yes/);
assert.match(robotsSrc, /Sitemap: \$\{base\}\/sitemap\.xml/);
assert.equal(robotsSrc.includes('Disallow: /en/rfq'), false);
assert.equal(robotsSrc.includes('Disallow: /zh-cn/rfq'), false);

console.log('sitemap-plan ok', plan.length, 'children', dec.length, 'decoder shards');
