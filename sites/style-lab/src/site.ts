/**
 * 风格实验室 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = {
  id: "style-lab",
  name: "风格实验室",
  nameZh: "五站候选风格并排预览",
  domain: "localhost",
  url: "http://localhost:4321",
  school: "factory-b2b",
  defaultVariant: "v1",
  variants: [
    "v1"
  ],
  brandColor: "#b8974a",
  indexable: false
} as const;

export type SiteMeta = typeof site;
