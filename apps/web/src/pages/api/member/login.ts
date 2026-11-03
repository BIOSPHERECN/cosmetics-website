/**
 * 网站会员登录(工厂站 2026-09-23,见 lib/member.ts)。
 *   POST {email, lang, next}
 *        → 点选码通行证(L3 / C8;没有回 cap,JSON 回 428 need:'cap';头 x-hc: probe 只回 204 / 428)
 *          → 同一邮箱 1 小时内第二次要链接 = 账号异常,只认 10 分钟内刚做过的题(cap-fresh)→ 限流 → 发登录链接。
 *          HUMAN_GATE=turnstile 或没配 CAP_SECRET 时仍走 Turnstile(beauty2oem 例外:它的 Turnstile 没授权域名,只走点选码)。表单 303 回登录页;JSON 回 JSON。
 *        发信失败如实返回 sent:false + mail_error,不装成功(平台 09-22 出过「一律 sent=true」的事)。
 *   GET  ?t=<链接令牌>&next=  → 验签(30 分钟内)→ 建或取会员 → 发 30 天会话 cookie → 303 回原页。第一次点即注册。
 *   GET  ?logout=1            → 清 cookie。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { magicToken, readMagic, memberToken, memberCookie, clearMemberCookie, turnstileFail, safeNext, loginMsg } from '../../../lib/member';
import { sendMail } from '../../../lib/mail';
import { overQuota, recordUse, clientId } from '../../../lib/ratelimit';
import { DAILY } from '../../../lib/quota';
import { siteIdForHost } from '@cosmetic/core/content/tenant-map.ts';
import { humanMode, capFail, isProbe, probeResp } from '../../../lib/hcgate';

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const see = (loc: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: loc, 'cache-control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
const langOf = (s: string | null | undefined) => (/^[a-z]{2}(-[a-z]{2})?$/.test(s ?? '') ? String(s) : 'zh-cn');

export const POST: APIRoute = async ({ request, url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const isForm = (request.headers.get('content-type') || '').includes('form');
  const f: Record<string, string> = {};
  try {
    if (isForm) for (const [k, v] of await request.formData()) f[k] = String(v);
    else for (const [k, v] of Object.entries((await request.json()) as Record<string, unknown>)) f[k] = String(v ?? '');
  } catch { return json({ ok: false, code: 'bad-request' }, 400); }
  const lang = langOf(f.lang), zh = lang.startsWith('zh');
  const email = (f.email ?? '').trim().toLowerCase().slice(0, 200);
  const next = safeNext(f.next, `/${lang}/decoder/`);
  const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => isForm
    ? see(`/${lang}/login/?${new URLSearchParams({ e: code, email, next })}`)
    : json({ ok: false, code, msg: loginMsg(code, zh), ...(code.startsWith('cap') ? { need: 'cap' } : {}), ...extra }, status);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('email', 400);
  /* 09-24 W1:beauty2oem 登录必须勾两项同意(B4 v2 2.2) */
  if (siteIdForHost(url.hostname) === 'beauty2oem' && !(f.agree_policy && f.agree_xborder)) return fail('consent', 400);
  /* 人机验证放在查库与发信之前:脚本连一次数据库开销都换不走 */
  const mode = humanMode(env, siteIdForHost(url.hostname) === 'beauty2oem');
  /* 09-24 红队:通行证计次(QUOTA['member.pass']:8 小时 3 封)。用满了按「没有通行证」回 cap,探测也回 428,登录页照常弹题,换新通行证再发 */
  const passKey = mode === 'cap' ? (/(?:^|;\s*)__Host-cap=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] ?? '').slice(-24) : '';
  const human = mode === 'cap'
    ? (await capFail(request, env)) ?? (await overQuota(db, 'member.pass', passKey) ? 'cap' : null)
    : isProbe(request) ? null : await turnstileFail(env, f['cf-turnstile-response'] || f.turnstile || '');
  if (isProbe(request)) return probeResp(human);
  if (human) return fail(human, human === 'human-off' ? 503 : human === 'cap' ? 428 : 403);
  /* 账号异常(L3 6.1):同一邮箱 1 小时内第二次要链接,通行证须是 10 分钟内签的。有通行证才走到这里,脚本换不来这次读库 */
  if (mode === 'cap' && db && await db.prepare(`SELECT 1 FROM revisions WHERE entity = 'rl:member.mail' AND entity_id = ? AND created_at > datetime('now', '-60 minutes') LIMIT 1`).bind(email).first().catch(() => null)) {
    const again = await capFail(request, env, true);
    if (again) return fail(again, 428);
  }
  const ip = clientId(request);
  if (await overQuota(db, 'member.mail', email) || await overQuota(db, 'member.ip', ip)) return fail('rate', 429);
  await recordUse(db, 'member.mail', email);
  await recordUse(db, 'member.ip', ip);
  if (passKey) await recordUse(db, 'member.pass', passKey);

  const link = `${url.origin}/api/member/login?${new URLSearchParams({ t: await magicToken(email, env), next, lang })}`;
  const r = await sendMail(env, zh ? {
    to: [email], site: url.hostname, subject: '帛卉化妆品 · 登录链接',
    text: `点击下面的链接登录帛卉化妆品网站(30 分钟内有效;第一次登录即完成注册):\n${link}\n\n免费会员每天可查看 ${DAILY.free} 条成分解读、原料与配方详情或 AI 搜索结果。\n如果不是你本人操作,忽略这封邮件即可。\n\nBIOSPHERE · ${url.hostname}`,
    html: `<p>点击下面的按钮登录帛卉化妆品网站(30 分钟内有效;第一次登录即完成注册)。</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;border-radius:999px;text-decoration:none">登录</a></p><p style="color:#666;font-size:13px">免费会员每天可查看 ${DAILY.free} 条成分解读、原料与配方详情或 AI 搜索结果。如果不是你本人操作,忽略这封邮件即可。</p><p style="color:#666;font-size:13px">BIOSPHERE · ${url.hostname}</p>`,
  } : {
    to: [email], site: url.hostname, subject: 'BIOSPHERE · your sign-in link',
    text: `Use the link below to sign in (valid for 30 minutes; your first sign-in creates the account):\n${link}\n\nFree members can open ${DAILY.free} ingredient breakdowns, ingredient or formula pages, or AI search answers a day.\nIf you did not ask for this, ignore this email.\n\nBIOSPHERE · ${url.hostname}`,
    html: `<p>Use the button below to sign in (valid for 30 minutes; your first sign-in creates the account).</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;border-radius:999px;text-decoration:none">Sign in</a></p><p style="color:#666;font-size:13px">Free members can open ${DAILY.free} items a day. If you did not ask for this, ignore this email.</p><p style="color:#666;font-size:13px">BIOSPHERE · ${url.hostname}</p>`,
  });
  if (!r.ok) {
    console.error('[member] 登录邮件发送失败', r.msg);
    return fail('mail', 502, { sent: false, mail_error: r.msg ?? '' });
  }
  return isForm
    ? see(`/${lang}/login/?${new URLSearchParams({ sent: '1', email, next })}`)
    : json({ ok: true, sent: true, via: r.via, id: r.id ?? null });
};

export const GET: APIRoute = async ({ request, url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const q = url.searchParams;
  const lang = langOf(q.get('lang'));
  if (q.get('logout')) return see(`/${lang}/`, clearMemberCookie());
  const next = safeNext(q.get('next'), `/${lang}/decoder/`);
  const email = await readMagic(q.get('t') ?? '', env);
  if (!email || !db) return see(`/${lang}/login/?${new URLSearchParams({ e: 'link', next })}`);
  const m = await db.prepare(
    `INSERT INTO mb_members (email, country, last_login_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at
     RETURNING id, email, status`).bind(email, request.headers.get('cf-ipcountry')).first<{ id: number; email: string; status: string }>();
  if (!m || m.status !== 'active') return see(`/${lang}/login/?${new URLSearchParams({ e: 'blocked', next })}`);
  return see(next, memberCookie(await memberToken(m, env)));
};
