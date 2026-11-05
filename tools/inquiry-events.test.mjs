/**
 * 询盘漏斗事件可按线索号查（仓内，不打生产）。
 *
 *   node tools/inquiry-events.test.mjs
 *
 * 三条测试线索沿用 RFQ_LOOP_SCENARIOS（名字和邮箱都带 RFQ-E2E-TEST，is_test=1）：
 *   美国护肤   按钮 inquiry（询盘）     意图 inquiry
 *   印尼口腔   按钮 sample（申请样品）  意图 sample
 *   国内跨境   按钮 custom（开发同款）  意图 custom
 *
 * 每条都走：入库 → 再写一次（不得多一行）→ 指派 → 接单跟进 → 重复提交合并。
 * 然后用 readInquiryEvents 按 ticket_id 读出来，核对来源、市场、产品、意图、按钮、入库、负责人、跟进。
 * 事件表不存客户邮箱、姓名、正文。查询函数按 site_id 隔离。没登录的接口在 admin/inquiry.ts 里先过 apiGuard。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  funnelFromSubmission,
  followupDedupeKey,
  messageField,
  readInquiryEvents,
  recordInquiryDedupe,
  recordInquiryEvent,
  recordInquiryIngest,
  trackInquiryMilestone,
} from '../apps/web/src/lib/inquiry-events.ts';
import {
  RFQ_LOOP_SCENARIOS,
  absorbDuplicate,
  acceptInquiry,
  assignInquiry,
  insertInquiryRow,
  planInquiryLoop,
  shouldEnterValidCustomer,
  stampInquiryLoop,
} from '../apps/web/src/lib/rfq-loop.ts';

const SITE = 'biosphere-ai';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const BUTTON = {
  'us-skincare': { cta: 'inquiry', intent: 'inquiry', label: '询盘' },
  'id-oral': { cta: 'sample', intent: 'sample', label: '申请样品' },
  'cn-crossborder': { cta: 'custom', intent: 'custom', label: '开发同款' },
};

function fakeD1(withEvents = true) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL DEFAULT 'x',
      pass_salt TEXT NOT NULL DEFAULT 'y',
      role TEXT NOT NULL DEFAULT 'editor',
      display_name TEXT
    );
    CREATE TABLE inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT NOT NULL,
      country TEXT,
      message TEXT NOT NULL,
      spam_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_path TEXT,
      referrer TEXT,
      category TEXT,
      volume TEXT,
      whatsapp TEXT,
      notified_at TEXT,
      dedupe_key TEXT,
      is_test INTEGER NOT NULL DEFAULT 0,
      assignee_uid INTEGER,
      assigned_at TEXT,
      assignee_notified_at TEXT,
      assignee_notify_error TEXT,
      accepted_at TEXT,
      accepted_by INTEGER,
      followup_text TEXT,
      followup_at TEXT,
      notify_error TEXT
    );
    CREATE TABLE inquiry_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id INTEGER NOT NULL,
      user_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'note',
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  if (withEvents) raw.exec(read('db/migrations/0131_inquiry_events.sql'));
  raw.prepare(`INSERT INTO users (email, role, display_name) VALUES ('admin-rfq-e2e@biosphere-ai.com','admin','管理员')`).run();
  raw.prepare(`INSERT INTO users (email, role, display_name) VALUES ('sales-rfq-e2e@biosphere-ai.com','sales','业务负责人')`).run();
  return {
    raw,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              const row = raw.prepare(sql).get(...args);
              return row ?? null;
            },
            async all() {
              return { results: raw.prepare(sql).all(...args) };
            },
            async run() {
              const info = raw.prepare(sql).run(...args);
              return { meta: { last_row_id: Number(info.lastInsertRowid || 0), changes: Number(info.changes || 0) } };
            },
          };
        },
      };
    },
  };
}

async function counts(db, id) {
  const rows = await db.prepare(
    `SELECT event, COUNT(*) n FROM inquiry_events WHERE inquiry_id=? GROUP BY event`,
  ).bind(id).all();
  const out = {};
  for (const row of rows.results) out[row.event] = Number(row.n);
  return out;
}

async function openLead(db, scenario, funnel) {
  const plan = planInquiryLoop({
    site: SITE,
    email: scenario.email,
    name: scenario.name,
    company: scenario.company,
    message: scenario.message,
    category: scenario.category,
    market: scenario.market,
    productId: scenario.product_id,
    is_test: '1',
  });
  assert.equal(plan.isTest, true, scenario.key);
  const dup = await absorbDuplicate(db, SITE, plan.dedupeKey);
  if (dup) {
    await recordInquiryDedupe(db, dup, SITE);
    return { ticket_id: dup, deduped: true };
  }
  const ticket_id = await insertInquiryRow(db, {
    site: SITE,
    lang: scenario.lang,
    name: scenario.name,
    company: scenario.company,
    email: scenario.email,
    country: scenario.country,
    message: scenario.message,
    spam: 0,
    sourcePath: scenario.source_path,
    referrer: 'biosphere-ai.com',
    category: scenario.category,
    volume: scenario.volume,
    whatsapp: null,
  });
  await stampInquiryLoop(db, ticket_id, plan);
  await recordInquiryIngest(db, {
    inquiryId: ticket_id,
    siteId: SITE,
    funnel: funnelFromSubmission({
      source: 'rfq',
      sourcePath: scenario.source_path,
      market: scenario.market,
      productId: scenario.product_id,
      cta: funnel.cta,
      intent: funnel.intent,
      message: scenario.message,
      referer: `https://biosphere-ai.com${scenario.source_path}?intent=${funnel.intent}`,
    }),
  });
  return { ticket_id, deduped: false };
}

/* 归因：意图和按钮可以不同；链接上的 intent 在没单独传按钮时同时填两列；正文里的 market 不会误拿 target_market。 */
{
  const split = funnelFromSubmission({
    source: 'RFQ',
    cta: 'inquiry',
    intent: 'quote',
    market: 'EU',
    productId: 'split-demo',
    referer: 'https://biosphere-ai.com/en/rfq/?intent=sample',
  });
  assert.equal(split.source, 'rfq');
  assert.equal(split.cta, 'inquiry');
  assert.equal(split.intent, 'quote');

  const fromLink = funnelFromSubmission({
    source: 'rfq',
    market: 'US',
    productId: 'peptide-barrier-serum-eu',
    referer: 'https://biosphere-ai.com/en/rfq/?product_id=peptide-barrier-serum-eu&intent=inquiry',
  });
  assert.equal(fromLink.intent, 'inquiry');
  assert.equal(fromLink.cta, 'inquiry');

  const fromNotes = funnelFromSubmission({
    source: 'rfq',
    message: '【RFQ】 market=ID; category=oral\nproduct_id=oral-care\nintent=sample\ntarget_market=SEA',
  });
  assert.equal(fromNotes.market, 'ID');
  assert.equal(fromNotes.productId, 'oral-care');
  assert.equal(fromNotes.intent, 'sample');
  assert.equal(fromNotes.cta, 'sample');
  assert.equal(messageField('target_market=SEA\nmarket=US', 'market'), 'US');
  assert.equal(funnelFromSubmission({ intent: 'please quote me', source: 'rfq' }).intent, '');
  assert.equal(funnelFromSubmission({ intent: 'buyer@example.com', source: 'rfq' }).intent, '');
  assert.equal(funnelFromSubmission({ intent: 'oem-evidence', source: 'rfq' }).intent, 'oem-evidence');
  assert.equal(funnelFromSubmission({ intent: 'cosmopack-asia-2026', source: 'rfq' }).intent, 'cosmopack-asia-2026');
}

