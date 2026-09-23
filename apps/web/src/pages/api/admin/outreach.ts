import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, type Ctx } from '../../../lib/guard';
import { sendMail, canSend, mailFrom } from '../../../lib/mail';

export const prerender = false;

/* 开发信发送接口(2026-09-18,0098)。草稿由 tools/prospect/outreach-build.py 写进 outreach_log;这里只做看与发。一个文件、一个 op:
     GET  list       {status?: draft|sent|replied|unsubscribed|bounced}   列表(不带正文)+ 各状态计数
     GET  preview    {id}                                                  一封全文(text + html)
     POST send       {ids: number[], test_to?: string}                    test_to 有值 → 只发到该邮箱作审核样例,主题前加 [样例],库里不动;
                                                                          无值 → 真发给 contact_email:每次 ≤20 封、封与封间隔 ≥3 秒、查抑制名单、
                                                                          记 mails 出站行(In-Reply-To 串会话)、outreach_log → sent、prospects → sent / outreach_step
     POST mark_reply {id, mail_id}                                         人工把一封回信挂到这封开发信上(mail-worker 自动挂不上时用)
     POST followup   {id}                                                  第 2 / 3 封占位:表结构已在(step),首封回复率出来前不开
   角色:guard.ts SALES_OK 含 outreach;viewer 只有 GET。
   铁令:不群发未审核的信 —— 真发只发 status='draft' 的行,且必须是后台勾选后点「真发」;脚本侧没有发信入口。

   2026-09-23 A6 加闸(0105,吸收外贸获客 Agent 开源项目的审批 / outbox 机制,按我们的表重做):
     POST contact_ok  {email}   人工确认一个 risky 邮箱为 valid(记谁确认的)
     POST research_ok {ids}     ① 调研审批(按勾选的开发信找到线索):官网 / 品牌名 / ICP 理由人看过;needs_review 的线索不许过
     POST approve     {ids}     ② 文案审批:调研已过 + 邮箱 valid 才能审;记 approved_hash(收件人+主题+正文+调研关键字段)
     POST send        {ids}     ③ 发送审批 = 管理员点「真发」,只发 status='approved';逐封二次校验(gate)→ 进 outbox(幂等键)→ 领租约 → 发 → 有回执才记 sent
   状态:outreach_log draft → approved → sent | unknown(发出去了但没拿到回执 / 发到一半断掉:不当已发、也不重发,人工查)。 */
const STATUSES = new Set(['draft', 'approved', 'sent', 'unknown', 'replied', 'unsubscribed', 'bounced']);
const SALES = 'sales@biosphere-ai.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ICP_MIN = 60;                  // 与 outreach-build.py 出草稿的门槛一致
const CHECK_MAX_DAYS = 30;           // 邮箱校验结果 30 天内有效,过期要重跑 contact_check.py
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const brandKey = (s: string) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** 审批快照:草稿与调研里任何一项变了,哈希就对不上,必须重审 */
const draftHash = (o: any) => sha256(JSON.stringify([String(o.contact_email).toLowerCase(), o.subject, o.body_text, o.body_html, o.brand, o.website, o.icp_score]));

