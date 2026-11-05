/**
 * RFQ 三场景真闭环（仓内可复现，不打生产、不关 Turnstile）。
 *
 *   node tools/rfq-loop.test.mjs
 *
 * 六环节：打开产品页（护肤/跨境为爆品详情；印尼口腔为成品库 ?cat=oral，因无独立详情卡且方案页会 301）→ 提交 →
 * insertInquiryRow 落库并返回 ticket_id → absorbDuplicate 去重 →
 * assignInquiry 指派并通知 → acceptInquiry 接单并记跟进。
 *
 * 失败路径：同一载荷再提交仍是原编号；指派通知抛错不删行；未接单出现在 pending 查询。
 * 场景载荷都带 RFQ-E2E-TEST，is_test=1，shouldEnterValidCustomer 拒绝进有效客户。
 *
 * 现网复验（可选，本文件不带密钥）：
 *   1. 打开场景 source_path（美国护肤 / 印尼口腔 / 国内跨境）。
 *   2. POST /api/inquiry，头 X-Bohui-E2E-Token = Worker 上的 RFQ_E2E_BYPASS_TOKEN
 *      （未设置则这条旁路不生效，仍走 Turnstile）。正文带 RFQ-E2E-TEST，source=rfq，
 *      并带 market / category / volume / product_id / sourcePath。
 *   3. 响应 ticket_id 即线索编号。再 POST 同一正文应返回同一 ticket_id 且 deduped=true。
 *   4. 登录后台后 GET /api/admin/inquiry?id=<ticket_id>
 *      POST /api/admin/inquiry {op:'assign', id, assignee_email}
 *      POST /api/admin/inquiry {op:'accept', id, note:'…跟进…'}
 *   5. 通知失败：不配发信时指派仍 200，assignee_notify_error=mail-not-configured，行还在。
 *   6. 未接单：GET /api/admin/inquiry?pending=1&test=1
 * 旁路密钥不要写进仓库。本测试不删除 RFQ_E2E_BYPASS_TOKEN 能力。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  INQUIRY_OK_MSG,
  RFQ_LOOP_SCENARIOS,
  absorbDuplicate,
  acceptInquiry,
  assignInquiry,
  insertInquiryRow,
  listPendingAccept,
  markCustomerNotifyFailed,
  planInquiryLoop,
  readInquiryLoop,
  shouldEnterValidCustomer,
  stampInquiryLoop,
} from '../apps/web/src/lib/rfq-loop.ts';

const SITE = 'biosphere-ai';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function fakeD1() {
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
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT,
      source_id INTEGER
    );
  `);
  raw.prepare(`INSERT INTO users (email, role, display_name) VALUES ('admin-rfq-e2e@biosphere-ai.com','admin','管理员')`).run();
  raw.prepare(`INSERT INTO users (email, role, display_name) VALUES ('sales-rfq-e2e@biosphere-ai.com','sales','业务负责人')`).run();
  raw.prepare(`INSERT INTO users (email, role, display_name) VALUES ('other-rfq-e2e@biosphere-ai.com','sales','其他业务')`).run();
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

async function count(db, sql, ...args) {
  const row = await db.prepare(sql).bind(...args).first();
  return Number(row.n);
}

/** 与 /api/inquiry 同一顺序：去重 → 插入旧列 → 盖测试标记与去重键。 */
async function receive(db, scenario) {
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
  if (dup) return { ticket_id: dup, deduped: true, plan, msg: INQUIRY_OK_MSG };
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
  assert.ok(ticket_id > 0, scenario.key);
  await stampInquiryLoop(db, ticket_id, plan);
  await db.prepare(`UPDATE inquiries SET notified_at=datetime('now'), notify_error=NULL WHERE id=?`).bind(ticket_id).run();
  return { ticket_id, deduped: false, plan, msg: INQUIRY_OK_MSG };
}

const wave = read('apps/web/src/lib/wave-products.ts');
const portfolio = read('apps/web/src/pages/[lang]/portfolio/index.astro');
const productPage = 'apps/web/src/pages/[lang]/product/[pslug].astro';
assert.equal(existsSync(new URL('../' + productPage, import.meta.url)), true);
assert.match(portfolio, /cat=oral|oral: '口腔护理'|oral: 'Oral care'/);

const db = fakeD1();
const sent = [];
const notifyOk = async (m) => {
  sent.push(m);
  assert.equal(/wa\.me/i.test(m.text + m.subject), false);
  assert.equal(/\$\s*\d/.test(m.text), false);
  return { ok: true };
};

const evidence = [];
const ids = [];

