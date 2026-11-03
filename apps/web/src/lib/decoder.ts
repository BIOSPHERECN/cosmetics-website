/**
 * 成分解读页共用的小工具(创始人 2026-09-17:看了 INCIDecoder 说「他们的信息好像更全,是需要学习的,
 * 我们是不是也可以变成这样」「这些其实也是可以对外的」)。
 * 列表页、详情页、sitemap 三处都要拼同一个 URL 与切同一份全成分,放一处免得三份口径漂移。
 */

/** 产品页 slug:brand+title 小写、非字母数字换 -、截 60;路由只按前缀 id 取行,slug 错了 301 到正确的 */
/** 展示用产品名:标题开头已含品牌就不再重复(Medicube medicube …);截 n 字后去掉尾巴的分隔符(| · , -) */
export function displayTitle(brand: string | null | undefined, title: string | null | undefined, n = 70): string {
  let t = (title ?? '').trim(); const b = (brand ?? '').trim();
  if (b && t.toLowerCase().startsWith(b.toLowerCase())) t = t.slice(b.length).replace(/^[\s:|·,-]+/, '');
  return (b ? b + ' ' + t : t).slice(0, n).replace(/[\s|·,:;-]+$/, '');
}
export function decoderSlug(brand: string | null | undefined, title: string | null | undefined): string {
  return displayTitle(brand, title, 200).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'p';
}
export const decoderPath = (lang: string, id: number, brand?: string | null, title?: string | null) =>
  `/${lang}/decoder/${id}-${decoderSlug(brand, title)}/`;

/** 原料页 slug:inci_key 小写、非字母数字换 -、截 80(与 tools/ingredients/structures.py slug() 同口径,结构图 png 就按它命名)。
 *  创始人 2026-09-17:「那么多这种资源库,都要抓回来,图文的方式展示」—— 解读页成分胶囊、原料页、sitemap 三处同一个 URL。 */
export const ingredientSlug = (inciKey: string) => inciKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
export const ingredientPath = (lang: string, inciKey: string) => `/${lang}/ingredients/${ingredientSlug(inciKey)}/`;

/** 全成分切分:逗号/分号,但「1,2-Hexanediol」里的数字逗号不切;去括号内容 */
/* 09-22 P 线实测:源文本里位号逗号后带空格时(`Aqua, 1, 2-Hexanediol`),上面那条 lookahead 会失效,
 *  切出 `1` / `3-DIOL` / `5-DIAMINE` / `2-BROMO-2-NITROPROPANE-1` 这类碎片 —— 全库 667 个碎片键、
 *  10,385 次出现,光 `1` 这一个键 freq 就有 1362,挂在解读页上是垃圾。
 *  不改正则:P 线消融实测过,`·•‧∙・`、换行、` - ` 逐个加进分隔符,与 OBF 的一致率全下降
 *  (97.73% → 96.32% / 93.81%),`・` 在日文名里、` - ` 在 `PARAFFINUM LIQUIDUM -CERA` 之外都有合法用法。
 *  改成切完再把位号碎片接回去:后一段形如 `2-` 开头、且前一段结尾的数字串不超过 2 位 → 同一个名字。
 *  `CI 17200, 12-Hydroxystearic` 不会被误接,因为 17200 是 5 位数。 */
const LOCANT_HEAD = /^\d{1,2}\s*[-–－]/;
const LOCANT_TAIL = /(?:^|\D)\d{1,2}$/;
function joinLocants(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev !== undefined && LOCANT_HEAD.test(p) && LOCANT_TAIL.test(prev)) out[out.length - 1] = `${prev},${p}`;
    else out.push(p);
  }
  return out;
}
export function splitInci(s: string | null | undefined): string[] {
  return joinLocants(String(s ?? '').split(/[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))/)   /* 09-18:逗号只在「1,2-」位号里不切;旧 (?<!\d) 把「CI 17200, MIT」黏成一个键 */.map((x) => x.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean));
}
/** ingredient_facts.inci_key 口径:去括号、大写、空白压一格(与 D 任务建表约定一致) */
/* 09-22:这份一直没有脏字符段，跟平台仓的 factKey 对不上（`Aloe Barbadensis Leaf Juice*` 会带着星号入库）。
 *  补齐为两段：**不可见字符删除**（换空格会把 `JOJOBATE` 裂成 `JO JOBATE`），可见脏字符换空格。
 *  与 skin2oem 同文件、tools/platform/_pd1.py 同一套。 */
