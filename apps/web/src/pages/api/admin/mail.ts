import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision, type Ctx } from '../../../lib/guard';
import { classifyMail, sendMail, canSend, mailFrom, listMails, sanitizeHtml } from '../../../lib/mail';

export const prerender = false;

/* 邮件中心接口(2026-09-18)。收信在 apps/mail-worker(独立 Worker 写 mails 表),这里只做后台的读与操作。一个文件、一个 op:
     GET  list        {box: inbox|replied|archived|spam|sent, q, p}   列表(不带正文全文)+ 各箱计数
     GET  get         {id}                                            全文 + 同线邮件;未读自动置已读(邮件客户端的惯例)
     GET  attach      {id, key}                                       取 R2:key 必须是这封信自己的 html_key 或附件键,别的键一律 404 —— 没有公开链接
     POST set_status  {id, status}                                    unread|read|replied|archived|spam
     POST assign      {id, uid|null}
     POST send        {id?, to, subject, text}                        走 Resend;成功写一条 direction=out,原信置 replied。没配 key 返回 msg,按钮置灰
     POST to_inquiry  {id}                                            转询盘(inquiries 一行 + 回填 inquiry_id)
     POST to_matter   {id}                                            转事项(matters 一行,code 与 matters.ts 同口径)
     POST ai          {id}                                            重跑分类 / 摘要 / 建议回复
   角色:guard.ts 的 SALES_OK 含 mail;viewer 只有 GET(apiGuard 按方法拦)。 */
const OK_STATUS = new Set(['unread', 'read', 'replied', 'archived', 'spam']);

/** 北京日期 + 当天序号,与 matters.ts 的 newCode 同口径(那边没导出,这里 4 行照抄;改一边记得改另一边) */
async function matterCode(db: D1Database) {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const n = (await db.prepare(`SELECT COUNT(*) n FROM matters WHERE code LIKE ?`).bind(`BX${day}-%`).first<{ n: number }>())?.n ?? 0;
  return (i: number) => `BX${day}-${String(n + 1 + i).padStart(3, '0')}`;
}
const MATTER_KIND: Record<string, string> = { 询盘: '询盘', 报价: '报价', 样品: '打样', 投诉: '售后' };

