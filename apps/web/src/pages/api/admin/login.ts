import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  verifyPassword, issueSession, sessionCookie, clearCookie,
  tooManyAttempts, recordLoginFail, totpVerify,
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

  let email = '', password = '', turnstile = '', totp = '';
  try {
    const b = (await request.json()) as { email?: string; password?: string; turnstile?: string; totp?: string };
    email = (b.email ?? '').trim().toLowerCase();
    password = b.password ?? '';
    turnstile = b.turnstile ?? '';
    totp = b.totp ?? '';
  } catch {
    return json({ ok: false, msg: '请求格式不对' }, 400);
  }
  if (!email || !password) return json({ ok: false, msg: '请填写邮箱与口令' }, 400);

  /* 人机验证(Cloudflare Turnstile)。配了 TURNSTILE_SECRET 才启用 ——
     开关在部署配置层。验证放在查库与哈希**之前**:
     让扫描器连一次数据库开销都换不走。失败也计入限流,双层都在。 */
  const tsSecret = (env as any).TURNSTILE_SECRET as string | undefined;
  if (tsSecret) {
    /* ★ 不要传 remoteip(2026-09-02 创始人登录被拦实锤)★
       Cloudflare 会拿它和"当初解开挑战时记录的 IP"比对。创始人走代理,
       出口 IP 在解挑战与提交之间换了一个,于是明明人是真的也判失败 ——
       而错误提示只说"人机验证未通过",看不出是 IP 的事。
       remoteip 本就是可选参数,去掉后代理/VPN/移动网络切换都不再误伤。 */
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: tsSecret, response: turnstile }),
    })
      .then((r) => r.json() as Promise<{ success: boolean; 'error-codes'?: string[] }>)
      .catch(() => ({ success: false, 'error-codes': ['fetch-failed'] }));
    if (!v.success) {
      await recordLoginFail(db, ip);
      /* 把真实原因说人话 —— "未通过,请重试"让人无从下手,
         而这几种原因的处置方式完全不同。 */
      const codes = v['error-codes'] ?? [];
      const msg =
        codes.includes('timeout-or-duplicate') ? '验证已过期或被重复使用 —— 页面已自动刷新验证,请再点一次登录'
        : codes.includes('missing-input-response') ? '验证组件还没加载完 —— 等它显示出勾选框再登录'
        : codes.includes('invalid-input-response') ? '验证令牌无效 —— 请刷新页面重试'
        : codes.includes('fetch-failed') ? '连不上验证服务 —— 检查网络后重试'
        : `人机验证未通过(${codes.join(',') || '未知'})`;
      return json({ ok: false, msg }, 403);
    }
  }

  const user = await db
    .prepare(`SELECT id, email, role, pass_hash, pass_salt, totp_secret FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: number; email: string; role: string; pass_hash: string; pass_salt: string; totp_secret: string | null }>();

  // 账号不存在时也走一次同样开销的哈希,让响应时间不泄露账号是否存在
  const ok = user
    ? await verifyPassword(password, user.pass_hash, user.pass_salt)
    : (await verifyPassword(password, 'x'.repeat(44), 'y'.repeat(24)), false);

  if (!ok || !user) {
    await recordLoginFail(db, ip);
    return json({ ok: false, msg: '邮箱或口令不正确' }, 401);
  }

  /* 两步验证(账号自助启用后生效)。密码对了才走到这:
     - 没带码 → 告诉前端「需要第二步」,界面亮出 6 位码输入(不发会话);
     - 码错 → 计入同一套限流,爆破 6 位码和爆破口令同罪。 */
  if (user.totp_secret) {
    if (!totp) return json({ ok: false, need_totp: true, msg: '请输入验证器上的 6 位动态码' }, 401);
    if (!(await totpVerify(user.totp_secret, totp))) {
      await recordLoginFail(db, ip);
      return json({ ok: false, need_totp: true, msg: '动态码不正确或已过期' }, 401);
    }
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
