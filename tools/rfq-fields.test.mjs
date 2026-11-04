// Market① RFQ 字段：node tools/rfq-fields.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lib = new URL('../apps/web/src/lib/rfq-fields.ts', import.meta.url);
const {
  assignInquiryField,
  FORMULA_PATHS,
  HALAL_READY,
  leadTimeWindowNote,
  normalizeRfqTicket,
  ORDER_BANDS,
  prefixFormulaPath,
  rfqDoorHref,
  rfqFieldCopy,
  rfqIntentEffect,
  rfqLinkPrefill,
  rfqPrefill,
  rfqQueryPrefill,
  rfqProductHooks,
  rfqTicketLines,
  TARGET_MARKETS,
  NOTIFY_COUNTRIES,
  YES_NO,
} = await import(lib);

const base = {
  target_market: 'SEA,GCC',
  halal_ready: 'yes',
  halal_scope_note: 'finished goods',
  notification_assist_country: 'ID,MY',
  first_order_band: '1k-5k',
  need_msds_coa: 'yes',
  need_written_lead_confirm: '1',
};

const ok = normalizeRfqTicket(base, false);
assert.equal(ok.ok, true);
assert.equal(ok.fields.target_market, 'SEA,GCC');
assert.equal(ok.fields.halal_ready, 'yes');
assert.equal(ok.fields.halal_scope_note, 'finished goods');
assert.equal(ok.fields.notification_assist_country, 'ID,MY');
assert.equal(ok.fields.first_order_band, '1k-5k');
assert.equal(ok.fields.need_msds_coa, 'yes');
assert.equal(ok.fields.need_written_lead_confirm, '1');
assert.match(ok.fields.lead_time_window_note, /interval only/i);
assert.match(ok.fields.lead_time_window_note, /written confirmation/i);
assert.match(ok.fields.lead_time_window_note, /5–14 days/);
assert.doesNotMatch(ok.fields.lead_time_window_note, /guarantee/i);

const lines = rfqTicketLines(ok.fields);
for (const key of ['target_market', 'halal_ready', 'halal_scope_note', 'notification_assist_country', 'first_order_band']) {
  assert.ok(lines.some((l) => l.startsWith(`${key}=`)), key);
}

const missing = normalizeRfqTicket({ ...base, target_market: '' }, false);
assert.equal(missing.ok, false);
assert.match(missing.msg, /target market/i);
const missingZh = normalizeRfqTicket({ target_market: 'Mars' }, true);
assert.equal(missingZh.ok, false);
assert.match(missingZh.msg, /目标市场/);

const other = normalizeRfqTicket({
  target_market: 'Other,SEA',
  target_market_other: 'Brazil',
  notification_assist_country: 'Other',
  notification_assist_other: 'QA',
  halal_ready: 'no',
  halal_scope_note: 'should drop',
  first_order_band: '>20k',
  need_written_lead_confirm: 'on',
}, false);
assert.equal(other.ok, true);
assert.equal(other.fields.target_market, 'SEA,Other:Brazil');
assert.equal(other.fields.notification_assist_country, 'Other:QA');
assert.equal(other.fields.halal_scope_note, '');
assert.equal(other.fields.first_order_band, '>20k');
assert.equal(other.fields.need_written_lead_confirm, '1');

const longNote = 'x'.repeat(400);
const clipped = normalizeRfqTicket({ target_market: 'GCC', halal_ready: 'yes', halal_scope_note: longNote }, false);
assert.equal(clipped.fields.halal_scope_note.length, 200);

assert.equal(normalizeRfqTicket({ target_market: 'SEA', first_order_band: '3000' }, false).fields.first_order_band, '');
assert.equal(normalizeRfqTicket({ target_market: 'SEA', halal_ready: 'certified' }, false).fields.halal_ready, '');
assert.equal(normalizeRfqTicket({ target_market: ['GCC', 'SEA'] }, true).fields.target_market, 'SEA,GCC');

const bag = {};
assignInquiryField(bag, 'target_market', 'SEA');
assignInquiryField(bag, 'target_market', 'Other');
assignInquiryField(bag, 'market', 'ID');
assignInquiryField(bag, 'market', 'US');
assert.equal(bag.target_market, 'SEA,Other');
assert.equal(bag.market, 'US');

