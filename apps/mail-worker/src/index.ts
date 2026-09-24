/**
 * bohui-mail —— 域名邮箱收信 Worker(2026-09-18,创始人:「客户邮件统一在后台可以看到,并有提醒,避免错过」)。
 *
 * 为什么是独立 Worker 而不是挂在 bohui-web 上:Astro 的 Cloudflare 适配器(v14)把 Worker 入口写死成 `{ fetch }`,
 * 没有地方导出 email / scheduled。所以这里单独一个小 Worker,绑定**同一个** D1 与 R2,主站只读表、不碰收信。
 *
 * 三个入口:
 *   email      Cloudflare Email Routing 把发到 *@biosphere-ai.com 的信投进来 → parse → D1 mails + R2 附件 → 开发信回信关联(linkOutreach)→ 转发 → AI 分类 + 推群(waitUntil)
 *   scheduled  每天 UTC 01:00(北京 09:00)未处理汇总 → 发给 MAIL_DIGEST_TO(Cloudflare Email Sending 优先,Resend 备选);发不了就在 jobs 表记「未发」
 *   fetch      运维口:GET /?key=CRON_KEY&op=digest 手动跑汇总;POST /ingest?key= 投一封 .eml 走完整链路(不真发邮件也能验)
 *
 * 入库永远排第一:转发、AI、推群任一失败都不影响那封信已经在后台这个事实。
 */
import { parseMail, type Parsed } from './parse.ts';   // 带扩展名:node 直接跑 test/outreach.test.mjs 也能解析
import { classifyMail, notifyHook, mailAlert, sendMail, canSend, HOT } from '../../web/src/lib/mail.ts';

export interface Env {
  DB: D1Database;
  PHOTO: R2Bucket;
  /** Cloudflare Email Sending 的 send_email 绑定(wrangler.jsonc);没开通时为 undefined,sendMail 自动退到 Resend / 未发 */
  EMAIL?: { send(message: unknown): Promise<{ messageId: string }> };
  CRON_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** 逗号分隔,每个都必须是 Email Routing 里验证过的目的地址,否则 forward 抛错(只记日志) */
  MAIL_FORWARD_TO?: string;
  NOTIFY_WEBHOOK?: string;
  NOTIFY_CHAT_ID?: string;
  MAIL_DIGEST_TO?: string;
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const raw = await new Response(message.raw).arrayBuffer();
    let r: Awaited<ReturnType<typeof ingest>> | null = null;
    try {
      r = await ingest(env, raw, { from: message.from, to: message.to });
    } catch (e) {
      // 入库失败不 setReject:拒收会让客户收到退信。转发照做,至少人的邮箱里有一份。
      console.error('[bohui-mail] ingest failed', String(e));
    }
    if (r?.dup) return;   // Email Routing 偶发重投:库里已有,不再转发第二次
    if (r?.status !== 'spam') {
      for (const addr of forwardList(env)) {
        try { await message.forward(addr); } catch (e) { console.error('[bohui-mail] forward', addr, String(e)); }
      }
    }
    if (r && r.status !== 'spam') ctx.waitUntil(enrich(env, r.id));
  },

  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(digest(env));
  },

  async fetch(req: Request, env: Env) {
    const u = new URL(req.url);
    const key = u.searchParams.get('key') ?? req.headers.get('x-cron-key') ?? '';
    if (u.pathname === '/' && req.method === 'GET' && !u.searchParams.has('op')) return new Response('bohui-mail ok');
    if (!env.CRON_KEY || key !== env.CRON_KEY) return json({ ok: false, msg: 'forbidden' }, 403);
    if (u.searchParams.get('op') === 'digest') return json(await digest(env));
    /* 发信通道自测(09-23 W2):POST ?op=test-send&site=beauty2oem.com&to=inquiry@biosphere-ai.com。
       收件人只准自家域名,主题固定带【内部测试】—— 这个口子发不了外信;对方域名的收信 Worker 入库即算通 */
    if (u.searchParams.get('op') === 'test-send' && req.method === 'POST') {
      const to = u.searchParams.get('to') ?? '';
      if (!/^[^@\s]+@(biosphere-ai|beauty2oem)\.com$/i.test(to)) return json({ ok: false, msg: '只准发到自家域名' }, 400);
      const r = await sendMail(env, { to: [to], site: u.searchParams.get('site'), subject: `【内部测试】发信通道自测 ${new Date().toISOString()}`, text: '内部互发测试,无需处理。' });
      return json(r);
    }
    if (u.pathname === '/ingest' && req.method === 'POST') {
      const raw = await req.arrayBuffer();
      if (!raw.byteLength) return json({ ok: false, msg: 'empty body' }, 400);
      const r = await ingest(env, raw, {});
      const ai = r.dup || r.status === 'spam' ? null : await enrich(env, r.id);
      return json({ ok: true, ...r, ai });
    }
    return json({ ok: false, msg: 'not found' }, 404);
  },
};

