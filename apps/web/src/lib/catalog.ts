/**
 * 配方与包材的中英文标签,以及品名拼法。
 *
 * 抽出来的原因很实际:同一份剂型对照表我先后抄进了配方详情页、解决方案页、配方货架页三个文件,
 * 三处已经开始不一致(有的有 cushion,有的没有)。展示层的口径必须只有一份,
 * 否则同一条配方在不同页面上叫不同的名字,客户会以为是两款东西。
 *
 * 命名规则跟同行学的一条(rbh01-148塑料膏霜瓶):**编码 + 材质/功效 + 品类**。
 * 好处是标题本身就是检索词,而且客户复述给同事时不会丢信息。
 */

type Pair = [zh: string, en: string];

export const FMT_LABEL: Record<string, Pair> = {
  // ── 2026-09-09 补齐 ── 中文名与 tools/formula-build.py 的 FMT 表一致
  'body-lotion': ['身体乳', 'Body lotion'], 'body-wash': ['沐浴露', 'Body wash'],
  'body-mist': ['身体香氛喷雾', 'Body mist'], 'body-spray': ['身体护理喷雾', 'Body care spray'],
  'hand-cream': ['护手霜', 'Hand cream'], 'eye-cream': ['眼霜', 'Eye cream'],
  'cleansing-gel': ['洁面啫喱', 'Cleansing gel'], 'cleansing-oil': ['卸妆油', 'Cleansing oil'],
  micellar: ['卸妆水', 'Micellar water'], 'jelly-mask': ['冻膜', 'Jelly mask'],
  'sun-lotion': ['防晒乳', 'Sun lotion'], 'sun-stick': ['防晒棒', 'Sun stick'],
  'sun-spray': ['防晒喷雾', 'Sun spray'],
  toothpaste: ['牙膏', 'Toothpaste'], mouthwash: ['漱口水', 'Mouthwash'],
  'tooth-tablet': ['洁牙片', 'Tooth tablet'], 'oral-spray': ['口腔喷雾', 'Oral spray'],
  'tooth-strip': ['牙贴', 'Tooth strip'], 'gum-powder': ['牙龈护理粉', 'Gum care powder'],
  'kids-cream': ['儿童面霜', 'Kids cream'], 'kids-lotion': ['儿童乳液', 'Kids lotion'],
  'kids-wash': ['儿童洗沐', 'Kids wash'], 'kids-shampoo': ['儿童洗发', 'Kids shampoo'],
  edt: ['淡香水 EDT', 'Eau de toilette'], edp: ['浓香水 EDP', 'Eau de parfum'],
  'solid-perfume': ['固体香膏', 'Solid perfume'],
  shampoo: ['洗发水', 'Shampoo'], conditioner: ['护发素', 'Conditioner'],
  'hair-mask': ['发膜', 'Hair mask'], 'hair-oil': ['护发精油', 'Hair oil'],
  'hair-essence': ['免洗护发精华', 'Leave-in hair essence'],
  serum: ['精华', 'Serum'], essence: ['精华水', 'Essence'], ampoule: ['安瓶', 'Ampoule'],
  cream: ['面霜', 'Cream'], lotion: ['乳液', 'Lotion'], mask: ['面膜', 'Sheet mask'],
  gel: ['凝胶', 'Gel'], oil: ['面油', 'Face oil'], balm: ['膏霜', 'Balm'], stick: ['棒状', 'Stick'],
  foam: ['洁面', 'Cleanser'], powder: ['粉状', 'Powder'], cushion: ['气垫', 'Cushion'],
  lipstick: ['唇膏', 'Lipstick'], patch: ['贴片', 'Patch'], toner: ['化妆水', 'Toner'],
  mist: ['喷雾', 'Mist'], scrub: ['磨砂', 'Scrub'], spray: ['喷雾', 'Spray'],
  'sleeping-mask': ['睡眠面膜', 'Sleeping mask'], 'sheet-mask': ['贴片面膜', 'Sheet mask'],
  'bio-cellulose-mask': ['生物纤维膜', 'Bio-cellulose mask'], 'eye-patch': ['眼贴', 'Eye patch'],
  'lip-mask': ['唇膜', 'Lip mask'], mud: ['泥膜', 'Clay mask'],
  'powder+ampoule': ['冻干粉配安瓶', 'Lyophilised powder + ampoule'],
  spf: ['防晒', 'Sunscreen'], foundation: ['粉底', 'Foundation'],
  concealer: ['遮瑕', 'Concealer'], pencil: ['眉笔／唇线笔', 'Pencil'],
  mascara: ['睫毛膏', 'Mascara'], gloss: ['唇釉', 'Lip gloss'],
};

