// 首页 Product showcase / .showcase-grid 开关隐藏
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const page = read('apps/web/src/pages/[...path].astro');
const mw = read('apps/web/src/middleware.ts');
assert.match(page, /const SHOW_HOME_SHOWCASE = false/);
assert.match(page, /showHome\.SHOWCASE && showcaseData\.items\.length > 0/);
assert.match(page, /showcase-grid/);
assert.match(mw, /const CACHE_V = 'v155'/);
console.log('home-showcase-hide.test.mjs:全部通过');
