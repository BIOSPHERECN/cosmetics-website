// 首页「可来厂核对」整节已撤。询盘仍走导航 /contact/ 与 /rfq/。
// node tools/hero-compact.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const page = read('apps/web/src/pages/[...path].astro');
const strip = read('apps/web/src/components/BioTrustStrip.astro');
const funnel = read('packages/core/src/components/Funnel.astro');
const header = read('packages/core/src/components/SiteHeader.astro');
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
const middleware = read('apps/web/src/middleware.ts');

assert.equal(existsSync(new URL('apps/web/src/components/HomeLead.astro', root)), false, 'HomeLead 组件已删除');
assert.doesNotMatch(page, /HomeLead|bio-hero|可来厂核对的化妆品代工|OEM cosmetics from a plant you can audit/);
assert.doesNotMatch(page, /\/pack\/AL-002-5/);

assert.match(header, /\/contact\//);
assert.match(rfq, /id="rfq-form"/);
assert.match(rfq, /提交 RFQ|Submit RFQ/);
assert.match(strip, /\/rfq\//);
assert.match(strip, /申请样品/);

const pad = strip.match(/padding-block:\s*(\d+)px/);
assert.ok(pad, '信任带要有 padding-block');
const padPx = Number(pad[1]);
assert.ok(padPx >= 28 && padPx <= 36, `信任带 padding 应在 28–36px，实际 ${padPx}`);

const showAt = page.indexOf('class="showcase-grid"');
const funnelAt = page.indexOf('<Funnel locale={lang} heading="h2" />');
assert.ok(showAt >= 0 && funnelAt >= 0 && funnelAt < showAt, '漏斗在成品展示之上');
assert.match(funnel, /padding-block:\s*clamp\(0\.75rem,\s*2vw,\s*1\.25rem\)/);
assert.doesNotMatch(funnel, /padding-block:\s*clamp\(1\.5rem,\s*4vw,\s*3\.5rem\)/);

assert.match(middleware, /const CACHE_V = 'v144'/);

console.log('hero-compact.test.mjs:全部通过');
