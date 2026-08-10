import type { APIRoute } from 'astro';
import { robotsBody } from '@cosmetic/core/robots';
import { getSite } from '@cosmetic/core/registry';

/**
 * SKIN2OEM robots.txt —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 默认(预览态)全站 Disallow;构建时设 PUBLIC_LIVE=1 才开放抓取。
 */
const site = getSite('skin2oem');

export const GET: APIRoute = () =>
  new Response(
    robotsBody(site.url, {
      indexable: site.indexable,
      live: import.meta.env.PUBLIC_LIVE === '1',
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
