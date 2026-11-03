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

// ══ 语种总表 —— 唯一真源 ═══════════════════════════════════════════
// 加/减语种只改这一处 + tools/locales.json,页头下拉、hreflang 互指、
// sitemap、地区自动跳、后台翻译中心全部从这里读,不用满仓库找。
//
// 顺序 = 下拉里的顺序,按大区分组。36 个平铺成一列没人找得到,必须分组。
export const LOCALES = [
  'en',
  'zh-cn',
  'zh-tw',      // 繁體中文 —— 台港澳市场,hreflang zh-TW
  'jp',
  'kr',
  'fr',
  'de',
  'ru',
  'id',
  'my',
  'th',
  'vn',
  'ph',
  'es',
  'pt',
  'ar',
  'tr',
  'in',
] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** 下拉里的大区分组 —— 顺序与 LOCALES 一致 */
/**
 * 语言下拉里的分区名 —— 必须跟着界面语言走。
 *
 * 之前这四个名字是中文字面量直接写在 locales.json 的 group 字段里,
 * 于是法国采购打开下拉看到的是「主要语言 / 东南亚 / 拉丁美洲」——
 * 语言切换器是整站唯一一处**所有语种的访客都会点开**的地方,
 * 偏偏那里露出中文,给人的印象就是"这站没真做国际化"。
 *
 * 这 68 条是手写的,不进机翻管线:地区名是最容易译出洋相的一类词
 * (「中东」机翻成方位词、「拉丁美洲」被拆开),而且只有 68 条,手写更省事。
 */
export type LocaleGroupKey = 'global' | 'sea' | 'latam' | 'mesa';

export const GROUP_LABELS: Record<string, Record<LocaleGroupKey, string>> = {
  en:      { global: 'Global',       sea: 'Southeast Asia',              latam: 'Latin America',   mesa: 'Middle East & South Asia' },
  'zh-cn': { global: '主要语言',       sea: '东南亚',                       latam: '拉丁美洲',         mesa: '中东与南亚' },
  ja:      { global: '主要言語',       sea: '東南アジア',                    latam: 'ラテンアメリカ',    mesa: '中東・南アジア' },
  ko:      { global: '주요 언어',      sea: '동남아시아',                    latam: '라틴 아메리카',     mesa: '중동·남아시아' },
  fr:      { global: 'International', sea: 'Asie du Sud-Est',             latam: 'Amérique latine', mesa: 'Moyen-Orient et Asie du Sud' },
  de:      { global: 'International', sea: 'Südostasien',                 latam: 'Lateinamerika',   mesa: 'Naher Osten & Südasien' },
  ru:      { global: 'Основные',      sea: 'Юго-Восточная Азия',          latam: 'Латинская Америка', mesa: 'Ближний Восток и Южная Азия' },
  id:      { global: 'Global',        sea: 'Asia Tenggara',               latam: 'Amerika Latin',   mesa: 'Timur Tengah & Asia Selatan' },
  ms:      { global: 'Global',        sea: 'Asia Tenggara',               latam: 'Amerika Latin',   mesa: 'Timur Tengah & Asia Selatan' },
  th:      { global: 'ภาษาหลัก',        sea: 'เอเชียตะวันออกเฉียงใต้',            latam: 'ละตินอเมริกา',      mesa: 'ตะวันออกกลางและเอเชียใต้' },
  vi:      { global: 'Toàn cầu',      sea: 'Đông Nam Á',                  latam: 'Mỹ Latinh',       mesa: 'Trung Đông & Nam Á' },
  tl:      { global: 'Global',        sea: 'Timog-Silangang Asya',        latam: 'Latin America',   mesa: 'Gitnang Silangan at Timog Asya' },
  es:      { global: 'Global',        sea: 'Sudeste Asiático',            latam: 'América Latina',  mesa: 'Oriente Medio y Asia del Sur' },
  pt:      { global: 'Global',        sea: 'Sudeste Asiático',            latam: 'América Latina',  mesa: 'Médio Oriente e Ásia do Sul' },
  ar:      { global: 'عالمي',          sea: 'جنوب شرق آسيا',                 latam: 'أمريكا اللاتينية',  mesa: 'الشرق الأوسط وجنوب آسيا' },
  tr:      { global: 'Küresel',       sea: 'Güneydoğu Asya',              latam: 'Latin Amerika',   mesa: 'Orta Doğu ve Güney Asya' },
  hi:      { global: 'वैश्विक',          sea: 'दक्षिण-पूर्व एशिया',              latam: 'लैटिन अमेरिका',      mesa: 'मध्य पूर्व और दक्षिण एशिया' },
};

