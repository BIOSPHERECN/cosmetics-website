/**
 * `/` 的语言选择(SEO-003)。
 *
 * x-default 是 /en/。没有语言偏好、以及搜索爬虫,都去英文,
 * 不再用 Cloudflare 国家码把 Googlebot 送到 /zh-cn/。
 * 浏览器自己带了 Accept-Language(例如 zh-CN)仍然按那个语言走。
 * 访客手动选过的 cookie 永远优先。
 */
export const SEARCH_CRAWLER = /Googlebot|Google-InspectionTool|Storebot-Google|bingbot|adidxbot|DuckDuckBot|YandexBot|Baiduspider|Applebot|Slurp/i;

export function isSearchCrawler(ua: string): boolean {
  return SEARCH_CRAWLER.test(ua || '');
}

export function pickRootLang<L extends string>(o: {
  saved: L | null;
  /** Accept-Language 里第一个我们支持的语言;没有则为 null */
  header: L | null;
  /** 国家码映射出的语言;没有则为 null */
  country: L | null;
  acceptLanguage: string | null;
  ua: string;
  /** x-default,本站是 en */
  fallback: L;
}): L {
  if (o.saved) return o.saved;
  /* 搜索爬虫跟 x-default,不跟出口 IP 所在国,也不跟代理塞进来的 Accept-Language。 */
  if (isSearchCrawler(o.ua)) return o.fallback;
  if (o.header) return o.header;
  /* 没有语言偏好:不用国家码。国家码正是「没带 Accept-Language 却进了 /zh-cn/」的原因。 */
  if (!(o.acceptLanguage ?? '').trim()) return o.fallback;
  return o.country ?? o.fallback;
}
