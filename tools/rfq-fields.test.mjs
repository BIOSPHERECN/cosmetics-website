// Market① RFQ 字段：node tools/rfq-fields.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lib = new URL('../apps/web/src/lib/rfq-fields.ts', import.meta.url);
const {
  assignInquiryField,
  leadTimeWindowNote,
  normalizeRfqTicket,
  rfqFieldCopy,
  rfqLinkPrefill,
  rfqPrefill,
  rfqQueryPrefill,
  rfqProductHooks,
  rfqTicketLines,
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
assert.doesNotMatch(page, /Cosmopack|展位号|联合展出/);

console.log('rfq-fields.test.mjs:全部通过');
