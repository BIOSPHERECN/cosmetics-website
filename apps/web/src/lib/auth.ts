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

const ITER = 210_000;
const SESSION_HOURS = 12;

const te = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** 常数时间比较 —— 长度不同直接判否,长度相同则全程比完再返回 */
function timingSafeEqual(a: string, b: string): boolean {
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

export async function issueSession(user: { id: number; email: string; role: string }, secret: string): Promise<string> {
  const s: Session = {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600,
  };
  const body = b64u(te.encode(JSON.stringify(s)));
  return `${body}.${await sign(body, secret)}`;
}

/** 校验会话。签名不符或已过期一律返回 null —— 调用方只需判空 */
export async function readSession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!timingSafeEqual(sig, await sign(body, secret))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(body))) as Session;
    return s.exp > Math.floor(Date.now() / 1000) ? s : null;
  } catch {
    return null;
  }
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
