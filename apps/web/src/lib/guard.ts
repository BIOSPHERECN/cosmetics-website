/**
 * 后台鉴权闸门 —— 每个后台页与后台接口的第一行。
 *
 * 单独抽出来是因为之前每页各写一遍 readSession,一旦漏写就是一个敞开的后门。
 * 权限判断只有一处,才谈得上"可审计"。
 */
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE, type Session } from './auth';
import { resolveTenant, type Tenant } from './tenant';

export type Ctx = { db: D1Database; sess: Session & { site_id?: string | null }; tenant: Tenant };

/** 页面用:未登录返回 null,调用方 redirect 到登录页 */
export async function pageGuard(req: Request): Promise<Ctx | null> {
  const db = (env as any).DB as D1Database | undefined;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(req.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess || !db) return null;

  // 账号的站点归属存在库里,不在会话里 —— 会话是签发时的快照,
  // 归属改了不该等下次登录才生效,尤其是「收回权限」这种事。
  const row = await db.prepare(`SELECT site_id FROM users WHERE id = ?`).bind(sess.uid)
    .first<{ site_id: string | null }>().catch(() => null);
  const full = { ...sess, site_id: row?.site_id ?? null };
  const tenant = await resolveTenant(db, full, new URL(req.url));
  return { db, sess: full, tenant };
}

/** 接口用:未登录直接抛 401 JSON,不给任何数据 */
export async function apiGuard(req: Request): Promise<Ctx | Response> {
  const c = await pageGuard(req);
  if (!c) return json({ ok: false, msg: '未登录或会话已过期' }, 401);
  return c;
}

/** 只有 admin 能做的事(改账号、删数据) */
export function requireAdmin(c: Ctx): Response | null {
  return c.sess.role === 'admin' ? null : json({ ok: false, msg: '需要管理员权限' }, 403);
}

export function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 写修订记录 —— 谁在什么时候把什么改成了什么。没有这个就没有"可回溯" */
export async function logRevision(
  db: D1Database, entity: string, entityId: string | number,
  lang: string | null, before: unknown, after: unknown, userId: number,
) {
  await db.prepare(
    `INSERT INTO revisions (entity, entity_id, lang, before_json, after_json, user_id) VALUES (?,?,?,?,?,?)`
  ).bind(entity, String(entityId), lang, before == null ? null : JSON.stringify(before), JSON.stringify(after), userId).run();
}
