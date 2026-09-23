import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { totpNewSecret, totpVerify } from '../../../lib/auth';

export const prerender = false;

/**
 * 两步验证自助管理 —— 只对**自己的账号**操作,管理员也不能替别人开关
 * (替别人开 = 拿到对方密钥,两步验证就名存实亡)。
 * 三步走防锁死:setup 生成的密钥先进 totp_pending,
 * 用户拿验证器回填一个正确的 6 位码(activate)才转正 ——
 * 抄错密钥就直接启用会把自己永远锁在门外。
 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
  const uid = c.sess.uid;

  if (b.action === 'setup') {
    const secret = totpNewSecret();
    await c.db.prepare(`UPDATE users SET totp_pending=? WHERE id=?`).bind(secret, uid).run();
    const label = encodeURIComponent(`BOHUI:${c.sess.email}`);
    return json({ ok: true, secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=BOHUI&digits=6&period=30` });
  }

  if (b.action === 'activate') {
    const row = await c.db.prepare(`SELECT totp_pending FROM users WHERE id=?`).bind(uid)
      .first<{ totp_pending: string | null }>();
    if (!row?.totp_pending) return json({ ok: false, msg: '请先点「开始设置」生成密钥' }, 400);
    if (!(await totpVerify(row.totp_pending, b.code ?? ''))) {
      return json({ ok: false, msg: '动态码不对 —— 确认验证器里录入的密钥无误后重试' }, 400);
    }
    await c.db.prepare(`UPDATE users SET totp_secret=totp_pending, totp_pending=NULL WHERE id=?`).bind(uid).run();
    await logRevision(c.db, 'users', uid, null, null, { totp: 'enabled' }, uid);
    return json({ ok: true });
  }

  if (b.action === 'disable') {
    const row = await c.db.prepare(`SELECT totp_secret FROM users WHERE id=?`).bind(uid)
      .first<{ totp_secret: string | null }>();
    if (!row?.totp_secret) return json({ ok: false, msg: '两步验证本来就没开' }, 400);
    /* 关闭也要验一次码:偷到已登录会话的人不该能顺手关掉第二道锁 */
    if (!(await totpVerify(row.totp_secret, b.code ?? ''))) {
      return json({ ok: false, msg: '请输入当前动态码以确认关闭' }, 400);
    }
    await c.db.prepare(`UPDATE users SET totp_secret=NULL, totp_pending=NULL WHERE id=?`).bind(uid).run();
    await logRevision(c.db, 'users', uid, null, null, { totp: 'disabled' }, uid);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '未知动作' }, 400);
};
