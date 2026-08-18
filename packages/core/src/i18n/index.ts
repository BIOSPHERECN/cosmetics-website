/**
 * i18n 字典工具 —— 配合 Astro 官方内置 i18n(routing.prefixDefaultLocale: true)。
 * 内容级文案在数据库 page_i18n / block_i18n;这里只放「站点骨架」级 UI 字符串
 * (导航/按钮/表格标题),每站可通过 t(locale, overrides) 覆盖个别词条。
 *
 * ★ 加语种只改这一个文件 ★
 *   LOCALES 加一项 + 补一份字典 + HREFLANG/OG/LABEL 各补一行,全站(页头下拉、
 *   hreflang 互指、sitemap、中间件地区判断、后台翻译中心)自动跟上,不用满仓库找。
 *
 * 关于「日本是 JP 还是 ja」:
 *   URL 与 hreflang 用 **ja** —— 那是 ISO 639-1 的**语言**码,Google 只认这个;
 *   写成 jp(那是国家码)会让 hreflang 失效。
 *   但访客眼里日本就是 JP,所以界面上的紧凑标写 JP,并且 /jp/ 做成跳转别名,
 *   谁手输 /jp/ 都能到。两边各取所需,不互相将就。
 */

// 语种清单 —— 繁体按创始人要求移除(简中已覆盖港澳台读者)。
// 顺序即页头下拉里的顺序:先中英日(既有市场),再东南亚,再法语区。
export const LOCALES = ['zh-cn', 'en', 'ja', 'id', 'ms', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-cn';

/** hreflang 属性值(SEOHead 与 sitemap i18n 共用同一张表,保持一致) */
export const HREFLANG: Record<Locale, string> = {
  'zh-cn': 'zh-CN',
  en: 'en',
  ja: 'ja',
  id: 'id',
  ms: 'ms',
  fr: 'fr',
};

/** og:locale 值 */
export const OG_LOCALE: Record<Locale, string> = {
  'zh-cn': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
  id: 'id_ID',
  ms: 'ms_MY',
  fr: 'fr_FR',
};

/**
 * 语言切换器完整名 —— 一律用**该语言自己的写法**。
 * 不写「印尼语」「马来语」:看得懂中文的人不需要切换,
 * 真正要切的人只认得 Bahasa Indonesia 这几个字。
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-cn': '简体中文',
  en: 'English',
  ja: '日本語',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  fr: 'Français',
};

/** 紧凑名(下拉收起时的按钮上显示)。日本按创始人要求写 JP,不写 JA */
export const LOCALE_SHORT: Record<Locale, string> = {
  'zh-cn': '中文',
  en: 'EN',
  ja: 'JP',
  id: 'ID',
  ms: 'MY',
  fr: 'FR',
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

/* 印尼语 —— 东南亚第一大代工采购市场。
   注意 inquiry 不译成 "penawaran harga"(询价):我们只接单不报价,
   用中性的 "permintaan"(请求),避免访客以为点进去能看到价目表。 */
const id: Record<UiKey, string> = {
  'nav.home': 'Beranda',
  'nav.brand': 'Tentang Kami',
  'nav.products': 'Produk',
  'nav.contact': 'Kontak',
  'cta.inquiry': 'Ajukan Permintaan',
  'products.specs': 'Spesifikasi',
  'products.highlights': 'Bahan Utama',
  'products.back': 'Kembali ke katalog',
  'products.related': 'Produk terkait',
  'products.viewDetail': 'Lihat detail',
  'products.inquire': 'Tanyakan produk ini',
  'footer.nav': 'Situs',
  'footer.contact': 'Kontak',
  'footer.certs': 'Sertifikasi',
  'footer.rights': 'Hak cipta dilindungi undang-undang.',
  'lang.label': 'Bahasa',
  'a11y.skip': 'Lompat ke konten',
  'notfound.title': 'Halaman tidak ditemukan',
  'notfound.body': 'Halaman yang Anda cari tidak ada atau telah dipindahkan.',
  'notfound.back': 'Kembali ke beranda',
};

/* 马来语 —— 与印尼语同源但不是同一种:
   Laman Utama / butiran / dijumpai 这些词印尼人看着别扭,反之亦然。
   所以分两份字典,不图省事合并。 */
const ms: Record<UiKey, string> = {
  'nav.home': 'Laman Utama',
  'nav.brand': 'Tentang Kami',
  'nav.products': 'Produk',
  'nav.contact': 'Hubungi Kami',
  'cta.inquiry': 'Mulakan Pertanyaan',
  'products.specs': 'Spesifikasi',
  'products.highlights': 'Bahan Utama',
  'products.back': 'Kembali ke katalog',
  'products.related': 'Produk berkaitan',
  'products.viewDetail': 'Lihat butiran',
  'products.inquire': 'Tanya tentang produk ini',
  'footer.nav': 'Laman',
  'footer.contact': 'Hubungi',
  'footer.certs': 'Pensijilan',
  'footer.rights': 'Hak cipta terpelihara.',
  'lang.label': 'Bahasa',
  'a11y.skip': 'Langkau ke kandungan',
  'notfound.title': 'Halaman tidak dijumpai',
  'notfound.body': 'Halaman yang anda cari tidak wujud atau telah dipindahkan.',
  'notfound.back': 'Kembali ke laman utama',
};

/* 法语 —— 覆盖法国本土 + 法语非洲(达喀尔、阿比让一带的美妆贸易商基数不小)。
   inquiry 特意不译成 devis(报价单):那是价格语境,我们的产品线不出价。 */
const fr: Record<UiKey, string> = {
  'nav.home': 'Accueil',
  'nav.brand': 'Notre histoire',
  'nav.products': 'Produits',
  'nav.contact': 'Contact',
  'cta.inquiry': 'Envoyer une demande',
  'products.specs': 'Spécifications',
  'products.highlights': 'Actifs clés',
  'products.back': 'Retour au catalogue',
  'products.related': 'Produits associés',
  'products.viewDetail': 'Voir le détail',
  'products.inquire': 'Demander des informations',
  'footer.nav': 'Navigation',
  'footer.contact': 'Contact',
  'footer.certs': 'Certifications',
  'footer.rights': 'Tous droits réservés.',
  'lang.label': 'Langue',
  'a11y.skip': 'Aller au contenu',
  'notfound.title': 'Page introuvable',
  'notfound.body': "La page que vous recherchez n'existe pas ou a été déplacée.",
  'notfound.back': "Retour à l'accueil",
};

export const ui: Record<Locale, Record<UiKey, string>> = {
  'zh-cn': zhCN,
  en,
  ja,
  id,
  ms,
  fr,
};

/** 取词函数工厂;overrides 供品牌皮肤覆盖个别词条 */
export function t(locale: Locale, overrides?: Partial<Record<UiKey, string>>) {
  return (key: UiKey): string => overrides?.[key] ?? ui[locale][key];
}
