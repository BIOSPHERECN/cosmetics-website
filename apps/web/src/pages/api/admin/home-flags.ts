/**
 * BIOSPHERE 首页五块开关。员工会话（apiGuard）；绑定了别的站的账号 403。
 * GET 会在键不存在时写入种子（四块关、HERO_CARD 开），已有值不覆盖。
 * POST 只接受五键布尔。没绑 HOME_FLAGS 且不是本地 mock 时 503，并带回 wrangler 命令。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import {
  SHOW_HOME_KEYS,
  homeFlagsAllowMemory,
  homeFlagsCurl,
  resolveHomeFlagsKv,
  seedShowHome,
  writeShowHome,
  wranglerPutCommand,
  type ShowHomeFlags,
  type ShowHomeKey,
} from '../../../lib/show-home';

export const prerender = false;

function kvOf(request: Request) {
  const allow = homeFlagsAllowMemory(new URL(request.url).hostname, env as any);
  return resolveHomeFlagsKv(env as any, allow);
}

function biosphereOnly(c: { tenant: { isGroup: boolean; siteId: string } }): Response | null {
  if (c.tenant.isGroup || c.tenant.siteId === 'biosphere-ai') return null;
  return json({ ok: false, msg: '首页块开关只属于 BIOSPHERE' }, 403);
}

function payload(st: Awaited<ReturnType<typeof seedShowHome>>, writable: boolean) {
  return {
    ok: true,
    key: st.key,
    flags: st.flags,
    etag: st.etag,
    source: st.source,
    bound: st.bound,
    writable,
    cacheParam: `__hf=${st.etag}`,
    wrangler: wranglerPutCommand(),
    curl: homeFlagsCurl(),
  };
}

export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = biosphereOnly(c);
  if (deny) return deny;
  const kv = kvOf(request);
  const st = await seedShowHome(kv);
  return json(payload(st, !!kv));
};

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = biosphereOnly(c);
  if (deny) return deny;
  const kv = kvOf(request);
  if (!kv) {
    return json({
      ok: false,
      msg: 'HOME_FLAGS 未绑定。先建命名空间、把 id 写进 wrangler.toml 再部署；在此之前用下面的命令写入。',
      wrangler: wranglerPutCommand(),
      curl: homeFlagsCurl(),
    }, 503);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, msg: '需要 JSON 对象' }, 400);
  const patch: Partial<ShowHomeFlags> = {};
  let n = 0;
  for (const k of SHOW_HOME_KEYS) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== 'boolean') return json({ ok: false, msg: `${k} 只能是布尔` }, 400);
    patch[k as ShowHomeKey] = body[k] as boolean;
    n++;
  }
  if (!n) return json({ ok: false, msg: '至少给一个开关：TRUST / COSMOPACK / HOT_SHELF / SHOWCASE / HERO_CARD' }, 400);

  const before = await seedShowHome(kv);
  const st = await writeShowHome(kv, patch);
  try {
    await logRevision(c.db, 'home_flags', 'biosphere-ai', null, before.flags, st.flags, c.sess.uid);
  } catch { /* 修订表写失败不影响开关本身 */ }
  return json(payload(st, true));
};
