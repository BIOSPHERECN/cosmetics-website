/**
 * 原始邮件 → mails 表一行 + 附件清单。纯函数,不碰 D1/R2,node 能直接跑测试(test/parse.test.mjs)。
 *
 * 解析交给 postal-mime(vendor/,MIT-0,Cloudflare 官方文档推荐的 Email Workers 解析器)。
 * 不手写 MIME:嵌套 multipart、quoted-printable、RFC 2047 头编码、GBK/ISO-2022-JP 字符集,
 * 自己写的解析器必然在其中一处栽在真实邮件上,而栽了的表现是「正文乱码 / 附件丢」,后台没人能看出来。
 */
import PostalMime, { type Email, type Address } from '../vendor/postal-mime/src/postal-mime.js';

export type MailRow = {
  message_id: string; thread_id: string; in_reply_to: string | null;
  from_addr: string; from_name: string; to_addrs: string; cc: string;
  subject: string; text: string; snippet: string; received_at: string;
  spf: string; dkim: string; spam_score: number; status: 'unread' | 'spam';
};
export type MailAttachment = { name: string; size: number; type: string; content: ArrayBuffer | Uint8Array | string | null; blocked?: string };
export type Parsed = { row: MailRow; html: string | null; attachments: MailAttachment[]; safeId: string };

/* 可执行 / 脚本类扩展名:不存不给下载,只记名字。宏文档(docm/xlsm)也算 —— 外贸圈钓鱼最常见的就是「PO 单.docm」 */
const EXEC = /\.(exe|js|jse|vbs|vbe|wsf|wsh|scr|bat|cmd|ps1|psm1|jar|msi|msp|com|pif|hta|cpl|reg|lnk|docm|xlsm|pptm|iso|img)$/i;
export const ATTACH_MAX = 15 * 1024 * 1024;
export const TEXT_MAX = 200_000;
/** 分值 ≥ 此值直接进垃圾箱(仍入库可捞,不转发不推群)。误杀了就把它调高 */
export const SPAM_THRESHOLD = 70;
const SPAMMY = /unsubscribe|退订|免费领取|casino|crypto|bitcoin|seo service|backlink|guest post|guaranteed|100% free|make money|loan offer|lottery|winner|viagra/i;

const flat = (list?: Address[]): { name: string; address: string }[] =>
  (list ?? []).flatMap((a) => (a.group ? a.group : [a])).filter((a) => a.address).map((a) => ({ name: a.name ?? '', address: String(a.address).toLowerCase() }));

