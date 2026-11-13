/**
 * 首页 title / description(GEO-008)。
 *
 * en / zh 的 CMS 文案已经是广州 OEM/ODM。id、ar 以及其它语种的旧译文仍是
 * 「AI platform」。这里只替换看不出工厂 / 代工意图的标题,不覆盖已经写对的 CMS 文案。
 * 替换句与 /llms.txt、Organization 同一口径:广州帛卉,BIOSPHERE 是出口品牌,OEM/ODM/OBM。
 * 不写起订量,不新增认证。
 *
 * 英文首页若 CMS 标题（加上布局补的 `| BIOSPHERE-AI`）超过约 60 字，
 * 或描述超过 160 字，改用 EN_HOME_SNIPPET。只保留已经公开的事实：
 * 广州工厂、sampling、compliance dossier、15 automated lines、GMPC / ISO 22716 / HALAL。
 * 不新增数字。其它语种仍按上面的规则，不在这里改写。
 */

export interface HomeSeo {
  title: string;
  description: string;
}

/**
 * 英文首页搜索摘要。title 不含站点名，BaseLayout 会补 `| BIOSPHERE-AI`。
 * 描述约 155–160 字，且是完整句。
 */
export const EN_HOME_SNIPPET: HomeSeo = {
  title: 'Cosmetics OEM / ODM factory in Guangzhou',
  description: 'The BIOSPHERE factory at the Guangzhou plant handles both sampling and a compliance dossier for buyers, on 15 automated lines, with GMPC / ISO 22716 / HALAL.',
};

function renderedHomeTitle(title: string): string {
  return title.includes('BIOSPHERE-AI') ? title : `${title} | BIOSPHERE-AI`;
}

function shortenEnglishHome(seo: HomeSeo): HomeSeo {
  if (renderedHomeTitle(seo.title).length <= 60 && seo.description.length <= 160) return seo;
  return EN_HOME_SNIPPET;
}

/** 已经能看出工厂或代工意图的,留下 CMS 原文。 */
const FACTORY = /OEM|ODM|OBM|代工|工厂|工廠|製造|제조|pabrik|produsen|مصنع|usine|Hersteller|завод|โรงงาน|nhà máy|fábrica|fabrika|manufacturer|contract/i;

