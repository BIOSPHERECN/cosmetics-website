/**
 * 自家点选文字验证码 · 校验库(安全架构 v1 第六节 L3,2026-09-24)。两站字节一致,由 tools/cap-parity.mjs 核对。
 *
 * 纯计算:只用 Web Crypto,不碰 D1、KV、网络。
 *   · 出题令牌:{批次, 答案密文, 用途, 签发时刻, IP 段(v4 /24、v6 /64), UA 摘要, 随机 nonce} + HMAC,120 秒有效。
 *   · 答案只以「批次密钥 AES-GCM 密文」出现在 KV 元数据和令牌里,批次密钥 = HMAC(CAP_SECRET, 'bank.' + 批次),
 *     本机出图器用同一公式加密(私有自动化仓 local/capbank/gen.py),前端拿不到明文。
 *   · 判题:顺序、落点在字心 r 以内、出题到交卷 ≥ 1.2 秒、相邻两击 ≥ 150ms、鼠标两击之间 ≥ 3 次移动、isTrusted;
 *     三击都贴在字心 ±1px 以内判可疑(真人点不了这么准,拿到答案表的脚本才会)。只回「对 / 不对」,不说哪条没过。
 *   · 一次性:令牌 nonce 交给调用方的 once() 精确判定。交卷接口用 D1 一条原子 upsert(CAP_ONCE_SQL)——
 *     只靠签名加时间窗,同一张令牌 2 分钟内能被并发提交几十次,5 个字按顺序选 3 个只有 60 种排列,等于必中。
 *   · 通行证 cookie:{签发, 到期 8 小时, IP 段(v4 /16、v6 /48), UA 摘要} + HMAC;受保护动作调 verifyPass() 纯验签。
 * 没配 CAP_SECRET 时一律不发、不认(fail closed)。
 */

export const CAP = {
  tokenMs: 120_000,          // 出题令牌有效期
  passMs: 8 * 3600_000,      // 通行证有效期
  minSolveMs: 1200,          // 出题到交卷最短
  minGapMs: 150,             // 相邻两击最短间隔
  minMoves: 3,               // 鼠标:两击之间最少 pointermove 次数(触屏、键盘不要求)
  precisePx: 1,              // 三击都落在字心 ±1px 以内 = 可疑
  failLimit: 6,              // 同一 IP 段每小时答错上限,满了冷却
  coolSec: 600,              // 冷却时长:出题接口回 429
} as const;

/** __Host- 前缀:浏览器强制 Secure、Path=/、不带 Domain,子域写不进来 */
export const PASS_COOKIE = '__Host-cap';
export const KINDS = ['login', 'search', 'form', 'acct'] as const;
const POINTERS = ['mouse', 'touch', 'pen', 'key'];

/** 交卷接口的两条 SQL(表见迁移 *_cap_seen.sql)。once:返回 n,n > 1 即重放;sweep:清过期行,走 exp 索引 */
export const CAP_ONCE_SQL = 'INSERT INTO cap_seen (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n';
export const CAP_SWEEP_SQL = 'DELETE FROM cap_seen WHERE exp < ?';

export type Target = [number, number, number];   // 字心 x、y 与容差半径 r,单位是原图像素
export type Body = { c?: unknown; m?: unknown; pt?: unknown; tr?: unknown };
export type Verdict = { ok: boolean; code: 'ok' | 'bad' | 'exp' | 'no'; net: string; k: string };
type Tok = { v: 1; w: string; a: string; k: string; t: number; n: string; u: string; r: string };
type Pass = { v: 1; t: number; e: number; n: string; u: string };

const te = new TextEncoder();

export const b64u = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

const hkey = (secret: string, use: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [use]);

async function seal(secret: string, tag: string, obj: unknown): Promise<string> {
  const body = b64u(te.encode(JSON.stringify(obj)));
  const mac = await crypto.subtle.sign('HMAC', await hkey(secret, 'sign'), te.encode(`${tag}.${body}`));
  return `${body}.${b64u(new Uint8Array(mac))}`;
}

/** 验签用 subtle.verify:比较在 Web Crypto 内部完成,不自己写 === */
async function unseal<T>(secret: string, tag: string, tok: string): Promise<T | null> {
  const i = tok.indexOf('.');
  if (!secret || i < 1 || tok.length > 2048) return null;
  const body = tok.slice(0, i);
  try {
    const ok = await crypto.subtle.verify('HMAC', await hkey(secret, 'verify'), unb64u(tok.slice(i + 1)), te.encode(`${tag}.${body}`));
    return ok ? (JSON.parse(new TextDecoder().decode(unb64u(body))) as T) : null;
  } catch {
    return null;
  }
}

/** IP 段:v4 保留前 v4 位(8 的倍数),v6 保留前 v6 位(16 的倍数)。取不到或不认识的一律 'x' */
export function ipNet(ip: string, v4: number, v6: number): string {
  const s = String(ip || '').trim().toLowerCase();
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some((x) => x > 255)) return 'x';
    return `${o.map((x, i) => (i < v4 / 8 ? x : 0)).join('.')}/${v4}`;
  }
  if (!/^[0-9a-f:]+$/.test(s) || s.split('::').length > 2) return 'x';
  const [head, tail] = s.includes('::') ? s.split('::') : [s, null];
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const g = tail === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return 'x';
  return `${g.slice(0, v6 / 16).map((x) => parseInt(x, 16).toString(16)).join(':')}::/${v6}`;
}

export async function uaHash(ua: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(ua || ''))).slice(0, 8));
}