const forwardList = (env: Env) => String(env.MAIL_FORWARD_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/* ── 邮件防护(创始人 2026-09-18 17:3x「万一别人用大附件炸我们,R2 费用就爆了!一定要先审核,确认是我们的才可以接收」)──
 * 三道闸,任一不过附件就不落 R2(只记名字和大小,后台能看到「被拦」原因,人点「信任此发件人」后让对方重发):
 *   ① 发件人信任:mail_trust 白名单(邮箱 / @域名)、CRM 联系人、线索联系人、我们发过信的地址、开发信收件人、后台账号 → trusted;
 *      被判垃圾 → spam;其余 → unknown。unknown 只存正文(≤200KB 文本已在 parse 截),附件与 html 一律不存。
 *   ② 每封:trusted 也只存 ≤ ATTACH_MAX 的单附件、合计 ≤ PER_MAIL_MAX。
 *   ③ 每日:mail_quota 当日落 R2 字节 ≥ DAY_MAX 就全停,封数 ≥ DAY_MAILS 也停(轰炸时 D1 也别被写爆)。 */
const PER_MAIL_MAX = 20 * 1024 * 1024;
const DAY_MAX = 300 * 1024 * 1024;
const DAY_MAILS = 500;
const dom = (addr: string) => '@' + (addr.split('@')[1] ?? '');
export async function trustOf(env: Env, fromAddr: string, isSpam: boolean): Promise<'trusted' | 'unknown' | 'spam'> {
  const a = (fromAddr || '').toLowerCase(); if (!a.includes('@')) return isSpam ? 'spam' : 'unknown';
  const d = dom(a);
  const blocked = await env.DB.prepare(`SELECT level FROM mail_trust WHERE pattern IN (?, ?) ORDER BY (pattern=?) DESC LIMIT 1`).bind(a, d, a).first<{ level: string }>().catch(() => null);
  if (blocked?.level === 'blocked') return 'spam';
  if (isSpam) return 'spam';
  if (blocked?.level === 'trusted') return 'trusted';
  const hit = await env.DB.prepare(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM contacts WHERE lower(email)=?)
        OR EXISTS (SELECT 1 FROM prospect_contacts WHERE lower(email)=?)
        OR EXISTS (SELECT 1 FROM outreach_log WHERE lower(contact_email)=?)
        OR EXISTS (SELECT 1 FROM users WHERE lower(email)=?)
        OR EXISTS (SELECT 1 FROM mails WHERE direction='out' AND instr(lower(to_addrs), ?)>0)`,
  ).bind(a, a, a, a, a).first().catch(() => null);
  return hit ? 'trusted' : 'unknown';
}
async function quotaOk(env: Env): Promise<{ ok: boolean; why?: string }> {
  const day = new Date().toISOString().slice(0, 10);
  const q = await env.DB.prepare(`SELECT bytes, mails FROM mail_quota WHERE day=?`).bind(day).first<{ bytes: number; mails: number }>().catch(() => null);
  if ((q?.mails ?? 0) >= DAY_MAILS) return { ok: false, why: `今日已入库 ${q?.mails} 封,超过 ${DAY_MAILS} 封上限` };
  if ((q?.bytes ?? 0) >= DAY_MAX) return { ok: false, why: `今日附件已占 ${Math.round((q?.bytes ?? 0) / 1048576)} MB,超过 ${DAY_MAX / 1048576} MB 上限` };
  return { ok: true };
}
const bumpQuota = (env: Env, bytes: number, mails: number) => {
  const day = new Date().toISOString().slice(0, 10);
  return env.DB.prepare(`INSERT INTO mail_quota (day, bytes, mails) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET bytes=bytes+excluded.bytes, mails=mails+excluded.mails`).bind(day, bytes, mails).run();
};

/** 解析 + 入库 + 附件进 R2。返回 { id, dup, status }。dup = message_id 已存在(重投),什么都没写 */
export async function ingest(env: Env, raw: ArrayBuffer, envelope: { from?: string; to?: string }) {
  const p: Parsed = await parseMail(raw, envelope);
  const m = p.row;
  const quota = await quotaOk(env);
  if (!quota.ok) { console.error('[bohui-mail] quota', quota.why); return { id: 0, dup: false, status: 'dropped', why: quota.why }; }   // 轰炸期:整封不入库,只留一行日志
  const trust = await trustOf(env, m.from_addr, m.status === 'spam');
  // 先 INSERT OR IGNORE 判重,再传 R2 —— 反过来的话重投一次就多传一份附件
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO mails (direction, message_id, thread_id, from_addr, from_name, to_addrs, cc, subject, text, snippet, received_at, spf, dkim, spam_score, status, trust, company_id)
     VALUES ('in', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, (SELECT company_id FROM contacts WHERE lower(email)=? LIMIT 1))`,
  ).bind(m.message_id, m.thread_id, m.from_addr, m.from_name, m.to_addrs, m.cc, m.subject, m.text, m.snippet, m.received_at, m.spf, m.dkim, m.spam_score, m.status, trust, m.from_addr).run();
  if ((ins.meta?.changes ?? 0) === 0) {
    const old = await env.DB.prepare(`SELECT id, status FROM mails WHERE message_id=?`).bind(m.message_id).first<{ id: number; status: string }>();
    return { id: old?.id ?? 0, dup: true, status: old?.status ?? 'unread' };
  }
  const id = Number(ins.meta.last_row_id);

  const list: { name: string; size: number; type: string; r2_key?: string; blocked?: string }[] = [];
  let stored = 0;
  const gate = trust === 'trusted' ? null : trust === 'spam' ? '判为垃圾邮件,附件不存' : '陌生发件人,附件先不存;在邮件中心点「信任此发件人」后请对方重发';
  for (const [i, a] of p.attachments.entries()) {
    if (a.blocked || a.content == null) { list.push({ name: a.name, size: a.size, type: a.type, blocked: a.blocked ?? '空附件' }); continue; }
    if (gate) { list.push({ name: a.name, size: a.size, type: a.type, blocked: gate }); continue; }
    if (stored + a.size > PER_MAIL_MAX) { list.push({ name: a.name, size: a.size, type: a.type, blocked: `本封附件合计超过 ${PER_MAIL_MAX / 1048576} MB,不存` }); continue; }
    const r2_key = `mail/${p.safeId}/${i}-${a.name}`;
    try {
      await env.PHOTO.put(r2_key, a.content as ArrayBuffer, { httpMetadata: { contentType: a.type } });
      list.push({ name: a.name, size: a.size, type: a.type, r2_key }); stored += a.size;
    } catch (e) { list.push({ name: a.name, size: a.size, type: a.type, blocked: `R2 写入失败:${String(e).slice(0, 80)}` }); }
  }
  let html_key: string | null = null;
  if (p.html && trust === 'trusted' && p.html.length <= 512 * 1024) {   // 陌生人的 html 也不存:正文 text 已够看,html 里的远程图片/跟踪像素本来就不该给
    html_key = `mail/${p.safeId}/body.html`;
    try { await env.PHOTO.put(html_key, p.html, { httpMetadata: { contentType: 'text/html; charset=utf-8' } }); stored += p.html.length; } catch { html_key = null; }
  }
  /* 原始 .eml 整封归档(0100):可信发件人且 ≤2MB 才存 —— 完整原件可重解析、不依赖任何外部邮箱;陌生人/垃圾不占 R2 */
  let raw_key: string | null = null;
  if (trust === 'trusted' && raw.byteLength <= 2 * 1024 * 1024) {
    raw_key = `mail/${p.safeId}/raw.eml`;
    try { await env.PHOTO.put(raw_key, raw, { httpMetadata: { contentType: 'message/rfc822' } }); stored += raw.byteLength; } catch { raw_key = null; }
  }
  try { await bumpQuota(env, stored, 1); } catch (e) { console.error('[bohui-mail] quota bump', String(e)); }
  await env.DB.prepare(`UPDATE mails SET attachments_json=?, html_key=?, raw_key=? WHERE id=?`).bind(list.length ? JSON.stringify(list) : null, html_key, raw_key, id).run();
  try { await linkOutreach(env, id, m); } catch (e) { console.error('[bohui-mail] outreach link', String(e)); }
  return { id, dup: false, status: m.status };
}

