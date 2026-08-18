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

// 与 packages/core/src/i18n 的 LOCALES 一一对应(36 语)。
// 中间件跑在请求最前面,不能 import 组件包 —— 所以这里是复制的一份,
// 由 tools/gen-i18n.mjs 从 tools/locales.json 同步生成,不手抄。
const LOCALES = [
  'en',
  'zh-cn',
  'ja',
  'ko',
  'id',
  'ms',
  'th',
  'vi',
  'hi',
  'bn',
  'tl',
  'ur',
  'pa',
  'te',
  'ta',
  'mr',
  'gu',
  'jv',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'sv',
  'da',
  'fi',
  'no',
  'cs',
  'el',
  'hu',
  'ro',
  'uk',
  'ru',
  'pt-br',
  'es-mx',
  'ar',
  'tr',
  'fa',
  'he',
  'sw',
  'ha',
  'am',
  'kk',
  'uz',
] as const;
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
  iw: 'he', ph: 'tl', fil: 'tl', se: 'sv', dk: 'da',
  nb: 'no', nn: 'no', sk: 'cs', br: 'pt-br', mx: 'es-mx',
  'en-us': 'en', 'en-gb': 'en',
  'fr-fr': 'fr',
};

/** 国家 → 语言。只列有把握的;多语并存的国家(比利时/瑞士/加拿大/印度英语区)
 *  故意不列 —— 按国家硬判会得罪一半人,交给 Accept-Language 更准。 */
const BY_COUNTRY: Record<string, L> = {
  AE: 'ar', AF: 'fa', AO: 'pt', AR: 'es-mx', AT: 'de', BD: 'bn',
  BF: 'fr', BH: 'ar', BJ: 'fr', BN: 'ms', BO: 'es-mx', BR: 'pt-br',
  BY: 'ru', CD: 'fr', CG: 'fr', CI: 'fr', CL: 'es-mx', CM: 'fr',
  CN: 'zh-cn', CO: 'es-mx', CR: 'es-mx', CU: 'es-mx', CV: 'pt', CY: 'el',
  CZ: 'cs', DE: 'de', DJ: 'fr', DK: 'da', DO: 'es-mx', DZ: 'ar',
  EC: 'es-mx', EG: 'ar', ES: 'es', FI: 'fi', FR: 'fr', GA: 'fr',
  GN: 'fr', GR: 'el', GT: 'es-mx', HK: 'zh-cn', HN: 'es-mx', HU: 'hu',
  ID: 'id', IL: 'he', IN: 'hi', IQ: 'ar', IR: 'fa', IT: 'it',
  JO: 'ar', JP: 'ja', KE: 'sw', KP: 'ko', KR: 'ko', KW: 'ar',
  KZ: 'kk', LB: 'ar', LY: 'ar', MA: 'ar', MC: 'fr', MD: 'ro',
  MG: 'fr', ML: 'fr', MO: 'zh-cn', MR: 'ar', MX: 'es-mx', MY: 'ms',
  MZ: 'pt', NE: 'fr', NI: 'es-mx', NL: 'nl', NO: 'no', OM: 'ar',
  PA: 'es-mx', PE: 'es-mx', PH: 'tl', PL: 'pl', PS: 'ar', PT: 'pt',
  PY: 'es-mx', QA: 'ar', RO: 'ro', RU: 'ru', RW: 'sw', SA: 'ar',
  SD: 'ar', SE: 'sv', SG: 'zh-cn', SK: 'cs', SM: 'it', SN: 'fr',
  SV: 'es-mx', SY: 'ar', TD: 'fr', TG: 'fr', TH: 'th', TN: 'ar',
  TR: 'tr', TW: 'zh-cn', TZ: 'sw', UA: 'uk', UG: 'sw', UY: 'es-mx',
  VA: 'it', VE: 'es-mx', VN: 'vi', YE: 'ar',
};

/**
 * Accept-Language 里挑第一个我们支持的。
 * 前缀表按长度倒序匹配 —— pt-BR 必须压过 pt,否则巴西访客会被送去葡萄牙版;
 * 同理 es-MX 压过 es。这一条在只有三种语言时不存在,语种一多就必须显式处理。
 */
const PREFIX: [string, L][] = [
  ['es-419', 'es-mx'],
  ['pt-br', 'pt-br'],
  ['es-mx', 'es-mx'],
  ['fil', 'tl'],
  ['zh', 'zh-cn'],
  ['ja', 'ja'],
  ['ko', 'ko'],
  ['id', 'id'],
  ['in', 'id'],
  ['ms', 'ms'],
  ['th', 'th'],
  ['vi', 'vi'],
  ['hi', 'hi'],
  ['bn', 'bn'],
  ['tl', 'tl'],
  ['pt', 'pt'],
  ['es', 'es'],
  ['fr', 'fr'],
  ['de', 'de'],
  ['it', 'it'],
  ['nl', 'nl'],
  ['pl', 'pl'],
  ['sv', 'sv'],
  ['da', 'da'],
  ['fi', 'fi'],
  ['nb', 'no'],
  ['nn', 'no'],
  ['no', 'no'],
  ['cs', 'cs'],
  ['sk', 'cs'],
  ['el', 'el'],
  ['hu', 'hu'],
  ['ro', 'ro'],
  ['uk', 'uk'],
  ['ru', 'ru'],
  ['kk', 'kk'],
  ['ar', 'ar'],
  ['tr', 'tr'],
  ['fa', 'fa'],
  ['he', 'he'],
  ['iw', 'he'],
  ['sw', 'sw'],
  ['en', 'en'],
];

function fromHeader(h: string | null): L | null {
  if (!h) return null;
  const tags = h.split(',').map((p) => {
    const [tag, q] = p.trim().split(';q=');
    return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    for (const [pre, loc] of PREFIX) if (tag === pre || tag.startsWith(pre + '-')) return loc;
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
