/**
 * 新建页面的站点归属 —— 只认登录态里的租户,不认请求体里的 site_id。
 *
 * 绑定了站点的账号(isGroup=false)写入一律用 tenant.siteId。
 * 请求体里带了别的站 → 403。省略 site_id 也落在自己的站,不能靠「不传」换站。
 * 集团账号可以指定 options 里的另一个站;不在清单里的 id 同样 403。
 *
 * site_id 必须是字符串。RegExp.test 会把数组转成字符串,["other-site"] 能穿过
 * /^[a-z0-9-]+$/ ,所以这里先看 typeof,再比相等。
 */

const SITE_RE = /^[a-z0-9-]{1,32}$/;

export type SiteScope = {
  siteId: string;
  isGroup: boolean;
  options: { id: string }[];
};

export type SiteDecision =
  | { ok: true; siteId: string }
  | { ok: false; status: 400 | 403; msg: string };

export function resolveCreateSite(tenant: SiteScope, rawSiteId: unknown): SiteDecision {
  const own = tenant.siteId;
  if (typeof own !== 'string' || !SITE_RE.test(own)) {
    return { ok: false, status: 403, msg: '当前账号没有可写站点' };
  }

  const omitted = rawSiteId == null || rawSiteId === '';
  if (omitted) return { ok: true, siteId: own };

  if (typeof rawSiteId !== 'string' || !SITE_RE.test(rawSiteId)) {
    return { ok: false, status: 400, msg: '请选择站点' };
  }

  if (!tenant.isGroup) {
    if (rawSiteId !== own) return { ok: false, status: 403, msg: '无权在该站点建页' };
    return { ok: true, siteId: own };
  }

  if (rawSiteId === own) return { ok: true, siteId: own };
  if (!tenant.options.some((o) => o.id === rawSiteId)) {
    return { ok: false, status: 403, msg: '无权在该站点建页' };
  }
  return { ok: true, siteId: rawSiteId };
}

/** parent_id 只接受正整数。字符串、数组交给 SQL 之前就丢掉。 */
export function parseParentId(raw: unknown): { ok: true; id: number | null } | { ok: false; status: 400; msg: string } {
  if (raw == null || raw === '') return { ok: true, id: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > 2_147_483_647) {
    return { ok: false, status: 400, msg: '父页面不合法' };
  }
  return { ok: true, id: raw };
}
