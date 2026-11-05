/**
 * 询盘漏斗事件。补的是「按线索号能把来源、市场、产品、意图、按钮、入库、负责人、跟进查出来」。
 * 不改指派/接单的判断，不改 RFQ 必填项。写失败只吞掉，不能让公开提交 500。
 *
 * 表：inquiry_events（db/migrations/0131_inquiry_events.sql）
 * 查询：登录后 GET /api/admin/inquiry?events=1&ticket_id=123
 * 表里的 inquiry_id 就是提交接口返回的 ticket_id。
 *
 * 节点（event）与去重键：
 *   cta       从哪个按钮进来          键 cta，一条线索一次
 *   saved     入库                    键 saved，一条线索一次
 *   dedupe    重复提交并回原线索号    键 dedupe，只记第一次合并
 *   assign    指派负责人              键 assign:<用户编号>，同一人重复指派不另记
 *   accept    接单                    键 accept，一次
 *   followup  写了跟进                键 followup:<正文指纹>，同一段文字不另记
 *   status    跟进状态变更            键 status:<旧>-><新>，同一次变更不另记
 *
 * 每一行都带当时的归因字段。fields 快照以入库行（event=saved）的来源/市场/产品/意图/按钮为准，
 * 负责人和跟进状态以 inquiries 上的当前值为准。时间窗只裁事件列表，不把快照裁空。
 * 客户邮箱、姓名、正文不进这张表，也不进这个查询结果。
 */

export const INQUIRY_EVENT_LEGEND = {
  source: '来源渠道。表单 source，例如 rfq、sample、form。',
  source_path: '来源页面路径。与 inquiries.source_path 相同。',
  market: '市场。表单里的国家或城市，例如 US、ID、SEA。',
  product_id: '产品编号。表单 product_id。',
  intent: '意图。和按钮分列。来自链接 ?intent=、提交 JSON 的 intent，或正文里的 intent= 行。',
  cta: '按钮。产品页三颗按钮把名字放在链接的 intent 上（inquiry 询盘 / sample 申请样品 / custom 开发同款），提交时写入此列。请求若另带 cta，以 cta 为准。',
  saved_at: '入库时间。等于 inquiries.created_at。事件名 saved 表示入库这一下。',
  assignee_uid: '负责人用户编号。',
  assignee_email: '负责人邮箱。查询时用 assignee_uid 去 users 表补上，事件表不存邮箱。',
  followup_status: '跟进状态。等于 inquiries.status：new、following、replied、won、archived。fields 里是当前状态；每一事件行是那一下当时的状态。',
} as const;

export const INQUIRY_EVENT_KINDS = {
  cta: '从哪个按钮进来。同一条线索只记一次。',
  saved: '入库。同一条线索只记一次。',
  dedupe: '重复提交合并到原线索号。只记一次，不另开线索。',
  assign: '指派负责人。同一个负责人重复指派不另记。',
  accept: '接单。只记一次。',
  followup: '写了跟进。同一段文字不重复记。',
  status: '跟进状态从旧值改到新值。同一次变更不重复记。',
} as const;

const EVENT_NAMES = new Set(Object.keys(INQUIRY_EVENT_KINDS));
const WHEN = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

export interface SqlDb {
  prepare(query: string): {
    bind(...values: any[]): {
      first<T = any>(...rest: any[]): Promise<T | null>;
      all<T = any>(...rest: any[]): Promise<{ results?: T[] } | T[]>;
      run(...rest: any[]): Promise<{ meta?: { last_row_id?: number; changes?: number } }>;
    };
  };
}

export interface InquiryFunnel {
  source: string;
  sourcePath: string | null;
  market: string;
  productId: string;
  cta: string;
  intent: string;
}

export interface InquiryEventWrite {
  inquiryId: number;
  siteId: string;
  event: string;
  dedupeKey: string;
  source?: string | null;
  sourcePath?: string | null;
  market?: string | null;
  productId?: string | null;
  cta?: string | null;
  intent?: string | null;
  savedAt?: string | null;
  assigneeUid?: number | null;
  followupStatus?: string | null;
}

export interface InquiryEventRow {
  ticket_id: number;
  event: string;
  dedupe_key: string;
  source: string;
  source_path: string | null;
  market: string;
  product_id: string;
  cta: string;
  intent: string;
  saved_at: string | null;
  assignee_uid: number | null;
  assignee_email: string | null;
  followup_status: string;
  created_at: string | null;
}

