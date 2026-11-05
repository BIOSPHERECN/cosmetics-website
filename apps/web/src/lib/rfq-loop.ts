/**
 * RFQ 真闭环：接收去重、测试标记、指派并通知、接单并记跟进。
 * 不自动报价，不建有效客户（is_test=1 时 shouldEnterValidCustomer 为 false）。
 * 通知失败只落错误字段，调用方不得据此删除 inquiries 行。
 *
 * 0130 未迁移时，带新列的语句会抛 no such column。询盘 INSERT 仍走旧列，
 * 由调用方 catch，避免指派功能把「先入库」一起拖垮。
 */
export const RFQ_TEST_MARK = 'RFQ-E2E-TEST';
export const INQUIRY_OK_MSG = '已收到,我们会在两个工作日内书面回复。本接口不自动报价。';

export const RFQ_LOOP_SCENARIOS = [
  {
    key: 'us-skincare',
    title: '美国护肤',
    source_path: '/en/product/peptide-barrier-serum-eu/',
    product_slug: 'peptide-barrier-serum-eu',
    page: 'product',
    lang: 'en',
    name: 'RFQ-E2E-TEST Avery Cole',
    company: 'RFQ-E2E-TEST Northstar Skin',
    email: 'rfq-e2e-us-skincare@example.com',
    country: 'US',
    category: 'skincare',
    volume: '1k-5k',
    market: 'US',
    product_id: 'peptide-barrier-serum-eu',
    message: 'RFQ-E2E-TEST US skincare private label serum for the US market. Please reply in writing. Do not auto-quote.',
    followup: 'RFQ-E2E-TEST 已接单：美国护肤，先核对市场与规格，不报价。',
  },
  {
    key: 'id-oral',
    title: '印尼口腔',
    /* 口腔没有独立爆品详情卡。/solutions/oral-care/ 会 301 到服务锚点。能打开并按品类选品的是成品库。 */
    source_path: '/id/portfolio/?cat=oral',
    product_slug: 'oral',
    page: 'portfolio',
    lang: 'id',
    name: 'RFQ-E2E-TEST Sari Putri',
    company: 'RFQ-E2E-TEST Jakarta Oral',
    email: 'rfq-e2e-id-oral@example.com',
    country: 'ID',
    category: 'oral',
    volume: '5k-20k',
    market: 'ID',
    product_id: 'oral-care',
    message: 'RFQ-E2E-TEST Indonesia toothpaste OEM. Please reply in writing. Do not auto-quote.',
    followup: 'RFQ-E2E-TEST 已接单：印尼口腔，先核对剂型与目标市场法规分类，不报价。',
  },
  {
    key: 'cn-crossborder',
    title: '国内跨境品牌',
    source_path: '/zh-cn/product/niacinamide-txa-serum-sa/',
    product_slug: 'niacinamide-txa-serum-sa',
    page: 'product',
    lang: 'zh-cn',
    name: 'RFQ-E2E-TEST 周宁',
    company: 'RFQ-E2E-TEST 杭越跨境',
    email: 'rfq-e2e-cn-xborder@example.com',
    country: 'CN',
    category: 'skincare',
    volume: '1k-5k',
    market: 'SEA',
    product_id: 'niacinamide-txa-serum-sa',
    message: 'RFQ-E2E-TEST 国内跨境品牌要护肤代工，请书面回复。不要自动报价。',
    followup: 'RFQ-E2E-TEST 已接单：国内跨境品牌，先核对出口市场与规格，不报价。',
  },
] as const;

export type SqlDb = {
  prepare(query: string): {
    bind(...values: any[]): {
      first<T = any>(...rest: any[]): Promise<T | null>;
      all<T = any>(...rest: any[]): Promise<{ results?: T[] } | T[]>;
      run(...rest: any[]): Promise<{ meta?: { last_row_id?: number; changes?: number } }>;
    };
  };
};

export interface InquiryInsert {
  site: string;
  lang: string;
  name: string;
  company: string | null;
  email: string;
  country: string | null;
  message: string;
  spam: number;
  sourcePath: string | null;
  referrer: string | null;
  category: string | null;
  volume: string | null;
  whatsapp: string | null;
}

export interface LoopNote {
  kind: string;
  text: string;
  created_at: string | null;
  user_id: number | null;
}