/** Message-ID → R2 键片段。尖括号去掉,其余非安全字符换下划线;没有 Message-ID 的邮件由 parseMail 先造一个 */
export const safeIdOf = (messageId: string) => messageId.replace(/^<|>$/g, '').replace(/[^\w.@-]/g, '_').slice(0, 120);
/** 附件名:去掉路径分隔与控制字符,防 `../` 写到别的 R2 键 */
export const safeName = (name: string) => (name || 'file').replace(/[\\/]|[\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Authentication-Results 头里取 spf= / dkim= 的结果;Cloudflare Email Routing 会加这个头,没有就是 none */
export function authResults(email: Email): { spf: string; dkim: string } {
  const ar = email.headers.filter((h) => h.key === 'authentication-results').map((h) => h.value).join(' ; ');
  const receivedSpf = email.headers.find((h) => h.key === 'received-spf')?.value ?? '';
  const spf = /(?:^|[\s;])spf=(\w+)/i.exec(ar)?.[1] ?? /^\s*(\w+)/.exec(receivedSpf)?.[1] ?? 'none';
  const dkim = /(?:^|[\s;])dkim=(\w+)/i.exec(ar)?.[1] ?? 'none';
  return { spf: spf.toLowerCase(), dkim: dkim.toLowerCase() };
}

/* 垃圾分:规则简单到能在这里读完。每条加分的理由写在旁边,改阈值改 SPAM_THRESHOLD 一处 */
export function spamScore(o: { spf: string; dkim: string; subject: string; text: string; toCount: number; execAttach: boolean; replyToDiffers: boolean }): number {
  let s = 0;
  if (o.spf === 'fail') s += 40; else if (o.spf === 'softfail') s += 15;   // 发件域名明说「这台机器不是我的」
  if (o.dkim === 'fail') s += 20;                                            // 签名对不上:内容被改或伪造
  if (o.execAttach) s += 40;                                                 // 可执行附件:正经客户不会发 .exe
  if (SPAMMY.test(o.subject) || SPAMMY.test(o.text.slice(0, 4000))) s += 20; // 群发 / 推销词
  if (o.toCount > 20) s += 10;                                               // 群发
  if (o.replyToDiffers) s += 10;                                             // Reply-To 换了个域名:钓鱼常用
  return Math.min(100, s);
}

/** HTML 剥成纯文本(没有 text/plain 部分时用)—— 只为了列表摘要与 AI 阅读,不追求排版 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/\n\s*\n+/g, '\n\n').trim();
}

/** 会话线:References 里最早那个,其次 In-Reply-To,都没有就是自己 */
export function threadIdOf(messageId: string, inReplyTo?: string, references?: string): string {
  const refs = String(references ?? '').match(/<[^>]+>/g);
  return refs?.[0] ?? inReplyTo?.match(/<[^>]+>/)?.[0] ?? messageId;
}

export async function parseMail(raw: ArrayBuffer | Uint8Array | string, envelope: { from?: string; to?: string } = {}): Promise<Parsed> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
  const from = flat(email.from ? [email.from] : [])[0];
  const to = flat(email.to), cc = flat(email.cc);
  const messageId = email.messageId?.trim() || `<gen-${crypto.randomUUID()}@bohui-mail>`;
  const html = email.html ?? null;
  const text = (email.text?.trim() || (html ? htmlToPlain(html) : '')).slice(0, TEXT_MAX);
  const subject = (email.subject ?? '').trim().slice(0, 500);
  const { spf, dkim } = authResults(email);
  const fromAddr = (from?.address ?? envelope.from ?? '').toLowerCase();
  const replyTo = flat(email.replyTo)[0]?.address;
  const replyToDiffers = !!replyTo && !!fromAddr && replyTo.split('@')[1] !== fromAddr.split('@')[1];

  const attachments: MailAttachment[] = email.attachments.map((a) => {
    const name = safeName(a.filename ?? (a.contentId ? `inline-${a.contentId.replace(/[<>]/g, '')}` : 'attachment'));
    const size = typeof a.content === 'string' ? a.content.length : a.content.byteLength;
    const blocked = EXEC.test(name) ? '可执行/脚本类附件,不存' : size > ATTACH_MAX ? `超过 ${ATTACH_MAX / 1048576} MB,不存` : undefined;
    return { name, size, type: a.mimeType || 'application/octet-stream', content: blocked ? null : a.content, blocked };
  });

  const spam_score = spamScore({ spf, dkim, subject, text, toCount: to.length + cc.length, execAttach: attachments.some((a) => EXEC.test(a.name)), replyToDiffers });
  const d = email.date ? new Date(email.date) : new Date();
  const received_at = (isNaN(d.getTime()) ? new Date() : d).toISOString();

  return {
    safeId: safeIdOf(messageId),
    html,
    attachments,
    row: {
      message_id: messageId,
      thread_id: threadIdOf(messageId, email.inReplyTo, email.references),
      in_reply_to: email.inReplyTo?.trim() || null,
      from_addr: fromAddr,
      from_name: (from?.name ?? '').slice(0, 200),
      to_addrs: (to.map((a) => a.address).join(', ') || envelope.to || '').slice(0, 2000),
      cc: cc.map((a) => a.address).join(', ').slice(0, 2000),
      subject, text,
      snippet: text.replace(/\s+/g, ' ').slice(0, 160),
      received_at, spf, dkim, spam_score,
      status: spam_score >= SPAM_THRESHOLD ? 'spam' : 'unread',
    },
  };
}