/** 取分区名;某语种没写就回落英文 —— 回落成英文远好过回落成中文 */
export function groupLabel(locale: string, key: string): string {
  const row = GROUP_LABELS[locale] ?? GROUP_LABELS.en;
  return row[key as LocaleGroupKey] ?? GROUP_LABELS.en[key as LocaleGroupKey] ?? key;
}

export const LOCALE_GROUPS: { group: string; codes: Locale[] }[] = [
  { group: 'global', codes: ['en', 'zh-cn', 'zh-tw', 'jp', 'kr', 'fr', 'de', 'ru'] },
  { group: 'sea', codes: ['id', 'my', 'th', 'vn', 'ph'] },
  { group: 'latam', codes: ['es', 'pt'] },
  { group: 'mesa', codes: ['ar', 'tr', 'in'] },
];

/** hreflang 属性值(SEOHead 与 sitemap i18n 共用同一张表,保持一致) */
export const HREFLANG: Record<Locale, string> = {
  en:       'en',
  'zh-cn':  'zh-CN',
  'zh-tw':  'zh-TW',
  jp:       'ja',
  kr:       'ko',
  fr:       'fr',
  de:       'de',
  ru:       'ru',
  id:       'id',
  my:       'ms',
  th:       'th',
  vn:       'vi',
  ph:       'tl',
  es:       'es',
  pt:       'pt',
  ar:       'ar',
  tr:       'tr',
  in:       'hi',
};

/** og:locale 值 */
export const OG_LOCALE: Record<Locale, string> = {
  en:       'en_US',
  'zh-cn':  'zh_CN',
  'zh-tw':  'zh_TW',
  jp:       'ja_JP',
  kr:       'ko_KR',
  fr:       'fr_FR',
  de:       'de_DE',
  ru:       'ru_RU',
  id:       'id_ID',
  my:       'ms_MY',
  th:       'th_TH',
  vn:       'vi_VN',
  ph:       'tl_PH',
  es:       'es_ES',
  pt:       'pt_PT',
  ar:       'ar_AR',
  tr:       'tr_TR',
  in:       'hi_IN',
};

/**
 * 切换器里的名字 —— 短。
 * 用「Indonesia」不用「Bahasa Indonesia」、用「中文」不用「简体中文」:
 * 36 行长名字会把下拉撑成一堵墙,而看得懂那门语言的人扫一眼就够了。
 * 名字一律用**该语言自己的写法** —— 真要切的人只认得这几个字。
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en:       'English',
  /* 加了繁体之后,简体必须显式标「简体」——
     两个选项都写「中文」的话,台港读者根本不知道该点哪个。 */
  'zh-cn':  '简体中文',
  'zh-tw':  '繁體中文',
  jp:       '日本語',
  kr:       '한국어',
  fr:       'Français',
  de:       'Deutsch',
  ru:       'Русский',
  id:       'Indonesia',
  my:       'Malaysia',
  th:       'ไทย',
  vn:       'Tiếng Việt',
  ph:       'Filipino',
  es:       'Español',
  pt:       'Português',
  ar:       'العربية',
  tr:       'Türkçe',
  in:       'हिन्दी',
};

/** 收起时按钮上的两字码(ISO 国别码为准;日本按创始人要求写 JP 不写 JA) */
export const LOCALE_SHORT: Record<Locale, string> = {
  en:       'EN',
  'zh-cn':  '简',
  'zh-tw':  '繁',
  jp:       'JP',
  kr:       'KR',
  fr:       'FR',
  de:       'DE',
  ru:       'RU',
  id:       'ID',
  my:       'MY',
  th:       'TH',
  vn:       'VN',
  ph:       'PH',
  es:       'ES',
  pt:       'PT',
  ar:       'AR',
  tr:       'TR',
  in:       'IN',
};

