/**
 * BIOSPHERE-ORALCARE 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = {
  id: "biosphere-oralcare",
  name: "BIOSPHERE-ORALCARE",
  nameZh: "AI口腔生命科技平台",
  domain: "biosphere-oralcare.com",
  url: "https://biosphere-oralcare.com",
  school: "clinical",
  defaultVariant: "v1",
  variants: [
    "v1",
    "v2",
    "v3",
    "v4"
  ],
  brandColor: "#6b4c9a",
  indexable: true
} as const;

export type SiteMeta = typeof site;
