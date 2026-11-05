// SEO-010: /{lang}/oem/ 只有一个品牌后缀，BreadcrumbList 与可见面包屑同一串。
// node tools/seo-010-oem.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t } from '../packages/core/src/i18n/index.ts';
import { oemIndexCrumbs, oemPageTitle } from '../apps/web/src/lib/oem-index-seo.ts';

/** 与 BaseLayout 同一条:标题里还没有站点名才补 `| ${siteName}`。 */
function layoutTitle(title, siteName) {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

const siteName = 'BIOSPHERE-AI';
const enRaw = 'OEM / private label cosmetics manufacturer by market and category | BIOSPHERE';
const zhRaw = 'OEM / 贴牌代工 · 按市场与品类 | BIOSPHERE';
const en = layoutTitle(oemPageTitle(enRaw), siteName);
const zh = layoutTitle(oemPageTitle(zhRaw), siteName);
assert.equal(en, 'OEM / private label cosmetics manufacturer by market and category | BIOSPHERE-AI');
assert.equal(zh, 'OEM / 贴牌代工 · 按市场与品类 | BIOSPHERE-AI');
assert.equal((en.match(/\|/g) ?? []).length, 1);
assert.equal((zh.match(/\|/g) ?? []).length, 1);
assert.equal(en.includes('| BIOSPHERE |'), false);
assert.equal(zh.includes('| BIOSPHERE |'), false);

// 其它语种译文可能仍以 `| BIOSPHERE` 结尾，或已经叠了两次。
const id = layoutTitle(oemPageTitle('Produsen OEM / label pribadi menurut pasar dan kategori | BIOSPHERE'), siteName);
assert.equal(id.endsWith('| BIOSPHERE-AI'), true);
assert.equal((id.match(/\|/g) ?? []).length, 1);
const stacked = layoutTitle(oemPageTitle('OEM hub | BIOSPHERE | BIOSPHERE-AI'), siteName);
assert.equal(stacked, 'OEM hub | BIOSPHERE-AI');
assert.equal(oemPageTitle('OEM hub'), 'OEM hub');
// 句中的品牌名不是后缀，留下。
assert.equal(oemPageTitle('BIOSPHERE OEM by market'), 'BIOSPHERE OEM by market');

const enCrumbs = oemIndexCrumbs({ lang: 'en', homeLabel: t('en')('nav.home'), nav: [{ slug: 'about', label: 'About', children: [] }] });
assert.deepEqual(enCrumbs.map((c) => c.name), ['Home', 'OEM']);
assert.deepEqual(enCrumbs.map((c) => c.path), ['/en/', '/en/oem/']);

const zhCrumbs = oemIndexCrumbs({ lang: 'zh-cn', homeLabel: t('zh-cn')('nav.home') });
assert.deepEqual(zhCrumbs.map((c) => c.name), ['首页', 'OEM']);
assert.deepEqual(zhCrumbs.map((c) => c.path), ['/zh-cn/', '/zh-cn/oem/']);

const jaCrumbs = oemIndexCrumbs({ lang: 'jp', homeLabel: t('jp')('nav.home') });
assert.equal(jaCrumbs[0].name, 'ホーム');
assert.equal(jaCrumbs[1].name, 'OEM');
assert.equal(jaCrumbs[1].path, '/jp/oem/');

// 导航里真有 OEM 栏目时，面包屑用那一栏的名字，不另起一个。
const fromNav = oemIndexCrumbs({
  lang: 'en',
  homeLabel: 'Home',
  nav: [{ slug: 'services', label: 'Services', children: [{ slug: 'oem', label: 'OEM / private label' }] }],
});
assert.deepEqual(fromNav.map((c) => c.name), ['Home', 'OEM / private label']);

const page = readFileSync(new URL('../apps/web/src/pages/[lang]/oem/index.astro', import.meta.url), 'utf8');
assert.match(page, /oemPageTitle\(T\.title\)/);
assert.match(page, /'@type': 'BreadcrumbList'/);
assert.match(page, /'@type': 'ItemList'/);
assert.match(page, /aria-label="breadcrumb"/);
assert.match(page, /aria-current="page"/);
assert.equal(/orgJsonLd\s*\(/.test(page), false);
assert.equal(page.includes('| BIOSPHERE\''), false);

const cache = readFileSync(new URL('../apps/web/src/middleware.ts', import.meta.url), 'utf8');
assert.match(cache, /const CACHE_V = 'v146'/);

console.log('seo-010 oem ok');