const db = fakeD1(true);
const notifyOk = async () => ({ ok: true });
const evidence = [];
const ids = [];

for (const scenario of RFQ_LOOP_SCENARIOS) {
  const button = BUTTON[scenario.key];
  const opened = await openLead(db, scenario, button);
  assert.equal(opened.deduped, false, scenario.key);
  ids.push(opened.ticket_id);

  await recordInquiryIngest(db, {
    inquiryId: opened.ticket_id,
    siteId: SITE,
    funnel: funnelFromSubmission({
      source: 'rfq',
      sourcePath: scenario.source_path,
      market: scenario.market,
      productId: scenario.product_id,
      cta: button.cta,
      intent: button.intent,
    }),
  });
  const savedTwice = await recordInquiryEvent(db, {
    inquiryId: opened.ticket_id,
    siteId: SITE,
    event: 'saved',
    dedupeKey: 'saved',
    source: 'rfq',
    market: 'SHOULD-NOT-OVERWRITE',
    productId: scenario.product_id,
    cta: button.cta,
    intent: button.intent,
    followupStatus: 'new',
  });
  assert.equal(savedTwice, 'duplicate', scenario.key);

  const assigned = await assignInquiry(db, {
    id: opened.ticket_id,
    siteId: SITE,
    actorUid: 1,
    assigneeEmail: 'sales-rfq-e2e@biosphere-ai.com',
    notify: notifyOk,
  });
  assert.equal(assigned.ok, true, scenario.key);
  const accepted = await acceptInquiry(db, {
    id: opened.ticket_id,
    siteId: SITE,
    actorUid: 2,
    actorRole: 'sales',
    note: scenario.followup,
  });
  assert.equal(accepted.ok, true, scenario.key);

  const merged = await openLead(db, scenario, button);
  assert.equal(merged.deduped, true, scenario.key);
  assert.equal(merged.ticket_id, opened.ticket_id);

  const view = await readInquiryEvents(db, opened.ticket_id, SITE);
  assert.equal(view.ticket_id, opened.ticket_id);
  assert.equal(view.fields.source, 'rfq');
  assert.equal(view.fields.source_path, scenario.source_path);
  assert.equal(view.fields.market, scenario.market);
  assert.equal(view.fields.product_id, scenario.product_id);
  assert.equal(view.fields.cta, button.cta);
  assert.equal(view.fields.intent, button.intent);
  assert.ok(view.fields.saved_at, scenario.key);
  assert.equal(view.fields.assignee_uid, 2);
  assert.equal(view.fields.assignee_email, 'sales-rfq-e2e@biosphere-ai.com');
  assert.equal(view.fields.followup_status, 'following');

  const kinds = view.events.map((e) => e.event);
  for (const name of ['cta', 'saved', 'assign', 'accept', 'followup', 'dedupe']) {
    assert.equal(kinds.filter((k) => k === name).length, 1, `${scenario.key} ${name}`);
  }
  const saved = view.events.find((e) => e.event === 'saved');
  assert.equal(saved.market, scenario.market);
  assert.equal(saved.product_id, scenario.product_id);
  assert.equal(saved.cta, button.cta);
  assert.equal(saved.intent, button.intent);
  assert.equal(saved.followup_status, 'new');
  assert.equal(saved.assignee_uid, null);
  const assign = view.events.find((e) => e.event === 'assign');
  assert.equal(assign.assignee_uid, 2);
  assert.equal(assign.assignee_email, 'sales-rfq-e2e@biosphere-ai.com');
  assert.equal(assign.dedupe_key, 'assign:2');
  assert.equal(view.events.find((e) => e.event === 'accept').followup_status, 'following');

  const dumped = JSON.stringify(view);
  assert.equal(dumped.includes(scenario.email), false, scenario.key);
  assert.equal(dumped.includes(scenario.name), false, scenario.key);
  assert.equal(dumped.includes(scenario.followup), false, scenario.key);
  assert.equal(dumped.includes('whatsapp'), false);

  const future = await readInquiryEvents(db, opened.ticket_id, SITE, { from: '2099-01-01', to: '2099-12-31' });
  assert.equal(future.events.length, 0, scenario.key);
  assert.equal(future.fields.market, scenario.market);
  assert.equal(future.fields.product_id, scenario.product_id);
  assert.equal(future.fields.intent, button.intent);
  assert.equal(future.fields.cta, button.cta);
  assert.equal(future.fields.assignee_uid, 2);
  assert.equal(future.fields.followup_status, 'following');

  const wide = await readInquiryEvents(db, opened.ticket_id, SITE, { from: '2000-01-01', to: '2099-12-31' });
  assert.equal(wide.events.length, view.events.length);

  assert.equal(await readInquiryEvents(db, opened.ticket_id, 'other-site'), null);
  const n = await counts(db, opened.ticket_id);
  assert.equal(n.saved, 1);
  assert.equal(n.cta, 1);
  assert.equal(n.assign, 1);

  const row = await db.prepare(`SELECT is_test FROM inquiries WHERE id=?`).bind(opened.ticket_id).first();
  assert.equal(shouldEnterValidCustomer(Number(row.is_test) === 1, 'A'), false);

  evidence.push({
    title: scenario.title,
    ticket_id: opened.ticket_id,
    button: button.label,
    source: view.fields.source,
    source_path: view.fields.source_path,
    market: view.fields.market,
    product_id: view.fields.product_id,
    cta: view.fields.cta,
    intent: view.fields.intent,
    saved_at: view.fields.saved_at,
    assignee_email: view.fields.assignee_email,
    followup_status: view.fields.followup_status,
    events: kinds,
  });
}