export interface InquiryLoopView {
  ok: true;
  ticket_id: number;
  is_test: boolean;
  status: string;
  name: string;
  company: string | null;
  email: string;
  category: string | null;
  source_path: string | null;
  saved: true;
  dedupe_key: string | null;
  dedupe_hits: number;
  notified_at: string | null;
  notify_error: string | null;
  assignee_uid: number | null;
  assignee_email: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  assignee_notified_at: string | null;
  assignee_notify_error: string | null;
  accepted_at: string | null;
  accepted_by: number | null;
  followup_text: string | null;
  followup_at: string | null;
  notes: LoopNote[];
  stages: {
    product_path: boolean;
    saved: boolean;
    deduped_receive: boolean;
    customer_notified: boolean;
    assigned: boolean;
    assignee_notified: boolean;
    accepted: boolean;
    followup: boolean;
  };
}

export type NotifyFn = (input: { to: string; subject: string; text: string }) => Promise<{ ok: boolean; msg?: string }>;

const ASSIGN_ROLES = new Set(['admin', 'sales', 'editor']);

export function rfqIsTestLead(input: {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  message?: string | null;
  is_test?: unknown;
}): boolean {
  const flag = input.is_test;
  if (flag === true || flag === 1) return true;
  const word = String(flag ?? '').trim().toLowerCase();
  if (word === '1' || word === 'true' || word === 'yes') return true;
  const blob = [input.name, input.email, input.company, input.message].map((x) => String(x ?? '')).join('\n');
  if (blob.includes(RFQ_TEST_MARK)) return true;
  const email = String(input.email ?? '').trim().toLowerCase();
  return email.startsWith('rfq-e2e-') || email.includes('+rfq-e2e@') || email.includes('+rfq-e2e');
}

/** 测试线索不进 CRM 有效客户。A/B 且非测试才允许自动建客户。 */
export function shouldEnterValidCustomer(isTest: boolean, grade: string): boolean {
  if (isTest) return false;
  return grade === 'A' || grade === 'B';
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function fnv32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 同一站点、邮箱、品类、市场、产品、正文（前 500 字）在未成交/未归档的 30 天内视为同一条线索。 */
export function rfqDedupeKey(input: {
  site: string;
  email: string;
  category?: string | null;
  market?: string | null;
  productId?: string | null;
  message: string;
}): string {
  const msg = norm(input.message).slice(0, 500);
  return [
    'v1',
    norm(input.site),
    norm(input.email),
    norm(input.category),
    norm(input.market),
    norm(input.productId),
    fnv32(msg),
  ].join('|').slice(0, 240);
}

export function planInquiryLoop(input: {
  site: string;
  email: string;
  name?: string | null;
  company?: string | null;
  message: string;
  category?: string | null;
  market?: string | null;
  productId?: string | null;
  is_test?: unknown;
}): { dedupeKey: string; isTest: boolean } {
  return {
    isTest: rfqIsTestLead(input),
    dedupeKey: rfqDedupeKey(input),
  };
}

async function first<T>(db: SqlDb, sql: string, ...args: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...args).first<T>();
  return row ?? null;
}

async function all<T>(db: SqlDb, sql: string, ...args: unknown[]): Promise<T[]> {
  const raw = await db.prepare(sql).bind(...args).all<T>();
  if (Array.isArray(raw)) return raw;
  return raw?.results ?? [];
}

async function run(db: SqlDb, sql: string, ...args: unknown[]): Promise<{ lastId: number; changes: number }> {
  const r = await db.prepare(sql).bind(...args).run();
  return {
    lastId: Number(r?.meta?.last_row_id ?? 0),
    changes: Number(r?.meta?.changes ?? 0),
  };
}

export function migrationHint(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /no such column|no such table/i.test(msg)
    ? '指派/接单字段未迁移，请先执行 db/migrations/0130_rfq_loop.sql'
    : null;
}

