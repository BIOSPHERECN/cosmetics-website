/**
 * 站点脚手架生成器 —— 从 packages/core/src/registry.ts 这一唯一真源,
 * 生成每站的 astro.config.mjs / tsconfig.json / src/site.ts / src/styles/brand.css。
 *
 * 只生成「机械一致」的配置文件;页面(src/pages/**)与内容永不由本脚本覆盖。
 * 用法:node tools/scaffold-sites.mjs   (Node 23+ 原生支持 .ts 类型剥离,可直接 import registry.ts)
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES, STYLE_LAB } from '../packages/core/src/registry.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = [...SITES, STYLE_LAB];

const w = (rel, body) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
  return rel;
};

const astroConfig = (s) => `import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * ${s.name} · ${s.nameZh}
 * 本文件由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被下次生成覆盖。
 * 四语路由由 src/pages/[locale]/ 动态路由铺开(getStaticPaths 显式返回 4 个语言),
 * 不依赖 Astro 内置 i18n 路由重写 —— 保证 4 条语言路径 100% 生成、无隐式行为。
 */
export default defineConfig({
  site: '${s.url}',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 根路径落到默认语言(静态输出下 Astro 生成 meta-refresh 页,零运行时)
  redirects: { '/': '/zh-cn/' },
  integrations: [${
    s.indexable
      ? `
    sitemap({
      i18n: {
        defaultLocale: 'zh-cn',
        locales: { 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', en: 'en', ja: 'ja' },
      },
    }),
  `
      : '/* 风格实验室不对外收录,不产 sitemap */'
  }],
});
`;

const tsconfig = () => `{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
`;

const siteTs = (s) => `/**
 * ${s.name} 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = ${JSON.stringify(s, null, 2).replace(/"([a-zA-Z]\w*)":/g, '$1:')} as const;

export type SiteMeta = typeof site;
`;

const brandCss = (s) => `/**
 * ${s.name} 品牌层覆盖(三层叠加最末层,特异性最高)
 * 品牌主色 ${s.brandColor} 取自帛卉集团品牌视觉图。
 * 这里只放「跨所有候选风格都成立」的品牌恒定项;
 * 各风格提案之间的差异放 packages/core/src/styles/variants/${s.id}.css。
 */
[data-brand='${s.id}'] {
  --ck-brand: ${s.brandColor};
}
`;

const written = [];
for (const s of ALL) {
  written.push(w(`sites/${s.id}/astro.config.mjs`, astroConfig(s)));
  written.push(w(`sites/${s.id}/tsconfig.json`, tsconfig()));
  written.push(w(`sites/${s.id}/src/site.ts`, siteTs(s)));
  written.push(w(`sites/${s.id}/src/styles/brand.css`, brandCss(s)));
  const page = `sites/${s.id}/src/pages/[locale]/index.astro`;
  if (!existsSync(join(ROOT, page))) console.log(`  ⚠ 缺页面(需手写): ${page}`);
}
console.log(`✓ 生成 ${written.length} 个配置文件,覆盖 ${ALL.length} 个站点`);