assert.equal(new Set(ids).size, 3);

/* 同一负责人再记一次指派、同一段跟进再记一次，行数不变。换一段跟进才多一行。状态变更单独一行。 */
{
  const id = ids[0];
  const before = await counts(db, id);
  await trackInquiryMilestone(db, {
    inquiryId: id, siteId: SITE, event: 'assign', dedupeKey: 'assign:2', assigneeUid: 2, followupStatus: 'following',
  });
  await trackInquiryMilestone(db, {
    inquiryId: id, siteId: SITE, event: 'followup', dedupeKey: followupDedupeKey(RFQ_LOOP_SCENARIOS[0].followup), followupStatus: 'following',
  });
  const same = await counts(db, id);
  assert.equal(same.assign, before.assign);
  assert.equal(same.followup, before.followup);
  await trackInquiryMilestone(db, {
    inquiryId: id, siteId: SITE, event: 'followup', dedupeKey: followupDedupeKey('另一段跟进'), followupStatus: 'following',
  });
  await db.prepare(`UPDATE inquiries SET status='replied' WHERE id=?`).bind(id).run();
  await trackInquiryMilestone(db, {
    inquiryId: id, siteId: SITE, event: 'status', dedupeKey: 'status:following->replied', followupStatus: 'replied',
  });
  const after = await readInquiryEvents(db, id, SITE);
  assert.equal(after.fields.followup_status, 'replied');
  assert.equal(after.events.filter((e) => e.event === 'status').length, 1);
  assert.equal(after.events.filter((e) => e.event === 'followup').length, 2);
}

