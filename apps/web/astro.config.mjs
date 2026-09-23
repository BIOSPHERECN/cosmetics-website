import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/**
 * 帛卉多站 SSR 应用 —— 一个部署按域名服务 5 个品牌站 + /admin 后台。
 * 服务端渲染而非静态:内容改完即时生效,同时 HTML 由服务端产出,SEO 不丢。
 */
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  // 不能用 'always':它会把 /media/x.jpg 也重定向成 /media/x.jpg/,
  // 静态资源随之 404。SSR 下页面路径由 [...path] 自己规整,不依赖这个开关。
  trailingSlash: 'ignore',

  /**
   * 收录总闸的默认值。
   *
   * BaseLayout 里 allowIndex = indexable && import.meta.env.PUBLIC_LIVE === '1',
   * 不等于 1 时全站输出 noindex。这个变量原本只能靠部署时手敲 ——
   * 而实测栽过:连着几次构建忘了带,已经上线的 biosphere-ai.com 静默变回 noindex,
   * 构建和部署都不报错,一直到上线终检才发现。
   *
   * 写进 .env 也不行:仓库的 .gitignore 忽略 `.env` 和 `.env.*`,
   * 换台机器 clone 下来闸门又是关的 —— 防呆措施自己被忽略掉了。
   * 所以放在这个**会进版本库**的文件里,本地仍可用环境变量覆盖来关掉。
   *
   * 这只是总闸:单个站还要 sites.is_live=1 才会被收录,
   * 所以打开它不会把另外四个未完成的站一起放出去。
   */
  vite: {
    define: {
      'import.meta.env.PUBLIC_LIVE': JSON.stringify(process.env.PUBLIC_LIVE ?? '1'),
    },
  },
});
