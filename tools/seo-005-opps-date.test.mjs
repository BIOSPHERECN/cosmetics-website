// SEO-005: opportunity board last-updated wording + stale marker (OpenCode/nvidia-direct)
// node tools/seo-005-opps-date.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const blocks = readFileSync(new URL('../packages/core/src/blocks.ts', import.meta.url), 'utf8');
const fx = blocks.slice(blocks.indexOf("id: 'fx_opps'"), blocks.indexOf("id: 'fx_latest'"));
assert.match(fx, /什么产品值得做\?/);
assert.equal(fx.includes('今天,什么产品值得做'), false);
assert.equal(fx.includes('每日生成'), false);
assert.match(fx, /最近更新 \{date\}/);
assert.match(fx, /最近一次成功生成/);
assert.equal(blocks.includes('看今天的机会卡'), false);

const page = readFileSync(new URL('../apps/web/src/components/FactoryBlock.astro', import.meta.url), 'utf8');
assert.match(page, /SEO-005: last-updated \/ stale/);
assert.match(page, /isStale/);
assert.match(page, /staleAgeHours/);
assert.match(page, /scrubDaily/);
assert.match(page, /48/);

const middleware = readFileSync(new URL('../apps/web/src/middleware.ts', import.meta.url), 'utf8');
assert.match(middleware, /const CACHE_V = 'v135'/);

console.log('seo-005 opps-date ok');
