// RFQ 深链的产品上下文:node tools/rfq-context.test.mjs
import assert from 'node:assert/strict';

const lib = new URL('../apps/web/src/lib/rfq-context.ts', import.meta.url);
const { rfqCanLookup, rfqHasContext, rfqIdState } = await import(lib);

const ctx = (over) => rfqHasContext({ productId: '', about: '', formula: '', category: '', ...over });
const st = (over) => rfqIdState({ productId: '', about: '', formula: '', category: '', lookup: 'skip', ...over });

assert.equal(ctx({}), false);
assert.equal(ctx({ market: 'ID' }), false);
assert.equal(ctx({ productId: '85' }), true);
assert.equal(ctx({ about: 'Night Cream' }), true);
assert.equal(ctx({ formula: 'SR-1101' }), true);
assert.equal(ctx({ category: 'serum' }), true);

assert.equal(st({}), '');
assert.equal(st({ productId: '85', lookup: 'found' }), '');
assert.equal(st({ productId: '85', lookup: 'skip' }), '');
assert.equal(st({ productId: '85', lookup: 'error' }), '');
assert.equal(st({ productId: 'SR-1101', lookup: 'miss' }), '');
assert.equal(st({ productId: 'AL-002-5', lookup: 'miss' }), '');
assert.equal(st({ about: 'Night Cream', category: 'serum' }), 'missing');
assert.equal(st({ formula: 'SR-1101' }), 'missing');
assert.equal(st({ productId: '!!!' }), 'bad');
assert.equal(st({ productId: 'bad id' }), 'bad');
assert.equal(st({ productId: 'no-such-product', lookup: 'miss' }), 'bad');
assert.equal(st({ productId: '999999', lookup: 'miss' }), 'bad');
assert.equal(st({ productId: '85', about: 'Night Cream', category: 'serum', lookup: 'found' }), '');
assert.equal(rfqCanLookup('85'), true);
assert.equal(rfqCanLookup('AL-002-5'), true);
assert.equal(rfqCanLookup('!!!'), false);
assert.equal(rfqCanLookup(''), false);

console.log('rfq-context.test.mjs:全部通过');
