import type { APIRoute } from 'astro';
import { apiGuard, json, type Ctx } from '../../../lib/guard';
import { STATUS, canMove, KINDS, PRIORITY, LOG_KINDS } from '../../../lib/matters';

export const prerender = false;

/* 业务协同工作台(2026-09-18)的接口。一个文件、一个 op 字段:
     create        五段表单建事项(客户名 + 事项名必填;草稿只要其一);code 自动 BX{北京日期}-{当天序号}
     update        改字段(白名单);金额三项只由人填,接口不算不补
     set_status    状态机推进 {id, to, text, force};只许前进一格 / 任意回退 / 进出 lost;到 paid 要 receivable<=0,否则带 force 人工确认
     log           记跟进 {id, kind, text}
     list / get    读(GET 也行,viewer 只有 GET)
     from_inquiry  询盘 → 事项(同一询盘只建一条未终止的)
     from_deal     机会 → 事项(同上)
   数据范围:admin / editor 看全部;其他角色只看自己是负责人 / 跟进人 / 创建人的事项(GPT 设计包「数据范围」原则)。
   角色:guard.ts 的 SALES_OK 含 matters,sales 可写;viewer 只读由 apiGuard 按方法拦。 */
const s = (v: unknown, n = 500) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const FIELDS: Record<string, (v: unknown) => unknown> = {
  company_id: (v) => Number(v) || null, company_name: (v) => s(v, 200), contact: (v) => s(v, 120), phone: (v) => s(v, 60), industry: (v) => s(v, 60),
  kind: (v) => (KINDS.includes(String(v)) ? String(v) : '其他'), title: (v) => s(v, 200), owner_uid: (v) => Number(v) || null,
  priority: (v) => (PRIORITY[String(v)] ? String(v) : 'normal'), due_date: (v) => s(v, 10), next_follow_at: (v) => s(v, 16), note: (v) => s(v, 4000),
  amount: num, received: num, receivable: num, currency: (v) => s(v, 8) ?? 'USD', invoice_status: (v) => s(v, 20), source: (v) => s(v, 60),
  follower_uid: (v) => Number(v) || null, internal_note: (v) => s(v, 4000),
};
const seeAll = (c: Ctx) => c.sess.role === 'admin' || c.sess.role === 'editor';
const scope = (c: Ctx, alias = 'm') => (seeAll(c) ? { sql: '1=1', bind: [] as unknown[] } : { sql: `(${alias}.owner_uid=? OR ${alias}.follower_uid=? OR ${alias}.created_by=?)`, bind: [c.sess.uid, c.sess.uid, c.sess.uid] });
/** 北京时间当天的编号:BX20260918-001。序号 = 当天已有条数 + 1;UNIQUE 撞了就 +1 再试(并发极低,够用) */
async function newCode(db: D1Database) {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const n = (await db.prepare(`SELECT COUNT(*) n FROM matters WHERE code LIKE ?`).bind(`BX${day}-%`).first<{ n: number }>())?.n ?? 0;
  return (i: number) => `BX${day}-${String(n + 1 + i).padStart(3, '0')}`;
}
async function insert(db: D1Database, f: Record<string, unknown>, uid: number, extra: Record<string, unknown> = {}) {
  const code = await newCode(db);
  const row = { ...f, ...extra, created_by: uid };
  for (let i = 0; i < 3; i++) {
    const keys = Object.keys(row);
    try {
      const ins = await db.prepare(`INSERT INTO matters (code, ${keys.join(', ')}) VALUES (?${', ?'.repeat(keys.length)}) RETURNING id, code`).bind(code(i), ...keys.map((k) => row[k])).first<{ id: number; code: string }>();
      return ins!;
    } catch (e) { if (i === 2 || !/UNIQUE/i.test(String(e))) throw e; }
  }
  throw new Error('unreachable');
}
const logOf = (db: D1Database, matter_id: number, uid: number, kind: string, text: string, from?: string | null, to?: string | null) =>
  db.prepare(`INSERT INTO matter_logs (matter_id, uid, kind, text, from_status, to_status) VALUES (?,?,?,?,?,?)`).bind(matter_id, uid, kind, text.slice(0, 4000), from ?? null, to ?? null).run();
const touch = (db: D1Database, id: number) => db.prepare(`UPDATE matters SET updated_at=datetime('now') WHERE id=?`).bind(id).run();

async function load(c: Ctx, id: number) {
  const sc = scope(c);
  return c.db.prepare(`SELECT m.*, u.email AS owner_email, u.display_name AS owner_name, f.email AS follower_email, f.display_name AS follower_name FROM matters m LEFT JOIN users u ON u.id=m.owner_uid LEFT JOIN users f ON f.id=m.follower_uid WHERE m.id=? AND ${sc.sql}`).bind(id, ...sc.bind).first<any>();
}