export interface InquiryEventFields {
  source: string;
  source_path: string | null;
  market: string;
  product_id: string;
  cta: string;
  intent: string;
  saved_at: string | null;
  assignee_uid: number | null;
  assignee_email: string | null;
  followup_status: string;
}

export interface InquiryEventsView {
  ok: true;
  ticket_id: number;
  note: string;
  legend: typeof INQUIRY_EVENT_LEGEND;
  event_kinds: typeof INQUIRY_EVENT_KINDS;
  fields: InquiryEventFields;
  events: InquiryEventRow[];
  truncated: boolean;
}

const VIEW_NOTE = '表里的 inquiry_id 就是对外的 ticket_id。时间窗只裁 events 列表；fields 是这条线索现在的快照，不随时间窗变空。客户邮箱、姓名、电话、正文不在这个结果里。';

function clip(raw: unknown, n: number): string {
  return String(raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, n);
}

/** 按钮名和意图只收短词，避免把整段备注或邮箱写进事件列。 */
export function funnelToken(raw: unknown): string {
  const s = clip(raw, 40).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(s) ? s : '';
}

export function funnelSource(raw: unknown): string {
  return funnelToken(raw);
}

function fnv32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function followupDedupeKey(text: string): string {
  return `followup:${fnv32(clip(text, 2000))}`;
}

/** 从正文里取 key=value。target_market 不会被当成 market。 */
export function messageField(message: string, key: string): string {
  const re = new RegExp(`(?:^|[^\\w])${key}=([^\\n;]+)`, 'i');
  const m = re.exec(String(message ?? ''));
  return m ? m[1].trim() : '';
}

function refererTokens(referer: string): { intent: string; cta: string } {
  const raw = String(referer ?? '').trim();
  if (!raw) return { intent: '', cta: '' };
  try {
    const u = new URL(raw);
    return {
      intent: funnelToken(u.searchParams.get('intent')),
      cta: funnelToken(u.searchParams.get('cta')),
    };
  } catch {
    return { intent: '', cta: '' };
  }
}

/**
 * 把一次提交收成事件上的归因。
 * intent 优先用请求里的 intent，其次正文的 intent= 行，再次 Referer 上的 ?intent=。
 * cta 优先用请求里的 cta；没有则用 intent（产品页按钮的名字就写在 intent 上）。
 */