/* 按钮和意图分列保存，不会被写成同一个词。 */
{
  const ticket_id = await insertInquiryRow(db, {
    site: SITE,
    lang: 'en',
    name: 'RFQ-E2E-TEST split',
    company: 'RFQ-E2E-TEST Split',
    email: 'rfq-e2e-split@example.com',
    country: 'DE',
    message: 'RFQ-E2E-TEST cta and intent stay apart',
    spam: 0,
    sourcePath: '/en/rfq/',
    referrer: null,
    category: 'skincare',
    volume: 'sample',
    whatsapp: null,
  });
  await recordInquiryIngest(db, {
    inquiryId: ticket_id,
    siteId: SITE,
    funnel: funnelFromSubmission({
      source: 'rfq',
      sourcePath: '/en/rfq/',
      market: 'EU',
      productId: 'split-demo',
      cta: 'inquiry',
      intent: 'quote',
    }),
  });
  const view = await readInquiryEvents(db, ticket_id, SITE);
  assert.equal(view.fields.cta, 'inquiry');
  assert.equal(view.fields.intent, 'quote');
  assert.equal(JSON.stringify(view).includes('rfq-e2e-split@example.com'), false);
}

/* 旧线索没有事件行时：市场、产品、意图从正文补；按钮当时没存，就是空。入库时间用线索创建时间。 */
{
  const ticket_id = await insertInquiryRow(db, {
    site: SITE,
    lang: 'en',
    name: 'RFQ-E2E-TEST legacy',
    company: null,
    email: 'rfq-e2e-legacy@example.com',
    country: 'US',
    message: 'target_market=SEA\nmarket=US\nproduct_id=peptide-barrier-serum-eu\nintent=inquiry',
    spam: 0,
    sourcePath: '/en/product/peptide-barrier-serum-eu/',
    referrer: null,
    category: 'skincare',
    volume: '1k-5k',
    whatsapp: null,
  });
  const view = await readInquiryEvents(db, ticket_id, SITE);
  assert.equal(view.events.length, 0);
  assert.equal(view.fields.market, 'US');
  assert.equal(view.fields.product_id, 'peptide-barrier-serum-eu');
  assert.equal(view.fields.intent, 'inquiry');
  assert.equal(view.fields.cta, '');
  assert.equal(view.fields.source, '');
  assert.equal(view.fields.source_path, '/en/product/peptide-barrier-serum-eu/');
  assert.ok(view.fields.saved_at);
  assert.equal(view.fields.followup_status, 'new');
}

await assert.rejects(
  () => readInquiryEvents(db, ids[0], SITE, { from: 'tomorrow' }),
  /时间窗/,
);