assert.deepEqual(rfqPrefill('ID'), { target_market: ['SEA'], notification_assist_country: ['ID'] });
assert.deepEqual(rfqPrefill('AE'), { target_market: ['GCC'], notification_assist_country: ['AE'] });
assert.deepEqual(rfqPrefill('SEA'), { target_market: ['SEA'], notification_assist_country: [] });
assert.deepEqual(rfqPrefill('EU'), { target_market: ['EU'], notification_assist_country: ['EU'] });
assert.deepEqual(rfqPrefill('Indonesia, Saudi Arabia'), { target_market: [], notification_assist_country: [] });
assert.deepEqual(rfqQueryPrefill({ target_market: 'SEA' }), { target_market: ['SEA'], notification_assist_country: [] });
assert.deepEqual(rfqQueryPrefill({ market: 'ID', target_market: 'GCC' }), { target_market: ['SEA', 'GCC'], notification_assist_country: ['ID'] });
assert.deepEqual(rfqQueryPrefill({ market: 'Indonesia', target_market: 'booth' }), { target_market: [], notification_assist_country: [] });
assert.deepEqual(rfqQueryPrefill({ target_market: 'sea,gcc,other' }), { target_market: ['SEA', 'GCC', 'Other'], notification_assist_country: [] });
assert.deepEqual(rfqQueryPrefill({ target_market: 'eu,gcc' }), { target_market: ['GCC', 'EU'], notification_assist_country: [] });
assert.deepEqual(rfqLinkPrefill({
  target_market: 'EU',
  halal_ready: 'no',
  notification_assist_country: 'EU',
  first_order_band: 'tbd',
}), {
  target_market: ['EU'],
  notification_assist_country: ['EU'],
  halal_ready: 'no',
  first_order_band: 'tbd',
  need_msds_coa: '',
});
assert.equal(normalizeRfqTicket({ target_market: 'EU', notification_assist_country: 'EU', halal_ready: 'no', first_order_band: 'tbd' }, false).fields.target_market, 'EU');
assert.equal(normalizeRfqTicket({ target_market: 'EU', notification_assist_country: 'SA' }, false).fields.notification_assist_country, 'SA');
assert.deepEqual(rfqLinkPrefill({
  target_market: 'SEA',
  halal_ready: 'yes',
  notification_assist_country: 'ID',
  first_order_band: 'tbd',
}), {
  target_market: ['SEA'],
  notification_assist_country: ['ID'],
  halal_ready: 'yes',
  first_order_band: 'tbd',
  need_msds_coa: '',
});
assert.equal(rfqLinkPrefill({ target_market: 'GCC', halal_ready: 'certified', first_order_band: '3000' }).halal_ready, '');
assert.equal(rfqLinkPrefill({ target_market: 'GCC', halal_ready: 'unsure', need_msds_coa: 'yes', notification_assist_country: 'AE' }).need_msds_coa, 'yes');
assert.deepEqual(rfqLinkPrefill({ market: 'ID', notification_assist_country: 'MY' }).notification_assist_country, ['ID', 'MY']);

assert.deepEqual(rfqProductHooks({ hasContext: false, query: { spf_pa: 'SPF50' } }), { spf_pa: '', texture: '', skin_type: '' });
const fromList = rfqProductHooks({
  hasContext: true,
  specsJson: JSON.stringify([
    { label: 'SPF/PA', value: 'SPF50 PA+++' },
    { label: '肤感', value: 'gel' },
    { label: '肤质', value: 'oily' },
  ]),
});
assert.deepEqual(fromList, { spf_pa: 'SPF50 PA+++', texture: 'gel', skin_type: 'oily' });
const fromObj = rfqProductHooks({
  hasContext: true,
  specsJson: JSON.stringify({ spf: '50', pa: '+++', texture: 'cream' }),
  query: { skin_type: 'dry' },
});
assert.equal(fromObj.spf_pa, 'SPF 50 PA+++');
assert.equal(fromObj.texture, 'cream');
assert.equal(fromObj.skin_type, 'dry');
assert.equal(rfqProductHooks({
  hasContext: true,
  specsJson: JSON.stringify({ texture: '清爽啫喱' }),
  hideCjk: true,
}).texture, '');
assert.equal(rfqProductHooks({ hasContext: true, specsJson: '{}' }).spf_pa, '');