/**
 * 从右向左书写的语言。
 * 这不是"再加一条语种"那么简单 —— 阿拉伯语/波斯语/希伯来语不做整页镜像的话,
 * 导航在右、正文右起,访客读到的是彻底错乱的版面,等于没上线。
 * BaseLayout 据此输出 <html dir>,版式用逻辑属性(margin-inline 等)自动跟着翻。
 */
export const RTL_LOCALES = new Set<string>(['ar']);
export const isRtl = (l: string) => RTL_LOCALES.has(l);

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

import { generated } from './ui.generated.ts';

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
  'footer.privacy': '隐私政策',
  'footer.legal': '法律声明',
  'footer.cookies': 'Cookie 政策',
  'footer.disclaimer': '免责声明',
  'lang.label': '语言',
  'a11y.skip': '跳到主内容',
  'notfound.title': '页面不存在',
  'notfound.body': '您访问的页面不存在或已被移动。',
  'notfound.back': '回到首页',
  'bases.area': '面积',
  'bases.capacity': '产能',
  'bases.crops': '主要品种',
  'bases.capability': '主要能力',
  'eco.hub': '科技大脑',
  'eco.manufacturing': '智造平台',
  'eco.brand': '自有品牌',
  'eco.here': '当前站点',
  'footer.groupLine': 'AI 驱动 · 草本科技 · 智造美丽未来',
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
  'footer.privacy': 'Privacy Policy',
  'footer.legal': 'Legal Notices',
  'footer.cookies': 'Cookie Policy',
  'footer.disclaimer': 'Disclaimer',
  'lang.label': 'Language',
  'a11y.skip': 'Skip to content',
  'notfound.title': 'Page not found',
  'notfound.body': 'The page you are looking for does not exist or has been moved.',
  'notfound.back': 'Back to home',
  'bases.area': 'Area',
  'bases.capacity': 'Capacity',
  'bases.crops': 'Main crops',
  'bases.capability': 'Main capability',
  'eco.hub': 'Technology hub',
  'eco.manufacturing': 'Manufacturing platform',
  'eco.brand': 'Own brand',
  'eco.here': 'You are here',
  'footer.groupLine': 'AI-driven · Botanical science · Manufacturing for beauty',
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
  'footer.privacy': 'プライバシーポリシー',
  'footer.legal': '法的表示',
  'footer.cookies': 'クッキーポリシー',
  'footer.disclaimer': '免責事項',
  'lang.label': '言語',
  'a11y.skip': '本文へスキップ',
  'notfound.title': 'ページが見つかりません',
  'notfound.body': 'お探しのページは存在しないか、移動しました。',
  'notfound.back': 'ホームへ戻る',
  'bases.area': '面積',
  'bases.capacity': '生産能力',
  'bases.crops': '主な品種',
  'bases.capability': '主な能力',
  'eco.hub': 'テクノロジーハブ',
  'eco.manufacturing': '製造プラットフォーム',
  'eco.brand': '自社ブランド',
  'eco.here': '現在のサイト',
  'footer.groupLine': 'AI 駆動 · 植物科学 · 美をつくる製造',
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
  'footer.privacy': 'Kebijakan Privasi',
  'footer.legal': 'Ketentuan Hukum',
  'footer.cookies': 'Kebijakan Cookie',
  'footer.disclaimer': 'Penafian',
  'lang.label': 'Bahasa',
  'a11y.skip': 'Lompat ke konten',
  'notfound.title': 'Halaman tidak ditemukan',
  'notfound.body': 'Halaman yang Anda cari tidak ada atau telah dipindahkan.',
  'notfound.back': 'Kembali ke beranda',
  'bases.area': 'Luas',
  'bases.capacity': 'Kapasitas',
  'bases.crops': 'Tanaman utama',
  'bases.capability': 'Kemampuan utama',
  'eco.hub': 'Pusat teknologi',
  'eco.manufacturing': 'Platform manufaktur',
  'eco.brand': 'Merek sendiri',
  'eco.here': 'Situs ini',
  'footer.groupLine': 'Digerakkan AI · Sains botani · Manufaktur untuk kecantikan',
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
  'footer.privacy': 'Dasar Privasi',
  'footer.legal': 'Notis Undang-undang',
  'footer.cookies': 'Dasar Kuki',
  'footer.disclaimer': 'Penafian',
  'lang.label': 'Bahasa',
  'a11y.skip': 'Langkau ke kandungan',
  'notfound.title': 'Halaman tidak dijumpai',
  'notfound.body': 'Halaman yang anda cari tidak wujud atau telah dipindahkan.',
  'notfound.back': 'Kembali ke laman utama',
  'bases.area': 'Keluasan',
  'bases.capacity': 'Kapasiti',
  'bases.crops': 'Tanaman utama',
  'bases.capability': 'Keupayaan utama',
  'eco.hub': 'Hab teknologi',
  'eco.manufacturing': 'Platform pembuatan',
  'eco.brand': 'Jenama sendiri',
  'eco.here': 'Laman ini',
  'footer.groupLine': 'Dipacu AI · Sains botani · Pembuatan untuk kecantikan',
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
  'footer.privacy': 'Politique de confidentialité',
  'footer.legal': 'Mentions légales',
  'footer.cookies': 'Politique de cookies',
  'footer.disclaimer': 'Avertissement',
  'lang.label': 'Langue',
  'a11y.skip': 'Aller au contenu',
  'notfound.title': 'Page introuvable',
  'notfound.body': "La page que vous recherchez n'existe pas ou a été déplacée.",
  'notfound.back': "Retour à l'accueil",
  'bases.area': 'Superficie',
  'bases.capacity': 'Capacité',
  'bases.crops': 'Cultures principales',
  'bases.capability': 'Capacité principale',
  'eco.hub': 'Pôle technologique',
  'eco.manufacturing': 'Plateforme industrielle',
  'eco.brand': 'Marque propre',
  'eco.here': 'Site actuel',
  'footer.groupLine': "Piloté par l'IA · Science botanique · Fabriquer la beauté",
};