async function handle(c: Ctx, b: any, method: string) {
  const db = c.db, uid = c.sess.uid;
  const READ = b.op === 'list' || b.op === 'get';
  if (!READ && method !== 'POST') return json({ ok: false, msg: '写操作要 POST' }, 405);

  if (b.op === 'list') {
    const sc = scope(c); const where = [sc.sql], bind: unknown[] = [...sc.bind];
    if (b.status && STATUS[b.status]) { where.push('m.status=?'); bind.push(String(b.status)); }
    if (b.owner) { where.push('(m.owner_uid=? OR m.follower_uid=?)'); bind.push(Number(b.owner), Number(b.owner)); }
    if (s(b.q, 100)) { where.push('(m.code LIKE ? OR m.company_name LIKE ? OR m.title LIKE ? OR m.contact LIKE ?)'); const q = `%${s(b.q, 100)}%`; bind.push(q, q, q, q); }
    const page = Math.max(1, Number(b.page) || 1), PER = 20;
    const total = (await db.prepare(`SELECT COUNT(*) n FROM matters m WHERE ${where.join(' AND ')}`).bind(...bind).first<{ n: number }>())?.n ?? 0;
    const { results } = await db.prepare(`SELECT m.*, u.email AS owner_email, u.display_name AS owner_name FROM matters m LEFT JOIN users u ON u.id=m.owner_uid WHERE ${where.join(' AND ')} ORDER BY m.is_draft DESC, m.updated_at DESC LIMIT ? OFFSET ?`).bind(...bind, PER, (page - 1) * PER).all<any>();
    return json({ ok: true, rows: results, total, page, pages: Math.max(1, Math.ceil(total / PER)) });
  }

  if (b.op === 'get') {
    const m = await load(c, Number(b.id)); if (!m) return json({ ok: false, msg: '事项不存在或不在你的范围内' }, 404);
    const { results: logs } = await db.prepare(`SELECT l.*, u.email AS who_email, u.display_name AS who_name FROM matter_logs l LEFT JOIN users u ON u.id=l.uid WHERE l.matter_id=? ORDER BY l.id DESC LIMIT 100`).bind(m.id).all<any>();
    return json({ ok: true, matter: m, logs, tip: STATUS[m.status]?.[2] ?? '' });
  }

  if (b.op === 'create') {
    const f: Record<string, unknown> = {}; for (const k of Object.keys(FIELDS)) if (b[k] !== undefined) f[k] = FIELDS[k](b[k]);
    const draft = b.is_draft ? 1 : 0;
    if (!draft && (!f.company_name || !f.title)) return json({ ok: false, msg: '客户名称与事项名称必填(先存草稿也行)' }, 400);
    if (draft && !f.company_name && !f.title) return json({ ok: false, msg: '草稿至少要有客户名或事项名' }, 400);
    if (!f.owner_uid) f.owner_uid = uid;
    const ins = await insert(db, f, uid, { is_draft: draft, status: 'pending' });
    await logOf(db, ins.id, uid, 'status', draft ? '保存草稿' : '新建事项', null, 'pending');
    return json({ ok: true, id: ins.id, code: ins.code });
  }

  if (b.op === 'update') {
    const id = Number(b.id); const cur = await load(c, id); if (!cur) return json({ ok: false, msg: '事项不存在或不在你的范围内' }, 404);
    const f: Record<string, unknown> = {}; for (const k of Object.keys(FIELDS)) if (b[k] !== undefined) f[k] = FIELDS[k](b[k]);
    if (b.is_draft !== undefined) {
      f.is_draft = b.is_draft ? 1 : 0;
      if (!f.is_draft && !((f.company_name ?? cur.company_name) && (f.title ?? cur.title))) return json({ ok: false, msg: '提交前请填客户名称与事项名称' }, 400);
    }
    const keys = Object.keys(f); if (!keys.length) return json({ ok: false, msg: '没有要改的字段' }, 400);
    await db.prepare(`UPDATE matters SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).bind(...keys.map((k) => f[k]), id).run();
    if (cur.is_draft && f.is_draft === 0) await logOf(db, id, uid, 'status', '草稿提交', 'pending', 'pending');
    return json({ ok: true, id });
  }

  if (b.op === 'set_status') {
    const id = Number(b.id), to = String(b.to || ''); const cur = await load(c, id); if (!cur) return json({ ok: false, msg: '事项不存在或不在你的范围内' }, 404);
    if (!canMove(cur.status, to)) return json({ ok: false, msg: `不能从「${STATUS[cur.status]?.[0] ?? cur.status}」直接到「${STATUS[to]?.[0] ?? to}」:只能前进一步、回退,或终止` }, 400);
    if (to === 'paid' && Number(cur.receivable ?? 0) > 0 && !b.force) return json({ ok: false, msg: `待收还有 ${cur.receivable} ${cur.currency || 'USD'},确认已回款请带 force`, need_force: true }, 409);
    await db.prepare(`UPDATE matters SET status=?, is_draft=0, updated_at=datetime('now') WHERE id=?`).bind(to, id).run();
    const text = `${STATUS[cur.status]?.[0] ?? cur.status} → ${STATUS[to][0]}${b.force && to === 'paid' ? '(待收未清零,人工确认已回款)' : ''}${s(b.text, 2000) ? ':' + s(b.text, 2000) : ''}`;
    await logOf(db, id, uid, 'status', text, cur.status, to);
    return json({ ok: true, id, status: to, tip: STATUS[to][2] });
  }

  if (b.op === 'log') {
    const id = Number(b.id), text = s(b.text, 4000); const cur = await load(c, id); if (!cur) return json({ ok: false, msg: '事项不存在或不在你的范围内' }, 404);
    if (!text) return json({ ok: false, msg: '内容不能为空' }, 400);
    const kind = LOG_KINDS[b.kind] && b.kind !== 'status' ? String(b.kind) : 'note';
    await logOf(db, id, uid, kind, text); await touch(db, id);
    return json({ ok: true, id });
  }

  if (b.op === 'from_inquiry') {
    const iid = Number(b.inquiry_id); const r = await db.prepare(`SELECT * FROM inquiries WHERE id=?`).bind(iid).first<any>(); if (!r) return json({ ok: false, msg: '询盘不存在' }, 404);
    const dup = await db.prepare(`SELECT id FROM matters WHERE inquiry_id=? AND status<>'lost' ORDER BY id DESC LIMIT 1`).bind(iid).first<{ id: number }>();
    if (dup) return json({ ok: true, id: dup.id, created: false });
    const co = await db.prepare(`SELECT id FROM companies WHERE source='inquiry' AND source_id=?`).bind(iid).first<{ id: number }>();
    const f = {
      company_id: co?.id ?? null, company_name: s(r.company, 200) || s(r.name, 200), contact: s(r.name, 120), phone: s(r.whatsapp, 60), kind: '询盘',
      title: `${r.category || '询盘需求'}${r.volume ? ' · ' + r.volume : ''}`, owner_uid: uid, source: '官网询盘', inquiry_id: iid,
      note: [r.email ? `邮箱 ${r.email}` : '', r.country ? `国家 ${r.country}` : '', r.ai_summary ? `AI 摘要:${r.ai_summary}` : ''].filter(Boolean).join(' · ') || null,
    };
    const ins = await insert(db, f, uid, { status: 'pending' });
    await logOf(db, ins.id, uid, 'status', `由询盘 #${iid} 转入`, null, 'pending');
    if (r.message) await logOf(db, ins.id, uid, 'email', `询盘原文:${String(r.message).slice(0, 3000)}`);
    return json({ ok: true, id: ins.id, code: ins.code, created: true });
  }

  if (b.op === 'from_deal') {
    const did = Number(b.deal_id); const d = await db.prepare(`SELECT d.*, c.name AS company, c.country FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.id=?`).bind(did).first<any>(); if (!d) return json({ ok: false, msg: '机会不存在' }, 404);
    const dup = await db.prepare(`SELECT id FROM matters WHERE deal_id=? AND status<>'lost' ORDER BY id DESC LIMIT 1`).bind(did).first<{ id: number }>();
    if (dup) return json({ ok: true, id: dup.id, created: false });
    const kind = d.stage === 'sampling' ? '打样' : d.stage === 'quote' || d.stage === 'negotiate' ? '报价' : d.stage === 'won' ? '订单' : '合作';
    const f = { company_id: d.company_id, company_name: s(d.company, 200), kind, title: s(d.name, 200), owner_uid: d.owner_uid || uid, due_date: s(d.close_date, 10),
      amount: num(d.amount), currency: s(d.currency, 8) ?? 'USD', source: 'CRM 机会', deal_id: did, note: d.country ? `国家 ${d.country}` : null };
    const ins = await insert(db, f, uid, { status: 'pending' });
    await logOf(db, ins.id, uid, 'status', `由机会 #${did} 转入`, null, 'pending');
    return json({ ok: true, id: ins.id, code: ins.code, created: true });
  }
  return json({ ok: false, msg: '未知 op' }, 400);
}

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request); if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  return handle(c, b, 'POST');
};
/** 读走 GET:?op=list&status=&owner=&q=&page= 或 ?op=get&id= —— viewer 只放行 GET */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request); if (c instanceof Response) return c;
  return handle(c, Object.fromEntries(new URL(request.url).searchParams), 'GET');
};
