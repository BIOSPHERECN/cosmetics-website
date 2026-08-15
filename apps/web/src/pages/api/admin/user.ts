/**
 * 账号管理。
 *
 * 新账号不设初始口令,而是发一次性邀请链接让对方自己设 —— 理由:
 *  · 任何"由别人代设的初始口令"都要经过一次明文传递(微信/邮件),那就是泄露点;
 *  · 一次性 + 24 小时过期,链接即使被转发也很快失效。
 * 邀请令牌只存哈希,库被读走也换不出可用链接。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, requireAdmin, logRevision } from '../../../lib/guard';
import { hashPassword } from '../../../lib/auth';

export const prerender = false;

async function ensureInvites(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS invites (
       token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
       expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`
  ).run();
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = requireAdmin(c); if (deny) return deny;

  const { email, display_name, role } = (await request.json().catch(() => ({}))) as any;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, msg: '邮箱格式不对' }, 400);
  const r = (role === 'admin' ? 'admin' : 'editor');

  try {
    await ensureInvites(c.db);
    // 占位口令是一段随机值,谁都不知道 —— 账号只能通过邀请链接激活
    const { hash, salt } = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
    const u = await c.db.prepare(
      `INSERT INTO users (email, pass_hash, pass_salt, role, display_name) VALUES (?,?,?,?,?) RETURNING id`
    ).bind(String(email).trim().toLowerCase(), hash, salt, r, display_name || null).first<{ id: number }>();

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    await c.db.prepare(`INSERT INTO invites (token_hash, user_id, expires_at) VALUES (?,?,datetime('now','+1 day'))`)
      .bind(await sha256(token), u!.id).run();
    await logRevision(c.db, 'users', u!.id, null, null, { email, role: r }, c.sess.uid);
    return json({ ok: true, id: u!.id, link: `/bohui/invite/?t=${token}` });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return json({ ok: false, msg: /UNIQUE/i.test(m) ? '该邮箱已存在' : `创建失败:${m.slice(0, 140)}` }, 400);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, role, password } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);

  if (password !== undefined) {
    // 只能改自己的口令。要给别人重置,走邀请链接,不经手明文
    if (Number(id) !== c.sess.uid) return json({ ok: false, msg: '只能修改自己的口令;给别人重置请用邀请链接' }, 403);
    if (String(password).length < 6) return json({ ok: false, msg: '口令至少 6 位' }, 400);
    const { hash, salt } = await hashPassword(String(password));
    await c.db.prepare(`UPDATE users SET pass_hash=?, pass_salt=? WHERE id=?`).bind(hash, salt, id).run();
    return json({ ok: true });
  }

  const deny = requireAdmin(c); if (deny) return deny;
  if (Number(id) === c.sess.uid) return json({ ok: false, msg: '不能改自己的角色' }, 400);
  if (role !== 'admin' && role !== 'editor') return json({ ok: false, msg: '角色不合法' }, 400);
  // 降级最后一个管理员会把后台锁死
  if (role === 'editor') {
    const n = (await c.db.prepare(`SELECT COUNT(*) n FROM users WHERE role='admin'`).first<{ n: number }>())?.n ?? 0;
    if (n <= 1) return json({ ok: false, msg: '至少要保留一个管理员' }, 400);
  }
  const before = await c.db.prepare(`SELECT role FROM users WHERE id=?`).bind(id).first();
  await c.db.prepare(`UPDATE users SET role=? WHERE id=?`).bind(role, id).run();
  await logRevision(c.db, 'users', id, null, before, { role }, c.sess.uid);
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = requireAdmin(c); if (deny) return deny;
  const { id } = (await request.json().catch(() => ({}))) as { id?: number };
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  if (Number(id) === c.sess.uid) return json({ ok: false, msg: '不能删除自己' }, 400);
  const t = await c.db.prepare(`SELECT role, email FROM users WHERE id=?`).bind(id).first<{ role: string; email: string }>();
  if (t?.role === 'admin') {
    const n = (await c.db.prepare(`SELECT COUNT(*) n FROM users WHERE role='admin'`).first<{ n: number }>())?.n ?? 0;
    if (n <= 1) return json({ ok: false, msg: '至少要保留一个管理员' }, 400);
  }
  await c.db.prepare(`DELETE FROM users WHERE id=?`).bind(id).run();
  await logRevision(c.db, 'users', id, null, t, { deleted: true }, c.sess.uid);
  return json({ ok: true });
};