export const BEN_LABEL: Record<string, Pair> = {
  // ── 2026-09-09 补齐 ── 库里在用但没有译名的 49 个,客户看到的是 slug 本身
  /* 2026-09-10 体检补齐:草本线 / 亚马逊线的组合标签(tools/formula-build.py Q4 那批) */
  herbal: ['草本', 'Herbal'], 'herbal-soothing': ['草本舒缓', 'Herbal soothing'],
  'herbal-oil-control': ['草本控油', 'Herbal oil control'], 'herbal-brightening': ['草本提亮', 'Herbal brightening'],
  'herbal-repair': ['草本修护', 'Herbal repair'], 'herbal-antioxidant': ['草本抗氧', 'Herbal antioxidant'],
  'herbal-nourishing': ['草本滋养', 'Herbal nourishing'], 'herbal-barrier': ['草本屏障', 'Herbal barrier'],
  'amazon-nourishing': ['亚马逊植物滋养', 'Amazonian nourishing'], 'amazon-antioxidant': ['亚马逊植物抗氧', 'Amazonian antioxidant'],
  polysaccharide: ['多糖保湿', 'Polysaccharide hydration'], plateau: ['高原植物', 'Plateau botanicals'],
  antibacterial: ['抑菌', 'Antibacterial'], balance: ['平衡', 'Balancing'],
  blendable: ['易推开', 'Blendable'], buildable: ['可叠加', 'Buildable'],
  comfortable: ['肤感舒适', 'Comfortable'], dewy: ['水光感', 'Dewy'],
  'fast-absorbing': ['吸收快', 'Fast-absorbing'], fragrance: ['香氛', 'Fragrance'],
  fresh: ['清新', 'Fresh'], 'fresh-breath': ['清新口气', 'Fresh breath'],
  glossy: ['镜面光泽', 'Glossy'], 'gum-care': ['牙龈护理', 'Gum care'],
  'hair-cleanse': ['头发清洁', 'Hair cleansing'], 'hair-repair': ['头发修护', 'Hair repair'],
  'halal-ready': ['可配套清真', 'Halal-ready'], kids: ['儿童', 'Kids'],
  'kids-gentle': ['儿童温和', 'Kids gentle'], 'kids-soothing': ['儿童舒缓', 'Kids soothing'],
  'large-size': ['大容量', 'Large size'], lengthening: ['纤长', 'Lengthening'],
  'long-lasting': ['持久', 'Long-lasting'], 'long-wear': ['持妆', 'Long-wear'],
  'low-whitecast': ['低泛白', 'Low white cast'], 'makeup-base': ['妆前', 'Makeup base'],
  matte: ['哑光', 'Matte'], mens: ['男士', 'Men'],
  'natural-finish': ['自然妆效', 'Natural finish'], 'no-hands': ['免手涂', 'No-hands'],
  outdoor: ['户外', 'Outdoor'], pigmented: ['高显色', 'Pigmented'],
  portable: ['便携', 'Portable'], precise: ['精准描画', 'Precise'],
  probiotic: ['益生元', 'Probiotic'], 'quick-reapply': ['快速补涂', 'Quick reapply'],
  reapplication: ['补涂', 'Reapplication'], refillable: ['可替换芯', 'Refillable'],
  refreshing: ['清爽', 'Refreshing'], relief: ['缓解', 'Relief'],
  satin: ['缎面', 'Satin'], scent: ['留香', 'Scent'],
  'sensitive-teeth': ['牙齿敏感', 'Sensitive teeth'], setting: ['定妆', 'Setting'],
  smooth: ['顺滑', 'Smooth'], 'smudge-resistant': ['防晕染', 'Smudge-resistant'],
  stain: ['去渍', 'Stain removal'], 'talc-free': ['无滑石粉', 'Talc-free'],
  'tone-up': ['提亮肤色', 'Tone-up'], 'water-resistant': ['防水', 'Water-resistant'],
  'whitening-teeth': ['牙齿亮白', 'Teeth whitening'],
  hydrating: ['保湿', 'Hydrating'], barrier: ['屏障修护', 'Barrier repair'],
  brightening: ['提亮', 'Brightening'], 'anti-aging': ['抗老', 'Anti-ageing'],
  soothing: ['舒缓', 'Soothing'], sensitive: ['敏感肌', 'Sensitive skin'],
  'oil-control': ['控油', 'Oil control'], acne: ['祛痘方向', 'Blemish-prone'],
  firming: ['紧致', 'Firming'], repair: ['修护', 'Repair'], plumping: ['丰盈', 'Plumping'],
  daily: ['日常', 'Everyday'], cleansing: ['清洁', 'Cleansing'], whitening: ['亮肤', 'Radiance'],
  antioxidant: ['抗氧化', 'Antioxidant'], calming: ['镇静', 'Calming'],
  smoothing: ['平滑肤感', 'Smoothing'], 'uv-protection': ['防晒', 'UV protection'],
  nourishing: ['滋养', 'Nourishing'], repairing: ['修护', 'Repairing'],
  'lip-care': ['唇部护理', 'Lip care'], coverage: ['遮盖力', 'Coverage'],
  tinted: ['带色号', 'Tinted'], cooling: ['清凉感', 'Cooling'], gentle: ['温和', 'Gentle'],
  waterless: ['无水配方', 'Waterless'], conditioning: ['柔顺', 'Conditioning'],
  spf: ['防晒值', 'SPF'], lightweight: ['轻薄', 'Lightweight'],
  microbiome: ['微生态', 'Microbiome'], 'makeup-removal': ['卸妆', 'Makeup removal'],
  exfoliating: ['去角质', 'Exfoliating'], refill: ['可替换芯', 'Refillable'],
  'scalp-care': ['头皮护理', 'Scalp care'], elasticity: ['弹性', 'Elasticity'],
  'fragrance-free': ['无香', 'Fragrance-free'], 'clean-formula': ['成分精简', 'Clean formula'],
  'sensitive-skin': ['敏感肌', 'Sensitive skin'], 'pore-care': ['毛孔护理', 'Pore care'],
  clarifying: ['净透', 'Clarifying'], 'even-tone': ['匀净肤色', 'Even tone'],
  'daily-care': ['日常护理', 'Daily care'], body: ['身体', 'Body'],
};

