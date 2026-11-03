import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { uploadJSON, mkdir, listDir } from '../../../lib/pan123-client';

export const prerender = false;

/**
 * D1 数据每日备份到 123 云盘。
 *
 * 导出核心表为 JSON 上传到 123 云盘 cosmetic-data/backup/ 目录。
 * 即使 Cloudflare 封号，数据不丢——从 123 云盘恢复。
 *
 * cron: 0 2 * * *（每日 02:00 UTC = 北京 10:00，在 prospect-mine 之前跑）
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function guard(request: Request): Response | null {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  return null;
}

const TABLES = [
  'prospects', 'prospect_contacts', 'prospect_seeds',
  'trends', 'ecom_trends', 'trend_reports',
  'outreach_log', 'outreach_suppress', 'outreach_outbox',
  'jobs',
];

export const GET: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

  // 123 云盘目录
  let panDirID = 0;
  if ((env as any).PAN123_CLIENT_ID) {
    try {
      const root = await listDir(env, 0);
      panDirID = root.find((f: any) => f.filename === 'cosmetic-data')?.fileID ?? (await mkdir(env, 'cosmetic-data', 0));
    } catch { return json({ ok: false, msg: 'pan123 不可用' }, 500); }
  } else {
    return json({ ok: false, msg: 'no pan123 credentials' }, 500);
  }

  const backup: Record<string, any> = { _backup_date: today, _tables: TABLES };
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 5000`).all<any>();
      backup[table] = results || [];
      totalRows += (results?.length || 0);
    } catch {
      backup[table] = { _error: 'table not found or query failed' };
    }
  }

  // 上传完整备份到 123 云盘
  const fileName = `backup-d1-${today}.json`;
  const fullData = JSON.stringify(backup);
  let fileSize = fullData.length;

  try {
    await uploadJSON(env, panDirID, fileName, fullData);
  } catch (e: any) {
    return json({ ok: false, msg: `上传失败: ${e.message}`, tables: TABLES.length, rows: totalRows }, 500);
  }

  // 心跳
  await db.prepare(
    `INSERT INTO jobs (name, note, status, heartbeat_at, started_at) VALUES ('d1-backup', ?, 'ok', datetime('now'), datetime('now'))`,
  ).bind(`backup=${today} tables=${TABLES.length} rows=${totalRows} size=${(fileSize/1024).toFixed(0)}KB`).run().catch(() => {});

  return json({ ok: true, date: today, tables: TABLES.length, rows: totalRows, size_kb: Math.round(fileSize / 1024) });
};