/**
 * 骨架词条表 = 人工定稿的六语 + 机器生成的三十语。
 * 人工的写在本文件里,永远压过生成表 —— 机器只补空缺,不覆盖定稿。
 * 想把某个语种"转正":把它整份从 ui.generated.ts 搬进本文件即可。
 */
// 键是**路径码**(jp/my),值是手写词表变量名(ja/ms)——
// 两者不同是有意的:路径走国家码,变量名跟着语言走。
const HUMAN = { 'zh-cn': zhCN, en, jp: ja, id, my: ms, fr } as Record<string, Record<UiKey, string>>;

export const ui = Object.fromEntries(
  LOCALES.map((l) => [l, HUMAN[l] ?? generated[l] ?? HUMAN.en]),
) as Record<Locale, Record<UiKey, string>>;

/**
 * 界面词表覆盖检查 —— 开发期跑,构建时不参与。
 *
 * 上面那行的 `?? HUMAN.en` 是兜底,好处是永远不会因为缺词表而白屏;
 * 坏处是**缺了也不吭声**:把路径码从 ja 改成 jp 那次,HUMAN 里还写着 ja,
 * 于是日语站的导航、按钮、页脚全部悄悄变成英文,页面照常渲染、构建照常通过。
 * 所以把"谁在吃兜底"显式列出来,别让它藏在一个 ?? 后面。
 */
export function uiCoverage(): { locale: string; source: 'human' | 'generated' | 'fallback-en' }[] {
  return LOCALES.map((l) => ({
    locale: l,
    source: HUMAN[l] ? 'human' : generated[l] ? 'generated' : 'fallback-en',
  }));
}

/** 取词函数工厂;overrides 供品牌皮肤覆盖个别词条 */
export function t(locale: Locale, overrides?: Partial<Record<UiKey, string>>) {
  return (key: UiKey): string => overrides?.[key] ?? ui[locale][key];
}