/** 后台「产品与剂型」的品类(products.category)—— 产品列表、一页式编辑、批量导入共用这一张 */
export const PRODUCT_CAT: Record<string, string> = {
  skincare: '护肤', makeup: '彩妆', cleansing: '清洁', oral: '口腔护理',
  body: '身体护理', hair: '洗护', kids: '儿童护肤', fragrance: '香氛', suncare: '防晒',   // suncare:B2 历史产品导入的品类码
};

export const CAT_LABEL: Record<string, Pair> = {
  skincare: ['护肤', 'Skincare'], cleansing: ['清洁', 'Cleansing'], body: ['身体护理', 'Body care'],
  makeup: ['彩妆', 'Makeup'], oral: ['口腔护理', 'Oral care'], suncare: ['防晒', 'Suncare'],
  haircare: ['洗护', 'Hair care'], hair: ['洗护', 'Hair care'], mask: ['面膜', 'Masks'],
  kids: ['儿童护理', 'Kids care'], fragrance: ['香氛', 'Fragrance'],
};


/** 包材**用途**分类(创始人 2026-09-09 点名的十类)。
    与 PACK_TYPE_LABEL 的**结构**分类是两个维度:
    同一支 100ml PET 泵头瓶,结构上永远是 pump-bottle,用途上可以是乳液瓶也可以是防晒瓶。 */
