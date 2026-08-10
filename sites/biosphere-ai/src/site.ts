/**
 * BIOSPHERE-AI 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = {
  id: "biosphere-ai",
  name: "BIOSPHERE-AI",
  nameZh: "全球生命美妆AI科技平台",
  domain: "biosphere-ai.com",
  url: "https://biosphere-ai.com",
  school: "tech-spec",
  defaultVariant: "v1",
  variants: [
    "v1",
    "v2",
    "v3",
    "v4"
  ],
  brandColor: "#3b4a8c",
  indexable: true,
  hasStudio: true
} as const;

export type SiteMeta = typeof site;
