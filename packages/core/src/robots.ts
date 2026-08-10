/**
 * robots.txt 生成 —— 与 BaseLayout 的收录闸门同一套判据,双层防护。
 *
 * 为什么要两层:
 *   meta robots noindex 只对「爬虫愿意抓取并解析 HTML」的情况有效;
 *   robots.txt Disallow 则在抓取之前就拦住。现阶段站内产能数字与认证清单
 *   均为未核实的占位样例,任何一层漏掉都可能被收录,撤回成本极高。
 *
 * 上线正式域名、内容核实完毕后,构建时设 PUBLIC_LIVE=1,两层同时开放。
 */

export function robotsBody(siteUrl: string, opts: { indexable: boolean; live: boolean }): string {
  const base = siteUrl.replace(/\/$/, '');

  if (!opts.indexable) {
    return [
      '# 内部页面,永不对外收录',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  if (!opts.live) {
    return [
      '# 预览部署:内容尚未经核实,全站禁止抓取。',
      '# 正式上线时以 PUBLIC_LIVE=1 构建,本文件即自动切换为开放。',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap-index.xml`,
    '',
  ].join('\n');
}