export const PACK_USE_LABEL: Record<string, Pair> = {
  cream: ['膏霜瓶', 'Cream jar'], lotion: ['乳液瓶', 'Lotion bottle'],
  wash: ['洗护瓶', 'Wash bottle'], airless: ['真空瓶', 'Airless bottle'],
  dropper: ['滴管瓶', 'Dropper bottle'], suncare: ['防晒瓶', 'Sunscreen bottle'],
  foam: ['泡沫瓶', 'Foam pump bottle'], sample: ['试用装瓶', 'Sample bottle'],
  /* 2026-09-10 纸类与膜类(tools/pack-paper.py)。体检 tools/cat-audit.py 报出这 6 个用途露 slug */
  carton: ['彩盒', 'Folding carton'], gift: ['礼盒', 'Gift box'], leaflet: ['说明书', 'Leaflet'],
  label: ['标签', 'Label'], film: ['外封膜', 'Overwrap and shrink film'], shipper: ['运输箱', 'Shipping carton'],
  glass: ['玻璃瓶', 'Glass bottle'], serum: ['精华瓶', 'Serum bottle'],
};

/** 包材类型。表里现有 22 种取值,全部给中英对照 —— 缺一个,筛选栏上就露一个英文 slug 给客户看 */
export const PACK_TYPE_LABEL: Record<string, Pair> = {
  'airless-bottle': ['真空瓶', 'Airless bottle'], 'dropper-bottle': ['滴管瓶', 'Dropper bottle'],
  'pump-bottle': ['按压瓶', 'Pump bottle'], 'press-bottle': ['挤压瓶', 'Squeeze bottle'],
  /* 2026-09-08 视觉分类新增。这两种在旧词表里没有,而它们合起来占了近 400 款 ——
     旋盖瓶(无泵无喷)与翻盖瓶(掀盖/尖嘴)是采购真正会说的区分。 */
  'screw-bottle': ['旋盖瓶', 'Screw-cap bottle'],
  'flip-bottle': ['翻盖瓶', 'Flip-top bottle'],
  'spray-bottle': ['喷雾瓶', 'Spray bottle'], 'glass-bottle': ['玻璃瓶', 'Glass bottle'],
  'foam-pump': ['泡沫泵瓶', 'Foam pump bottle'], 'refill-core': ['可替换芯', 'Refill core'],
  'roll-on': ['走珠瓶', 'Roll-on'], ampoule: ['安瓶', 'Ampoule'],
  jar: ['膏霜罐', 'Cream jar'], tube: ['软管', 'Tube'], stick: ['棒管', 'Stick'],
  'serum-stick': ['精华棒', 'Serum stick'], 'lipstick-tube': ['口红管', 'Lipstick tube'],
  'lip-gloss-tube': ['唇釉管', 'Lip gloss tube'], 'lip-liner-pencil': ['唇线笔', 'Lip liner pencil'],
  'compact-powder-case': ['粉饼盒', 'Powder compact'], 'cushion-compact': ['气垫盒', 'Cushion compact'],
  'mask-pouch': ['面膜袋', 'Mask sachet'], sachet: ['小袋', 'Sachet'],
  'outer-carton': ['外纸盒', 'Outer carton'], 'travel-kit': ['旅行套装', 'Travel kit'],
  'gift-box': ['套装礼盒', 'Gift box'], 'display-box': ['展示盒', 'Display box'],
  'shipping-box': ['运输箱', 'Shipping carton'], 'insert-tray': ['内托', 'Insert tray'],
  'label-sticker': ['标签贴', 'Label'], 'shrink-film': ['收缩膜', 'Shrink film'],
  /* 2026-09-10 补纸类与膜类。创始人:「你还是瓶子,而不是真正的纸盒设计,或者烟包膜」——
     库里 4,476 条全是容器,客户下单的后半段(彩盒→说明书/标签→外箱→外封膜)一条都没有。 */
  'rigid-box': ['天地盖硬盒', 'Rigid box'],
  leaflet: ['说明书折页', 'Leaflet'],
  'overwrap-film': ['烟包膜', 'Overwrap film'],
  'shrink-sleeve': ['收缩套标', 'Shrink sleeve'],
  'seal-sticker': ['防拆封口贴', 'Tamper-evident seal'],
  sprayer: ['喷雾器', 'Sprayer'], cap: ['盖', 'Closure'], pump: ['泵头', 'Pump'],
  compact: ['粉盒', 'Compact'],
  /* 用途类:源站按「装什么」分类(膏霜护肤类、洗发沐浴类…),这说的不是瓶型。
     硬映射成形态会出错 —— 实测把一只带指槽的膏霜罐标成了「按压瓶」。
     所以如实存成用途,形态等有了尺寸图与视觉识别再补,不猜。 */
  'use-skincare': ['护肤容器', 'Skincare container'],
  'use-wash': ['洗护容器', 'Wash container'],
  'use-baby': ['婴童容器', 'Baby container'],
  'use-makeup': ['彩妆容器', 'Makeup container'],
  'use-home': ['家清容器', 'Home care container'],
  'use-gift': ['礼赠套装', 'Gift set'],
  'use-other': ['其它容器', 'Other container'],
  泵头: ['泵头', 'Pump'], 瓶身: ['瓶身', 'Bottle'], 软管: ['软管', 'Tube'],
  膏霜罐: ['膏霜罐', 'Cream jar'], 喷雾器: ['喷雾器', 'Sprayer'], 盖: ['盖', 'Closure'],
};