for (const zh of [false, true]) {
  const copy = JSON.stringify(rfqFieldCopy(zh));
  assert.doesNotMatch(copy, /halal certified/i);
  assert.doesNotMatch(copy, /moq\s*=\s*3000/i);
  assert.doesNotMatch(copy, /FDA approved|EU approved|欧盟批准|普草|低\s*MOQ/i);
  assert.doesNotMatch(copy, /Cosmopack|展位|联合展出/);
  const note = leadTimeWindowNote(zh);
  assert.match(note, /5–14/);
  assert.match(note, zh ? /书面确认/ : /written confirmation/i);
  assert.doesNotMatch(note, /moq\s*=\s*3000/i);
}
const en = rfqFieldCopy(false);
const zh = rfqFieldCopy(true);
assert.match(en.notify, /assist/i);
assert.match(en.notifyHint, /assist/i);
assert.match(en.notifyHint, /not an approval guarantee/i);
assert.match(zh.notify, /协助/);
assert.match(zh.notifyHint, /协助/);
assert.match(zh.notifyHint, /不是代办承诺/);
assert.match(en.held, /GMPC/);
assert.match(en.held, /ISO 22716/);
assert.match(en.held, /HALAL/);
assert.match(en.held, /separate/i);
assert.match(zh.held, /备案与通告是协助/);
assert.match(zh.pathLead, /现成/);
assert.match(zh.pathLead, /改方/);
assert.match(zh.pathLead, /全新/);
assert.match(zh.pathOpt.ready.name, /已有完整配方/);
assert.match(zh.pathOpt.tweak.name, /在现有配方上改方/);
assert.match(zh.pathOpt.new.name, /全新配方开发/);
assert.equal(zh.doorOpt.sample.name, '申请样品');
assert.equal(zh.doorOpt.quote.name, '询报价区间');
assert.equal(zh.doorOpt.docs.name, '申请文件包');
assert.match(zh.doorOpt.sample.hint, /仅样品/);
assert.match(zh.doorOpt.quote.hint, /不会自动生成报价/);
assert.match(zh.doorOpt.quote.hint, /书面/);
assert.match(zh.doorOpt.docs.hint, /不是获批/);
assert.match(zh.complyLine, /备案协助不是获批/);
assert.match(zh.complyLine, /清真就绪不是证书/);
assert.match(en.pathLead, /ready, tweak, or new/);
assert.match(en.pathOpt.ready.name, /We have a finished formula/);
assert.match(en.pathOpt.tweak.name, /Adapt an existing formula/);
assert.match(en.pathOpt.new.name, /Develop a new formula/);
assert.equal(en.doorOpt.sample.name, 'Request sample');
assert.equal(en.doorOpt.quote.name, 'Request quote band');
assert.equal(en.doorOpt.docs.name, 'Request docs pack');
assert.match(en.doorOpt.sample.hint, /Sample only/);
assert.match(en.doorOpt.quote.hint, /does not generate an automatic quote/i);
assert.match(en.doorOpt.quote.hint, /written reply/i);
assert.match(en.doorOpt.docs.hint, /not an approval/i);
assert.match(en.complyLine, /Filing assist is not approval/);
assert.match(en.complyLine, /Halal-ready is not a certificate/);
assert.doesNotMatch(`${en.complyLine}\n${zh.complyLine}`, /halal certified/i);

assert.deepEqual([...TARGET_MARKETS], ['SEA', 'GCC', 'EU', 'Other']);
assert.deepEqual([...HALAL_READY], ['yes', 'no', 'unsure']);
assert.deepEqual([...NOTIFY_COUNTRIES], ['ID', 'MY', 'TH', 'VN', 'AE', 'SA', 'EU', 'Other']);
assert.deepEqual([...ORDER_BANDS], ['sample', '<1k', '1k-5k', '5k-20k', '>20k', 'tbd']);
assert.deepEqual([...YES_NO], ['yes', 'no']);
assert.deepEqual([...FORMULA_PATHS], ['ready', 'tweak', 'new']);

