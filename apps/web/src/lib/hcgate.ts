/**
 * 点选码(安全架构 v1 L3 / 清单 C8)接入点公用判定(2026-09-24)。两站字节一致。
 * 纯计算:不碰 D1、KV、网络;通行证验签在 lib/captcha.ts 的 verifyPass。
 *
 * 用法(登录发信前、简报提交前):
 *   const mode = humanMode(env, force);
 *   const human = mode === 'cap' ? await capFail(request, env) : isProbe(request) ? null : await turnstileFail(...);
 *   if (isProbe(request)) return probeResp(human);   // 前端提交前的探测,只回 204 / 428,不做任何动作
 *   if (human) return fail(human, ...);
 */
import { verifyPass } from './captcha.ts';   // 带扩展名:hcgate.test.ts 用 node 直接跑

/** 人机校验走哪条。HUMAN_GATE=turnstile 是两周回滚开关;没设时配了 CAP_SECRET 才走点选码,没配仍走 Turnstile
 *  (先上代码、后建 KV 和密钥,这段时间也不开口子)。force:该站 Turnstile 用不了(beauty2oem 没授权域名),只走点选码 */
export const humanMode = (env: any, force = false): 'cap' | 'turnstile' =>
  force || env?.HUMAN_GATE === 'cap' || (env?.HUMAN_GATE !== 'turnstile' && !!env?.CAP_SECRET) ? 'cap' : 'turnstile';

/** null = 有有效通行证;'cap' = 要做题;'cap-fresh' = 账号异常,只认 10 分钟内刚做过的;'human-off' = 没配密钥(fail closed) */
export async function capFail(request: Request, env: any, fresh = false): Promise<string | null> {
  if (!env?.CAP_SECRET) return 'human-off';
  return (await verifyPass(request, env, fresh ? { fresh: 600 } : {})) ? null : fresh ? 'cap-fresh' : 'cap';
}

/** 前端 HumanForm 提交前发的探测请求(同源、带头 x-hc: probe) */
export const isProbe = (request: Request): boolean => request.headers.get('x-hc') === 'probe';

/** 探测的回答:要做题 428,其余 204(没配密钥、表单填错等交给正式提交去报人话) */
export const probeResp = (code: string | null): Response =>
  new Response(null, { status: code === 'cap' || code === 'cap-fresh' ? 428 : 204, headers: { 'cache-control': 'no-store' } });

/* 云机房出口:与边缘规则 S2 同一份 ASN(Cloudflare、AWS、GCP、Azure、阿里、腾讯、华为、DO、OVH、Hetzner 等) */
const CLOUD_ASN = new Set([13335, 16509, 14618, 15169, 396982, 8075, 45102, 37963, 132203, 45090, 136907, 55990, 14061, 16276,
  24940, 63949, 20473, 31898, 212238, 9009, 60068, 51167, 12876, 36352, 53667, 35916, 46844, 396356]);
const HEADLESS = /HeadlessChrome|PhantomJS|Playwright|Puppeteer|Selenium|webdriver/i;

/** 可疑会员(L2 第 4 条的先行版):云机房出口或无头浏览器。
 *  ponytail: 「当天 ASN ≥ 4、10 分钟新条目 ≥ 10」要 mb_views 加列并改两站 quota.ts(清单 C9),到时在这里并上 */
export const suspect = (request: Request): boolean =>
  CLOUD_ASN.has(Number((request as any).cf?.asn)) || HEADLESS.test(request.headers.get('user-agent') || '');