async function handle(c: Ctx, b: any, method: string) {
  const db = c.db, uid = c.sess.uid;
  const READ = b.op === 'list' || b.op === 'get' || b.op === 'attach';
  if (!READ && method !== 'POST') return json({ ok: false, msg: '写操作要 POST' }, 405);
  const id = Number(b.id) || 0;

  if (b.op === 'list') return json({ ok: true, ...(await listMails(db, { box: b.box, q: b.q, cat: b.cat, page: Number(b.p) })) });

  if (b.op === 'get') {
    const m = await db.prepare(`SELECT m.*, u.display_name AS assignee_name, u.email AS assignee_email FROM mails m LEFT JOIN users u ON u.id=m.assignee_uid WHERE m.id=?`).bind(id).first<any>();
    if (!m) return json({ ok: false, msg: '邮件不存在' }, 404);
    if (m.status === 'unread' && c.sess.role !== 'viewer') { await db.prepare(`UPDATE mails SET status='read' WHERE id=? AND status='unread'`).bind(id).run(); m.status = 'read'; }
    const { results: thread } = await db.prepare(`SELECT id, direction, from_addr, from_name, subject, snippet, received_at, status FROM mails WHERE thread_id=? AND id<>? ORDER BY received_at`).bind(m.thread_id, id).all<any>();
    let attachments: any[] = [];
    try { attachments = JSON.parse(m.attachments_json || '[]'); } catch { /* 坏 JSON 当没有 */ }
    m.attachments = attachments; delete m.attachments_json;
    return json({ ok: true, mail: m, thread: thread ?? [], canSend: canSend(env) });
  }

  if (b.op === 'attach') {
    const key = String(b.key ?? '');
    const m = await db.prepare(`SELECT html_key, attachments_json FROM mails WHERE id=?`).bind(id).first<{ html_key: string | null; attachments_json: string | null }>();
    if (!m || !key.startsWith('mail/')) return json({ ok: false, msg: '不存在' }, 404);
    let att: { name: string; type: string; r2_key?: string } | undefined;
    try { att = (JSON.parse(m.attachments_json || '[]') as any[]).find((a) => a.r2_key === key); } catch { /* 同上 */ }
    if (key !== m.html_key && !att) return json({ ok: false, msg: '这把键不属于这封邮件' }, 404);
    const bucket = (env as any).PHOTO as R2Bucket | undefined;
    const obj = bucket ? await bucket.get(key) : null;
    if (!obj) return json({ ok: false, msg: 'R2 里没有这个对象' }, 404);
    if (key === m.html_key) {
      return new Response(sanitizeHtml(await obj.text()), { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
        // 远程图片不加载(追踪像素也一起挡了);排版靠内联样式;不许任何脚本、外联、表单
        'Content-Security-Policy': "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'",
      } });
    }
    const type = /^(text\/html|image\/svg|application\/xhtml)/i.test(att!.type) ? 'application/octet-stream' : att!.type;   // HTML/SVG 附件只能下载,不能当页面打开
    return new Response(obj.body, { headers: {
      'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att!.name)}`,
    } });
  }

  if (!id) return json({ ok: false, msg: '缺 id' }, 400);
  const m = await db.prepare(`SELECT * FROM mails WHERE id=?`).bind(id).first<any>();
  if (!m) return json({ ok: false, msg: '邮件不存在' }, 404);

  if (b.op === 'set_status') {
    const st = String(b.status ?? '');
    if (!OK_STATUS.has(st)) return json({ ok: false, msg: '状态不合法' }, 400);
    await db.prepare(`UPDATE mails SET status=?${st === 'replied' ? ", replied_at=COALESCE(replied_at, datetime('now'))" : ''} WHERE id=?`).bind(st, id).run();
    await logRevision(db, 'mails', id, null, { status: m.status }, { status: st }, uid);
    return json({ ok: true });
  }

  if (b.op === 'trust') {
    /* 发件人信任(0099,创始人 09-18 17:3x「一定要先审核,确认是我们的才可以接收」):写 mail_trust,同发件人历史行一起改 trust;
       被拦的附件已经不在 R2 里,信任后要对方重发 —— 页面上就这么提示,不假装能找回 */
    if (c.sess.role === 'viewer') return json({ ok: false, msg: '只读账号不能改信任' }, 403);
    const level = b.level === 'blocked' ? 'blocked' : 'trusted';
    const addr = String(m.from_addr ?? '').toLowerCase();
    if (!addr.includes('@')) return json({ ok: false, msg: '这封没有发件人地址' }, 400);
    const pattern = b.scope === 'domain' ? '@' + addr.split('@')[1] : addr;
    await db.batch([
      db.prepare(`INSERT INTO mail_trust (pattern, level, note, created_by) VALUES (?, ?, ?, ?) ON CONFLICT(pattern) DO UPDATE SET level=excluded.level, note=excluded.note, created_by=excluded.created_by, created_at=CURRENT_TIMESTAMP`)
        .bind(pattern, level, `邮件中心 #${id}`, c.sess.email),
      db.prepare(`UPDATE mails SET trust=? WHERE direction='in' AND ${pattern.startsWith('@') ? "lower(from_addr) LIKE '%' || ?" : 'lower(from_addr)=?'}`)
        .bind(level === 'blocked' ? 'spam' : 'trusted', pattern),
    ]);
    await logRevision(db, 'mails', id, null, { trust: m.trust ?? null }, { trust: level, pattern }, uid);
    return json({ ok: true, pattern, level });
  }

  if (b.op === 'assign') {
    const to = b.uid == null || b.uid === '' ? null : Number(b.uid) || null;
    if (to && !(await db.prepare(`SELECT id FROM users WHERE id=?`).bind(to).first())) return json({ ok: false, msg: '账号不存在' }, 400);
    await db.prepare(`UPDATE mails SET assignee_uid=? WHERE id=?`).bind(to, id).run();
    await logRevision(db, 'mails', id, null, { assignee_uid: m.assignee_uid }, { assignee_uid: to }, uid);
    return json({ ok: true });
  }

  if (b.op === 'send') {
    const to = String(b.to ?? m.from_addr ?? '').split(/[,;\s]+/).filter(Boolean).slice(0, 5);
    const subject = String(b.subject ?? '').trim().slice(0, 300) || `Re: ${m.subject ?? ''}`;
    const text = String(b.text ?? '').trim();
    if (!text) return json({ ok: false, msg: '正文不能为空' }, 400);
    if (text.length > 20000) return json({ ok: false, msg: '正文最长 20000 字' }, 400);
    // 串会话:In-Reply-To = 原信;References = 会话首封 + 原信(去重)。客户的邮件客户端据此把我们的回信挂在同一条线下
    const refs = m.direction === 'in' && m.message_id ? [...new Set([m.thread_id, m.message_id].filter(Boolean))].join(' ') : '';
    const r = await sendMail(env, { to, subject, text, headers: refs ? { 'In-Reply-To': m.message_id, References: refs } : undefined });
    if (!r.ok) return json({ ok: false, msg: r.msg }, 400);
    const fromAddr = mailFrom(env).email;
    await db.batch([
      db.prepare(`INSERT INTO mails (direction, message_id, thread_id, from_addr, from_name, to_addrs, subject, text, snippet, received_at, status, assignee_uid, inquiry_id, matter_id, company_id)
                  VALUES ('out', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'read', ?, ?, ?, ?)`)
        .bind(`<${r.via ?? 'out'}-${r.id ?? crypto.randomUUID()}@${fromAddr.split('@')[1] ?? 'biosphere-ai.com'}>`, m.thread_id, fromAddr, c.sess.email, to.join(', '), subject, text, text.replace(/\s+/g, ' ').slice(0, 160), uid, m.inquiry_id, m.matter_id, m.company_id),
      db.prepare(`UPDATE mails SET status='replied', replied_at=datetime('now'), assignee_uid=COALESCE(assignee_uid, ?) WHERE id=? AND direction='in'`).bind(uid, id),
    ]);
    return json({ ok: true, id: r.id, via: r.via });
  }

  if (b.op === 'to_inquiry') {
    if (m.inquiry_id) return json({ ok: true, inquiry_id: m.inquiry_id, msg: '已转过' });
    const message = `${m.subject ? '[' + m.subject + '] ' : ''}${m.text ?? ''}`.slice(0, 4000);
    const ins = await db.prepare(
      `INSERT INTO inquiries (site_id, lang, name, company, email, country, message, status, source_path, ai_summary)
       VALUES (?, 'en', ?, NULL, ?, NULL, ?, 'new', ?, ?) RETURNING id`)
      .bind(c.tenant.siteId, m.from_name || m.from_addr, m.from_addr, message, `mail:${id}`, m.ai_summary).first<{ id: number }>();
    await db.batch([
      db.prepare(`UPDATE mails SET inquiry_id=? WHERE id=?`).bind(ins!.id, id),
      db.prepare(`INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?,'note',?)`).bind(ins!.id, uid, `由邮件中心转入(邮件 #${id}:${m.subject ?? ''})`),
    ]);
    return json({ ok: true, inquiry_id: ins!.id });
  }

  if (b.op === 'to_matter') {
    if (m.matter_id) return json({ ok: true, matter_id: m.matter_id, msg: '已转过' });
    const code = await matterCode(db);
    const kind = MATTER_KIND[m.ai_category] ?? '其他';
    const domain = String(m.from_addr ?? '').split('@')[1] ?? '';
    let row: { id: number; code: string } | null = null;
    for (let i = 0; i < 3 && !row; i++) {
      try {
        row = await db.prepare(
          `INSERT INTO matters (code, company_id, company_name, contact, kind, title, owner_uid, status, note, source, created_by)
           VALUES (?,?,?,?,?,?,?,'pending',?,'邮件',?) RETURNING id, code`)
          .bind(code(i), m.company_id, m.from_name || domain || m.from_addr, m.from_addr, kind, (m.subject || '(无主题)').slice(0, 200), m.assignee_uid ?? uid,
            `${m.ai_summary ? m.ai_summary + '\n\n' : ''}${String(m.text ?? '').slice(0, 3000)}`, uid).first<{ id: number; code: string }>();
      } catch (e) { if (i === 2 || !/UNIQUE/i.test(String(e))) throw e; }
    }
    await db.batch([
      db.prepare(`UPDATE mails SET matter_id=? WHERE id=?`).bind(row!.id, id),
      db.prepare(`INSERT INTO matter_logs (matter_id, uid, kind, text) VALUES (?,?,'email',?)`).bind(row!.id, uid, `由邮件中心转入(邮件 #${id},发件人 ${m.from_addr})`),
    ]);
    return json({ ok: true, matter_id: row!.id, code: row!.code });
  }

  if (b.op === 'ai') {
    const v = await classifyMail(db, env, m, id);
    await db.prepare(`UPDATE mails SET ai_category=?, ai_summary=?, ai_reply=? WHERE id=?`).bind(v.category, v.summary, v.reply, id).run();
    return json({ ok: true, ...v });
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