export async function insertInquiryRow(db: SqlDb, row: InquiryInsert): Promise<number> {
  const ins = await run(
    db,
    `INSERT INTO inquiries (site_id, lang, name, company, email, country, message,
                            spam_score, source_path, referrer, category, volume, whatsapp)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    row.site,
    row.lang,
    row.name,
    row.company,
    row.email,
    row.country,
    row.message,
    row.spam,
    row.sourcePath,
    row.referrer,
    row.category,
    row.volume,
    row.whatsapp,
  );
  return ins.lastId;
}

/** 命中未关闭的同键线索则记下一次去重并返回原编号。没有命中返回 null。备注写失败仍返回原编号。 */
export async function absorbDuplicate(db: SqlDb, siteId: string, dedupeKey: string): Promise<number | null> {
  if (!dedupeKey) return null;
  const row = await first<{ id: number }>(
    db,
    `SELECT id FROM inquiries
      WHERE site_id=? AND dedupe_key=? AND status NOT IN ('archived','won')
        AND datetime(created_at) >= datetime('now','-30 day')
      ORDER BY id ASC LIMIT 1`,
    siteId,
    dedupeKey,
  );
  if (!row?.id) return null;
  try {
    await run(
      db,
      `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?, NULL, 'dedupe', ?)`,
      row.id,
      '重复提交已合并，沿用原线索编号',
    );
  } catch { /* 去重以原编号为准，备注失败不另开一条线索 */ }
  return Number(row.id);
}

export async function stampInquiryLoop(db: SqlDb, id: number, stamp: { dedupeKey: string; isTest: boolean }): Promise<void> {
  if (!id) return;
  await run(db, `UPDATE inquiries SET dedupe_key=?, is_test=? WHERE id=?`, stamp.dedupeKey || null, stamp.isTest ? 1 : 0, id);
}

export async function markCustomerNotifyFailed(db: SqlDb, id: number): Promise<void> {
  await run(
    db,
    `UPDATE inquiries SET notify_error=? WHERE id=? AND notified_at IS NULL`,
    'customer-notify-failed',
    id,
  );
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function flag(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}

export async function readInquiryLoop(db: SqlDb, id: number, siteId: string): Promise<InquiryLoopView | null> {
  const row = await first<any>(
    db,
    `SELECT i.id, i.status, i.name, i.company, i.email, i.category, i.source_path, i.created_at,
            i.notified_at, i.notify_error, i.is_test, i.dedupe_key,
            i.assignee_uid, i.assigned_at, i.assignee_notified_at, i.assignee_notify_error,
            i.accepted_at, i.accepted_by, i.followup_text, i.followup_at,
            u.email AS assignee_email, u.display_name AS assignee_name
       FROM inquiries i
       LEFT JOIN users u ON u.id = i.assignee_uid
      WHERE i.id=? AND i.site_id=?`,
    id,
    siteId,
  );
  if (!row) return null;
  const notes = await all<any>(
    db,
    `SELECT kind, text, created_at, user_id FROM inquiry_notes WHERE inquiry_id=? ORDER BY id`,
    id,
  ).catch(() => [] as any[]);
  const dedupeHits = notes.filter((n) => n.kind === 'dedupe').length;
  const followup = Boolean(String(row.followup_text ?? '').trim()) || notes.some((n) => n.kind === 'note' && String(n.text ?? '').trim());
  const view: InquiryLoopView = {
    ok: true,
    ticket_id: Number(row.id),
    is_test: flag(row.is_test),
    status: String(row.status ?? ''),
    name: String(row.name ?? ''),
    company: row.company ?? null,
    email: String(row.email ?? ''),
    category: row.category ?? null,
    source_path: row.source_path ?? null,
    saved: true,
    dedupe_key: row.dedupe_key ?? null,
    dedupe_hits: dedupeHits,
    notified_at: row.notified_at ?? null,
    notify_error: row.notify_error ?? null,
    assignee_uid: num(row.assignee_uid),
    assignee_email: row.assignee_email ?? null,
    assignee_name: row.assignee_name ?? null,
    assigned_at: row.assigned_at ?? null,
    assignee_notified_at: row.assignee_notified_at ?? null,
    assignee_notify_error: row.assignee_notify_error ?? null,
    accepted_at: row.accepted_at ?? null,
    accepted_by: num(row.accepted_by),
    followup_text: row.followup_text ?? null,
    followup_at: row.followup_at ?? null,
    notes: notes.map((n) => ({
      kind: String(n.kind ?? ''),
      text: String(n.text ?? ''),
      created_at: n.created_at ?? null,
      user_id: num(n.user_id),
    })),
    stages: {
      product_path: Boolean(String(row.source_path ?? '').trim()),
      saved: true,
      deduped_receive: Boolean(row.dedupe_key),
      customer_notified: Boolean(row.notified_at),
      assigned: Boolean(row.assignee_uid) && Boolean(row.assigned_at),
      assignee_notified: Boolean(row.assignee_notified_at),
      accepted: Boolean(row.accepted_at),
      followup,
    },
  };
  return view;
}

export async function listPendingAccept(db: SqlDb, siteId: string, testOnly: boolean): Promise<Array<{
  ticket_id: number; name: string; email: string; company: string | null; status: string;
  is_test: boolean; assignee_uid: number | null; accepted_at: null; created_at: string | null;
}>> {
  const sql = testOnly
    ? `SELECT id, name, email, company, status, is_test, assignee_uid, accepted_at, created_at
         FROM inquiries
        WHERE site_id=? AND accepted_at IS NULL AND COALESCE(is_test,0)=1
          AND status NOT IN ('archived','won')
        ORDER BY id DESC LIMIT 50`
    : `SELECT id, name, email, company, status, is_test, assignee_uid, accepted_at, created_at
         FROM inquiries
        WHERE site_id=? AND accepted_at IS NULL
          AND status NOT IN ('archived','won')
        ORDER BY id DESC LIMIT 50`;
  const rows = await all<any>(db, sql, siteId);
  return rows.map((r) => ({
    ticket_id: Number(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    company: r.company ?? null,
    status: String(r.status ?? ''),
    is_test: flag(r.is_test),
    assignee_uid: num(r.assignee_uid),
    accepted_at: null,
    created_at: r.created_at ?? null,
  }));
}

async function loadAssignee(db: SqlDb, uid?: number, email?: string): Promise<{ id: number; email: string; role: string; display_name: string | null } | null> {
  if (uid) {
    return first(db, `SELECT id, email, role, display_name FROM users WHERE id=?`, uid);
  }
  const em = String(email ?? '').trim().toLowerCase();
  if (!em) return null;
  return first(db, `SELECT id, email, role, display_name FROM users WHERE lower(email)=?`, em);
}

export async function assignInquiry(db: SqlDb, args: {
  id: number;
  siteId: string;
  actorUid: number;
  assigneeUid?: number;
  assigneeEmail?: string;
  notify: NotifyFn;
}): Promise<{ ok: true; loop: InquiryLoopView } | { ok: false; status: number; msg: string }> {
  const id = Number(args.id);
  if (!id || !args.siteId) return { ok: false, status: 400, msg: '参数不合法' };
  const row = await first<any>(db, `SELECT id, is_test, name, company, email, category, accepted_at, status FROM inquiries WHERE id=? AND site_id=?`, id, args.siteId);
  if (!row) return { ok: false, status: 404, msg: '询盘不存在' };
  if (row.accepted_at) return { ok: false, status: 409, msg: '已接单，不能改派' };
  const user = await loadAssignee(db, args.assigneeUid, args.assigneeEmail);
  if (!user?.id || !user.email) return { ok: false, status: 400, msg: '找不到业务负责人' };
  if (!ASSIGN_ROLES.has(String(user.role ?? ''))) return { ok: false, status: 400, msg: '该用户不能作为业务负责人' };

  const updated = await run(
    db,
    `UPDATE inquiries
        SET assignee_uid=?, assigned_at=datetime('now'), assignee_notified_at=NULL, assignee_notify_error=NULL
      WHERE id=? AND site_id=? AND accepted_at IS NULL`,
    user.id,
    id,
    args.siteId,
  );
  if (!updated.changes) return { ok: false, status: 409, msg: '指派没有写成（可能已接单）' };
  try {
    await run(
      db,
      `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?, 'assign', ?)`,
      id,
      args.actorUid,
      `指派给 ${user.display_name || user.email} (#${user.id})`,
    );
  } catch { /* 指派已落在 inquiries.assignee_uid */ }

  const isTest = flag(row.is_test);
  const subject = `${isTest ? '[TEST] ' : ''}询盘 #${id} 已指派给你`;
  const text = [
    isTest ? '这是测试线索，不入有效客户。' : '',
    `线索编号 #${id}`,
    `联系人 ${row.name ?? ''} ${row.company ?? ''}`.trim(),
    `邮箱 ${row.email ?? ''}`,
    `品类 ${row.category ?? '-'}`,
    '本通知不含报价。请确认接单并记跟进。',
    '后台: https://biosphere-ai.com/bohui/inquiries/',
  ].filter(Boolean).join('\n');

  let notified = false;
  let err = 'notify-failed';
  try {
    const r = await args.notify({ to: user.email, subject, text });
    notified = r?.ok === true;
    if (!notified) err = String(r?.msg || 'notify-failed').slice(0, 180);
  } catch (e) {
    notified = false;
    err = (e instanceof Error ? e.message : String(e)).slice(0, 180) || 'notify-threw';
  }
  try {
    if (notified) {
      await run(db, `UPDATE inquiries SET assignee_notified_at=datetime('now'), assignee_notify_error=NULL WHERE id=? AND site_id=?`, id, args.siteId);
    } else {
      await run(db, `UPDATE inquiries SET assignee_notify_error=? WHERE id=? AND site_id=?`, err, id, args.siteId);
      try {
        await run(db, `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?, 'notify_fail', ?)`, id, args.actorUid, `指派通知失败：${err}`.slice(0, 500));
      } catch { /* 错误已在 assignee_notify_error */ }
    }
  } catch { /* 指派行还在；通知戳写失败不回滚负责人 */ }

  const loop = await readInquiryLoop(db, id, args.siteId);
  if (!loop) return { ok: false, status: 500, msg: '指派后读不到线索' };
  return { ok: true, loop };
}