/** 退订词:主题或对方自己写的那段正文命中即视为退订(专家口径:隐藏退订方式是红线,对方说停就必须停) */
export const UNSUB_RE = /unsubscribe|opt[- ]?out|remove me|do not (email|contact)|\bstop\b|取消订阅|退订|不要再/i;
/** 只留对方自己写的部分:引用块(> / On … wrote: / From: / Original Message)之后全砍 —— 我们的开发信末尾就有 "reply unsubscribe",不砍引用会把每封正常回信都判成退订 */
export const ownText = (t: string) => t.split(/\n\s*(?:>|On .{0,200}wrote:|From:\s|-{3,}\s?Original Message|Sent from my)/i)[0];

/**
 * 开发信回信关联(0098 outreach_log)。两种命中,任一即算:
 *   ① In-Reply-To / References(parse 已折成 thread_id)对上我们出站行的 message_id —— 标准串会话;
 *   ② 发件人就是某封已发开发信的收件人 —— 对方用别的客户端回、头被剥掉时的兜底。
 * 命中后:本封 thread_id 对齐出站行(后台邮件中心同一条线里能看到往返);outreach_log → replied;prospects → replied(已进 meeting / quoted 的不动)。
 * 回信里说 unsubscribe / stop / 取消 → outreach_log → unsubscribed,邮箱进 outreach_suppress(发送前必查),线索标 skip。
 * 不管这封被判没判垃圾都跑:退订信常带 unsubscribe 字样、正好被规则分加分,漏掉它比多处理一封垃圾贵。
 */