for (const scenario of RFQ_LOOP_SCENARIOS) {
  if (scenario.page === 'product') {
    assert.match(wave, new RegExp(`slug: '${scenario.product_slug}'`));
  } else {
    assert.match(portfolio, /oral: 'Oral care'/);
    assert.equal(scenario.source_path.includes('cat=oral'), true);
  }
  const opened = await receive(db, scenario);
  assert.equal(opened.deduped, false);
  assert.equal(opened.msg, INQUIRY_OK_MSG);
  ids.push(opened.ticket_id);

  const pendingBefore = await listPendingAccept(db, SITE, true);
  assert.ok(pendingBefore.some((r) => r.ticket_id === opened.ticket_id && r.accepted_at === null));

  const assigned = await assignInquiry(db, {
    id: opened.ticket_id,
    siteId: SITE,
    actorUid: 1,
    assigneeEmail: 'sales-rfq-e2e@biosphere-ai.com',
    notify: notifyOk,
  });
  assert.equal(assigned.ok, true, scenario.key);
  assert.equal(assigned.loop.stages.assigned, true);
  assert.equal(assigned.loop.stages.assignee_notified, true);
  assert.equal(assigned.loop.assignee_uid, 2);
  assert.equal(assigned.loop.is_test, true);
  assert.equal(assigned.loop.stages.accepted, false);

  const stillThere = await readInquiryLoop(db, opened.ticket_id, SITE);
  assert.equal(stillThere.ticket_id, opened.ticket_id);
  assert.equal(stillThere.stages.customer_notified, true);
  assert.equal(stillThere.source_path, scenario.source_path);

  const stranger = await acceptInquiry(db, {
    id: opened.ticket_id, siteId: SITE, actorUid: 3, actorRole: 'sales', note: scenario.followup,
  });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.status, 403);

  const accepted = await acceptInquiry(db, {
    id: opened.ticket_id, siteId: SITE, actorUid: 2, actorRole: 'sales', note: scenario.followup,
  });
  assert.equal(accepted.ok, true, scenario.key);
  assert.equal(accepted.loop.stages.accepted, true);
  assert.equal(accepted.loop.stages.followup, true);
  assert.equal(accepted.loop.status, 'following');
  assert.equal(accepted.loop.followup_text, scenario.followup);
  assert.equal(accepted.loop.accepted_by, 2);
  assert.ok(accepted.loop.notes.some((n) => n.kind === 'accept'));
  assert.ok(accepted.loop.notes.some((n) => n.kind === 'note' && n.text === scenario.followup));

  const again = await receive(db, scenario);
  assert.equal(again.deduped, true);
  assert.equal(again.ticket_id, opened.ticket_id);
  assert.equal(await count(db, `SELECT COUNT(*) n FROM inquiries WHERE email=?`, scenario.email), 1);

  const after = await readInquiryLoop(db, opened.ticket_id, SITE);
  assert.ok(after.dedupe_hits >= 1);
  assert.equal(after.stages.saved, true);
  assert.equal(after.stages.product_path, true);
  assert.equal(after.stages.deduped_receive, true);
  evidence.push({
    scenario: scenario.key,
    title: scenario.title,
    source_path: scenario.source_path,
    ticket_id: after.ticket_id,
    is_test: after.is_test,
    stages: after.stages,
    assignee_email: after.assignee_email,
    followup_text: after.followup_text,
    dedupe_hits: after.dedupe_hits,
  });
}

assert.equal(new Set(ids).size, 3);
for (const id of ids) {
  const row = await db.prepare(`SELECT is_test FROM inquiries WHERE id=?`).bind(id).first();
  assert.equal(shouldEnterValidCustomer(Number(row.is_test) === 1, 'A'), false);
}
assert.equal(await count(db, `SELECT COUNT(*) n FROM companies`), 0);

const pendingAfter = await listPendingAccept(db, SITE, true);
for (const id of ids) assert.equal(pendingAfter.some((r) => r.ticket_id === id), false);

