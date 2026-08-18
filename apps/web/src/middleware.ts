/**
 * 按访客地区自动选语言 + 语言码别名跳转。
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

const LOCALES = ['zh-cn', 'en', 'ja', 'id', 'ms', 'fr'] as const;
type L = (typeof LOCALES)[number];
const DEFAULT: L = 'en'; // 兜底用英文:这是外贸站,判不出来时按海外访客处理

/**
 * 语言码别名 —— 手输错也能到,而不是吃一个 404。
 *
 * /jp/ 是最要紧的一条:日本的**国家**码是 JP,语言码却是 ja。
 * 界面上我们按创始人的要求写 JP,地址栏与 hreflang 必须写 ja(Google 只认语言码,
 * 写成 jp 会让整套 hreflang 失效)。别名把这道缝补上:两边都对,谁也不将就。
 *
 * in→id 是历史包袱:印尼语的旧码是 in,老设备、老 Java 系统至今还在发这个。
 * my→ms 有个前提要说清楚:my 其实是缅甸语的码,但我们不做缅甸语,
 * 而访客眼里 MY 就是马来西亚 —— 在不支持缅甸语的前提下这样映射是安全的;
 * 哪天真上缅甸语,这一行必须先删掉。
 */
const ALIAS: Record<string, L> = {
  jp: 'ja',
  zh: 'zh-cn', cn: 'zh-cn', 'zh-hans': 'zh-cn', 'zh-hant': 'zh-cn', 'zh-tw': 'zh-cn',
  in: 'id',
  my: 'ms',
  'en-us': 'en', 'en-gb': 'en',
  'fr-fr': 'fr',
};

/** 国家 → 语言。只列有把握的,其余走 Accept-Language 或英文 */
const BY_COUNTRY: Record<string, L> = {
  // 中文圈
  CN: 'zh-cn', HK: 'zh-cn', MO: 'zh-cn', TW: 'zh-cn', SG: 'zh-cn',
  JP: 'ja',
  ID: 'id',
  MY: 'ms', BN: 'ms',
  // 法语区:法国本土 + 摩纳哥 + 法语非洲(美妆贸易商基数不小的几个)
  FR: 'fr', MC: 'fr',
  SN: 'fr', CI: 'fr', CM: 'fr', ML: 'fr', BF: 'fr', NE: 'fr',
  TG: 'fr', BJ: 'fr', GA: 'fr', CG: 'fr', CD: 'fr', MG: 'fr', GN: 'fr',
  // 比利时/瑞士/加拿大/卢森堡故意不列:境内多语言并存,
  // 按国家硬判会得罪一半人,交给 Accept-Language 更准。
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
    if (tag.startsWith('id') || tag.startsWith('in')) return 'id'; // in 是印尼语的旧码
    if (tag.startsWith('ms')) return 'ms';
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return null;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;

  // 只管页面路径;接口、图片、后台、构建产物一律放过
  const isPage = !pathname.startsWith('/api/')
    && !pathname.startsWith('/media/')
    && !pathname.startsWith('/bohui/')
    && !pathname.startsWith('/_')
    && !/\.\w{2,5}$/.test(pathname);
  if (!isPage) return next();

  const segs = pathname.split('/').filter(Boolean);
  const first = (segs[0] ?? '').toLowerCase();

  // 已经是正规语言前缀 → 原样放行,一个字节都不动
  if ((LOCALES as readonly string[]).includes(first)) return next();

  // 别名前缀(/jp/、/zh/、/in/…)→ 换成正规码,后面的路径原样带过去
  if (ALIAS[first]) {
    const rest = segs.slice(1).join('/');
    return ctx.redirect(`/${ALIAS[first]}/${rest ? rest + '/' : ''}${search}`, 302);
  }

  // ① 手动选过就永远尊重
  const cookie = ctx.request.headers.get('cookie') ?? '';
  const saved = /(?:^|;\s*)bohui_lang=([\w-]+)/.exec(cookie)?.[1]?.toLowerCase();
  const savedL: L | null = saved
    ? ((LOCALES as readonly string[]).includes(saved) ? (saved as L) : (ALIAS[saved] ?? null))
    : null;

  // ② 浏览器语言 → ③ 国家码 → 兜底
  const country = (ctx.request as any).cf?.country as string | undefined;
  const lang: L = savedL
    ?? fromHeader(ctx.request.headers.get('accept-language'))
    ?? (country ? BY_COUNTRY[country] : undefined)
    ?? DEFAULT;

  const rest = pathname === '/' ? '' : pathname.replace(/^\//, '');
  return ctx.redirect(`/${lang}/${rest}${search}`, 302);
});