export async function linkOutreach(env: Env, mailId: number, m: { from_addr: string; in_reply_to: string | null; thread_id: string; subject: string; text: string }) {
  const hit = await env.DB.prepare(
    `SELECT o.id, o.prospect_id, o.contact_email, mo.thread_id FROM outreach_log o LEFT JOIN mails mo ON mo.id=o.mail_id
      WHERE o.status IN ('sent','replied') AND (mo.message_id IN (?, ?) OR lower(o.contact_email)=?) ORDER BY o.sent_at DESC LIMIT 1`,
  ).bind(m.thread_id, m.in_reply_to ?? '', (m.from_addr ?? '').toLowerCase()).first<{ id: number; prospect_id: number; contact_email: string; thread_id: string | null }>();
  if (!hit) return null;
  const unsub = UNSUB_RE.test(`${m.subject ?? ''} ${ownText(m.text ?? '').slice(0, 600)}`);
  await env.DB.batch([
    env.DB.prepare(`UPDATE mails SET thread_id=COALESCE(?, thread_id) WHERE id=?`).bind(hit.thread_id, mailId),
    env.DB.prepare(`UPDATE outreach_log SET status=?, reply_mail_id=COALESCE(reply_mail_id, ?), replied_at=COALESCE(replied_at, datetime('now')) WHERE id=?`).bind(unsub ? 'unsubscribed' : 'replied', mailId, hit.id),
    unsub
      ? env.DB.prepare(`INSERT OR IGNORE INTO outreach_suppress (email, reason) VALUES (?, ?)`).bind(hit.contact_email.toLowerCase(), `回信退订 mail #${mailId}`)
      : env.DB.prepare(`SELECT 1`),
    env.DB.prepare(unsub
      ? `UPDATE prospects SET status='skip', note=COALESCE(note,'') || char(10) || '[系统] 对方回信退订,已进抑制名单', updated_at=datetime('now') WHERE id=?`
      : `UPDATE prospects SET status=CASE WHEN status IN ('new','sent') THEN 'replied' ELSE status END, updated_at=datetime('now') WHERE id=?`).bind(hit.prospect_id),
  ]);
  return { outreach_id: hit.id, unsub };
}

