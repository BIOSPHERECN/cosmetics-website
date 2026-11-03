/**
 * 意图落地页集(2026-09-16):买家真会搜的「某市场 × 某品类 × 找代工厂 / private label」。
 * 创始人:「GEO、SEO 真的要带来流量」;头条那篇外贸 SEO 评判标准里最实的一条 —— 盯 supplier / manufacturer / private label 这类采购意图词。
 * 站上此前 0 页含 private label,没有一页是按市场 × 品类组织的落地页。
 * 路由 /[lang]/oem/[market]/[category]/,内容全部由库里的真数拼:法规表(备案 / 责任人 / 标签)、配方库计数、包材库计数、买手问答。
 * 不写起订量 / 交期 / 价格(lib/terms.ts 铁令)。
 */
export const OEM_MARKETS = [
  { id: 'id', en: 'Indonesia', zh: '印尼', adj: 'Indonesian', halal: true },
  { id: 'my', en: 'Malaysia', zh: '马来西亚', adj: 'Malaysian', halal: true },
  { id: 'sa', en: 'Saudi Arabia', zh: '沙特', adj: 'Saudi', halal: true },
  { id: 'ae', en: 'the UAE', zh: '阿联酋', adj: 'UAE', halal: true },
  { id: 'ph', en: 'the Philippines', zh: '菲律宾', adj: 'Philippine', halal: false },
  { id: 'vn', en: 'Vietnam', zh: '越南', adj: 'Vietnamese', halal: false },
  { id: 'th', en: 'Thailand', zh: '泰国', adj: 'Thai', halal: false },
  { id: 'us', en: 'the United States', zh: '美国', adj: 'US', halal: false },
  /* 2026-09-22 拉美六国(牙膏片推广,任务 Y/Z):法规表已有 br / mx / cl / ar / pe,co 缺则页面不出法规块 */
  { id: 'br', en: 'Brazil', zh: '巴西', adj: 'Brazilian', halal: false },
  { id: 'mx', en: 'Mexico', zh: '墨西哥', adj: 'Mexican', halal: false },
  { id: 'co', en: 'Colombia', zh: '哥伦比亚', adj: 'Colombian', halal: false },
  { id: 'cl', en: 'Chile', zh: '智利', adj: 'Chilean', halal: false },
  { id: 'ar', en: 'Argentina', zh: '阿根廷', adj: 'Argentine', halal: false },
  { id: 'pe', en: 'Peru', zh: '秘鲁', adj: 'Peruvian', halal: false },
] as const;

export const OEM_CATEGORIES = [
  { id: 'skincare', en: 'skincare', zh: '护肤', cats: ['skincare'], packs: ['airless-bottle', 'dropper-bottle', 'jar', 'pump-bottle'] },
  { id: 'body-care', en: 'body care', zh: '身体护理', cats: ['body'], packs: ['pump-bottle', 'tube', 'jar'] },
  { id: 'hair-care', en: 'hair care', zh: '洗护发', cats: ['haircare'], packs: ['pump-bottle', 'tube'] },
  { id: 'cleansing', en: 'cleansing', zh: '清洁', cats: ['cleansing'], packs: ['pump-bottle', 'tube', 'foam-pump'] },
  { id: 'sun-care', en: 'sun care', zh: '防晒', cats: ['suncare'], packs: ['tube', 'airless-bottle', 'pump-bottle'] },
  { id: 'makeup', en: 'colour cosmetics', zh: '彩妆', cats: ['makeup'], packs: ['lipstick-tube', 'compact-powder-case', 'cushion-compact', 'lip-gloss-tube'] },
  /* 2026-09-22 口腔护理(牙膏 / 洁牙片 / 漱口水,formulas.category='oral' 19 条,含三条 tooth-tablet 基底) */
  { id: 'oral-care', en: 'oral care', zh: '口腔护理', cats: ['oral'], packs: ['tube', 'jar', 'pump-bottle'] },
] as const;

/* 2026-09-23 GEO 第 5 条:意图页的「认证」维度。**只列真有的** —— 以知识库「工厂口径」页(playbooks.factory-terms 认证行:
   GMPC · ISO 22716 · HALAL,官网口径)为准。ORG.certs 里的 FDA / EU CPNP / SGS 是注册、通报与检测机构,不是工厂认证,不进这里。
   高新技术企业(2024)待创始人确认后再加(记忆 project-bohui-facts-authority)。路由 /[lang]/oem/cert/[cert]/。
   markets:该认证在哪些意图页市场最常被问到(HALAL 用 OEM_MARKETS 的 halal 标记)。 */
export const OEM_CERTS = [
  { id: 'gmpc', name: 'GMPC', markets: 'all' },
  { id: 'iso-22716', name: 'ISO 22716', markets: 'all' },
  { id: 'halal', name: 'HALAL', markets: 'halal' },
] as const;
export type OemCert = (typeof OEM_CERTS)[number];

export type OemMarket = (typeof OEM_MARKETS)[number];
export type OemCategory = (typeof OEM_CATEGORIES)[number];
