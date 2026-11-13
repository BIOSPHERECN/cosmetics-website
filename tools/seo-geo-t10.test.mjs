// GROK-SEO-GEO-T10: 成分描述不再切在半个词上；英文首页与合规页摘要收短。
// node tools/seo-geo-t10.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogMetaDescription } from '../apps/web/src/lib/ingredient-meta.ts';
import { EN_HOME_SNIPPET, homeSeo } from '../apps/web/src/lib/home-seo.ts';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

function layoutTitle(title, siteName = 'BIOSPHERE-AI') {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

function completeSentence(text) {
  assert.equal(text.length <= 160, true, `over 160 (${text.length}): ${text}`);
  assert.match(text, /[.!?。！？]$/, `not a complete sentence: ${text}`);
  assert.equal(/\s\S$/.test(text.slice(0, -1)), false, `ends mid-word: ${text}`);
  assert.equal(text.endsWith(' t'), false, text);
  assert.equal(text.includes('products t'), false, text);
}

const SAMPLES = [
  'ACHILLEA MILLEFOLIUM EXTRACT',
  'Iron Oxide red',
  'NIACINAMIDE',
  'SODIUM ASCORBYL PHOSPHATE',
  'BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE',
  'GLYCERIN',
  'C12-15 ALKYL BENZOATE',
];

for (const name of SAMPLES) {
  const desc = catalogMetaDescription({ zh: false, name, full: false });
  completeSentence(desc);
  assert.equal(/irritan|comedogenic|popular products|benefit/i.test(desc), false, desc);
  assert.match(desc, /ingredient index/i);
}

const achillea = catalogMetaDescription({ zh: false, name: 'ACHILLEA MILLEFOLIUM EXTRACT', full: false });
const iron = catalogMetaDescription({ zh: false, name: 'Iron Oxide red', full: false });
assert.equal(achillea.length >= 155 && achillea.length <= 160, true, String(achillea.length));
assert.equal(iron.length >= 155 && iron.length <= 160, true, String(iron.length));
assert.match(achillea, /ACHILLEA MILLEFOLIUM EXTRACT/);
assert.match(iron, /Iron Oxide red/);
assert.match(achillea, /\.$/);
assert.match(iron, /\.$/);

// 会员 / 爬虫：what 已是完整句且放得下才用；放不下不切半个词。
const fitted = catalogMetaDescription({
  zh: false, name: 'NIACINAMIDE', full: true, what: 'It is listed under its INCI name.',
});
assert.equal(fitted, 'NIACINAMIDE: It is listed under its INCI name.');
const overflow = 'Used across many formulas '.repeat(20);
const fallback = catalogMetaDescription({ zh: false, name: 'NIACINAMIDE', full: true, what: overflow });
completeSentence(fallback);
assert.equal(fallback.includes(overflow.slice(0, 40)), false);
assert.equal(fallback, catalogMetaDescription({ zh: false, name: 'NIACINAMIDE', full: false }));

const huge = 'POLYACRYLAMIDE '.repeat(20).trim();
completeSentence(catalogMetaDescription({ zh: false, name: huge, full: false }));
const token = 'X'.repeat(180);
const bare = catalogMetaDescription({ zh: false, name: token, full: false });
completeSentence(bare);
assert.equal(bare.includes('XXX'), false);

const zhDesc = catalogMetaDescription({ zh: true, name: '母菊提取物', full: false });
completeSentence(zhDesc);
assert.equal(/刺激|致痘|热销/.test(zhDesc), false);

const catalog = read('apps/web/src/pages/[lang]/ingredients/_CatalogIngredient.astro');
assert.match(catalog, /catalogMetaDescription\(/);
assert.equal(catalog.includes('.slice(0, 160)'), false);
assert.match(catalog, /MemberGate/);

const homeTitle = layoutTitle(EN_HOME_SNIPPET.title);
assert.equal(homeTitle.length >= 50 && homeTitle.length <= 60, true, `${homeTitle.length} ${homeTitle}`);
assert.match(homeTitle, /Guangzhou/);
assert.match(homeTitle, /OEM \/ ODM factory/);
const homeDesc = EN_HOME_SNIPPET.description;
assert.equal(homeDesc.length >= 155 && homeDesc.length <= 160, true, String(homeDesc.length));
assert.match(homeDesc, /\.$/);
for (const fact of ['Guangzhou plant', 'sampling', 'compliance dossier', '15 automated lines', 'GMPC / ISO 22716 / HALAL']) {
  assert.match(homeDesc, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.equal(/MOQ|DDP|25-day|13,000|13000/.test(`${homeTitle}\n${homeDesc}`), false);

const liveHome = homeSeo(
  'en',
  'Cosmetics OEM / ODM factory in Guangzhou · find the product worth making, then we make it',
  'x'.repeat(287),
);
assert.deepEqual(liveHome, EN_HOME_SNIPPET);
const zhHome = homeSeo('zh-cn', '广州草本化妆品 OEM/ODM 代工厂', '广州市帛卉化妆品有限公司');
assert.equal(zhHome.title, '广州草本化妆品 OEM/ODM 代工厂');

const compliance = read('apps/web/src/pages/[lang]/compliance/index.astro');
const complianceTitleProp = 'ASEAN notification accounts: factory dossier';
const complianceTitle = layoutTitle(complianceTitleProp);
const meta = 'The factory cannot open the notification account. It can supply the factory half of the dossier. An enquiry about this factory-side documentation is welcome.';
assert.equal(complianceTitle, 'ASEAN notification accounts: factory dossier | BIOSPHERE-AI');
assert.equal(complianceTitle.length, 59);
assert.match(complianceTitle, /ASEAN/);
assert.match(complianceTitle, /notification accounts/);
assert.match(complianceTitle, /factory dossier/);
assert.equal(/open the account|register/i.test(complianceTitle), false);
assert.match(compliance, new RegExp(`title: '${complianceTitleProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
assert.match(compliance, /<h1>\{T\.title\}<\/h1>/);
assert.match(compliance, new RegExp(meta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(meta.length >= 155 && meta.length <= 160, true, String(meta.length));
assert.match(meta, /^The factory cannot open the notification account\./);
assert.match(meta, /enquiry/i);
assert.match(meta, /factory half of the dossier/);
assert.match(meta, /factory-side documentation/);
assert.equal(/register for the brand|open the account for|lead time|\b\d+\s*days?\b/i.test(meta), false);
assert.match(compliance, /A factory cannot open it and/);
assert.match(compliance, /factory half of the dossier/);
assert.match(compliance, /description=\{\(T\.meta \|\| T\.lede\)/);

const faq = read('apps/web/src/lib/buyer-oem-faq.ts');
assert.match(faq, /Questions buyers ask before an OEM inquiry/);
assert.equal(faq.includes('8613600050502'), false);
const oem = read('apps/web/src/pages/[lang]/oem/index.astro');
assert.match(oem, /BUYER_OEM_FAQ/);

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v155'/);

console.log(JSON.stringify({
  achillea: { n: achillea.length, text: achillea },
  iron: { n: iron.length, text: iron },
  homeTitle: { n: homeTitle.length, text: homeTitle },
  homeDesc: { n: homeDesc.length, text: homeDesc },
  complianceTitle: { n: complianceTitle.length, text: complianceTitle },
  complianceMeta: { n: meta.length, text: meta },
}, null, 2));