/**
 * 类型大类。二十二种类型摊在筛选栏上,一半的计数是 1 —— 那不是筛选,是目录。
 * 所以先按大类收(瓶 / 罐 / 管 / 彩妆容器 / 袋盒 / 配件),点进大类再看具体类型。
 */
export const PACK_GROUP: Record<string, Pair> = {
  bottle: ['瓶', 'Bottles'], jar: ['罐', 'Jars'], tube: ['管', 'Tubes'],
  makeup: ['彩妆容器', 'Makeup containers'], pouch: ['袋材', 'Pouches'],
  carton: ['纸盒与套装', 'Cartons and sets'], part: ['配件', 'Components'],
  /* 按用途:源站有一半的条目只给了用途没给瓶型,单独成一个大类,不混进形态里 */
  use: ['按用途', 'By use'],
};

const GROUP_OF: Record<string, keyof typeof PACK_GROUP | string> = {
  'airless-bottle': 'bottle', 'dropper-bottle': 'bottle', 'pump-bottle': 'bottle',
  'press-bottle': 'bottle', 'spray-bottle': 'bottle', 'glass-bottle': 'bottle',
  'screw-bottle': 'bottle', 'flip-bottle': 'bottle',
  'foam-pump': 'bottle', 'refill-core': 'bottle', 'roll-on': 'bottle', ampoule: 'bottle',
  jar: 'jar', 'cushion-compact': 'makeup', 'compact-powder-case': 'makeup',
  'lipstick-tube': 'makeup', 'lip-gloss-tube': 'makeup', 'lip-liner-pencil': 'makeup',
  tube: 'tube', stick: 'tube', 'serum-stick': 'tube',
  'mask-pouch': 'pouch', sachet: 'pouch', 'shrink-film': 'pouch',
  /* use-gift 是「礼盒套装」——源标题按用途分的类,但它本身就是纸盒。
     挂在「按用途」组里会让纸盒那一栏只剩 2 款,采购找礼盒会以为我们没有。 */
  'use-gift': 'carton',
  'outer-carton': 'carton', 'travel-kit': 'carton', 'gift-box': 'carton',
  'rigid-box': 'carton', leaflet: 'carton', 'overwrap-film': 'carton',
  'shrink-sleeve': 'carton', 'seal-sticker': 'carton',
  'display-box': 'carton', 'shipping-box': 'carton', 'insert-tray': 'carton',
  sprayer: 'part', cap: 'part', pump: 'part', 'label-sticker': 'part',
  'use-skincare': 'use', 'use-wash': 'use', 'use-baby': 'use', 'use-makeup': 'use',
  'use-home': 'use', 'use-other': 'use',
};

export const packGroup = (type: string): string => GROUP_OF[type] ?? 'part';

export const label = (m: Record<string, Pair>, k: string, zh: boolean) =>
  m[k] ? (zh ? m[k][0] : m[k][1]) : k;

