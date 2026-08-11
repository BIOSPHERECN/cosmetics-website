import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashPassword } from '../../../lib/auth';

export const prerender = false;

/**
 * 首次安装:创建第一个管理员。
 *
 * 设计成「只在一个用户都没有时可用」,建完即自动失效 —— 这样:
 *  · 口令由创始人自己设,不经任何人之手,库里只存 PBKDF2 派生值;
 *  · 不需要在代码或环境变量里预置任何默认口令(预置默认口令是最常见的入侵入口)。
 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database;
  const n = await db.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
  if ((n?.c ?? 0) > 0) {
    return json({ ok: false, msg: '管理员已存在,本接口已关闭' }, 403);
  }

  const { email, password } = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) return json({ ok: false, msg: '请提供邮箱与口令' }, 400);
  if (password.length < 10) return json({ ok: false, msg: '口令至少 10 位' }, 400);

  const { hash, salt } = await hashPassword(password);
  await db
    .prepare(`INSERT INTO users (email, pass_hash, pass_salt, role, display_name) VALUES (?,?,?,'admin',?)`)
    .bind(email.trim().toLowerCase(), hash, salt, '管理员')
    .run();

  return json({ ok: true, msg: '管理员已创建,请回到 /admin/ 登录' });
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
