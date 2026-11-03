import { memo } from './memo.ts';

type PulseRow = { json: string; updated_at: string };

const pulseKey = (key: string) => key.startsWith('snap:') ? key : `snap:${key}`;

const utcMillis = (value: string) => {
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
};

export async function snap<T>(
  db: D1Database,
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  return memo(key, Math.min(ttlSec, 600), async () => {
    const k = pulseKey(key);
    let row: PulseRow | null;
    try {
      row = await db.prepare(`SELECT json, updated_at FROM pulse WHERE k = ?`).bind(k).first<PulseRow>();
    } catch {
      return fn();
    }

    if (row && Date.now() - utcMillis(row.updated_at) < ttlSec * 1000) {
      try { return JSON.parse(row.json) as T; } catch { /* Replace an invalid snapshot below. */ }
    }

    const value = await fn();
    // Never persist an empty list: a statement-level failure upstream would otherwise blank the page globally for the whole TTL.
    if (Array.isArray(value) && value.length === 0) return value;
    try {
      const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare(
        `INSERT INTO pulse(k, json, updated_at) VALUES(?,?,?)
         ON CONFLICT(k) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at`,
      ).bind(k, JSON.stringify(value), updatedAt).run();
    } catch { /* Snapshot writes must not break page rendering. */ }
    return value;
  });
}

export async function invalidateNavSnap(db: D1Database, siteId: string): Promise<void> {
  const start = `snap:nav:${siteId}:`;
  // Navigation snapshots must be removed after CMS changes so published menus update immediately.
  try { await db.prepare(`DELETE FROM pulse WHERE k >= ? AND k < ?`).bind(start, `${start}\uffff`).run(); } catch { /* Cache invalidation is best effort. */ }
}
