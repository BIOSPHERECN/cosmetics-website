// 后台展示 HTML 正文前的清洗:node apps/mail-worker/test/sanitize.test.mjs
import assert from 'node:assert/strict';
import { sanitizeHtml, redact } from '../../web/src/lib/mail.ts';

const dirty = '<html><head><meta http-equiv="refresh" content="0;url=http://evil"><script>alert(1)</script><link rel=stylesheet href=x></head>'
  + '<body onload="x()"><p style="color:red" onclick=\'y()\'>Hi <a href="javascript:alert(2)">x</a> <a href="https://ok.example/a">ok</a></p>'
  + '<iframe src="http://evil"></iframe><form action="http://evil"><input></form><img src="http://track/p.gif" onerror="z()"></body></html>';
const out = sanitizeHtml(dirty);
assert.ok(!/<script/i.test(out) && !/alert\(1\)/.test(out), 'script 连内容一起删');
assert.ok(!/<(meta|link|iframe|form)\b/i.test(out), '外联 / 表单 / 内嵌帧标签删掉');
assert.ok(!/\son(load|click|error)\s*=/i.test(out), 'on* 事件属性删掉');
assert.ok(!/javascript:/i.test(out), 'javascript: 链接废掉');
assert.ok(out.includes('href="https://ok.example/a"'), '正常链接保留');
assert.ok(out.includes('style="color:red"'), '内联样式保留(排版靠它)');
assert.ok(out.includes('<base target="_blank">'), '链接一律新窗口');
assert.ok(sanitizeHtml('<p>no head</p>').startsWith('<base target="_blank">'), '没有 head 的片段也加 base');

assert.equal(redact('call +62 812-3456-7890 or mail me@x.com see https://a.b/c now'), 'call [phone] or mail [email] see [url] now');
assert.equal(redact('order 5,000 pcs in 2026'), 'order 5,000 pcs in 2026', '短数字不当电话');
console.log('sanitize.test: all ok');

// ── 发信三选一(sendMail):Cloudflare Email Sending → Resend → 置灰 ──
const { sendMail, canSend, mailFrom } = await import('../../web/src/lib/mail.ts');
assert.deepEqual(mailFrom({}), { name: 'BIOSPHERE', email: 'inquiry@biosphere-ai.com', raw: 'BIOSPHERE <inquiry@biosphere-ai.com>' });
assert.equal(mailFrom({ MAIL_FROM: 'sales@biosphere-ai.com' }).name, '');
assert.equal(canSend({}), false); assert.equal(canSend({ EMAIL: { send: async () => ({}) } }), true); assert.equal(canSend({ RESEND_API_KEY: 'x' }), true);

const base = { to: ['a@b.co'], subject: 'S', text: 'T', headers: { 'In-Reply-To': '<x>', References: '<x>' } };
let r = await sendMail({}, base);
assert.equal(r.ok, false); assert.match(r.msg, /接入域名/);

const calls = [];
r = await sendMail({ EMAIL: { send: async (m) => { calls.push(m); return { messageId: 'cf-1' }; } } }, base);
assert.deepEqual([r.ok, r.via, r.id], [true, 'cloudflare', 'cf-1']);
assert.deepEqual(calls[0].from, { email: 'inquiry@biosphere-ai.com', name: 'BIOSPHERE' });
assert.deepEqual(calls[0].headers, base.headers, '串会话的头带上了');

calls.length = 0;
r = await sendMail({ EMAIL: { send: async (m) => { calls.push(m); if (m.headers) { const e = new Error('hdr'); e.code = 'E_HEADER_NOT_ALLOWED'; throw e; } return { messageId: 'cf-2' }; } } }, base);
assert.equal(r.id, 'cf-2'); assert.equal(calls.length, 2); assert.equal(calls[1].headers, undefined, '头被拒就去头重发');

r = await sendMail({ EMAIL: { send: async () => { const e = new Error('nv'); e.code = 'E_SENDER_NOT_VERIFIED'; throw e; } } }, base);
assert.equal(r.ok, false); assert.match(r.msg, /E_SENDER_NOT_VERIFIED/); assert.match(r.msg, /接入域名/);

const realFetch = globalThis.fetch; let resendBody = null;
globalThis.fetch = async (url, init) => { resendBody = JSON.parse(init.body); return new Response(JSON.stringify({ id: 'rs-1' }), { status: 200 }); };
r = await sendMail({ EMAIL: { send: async () => { const e = new Error('nv'); e.code = 'E_SENDER_NOT_VERIFIED'; throw e; } }, RESEND_API_KEY: 'k' }, base);
globalThis.fetch = realFetch;
assert.deepEqual([r.ok, r.via, r.id], [true, 'resend', 'rs-1'], 'Cloudflare 域名没接入时退到 Resend');
assert.equal(resendBody.from, 'BIOSPHERE <inquiry@biosphere-ai.com>');
console.log('sendMail.test: all ok');