/** 收件域名有没有 MX(发前实时复查;查不到就不发 —— fail closed) */
async function hasMx(email: string): Promise<boolean> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(email.split('@')[1] ?? '')}&type=MX`, { headers: { accept: 'application/dns-json' } });
    const j = await r.json() as any;
    return j?.Status === 0 && Array.isArray(j?.Answer) && j.Answer.some((a: any) => a.type === 15);
  } catch { return false; }
}

/** 发前二次校验 —— 返回不过的理由(空数组 = 可以发)。行 o 带 prospects 与 outreach_contact_check 的字段 */
async function gate(db: D1Database, o: any): Promise<string[]> {
  const bad: string[] = [];
  const email = String(o.contact_email ?? '').trim().toLowerCase();
  if (o.status !== 'approved' || !o.approved_at) bad.push('文案未审批');
  if (!o.research_ok_at) bad.push('调研未审批');
  if (Number(o.needs_review) === 1) bad.push('线索待复核(官网 / 品牌名对不上)');
  if (Number(o.step) === 1 && o.p_status !== 'new') bad.push(`线索状态是 ${o.p_status},首封只发 new`);
  if ((Number(o.icp_score) || 0) < ICP_MIN) bad.push(`ICP ${o.icp_score ?? '–'} < ${ICP_MIN}`);
  if (!o.approved_hash || o.approved_hash !== await draftHash(o)) bad.push('草稿或调研在审批后改过,要重审');
  if (!EMAIL_RE.test(email)) bad.push('邮箱格式不对');
  if (o.cc_status !== 'valid') bad.push(`邮箱校验 ${o.cc_status ?? '未做'},只发 valid`);
  else if (!o.cc_fresh) bad.push(`邮箱校验超过 ${CHECK_MAX_DAYS} 天,重跑 contact_check.py`);
  if (await db.prepare(`SELECT 1 FROM outreach_suppress WHERE email=?`).bind(email).first()) bad.push('在抑制名单里(对方退订 / 退信过)');
  if (!bad.length && !(await hasMx(email))) bad.push('收件域名 MX 实时复查不过');
  return bad;
}

const ROW_SQL = `SELECT o.*, p.brand, p.website, p.icp_score, p.status p_status, p.needs_review, p.research_ok_at,
       cc.status cc_status, cc.checked_at >= datetime('now', '-${CHECK_MAX_DAYS} days') cc_fresh
  FROM outreach_log o JOIN prospects p ON p.id=o.prospect_id LEFT JOIN outreach_contact_check cc ON cc.email=lower(o.contact_email) WHERE o.id=?`;
const pickIds = (b: any) => [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n: number) => n > 0))].slice(0, 50) as number[];

async function handle(c: Ctx, b: any, method: string) {
  const db = c.db;
  const READ = b.op === 'list' || b.op === 'preview';
  if (!READ && method !== 'POST') return json({ ok: false, msg: '写操作要 POST' }, 405);

  if (b.op === 'list') {
    const st = STATUSES.has(String(b.status)) ? String(b.status) : 'draft';
    const { results } = await db.prepare(
      `SELECT o.id, o.prospect_id, o.contact_email, o.step, o.subject, o.status, o.sent_at, o.replied_at, o.mail_id, o.reply_mail_id, o.created_at,
              p.brand, p.country, p.market, p.icp_score
         FROM outreach_log o JOIN prospects p ON p.id=o.prospect_id WHERE o.status=? ORDER BY p.icp_score DESC, o.id LIMIT 200`).bind(st).all<any>();
    const { results: cnt } = await db.prepare(`SELECT status, COUNT(*) n FROM outreach_log GROUP BY status`).all<{ status: string; n: number }>();
    return json({ ok: true, status: st, rows: results ?? [], counts: Object.fromEntries((cnt ?? []).map((r) => [r.status, r.n])), canSend: canSend(env), from: mailFrom(env).raw });
  }

  if (b.op === 'preview') {
    const o = await db.prepare(`SELECT o.*, p.brand, p.country, p.icp_score, p.icp_reason FROM outreach_log o JOIN prospects p ON p.id=o.prospect_id WHERE o.id=?`).bind(Number(b.id) || 0).first<any>();
    return o ? json({ ok: true, row: o }) : json({ ok: false, msg: '不存在' }, 404);
  }

  const who = String(c.sess.email ?? c.sess.uid);

  if (b.op === 'contact_ok') {
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ ok: false, msg: '邮箱不合法' }, 400);
    await db.prepare(`INSERT INTO outreach_contact_check (email, status, reason, checked_by, checked_at) VALUES (?, 'valid', '人工确认', ?, datetime('now'))
      ON CONFLICT(email) DO UPDATE SET status='valid', reason='人工确认(原:' || COALESCE(outreach_contact_check.reason, '') || ')', checked_by=excluded.checked_by, checked_at=excluded.checked_at`).bind(email, who).run();
    return json({ ok: true });
  }

  if (b.op === 'research_ok' || b.op === 'approve') {
    const ids = pickIds(b); if (!ids.length) return json({ ok: false, msg: '没勾选' }, 400);
    const results: { id: number; ok: boolean; msg?: string }[] = [];
    for (const id of ids) {
      const o = await db.prepare(ROW_SQL).bind(id).first<any>();
      if (!o) { results.push({ id, ok: false, msg: '不存在' }); continue; }
      if (Number(o.needs_review) === 1) { results.push({ id, ok: false, msg: `${o.brand}:线索待复核,先改官网 / 品牌名` }); continue; }
      if (b.op === 'research_ok') {
        await db.prepare(`UPDATE prospects SET research_ok_at=datetime('now'), research_ok_by=? WHERE id=?`).bind(who, o.prospect_id).run();
        results.push({ id, ok: true }); continue;
      }
      const bad = [o.status !== 'draft' && `状态是 ${o.status},只审草稿`, !o.research_ok_at && '调研还没审', o.cc_status !== 'valid' && `邮箱校验 ${o.cc_status ?? '未做'}`].filter(Boolean);
      if (bad.length) { results.push({ id, ok: false, msg: `${o.brand}:${bad.join(';')}` }); continue; }
      const r = await db.prepare(`UPDATE outreach_log SET status='approved', approved_at=datetime('now'), approved_by=?, approved_hash=? WHERE id=? AND status='draft'`).bind(who, await draftHash(o), id).run();
      results.push({ id, ok: (r.meta?.changes ?? 0) > 0, msg: (r.meta?.changes ?? 0) > 0 ? undefined : '状态已变' });
    }
    const n = results.filter((x) => x.ok).length;
    return json({ ok: n > 0, n, results, msg: n ? undefined : results[0]?.msg });
  }

  if (b.op === 'send') {
    const ids = pickIds(b).slice(0, 20);
    const testTo = String(b.test_to ?? '').trim().toLowerCase();
    if (!ids.length) return json({ ok: false, msg: '没勾选' }, 400);
    if (testTo && !EMAIL_RE.test(testTo)) return json({ ok: false, msg: '样例收件邮箱不合法' }, 400);
    if (!testTo && c.sess.role !== 'admin') return json({ ok: false, msg: '③ 发送审批只有管理员(创始人)能点;业务可以审调研、审文案、发样例' }, 403);
    if (!canSend(env)) return json({ ok: false, msg: '发信未接入:Cloudflare「电子邮件发送」要接入域名 biosphere-ai.com(备选 RESEND_API_KEY)' }, 400);
    const from = mailFrom(env);
    const DAILY_MAX = Number((env as any).OUTREACH_DAILY_MAX) || 20;   // 新域名养信誉:每天封顶;送达率稳了再在 secret 里调大
    if (!testTo) {
      // 租约过期 = 上次发到一半 Worker 断了,服务商那边发没发出去不可知 → unknown,永不自动重发(宁可漏一封,不可重一封)
      await db.batch([
        db.prepare(`UPDATE outreach_log SET status='unknown' WHERE id IN (SELECT outreach_id FROM outreach_outbox WHERE status='sending' AND lease_until < datetime('now'))`),
        db.prepare(`UPDATE outreach_outbox SET status='unknown', error='lease_expired' WHERE status='sending' AND lease_until < datetime('now')`),
      ]);
    }
    const results: { id: number; ok: boolean; msg?: string; via?: string; receipt?: string }[] = [];
    for (const [i, id] of ids.entries()) {
      const o = await db.prepare(ROW_SQL).bind(id).first<any>();
      if (!o) { results.push({ id, ok: false, msg: '不存在' }); continue; }
      let obId = 0;
      if (!testTo) {
        const bad = await gate(db, o);
        if (bad.length) { results.push({ id, ok: false, msg: `${o.brand}:${bad.join(';')}` }); continue; }
        const used = (await db.prepare(`SELECT COUNT(*) n FROM outreach_outbox WHERE status IN ('sending','sent','unknown') AND created_at >= date('now')`).first<{ n: number }>())?.n ?? 0;
        if (used >= DAILY_MAX) { results.push({ id, ok: false, msg: `今日额度 ${DAILY_MAX} 封已用完` }); break; }
        // 进 outbox:幂等键冲突 = 同邮箱或同品牌这一封已经进过发件箱。只有「服务商当场拒收(failed)且内容没变」的那一行可以重新排队
        const email = String(o.contact_email).trim().toLowerCase(), step = Number(o.step) || 1, ph = o.approved_hash;
        const ins = await db.prepare(`INSERT INTO outreach_outbox (outreach_id, idem_key, brand_key, step, payload_hash, approved_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id`)
          .bind(id, `${email}#${step}`, brandKey(o.brand), step, ph, who).first<{ id: number }>();
        const re = ins ?? await db.prepare(`UPDATE outreach_outbox SET status='queued', error=NULL, approved_by=? WHERE outreach_id=? AND status='failed' AND payload_hash=? RETURNING id`).bind(who, id, ph).first<{ id: number }>();
        if (!re) {
          const ex = await db.prepare(`SELECT outreach_id, status FROM outreach_outbox WHERE idem_key=? OR (brand_key=? AND step=?)`).bind(`${email}#${step}`, brandKey(o.brand), step).first<any>();
          results.push({ id, ok: false, msg: `${o.brand}:同邮箱或同品牌第 ${step} 封已进过发件箱(#${ex?.outreach_id} ${ex?.status}),不重发` }); continue;
        }
        // 领租约:只有把 queued 改成 sending 的那个请求能发(两个人同时点「真发」也只发一次)
        const lease = await db.prepare(`UPDATE outreach_outbox SET status='sending', lease_until=datetime('now', '+2 minutes') WHERE id=? AND status='queued' RETURNING id`).bind(re.id).first();
        if (!lease) { results.push({ id, ok: false, msg: '被另一个请求领走了' }); continue; }
        obId = re.id;
      }
      if (i) await sleep(3000);   // 同一域名连发不间隔 = 群发特征;3 秒是专家口径的下限
      let r: Awaited<ReturnType<typeof sendMail>>;
      try {
        r = await sendMail(env, {
          to: [testTo || String(o.contact_email)], subject: testTo ? `[样例] ${o.subject}` : String(o.subject),
          text: String(o.body_text ?? ''), html: o.body_html || undefined, replyTo: SALES,
        });
      } catch (e) {
        if (obId) await db.batch([
          db.prepare(`UPDATE outreach_outbox SET status='unknown', error=? WHERE id=?`).bind(`exception:${String(e).slice(0, 120)}`, obId),
          db.prepare(`UPDATE outreach_log SET status='unknown' WHERE id=?`).bind(id),
        ]);
        results.push({ id, ok: false, msg: '发送中途异常,结果未知(记 unknown,不自动重发)' }); continue;
      }
      if (!r.ok) {
        // 服务商当场拒收 = 没发出去,可以改好后重排队
        if (obId) await db.prepare(`UPDATE outreach_outbox SET status='failed', error=?, lease_until=NULL WHERE id=?`).bind(String(r.msg).slice(0, 200), obId).run();
        results.push({ id, ok: false, msg: r.msg });
        if (/E_SENDER|未接入|quota|配额|rate/i.test(String(r.msg))) break;   // 域名 / 配额级错误:后面的也发不出,别一封封撞
        continue;
      }
      if (testTo) { results.push({ id, ok: true, via: r.via }); continue; }
      if (!r.id) {
        // 回查:没有服务商回执 id,就没有「已发送」的证据 —— 不记 sent,也不重发
        await db.batch([
          db.prepare(`UPDATE outreach_outbox SET status='unknown', error='no_provider_receipt', via=?, lease_until=NULL WHERE id=?`).bind(r.via ?? null, obId),
          db.prepare(`UPDATE outreach_log SET status='unknown' WHERE id=?`).bind(id),
        ]);
        results.push({ id, ok: false, msg: '服务商没给回执 id:记 unknown,不当已发,也不重发' }); continue;
      }
      // 真发:mails 记出站行,message_id = 服务商返回的 messageId(Cloudflare 的 Message-ID 是平台头,不许自定义;对方回信的 In-Reply-To 就是它),
      // 回信关联在 apps/mail-worker linkOutreach:按 message_id 命中,命不中按发件人邮箱兜底。outreach_log → sent,prospects → sent
      const messageId = r.id.startsWith('<') ? r.id : `<${r.id}>`;
      const text = String(o.body_text ?? '');
      const mail = await db.prepare(
        `INSERT INTO mails (direction, message_id, thread_id, from_addr, from_name, to_addrs, subject, text, snippet, received_at, status, assignee_uid)
         VALUES ('out', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'read', ?) RETURNING id`)
        .bind(messageId, messageId, from.email, c.sess.email, String(o.contact_email), String(o.subject), text, text.replace(/\s+/g, ' ').slice(0, 160), c.sess.uid).first<{ id: number }>();
      await db.batch([
        db.prepare(`UPDATE outreach_outbox SET status='sent', provider_id=?, via=?, sent_at=datetime('now'), lease_until=NULL WHERE id=?`).bind(messageId, r.via ?? null, obId),
        db.prepare(`UPDATE outreach_log SET status='sent', sent_at=datetime('now'), mail_id=? WHERE id=?`).bind(mail?.id ?? null, id),
        db.prepare(`UPDATE prospects SET status=CASE WHEN status='new' THEN 'sent' ELSE status END, outreach_step=MAX(COALESCE(outreach_step,0), ?), last_outreach_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).bind(Number(o.step) || 1, o.prospect_id),
      ]);
      results.push({ id, ok: true, via: r.via, receipt: messageId });
    }
    const sent = results.filter((x) => x.ok).length;
    return json({ ok: sent > 0, sent, test: !!testTo, results, msg: sent ? undefined : results[0]?.msg });
  }

  if (b.op === 'mark_reply') {
    const id = Number(b.id) || 0, mailId = Number(b.mail_id) || 0;
    const o = await db.prepare(`SELECT id, prospect_id FROM outreach_log WHERE id=?`).bind(id).first<{ id: number; prospect_id: number }>();
    if (!o) return json({ ok: false, msg: '不存在' }, 404);
    if (mailId && !(await db.prepare(`SELECT id FROM mails WHERE id=? AND direction='in'`).bind(mailId).first())) return json({ ok: false, msg: '回信不存在' }, 400);
    await db.batch([
      db.prepare(`UPDATE outreach_log SET status='replied', reply_mail_id=COALESCE(?, reply_mail_id), replied_at=COALESCE(replied_at, datetime('now')) WHERE id=?`).bind(mailId || null, id),
      db.prepare(`UPDATE prospects SET status=CASE WHEN status IN ('new','sent') THEN 'replied' ELSE status END, updated_at=datetime('now') WHERE id=?`).bind(o.prospect_id),
    ]);
    return json({ ok: true });
  }

  if (b.op === 'followup') {
    // ponytail: 第 2(第 3–7 天)/ 第 3 封(第 14 天起沉默唤醒)只留表结构(outreach_log.step、prospects.outreach_step);首封回复率出来、创始人定节奏后再开
    return json({ ok: false, msg: '跟进序列(第 2 / 3 封)还没开:表结构已就位,等首封回复率出来后由创始人定节奏' }, 501);
  }

  return json({ ok: false, msg: '未知 op' }, 400);
}

export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request); if (c instanceof Response) return c;
  const b = Object.fromEntries(new URL(request.url).searchParams);
  try { return await handle(c, b, 'GET'); } catch (e) { return json({ ok: false, msg: String(e).slice(0, 300) }, 500); }
};
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request); if (c instanceof Response) return c;
  const b = await request.json().catch(() => ({}));
  try { return await handle(c, b, 'POST'); } catch (e) { return json({ ok: false, msg: String(e).slice(0, 300) }, 500); }
};
