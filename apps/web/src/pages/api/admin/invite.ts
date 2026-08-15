/**
 * 兑换邀请令牌:设定口令并直接发会话,省掉"设完再去登录"这一步。
 * 令牌比对用哈希,且用完即置 used —— 转发出去的链接第二次点开就是废的。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../lib/guard';
import { hashPassword, issueSession, sessionCookie } from '../../../lib/auth';

export const prerender = false;

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  if (!db || !secret) return json({ ok: false, msg: '服务未就绪' }, 500);

  const { token, password } = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token || !password) return json({ ok: false, msg: '参数不完整' }, 400);
  if (password.length < 6) return json({ ok: false, msg: '口令至少 6 位' }, 400);

  const row = await db.prepare(
    `SELECT user_id, used, expires_at FROM invites WHERE token_hash=?`
  ).bind(await sha256(token)).first<{ user_id: number; used: number; expires_at: string }>().catch(() => null);

  if (!row || row.used) return json({ ok: false, msg: '邀请链接无效或已使用' }, 400);
  const exp = await db.prepare(`SELECT datetime('now') > ? AS gone`).bind(row.expires_at).first<{ gone: number }>();
  if (exp?.gone) return json({ ok: false, msg: '邀请链接已过期,请让管理员重新生成' }, 400);

  const { hash, salt } = await hashPassword(password);
  await db.prepare(`UPDATE users SET pass_hash=?, pass_salt=? WHERE id=?`).bind(hash, salt, row.user_id).run();
  await db.prepare(`UPDATE invites SET used=1 WHERE token_hash=?`).bind(await sha256(token)).run();

  const u = await db.prepare(`SELECT id, email, role FROM users WHERE id=?`).bind(row.user_id).first<any>();
  const t = await issueSession({ id: u.id, email: u.email, role: u.role }, secret);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(t) },
  });
};
