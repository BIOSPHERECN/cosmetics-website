/**
 * 工厂站网站会员(2026-09-23)。创始人:「配方列表可以看,但是点击就开启注册会员,免费版只可以一天看20个!收费版看100个」。
 * 登录 = 邮件魔法链接:填邮箱 → 过点选码(L3;HUMAN_GATE=turnstile 回滚到 Turnstile)→ 收信点链接即登录(第一次点就是注册),不存密码。
 * 会话:HMAC 签名 cookie `bh_mem`,30 天(复用 lib/auth 的签发/校验,密钥加后缀,与后台会话互不认)。
 * 带这个 cookie 的请求一律不进边缘缓存(middleware)。配额判定在 lib/quota.ts(与平台站同一份)。
 */
import { issueSession, readSession, readCookie, COOKIE } from './auth';
import { gate, DAILY, type Gate } from './quota';
import { verifyPass } from './captcha';
import { humanMode, suspect } from './hcgate';

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

/** 会员 cookie 验签(纯 WebCrypto,不碰 D1);签名不对、过期、没配密钥都是 null */
const sessionOf = async (cookie: string | null, env: any) => {
  const sec = secretOf(env, 'member');
  const s = sec ? await readSession(readCookie(cookie, MB_COOKIE), sec).catch(() => null) : null;
  return s?.role === 'member' ? s : null;
};
/** 中间件用(09-24 安全架构 C1 / 代码审计 P0-4):只看 cookie 在不在就不走缓存,带一个假 bh_mem 就能让每个请求都现渲染。
 *  现在验签通过才算会员;假的按游客处理,照常走缓存。 */
export const memberSigned = async (cookie: string | null, env: any): Promise<boolean> => !!(await sessionOf(cookie, env));

/** 谁在看(客户出图归属用,09-24 代码审计 P1-2):后台员工(bohui_sess 验签)与会员 id。都只验签,不读 D1 */
export async function viewer(request: Request, env: any): Promise<{ mid: number | null; staff: boolean }> {
  const ck = request.headers.get('cookie');
  const staff = !!(await readSession(readCookie(ck, COOKIE), String(env?.AUTH_SECRET ?? '')).catch(() => null));
  return { mid: (await sessionOf(ck, env))?.uid ?? null, staff };
}

/** 从请求读会员;没登录 / 会话过期 / 账号停用都返回 null */
export async function getMember(request: Request, env: any, db: D1Database | undefined): Promise<Member | null> {
  const s = await sessionOf(request.headers.get('cookie'), env);
  if (!s || !db) return null;
  return db.prepare(`SELECT id, email, plan_id FROM mb_members WHERE id = ? AND status = 'active'`).bind(s.uid).first<Member>().catch(() => null);
}

/** 详情页用:认证爬虫(middleware 算好放在 locals.goodBot,与缓存键同一个判定)→ 会员 → 计一次。
 *  非爬虫的结果随人而变,响应头标 private;x-bh-gate 方便线上核对。 */
export async function pageGate(A: { request: Request; locals: any; response: { headers: Headers } }, env: any, db: D1Database | undefined, item: string): Promise<Gate> {
  const bot = !!A.locals?.goodBot;
  const g = await gate({ db, bot, member: bot ? null : await getMember(A.request, env, db), item });
  A.response.headers.set('x-bh-gate', g.state);
  /* 会员那份随人而变,不进缓存;游客预览与爬虫全文两份进边缘缓存 24 小时(安全架构 C3:原 1 小时,冷门详情页基本命不中) */
  A.response.headers.set('Cache-Control', g.state === 'full' || g.state === 'over' ? 'private, no-store' : 'public, max-age=0, s-maxage=86400');
  return g;
}

/** 站内搜索用(09-24 创始人:「免费的查询是受限的」「就算注册,搜索也要限制」)。
 *  搜索与详情共用每日 20 / 100 条:每个不同的搜索词算一条,同一个词当天再搜、翻页不重复扣。
 *  未登录与爬虫一律不查库(搜索结果页本就不该被收录,回答型爬虫看详情页就够),返回 login;没带词返回 null。 */
