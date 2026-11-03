/**
 * 自家点选码 · 交卷(安全架构 v1 L3,两站字节一致)。
 * POST JSON {t, c:[[x, y, 距上一击毫秒]×3], m:[每击之前的 pointermove 次数], pt:'mouse'|'touch'|'pen'|'key', tr:全部 isTrusted}
 *
 * 判题全在 lib/captcha.ts(纯计算)。这里只做两件有状态的事,都是 D1 一条原子 upsert(表 cap_seen,每次交卷最多写 2 行):
 *   ① 令牌 nonce 只能交一次(n > 1 即重放,按答错处理)——纯签名挡不住同一张令牌 2 分钟内并发猜 60 种排列;
 *   ② 答错时按「IP 段 × 小时」计数,满 6 次在 Cache API 记 10 分钟冷却,出题接口回 429。
 * 答对:下发 8 小时通行证 cookie(HttpOnly),受保护动作用 verifyPass() 验签。
 * AE(PULSE)记 sec:cap_pass / sec:cap_fail / sec:cap_limit,只记事件、用途与 IP 段,不记完整 IP 与 UA。
 * 失败只回「不对 / 过期 / 太频繁」,不说哪条没过;没配 CAP_SECRET 或没有库一律 503,不放行(fail closed)。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CAP, CAP_ONCE_SQL, CAP_SWEEP_SQL, checkAnswer, ipNet, passCookie } from '../../../lib/captcha';

export const prerender = false;
const json = (b: unknown, s = 200, cookie?: string) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const E = env as any, secret = String(E.CAP_SECRET ?? ''), db = E.DB as D1Database | undefined;
  if (!secret || !db) return json({ ok: false, code: 'off' }, 503);
  const raw = await request.text().catch(() => '');
  if (raw.length > 4096) return json({ ok: false, code: 'bad' }, 413);
  let b: any;
  try { b = JSON.parse(raw); } catch { return json({ ok: false, code: 'bad' }, 400); }
  if (!b || typeof b !== 'object') return json({ ok: false, code: 'bad' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || '', ua = request.headers.get('user-agent') || '';
  /* 冷却中的 IP 段直接 429,不碰 D1:乱交的请求每 10 分钟最多换来约 6 次库写入 */
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const coolKey = `https://cap.internal/cool/${encodeURIComponent(ipNet(ip, 24, 64))}`;
  if (await cache?.match(coolKey)) return json({ ok: false, code: 'limit' }, 429);
  const once = async (k: string, exp: number) => Number((await db.prepare(CAP_ONCE_SQL).bind(k, exp).first<{ n: number }>())?.n ?? 0);
  let v;
  try { v = await checkAnswer({ secret, t: String(b.t ?? ''), body: b, ip, ua, once }); } catch { return json({ ok: false, code: 'off' }, 503); }

  const ctx = (locals as any)?.cfContext;
  const later = (p: Promise<unknown>) => { const q = p.catch(() => {}); if (ctx?.waitUntil) ctx.waitUntil(q); };
  const ev = (e: string) => { try { E.PULSE?.writeDataPoint({ indexes: ['sec'], blobs: [`sec:${e}`, v.k, v.net], doubles: [1] }); } catch { /* 打点失败不影响判题 */ } };
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 3) later(db.prepare(CAP_SWEEP_SQL).bind(Math.floor(Date.now() / 1000)).run());   // 约 1% 顺带清过期行

  if (v.ok) {
    ev('cap_pass');
    return json({ ok: true }, 200, await passCookie(secret, ip, ua));
  }
  ev('cap_fail');
  const hour = Math.floor(Date.now() / 3600_000);
  const n = await once(`f:${v.net}:${hour}`, (hour + 2) * 3600).catch(() => 0);
  if (n >= CAP.failLimit) {
    ev('cap_limit');
    if (cache) later(cache.put(coolKey, new Response('1', { headers: { 'cache-control': `max-age=${CAP.coolSec}` } })));
    return json({ ok: false, code: 'limit' }, 429);
  }
  return json({ ok: false, code: v.code === 'exp' ? 'exp' : 'no' }, 403);
};
