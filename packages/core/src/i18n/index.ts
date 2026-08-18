/**
 * i18n 字典工具 —— 配合 Astro 官方内置 i18n(routing.prefixDefaultLocale: true)。
 * 内容级文案在 content/*.json;这里只放「站点骨架」级 UI 字符串(导航/按钮/表格标题),
 * 每站可通过 t(locale, overrides) 覆盖个别词条。
 */

// 语种清单 —— 繁体按创始人要求移除。
// 保留日语是因为日本是既定目标市场;若不需要,删掉 'ja' 即可,
// 各处都是从这一处读的,不会漏。
export const LOCALES = ['zh-cn', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-cn';

/** hreflang 属性值(SEOHead 与 sitemap i18n 共用同一张表,保持一致) */
export const HREFLANG: Record<Locale, string> = {
  'zh-cn': 'zh-CN',
  en: 'en',
  ja: 'ja',
};

/** og:locale 值 */
export const OG_LOCALE: Record<Locale, string> = {
  'zh-cn': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
};

/** 语言切换器完整名 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-cn': '简体中文',
  en: 'English',
  ja: '日本語',
};

/** 语言切换器紧凑名(头部横排用) */
export const LOCALE_SHORT: Record<Locale, string> = {
  'zh-cn': '简',
  en: 'EN',
  ja: '日',
};

export function isLocale(x: string | undefined): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

/** 拼语言前缀路径:localePath('en', '/products/') → '/en/products/' */
export function localePath(locale: Locale, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const withSlash = p.endsWith('/') ? p : `${p}/`;
  return `/${locale}${withSlash === '/' ? '/' : withSlash}`;
}

/** 同一页面切到另一语言:switchLocalePath('/zh-cn/products/x/', 'ja') → '/ja/products/x/' */
export function switchLocalePath(pathname: string, to: Locale): string {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length > 0 && isLocale(segs[0])) segs.shift();
  return segs.length === 0 ? `/${to}/` : `/${to}/${segs.join('/')}/`;
}

const zhCN = {
  'nav.home': '首页',
  'nav.brand': '品牌故事',
  'nav.products': '产品目录',
  'nav.contact': '联系询盘',
  'cta.inquiry': '立即询盘',
  'products.specs': '规格参数',
  'products.highlights': '成分亮点',
  'products.back': '返回产品目录',
  'products.related': '相关产品',
  'products.viewDetail': '查看详情',
  'products.inquire': '咨询此产品',
  'footer.nav': '站内导航',
  'footer.contact': '联系方式',
  'footer.certs': '资质认证',
  'footer.rights': '保留所有权利。',
  'lang.label': '语言',
  'a11y.skip': '跳到主内容',
  'notfound.title': '页面不存在',
  'notfound.body': '您访问的页面不存在或已被移动。',
  'notfound.back': '回到首页',
} as const;

export type UiKey = keyof typeof zhCN;

const zhTW: Record<UiKey, string> = {
  'nav.home': '首頁',
  'nav.brand': '品牌故事',
  'nav.products': '產品目錄',
  'nav.contact': '聯絡詢價',
  'cta.inquiry': '立即詢價',
  'products.specs': '規格參數',
  'products.highlights': '成分亮點',
  'products.back': '返回產品目錄',
  'products.related': '相關產品',
  'products.viewDetail': '查看詳情',
  'products.inquire': '洽詢此產品',
  'footer.nav': '網站導覽',
  'footer.contact': '聯絡方式',
  'footer.certs': '資質認證',
  'footer.rights': '版權所有。',
  'lang.label': '語言',
  'a11y.skip': '跳至主要內容',
  'notfound.title': '找不到頁面',
  'notfound.body': '您造訪的頁面不存在或已被移動。',
  'notfound.back': '回到首頁',
};

const en: Record<UiKey, string> = {
  'nav.home': 'Home',
  'nav.brand': 'Our Story',
  'nav.products': 'Products',
  'nav.contact': 'Contact',
  'cta.inquiry': 'Start an inquiry',
  'products.specs': 'Specifications',
  'products.highlights': 'Key ingredients',
  'products.back': 'Back to catalog',
  'products.related': 'Related products',
  'products.viewDetail': 'View details',
  'products.inquire': 'Inquire about this product',
  'footer.nav': 'Site',
  'footer.contact': 'Contact',
  'footer.certs': 'Certifications',
  'footer.rights': 'All rights reserved.',
  'lang.label': 'Language',
  'a11y.skip': 'Skip to content',
  'notfound.title': 'Page not found',
  'notfound.body': 'The page you are looking for does not exist or has been moved.',
  'notfound.back': 'Back to home',
};

const ja: Record<UiKey, string> = {
  'nav.home': 'ホーム',
  'nav.brand': 'ブランドストーリー',
  'nav.products': '製品カタログ',
  'nav.contact': 'お問い合わせ',
  'cta.inquiry': 'お問い合わせする',
  'products.specs': '製品仕様',
  'products.highlights': '成分ハイライト',
  'products.back': 'カタログへ戻る',
  'products.related': '関連製品',
  'products.viewDetail': '詳細を見る',
  'products.inquire': 'この製品について問い合わせる',
  'footer.nav': 'サイトマップ',
  'footer.contact': '連絡先',
  'footer.certs': '認証・資格',
  'footer.rights': 'All rights reserved.',
  'lang.label': '言語',
  'a11y.skip': '本文へスキップ',
  'notfound.title': 'ページが見つかりません',
  'notfound.body': 'お探しのページは存在しないか、移動しました。',
  'notfound.back': 'ホームへ戻る',
};

export const ui: Record<Locale, Record<UiKey, string>> = {
  'zh-cn': zhCN,
  en,
  ja,
};

/** 取词函数工厂;overrides 供品牌皮肤覆盖个别词条 */
export function t(locale: Locale, overrides?: Partial<Record<UiKey, string>>) {
  return (key: UiKey): string => overrides?.[key] ?? ui[locale][key];
}
