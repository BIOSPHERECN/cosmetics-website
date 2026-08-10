/**
 * MEDIERBA 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = {
  id: "medierba",
  name: "MEDIERBA",
  nameZh: "高端草本医学美容品牌",
  domain: "medierba.com",
  url: "https://medierba.com",
  school: "clean-natural",
  defaultVariant: "v1",
  variants: [
    "v1",
    "v2",
    "v3",
    "v4"
  ],
  brandColor: "#3e6b47",
  indexable: true
} as const;

export type SiteMeta = typeof site;