export const factKey = (name: string) => name.replace(/[（(][^）)]*[）)]/g, ' ').replace(/[\u2060\u00ad\ufeff\u200b\u200c\u200d\ufffc]/g, '').replace(/[*„†‡+\()\[\]{}]/g, ' ').toUpperCase().replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').replace(/(\d)\s*,\s*(?=\d)/g, '$1,');   /* 09-22:位号逗号两侧压掉空白,`1, 2-HEXANEDIOL` 与既有 `1,2-HEXANEDIOL` 才是同一个键 */   // 与 tools/ingredients/facts-build.py inci_key() 同口径(含去首尾句点)

/** 市场简称 → 名称(与后台 hot.astro 的 MK_ZH 同一份,加英文) */
export const MARKET: Record<string, [string, string]> = {
  us: ['美国', 'United States'], kr: ['韩国', 'Korea'], jp: ['日本', 'Japan'], eu: ['欧盟 / 英国', 'EU / UK'], uk: ['英国', 'UK'],
  id: ['印尼', 'Indonesia'], my: ['马来西亚', 'Malaysia'], th: ['泰国', 'Thailand'], vn: ['越南', 'Vietnam'], au: ['澳洲', 'Australia'], cn: ['中国', 'China'], ph: ['菲律宾', 'Philippines'], sg: ['新加坡', 'Singapore'], sa: ['沙特', 'Saudi Arabia'], ae: ['阿联酋', 'UAE'], br: ['巴西', 'Brazil'], mx: ['墨西哥', 'Mexico'], gl: ['全球', 'Global'],   // gl = INCIDecoder 收录的各国品牌,不分国家(09-17 22:2x 直接吃 WorkBuddy JSON 进库)
};
/** 09-21 创始人:「页面一定要随着语言切换翻译」。market_products 的类目存的是中文(cat_zh)或英文 slug(cat),EN 页按这张表翻;没有的原样 */
export const CAT_ZH_EN: Record<string, string> = {
  '其他': 'Other', '面霜': 'Cream', '精华': 'Serum', '洁面': 'Cleanser', '护肤': 'Skincare', '面膜': 'Mask', '防晒': 'Sunscreen', '洗发': 'Shampoo',
  '粉底': 'Foundation', '口红': 'Lipstick', '身体乳': 'Body lotion', '护发素': 'Conditioner', '彩妆': 'Makeup', '身体': 'Body care', '洗发护发': 'Hair care',
  '牙膏': 'Toothpaste', '男士': 'Men', '儿童': 'Kids', '口腔': 'Oral care', '香水': 'Fragrance', '护发': 'Hair care', '眼霜': 'Eye cream', '乳液': 'Lotion',
  '化妆水': 'Toner', '卸妆': 'Makeup remover', '沐浴': 'Body wash', '唇膏': 'Lip balm', '眼影': 'Eyeshadow', '睫毛膏': 'Mascara', '腮红': 'Blush',
  '气垫': 'Cushion', '遮瑕': 'Concealer', '散粉': 'Powder', '眉笔': 'Brow pencil', '唇釉': 'Lip gloss', '手霜': 'Hand cream', '足部': 'Foot care',
  '喷雾': 'Mist', '精油': 'Oil', '发膜': 'Hair mask', '染发': 'Hair colour', '造型': 'Styling', '止汗': 'Deodorant', '剃须': 'Shaving', '漱口水': 'Mouthwash',
  beauty: 'Beauty', 'hair-care': 'Hair care', makeup: 'Makeup', skincare: 'Skincare', 'body-care': 'Body care', 'oral-care': 'Oral care', fragrance: 'Fragrance',
};
export const catLabel = (k: string | null | undefined, zh: boolean): string => {
  if (!k) return '';
  if (zh) return k;
  return CAT_ZH_EN[k] ?? k.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};
/** 采集来的标题尾巴常带「 成分」(成分页标题),显示时去掉 */
export const cleanTitle = (t: string | null | undefined): string => String(t ?? '').replace(/\s*成分\s*$/, '').trim();
export const marketLabel = (c: string | null | undefined, zh: boolean) =>
  c ? (MARKET[c] ? MARKET[c][zh ? 0 : 1] : c.toUpperCase()) : (zh ? '其他' : 'Other');

/** tags 固定取值集合 → 「无 X / 含 X」文案 */
export const TAG_LABEL: Record<string, [string, string]> = {
  alcohol: ['酒精', 'alcohol'], fragrance: ['香精', 'fragrance'], allergen26: ['26 种致敏原', 'EU-26 allergens'],
  paraben: ['对羟基苯甲酸酯', 'parabens'], silicone: ['硅', 'silicones'], sulfate: ['硫酸盐', 'sulfates'],
  'essential-oil': ['精油', 'essential oils'], 'mineral-oil': ['矿物油', 'mineral oil'], peg: ['PEG', 'PEG'],
  'formaldehyde-releaser': ['甲醛释放体', 'formaldehyde releasers'], 'animal-derived': ['动物来源', 'animal-derived'],
};
