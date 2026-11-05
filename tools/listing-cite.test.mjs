// PL-3：上架闸、描述回填、产品页首段与 JSON-LD / FAQ 同源。node tools/listing-cite.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  blockPublishTransition,
  effectiveCharCount,
  faqsFromSpecs,
  isPlaceholderDescription,
  listingLead,
  listingPublishBlock,
  mergeSpecsJson,
  PUBLISH_MIN_CHARS,
} from '../apps/web/src/lib/listing-cite.ts';
import { loadListingFile, previewSpecs, updateSql } from './listing-cite-import.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const han = (n) => '配'.repeat(n);

assert.equal(isPlaceholderDescription('Product: 玻尿酸精华.'), true);
assert.equal(isPlaceholderDescription('Product: Barrier Serum.'), true);
assert.equal(isPlaceholderDescription('  product:   barrier serum.  '), true);
assert.equal(isPlaceholderDescription('Product: Barrier Serum'), true);
assert.equal(isPlaceholderDescription(''), false);
assert.equal(isPlaceholderDescription('Product: ' + 'A'.repeat(200) + '.'), true);
assert.equal(listingPublishBlock('Product: ' + 'A'.repeat(200) + '.'), '描述仍是「Product: 名称.」占位，不能上架');

const realAfterShell = `Product: 名称。${han(PUBLISH_MIN_CHARS)}`;
assert.equal(isPlaceholderDescription(realAfterShell), false);
assert.equal(listingPublishBlock(realAfterShell), null);

assert.equal(effectiveCharCount(' 配 方，A1 '), 4);
assert.ok(listingPublishBlock(''));
assert.match(listingPublishBlock(han(119)), /119/);
assert.equal(listingPublishBlock(han(120)), null);
assert.equal(listingPublishBlock('Product: 精华.'), '描述仍是「Product: 名称.」占位，不能上架');

assert.equal(blockPublishTransition({
  currentStatus: 'published', nextStatus: 'published', description: 'Product: 精华.',
}), null);
assert.equal(blockPublishTransition({
  currentStatus: 'published', nextStatus: 'draft', description: 'Product: 精华.',
}), null);
assert.equal(blockPublishTransition({
  currentStatus: 'draft', nextStatus: 'draft', description: '',
}), null);
assert.match(blockPublishTransition({
  currentStatus: 'draft', nextStatus: 'published', description: 'Product: 精华.',
}), /不能上架/);
assert.match(blockPublishTransition({
  currentStatus: 'draft', nextStatus: 'published', description: han(119),
}), /少于 120/);
assert.equal(blockPublishTransition({
  currentStatus: 'draft', nextStatus: 'published', description: han(120),
}), null);

const shell = listingLead({
  description: 'Product: 屏障修护精华.',
  name: '屏障修护精华',
  categoryLabel: '护肤',
  zh: true,
});
assert.equal(shell.source, 'fallback');
assert.equal(shell.lead, shell.paragraphs[0]);
assert.ok(effectiveCharCount(shell.lead) >= 20);
assert.equal(isPlaceholderDescription(shell.lead), false);
assert.doesNotMatch(shell.lead, /^Product:\s/i);
assert.doesNotMatch(shell.lead, /SPF\s*\d/i);
assert.doesNotMatch(shell.lead, /Halal certified/i);
assert.doesNotMatch(shell.lead, /[\$￥¥]\s*\d/);

const body = `第一段说明配方、包材与标签都可以按品牌调整，这段要超过二十个有效字。\n\n第二段只补充打样后再排产。`;
const cited = listingLead({
  description: body,
  name: '屏障修护精华',
  categoryLabel: '护肤',
  zh: true,
});
assert.equal(cited.source, 'description');
assert.equal(cited.lead, cited.paragraphs[0]);
assert.match(cited.lead, /第一段说明/);
assert.equal(cited.paragraphs.length, 2);
assert.ok(effectiveCharCount(cited.lead) >= 20);

const tiny = listingLead({
  description: '太短',
  name: '屏障修护精华',
  categoryLabel: '护肤',
  zh: true,
});
assert.equal(tiny.source, 'fallback');
assert.equal(tiny.lead, tiny.paragraphs[0]);

