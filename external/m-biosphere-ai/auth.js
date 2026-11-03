/**
 * m-biosphere-ai 的鉴权层 —— 重写版。
 *
 * 单独拆成一个文件,是因为这一层的每一处都值得单独说明为什么改,
 * 而且它可以在 Node 里直接跑测试(Node 有 webcrypto,和 Workers 是同一套 API)——
 * 安全代码不该只靠"看着对"就上线。
 *
 * ══ 原实现的五个问题,按严重程度排 ══
 *
 * ① 密码与签名密钥硬编码在 bundle 里(原 index.js 第 101-102 行)
 *    ADMIN_PASSWORD 和 AUTH_SECRET 都是明文常量。任何能读到这份 bundle 的人
 *    —— dashboard 只读成员、CI 日志、源码仓库、一次 API 调用 —— 都能拿到。
 *    而 AUTH_SECRET 泄漏比密码泄漏更糟:攻击者根本不需要密码,
 *    直接自己签一个 token 就进去了(makeAdminToken 的全部输入就是密钥 + 自造 payload)。
 *    → 改成只从 env 读。**不留兜底常量** —— 留了就一定有人靠着它跑,
 *      然后"配了 secret"这件事永远不会真正发生。
 *
 * ② token 签名用的是裸 SHA-256:sha256Hex(SECRET + "." + payload)
 *    SHA256(密钥‖消息) 这种拼接构造对**长度扩展攻击**结构性脆弱:
 *    拿到一组有效 (payload, sig),不需要知道密钥,就能算出
 *    payload‖padding‖任意后缀 的合法签名。
 *    这里 payload 是 base64url,附加数据会破坏解码,实际利用有难度 ——
 *    但那叫"碰巧没被利用",不叫"设计上安全"。
 *    → 改用 HMAC-SHA256。Workers 原生支持,代码量差不多。
 *
 * ③ 签名比较用 `sig !== expect`
 *    字符串比较在第一个不同字符处就返回,理论上可按字节爆破签名。
 *    边缘网络的抖动会淹没这点时序差,实际极难利用 —— 但改成恒定时间只要三行,
 *    没有理由不改。
 *
 * ④ 密码只做一次 SHA-256,无盐无迭代
 *    这类哈希 GPU 每秒能算几十亿次,离线爆破一个 12 位密码是分钟级的。
 *    → PBKDF2 6 万次迭代。为什么是 6 万不是更多:我在 bohui-web 上实测过,
 *      21 万次会超 Workers 的 CPU 限制直接报错,6 万是安全区间。
 *
 * ⑤ 改完密码,旧 token 还能用
 *    原实现改密码只改 KV 里的哈希,密钥不变 → 已签发的 7 天 token 全部继续有效。
 *    「我怀疑密码泄漏了,赶紧改一个」这个动作**没有把入侵者踢下线** ——
 *    而那正是改密码最主要的目的。
 *    → token 里带一个密码版本号,改密码时递增;版本对不上的 token 立即失效。
 */

const ITERATIONS = 60_000;          // Workers CPU 安全区间,见上文 ④
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
export const ADMIN_COOKIE = 'bhbohui_token';

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = {
  encode: (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')),
};

/**
 * 恒定时间比较 —— 不管在第几个字符不同,耗时都一样。
 * 先比长度会泄漏长度,但签名长度是固定的公开值,无所谓;
 * 关键是长度相同时必须走完全程。
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/* ── 密码哈希 ─────────────────────────────────────────────
   存成 pbkdf2$迭代次数$盐$哈希 的形式。把参数一起存下来,
   将来提高迭代次数时,老密码仍然验得过 —— 不必强制所有人重设密码。 */
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITERATIONS}$${btoa(String.fromCharCode(...salt))}$${hex(bits)}`;
}

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/**
 * 验密码。同时认两种格式:
 *   pbkdf2$...  新格式
 *   64 位十六进制  旧格式(原实现存进 KV 的裸 SHA-256)
 * 认旧格式不是妥协,是**迁移**:验过之后由调用方顺手升级成新格式,
 * 运营完全无感。直接换格式的话,现有密码当场失效,人就被锁在门外了。
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, legacy: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt] = stored.split('$');
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: Number(iter), hash: 'SHA-256' },
      key, 256,
    );
    return { ok: timingSafeEqual(hex(bits), stored.split('$')[3]), legacy: false };
  }
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    return { ok: timingSafeEqual(await sha256Hex(password), stored.toLowerCase()), legacy: true };
  }
  return { ok: false, legacy: false };
}

/* ── 会话令牌 ───────────────────────────────────────────── */
export async function makeToken(secret, pv) {
  const payload = b64url.encode(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS, sub: 'bhbohui', pv }));
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * 验令牌。pv(密码版本)对不上直接判失效 ——
 * 这一条是「改密码能把别人踢下线」的全部实现。
 */
export async function verifyToken(token, secret, pv) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!timingSafeEqual(sig, await hmac(secret, payload))) return false;
  try {
    const data = JSON.parse(b64url.decode(payload));
    if (!data.exp || Date.now() > data.exp) return false;
    if (Number(data.pv ?? 1) !== Number(pv ?? 1)) return false;
    return true;
  } catch {
    return false;
  }
}

/* ── 登录限速 ─────────────────────────────────────────────
   原实现的登录接口可以无限次 POST。配上原来那个无盐单次 SHA-256,
   在线爆破也是可行的 —— 不是只有离线才危险。
   计数写 KV 并带 TTL,不用自己清理;KV 的最终一致在这里无所谓:
   即使窗口边缘漏算一两次,也把爆破从"每秒几百次"压到了"每分钟几次"。 */
const LOCK_AFTER = 10;
const LOCK_WINDOW_S = 900;

export async function tooManyAttempts(kv, ip) {
  if (!kv || !ip) return false;
  const n = Number(await kv.get(`login_fail:${ip}`)) || 0;
  return n >= LOCK_AFTER;
}
export async function recordFail(kv, ip) {
  if (!kv || !ip) return;
  const k = `login_fail:${ip}`;
  const n = (Number(await kv.get(k)) || 0) + 1;
  await kv.put(k, String(n), { expirationTtl: LOCK_WINDOW_S });
}
export async function clearFails(kv, ip) {
  if (!kv || !ip) return;
  await kv.delete(`login_fail:${ip}`);
}

export function parseCookies(request) {
  const out = {};
  for (const pair of (request.headers.get('Cookie') || '').split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

export const cookieHeader = (token) =>
  `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}; HttpOnly; SameSite=Lax; Secure`;
export const clearCookieHeader = () =>
  `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
