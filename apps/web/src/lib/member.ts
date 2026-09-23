/**
 * 工厂站网站会员(2026-09-23)。创始人:「配方列表可以看,但是点击就开启注册会员,免费版只可以一天看20个!收费版看100个」。
 * 登录 = 邮件魔法链接:填邮箱 → 过 Turnstile → 收信点链接即登录(第一次点就是注册),不存密码。
 * 会话:HMAC 签名 cookie `bh_mem`,30 天(复用 lib/auth 的签发/校验,密钥加后缀,与后台会话互不认)。
 * 带这个 cookie 的请求一律不进边缘缓存(middleware)。配额判定在 lib/quota.ts(与平台站同一份)。
 */
import { issueSession, readSession, readCookie } from './auth';
import { gate, type Gate } from './quota';

export const MB_COOKIE = 'bh_mem';
const SESSION_DAYS = 30;
const MAGIC_HOURS = 0.5;
/* AUTH_SECRET 没配时不发也不认 —— 否则密钥退化成固定后缀,任何人都能伪造会员会话 */
const secretOf = (env: any, kind: 'member' | 'magic') => {
  const s = String(env?.AUTH_SECRET ?? '');
  return s ? `${s}|${kind}` : '';
};

export type Member = { id: number; email: string; plan_id: string };

export const memberCookie = (token: string) => `${MB_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
export const clearMemberCookie = () => `${MB_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export const memberToken = (m: { id: number; email: string }, env: any) =>
  issueSession({ id: m.id, email: m.email, role: 'member' }, secretOf(env, 'member'), SESSION_DAYS * 24);
export const magicToken = (email: string, env: any) =>
  issueSession({ id: 0, email, role: 'magic' }, secretOf(env, 'magic'), MAGIC_HOURS);
export async function readMagic(t: string, env: any): Promise<string | null> {
  const sec = secretOf(env, 'magic');
  const s = sec ? await readSession(t, sec) : null;
  return s?.role === 'magic' ? s.email : null;
}

/** 从请求读会员;没登录 / 会话过期 / 账号停用都返回 null */
export async function getMember(request: Request, env: any, db: D1Database | undefined): Promise<Member | null> {
  const sec = secretOf(env, 'member');
  const s = sec ? await readSession(readCookie(request.headers.get('cookie'), MB_COOKIE), sec) : null;
  if (!s || s.role !== 'member' || !db) return null;
  return db.prepare(`SELECT id, email, plan_id FROM mb_members WHERE id = ? AND status = 'active'`).bind(s.uid).first<Member>().catch(() => null);
}

/** 详情页用:认证爬虫(middleware 算好放在 locals.goodBot,与缓存键同一个判定)→ 会员 → 计一次。
 *  非爬虫的结果随人而变,响应头标 private;x-bh-gate 方便线上核对。 */
export async function pageGate(A: { request: Request; locals: any; response: { headers: Headers } }, env: any, db: D1Database | undefined, item: string): Promise<Gate> {
  const bot = !!A.locals?.goodBot;
  const g = await gate({ db, bot, member: bot ? null : await getMember(A.request, env, db), item });
  A.response.headers.set('x-bh-gate', g.state);
  if (g.state === 'full' || g.state === 'over') A.response.headers.set('Cache-Control', 'private, no-store');
  return g;
}

/** Google 对付费墙的官方标注:页面 isAccessibleForFree=false,付费段用 cssSelector 指出来 ——
 *  爬虫拿全文、真人看预览,这样声明了就不算 cloaking。 */
export const paywallLd = (url: string, name: string, selector = '.paywalled') => ({
  '@context': 'https://schema.org', '@type': 'WebPage', url, name, isAccessibleForFree: false,
  hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: selector },
});

/** 只收站内路径:以单个 / 开头,不收 //evil.com、/\evil.com 这类开放跳转 */
export const safeNext = (s: string | null | undefined, fallback: string): string => {
  const n = String(s ?? '');
  return /^\/(?![/\\])\S*$/.test(n) ? n.slice(0, 300) : fallback;
};

/** 登录页与登录接口共用的人话提示(错误码 → 文案) */
export function loginMsg(code: string, zh: boolean): string {
  const M: Record<string, [string, string]> = {
    email: ['邮箱格式不对,请检查后再试', 'That email address does not look right'],
    'human-off': ['人机验证未配置,暂时无法注册;请直接发询盘联系我们', 'Human verification is not configured, so sign-up is paused. Please send us an enquiry instead'],
    'human-missing': ['请先完成人机验证(等勾选框出现、打勾后再提交)', 'Please complete the human check first (wait for the checkbox and tick it)'],
    'human-expired': ['人机验证已过期,请重新勾选后再提交', 'The human check expired. Tick it again and resubmit'],
    'human-net': ['连不上人机验证服务,请稍后再试', 'Could not reach the verification service. Try again shortly'],
    human: ['人机验证未通过,请刷新页面重试', 'Human check failed. Refresh the page and try again'],
    rate: ['发得太频繁了:同一邮箱 1 小时最多 3 封,请稍后再试', 'Too many requests: at most 3 emails per address per hour. Try again later'],
    mail: ['登录邮件没发出去(发信服务暂不可用),请稍后再试或直接发询盘', 'The sign-in email could not be sent (mail service unavailable). Try later or send us an enquiry'],
    link: ['登录链接无效或已过期(30 分钟有效),请重新获取', 'The sign-in link is invalid or expired (valid 30 minutes). Request a new one'],
    blocked: ['这个账号已停用,请联系我们', 'This account is disabled. Please contact us'],
  };
  const m = M[code] ?? M.human;
  return zh ? m[0] : m[1];
}

/** Turnstile 服务端校验。返回 null = 通过,否则返回错误码(loginMsg 能翻成人话)。
 *  没配 secret 按「未启用」拒绝(fail closed:卡住批量注册是每日限额成立的前提);
 *  不传 remoteip(后台登录 09-02 实锤:走代理换出口 IP 会误判)。 */
export async function turnstileFail(env: any, token: string): Promise<string | null> {
  const secret = String(env?.TURNSTILE_SECRET ?? '').trim();
  if (!secret) return 'human-off';
  if (!token) return 'human-missing';
  const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret, response: token }),
  }).then((r) => r.json() as Promise<{ success?: boolean; 'error-codes'?: string[] }>)
    .catch(() => ({ success: false, 'error-codes': ['fetch-failed'] }));
  if (v.success) return null;
  const codes = v['error-codes'] ?? [];
  return codes.includes('timeout-or-duplicate') ? 'human-expired' : codes.includes('fetch-failed') ? 'human-net' : 'human';
}
