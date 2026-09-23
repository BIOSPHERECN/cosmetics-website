/**
 * 后台上传各国原料目录 —— 创始人 2026-09-11:「还是要预留很多端口,他们可以在后台上传」。
 * 贴一段 CSV(表头:no,name,inci,cas,note;分隔符逗号或制表符),给目录 id / 地区 / 名称,写进 inci_catalog + inci_registry。
 * 同一 id 重复上传 = 覆盖该目录。管理员与编辑可用(apiGuard 按路径给能力)。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  let b: any; try { b = await request.json(); } catch { return json({ ok: false, msg: '请求格式不对' }, 400); }
  const id = String(b.id ?? '').trim().toLowerCase();
  if (!/^[a-z]{2,3}-[a-z0-9-]{2,20}$/.test(id)) return json({ ok: false, msg: '目录 id 形如 id-bpom / vn-moh(国家码-机构)' }, 400);
  const region = String(b.region ?? '').trim().slice(0, 30); const nameZh = String(b.name_zh ?? '').trim().slice(0, 120); const nameEn = String(b.name_en ?? '').trim().slice(0, 160);
  const src = String(b.source ?? '').trim().slice(0, 300) || nameZh;
  if (!region || !nameZh) return json({ ok: false, msg: '地区与中文名必填' }, 400);
  const lines = String(b.csv ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return json({ ok: false, msg: 'CSV 至少要有表头和一行' }, 400);
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const col = (k: string) => head.indexOf(k);
  if (col('no') < 0 || col('name') < 0) return json({ ok: false, msg: '表头至少要有 no 和 name' }, 400);
  const rows = lines.slice(1).map((l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))).filter((cs) => cs[col('no')] && cs[col('name')]);
  if (!rows.length) return json({ ok: false, msg: '没有有效行' }, 400);
  const pre = id.split('-')[0].toUpperCase() + '-';
  const g = (cs: string[], k: string) => (col(k) >= 0 ? cs[col(k)] ?? '' : '');
  const stmts = [c.db.prepare('DELETE FROM inci_catalog WHERE registry = ?').bind(id)];
  for (const cs of rows.slice(0, 5000)) {
    const name = g(cs, 'name').slice(0, 300); const inci = (g(cs, 'inci') || name).slice(0, 300);
    stmts.push(c.db.prepare('INSERT OR REPLACE INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES (?,?,?,NULL,NULL,NULL,?,?,?,?,NULL,?)')
      .bind(pre + g(cs, 'no').slice(0, 60), name, inci, g(cs, 'note').slice(0, 600) || null, src, inci.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().slice(0, 300), g(cs, 'cas').slice(0, 120) || null, id));
  }
  stmts.push(c.db.prepare(`INSERT INTO inci_registry (id, region, name_zh, name_en, issuer_zh, issuer_en, official_url, note_zh, note_en, sort_order, status) VALUES (?,?,?,?,?,?,?,?,?,99,'live')
    ON CONFLICT(id) DO UPDATE SET region=excluded.region, name_zh=excluded.name_zh, name_en=excluded.name_en, official_url=excluded.official_url, status='live'`)
    .bind(id, region, nameZh, nameEn || nameZh, String(b.issuer ?? '').slice(0, 120) || null, null, String(b.url ?? '').slice(0, 300) || null, '后台上传', 'Uploaded via admin'));
  for (let i = 0; i < stmts.length; i += 100) await c.db.batch(stmts.slice(i, i + 100));
  return json({ ok: true, rows: rows.length, id });
};
