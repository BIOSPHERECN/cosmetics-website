import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/**
 * 设计模型配置管理（2026-10-30）。
 * design_providers 表的增删改：管理员在后台填 key 即接入新模型，不改代码。
 */
const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  try {
    const { results } = await c.db.prepare(
      `SELECT id,label,tasks,kind,base_url,model,
              CASE WHEN api_key='' OR api_key IS NULL THEN 0 ELSE 1 END AS has_key,
              substr(coalesce(api_key,''),1,6) AS key_prefix,
              extra_json,enabled,note,updated_at
         FROM design_providers ORDER BY enabled DESC, rowid`,
    ).all();
    return J({ ok: true, rows: results ?? [] });
  } catch { return J({ ok: true, rows: [] }); }
};

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const requireAdmin = (await import('../../../lib/guard')).requireAdmin;
  const denied = requireAdmin(c as any);
  if (denied) return denied;

  const b = await request.json().catch(() => ({})) as {
    id?: string; label?: string; tasks?: string; kind?: string;
    base_url?: string; model?: string; api_key?: string;
    extra_json?: string; enabled?: number; note?: string;
  };
  const id = String(b.id || '').trim().slice(0, 40);
  const label = String(b.label || '').trim().slice(0, 80);
  if (!id || !label) return J({ ok: false, msg: 'id 和 label 不能为空' }, 400);
  const tasks = String(b.tasks || 't2i').slice(0, 60);
  const kind = String(b.kind || 'openai-images').slice(0, 30);
  const base = String(b.base_url || '').trim().slice(0, 200);
  const model = String(b.model || '').trim().slice(0, 100);
  const keys = String(b.api_key || '').trim().slice(0, 500);
  const extra = String(b.extra_json || '').slice(0, 2000);
  const enabled = b.enabled ?? 1;
  const note = String(b.note || '').slice(0, 200);

  try {
    await c.db.prepare(
      `INSERT INTO design_providers (id,label,tasks,kind,base_url,model,api_key,extra_json,enabled,note,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, tasks=excluded.tasks, kind=excluded.kind,
         base_url=excluded.base_url, model=excluded.model,
         api_key=CASE WHEN excluded.api_key='' THEN design_providers.api_key ELSE excluded.api_key END,
         extra_json=excluded.extra_json, enabled=excluded.enabled, note=excluded.note,
         updated_at=datetime('now')`,
    ).bind(id, label, tasks, kind, base, model, keys, extra, enabled, note).run();
    return J({ ok: true, id });
  } catch (e: any) {
    return J({ ok: false, msg: String(e?.message ?? e).slice(0, 200) }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const requireAdmin = (await import('../../../lib/guard')).requireAdmin;
  const denied = requireAdmin(c as any);
  if (denied) return denied;
  const id = url.searchParams.get('id') || '';
  if (!id) return J({ ok: false, msg: '缺少 id' }, 400);
  try {
    await c.db.prepare(`DELETE FROM design_providers WHERE id=?`).bind(id).run();
    return J({ ok: true, id });
  } catch (e: any) {
    return J({ ok: false, msg: String(e?.message ?? e).slice(0, 200) }, 500);
  }
};