const OEM: Record<string, HomeSeo> = {
  en: {
    title: 'Guangzhou herbal cosmetics OEM / ODM manufacturer | BIOSPHERE',
    description: 'Cosmetics OEM / ODM / OBM contract manufacturer in Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., founded 2012). BIOSPHERE is its export brand. All production runs from the Guangzhou plant.',
  },
  'zh-cn': {
    title: '广州草本化妆品 OEM / ODM 代工厂 | BIOSPHERE',
    description: '位于中国广州的化妆品 OEM / ODM / OBM 代工厂(广州市帛卉化妆品有限公司,成立于 2012 年)。BIOSPHERE 是其出口品牌。生产与交付均在广州工厂。',
  },
  'zh-tw': {
    title: '廣州草本化妝品 OEM / ODM 代工廠 | BIOSPHERE',
    description: '位於中國廣州的化妝品 OEM / ODM / OBM 代工廠(廣州市帛卉化妝品有限公司,成立於 2012 年)。BIOSPHERE 是其出口品牌。生產與交付均在廣州工廠。',
  },
  jp: {
    title: '広州のハーブ化粧品 OEM / ODM 工場 | BIOSPHERE',
    description: '中国・広州の化粧品 OEM / ODM / OBM 受託メーカー(広州帛卉化粧品有限公司、2012 年設立)。BIOSPHERE はその輸出ブランドです。製造は広州工場で行います。',
  },
  kr: {
    title: '광저우 허브 화장품 OEM / ODM 제조 | BIOSPHERE',
    description: '중국 광저우의 화장품 OEM / ODM / OBM 수탁 제조사(광저우 보후이 화장품 유한공사, 2012년 설립). BIOSPHERE는 수출 브랜드입니다. 생산은 광저우 공장에서 합니다.',
  },
  fr: {
    title: 'Fabricant OEM / ODM de cosmétiques herbaux à Guangzhou | BIOSPHERE',
    description: 'Façonnier cosmétique OEM / ODM / OBM à Guangzhou, Chine (Guangzhou Bohui Cosmetics Co., Ltd., fondée en 2012). BIOSPHERE est sa marque export. Toute la production est à l’usine de Guangzhou.',
  },
  de: {
    title: 'Kräuterkosmetik OEM / ODM Hersteller in Guangzhou | BIOSPHERE',
    description: 'Kosmetik-Lohnhersteller (OEM / ODM / OBM) in Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., gegründet 2012). BIOSPHERE ist die Exportmarke. Die Produktion läuft im Werk Guangzhou.',
  },
  ru: {
    title: 'OEM / ODM производитель травяной косметики в Гуанчжоу | BIOSPHERE',
    description: 'Контрактное производство косметики OEM / ODM / OBM в Гуанчжоу, Китай (Guangzhou Bohui Cosmetics Co., Ltd., основана в 2012). BIOSPHERE — экспортный бренд. Производство на заводе в Гуанчжоу.',
  },
  id: {
    title: 'Produsen OEM / ODM kosmetik herbal Guangzhou | BIOSPHERE',
    description: 'Pabrik kontrak kosmetik OEM / ODM / OBM di Guangzhou, Tiongkok (Guangzhou Bohui Cosmetics Co., Ltd., berdiri 2012). BIOSPHERE adalah merek ekspornya. Produksi berjalan di pabrik Guangzhou.',
  },
  my: {
    title: 'Pengeluar OEM / ODM kosmetik herba Guangzhou | BIOSPHERE',
    description: 'Kilang kontrak kosmetik OEM / ODM / OBM di Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., ditubuhkan 2012). BIOSPHERE ialah jenama eksportnya. Pengeluaran di kilang Guangzhou.',
  },
  th: {
    title: 'โรงงาน OEM / ODM เครื่องสำอางสมุนไพรที่กว่างโจว | BIOSPHERE',
    description: 'โรงงานรับจ้างผลิตเครื่องสำอาง OEM / ODM / OBM ที่กว่างโจว ประเทศจีน (Guangzhou Bohui Cosmetics Co., Ltd. ก่อตั้งปี 2012) BIOSPHERE คือแบรนด์ส่งออก การผลิตอยู่ที่โรงงานกว่างโจว',
  },
  vn: {
    title: 'Nhà máy OEM / ODM mỹ phẩm thảo dược Quảng Châu | BIOSPHERE',
    description: 'Nhà máy gia công mỹ phẩm OEM / ODM / OBM tại Quảng Châu, Trung Quốc (Guangzhou Bohui Cosmetics Co., Ltd., thành lập 2012). BIOSPHERE là thương hiệu xuất khẩu. Sản xuất tại nhà máy Quảng Châu.',
  },
  ph: {
    title: 'OEM / ODM na tagagawa ng herbal na kosmetiko sa Guangzhou | BIOSPHERE',
    description: 'Contract manufacturer ng kosmetiko (OEM / ODM / OBM) sa Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., itinatag 2012). Ang BIOSPHERE ang export brand. Ang produksyon ay sa planta sa Guangzhou.',
  },
  es: {
    title: 'Fabricante OEM / ODM de cosmética herbal en Guangzhou | BIOSPHERE',
    description: 'Fabricante por contrato de cosmética OEM / ODM / OBM en Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., fundada en 2012). BIOSPHERE es su marca de exportación. La producción está en la planta de Guangzhou.',
  },
  pt: {
    title: 'Fabricante OEM / ODM de cosméticos herbais em Guangzhou | BIOSPHERE',
    description: 'Fabricante por contrato de cosméticos OEM / ODM / OBM em Guangzhou, China (Guangzhou Bohui Cosmetics Co., Ltd., fundada em 2012). BIOSPHERE é a marca de exportação. A produção fica na fábrica de Guangzhou.',
  },
  ar: {
    title: 'مصنع OEM / ODM لمستحضرات التجميل العشبية في قوانغتشو | BIOSPHERE',
    description: 'مصنع تعاقدي لمستحضرات التجميل OEM / ODM / OBM في قوانغتشو، الصين (شركة قوانغتشو بوهوي لمستحضرات التجميل المحدودة، تأسست 2012). BIOSPHERE هي علامتها للتصدير. الإنتاج في مصنع قوانغتشو.',
  },
  tr: {
    title: 'Guangzhou bitkisel kozmetik OEM / ODM üreticisi | BIOSPHERE',
    description: 'Guangzhou, Çin’de kozmetik OEM / ODM / OBM fason üreticisi (Guangzhou Bohui Cosmetics Co., Ltd., 2012’de kuruldu). BIOSPHERE ihracat markasıdır. Üretim Guangzhou tesisindedir.',
  },
  in: {
    title: 'गुआंगझोउ हर्बल कॉस्मेटिक OEM / ODM निर्माता | BIOSPHERE',
    description: 'गुआंगझोउ, चीन में कॉस्मेटिक OEM / ODM / OBM अनुबंध निर्माता (Guangzhou Bohui Cosmetics Co., Ltd., स्थापना 2012)। BIOSPHERE इसका निर्यात ब्रांड है। उत्पादन गुआंगझोउ संयंत्र में होता है।',
  },
};

export function homeSeo(lang: string, title: string, description: string | null): HomeSeo {
  const current = { title: title || '', description: description || '' };
  const picked = FACTORY.test(`${current.title}\n${current.description}`) ? current : (OEM[lang] ?? OEM.en);
  if (lang === 'en') return shortenEnglishHome(picked);
  return picked;
}
