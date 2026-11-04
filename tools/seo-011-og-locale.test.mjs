// SEO-011: og:locale:alternate for all hreflang locales
// node tools/seo-011-og-locale.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OG_LOCALE, LOCALES } from '../packages/core/src/i18n/index.ts';

/** 与 BaseLayout 同一条:标题里还没有站点名才补 `| ${siteName}`。 */
function layoutTitle(title, siteName) {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

// 检查 BaseLayout.astro 中的 og:locale:alternate 渲染
const baseLayoutPath = new URL('../packages/core/src/layouts/BaseLayout.astro', import.meta.url);
const baseLayoutSource = readFileSync(baseLayoutPath, 'utf8');

// 1. 检查是否存在 og:locale:alternate 标签
assert.match(baseLayoutSource, /og:locale:alternate/);

// 2. 检查是否使用了 LOCALES 过滤器
assert.match(baseLayoutSource, /LOCALES.filter\(/);
assert.match(baseLayoutSource, /l !== locale/);

// 3. 检查是否映射了 OG_LOCALE
assert.match(baseLayoutSource, /OG_LOCALE\[l\]/);

// 4. 检查本地语言是否未被排除
assert.match(baseLayoutSource, /l !== locale/);

// 5. 检查 OG_LOCALE 键是否等于 LOCALES
const ogLocaleKeys = Object.keys(OG_LOCALE);
const locales = LOCALES;
for (const locale of locales) {
  assert.ok(ogLocaleKeys.includes(locale), `Missing OG_LOCALE for locale: ${locale}`);
}

// 6. 检查 OG_LOCALE 是否使用 Facebook 格式（下划线格式）
for (const locale of locales) {
  const value = OG_LOCALE[locale];
  assert.match(value, /^[a-z]+_[A-Z]+$/);
}

console.log('seo-011 og:locale:alternate ok');