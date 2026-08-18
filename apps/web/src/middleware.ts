/**
 * 按访客地区自动选语言。
 *
 * 三条判据,按可信度排序:
 *  ① 访客手动选过语言(cookie)→ 永远尊重,绝不再自动跳。
 *     这一条排第一是有原因的:自动跳最烦人的形态就是「我选了英文,你又给我跳回中文」。
 *  ② 浏览器的 Accept-Language —— 这是访客自己设的,比 IP 准。
 *  ③ Cloudflare 给的国家码(request.cf.country)—— 出国旅行、用代理时会不准,所以垫底。
 *
 * 只在**没有语言前缀**的路径上跳(如 `/`),已经带前缀的一律不动 ——
 * 否则分享出去的链接会在别人那里变成另一种语言,那比不跳更糟。
 * 用 302 不用 301:地区判断是会变的,不该被浏览器永久缓存。
 */
import { defineMiddleware } from 'astro:middleware';

const LOCALES = ['zh-cn', 'en', 'ja'] as const;
type L = (typeof LOCALES)[number];
const DEFAULT: L = 'en'; // 兜底用英文:这是外贸站,判不出来时按海外访客处理

/** 国家 → 语言。只列有把握的,其余走英文 */
const BY_COUNTRY: Record<string, L> = {
  CN: 'zh-cn', HK: 'zh-cn', MO: 'zh-cn', TW: 'zh-cn', SG: 'zh-cn',
  JP: 'ja',
};

/** Accept-Language 里挑第一个我们支持的 */
function fromHeader(h: string | null): L | null {
  if (!h) return null;
  const tags = h.split(',').map((p) => {
    const [tag, q] = p.trim().split(';q=');
    return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (tag.startsWith('zh')) return 'zh-cn';   // 繁简都归简中(繁体已下线)
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('en')) return 'en';
  }
  return null;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;

  // 只管没有语言前缀的页面路径;接口、静态资源、后台一律放过
  const first = pathname.split('/').filter(Boolean)[0];
  const isPage = !pathname.startsWith('/api/')
    && !pathname.startsWith('/media/')
    && !pathname.startsWith('/bohui/')
    && !pathname.startsWith('/_')
    && !/\.\w{2,5}$/.test(pathname);
  if (!isPage || (first && (LOCALES as readonly string[]).includes(first))) return next();

  // ① 手动选过就永远尊重
  const cookie = ctx.request.headers.get('cookie') ?? '';
  const saved = /(?:^|;\s*)bohui_lang=([\w-]+)/.exec(cookie)?.[1] as L | undefined;

  // ② 浏览器语言 → ③ 国家码 → 兜底
  const country = (ctx.request as any).cf?.country as string | undefined;
  const lang: L = (saved && (LOCALES as readonly string[]).includes(saved) ? saved : null)
    ?? fromHeader(ctx.request.headers.get('accept-language'))
    ?? (country ? BY_COUNTRY[country] : undefined)
    ?? DEFAULT;

  const rest = pathname === '/' ? '' : pathname.replace(/^\//, '');
  return ctx.redirect(`/${lang}/${rest}${search}`, 302);
});