export async function acceptInquiry(db: SqlDb, args: {
  id: number;
  siteId: string;
  actorUid: number;
  actorRole: string;
  note: string;
}): Promise<{ ok: true; loop: InquiryLoopView } | { ok: false; status: number; msg: string }> {
  const id = Number(args.id);
  const note = String(args.note ?? '').trim();
  if (!id || !args.siteId) return { ok: false, status: 400, msg: '参数不合法' };
  if (!note) return { ok: false, status: 400, msg: '跟进内容不能为空' };
  if (note.length > 2000) return { ok: false, status: 400, msg: '单条跟进最长 2000 字' };
  const row = await first<any>(
    db,
    `SELECT id, status, assignee_uid, accepted_at FROM inquiries WHERE id=? AND site_id=?`,
    id,
    args.siteId,
  );
  if (!row) return { ok: false, status: 404, msg: '询盘不存在' };
  if (!row.assignee_uid) return { ok: false, status: 409, msg: '尚未指派，不能接单' };
  const owner = Number(row.assignee_uid) === Number(args.actorUid);
  if (!owner && args.actorRole !== 'admin') return { ok: false, status: 403, msg: '只有业务负责人或管理员可以接单' };

  const wasNew = row.status === 'new';
  const firstAccept = !row.accepted_at;
  const updated = await run(
    db,
    `UPDATE inquiries
        SET accepted_at=COALESCE(accepted_at, datetime('now')),
            accepted_by=COALESCE(accepted_by, ?),
            followup_text=?,
            followup_at=datetime('now'),
            status=CASE WHEN status='new' THEN 'following' ELSE status END
      WHERE id=? AND site_id=? AND assignee_uid IS NOT NULL`,
    args.actorUid,
    note.slice(0, 2000),
    id,
    args.siteId,
  );
  if (!updated.changes) return { ok: false, status: 409, msg: '接单没有写成' };
  try {
    if (wasNew) {
      await run(db, `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?, 'status', ?)`, id, args.actorUid, 'new→following');
    }
    if (firstAccept) {
      await run(db, `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?, 'accept', ?)`, id, args.actorUid, '确认接单');
    }
    await run(db, `INSERT INTO inquiry_notes (inquiry_id, user_id, kind, text) VALUES (?,?, 'note', ?)`, id, args.actorUid, note.slice(0, 2000));
  } catch { /* followup_text 已写入 inquiries */ }

  const loop = await readInquiryLoop(db, id, args.siteId);
  if (!loop) return { ok: false, status: 500, msg: '接单后读不到线索' };
  return { ok: true, loop };
}
