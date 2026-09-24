/**
 * 询盘 / 简报 / 留资接口的人机校验(2026-09-24 W1b)。
 * 09-23 21:5x 实测:原来只在「带了令牌」时才校验,不带令牌直接放行 —— 等于没挡。现在:
 *   · 配了 TURNSTILE_SECRET:缺令牌、令牌无效一律 400;
 *   · 没配 secret = 未启用,放行(配置问题不该挡住所有真实询盘);
 *   · siteverify 本身连不上时放行(攻击者造不出这种情况,不可误杀线索)。
 * 不传 remoteip:后台登录 09-02 实锤,走代理换出口 IP 会误判。
 * 前端组件由 BaseLayout 统一注入到 action 指向这些接口的表单里。
 */
const MSG = '人机验证未完成,请返回上一页,等验证框显示通过后再提交。 / Human verification not completed — please go back, wait for the check to pass, then submit again.';

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
