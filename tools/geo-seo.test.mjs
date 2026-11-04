// SEO-003 根路径语言 + GEO-007/008/009 + SEO-004 Organization 只发一份。node tools/geo-seo.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const { pickRootLang, isSearchCrawler } = await import(new URL('apps/web/src/lib/root-locale.ts', root));
const { homeSeo } = await import(new URL('apps/web/src/lib/home-seo.ts', root));
const { llmsKind } = await import(new URL('apps/web/src/lib/llms-kind.ts', root));
const { funnelHero } = await import(new URL('packages/core/src/content/funnel-hero.ts', root));

const GB = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BING = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

assert.equal(isSearchCrawler(GB), true);
assert.equal(isSearchCrawler(BING), true);
assert.equal(isSearchCrawler(CHROME), false);

// Googlebot / 无 Accept-Language,即使国家是 CN,也去 x-default
assert.equal(pickRootLang({ saved: null, header: null, country: 'zh-cn', acceptLanguage: null, ua: GB, fallback: 'en' }), 'en');
assert.equal(pickRootLang({ saved: null, header: null, country: 'zh-cn', acceptLanguage: '', ua: BING, fallback: 'en' }), 'en');
assert.equal(pickRootLang({ saved: null, header: null, country: 'zh-cn', acceptLanguage: null, ua: CHROME, fallback: 'en' }), 'en');
assert.equal(pickRootLang({ saved: null, header: null, country: 'jp', acceptLanguage: null, ua: '', fallback: 'en' }), 'en');

// 浏览器带 zh-CN 仍可去简体
assert.equal(pickRootLang({ saved: null, header: 'zh-cn', country: 'us', acceptLanguage: 'zh-CN,zh;q=0.9', ua: CHROME, fallback: 'en' }), 'zh-cn');
// 爬虫不跟代理塞进来的 Accept-Language
assert.equal(pickRootLang({ saved: null, header: 'zh-cn', country: 'CN', acceptLanguage: 'zh-CN', ua: GB, fallback: 'en' }), 'en');
// 手动选过的 cookie 优先
assert.equal(pickRootLang({ saved: 'zh-cn', header: null, country: null, acceptLanguage: null, ua: GB, fallback: 'en' }), 'zh-cn');
// 带了不认识的语言时,才用国家码
assert.equal(pickRootLang({ saved: null, header: null, country: 'jp', acceptLanguage: 'sv-SE', ua: CHROME, fallback: 'en' }), 'jp');

const i18n = readFileSync(new URL('packages/core/src/i18n/index.ts', root), 'utf8');
const layout = readFileSync(new URL('packages/core/src/layouts/BaseLayout.astro', root), 'utf8');
assert.match(i18n, /DEFAULT_LOCALE: Locale = 'en'/);
assert.match(layout, /hreflang="x-default"/);
assert.match(layout, /switchLocalePath\(path, DEFAULT_LOCALE\)/);

const enSlogan = funnelHero('en').slogan;
for (const loc of ['id', 'ar', 'jp', 'kr']) {
  const h = funnelHero(loc);
  assert.notEqual(h.slogan, enSlogan, loc);
  assert.equal(h.slogan.includes('Find a product'), false, loc);
  assert.equal(h.subline.includes('automated production lines'), false, loc);
  assert.equal(h.step1.includes('Where are you starting'), false, loc);
}
assert.match(funnelHero('id').slogan, /produk/i);
assert.match(funnelHero('ar').slogan, /[\u0600-\u06FF]/);
assert.match(funnelHero('jp').slogan, /[\u3040-\u30ff\u4e00-\u9fff]/);
assert.match(funnelHero('kr').slogan, /[\uac00-\ud7af]/);
assert.match(funnelHero('zh-cn').slogan, /产品/);
assert.equal(funnelHero('en').slogan, enSlogan);

const id = homeSeo('id', 'Platform AI kecantikan', 'An AI platform for beauty');
assert.match(id.title, /OEM/);
assert.match(id.title, /Guangzhou|Produsen|pabrik/i);
assert.equal(/AI platform/i.test(id.title), false);
assert.match(id.description, /OEM/);
assert.match(id.description, /2012/);
const ar = homeSeo('ar', 'منصة ذكاء اصطناعي', 'AI platform');
assert.match(ar.title, /OEM/);
assert.match(ar.title, /[\u0600-\u06FF]/);
const kept = homeSeo('en', 'Guangzhou herbal cosmetics OEM / ODM manufacturer', 'Contract factory in Guangzhou');
assert.equal(kept.title, 'Guangzhou herbal cosmetics OEM / ODM manufacturer');
const zh = homeSeo('zh-cn', '广州草本化妆品 OEM/ODM 代工厂', '广州市帛卉化妆品有限公司');
assert.match(zh.title, /代工|OEM/);
assert.equal(zh.title.includes('AI platform'), false);

assert.equal(llmsKind('en'), 'redirect');
assert.equal(llmsKind('id'), 'redirect');
assert.equal(llmsKind('ar'), 'redirect');
assert.equal(llmsKind('zh-cn'), 'zh');
assert.equal(llmsKind('zh-tw'), 'zh');

/* SEO-004: Organization JSON-LD 只从 BaseLayout 发出。
   页面再调一次会和布局里那份撞同一个 @id。 */
function walkSources(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSources(p, acc);
    else if (/\.(astro|ts|mjs|js)$/.test(name)) acc.push(p);
  }
  return acc;
}
const rootDir = fileURLToPath(root);
const orgCalls = [];
for (const file of walkSources(rootDir)) {
  const text = readFileSync(file, 'utf8');
  const n = text.match(/orgJsonLd\s*\(/g)?.length ?? 0;
  if (n) orgCalls.push({ file: file.slice(rootDir.length).replaceAll('\\', '/'), n });
}
orgCalls.sort((a, b) => a.file.localeCompare(b.file));
assert.deepEqual(orgCalls, [
  { file: 'packages/core/src/content/org.ts', n: 1 },
  { file: 'packages/core/src/layouts/BaseLayout.astro', n: 1 },
]);
assert.equal((layout.match(/orgJsonLd\s*\(/g) ?? []).length, 1);
const faqPage = readFileSync(new URL('apps/web/src/pages/[lang]/faq/index.astro', root), 'utf8');
assert.match(faqPage, /faqJsonLd\(/);
assert.equal(/orgJsonLd\s*\(/.test(faqPage), false);
const home = readFileSync(new URL('apps/web/src/pages/[...path].astro', root), 'utf8');
assert.match(home, /siteJsonLd\(/);
assert.equal(/orgJsonLd\s*\(/.test(home), false);

console.log('geo-seo ok');