export function funnelFromSubmission(input: {
  source?: unknown;
  sourcePath?: unknown;
  market?: unknown;
  productId?: unknown;
  cta?: unknown;
  intent?: unknown;
  message?: unknown;
  referer?: unknown;
}): InquiryFunnel {
  const message = String(input.message ?? '');
  const ref = refererTokens(String(input.referer ?? ''));
  const intent = funnelToken(input.intent) || funnelToken(messageField(message, 'intent')) || ref.intent;
  const cta = funnelToken(input.cta) || ref.cta || intent;
  const sourcePath = clip(input.sourcePath, 200);
  return {
    source: funnelSource(input.source),
    sourcePath: sourcePath || null,
    market: clip(input.market, 80) || clip(messageField(message, 'market'), 80),
    productId: clip(input.productId, 40) || clip(messageField(message, 'product_id'), 40),
    cta,
    intent,
  };
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(v: unknown): string {
  return v == null ? '' : String(v);
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

async function run(db: SqlDb, sql: string, ...args: unknown[]): Promise<number> {
  const r = await db.prepare(sql).bind(...args).run();
  return Number(r?.meta?.changes ?? 0);
}

function blankToNull(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

/** 写入一行。命中唯一键时返回 duplicate，不覆盖已有行。表不存在时抛错，调用方决定是否吞掉。 */
export async function recordInquiryEvent(db: SqlDb, row: InquiryEventWrite): Promise<'inserted' | 'duplicate'> {
  const inquiryId = Number(row.inquiryId);
  const siteId = clip(row.siteId, 64);
  const event = clip(row.event, 32);
  const dedupeKey = clip(row.dedupeKey, 240);
  if (!inquiryId || inquiryId < 1) throw new Error('线索编号不合法');
  if (!siteId) throw new Error('站点不合法');
  if (!EVENT_NAMES.has(event)) throw new Error('事件名不合法');
  if (!dedupeKey) throw new Error('去重键不能为空');
  const changes = await run(
    db,
    `INSERT OR IGNORE INTO inquiry_events (
       inquiry_id, site_id, event, dedupe_key,
       source, source_path, market, product_id, cta, intent,
       saved_at, assignee_uid, followup_status
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    inquiryId,
    siteId,
    event,
    dedupeKey,
    blankToNull(funnelSource(row.source)),
    blankToNull(clip(row.sourcePath, 200)),
    blankToNull(clip(row.market, 80)),
    blankToNull(clip(row.productId, 40)),
    blankToNull(funnelToken(row.cta)),
    blankToNull(funnelToken(row.intent)),
    blankToNull(clip(row.savedAt, 40)),
    num(row.assigneeUid),
    blankToNull(clip(row.followupStatus, 32)),
  );
  return changes > 0 ? 'inserted' : 'duplicate';
}

interface LiveRow {
  created_at: string | null;
  status: string | null;
  assignee_uid: number | null;
  source_path: string | null;
  message: string | null;
}

async function loadLive(db: SqlDb, inquiryId: number, siteId: string): Promise<LiveRow | null> {
  return first<LiveRow>(
    db,
    `SELECT created_at, status, assignee_uid, source_path, message
       FROM inquiries WHERE id=? AND site_id=?`,
    inquiryId,
    siteId,
  );
}

interface SavedRow {
  source: string | null;
  source_path: string | null;
  market: string | null;
  product_id: string | null;
  cta: string | null;
  intent: string | null;
  saved_at: string | null;
}

async function loadSaved(db: SqlDb, inquiryId: number, siteId: string): Promise<SavedRow | null> {
  return first<SavedRow>(
    db,
    `SELECT source, source_path, market, product_id, cta, intent, saved_at
       FROM inquiry_events
      WHERE site_id=? AND inquiry_id=? AND event='saved'
      ORDER BY id ASC LIMIT 1`,
    siteId,
    inquiryId,
  );
}

/** 入库时写「按钮」和「入库」两行。重复调用不会多出第二行。表未迁移时静默跳过。 */
export async function recordInquiryIngest(db: SqlDb, args: {
  inquiryId: number;
  siteId: string;
  funnel: InquiryFunnel;
}): Promise<void> {
  try {
    const live = await loadLive(db, args.inquiryId, args.siteId);
    if (!live) return;
    const common: InquiryEventWrite = {
      inquiryId: args.inquiryId,
      siteId: args.siteId,
      event: 'saved',
      dedupeKey: 'saved',
      source: args.funnel.source,
      sourcePath: args.funnel.sourcePath || live.source_path,
      market: args.funnel.market,
      productId: args.funnel.productId,
      cta: args.funnel.cta,
      intent: args.funnel.intent,
      savedAt: live.created_at,
      assigneeUid: num(live.assignee_uid),
      followupStatus: text(live.status) || 'new',
    };
    if (common.cta || common.intent) {
      await recordInquiryEvent(db, { ...common, event: 'cta', dedupeKey: 'cta' });
    }
    await recordInquiryEvent(db, common);
  } catch { /* 事件表未迁移或写入失败：线索已经在 inquiries 里，回执照旧 */ }
}

/**
 * 指派、接单、跟进、状态变更、重复合并。归因从入库行抄过来，负责人和状态用这一下的值。
 * 不抛错。
 */
export async function trackInquiryMilestone(db: SqlDb, args: {
  inquiryId: number;
  siteId: string;
  event: 'assign' | 'accept' | 'followup' | 'status' | 'dedupe';
  dedupeKey: string;
  assigneeUid?: number | null;
  followupStatus?: string | null;
}): Promise<void> {
  try {
    const live = await loadLive(db, args.inquiryId, args.siteId);
    if (!live) return;
    const saved = await loadSaved(db, args.inquiryId, args.siteId);
    const status = clip(args.followupStatus, 32) || text(live.status);
    await recordInquiryEvent(db, {
      inquiryId: args.inquiryId,
      siteId: args.siteId,
      event: args.event,
      dedupeKey: args.dedupeKey,
      source: saved?.source,
      sourcePath: saved?.source_path || live.source_path,
      market: saved?.market,
      productId: saved?.product_id,
      cta: saved?.cta,
      intent: saved?.intent,
      savedAt: saved?.saved_at || live.created_at,
      assigneeUid: args.assigneeUid != null ? args.assigneeUid : live.assignee_uid,
      followupStatus: status,
    });
  } catch { /* 主路径已写完，事件失败不回滚 */ }
}

export async function recordInquiryDedupe(db: SqlDb, inquiryId: number, siteId: string): Promise<void> {
  await trackInquiryMilestone(db, {
    inquiryId,
    siteId,
    event: 'dedupe',
    dedupeKey: 'dedupe',
  });
}

export function normalizeWindow(from: unknown, to: unknown): { from: string; to: string } {
  const one = (raw: unknown, end: boolean): string => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (!WHEN.test(s)) throw new Error('时间窗要用 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return end ? `${s} 23:59:59` : `${s} 00:00:00`;
    return s.replace('T', ' ');
  };
  return { from: one(from, false), to: one(to, true) };
}

function inWindow(created: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  const t = text(created).replace('T', ' ').slice(0, 19);
  if (!t) return false;
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

function rowOf(ticketId: number, r: any): InquiryEventRow {
  return {
    ticket_id: ticketId,
    event: text(r.event),
    dedupe_key: text(r.dedupe_key),
    source: text(r.source),
    source_path: r.source_path ?? null,
    market: text(r.market),
    product_id: text(r.product_id),
    cta: text(r.cta),
    intent: text(r.intent),
    saved_at: r.saved_at ?? null,
    assignee_uid: num(r.assignee_uid),
    assignee_email: r.assignee_email ?? null,
    followup_status: text(r.followup_status),
    created_at: r.created_at ?? null,
  };
}

/** 按线索号读事件。线索不属于这个站点时返回 null。表不存在时抛错，让接口返回 503 而不是假装没有事件。 */
export async function readInquiryEvents(
  db: SqlDb,
  inquiryId: number,
  siteId: string,
  window: { from?: unknown; to?: unknown } = {},
): Promise<InquiryEventsView | null> {
  const id = Number(inquiryId);
  if (!id || !siteId) return null;
  const span = normalizeWindow(window.from, window.to);
  const live = await first<any>(
    db,
    `SELECT i.id, i.status, i.source_path, i.created_at, i.message, i.assignee_uid,
            u.email AS assignee_email
       FROM inquiries i
       LEFT JOIN users u ON u.id = i.assignee_uid
      WHERE i.id=? AND i.site_id=?`,
    id,
    siteId,
  );
  if (!live) return null;
  const raw = await all<any>(
    db,
    `SELECT e.event, e.dedupe_key, e.source, e.source_path, e.market, e.product_id,
            e.cta, e.intent, e.saved_at, e.assignee_uid, e.followup_status, e.created_at,
            u.email AS assignee_email
       FROM inquiry_events e
       LEFT JOIN users u ON u.id = e.assignee_uid
      WHERE e.site_id=? AND e.inquiry_id=?
      ORDER BY e.id ASC
      LIMIT 201`,
    siteId,
    id,
  );
  const truncated = raw.length > 200;
  const allRows = raw.slice(0, 200).map((r) => rowOf(id, r));
  const saved = allRows.find((r) => r.event === 'saved');
  const message = text(live.message);
  const fields: InquiryEventFields = {
    source: saved?.source || '',
    source_path: saved?.source_path || live.source_path || null,
    market: saved?.market || clip(messageField(message, 'market'), 80),
    product_id: saved?.product_id || clip(messageField(message, 'product_id'), 40),
    cta: saved?.cta || '',
    intent: saved?.intent || funnelToken(messageField(message, 'intent')),
    saved_at: saved?.saved_at || live.created_at || null,
    assignee_uid: num(live.assignee_uid),
    assignee_email: live.assignee_email ?? null,
    followup_status: text(live.status),
  };
  return {
    ok: true,
    ticket_id: id,
    note: VIEW_NOTE,
    legend: INQUIRY_EVENT_LEGEND,
    event_kinds: INQUIRY_EVENT_KINDS,
    fields,
    events: allRows.filter((r) => inWindow(r.created_at, span.from, span.to)),
    truncated,
  };
}
