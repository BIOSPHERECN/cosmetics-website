import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  verifyPassword, issueSession, sessionCookie, clearCookie,
  tooManyAttempts, recordLoginFail,
} from '../../../lib/auth';

export const prerender = false;

/**
 * 后台登录。
 * 失败一律返回同一句话、同样耗时 —— 不区分「账号不存在」与「口令错误」,
 * 否则攻击者可以用它枚举有哪些账号。
 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  if (!db || !secret) {
    return json({ ok: false, msg: '服务端未配置 AUTH_SECRET' }, 500);
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (await tooManyAttempts(db, ip)) {
    return json({ ok: false, msg: '尝试次数过多,请 15 分钟后再试' }, 429);
  }

  let email = '', password = '';
  try {
    const b = (await request.json()) as { email?: string; password?: string };
    email = (b.email ?? '').trim().toLowerCase();
    password = b.password ?? '';
  } catch {
    return json({ ok: false, msg: '请求格式不对' }, 400);
  }
  if (!email || !password) return json({ ok: false, msg: '请填写邮箱与口令' }, 400);

  const user = await db
    .prepare(`SELECT id, email, role, pass_hash, pass_salt FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: number; email: string; role: string; pass_hash: string; pass_salt: string }>();

  // 账号不存在时也走一次同样开销的哈希,让响应时间不泄露账号是否存在
  const ok = user
    ? await verifyPassword(password, user.pass_hash, user.pass_salt)
    : (await verifyPassword(password, 'x'.repeat(44), 'y'.repeat(24)), false);

  if (!ok || !user) {
    await recordLoginFail(db, ip);
    return json({ ok: false, msg: '邮箱或口令不正确' }, 401);
  }

  const token = await issueSession(user, secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
};

/** 退出:清 cookie 即可,会话本身无状态 */
export const DELETE: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie() },
  });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
