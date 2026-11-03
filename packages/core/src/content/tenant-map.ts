/**
 * 域名 → 站点 ID 的**唯一权威映射**。
 *
 * 为什么要有这张表(2026-09-07 事故):
 *   加了一个新语种 zh-tw,当天 biosphere-ai.com/zh-tw/ 的标题变成了
 *   「全球美妆智能制造平台 | BEAUTY2OEM」—— 另一家公司的名字。
 *   根因不是那一处代码,是整个仓库里散着 17 个 `?? 'beauty2oem'`:
 *   站点查询只要因为任何原因返回 null(缺一个语种的 i18n 行、库抖一下、
 *   域名没配),页面就把自己说成另一个品牌。
 *
 *   对一个代工厂,这是最不能出的错:采购看到的是别家的名字,
 *   而且这种错**不报警、不 500**,页面照常 200,可能几个月没人发现。
 *
 * 纪律:
 *   · 任何地方都不许再硬编码某个具体站点 ID 作为兜底;
 *     要兜底就调 siteIdForHost(),它按域名给出唯一正确的答案。
 *   · 域名认不出来时返回 null,由调用方决定是降级还是报错 ——
 *     **绝不猜一个别的站**。宁可少一块内容,不可挂错招牌。
 */
export const HOST_SITE: Record<string, string> = {
  'biosphere-ai.com': 'biosphere-ai',
  'beauty2oem.com': 'beauty2oem',
  'skin2oem.com': 'skin2oem',
  'medierba.com': 'medierba',
  'biosphere-oralcare.com': 'biosphere-oralcare',
};

/** 按域名解析站点 ID。认不出来返回 null —— 不猜。 */
export function siteIdForHost(host: string): string | null {
  const clean = String(host || '').toLowerCase().replace(/^www\./, '').split(':')[0];
  if (HOST_SITE[clean]) return HOST_SITE[clean];
  /* 预览域名(*.workers.dev / *.pages.dev)与本地开发:
     从子域里取第一段试一次,取不到就 null。 */
  const sub = clean.split('.')[0];
  return Object.values(HOST_SITE).includes(sub) ? sub : null;
}