export type SearchGate = Omit<Gate, 'state'> & { state: Gate['state'] | 'cap' };
export async function searchGate(A: { request: Request; locals: any; response: { headers: Headers } }, env: any, db: D1Database | undefined, scope: string, q: string): Promise<SearchGate | null> {
  if (!q) return null;
  A.response.headers.set('X-Robots-Tag', 'noindex, follow');
  const member = A.locals?.goodBot ? null : await getMember(A.request, env, db);
  /* 点选码(L3 / C8):可疑会员(云机房出口、无头浏览器)没有通行证时先做一次题,不计额度、不查库;
     未登录的走 MemberGate 登录卡 → 登录页发信前出题。Turnstile 回滚档、没配 CAP_SECRET 时不出(出不了题) */
  if (member && env?.CAP_SECRET && humanMode(env) === 'cap' && suspect(A.request) && !(await verifyPass(A.request, env))) {
    A.response.headers.set('x-bh-gate', 'cap');
    A.response.headers.set('Cache-Control', 'private, no-store');
    return { state: 'cap', used: 0, limit: 0 };
  }
  const g = await gate({ db, bot: false, member, item: `q:${scope}:${q.toLowerCase()}` });
  A.response.headers.set('x-bh-gate', g.state);
  if (g.state !== 'login') A.response.headers.set('Cache-Control', 'private, no-store');
  return g;
}

/** 调模型的公开接口(09-24 代码审计 P1-4 / 安全架构 C10):只给会员用,并计每日额度(与详情、搜索共用 20 / 100 条)。
 *  以前不登录就能调、只按 IP 每小时限几次:换 IP 就能把 Agnes / 商汤的免费额度烧干,前台 AI 对所有客户同时失效。
 *  perCall:每次调用算一条(看图、出方案这类重活);false = 当天用这个功能只算一条(AI 客服,多轮对话不逐条扣,另有按 IP 每小时上限)。
 *  返回 null = 放行;否则是直接回给前端的 JSON(前端已按 msg 显示,href 是登录页)。 */
export async function aiGate(request: Request, env: any, db: D1Database | undefined, key: string, perCall = true): Promise<Response | null> {
  const ref = (() => { try { return new URL(request.headers.get('referer') || '').pathname; } catch { return ''; } })();
  const lang = /^\/([a-z]{2}(?:-[a-z]{2})?)\//.exec(ref)?.[1] ?? 'zh-cn';
  const zh = lang.startsWith('zh');
  const out = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const me = await getMember(request, env, db);
  if (!me) return out({ ok: false, need: 'login',
    msg: zh ? `请先用邮箱登录(免费会员每天 ${DAILY.free} 条,与解读、原料、配方详情共用;不用密码)。` : `Please sign in with your email first (free members get ${DAILY.free} a day, shared with the decoder and ingredient pages; no password).`,
    href: `/${lang}/login/?next=${encodeURIComponent(safeNext(ref, `/${lang}/`))}` }, 401);
  const g = await gate({ db, bot: false, member: me, item: perCall ? `${key}:${crypto.randomUUID()}` : key });
  if (g.state === 'over') return out({ ok: false, need: 'upgrade', used: g.used, limit: g.limit,
    msg: zh ? `今天的 ${g.limit} 条已用完,北京时间明天 0 点恢复。` : `Today's ${g.limit} are used up; resets at midnight Beijing time.` }, 429);
  return null;
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
    cap: ['请先完成验证:点「发送登录链接」后,按提示依次点 3 个字', 'Please complete the quick check first: press the button, then tap the 3 characters in order'],
    'cap-fresh': ['这个邮箱刚发过登录链接,为防止被人冒用,请再完成一次验证', 'A link was just sent to this address. To keep it safe, please complete the quick check once more'],
    rate: ['发得太频繁了:同一邮箱 1 小时最多 3 封,请稍后再试', 'Too many requests: at most 3 emails per address per hour. Try again later'],
    mail: ['登录邮件没发出去(发信服务暂不可用),请稍后再试或直接发询盘', 'The sign-in email could not be sent (mail service unavailable). Try later or send us an enquiry'],
    link: ['登录链接无效或已过期(30 分钟有效),请重新获取', 'The sign-in link is invalid or expired (valid 30 minutes). Request a new one'],
    blocked: ['这个账号已停用,请联系我们', 'This account is disabled. Please contact us'],
    consent: ['请先勾选两项同意(个人信息保护政策、跨境传输)再提交', 'Please tick both consent boxes before submitting'],
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
