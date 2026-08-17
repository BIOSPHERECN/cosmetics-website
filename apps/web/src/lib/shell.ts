/**
 * 独立前台页(不由 D1 渲染内容,但要套全站外壳)取上下文用。
 *
 * 为什么抽出来:AI 肌肤检测与 AI 共创这两页的**内容**是写死在组件里的,
 * 不走 pages/blocks 那套数据驱动渲染;但它们仍然是这个站的页面,
 * 必须有同一个页头、同一套导航、同一个页脚 —— 否则点进去像掉到别人网站上。
 *
 * 我第一版就是各自写了一整套 <html>,结果两页没有导航、和全站脱节。
 * 凡是「前台页面」,外壳就该来自同一处,这个函数就是那一处。
 */
import { getSiteByHost, getSiteById, getNav, isLang, DEFAULT_LANG, type Lang } from './db';
import { getVariant, getSite as getStaticSite } from '@cosmetic/core/registry';

export async function pageShell(db: D1Database | undefined, url: URL, langParam?: string) {
  const lang: Lang = (langParam && isLang(langParam) ? langParam : DEFAULT_LANG) as Lang;
  const override = url.searchParams.get('site');

  let site: any = null;
  if (db) {
    try {
      site = override
        ? await getSiteById(db, override, lang)
        : (await getSiteByHost(db, url.hostname, lang)) ?? (await getSiteById(db, 'beauty2oem', lang));
    } catch { site = null; }
  }

  const staticSite = site ? (() => { try { return getStaticSite(site.id); } catch { return null; } })() : null;
  const variant = staticSite && site ? getVariant(staticSite, site.variant) : null;
  const nav = db && site ? await getNav(db, site.id, lang).catch(() => []) : [];

  return {
    lang, site, staticSite, variant, nav,
    email: `inquiry@${site?.domain ?? 'bohui.group'}`,
  };
}
