import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

/**
 * 浏览器信标 —— 只有真人的浏览器会执行页面里的 JS 打到这里,爬虫(含伪装成 Chrome、带 accept-language 的分布式抓取)不会。
 *
 * 由来:2026-09-15 创始人问「怎么看有没有流量、怎么分真人和爬虫」。当天中间件按 UA + accept-language 判出的
 * 「human」有 4,971 次,却是美/英/巴/加/墨/委/约/土八国齐刷刷扫配方与原料页 —— 那是住宅代理跑的抓取器,不是客户。
 * 服务端靠请求头永远分不干净;能执行 JS 才是浏览器,这一条才是硬口径。记成 human:js,与中间件的 human 并列,
 * 以后看真人只看 human:js。
 *
 * 不记 UA、不记 IP、不种 cookie;只记语种/版块/路径/国家四个维度,与中间件同一套 blobs。
 */
export const prerender = false;

const SECTION = (p: string) => { const seg = p.split('/').filter(Boolean); return { lang: /^[a-z]{2}(-[a-z]{2})?$/.test(seg[0] ?? '') ? seg[0] : '-', section: seg[1] ?? 'home' }; };

export const POST: APIRoute = async ({ request }) => {
  const ae = (env as any).PULSE as { writeDataPoint: (d: unknown) => void } | undefined;
  try {
    const path = String(new URL(request.url).searchParams.get('p') || '/').slice(0, 96);
    if (!path.startsWith('/') || path.startsWith('/bohui') || path.startsWith('/api')) return new Response(null, { status: 204 });
    const { lang, section } = SECTION(path);
    ae?.writeDataPoint({ blobs: ['human:js', lang, section, path, (request as any).cf?.country ?? '-'], doubles: [1], indexes: ['human:js'] });
  } catch { /* 打点失败不影响页面 */ }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