/* 事件表还没建：写入静默跳过，线索还在；读取要报错，不能假装没有事件。 */
{
  const bare = fakeD1(false);
  const ticket_id = await insertInquiryRow(bare, {
    site: SITE,
    lang: 'en',
    name: 'RFQ-E2E-TEST bare',
    company: null,
    email: 'rfq-e2e-bare@example.com',
    country: 'US',
    message: 'RFQ-E2E-TEST keep the lead when events table is missing',
    spam: 0,
    sourcePath: '/en/rfq/',
    referrer: null,
    category: 'skincare',
    volume: 'sample',
    whatsapp: null,
  });
  await recordInquiryIngest(bare, {
    inquiryId: ticket_id,
    siteId: SITE,
    funnel: funnelFromSubmission({ source: 'rfq', market: 'US', productId: 'x', cta: 'inquiry', intent: 'inquiry' }),
  });
  await recordInquiryDedupe(bare, ticket_id, SITE);
  const assigned = await assignInquiry(bare, {
    id: ticket_id, siteId: SITE, actorUid: 1, assigneeUid: 2, notify: notifyOk,
  });
  assert.equal(assigned.ok, true);
  const still = await bare.prepare(`SELECT id, assignee_uid FROM inquiries WHERE id=?`).bind(ticket_id).first();
  assert.equal(Number(still.id), ticket_id);
  assert.equal(Number(still.assignee_uid), 2);
  await assert.rejects(() => readInquiryEvents(bare, ticket_id, SITE), /inquiry_events/);
}

/* 迁移只建事件表，不改 inquiries 的列。 */
{
  const mig = new DatabaseSync(':memory:');
  mig.exec(`CREATE TABLE inquiries (
    id INTEGER PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  const before = mig.prepare(`PRAGMA table_info(inquiries)`).all().map((c) => c.name);
  mig.exec(read('db/migrations/0131_inquiry_events.sql'));
  const after = mig.prepare(`PRAGMA table_info(inquiries)`).all().map((c) => c.name);
  assert.deepEqual(after, before);
  const cols = new Set(mig.prepare(`PRAGMA table_info(inquiry_events)`).all().map((c) => c.name));
  for (const name of ['inquiry_id', 'site_id', 'event', 'dedupe_key', 'source', 'source_path', 'market', 'product_id', 'cta', 'intent', 'saved_at', 'assignee_uid', 'followup_status', 'created_at']) {
    assert.equal(cols.has(name), true, name);
  }
  for (const banned of ['email', 'name', 'message', 'whatsapp', 'company', 'phone']) {
    assert.equal(cols.has(banned), false, banned);
  }
  assert.equal(
    mig.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_inquiry_events_dedupe'`).get()?.name,
    'idx_inquiry_events_dedupe',
  );
}

const sql = read('db/migrations/0131_inquiry_events.sql');
assert.doesNotMatch(sql, /ALTER TABLE inquiries/);
const inquiry = read('apps/web/src/pages/api/inquiry.ts');
const admin = read('apps/web/src/pages/api/admin/inquiry.ts');
const rfq = read('apps/web/src/pages/[lang]/rfq/index.astro');
const middleware = read('apps/web/src/middleware.ts');
const guardAt = admin.indexOf('const c = await apiGuard(request)');
const eventsAt = admin.indexOf("get('events')");
assert.ok(guardAt >= 0 && guardAt < eventsAt, '事件查询必须在登录校验之后');
assert.match(admin, /if \(c instanceof Response\) return c/);
assert.match(admin, /ticket_id/);
assert.match(admin, /0131_inquiry_events\.sql/);
assert.match(inquiry, /recordInquiryIngest\(/);
assert.match(inquiry, /recordInquiryDedupe\(/);
assert.match(inquiry, /\.catch\(\(\) => \{\}\)/);
assert.match(inquiry, /ticket_id: newId/);
assert.match(inquiry, /ticket_id: dupId, deduped: true/);
assert.match(inquiry, /此接口只接受 POST 提交/);
assert.doesNotMatch(inquiry, /json\(\{[^}]*\bevents\b/);
const insertSql = read('apps/web/src/lib/rfq-loop.ts');
const insertAt = insertSql.indexOf('INSERT INTO inquiries');
assert.equal(insertSql.slice(insertAt, insertAt + 280).includes('inquiry_events'), false);
assert.match(rfq, /intent: intentToken/);
assert.match(rfq, /cta: intentToken/);
assert.match(rfq, /intent === 'sample' \|\| intent === 'quote' \|\| intent === 'docs'/);
assert.match(middleware, /const CACHE_V = 'v152'/);
assert.equal(read('apps/web/src/pages/bohui/inquiries.astro').includes('inquiry_events'), false);

console.log(JSON.stringify({ cache_v: 'v152', scenarios: evidence }, null, 2));
console.log('inquiry-events.test.mjs: 三条线索的来源、市场、产品、意图、按钮、入库、负责人、跟进可查，且重复写入不另起一行');
