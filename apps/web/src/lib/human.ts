/**
 * 询盘 / 简报 / 留资接口的人机校验(2026-09-24 W1b)。
 * 09-23 21:5x 实测:原来只在「带了令牌」时才校验,不带令牌直接放行 —— 等于没挡。现在:
 *   · 配了 TURNSTILE_SECRET:缺令牌、令牌无效一律 400;
 *   · 没配 secret = 未启用,放行(配置问题不该挡住所有真实询盘);
 *   · siteverify 本身连不上时放行(攻击者造不出这种情况,不可误杀线索)。
 * 不传 remoteip:后台登录 09-02 实锤,走代理换出口 IP 会误判。
 * 前端组件由 BaseLayout 统一注入到 action 指向这些接口的表单里。
 *
 * RFQ E2E 旁路(默认关,只认测试钥请求头,不当公网开关):
 *   Worker 未设 RFQ_E2E_BYPASS_TOKEN、或值为空白 → 与现网一样强制 Turnstile。
 *   只有请求头 X-Bohui-E2E-Token 与该 secret 去掉首尾空白后常数时间全等,才跳过这一道。
 *   不读 body / query。空头、错头、只写了前缀,一律不放行。
 *   频控、必填、合规闸、无自动报价都不在这里放行。登录与简报不要走 humanGateUnlessE2e。
 * 密钥用 wrangler secret put RFQ_E2E_BYPASS_TOKEN 注入,禁止写进仓库或 [vars]。
 */
const MSG = '人机验证未完成,请返回上一页,等验证框显示通过后再提交。 / Human verification not completed — please go back, wait for the check to pass, then submit again.';

/** 常数时间比较。长度不同直接否;长度相同则逐字异或,比完再返回。空串由调用方拒绝。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 测试钥是否命中。true 才允许跳过 Turnstile。
 * 未设置、空白 secret、空头、不匹配 → false(空 token 永不放行)。只比较请求头,不看 body。
 */
export function rfqE2eBypass(env: { RFQ_E2E_BYPASS_TOKEN?: unknown } | null | undefined, header: string | null | undefined): boolean {
  const secret = typeof env?.RFQ_E2E_BYPASS_TOKEN === 'string' ? env.RFQ_E2E_BYPASS_TOKEN.trim() : '';
  const got = typeof header === 'string' ? header.trim() : '';
  if (!secret || !got) return false;
  return timingSafeEqual(got, secret);
}

/**
 * 询盘人机闸。E2E 头命中时直接通过(返回 null),且不再请求 siteverify;
 * 否则与 humanGate 完全一致。登录 / 简报不要调用本函数。
 */
export async function humanGateUnlessE2e(
  env: any,
  turnstileToken: string,
  e2eHeader: string | null | undefined,
  isForm: boolean,
  zhOnly = false,
): Promise<Response | null> {
  if (rfqE2eBypass(env, e2eHeader)) return null;
  return humanGate(env, turnstileToken, isForm, zhOnly);
}

/** 返回 null = 通过;否则直接把返回的 Response 交给客户端 */
export async function humanGate(env: any, token: string, isForm: boolean, zhOnly = false): Promise<Response | null> {
  const secret = String(env?.TURNSTILE_SECRET ?? '').trim();
  if (!secret) return null;
  if (token) {
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret, response: token }),
      });
      if ((await r.json() as { success?: boolean }).success) return null;
    } catch { return null; }
  }
  const msg = zhOnly ? MSG.split(' / ')[0] : MSG, back = zhOnly ? '← 返回' : '← 返回 / Back';
  return isForm
    ? new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>人机验证</title><p style="font:16px/1.6 system-ui;max-width:36rem;margin:3rem auto;padding:0 1rem">${msg}<br><a href="javascript:history.back()">${back}</a></p>`,
      { status: 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    : new Response(JSON.stringify({ ok: false, msg }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