/* 通知失败不丢线索 */
const lost = RFQ_LOOP_SCENARIOS[0];
const notifyFailLead = await insertInquiryRow(db, {
  site: SITE,
  lang: 'en',
  name: 'RFQ-E2E-TEST notify fail',
  company: 'RFQ-E2E-TEST NotifyFail',
  email: 'rfq-e2e-notify-fail@example.com',
  country: 'US',
  message: 'RFQ-E2E-TEST notify failure must keep the lead',
  spam: 0,
  sourcePath: lost.source_path,
  referrer: null,
  category: 'skincare',
  volume: 'sample',
  whatsapp: null,
});
const failPlan = planInquiryLoop({
  site: SITE,
  email: 'rfq-e2e-notify-fail@example.com',
  name: 'RFQ-E2E-TEST notify fail',
  company: 'RFQ-E2E-TEST NotifyFail',
  message: 'RFQ-E2E-TEST notify failure must keep the lead',
  category: 'skincare',
  market: 'US',
  productId: 'peptide-barrier-serum-eu',
});
await stampInquiryLoop(db, notifyFailLead, failPlan);
await markCustomerNotifyFailed(db, notifyFailLead);
const thrown = await assignInquiry(db, {
  id: notifyFailLead,
  siteId: SITE,
  actorUid: 1,
  assigneeUid: 2,
  notify: async () => { throw new Error('smtp down'); },
});
assert.equal(thrown.ok, true);
assert.equal(thrown.loop.assignee_uid, 2);
assert.equal(thrown.loop.assignee_notified_at, null);
assert.match(thrown.loop.assignee_notify_error, /smtp down/);
assert.equal(thrown.loop.stages.saved, true);
assert.equal(thrown.loop.notify_error, 'customer-notify-failed');
const still = await readInquiryLoop(db, notifyFailLead, SITE);
assert.equal(still.ticket_id, notifyFailLead);
assert.equal(still.notified_at, null);

/* 未接单仍可查 */
const openList = await listPendingAccept(db, SITE, true);
const open = openList.find((r) => r.ticket_id === notifyFailLead);
assert.ok(open);
assert.equal(open.accepted_at, null);
assert.equal(open.is_test, true);
const unread = await acceptInquiry(db, { id: notifyFailLead, siteId: SITE, actorUid: 2, actorRole: 'sales', note: '' });
assert.equal(unread.ok, false);

/* 非测试 A 级才允许进有效客户；测试行始终不进 */
assert.equal(shouldEnterValidCustomer(false, 'A'), true);
assert.equal(shouldEnterValidCustomer(false, 'C'), false);
assert.equal(shouldEnterValidCustomer(true, 'A'), false);

/* 接线：公开回执文案不变；旁路还在；入库字段名是 sourcePath；CACHE_V 为 v150 */
const inquiry = read('apps/web/src/pages/api/inquiry.ts');
const ai = read('apps/web/src/lib/inquiry-ai.ts');
const admin = read('apps/web/src/pages/api/admin/inquiry.ts');
const crm = read('apps/web/src/pages/api/admin/crm.ts');
const human = read('apps/web/src/lib/human.ts');
const middleware = read('apps/web/src/middleware.ts');
assert.match(inquiry, /absorbDuplicate\(db, site, plan\.dedupeKey\)/);
assert.match(inquiry, /stampInquiryLoop\(db, newId, plan\)/);
assert.match(inquiry, /insertInquiryRow\(db,/);
assert.match(inquiry, /sourcePath:\s*srcPath/);
assert.match(inquiry, /ticket_id: newId/);
assert.match(inquiry, /humanGateUnlessE2e\(env,/);
assert.match(inquiry, /isTest: plan\?\.isTest === true/);
assert.match(ai, /shouldEnterValidCustomer\(isTest, grade\)/);
assert.match(ai, /markCustomerNotifyFailed\(db, id\)/);
assert.match(admin, /op === 'assign'/);
assert.match(admin, /pending/);
assert.match(crm, /测试线索不入有效客户/);
assert.match(human, /RFQ_E2E_BYPASS_TOKEN/);
assert.match(middleware, /const CACHE_V = 'v150'/);
assert.equal(/wa\.me/.test(read('apps/web/src/lib/rfq-loop.ts')), false);
assert.equal(INQUIRY_OK_MSG.includes('不自动报价'), true);

/* 迁移脚本本身能在空表上加上指派/接单列 */
{
  const mig = new DatabaseSync(':memory:');
  mig.exec(`CREATE TABLE inquiries (
    id INTEGER PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  mig.exec(read('db/migrations/0130_rfq_loop.sql'));
  const cols = new Set(mig.prepare(`PRAGMA table_info(inquiries)`).all().map((c) => c.name));
  for (const name of ['dedupe_key', 'is_test', 'assignee_uid', 'assigned_at', 'assignee_notified_at', 'assignee_notify_error', 'accepted_at', 'accepted_by', 'followup_text', 'followup_at', 'notify_error']) {
    assert.equal(cols.has(name), true, name);
  }
  assert.equal(mig.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inquiry_notes'`).get()?.name, 'inquiry_notes');
}

console.log(JSON.stringify({ cache_v: 'v150', scenarios: evidence, notify_fail_kept: notifyFailLead }, null, 2));
console.log('rfq-loop.test.mjs: 三场景与失败路径通过');
