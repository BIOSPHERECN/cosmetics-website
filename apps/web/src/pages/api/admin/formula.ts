import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

const FIELDS = ['code', 'category', 'format', 'benefits', 'actives_json', 'texture',
  'moq', 'cost_band', 'lead_days', 'markets', 'cert_notes', 'status'] as const;

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!id) return json({ ok: false, msg: '缺少 id' }, 400);

    // 活性物是结构化字段,存进去之前必须能解析 —— 存了坏 JSON,前台和 AI 都会崩
    if (body.actives_json) {
      try { JSON.parse(String(body.actives_json)); }
      catch { return json({ ok: false, msg: '活性物 JSON 格式不对,应形如 [{"name":"烟酰胺","pct":"2-5%"}]' }, 400); }
    }

    const sets: string[] = [], bind: unknown[] = [];
    for (const f of FIELDS) {
      if (body[f] === undefined) continue;
      sets.push(`${f}=?`);
      bind.push(f === 'moq' || f === 'lead_days' ? (Number(body[f]) || null) : (body[f] === '' ? null : body[f]));
    }
    if (!sets.length) return json({ ok: false, msg: '没有要改的字段' }, 400);

    const before = await c.db.prepare(`SELECT * FROM formulas WHERE id=?`).bind(id).first();
    await c.db.prepare(`UPDATE formulas SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=?`)
      .bind(...bind, id).run();
    await logRevision(c.db, 'formulas', id, null, before, body, c.sess.uid);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, msg: `保存失败:${e instanceof Error ? e.message.slice(0, 160) : String(e)}` }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.code) return json({ ok: false, msg: '配方号必填' }, 400);
  const r = await c.db.prepare(
    `INSERT INTO formulas (code, category, format, benefits, actives_json, texture, moq, cost_band, lead_days, markets, cert_notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
  ).bind(b.code, b.category ?? 'skincare', b.format ?? 'serum', b.benefits ?? '', b.actives_json ?? '[]',
    b.texture ?? null, Number(b.moq) || null, b.cost_band ?? null, Number(b.lead_days) || null,
    b.markets ?? '', b.cert_notes ?? null).first<{ id: number }>().catch(() => null);
  if (!r) return json({ ok: false, msg: '配方号可能重复' }, 400);
  await logRevision(c.db, 'formulas', r.id, null, null, b, c.sess.uid);
  return json({ ok: true, id: r.id });
};
