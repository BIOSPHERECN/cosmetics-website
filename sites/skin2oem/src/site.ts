/**
 * SKIN2OEM 站点元信息 —— 由 tools/scaffold-sites.mjs 从 registry.ts 生成,手改会被覆盖。
 * 换风格只需在 registry.ts 改 defaultVariant,再跑一次生成器。
 */
export const site = {
  id: "skin2oem",
  name: "SKIN2OEM",
  nameZh: "全球护肤智能制造平台",
  domain: "skin2oem.com",
  url: "https://skin2oem.com",
  school: "factory-b2b",
  defaultVariant: "v1",
  variants: [
    "v1",
    "v2",
    "v3",
    "v4"
  ],
  brandColor: "#2e7c8c",
  indexable: true
} as const;

export type SiteMeta = typeof site;
