import type { APIRoute } from 'astro';
import { robotsBody } from '@cosmetic/core/robots';
import { STYLE_LAB } from '@cosmetic/core/registry';

/**
 * 风格实验室 robots.txt —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 默认(预览态)全站 Disallow;构建时设 PUBLIC_LIVE=1 才开放抓取。
 */
const site = STYLE_LAB;

export const GET: APIRoute = () =>
  new Response(
    robotsBody(site.url, {
      indexable: site.indexable,
      live: import.meta.env.PUBLIC_LIVE === '1',
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
