/**
 * BIOSPHERE-AI 精简导航 —— "四刀减法"第一刀。
 *
 * 原则:把复杂留给底层数据库(喂Google和AI抓流量),
 * 把极简留给前端交互(让真人买手30秒内看懂并留资)。
 *
 * 顶部只留4个核心入口+1个CTA按钮，砍掉80%的二级下拉项。
 * 被砍掉的子页面不删(不丢SEO流量)，移到Footer站点地图。
 */
import type { Locale } from '@cosmetic/core/i18n';

export interface NavLabel {
  'zh-cn': string;
  'zh-tw': string;
  en: string;
  ja: string;
  /** 其他语言回退到 en */
  [k: string]: string;
}

export interface SimpleNavNode {
  slug: string;
  label: NavLabel;
}

export const BIOSPHERE_NAV: SimpleNavNode[] = [
  {
    slug: 'services',
    label: {
      'zh-cn': '服务与方案',
      'zh-tw': '服務與方案',
      en: 'Services',
      ja: 'サービス',
    },
  },
  {
    slug: 'services/cross-border-seller',
    label: {
      'zh-cn': '出海代工',
      'zh-tw': '出海代工',
      en: 'Cross-border OEM',
      ja: '越境OEM',
    },
  },
  {
    slug: 'services/factory-quality',
    label: {
      'zh-cn': '工厂与资质',
      'zh-tw': '工廠與資質',
      en: 'Factory & quality',
      ja: '工場と品質',
    },
  },
  {
    slug: 'services/product-development',
    label: {
      'zh-cn': '产品开发',
      'zh-tw': '產品開發',
      en: 'Product development',
      ja: '製品開発',
    },
  },
];

/** 取当前语言的导航标签 */
export function navLabel(node: SimpleNavNode, locale: Locale): string {
  return node.label[locale] ?? node.label.en ?? node.label['zh-cn'];
}

/** 转成 SiteHeader 需要的 NavNode 格式 */
export function getNav(locale: Locale) {
  return BIOSPHERE_NAV.map((n) => ({
    slug: n.slug,
    label: navLabel(n, locale),
  }));
}
