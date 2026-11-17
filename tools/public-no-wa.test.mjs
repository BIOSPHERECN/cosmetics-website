// 公网触点应能生成 wa.me。站点号码只来自后台，不写死。询盘表单仍让客户自填。
// node tools/public-no-wa.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { oemWaText, waMeHref, waOrContact } from '../packages/core/src/content/wa-link.mjs';

const root = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

const zh = waMeHref({ whatsapp: '+86 136-0005-0502', lang: 'zh-cn', siteName: 'BIOSPHERE' });
assert.equal(zh.startsWith('https://wa.me/8613600050502?text='), true);
assert.match(decodeURIComponent(zh.slice(zh.indexOf('text=') + 5)), /你好,我在看 BIOSPHERE 的网站,想了解代工。/);
const en = waOrContact({ whatsapp: '86 136 0005 0502', lang: 'en', siteName: 'BIOSPHERE' });
assert.match(decodeURIComponent(en), /Hi, I am looking at the BIOSPHERE site and would like to discuss OEM\/ODM\./);
assert.equal(waOrContact({ whatsapp: '', lang: 'zh-cn' }), '/zh-cn/contact/');
assert.equal(waOrContact({ whatsapp: 'abc', lang: 'en' }), '/en/contact/');
assert.equal(waMeHref({ whatsapp: null, lang: 'en' }), '');
assert.match(oemWaText('zh-tw', '帛卉'), /想了解代工/);
assert.equal(waOrContact({ whatsapp: '+1 (415) 555-0100', lang: 'ja' }).startsWith('https://wa.me/14155550100?text='), true);

const roots = [
  'apps/web/src/components',
  'apps/web/src/pages',
  'apps/web/src/middleware.ts',
  'packages/core/src',
  'sites',
];
const skip = (rel) =>
  rel.includes('/bohui/')
  || rel.includes('/api/')
  || rel.includes('/node_modules/')
  || rel.endsWith('.html');

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = abs.slice(root.pathname.length);
    if (skip(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(astro|ts|mjs|js|tsx)$/.test(name)) out.push(abs);
  }
}

const files = [];
for (const rel of roots) {
  const abs = new URL(rel, root);
  const path = abs.pathname;
  if (statSync(path).isDirectory()) walk(path, files);
  else files.push(path);
}

const banned = '8613600050502';
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (text.includes(banned)) hits.push(file.slice(root.pathname.length));
}
assert.deepEqual(hits, [], `公网源写死了站点号码:\n${hits.join('\n')}`);

const link = read('packages/core/src/content/wa-link.mjs');
assert.match(link, /https:\/\/wa\.me\/\$\{wa\}\?text=/);

for (const rel of [
  'apps/web/src/components/FactoryBlock.astro',
  'packages/core/src/components/SiteFooter.astro',
  'packages/core/src/components/ChatWidget.astro',
  'packages/core/src/components/MobileDualCta.astro',
  'packages/core/src/components/mobile-dual-cta.mjs',
  'packages/core/src/layouts/BaseLayout.astro',
]) {
  assert.match(read(rel), /waOrContact|waMeHref|whatsappHref|wa\.me/, rel);
}

assert.match(read('apps/web/src/components/FactoryBlock.astro'), /waOrContact/);
assert.doesNotMatch(read('apps/web/src/components/FactoryBlock.astro'), /可来厂核对的化妆品代工/);
assert.match(read('apps/web/src/components/FactoryBlock.astro'), /fill\(d\.submit\) \|\| 'WhatsApp'/);
assert.match(read('packages/core/src/components/ChatWidget.astro'), /id="bh-wa-fab"/);
assert.match(read('packages/core/src/components/SiteFooter.astro'), /WhatsApp \+\{wa\}/);
assert.match(read('packages/core/src/components/MobileDualCta.astro'), /class="wa-btn"/);
assert.match(
  read('apps/web/src/pages/[lang]/rfq/index.astro'),
  /name="whatsapp"/,
  '询盘表单仍保留客户填写的联系方式',
);
assert.match(
  read('apps/web/src/middleware.ts'),
  /const CACHE_V = 'v155'/,
);

console.log(`public wa touchpoints ok (${files.length} files scanned)`);
