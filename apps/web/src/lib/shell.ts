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
import { siteIdForHost } from '@cosmetic/core/content/tenant-map.ts';
import { getSiteByHost, getSiteById, getNav, isLang, DEFAULT_LANG, type Lang } from './db';
import { getVariant, getSite as getStaticSite } from '@cosmetic/core/registry';

export async function pageShell(
  db: D1Database | undefined,
  url: URL,
  langParam?: string,
  /** 预览域名下的站点记忆。传 Astro.cookies 即可;线上有真域名时用不到 */
  cookies?: { get(name: string): { value: string } | undefined },
) {
  const lang: Lang = (langParam && isLang(langParam) ? langParam : DEFAULT_LANG) as Lang;
  // 必须和 [...path].astro 用同一套规则,否则会出现「首页是 A 站、AI 页是 B 站」这种分裂:
  // 域名优先(线上唯一依据)→ ?site= → cookie(预览域名用)→ 兜底
  const override = url.searchParams.get('site') ?? cookies?.get('bohui_site')?.value ?? null;

  let site: any = null;
  if (db) {
    try {
      /* 兜底只能按域名回到**本站**,绝不能硬编码成另一个站。
         2026-09-07:这一行原来写着 getSiteById(db, 'beauty2oem', lang),
         结果 zh-tw 上线当天 biosphere-ai.com 的标题变成了 BEAUTY2OEM。
         认不出域名就让 site 保持 null,由页面走降级渲染 ——
         少一块内容可以,挂别家招牌不行。 */
      const own = siteIdForHost(url.hostname);
      site = (await getSiteByHost(db, url.hostname, lang))
        ?? (override ? await getSiteById(db, override, lang) : null)
        ?? (own ? await getSiteById(db, own, lang) : null);
    } catch { site = null; }
  }

  const staticSite = site ? (() => { try { return getStaticSite(site.id); } catch { return null; } })() : null;
  const variant = staticSite && site ? getVariant(staticSite, site.variant) : null;
  const nav = db && site ? await getNav(db, site.id, lang).catch(() => []) : [];

  return {
    lang, site, staticSite, variant, nav,
    /* 联系邮箱从站点设置读(后台站点总览可改);空则回落 inquiry@域名 */
    email: site?.contact_email || `inquiry@${site?.domain ?? 'bohui.group'}`,
  };
}
