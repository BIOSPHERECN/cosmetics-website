/**
 * 一码一物验真（仓内，不打生产）。
 *
 *   node tools/verify-code.test.mjs
 *
 * 三条路径：未知码不是正品；测试码首查 genuine + firstScan；再查 scanCount ≥ 2。
 * 另外钉住：作废码不是正品、查询记录不存原始 IP、带 code 的验真页不进边缘缓存、CACHE_V 为 v155。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { hashesFromRequest, verifyProductCode } from '../apps/web/src/lib/verify-code.ts';
import { TEST_CODES, seedSql } from './seed-product-codes.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function fakeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(read('db/migrations/0132_product_codes.sql'));
  raw.exec(seedSql());
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
            async run() {
              const info = raw.prepare(sql).run(...args);
              return { meta: { changes: Number(info.changes || 0) } };
            },
          };
        },
      };
    },
  };
}

assert.ok(TEST_CODES.length >= 3, '种子至少 3 个测试码');

const db = fakeD1();
const seeded = db.raw.prepare(`SELECT COUNT(*) AS n FROM product_codes`).get();
assert.ok(Number(seeded.n) >= 3);

const ip = '203.0.113.8';
const ua = 'TestBrowser/1';
const hashes = await hashesFromRequest(new Request('https://biosphere-ai.com/api/verify', {
  headers: { 'cf-connecting-ip': ip, 'user-agent': ua },
}));
assert.match(hashes.ipHash, /^[0-9a-f]{64}$/);
assert.equal(hashes.ipHash.includes(ip), false);
assert.equal(hashes.uaHash.includes('TestBrowser'), false);

const unknown = await verifyProductCode(db, { code: 'NO-SUCH-CODE', lang: 'zh-cn', ...hashes });
assert.equal(unknown.status, 200);
assert.equal(unknown.body.genuine, false);
assert.equal(unknown.body.firstScan, false);
assert.equal(unknown.body.scanCount, 0);
assert.equal(unknown.body.message, '查无此码，不是正品');
assert.equal('sku' in unknown.body, false);
assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM code_scans`).get().n, 0);

const first = await verifyProductCode(db, { code: 'bh-test-001', lang: 'zh-cn', ...hashes });
assert.equal(first.status, 200);
assert.equal(first.body.genuine, true);
assert.equal(first.body.firstScan, true);
assert.equal(first.body.scanCount, 1);
assert.equal(first.body.sku, 'SERUM-A');
assert.equal(first.body.batch, '2026-A');
assert.equal(first.body.message, '正品·首次查询');
const activated = db.raw.prepare(`SELECT status, activated_at FROM product_codes WHERE code = 'BH-TEST-001'`).get();
assert.equal(activated.status, 'activated');
assert.ok(activated.activated_at);

const again = await verifyProductCode(db, { code: 'BH-TEST-001', lang: 'zh', ...hashes });
assert.equal(again.body.genuine, true);
assert.equal(again.body.firstScan, false);
assert.ok(again.body.scanCount >= 2);
assert.equal(again.body.scanCount, 2);
assert.equal(again.body.message, '已被查询 2 次');

const en = await verifyProductCode(db, { code: 'BH-TEST-002', lang: 'en', ...hashes });
assert.equal(en.body.genuine, true);
assert.equal(en.body.firstScan, true);
assert.equal(en.body.message, 'Genuine · first check');
const enAgain = await verifyProductCode(db, { code: 'BH-TEST-002', lang: 'en', ...hashes });
assert.equal(enAgain.body.firstScan, false);
assert.ok(enAgain.body.scanCount >= 2);
assert.equal(enAgain.body.message, 'Checked 2 times');

const still = db.raw.prepare(`SELECT status FROM product_codes WHERE code = 'BH-TEST-003'`).get();
assert.equal(still.status, 'unused');

db.raw.prepare(`INSERT INTO product_codes (code, sku, batch, status) VALUES ('BH-VOID-001', 'HIDDEN', 'HIDDEN', 'void')`).run();
const voided = await verifyProductCode(db, { code: 'BH-VOID-001', lang: 'zh-cn', ...hashes });
assert.equal(voided.body.genuine, false);
assert.equal(voided.body.firstScan, false);
assert.equal('sku' in voided.body, false);
assert.equal(db.raw.prepare(`SELECT status FROM product_codes WHERE code = 'BH-VOID-001'`).get().status, 'void');

const scans = db.raw.prepare(`SELECT ip_hash, ua_hash FROM code_scans WHERE code = 'BH-TEST-001' ORDER BY id`).all();
assert.equal(scans.length, 2);
assert.equal(scans[0].ip_hash, hashes.ipHash);
assert.equal(scans[0].ip_hash.includes(ip), false);
assert.equal(scans[0].ua_hash.includes(ua), false);

assert.throws(() => db.raw.prepare(`INSERT INTO product_codes (code, status) VALUES ('BAD', 'nope')`).run());

const empty = await verifyProductCode(db, { code: '???', lang: 'en' });
assert.equal(empty.status, 400);
assert.equal(empty.body.genuine, false);

const sql = read('db/migrations/0132_product_codes.sql');
assert.match(sql, /CREATE TABLE IF NOT EXISTS product_codes/);
assert.match(sql, /code\s+TEXT NOT NULL UNIQUE/);
assert.match(sql, /sku/);
assert.match(sql, /batch/);
assert.match(sql, /status\s+TEXT NOT NULL DEFAULT 'unused' CHECK \(status IN \('unused', 'activated', 'void'\)\)/);
assert.match(sql, /activated_at/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS code_scans/);
assert.match(sql, /scanned_at/);
assert.match(sql, /ip_hash/);
assert.match(sql, /ua_hash/);
assert.doesNotMatch(sql, /ALTER TABLE|inquiry_events/);

const lib = read('apps/web/src/lib/verify-code.ts');
assert.match(lib, /INSERT INTO code_scans \(code, scanned_at, ip_hash, ua_hash\)/);
assert.match(lib, /正品·首次查询/);
assert.match(lib, /已被查询 \$\{scanCount\} 次/);
assert.doesNotMatch(lib, /wa\.me/);

const page = read('apps/web/src/pages/[lang]/verify/index.astro');
assert.match(page, /method="get"/);
assert.match(page, /name="code"/);
assert.match(page, /type="submit"/);
assert.match(page, /verifyProductCode/);
assert.match(page, /result\.message/);
assert.match(page, /产品真伪验证/);
assert.match(page, /Product authenticity check/);
assert.match(page, /private, no-store/);
assert.doesNotMatch(page, /wa\.me/);

const api = read('apps/web/src/pages/api/verify.ts');
assert.match(api, /export const GET/);
assert.match(api, /export const POST/);
assert.match(api, /searchParams\.get\('code'\)/);
assert.match(api, /verifyProductCode/);
assert.match(api, /hashesFromRequest/);
assert.match(api, /no-store/);
assert.doesNotMatch(api, /wa\.me/);

const canon = await import('../apps/web/src/lib/canon.ts');
const url = new URL('https://biosphere-ai.com/en/verify/?code=BH-TEST-001');
assert.equal(canon.uncacheable(url.pathname, url.searchParams), true);
assert.deepEqual(canon.keyParams(url.pathname, url.searchParams), []);
assert.equal(canon.canonical('/en/verify', '?code=BH-TEST-001'), '/en/verify/?code=BH-TEST-001');
assert.equal(canon.canonical('/zh-cn/verify/', '?code=BH-TEST-001'), null);
const about = new URL('https://biosphere-ai.com/zh-cn/about/?code=abc');
assert.equal(canon.uncacheable(about.pathname, about.searchParams), false);

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v155'/);

console.log(JSON.stringify({
  cache_v: 'v155',
  unknown: unknown.body,
  first: first.body,
  again: again.body,
}, null, 2));