assert.equal(prefixFormulaPath('', 'ready'), 'formula_path=ready');
assert.equal(prefixFormulaPath('  hello  ', ' tweak '), 'formula_path=tweak\nhello');
assert.equal(prefixFormulaPath('formula_path=new\nhello', 'new'), 'formula_path=new\nhello');
assert.equal(prefixFormulaPath('notes', 'certified'), 'notes');
assert.equal(prefixFormulaPath('notes', ''), 'notes');
assert.deepEqual(rfqIntentEffect('Sample'), { door: 'sample', suggestBand: 'sample', suggestMsds: '', emphasizeQuote: false });
assert.deepEqual(rfqIntentEffect('docs'), { door: 'docs', suggestBand: '', suggestMsds: 'yes', emphasizeQuote: false });
assert.deepEqual(rfqIntentEffect('quote'), { door: 'quote', suggestBand: '', suggestMsds: '', emphasizeQuote: true });
assert.deepEqual(rfqIntentEffect('oem-evidence'), { door: '', suggestBand: '', suggestMsds: '', emphasizeQuote: false });
assert.equal(rfqIntentEffect('quote').suggestBand, '');
assert.equal(rfqDoorHref('en', 'sample', ''), '/en/rfq/?intent=sample');
assert.equal(rfqDoorHref('zh-cn', 'docs', '?product_id=85&intent=quote'), '/zh-cn/rfq/?product_id=85&intent=docs');
assert.equal(
  rfqDoorHref('en', 'quote', '?product_id=85&about=Night Cream&intent=sample&junk=1'),
  '/en/rfq/?product_id=85&about=Night+Cream&intent=quote',
);
assert.equal(
  rfqDoorHref('en', 'sample', '?first_order_band=<1k&need_msds_coa=no'),
  '/en/rfq/?first_order_band=%3C1k&need_msds_coa=no&intent=sample',
);

const kept = normalizeRfqTicket({ ...base, formula_path: 'ready' }, false);
assert.equal(kept.ok, true);
assert.equal(Object.hasOwn(kept.fields, 'formula_path'), false);
assert.equal(rfqTicketLines(kept.fields).some((line) => line.startsWith('formula_path=')), false);

const page = readFileSync(new URL('../apps/web/src/pages/[lang]/rfq/index.astro', import.meta.url), 'utf8');
const api = readFileSync(new URL('../apps/web/src/pages/api/inquiry.ts', import.meta.url), 'utf8');
for (const key of ['target_market', 'halal_ready', 'halal_scope_note', 'notification_assist_country', 'first_order_band', 'need_msds_coa', 'need_written_lead_confirm']) {
  assert.match(page, new RegExp(`name="${key}"`));
}
assert.match(page, /target_market:/);
assert.match(page, /halal_ready:/);
assert.match(page, /halal_scope_note:/);
assert.match(page, /notification_assist_country:/);
assert.match(page, /first_order_band:/);
assert.match(page, /product_id/);
assert.match(page, /name="category"/);
assert.match(api, /normalizeRfqTicket/);
assert.match(api, /rfqTicketLines/);
assert.doesNotMatch(page, /halal certified/i);
assert.doesNotMatch(page, /moq\s*=\s*3000/i);
assert.doesNotMatch(page, /FDA approved|EU approved|欧盟批准|普草|低\s*MOQ/i);
assert.doesNotMatch(page, /Cosmopack|展位号|联合展出/);
assert.match(page, /name="formula_path"/);
assert.doesNotMatch(page, /name="formula_path"[^>\n]*required/);
assert.doesNotMatch(page, /formula_path\s*:/);
assert.match(page, /rfqDoorHref/);
assert.match(page, /data-door=/);
assert.match(page, /bandEl\.value = 'sample'/);
assert.match(page, /classList\.add\('is-quote'\)/);
assert.match(page, /need_msds_coa"\]\[value="yes"\]/);
assert.match(page, /formula_path=/);
assert.match(page, /Submitting does not generate an automatic quote/);
assert.match(page, /提交后不会自动报价/);
assert.match(page, /id="lead_time_window_note"/);
assert.match(api, /prefixFormulaPath\(message, f\.formula_path\)/);
assert.doesNotMatch(api, /INSERT INTO inquiries \([^)]*formula_path/);
const cache = readFileSync(new URL('../apps/web/src/middleware.ts', import.meta.url), 'utf8');
assert.match(cache, /const CACHE_V = 'v144'/);

console.log('rfq-fields.test.mjs:全部通过');
