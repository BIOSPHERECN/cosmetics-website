/**
 * 后台的站点作用域 —— 一域名一后台。
 *
 * 判定顺序:
 *  ① 账号绑定了站点 → 只能是那个站,URL 上写什么都没用(不能靠改地址栏越权);
 *  ② 账号是集团管理员(site_id 为空)→ 按域名判,预览域名下可用 ?site= 切换;
 *  ③ 都判不出 → 回落到第一个站,而不是「全部」——
 *     「全部」这个默认值本身就是漏洞的来源。
 *
 * 前台早就按域名解析站点了(getSiteByHost),后台跟它用同一套判据,
 * 这样「打开哪个域名就在管哪个站」对运营是直觉,不需要解释。
 */
import { getSiteByHost, getSiteById, DEFAULT_LANG } from './db';
import type { Session } from './auth';

export type Tenant = {
  /** 当前管理的站点 id */
  siteId: string;
  siteName: string;
  /** 是否集团管理员(可跨站) */
  isGroup: boolean;
  /** 该账号可切换的站点清单;非集团管理员只有一个 */
  options: { id: string; name: string }[];
};

export async function resolveTenant(
  db: D1Database,
  sess: Session & { site_id?: string | null },
  url: URL,
): Promise<Tenant> {
  const { results: all } = await db
    .prepare(`SELECT s.id, IFNULL(i.name, s.id) AS name
                FROM sites s LEFT JOIN site_i18n i ON i.site_id = s.id AND i.lang = ?
               ORDER BY s.sort_order`)
    .bind(DEFAULT_LANG)
    .all<{ id: string; name: string }>();
  const options = all ?? [];
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;

  // ① 账号绑死了站点 —— 最高优先级,地址栏改不动
  const bound = sess.site_id;
  if (bound) {
    return { siteId: bound, siteName: nameOf(bound), isGroup: false, options: options.filter((o) => o.id === bound) };
  }

  // ② 集团管理员:先按域名,再看 ?site=
  const byHost = await getSiteByHost(db, url.hostname, DEFAULT_LANG).catch(() => null);
  const override = url.searchParams.get('site');
  const picked = (override && options.some((o) => o.id === override)) ? override
    : byHost?.id
    ?? options[0]?.id
    ?? 'beauty2oem';

  return { siteId: picked, siteName: nameOf(picked), isGroup: true, options };
}