async function bankKey(secret: string, w: string, use: 'encrypt' | 'decrypt') {
  const raw = await crypto.subtle.sign('HMAC', await hkey(secret, 'sign'), te.encode(`bank.${w}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [use]);
}

/** 加密答案:b64u(iv 12 字节 ‖ 密文 ‖ tag)。出图器在 Python 里做同样的事,这里给自测和应急用 */
export async function sealAnswer(secret: string, w: string, targets: Target[], iv = crypto.getRandomValues(new Uint8Array(12))): Promise<string> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await bankKey(secret, w, 'encrypt'), te.encode(JSON.stringify(targets)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return b64u(out);
}

export async function openAnswer(secret: string, w: string, a: string): Promise<Target[] | null> {
  try {
    const b = unb64u(a);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await bankKey(secret, w, 'decrypt'), b.slice(12));
    const T = JSON.parse(new TextDecoder().decode(pt));
    const good = Array.isArray(T) && T.length > 0 && T.every((x) => Array.isArray(x) && x.length === 3 && x.every((n) => Number.isFinite(n)));
    return good ? (T as Target[]) : null;
  } catch {
    return null;
  }
}

/** 出题:q 来自 KV(批次号 w、答案密文 a);k 为用途 login/search/form/acct */
export async function issueToken(secret: string, q: { w: string; a: string }, k: string, ip: string, ua: string, now = Date.now()): Promise<string | null> {
  if (!secret) return null;
  const r = b64u(crypto.getRandomValues(new Uint8Array(16)));
  return seal(secret, 'tok', { v: 1, w: q.w, a: q.a, k, t: now, n: ipNet(ip, 24, 64), u: await uaHash(ua), r } satisfies Tok);
}

/** 判答案(纯函数):c = [[x, y, 距上一击毫秒]…],m = 每一击之前的 pointermove 次数,pt = 指针类型,tr = 全部 isTrusted */
export function judge(T: Target[], b: Body, issuedAt: number, now: number): boolean {
  const c = Array.isArray(b.c) ? b.c : [];
  if (c.length !== T.length || b.tr !== true || !POINTERS.includes(String(b.pt)) || now - issuedAt < CAP.minSolveMs) return false;
  const p = c.map((x) => (Array.isArray(x) ? x.slice(0, 3).map(Number) : []));
  if (p.some((x) => x.length < 3 || !x.every(Number.isFinite))) return false;
  if (p.some((x, i) => i > 0 && x[2] < CAP.minGapMs)) return false;
  if (b.pt === 'mouse') {
    const m = Array.isArray(b.m) ? b.m.map(Number) : [];
    if (T.some((_, i) => i > 0 && !(m[i] >= CAP.minMoves))) return false;
  }
  if (p.every((x, i) => Math.abs(x[0] - T[i][0]) <= CAP.precisePx && Math.abs(x[1] - T[i][1]) <= CAP.precisePx)) return false;
  return p.every((x, i) => (x[0] - T[i][0]) ** 2 + (x[1] - T[i][1]) ** 2 <= T[i][2] ** 2);
}

/** 交卷:验签 → 过期 → IP 段与 UA → once(nonce)精确一次 → 解答案 → 判题。once 抛错就让它抛(调用方回 503,不放行) */
export async function checkAnswer(o: {
  secret: string; t: string; body: Body; ip: string; ua: string; now?: number;
  once: (key: string, expSec: number) => Promise<number>;
}): Promise<Verdict> {
  const now = o.now ?? Date.now(), net = ipNet(o.ip, 24, 64);
  const p = await unseal<Tok>(o.secret, 'tok', String(o.t || ''));
  if (!p || p.v !== 1) return { ok: false, code: 'bad', net, k: '' };
  if (now - p.t > CAP.tokenMs || now < p.t - 5000) return { ok: false, code: 'exp', net, k: p.k };
  if (p.n !== net || p.u !== (await uaHash(o.ua))) return { ok: false, code: 'bad', net, k: p.k };
  if ((await o.once(`n:${p.r}`, Math.ceil((p.t + CAP.tokenMs) / 1000) + 60)) !== 1) return { ok: false, code: 'no', net, k: p.k };
  const T = await openAnswer(o.secret, p.w, p.a);
  if (!T) return { ok: false, code: 'bad', net, k: p.k };
  return judge(T, o.body, p.t, now) ? { ok: true, code: 'ok', net, k: p.k } : { ok: false, code: 'no', net, k: p.k };
}

/** 通行证 Set-Cookie(8 小时,IP 段放宽到 v4 /16、v6 /48:国内手机 CGNAT 出口常换) */
export async function passCookie(secret: string, ip: string, ua: string, now = Date.now()): Promise<string> {
  const v = await seal(secret, 'pass', { v: 1, t: now, e: now + CAP.passMs, n: ipNet(ip, 16, 48), u: await uaHash(ua) } satisfies Pass);
  return `${PASS_COOKIE}=${v}; Path=/; Max-Age=${CAP.passMs / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

/** 受保护动作调用:有没有有效通行证。fresh(秒):只认这么多秒内签发的(账号异常时强制刚做过题) */
export async function verifyPass(request: Request, env: any, opt: { fresh?: number; now?: number } = {}): Promise<boolean> {
  const secret = String(env?.CAP_SECRET ?? '');
  const raw = new RegExp(`(?:^|;\\s*)${PASS_COOKIE}=([^;]+)`).exec(request.headers.get('cookie') || '')?.[1];
  if (!secret || !raw) return false;
  const p = await unseal<Pass>(secret, 'pass', raw);
  const now = opt.now ?? Date.now();
  if (!p || p.v !== 1 || now > p.e || now < p.t - 5000) return false;
  if (opt.fresh && now - p.t > opt.fresh * 1000) return false;
  return p.n === ipNet(request.headers.get('cf-connecting-ip') || '', 16, 48) && p.u === (await uaHash(request.headers.get('user-agent') || ''));
}