/** AI 分类 / 摘要 / 建议回复 → 写回;询盘 / 报价 / 样品 立即推群。全程 best-effort */
export async function enrich(env: Env, id: number) {
  const m = await env.DB.prepare(`SELECT id, from_addr, from_name, subject, text, spam_score, status FROM mails WHERE id=?`).bind(id).first<any>();
  if (!m) return null;
  let v: Awaited<ReturnType<typeof classifyMail>> | null = null;
  try { v = await classifyMail(env.DB, env, m, id); } catch (e) { console.error('[bohui-mail] ai', String(e)); return null; }
  // AI 说垃圾且规则分也不干净(≥20)才真进垃圾箱;AI 单方面说垃圾只贴胶囊,人复核 —— 误杀一封询盘比多看一封广告贵得多
  const toSpam = v.category === '垃圾' && Number(m.spam_score ?? 0) >= 20 && m.status === 'unread';
  await env.DB.prepare(`UPDATE mails SET ai_category=?, ai_summary=?, ai_reply=?${toSpam ? ", status='spam'" : ''} WHERE id=?`)
    .bind(v.category, v.summary, v.reply, id).run();
  let notified = false;
  if (HOT.has(v.category)) {
    const a = mailAlert({ ...m, ai_category: v.category, ai_summary: v.summary });
    notified = await notifyHook(env, a.text, a.markdown);
  }
  return { ...v, notified };
}

/** 每天 09:00 的未处理汇总。未处理 = 收件且还没回、没归档、没进垃圾箱 */
export async function digest(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, from_addr, from_name, subject, ai_category, ai_summary, received_at, status FROM mails
      WHERE direction='in' AND status IN ('unread','read') AND replied_at IS NULL ORDER BY received_at DESC LIMIT 40`,
  ).all<any>();
  const rows = results ?? [];
  const unread = rows.filter((r) => r.status === 'unread').length;
  const to = String(env.MAIL_DIGEST_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let status = 'done', note = `未处理 ${rows.length} 封(未读 ${unread})`;
  if (!rows.length) { note += ',无需发送'; status = 'done'; }
  else if (!to.length || !canSend(env)) { status = 'skipped'; note += `;未发:${!to.length ? '未配 MAIL_DIGEST_TO' : '发信未接入(Cloudflare 电子邮件发送 / Resend 都没有)'}`; }
  else {
    const lines = rows.map((r) => `· [${r.ai_category ?? '待分类'}] ${r.subject ?? '(无主题)'} — ${r.from_name || r.from_addr}${r.ai_summary ? '\n    ' + r.ai_summary : ''}\n    https://biosphere-ai.com/bohui/mail/?id=${r.id}`);
    const text = `帛卉邮件中心 · 每日未处理汇总\n\n未处理 ${rows.length} 封,其中未读 ${unread} 封:\n\n${lines.join('\n')}\n\n后台:https://biosphere-ai.com/bohui/mail/`;
    const r = await sendMail(env, { to, subject: `[邮件中心] ${rows.length} 封待处理(未读 ${unread})`, text });
    if (r.ok) note += `;已发 ${to.join(',')}(${r.via})`; else { status = 'failed'; note += `;发送失败:${r.msg}`; }
  }
  // 任务中心留一行:创始人在后台「任务中心」能看到汇总有没有跑、有没有发
  await env.DB.prepare(`INSERT INTO jobs (name, job_type, host, status, total, note, finished_at) VALUES ('mail-digest','cron','bohui-mail',?,?,?,datetime('now'))`)
    .bind(status, rows.length, note).run().catch(() => {});
  return { status, total: rows.length, unread, note };
}
