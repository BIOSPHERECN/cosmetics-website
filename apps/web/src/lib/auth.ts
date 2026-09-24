/**
 * 后台身份与会话
 * ═══════════════════════════════════════════════════════════════════
 * 设计取舍:
 * - 口令用 PBKDF2-SHA256 派生,**库里绝不存明文**。迭代 21 万次是 OWASP 当前建议档,
 *   在 Worker 上单次约几十毫秒,登录可接受,离线爆破则昂贵。
 * - 会话用**签名 cookie**而非在库里建 session 表:Worker 无状态,少一次 D1 往返;
 *   要强制下线时改 AUTH_SECRET 即可让所有已发 cookie 失效。
 * - 比较签名用**常数时间**比较,避免按字节提前返回泄露信息。
 */

/**
 * PBKDF2 迭代次数。
 *
 * OWASP 对服务器场景建议 21 万次,我最初照抄了 —— 那是错的:
 * Cloudflare Worker 每请求有 CPU 时间上限,21 万次会把 Worker 跑爆,
 * 进程被杀后返回的不是 JSON,前端只能看到"请求失败",极难排查。
 *
 * 6 万次是在 Worker CPU 预算内、且离线爆破成本仍然可观的折中。
 * 真正的防线是登录限流(同 IP 15 分钟 8 次),而不是把单次哈希拉到极限。
 */
const ITER = 60_000;
const SESSION_HOURS = 12;

const te = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** 常数时间比较 —— 长度不同直接判否,长度相同则全程比完再返回。
 *  导出给 CRON_KEY 这类共享密钥的比较用(09-24 暴露面自查 L3:`!==` 按字节提前返回) */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' },
    key,
    256,
  );
  return { hash: b64u(bits), salt: saltB64 ?? b64u(salt) };
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return timingSafeEqual(hash, storedHash);
}

export interface Session {
  uid: number;
  email: string;
  role: string;
  exp: number;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, te.encode(payload)));
}

/** hours:后台会话默认 12 小时;网站会员 30 天、登录邮件里的魔法链接 30 分钟(lib/member.ts) */
export async function issueSession(user: { id: number; email: string; role: string }, secret: string, hours = SESSION_HOURS): Promise<string> {
  const s: Session = {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + Math.round(hours * 3600),
  };
  const body = b64u(te.encode(JSON.stringify(s)));
  return `${body}.${await sign(body, secret)}`;
}

/** 校验会话。签名不符或已过期一律返回 null —— 调用方只需判空 */
export async function readSession(token: string | undefined, secret: string): Promise<Session | null> {
  /* 密钥为空一律不认(09-24 代码审计 P2-1):空密钥签出的会话谁都能伪造 */
  if (!token || !secret || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!timingSafeEqual(sig, await sign(body, secret))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(body))) as Session;
    return s.exp > Math.floor(Date.now() / 1000) ? s : null;
  } catch {
    return null;
  }
}

/* ── 两步验证(TOTP,RFC 6238)────────────────────────────────
 * 标准 30 秒窗 + SHA-1 + 6 位,和 Google Authenticator / Microsoft
 * Authenticator / 1Password 全兼容。密钥 Base32 存库(它本身就是
 * 「第二因素」,不是口令,无需再哈希 —— 哈希了就没法算码了)。
 * 校验允许 ±1 个时间窗:手机时钟差半分钟不该把人挡在门外。 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function totpNewSecret(): string {
  const raw = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, val = 0, out = '';
  for (const b of raw) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function b32decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0, val = 0;
  for (const ch of clean) {
    val = (val << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b32decode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg as BufferSource));
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

export async function totpVerify(secret: string, code: string): Promise<boolean> {
  const c = code.replace(/\D/g, '');
  if (c.length !== 6 || !secret) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const w of [0, -1, 1]) {
    if (timingSafeEqual(await totpAt(secret, now + w), c)) return true;
  }
  return false;
}

export const COOKIE = 'bohui_sess';

/** HttpOnly 阻断脚本读取;SameSite=Lax 挡住跨站 POST(后台是同站操作,够用且不影响体验) */
export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/**
 * 登录限流:同一 IP 连续失败达阈值即暂时拒绝。
 * 用 D1 而非内存计数 —— Worker 实例会被回收,内存计数形同虚设。
 */
export async function tooManyAttempts(db: D1Database, ip: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM revisions
        WHERE entity = 'login_fail' AND entity_id = ?
          AND created_at > datetime('now', '-15 minutes')`,
    )
    .bind(ip)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= 8;
}

export async function recordLoginFail(db: D1Database, ip: string): Promise<void> {
  await db
    .prepare(`INSERT INTO revisions (entity, entity_id, after_json) VALUES ('login_fail', ?, '{}')`)
    .bind(ip)
    .run();
}
