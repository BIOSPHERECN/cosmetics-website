// 自检:node --experimental-strip-types apps/web/src/lib/fuse.test.ts
// 覆盖:fired 之后不再 renders+1;廉价静态与探针/会员/后台不进熔断。
import assert from 'node:assert/strict';
import test from 'node:test';
import { FUSE_DEFAULT_CAP, fuseApplies, fuseCheck, isCheapStatic } from './fuse.ts';

type Row = { renders: number; fired: number };

function createDb(seed?: Record<string, Row>) {
  const rows = new Map<string, Row>();
  for (const [day, row] of Object.entries(seed ?? {})) rows.set(day, { ...row });
  const sqls: string[] = [];
  function exec(sql: string, args: unknown[]) {
    sqls.push(sql);
    const day = String(args[0] ?? '');
    if (/^INSERT INTO fuse_daily/i.test(sql.trim())) {
      const guarded = /WHERE\s+fuse_daily\.fired\s*=\s*0/i.test(sql);
      const row = rows.get(day);
      if (!row) rows.set(day, { renders: 1, fired: 0 });
      else if (!guarded || row.fired === 0) row.renders += 1;
      return { results: [] as Row[] };
    }
    if (/^SELECT renders, fired/i.test(sql.trim())) {
      const row = rows.get(day);
      return { results: row ? [{ ...row }] : [] };
    }
    if (/^UPDATE fuse_daily SET fired = 1/i.test(sql.trim())) {
      const row = rows.get(day);
      if (row) row.fired = 1;
      return { results: [] as Row[] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  }
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            sql,
            args,
            run: async () => exec(sql, args),
            first: async () => exec(sql, args).results[0] ?? null,
          };
        },
      };
    },
    async batch(stmts: Array<{ sql: string; args: unknown[] }>) {
      return stmts.map((s) => exec(s.sql, s.args));
    },
  };
  return { db, rows, sqls };
}

test('未触顶时每次 miss +1,触顶后停计但仍返回 fired', async () => {
  const { db, rows, sqls } = createDb();
  const a = await fuseCheck({ db: db as never, cap: 2 });
  const b = await fuseCheck({ db: db as never, cap: 2 });
  const c = await fuseCheck({ db: db as never, cap: 2 });
  assert.deepEqual({ fired: a.fired, renders: a.renders }, { fired: false, renders: 1 });
  assert.deepEqual({ fired: b.fired, renders: b.renders }, { fired: false, renders: 2 });
  assert.equal(c.fired, true);
  assert.equal(c.renders, 3);
  const d = await fuseCheck({ db: db as never, cap: 2 });
  const e = await fuseCheck({ db: db as never, cap: 2 });
  assert.equal(d.fired, true);
  assert.equal(e.fired, true);
  assert.equal(d.renders, 3);
  assert.equal(e.renders, 3);
  assert.equal([...rows.values()][0].renders, 3);
  assert.equal([...rows.values()][0].fired, 1);
  const after = sqls.length;
  await fuseCheck({ db: db as never, cap: 2 });
  const tail = sqls.slice(after);
  assert.equal(tail.some((s) => /^INSERT/i.test(s.trim())), false);
  assert.equal([...rows.values()][0].renders, 3);
});

test('库里已经 fired 的行,后续 miss 停在原计数', async () => {
  const { db, rows, sqls } = createDb();
  const opened = await fuseCheck({ db: db as never, cap: 10 });
  assert.equal(opened.renders, 1);
  const day = [...rows.keys()][0];
  rows.set(day, { renders: 500_000, fired: 1 });
  const before = sqls.length;
  const hit = await fuseCheck({ db: db as never, cap: 500_000 });
  const hit2 = await fuseCheck({ db: db as never, cap: 500_000 });
  assert.equal(hit.fired, true);
  assert.equal(hit.renders, 500_000);
  assert.equal(hit2.renders, 500_000);
  assert.equal(hit.cap, 500_000);
  const tail = sqls.slice(before);
  assert.ok(tail.length > 0);
  assert.equal(tail.some((s) => /^INSERT|^UPDATE/i.test(s.trim())), false);
});

test('没有 D1 或计数抛错时放行,不把站锁死', async () => {
  const open = await fuseCheck({ db: undefined, cap: 10 });
  assert.deepEqual(open, { fired: false, renders: 0, cap: 10 });
  const unset = await fuseCheck({ db: undefined });
  assert.equal(unset.cap, FUSE_DEFAULT_CAP);
  const bad = {
    prepare() { throw new Error('d1 down'); },
    async batch() { throw new Error('d1 down'); },
  };
  const err = console.error;
  console.error = () => {};
  try {
    const failed = await fuseCheck({ db: bad as never, cap: 10 });
    assert.equal(failed.fired, false);
    assert.equal(failed.renders, 0);
  } finally {
    console.error = err;
  }
});

test('廉价静态、探针、会员、后台不进熔断;普通 HTML miss 要进', () => {
  const base = { cacheable: true, staff: false, member: false, probe: false };
  assert.equal(fuseApplies({ ...base, pathname: '/en/' }), true);
  assert.equal(fuseApplies({ ...base, pathname: '/zh-cn/portfolio/' }), true);
  assert.equal(fuseApplies({ ...base, pathname: '/media/12' }), true);
  assert.equal(fuseApplies({ ...base, pathname: '/pack/FLD-P042' }), true);
  assert.equal(fuseApplies({ ...base, cacheable: false, pathname: '/en/' }), false);
  assert.equal(fuseApplies({ ...base, staff: true, pathname: '/en/' }), false);
  assert.equal(fuseApplies({ ...base, member: true, pathname: '/en/' }), false);
  assert.equal(fuseApplies({ ...base, probe: true, pathname: '/en/' }), false);

  for (const p of [
    '/robots.txt',
    '/llms.txt',
    '/llms-full.txt',
    '/favicon.ico',
    '/zh-cn/llms.txt',
    '/zh-tw/robots.txt',
    '/sitemap.xml',
    '/sitemap-news.xml',
    '/en/sitemap.xml',
    '/_astro/app.abc123.js',
    '/fonts/a.woff2',
    '/media/shots/hero-01.webp',
    '/asset/design/ST-A1044-4-light.png',
    '/logo.png',
    '/BingSiteAuth.xml',
  ]) {
    assert.equal(isCheapStatic(p), true, p);
    assert.equal(fuseApplies({ ...base, pathname: p }), false, p);
  }

  for (const p of ['/en/', '/api/inquiry', '/bohui/', '/media/12', '/en/foo.png', '/pack/ST-A1.webp']) {
    assert.equal(isCheapStatic(p), false, p);
  }
});