const specs = {
  list: [{ label: '剂型', value: '精华' }],
  faq: [
    { q: '能改容量吗', a: '可以。容量在询盘里书面确认。' },
    { q: '', a: '丢掉空问题' },
    { question: '打样后才排产吗', answer: '是。签样之后再安排生产。' },
  ],
};
const extra = faqsFromSpecs(specs);
assert.equal(extra.length, 2);
const faqs = [
  { q: '起订量怎么定？', a: '按品类与包材书面确认。' },
  ...extra,
];
assert.deepEqual(faqs.slice(1), extra);
const jsonld = read('apps/web/src/lib/jsonld.ts');
const faqFn = jsonld.slice(jsonld.indexOf('export function faqJsonLd'), jsonld.indexOf('export function siteJsonLd'));
assert.match(faqFn, /'@type': 'FAQPage'/);
assert.match(faqFn, /name: x\.q/);
assert.match(faqFn, /text: x\.a/);
assert.match(faqFn, /items\.map\(\(x\)/);
assert.equal(faqsFromSpecs([{ label: '剂型', value: '精华' }]).length, 0);
assert.equal(faqsFromSpecs({}).length, 0);

const merged = JSON.parse(mergeSpecsJson(
  JSON.stringify([{ label: '剂型', value: '精华' }]),
  { tech: [{ title: '肤感', body: '水感' }] },
  [{ q: '能改容量吗', a: '可以。容量在询盘里书面确认。' }],
));
assert.deepEqual(merged.list, [{ label: '剂型', value: '精华' }]);
assert.equal(merged.tech[0].title, '肤感');
assert.equal(merged.faq[0].q, '能改容量吗');

const sampleRaw = read('tools/listing-cite.sample.json');
const sample = loadListingFile(sampleRaw);
assert.equal(sample.length, 1);
assert.equal(sample[0].slug, 'example-barrier-serum');
assert.equal(sample[0].publishBlock, null);
assert.ok(sample[0].chars >= 120);
assert.doesNotMatch(sampleRaw, /SPF\s*\d/i);
assert.doesNotMatch(sampleRaw, /Halal certified/i);
assert.doesNotMatch(sampleRaw, /清真认证/);
assert.doesNotMatch(sampleRaw, /[\$￥¥]\s*\d/);
const sampleSpecs = JSON.parse(previewSpecs(sample[0]));
assert.equal(sampleSpecs.faq.length, 1);
assert.match(sampleSpecs.faq[0].a, /不写价格/);
const sql = updateSql(sample[0], '[]', 'biosphere-ai');
assert.match(sql, /UPDATE product_i18n SET description=/);
assert.doesNotMatch(sql, /status/i);
assert.match(sql, /example-barrier-serum/);

const page = read('apps/web/src/pages/[lang]/product/[pslug].astro');
assert.match(page, /listingLead\(/);
assert.match(page, /const aboutText = cited\.paragraphs/);
assert.match(page, /const lead = cited\.lead/);
assert.match(page, /const productDescription = lead/);
assert.match(page, /description: productDescription/);
assert.match(page, /faqJsonLd\(faqs\)/);
assert.match(page, /faqs\.map\(\(f\)/);
assert.match(page, /aboutText\.map/);
assert.match(page, /faqsFromSpecs\(specs\)/);

const api = read('apps/web/src/pages/api/admin/product.ts');
assert.match(api, /blockPublishTransition/);
assert.equal(api.split('blockPublishTransition').length - 1, 3);
const saveAt = api.indexOf("if (b.action === 'save')");
const toggleAt = api.indexOf("if (b.action === 'toggle')");
const saveBody = api.slice(saveAt, toggleAt);
const toggleBody = api.slice(toggleAt);
assert.ok(saveBody.indexOf('blockPublishTransition') < saveBody.indexOf('UPDATE products SET'));
assert.ok(toggleBody.indexOf('blockPublishTransition') < toggleBody.indexOf('UPDATE products SET status'));

const script = read('tools/listing-cite-import.mjs');
assert.match(script, /不会把 status 改成 published/);
assert.doesNotMatch(script, /SET status/i);

const dry = execFileSync(process.execPath, ['tools/listing-cite-import.mjs', 'tools/listing-cite.sample.json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
assert.match(dry, /干跑，未写库/);
assert.match(dry, /example-barrier-serum/);
assert.match(dry, /样例导入说明/);
assert.match(dry, /不会把 status 改成 published/);
assert.match(dry, /有效字少于 120/);

console.log('listing-cite ok');
