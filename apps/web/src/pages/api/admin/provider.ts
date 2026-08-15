import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE } from '../../../lib/auth';

export const prerender = false;

/**
 * 供应商增删改 —— 后台自行配置模型的落点。
 *
 * 两条自律:
 *  · **key 只写不读**:列表接口永不回显 api_keys,只回"配了几个"。
 *    后台想改 key 就重填一次,不提供"看一眼原值"的路径 —— 那条路径一旦存在,
 *    任何一次越权都等于泄露全部凭据。
 *  · **改动记修订**:换档位、停用、换 base 都进 revisions,出问题能回溯是谁改的。
 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(request.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess) return json({ ok: false, msg: '未登录' }, 401);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,24}$/.test(id)) return json({ ok: false, msg: 'id 只能是小写字母数字与连字符' }, 400);

  const action = String(b.action ?? 'save');

  if (action === 'delete') {
    await db.prepare(`DELETE FROM providers WHERE id = ?`).bind(id).run();
    await note(db, sess.uid, id, { deleted: true });
    return json({ ok: true });
  }

  if (action === 'toggle') {
    await db.prepare(`UPDATE providers SET enabled = 1 - enabled, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
    const row = await db.prepare(`SELECT enabled FROM providers WHERE id = ?`).bind(id).first<{ enabled: number }>();
    await note(db, sess.uid, id, { enabled: row?.enabled });
    return json({ ok: true, enabled: row?.enabled });
  }

  // 保存:key 为空字符串表示"不改",避免编辑其它字段时把 key 清掉
  const keys = typeof b.api_keys === 'string' ? b.api_keys.trim() : '';
  const base = String(b.base_url ?? '').trim().replace(/\/+$/, '');
  if (!base.startsWith('http')) return json({ ok: false, msg: 'base_url 必须是完整地址' }, 400);

  await db
    .prepare(
      `INSERT INTO providers (id,label,base_url,model,api_keys,tier,can_image,can_video,is_free,enabled,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, base_url=excluded.base_url, model=excluded.model,
         tier=excluded.tier, can_image=excluded.can_image, can_video=excluded.can_video,
         is_free=excluded.is_free, updated_at=datetime('now'),
         api_keys=CASE WHEN excluded.api_keys='' THEN providers.api_keys ELSE excluded.api_keys END`,
    )
    .bind(
      id, String(b.label ?? id), base, String(b.model ?? ''), keys,
      Number(b.tier ?? 10), b.can_image ? 1 : 0, b.can_video ? 1 : 0, b.is_free ? 1 : 0,
    )
    .run();

  await note(db, sess.uid, id, { label: b.label, base, model: b.model, tier: b.tier, keyChanged: !!keys });
  return json({ ok: true });
};

/** 记修订。刻意不记 key 本身,只记"改没改过" */
async function note(db: D1Database, uid: number, id: string, after: unknown) {
  await db
    .prepare(`INSERT INTO revisions (entity, entity_id, after_json, user_id) VALUES ('provider', ?, ?, ?)`)
    .bind(id, JSON.stringify(after), uid)
    .run();
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
