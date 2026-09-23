/**
 * /favicon.ico —— 浏览器与爬虫**一定**会请求这个地址,
 * 站上没有它就是每次访问一条 404。页面里已经内联了 data: URI 图标,
 * 所以只需把同一枚图标也挂到这个固定地址上,不额外做资源。
 *
 * 给的是 SVG(现代浏览器接受 .ico 路径返回 SVG),
 * 换成真 .ico 需要一份位图资产 —— 等有品牌图标再说。
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#7C4DA8"/><path d="M9.5 22.5 L22.5 9.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="16" r="4.4" fill="none" stroke="#fff" stroke-width="2.4"/></svg>`;

export const GET: APIRoute = () =>
  new Response(SVG, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=604800',
      'x-content-type-options': 'nosniff',
    },
  });
