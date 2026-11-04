// 首页 Hero 紧凑验收（SEN-6 · 2026-11-05）。node tools/hero-compact.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const hero = read('apps/web/src/components/HomeLead.astro');
const strip = read('apps/web/src/components/BioTrustStrip.astro');
const page = read('apps/web/src/pages/[...path].astro');
const funnel = read('packages/core/src/components/Funnel.astro');
const middleware = read('apps/web/src/middleware.ts');

assert.match(hero, /grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s*auto/);
assert.match(hero, /gap:\s*1\.25rem/);
assert.doesNotMatch(hero, /0\.95fr/);
assert.match(hero, /max-width:\s*360px/);
assert.match(hero, /max-height:\s*280px/);
assert.match(hero, /max-height:\s*200px/);
assert.match(hero, /aspect-ratio:\s*4\s*\/\s*5/);
assert.match(hero, /object-fit:\s*cover/);
assert.match(hero, /object-position:\s*center 40%/);
assert.doesNotMatch(hero, /object-fit:\s*contain/);
assert.doesNotMatch(hero, /#f6f5f2/);
assert.doesNotMatch(hero, /box-shadow:\s*var\(--bio-shadow\)/);
assert.match(hero, /padding-block:\s*clamp\(1\.25rem,\s*2\.5vw,\s*2rem\)/);
assert.match(hero, /--bio-primary/);
assert.match(hero, /class="bio-hero-wa"/);
assert.match(hero, /Start RFQ/);
assert.match(hero, /发起询盘/);

const pad = strip.match(/padding-block:\s*(\d+)px/);
assert.ok(pad, '信任带要有 padding-block');
const padPx = Number(pad[1]);
assert.ok(padPx >= 28 && padPx <= 36, `信任带 padding 应在 28–36px，实际 ${padPx}`);

const shotAt = hero.indexOf('.bio-hero-shot {');
const shotEnd = hero.indexOf('.bio-hero-shot img', shotAt);
const shotRule = hero.slice(shotAt, shotEnd);
assert.match(shotRule, /max-height:\s*280px/);
assert.doesNotMatch(shotRule, /background:\s*#/);
assert.match(shotRule, /box-shadow:\s*none/);

const showAt = page.indexOf('showcase-grid');
const funnelAt = page.indexOf('<Funnel locale={lang} heading="h2" />');
assert.ok(showAt >= 0 && funnelAt > showAt, '漏斗必须排在成品展示之后');
assert.match(funnel, /padding-block:\s*clamp\(0\.75rem,\s*2vw,\s*1\.25rem\)/);
assert.doesNotMatch(funnel, /padding-block:\s*clamp\(1\.5rem,\s*4vw,\s*3\.5rem\)/);

assert.match(middleware, /const CACHE_V = 'v140'/);

console.log('hero-compact.test.mjs:全部通过');
