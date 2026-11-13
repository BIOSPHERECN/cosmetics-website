// 莱诺鸟 P0-3：产品卡网格锁 1:1，Sample 深链带真实 product_id。node tools/portfolio-grid.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const {
  PORTFOLIO_ASPECT_CLASS,
  portfolioCoverSrc,
  portfolioFormatBadge,
  portfolioSampleHref,
} = await import(new URL('../apps/web/src/lib/portfolio-card.ts', import.meta.url));

const page = read('apps/web/src/pages/[lang]/portfolio/index.astro');
const card = read('apps/web/src/components/PortfolioCard.astro');
const collections = read('apps/web/src/pages/[lang]/collections/[cat].astro');
const lib = read('apps/web/src/lib/portfolio-card.ts');

assert.equal(PORTFOLIO_ASPECT_CLASS, 'pf-aspect-1x1');
assert.equal((page.match(/<PortfolioCard/g) || []).length, 2, '手机分区与桌面网格共用同一张卡');
assert.match(page, /portfolioSampleHref\(/);
assert.match(lib, /q\.set\('product_id', ref\)/);
assert.match(lib, /\/\$\{loc\}\/rfq\/\?/);
assert.match(card, /PORTFOLIO_ASPECT_CLASS/);
assert.match(card, /product_id=/);
assert.match(card, /class="gen-placeholder"/);
assert.match(card, /#f6f5f2/);
assert.match(card, /object-fit:\s*contain/);
assert.match(card, /width:\s*80%/);
assert.match(card, /height:\s*80%/);
assert.match(card, /var\(--bio-radius\)/);
assert.match(card, /var\(--bio-shadow\)/);
assert.match(card, /translateY\(-2px\)/);
assert.match(card, /prefers-reduced-motion:\s*reduce/);
assert.match(card, /transform:\s*none/);
assert.doesNotMatch(card, /object-fit:\s*cover/);
assert.doesNotMatch(card, /translateY\(-[3-9]/);
assert.doesNotMatch(card, /4\s*\/\s*5|4:5/);
assert.doesNotMatch(page, /aspect-ratio/);
assert.doesNotMatch(page, /object-fit:\s*cover/);
assert.doesNotMatch(page, /4\s*\/\s*3|4\s*\/\s*5|4:5/);
assert.doesNotMatch(collections, /aspect-ratio/);
assert.doesNotMatch(collections, /object-fit:\s*cover/);
assert.match(collections, /<PortfolioCard/);
assert.doesNotMatch(collections, /product_id=\$\{[^}]*\?\? ''\}/);
assert.doesNotMatch(lib, /www\./);
assert.doesNotMatch(page, /\/rfq\/\?[^"'`\n]*www/);
assert.doesNotMatch(card, /href=\{`https?:\/\/www/);

const ratios = [...card.matchAll(/aspect-ratio:\s*([^;}]+)/g)].map((m) => m[1].replace(/\s+/g, ''));
assert.deepEqual(ratios, ['1/1'], '图框只声明一次 1:1');
assert.match(card, new RegExp(`\\.${PORTFOLIO_ASPECT_CLASS}\\s*\\{[^}]*aspect-ratio:\\s*1\\s*/\\s*1`));

const href = portfolioSampleHref('en', { id: 85, slug: 'sage-acne-serum', category: 'serum' }, 'Night Cream');
const u = new URL(href, 'https://biosphere-ai.com');
assert.equal(u.pathname, '/en/rfq/');
assert.equal(u.searchParams.get('product_id'), '85');
assert.equal(u.searchParams.get('about'), 'Night Cream');
assert.equal(u.searchParams.get('category'), 'serum');
assert.equal(u.searchParams.get('intent'), null);
assert.doesNotMatch(href, /^https?:/);
assert.doesNotMatch(href.split('?')[0], /www/);

const zhHref = portfolioSampleHref('zh-cn', { id: '', slug: 'night-cream', category: ' ' }, '夜霜');
const uz = new URL(zhHref, 'https://biosphere-ai.com');
assert.equal(uz.pathname, '/zh-cn/rfq/');
assert.equal(uz.searchParams.get('product_id'), 'night-cream');
assert.equal(uz.searchParams.get('about'), '夜霜');
assert.equal(uz.searchParams.get('category'), null);

assert.equal(portfolioSampleHref('en', { id: '', slug: '  ' }, 'x'), null);
assert.equal(portfolioSampleHref('en', { id: '   ', slug: '' }, 'Night'), null);
assert.equal(/[?&]product_id=(?:&|$)/.test(href), false);
assert.equal(/[?&]product_id=(?:&|$)/.test(zhHref), false);

assert.equal(portfolioCoverSrc({ cover_media: 12, cover_folder: '历史产品', cover_filename: 'serum.webp' }), '/media/12');
assert.equal(portfolioCoverSrc({ cover_media: 9, cover_folder: 'AI图产品库 2026-10', cover_key: 'media/product/aip/serum.webp' }), '/media/9');
assert.equal(portfolioCoverSrc(null), null);
assert.equal(portfolioCoverSrc({ cover_media: '', cover_folder: '历史产品' }), null);
assert.equal(portfolioCoverSrc({ cover_media: 3, cover_folder: '资质证书', cover_filename: 'gmpc.webp' }), null);
assert.equal(portfolioCoverSrc({ cover_media: 4, cover_folder: '原料溯源' }), null);
assert.equal(portfolioCoverSrc({ cover_media: 5, cover_folder: '工厂实力', cover_filename: 'workshop-corridor.webp' }), null);
assert.equal(portfolioCoverSrc({ cover_media: 6, cover_key: 'media/factory/video-still-01.webp' }), null);

assert.equal(portfolioFormatBadge('[{"label":"剂型","value":"serum"}]', '', 'body', true), '精华');
assert.equal(portfolioFormatBadge('[]', '[{"label":"剂型","value":"面霜"}]', 'body', false), '面霜');
assert.equal(portfolioFormatBadge('', '', 'serum', false), 'Serum');
assert.equal(portfolioFormatBadge('', '', 'body', true), '身体护理');

assert.match(page, /class="pg-trust"/);
assert.match(page, /id="pg-empty"/);
assert.match(page, /id="pg-clear"/);
assert.match(page, /id="pg-empty-rfq"/);
assert.match(page, /main\.is-search-empty \.pg-trust/);
assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v154'/);

const strip = read('apps/web/src/components/BioTrustStrip.astro');
const home = read('apps/web/src/pages/[...path].astro');
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
assert.match(strip, /class="bio-trust-strip"/);
assert.match(home, /<BioTrustStrip locale=\{lang\} \/>/);
assert.doesNotMatch(home, /<HomeLead|可来厂核对的化妆品代工|bio-hero/);
assert.match(rfq, /name="target_market"/);
assert.match(rfq, /name="halal_ready"/);
assert.match(rfq, /name="notification_assist_country"/);
assert.match(rfq, /name="first_order_band"/);
assert.doesNotMatch(page, /intent=oem-evidence/);
assert.doesNotMatch(card, /halal certified|FDA approved|SFDA approved|低\s*MOQ|普草/i);

console.log('portfolio-grid.test.mjs:全部通过');
