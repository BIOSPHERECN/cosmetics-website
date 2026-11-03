import assert from 'node:assert/strict';
import { snap } from '../../apps/web/src/lib/snap.ts';

class FakeDb {
  constructor({ row = null, readError = null } = {}) {
    this.row = row;
    this.readError = readError;
    this.readKeys = [];
    this.writes = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async first() {
            db.readKeys.push(args[0]);
            if (db.readError) throw db.readError;
            return db.row;
          },
          async run() {
            db.writes.push({ sql, args });
            return { success: true };
          },
        };
      },
    };
  }
}

const sqliteTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

{
  const db = new FakeDb({ row: { json: JSON.stringify({ source: 'snapshot' }), updated_at: sqliteTime(new Date()) } });
  let calls = 0;
  const value = await snap(db, 'test-hit', 3600, async () => { calls++; return { source: 'fn' }; });
  assert.deepEqual(value, { source: 'snapshot' });
  assert.equal(calls, 0);
  console.log('ok - snapshot hit skips fn');
}

{
  const db = new FakeDb({ row: { json: JSON.stringify({ stale: true }), updated_at: '2000-01-01 00:00:00' } });
  let calls = 0;
  const value = await snap(db, 'test-expired', 3600, async () => { calls++; return { fresh: true }; });
  assert.deepEqual(value, { fresh: true });
  assert.equal(calls, 1);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].args[0], 'snap:test-expired');
  assert.equal(db.writes[0].args[1], JSON.stringify({ fresh: true }));
  console.log('ok - expired snapshot calls fn and writes back');
}

{
  const db = new FakeDb({ readError: new Error('D1 unavailable') });
  let calls = 0;
  const value = await snap(db, 'test-d1-error', 3600, async () => { calls++; return 'fallback'; });
  assert.equal(value, 'fallback');
  assert.equal(calls, 1);
  assert.equal(db.writes.length, 0);
  console.log('ok - D1 error falls back to fn');
}

{
  const db = new FakeDb();
  await snap(db, 'test-prefix', 3600, async () => 'value');
  assert.equal(db.readKeys[0], 'snap:test-prefix');
  assert.equal(db.writes[0].args[0], 'snap:test-prefix');
  console.log('ok - pulse keys use snap: prefix');
}

{
  const db = new FakeDb();
  const value = await snap(db, 'test-empty', 3600, async () => []);
  assert.deepEqual(value, []);
  assert.equal(db.writes.length, 0);
  console.log('ok - empty list is not persisted');
}
