import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * 风格实验室 · 五站候选风格并排预览
 * 本文件由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被下次生成覆盖。
 * 四语路由由 src/pages/[locale]/ 动态路由铺开(getStaticPaths 显式返回 4 个语言),
 * 不依赖 Astro 内置 i18n 路由重写 —— 保证 4 条语言路径 100% 生成、无隐式行为。
 */
export default defineConfig({
  site: 'http://localhost:4321',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 风格实验室的根路径就是画廊索引本身,不做语言重定向
  integrations: [/* 风格实验室不对外收录,不产 sitemap */],
});
