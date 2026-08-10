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
  build: { format: 'directory' },${
    s.id === 'style-lab'
      ? `
  // 风格实验室的根路径就是画廊索引本身,不做语言重定向`
      : `
  // 根路径落到默认语言(静态输出下 Astro 生成 meta-refresh 页,零运行时)
  redirects: { '/': '/zh-cn/' },`
  }
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

/**
 * site.ts 只做「从注册表取本站定义」的一行转发,不复制数据 ——
 * 避免注册表改了、各站副本没跟上的经典不一致。
 */
const siteTs = (s) => `/**
 * ${s.name} 站点元信息 —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 只是从 registry.ts(唯一真源)取本站定义,不复制任何字段。
 * 换风格:改 registry.ts 里本站的 defaultVariant 一处即可,无需重跑生成器。
 */
import { ${s.id === 'style-lab' ? 'STYLE_LAB' : 'getSite'} } from '@cosmetic/core/registry';

export const site = ${s.id === 'style-lab' ? 'STYLE_LAB' : `getSite('${s.id}')`};
`;

const brandCss = (s) => `/**
 * ${s.name} 品牌层覆盖(三层叠加最末层,特异性最高)
 * 品牌主色 ${s.brandColor} 取自帛卉集团品牌视觉图。
 * 这里只放「跨所有候选风格都成立」的品牌恒定项;
 * 各风格提案之间的差异放 packages/core/src/styles/variants.css 的 [data-brand][data-variant] 块。
 */
[data-brand='${s.id}'] {
  --ck-brand: ${s.brandColor};
}
`;

/** 404 页 —— 静态站没有服务端路由,没这一页访客会看到 Cloudflare 的默认英文错误页 */
const notFound = (s) => `---
/**
 * ${s.name} 404 页 —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 版式在 @cosmetic/core/layouts/NotFound.astro,6 个站共用。
 */
import NotFound from '@cosmetic/core/layouts/NotFound.astro';
import { ${s.id === 'style-lab' ? 'STYLE_LAB' : 'getSite'} } from '@cosmetic/core/registry';
import { EMAIL } from '@cosmetic/core/content';
import '../styles/brand.css';

const site = ${s.id === 'style-lab' ? 'STYLE_LAB' : `getSite('${s.id}')`};
---

<NotFound site={site} email={EMAIL[site.id] ?? 'contact@bohui.group'} />
`;

/** robots.txt —— 与 BaseLayout 的收录闸门同判据,抓取前就拦住(双层防护) */
const robotsTxt = (s) => `import type { APIRoute } from 'astro';
import { robotsBody } from '@cosmetic/core/robots';
import { ${s.id === 'style-lab' ? 'STYLE_LAB' : 'getSite'} } from '@cosmetic/core/registry';

/**
 * ${s.name} robots.txt —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 默认(预览态)全站 Disallow;构建时设 PUBLIC_LIVE=1 才开放抓取。
 */
const site = ${s.id === 'style-lab' ? 'STYLE_LAB' : `getSite('${s.id}')`};

export const GET: APIRoute = () =>
  new Response(
    robotsBody(site.url, {
      indexable: site.indexable,
      live: import.meta.env.PUBLIC_LIVE === '1',
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
`;

/** 询盘页 —— 全线唯一转化目标,每站四语一份 */
const contactPage = (s) => `---
/**
 * ${s.name} 询盘页 —— 由 tools/scaffold-sites.mjs 生成,手改会被覆盖。
 * 版式在 @cosmetic/core/layouts/ContactPage.astro,5 个真站共用。
 */
import ContactPage from '@cosmetic/core/layouts/ContactPage.astro';
import { LOCALES, type Locale } from '@cosmetic/core/i18n';
import { getSite } from '@cosmetic/core/registry';
import { EMAIL } from '@cosmetic/core/content';
import '../../../styles/brand.css';

export function getStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale } }));
}

const locale = Astro.params.locale as Locale;
const site = getSite('${s.id}');
---

<ContactPage site={site} locale={locale} email={EMAIL[site.id]} />
`;

const written = [];
for (const s of ALL) {
  written.push(w(`sites/${s.id}/astro.config.mjs`, astroConfig(s)));
  written.push(w(`sites/${s.id}/tsconfig.json`, tsconfig()));
  written.push(w(`sites/${s.id}/src/site.ts`, siteTs(s)));
  written.push(w(`sites/${s.id}/src/styles/brand.css`, brandCss(s)));
  written.push(w(`sites/${s.id}/src/pages/404.astro`, notFound(s)));
  written.push(w(`sites/${s.id}/src/pages/robots.txt.ts`, robotsTxt(s)));
  // 风格实验室不是真站,不需要询盘页
  if (s.id !== 'style-lab') {
    written.push(w(`sites/${s.id}/src/pages/[locale]/contact/index.astro`, contactPage(s)));
  }
  const page = `sites/${s.id}/src/pages/[locale]/index.astro`;
  if (!existsSync(join(ROOT, page))) console.log(`  ⚠ 缺页面(需手写): ${page}`);
}
console.log(`✓ 生成 ${written.length} 个配置文件,覆盖 ${ALL.length} 个站点`);
