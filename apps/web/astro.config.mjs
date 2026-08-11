import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/**
 * 帛卉多站 SSR 应用 —— 一个部署按域名服务 5 个品牌站 + /admin 后台。
 * 服务端渲染而非静态:内容改完即时生效,同时 HTML 由服务端产出,SEO 不丢。
 */
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  trailingSlash: 'always',
});