/** 配方品名:主功效 + 剂型 + 编码,例如「屏障修护乳液 CL-4110」 */
export function formulaName(r: { code: string; format: string; benefits?: string }, zh: boolean): string {
  const b = String(r.benefits ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const ben = b ? label(BEN_LABEL, b, zh) : '';
  const fmt = label(FMT_LABEL, r.format, zh);
  return zh ? `${ben}${fmt} ${r.code}` : `${ben ? ben + ' ' : ''}${fmt} ${r.code}`.trim();
}

/**
 * 材质大类。material 字段存的是整句描述
 * (例如「PP 瓶身+PET 外壳+PP 活塞泵头(无金属弹簧可选)」),
 * 直接按 + 号切第一段会得到「PP 瓶身」—— 拿它当品名别扭,拿它当筛选项更糟:
 * 四十二款能切出四十二个互不相同的值,筛选形同虚设。
 * 所以按关键词归到大类,顺序有讲究:先认更具体的(PCR、PETG),再认笼统的(PET、PP)。
 */
const MAT_FAMILY: [RegExp, Pair][] = [
  [/PCR/i, ['PCR 再生料', 'PCR resin']],
  [/玻璃|glass/i, ['玻璃', 'Glass']],
  [/铝|aluminium|aluminum/i, ['铝', 'Aluminium']],
  [/PETG/i, ['PETG', 'PETG']],
  [/亚克力|PMMA|acrylic/i, ['亚克力', 'Acrylic']],
  [/竹|木|bamboo|wood/i, ['竹木', 'Bamboo / wood']],
  [/不锈钢|stainless/i, ['不锈钢', 'Stainless steel']],
  [/PET/i, ['PET', 'PET']],
  [/\bPP\b/i, ['PP', 'PP']],
  [/\bPE\b|HDPE|LDPE/i, ['PE', 'PE']],
  [/ABS/i, ['ABS', 'ABS']],
  [/纸|paper|carton/i, ['纸材', 'Paper']],
];

export function materialFamily(material: string | null | undefined, zh: boolean): string {
  const s = String(material ?? '');
  for (const [re, pair] of MAT_FAMILY) if (re.test(s)) return zh ? pair[0] : pair[1];
  return '';
}

/** 包材品名:材质大类 + 类型 + 编码,例如「PP 真空瓶 AB-101」 */
export function packName(r: { code: string; type: string; material?: string }, zh: boolean): string {
  const mat = materialFamily(r.material, zh);
  const t = label(PACK_TYPE_LABEL, r.type, zh);
  return [mat, t, r.code].filter(Boolean).join(' ');
}

/**
 * 容量双单位。出海客户两套单位都要用,只给一套等于让对方自己换算 ——
 * 同行的包材页每一款都写「100 g / 3.53 oz」,这一条值得照做。
 * 只在能确定单位时换算,拿不准就原样输出,不瞎猜。
 */
export function dualCapacity(cap?: string | null): string {
  const s = String(cap ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ml|g)$/i);
  if (!m) return s;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  // 1 fl oz(美制)= 29.5735 ml;1 oz = 28.3495 g
  const conv = unit === 'ml' ? `${(n / 29.5735).toFixed(2)} fl oz` : `${(n / 28.3495).toFixed(2)} oz`;
  return `${n} ${unit} / ${conv}`;
}

/** 包材详情页与货架卡片跳转到「一键生成包装设计」(pack.astro)的链接 ——
    创始人:「选1个瓶子就可以有功能键,一键生成包装设计,这个才更方便」。
    两处都要拼同一条查询串,放这里免得各写一份、日后改参数名要改两处。 */
export function packDesignHref(
  lang: string,
  r: { code: string; type?: string; material?: string | null; capacity?: string | null },
  zh: boolean,
): string {
  const qs = new URLSearchParams({ pack: r.code });
  if (r.type) qs.set('type', label(PACK_TYPE_LABEL, r.type, zh));
  if (r.material) qs.set('material', r.material);
  if (r.capacity) qs.set('capacity', r.capacity);
  return `/${lang}/pack/?${qs.toString()}`;
}
