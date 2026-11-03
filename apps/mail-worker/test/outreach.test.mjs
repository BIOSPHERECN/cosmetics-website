// 开发信回信关联(0098):node apps/mail-worker/test/outreach.test.mjs
// 假 D1:只记 SQL 与参数;三种来信 —— 正常回复(头对上)、客户端剥了头(只靠发件人兜底)、退订。
import assert from 'node:assert/strict';
import { linkOutreach, ownText, UNSUB_RE } from '../src/index.ts';

// 引用剥离:对方只写了一句,下面引用了我们带 "unsubscribe" 的原信 → 不算退订
const quoted = 'Sounds interesting, send your catalogue.\n\nOn Thu, Sep 18, 2026 at 9:00 AM BIOSPHERE <sales@biosphere-ai.com> wrote:\n> If this isn\'t relevant, reply "unsubscribe" and we won\'t write again.';
assert.equal(ownText(quoted), 'Sounds interesting, send your catalogue.');
assert.equal(UNSUB_RE.test(ownText(quoted)), false);
assert.equal(UNSUB_RE.test('please unsubscribe me'), true);
assert.equal(UNSUB_RE.test('we stopped by your booth'), false, 'stop 只认整词');
assert.equal(UNSUB_RE.test('STOP'), true);

function fakeDb(hit) {
  const log = [];
  const stmt = (sql) => ({ bind: (...a) => ({ sql, a, first: async () => hit, run: async () => ({}) }) });
  return { log, prepare: (sql) => { const s = stmt(sql); return { ...s, bind: (...a) => { const b = s.bind(...a); return b; } }; }, batch: async (xs) => { log.push(...xs.map((x) => [x.sql, x.a])); return []; } };
}
const hit = { id: 7, prospect_id: 12, contact_email: 'Ask@Beautyhaul.com', thread_id: '<outreach-7-abc@biosphere-ai.com>' };

// ① 正常回复
let db = fakeDb(hit);
let out = await linkOutreach({ DB: db }, 99, { from_addr: 'ask@beautyhaul.com', in_reply_to: '<outreach-7-abc@biosphere-ai.com>', thread_id: '<outreach-7-abc@biosphere-ai.com>', subject: 'Re: ceraplump', text: 'Yes, please send details.' });
assert.deepEqual(out, { outreach_id: 7, unsub: false });
assert.equal(db.log.length, 4);
assert.match(db.log[1][0], /status=\?/); assert.deepEqual(db.log[1][1], ['replied', 99, 7]);
assert.match(db.log[3][0], /'replied'/); assert.deepEqual(db.log[3][1], [12]);
assert.deepEqual(db.log[0][1], ['<outreach-7-abc@biosphere-ai.com>', 99], '来信 thread_id 对齐出站行');

// ② 退订(带引用也只看对方自己写的)
db = fakeDb(hit);
out = await linkOutreach({ DB: db }, 100, { from_addr: 'ask@beautyhaul.com', in_reply_to: null, thread_id: '<their-own@x>', subject: 'Re: ceraplump', text: 'Please remove me from your list.\n> If this isn\'t relevant, reply "unsubscribe"' });
assert.deepEqual(out, { outreach_id: 7, unsub: true });
assert.deepEqual(db.log[1][1], ['unsubscribed', 100, 7]);
assert.match(db.log[2][0], /outreach_suppress/); assert.deepEqual(db.log[2][1], ['ask@beautyhaul.com', '回信退订 mail #100'], '抑制名单小写');
assert.match(db.log[3][0], /'skip'/);

// ③ 没命中:不动任何表
db = fakeDb(null);
assert.equal(await linkOutreach({ DB: db }, 101, { from_addr: 'x@y.z', in_reply_to: null, thread_id: '<a@b>', subject: 's', text: 't' }), null);
assert.equal(db.log.length, 0);
console.log('outreach.test: all ok');
