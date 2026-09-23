// 解析器自检:node apps/mail-worker/test/parse.test.mjs(Node ≥ 22.18,直接跑 .ts)
// 一封「客户询盘 + PDF 附件 + 伪装 .exe + 回复线索」的样例,断言落库行的每个关键字段。
import assert from 'node:assert/strict';
import { parseMail, threadIdOf, spamScore, htmlToPlain, safeName } from '../src/parse.ts';

const pdf = Buffer.from('%PDF-1.4 fake').toString('base64');
const eml = [
  'Received: from mail.example.com by mx.cloudflare.net',
  'Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass',
  'From: =?UTF-8?B?546L5bCP5piO?= <wang@example.com>',
  'To: inquiry@biosphere-ai.com, Sales <sales@biosphere-ai.com>',
  'Cc: boss@example.com',
  'Subject: =?UTF-8?Q?Private_label_serum_=E8=AF=A2=E4=BB=B7?=',
  'Date: Thu, 18 Sep 2026 03:15:00 +0000',
  'Message-ID: <abc-123@example.com>',
  'In-Reply-To: <first@biosphere-ai.com>',
  'References: <first@biosphere-ai.com> <second@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="MIX"',
  '',
  '--MIX',
  'Content-Type: multipart/alternative; boundary="ALT"',
  '',
  '--ALT',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Hi, we need 5,000 pcs vitamin C serum =E4=BD=A0=E5=A5=BD for Indonesia.',
  '--ALT',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Hi, we need <b>5,000 pcs</b> vitamin C serum.</p><script>alert(1)</script>',
  '--ALT--',
  '--MIX',
  'Content-Type: application/pdf; name="spec.pdf"',
  'Content-Disposition: attachment; filename="spec.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  pdf,
  '--MIX',
  'Content-Type: application/octet-stream; name="PO order.exe"',
  'Content-Disposition: attachment; filename="../PO order.exe"',
  'Content-Transfer-Encoding: base64',
  '',
  'TVqQAAMAAAAEAAAA',
  '--MIX--',
  '',
].join('\r\n');

const p = await parseMail(eml, { from: 'bounce@example.com', to: 'inquiry@biosphere-ai.com' });
const m = p.row;
assert.equal(m.message_id, '<abc-123@example.com>');
assert.equal(m.thread_id, '<first@biosphere-ai.com>', 'References 里最早那个是会话线');
assert.equal(m.in_reply_to, '<first@biosphere-ai.com>');
assert.equal(m.from_addr, 'wang@example.com');
assert.equal(m.from_name, '王小明', 'RFC 2047 头解码');
assert.equal(m.to_addrs, 'inquiry@biosphere-ai.com, sales@biosphere-ai.com');
assert.equal(m.cc, 'boss@example.com');
assert.equal(m.subject, 'Private label serum 询价');
assert.match(m.text, /5,000 pcs vitamin C serum 你好 for Indonesia/, 'quoted-printable 解码');
assert.equal(m.spf, 'pass'); assert.equal(m.dkim, 'pass');
assert.equal(m.received_at, '2026-09-18T03:15:00.000Z');
assert.ok(p.html && p.html.includes('<b>5,000 pcs</b>'));
assert.equal(p.safeId, 'abc-123@example.com');
assert.equal(p.attachments.length, 2);
assert.deepEqual(p.attachments.map((a) => [a.name, !!a.blocked]), [['spec.pdf', false], ['.._PO order.exe', true]], '.exe 拦下且路径符号被换掉');
assert.equal(p.attachments[0].size, Buffer.from(pdf, 'base64').length);
assert.equal(p.attachments[0].type, 'application/pdf');
// 可执行附件 +40,其余都干净 → 40,不到 70 不进垃圾箱,但胶囊要标
assert.equal(m.spam_score, 40); assert.equal(m.status, 'unread');

// 规则单独再点几下
assert.equal(spamScore({ spf: 'fail', dkim: 'fail', subject: 'Unsubscribe now', text: '', toCount: 30, execAttach: false, replyToDiffers: true }), 100);
assert.equal(spamScore({ spf: 'pass', dkim: 'pass', subject: 'hello', text: 'plain', toCount: 1, execAttach: false, replyToDiffers: false }), 0);
assert.equal(threadIdOf('<x>', undefined, undefined), '<x>');
assert.equal(threadIdOf('<x>', '<y>', undefined), '<y>');
assert.equal(htmlToPlain('<div>a<br>b</div><script>x()</script>&amp;'), 'a\nb\n&');
assert.equal(safeName('..\\..\\evil.txt'), '.._.._evil.txt');

// 没有 Message-ID、没有 text/plain 的裸 HTML 邮件:要造 id,正文从 HTML 剥
const p2 = await parseMail('From: a@b.co\r\nSubject: hi\r\nContent-Type: text/html\r\n\r\n<p>only html</p>', {});
assert.match(p2.row.message_id, /^<gen-[0-9a-f-]+@bohui-mail>$/);
assert.equal(p2.row.thread_id, p2.row.message_id);
assert.equal(p2.row.text, 'only html');
assert.equal(p2.row.spf, 'none');

console.log('parse.test: all ok');
