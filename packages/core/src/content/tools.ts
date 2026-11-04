/**
 * 工具落地页内容集（2026-10-29）。
 *
 * 由来：同行的在线设计工具把「一个工具一个落地页」当作 SEO/GEO 主战场
 * （/tools/ai-cosmetic-packaging-generator 等 20+ 页），但站点是 SPA 空壳，
 * 不执行 JS 的 AI 爬虫读不到正文。我们用同一套页面结构，但**服务端渲染**，
 * 每一页都能被 AI 摘要直接抓取引用。
 *
 * 内容纪律（与全站一致，不得违反）：
 *   不写价格、不写起订量数字、不写交期承诺（lib/terms.ts 铁令）；
 *   只写工厂真实有的：GMPC / ISO 22716 / HALAL 认证、20,000 ㎡ 厂房、15 条自动化产线、
 *   13,000+ 配方、1,164 款已量产成品。
 *   能力边界必须写清 —— 文生图不是图生图，不能假装能换背景。
 */

export interface ToolSample {
  /** media 表 id，前台走 /media/<id> */
  media: number;
  zh: string;
  en: string;
}

export interface ToolFaq {
  zh: { q: string; a: string };
  en: { q: string; a: string };
}

export interface ToolDef {
  slug: string;
  /** 排序 */
  order: number;
  zh: {
    eyebrow: string; h1: string; answer: string; intro: string;
    outputsTitle: string; outputs: string[];
    limitsTitle: string; limits: string[];
    samplesTitle: string;
  };
  en: {
    eyebrow: string; h1: string; answer: string; intro: string;
    outputsTitle: string; outputs: string[];
    limitsTitle: string; limits: string[];
    samplesTitle: string;
  };
  /** 主 CTA 指向：包装类进 /pack/ 工作台，视觉类进 /design/ */
  ctaHref: string;
  samples: ToolSample[];
  faqs: ToolFaq[];
  /** 站内相关链接（相对路径，不带语言前缀） */
  related: { href: string; zh: string; en: string }[];
}

export const TOOLS: ToolDef[] = [
  {
    slug: 'packaging-mockup',
    order: 10,
    zh: {
      eyebrow: '包装设计',
      h1: '化妆品包装效果图怎么生成？',
      answer: '输入产品名称与品类，AI 生成 4 张包装效果图：白底主图、生活场景、功效特写、礼盒陈列。约 90 秒出图，可直接用于询盘沟通或初步选款。',
      intro: '包装效果图是选款的第一步——先看方向对不对，再谈开模与打样。帛卉是广州的化妆品 OEM/ODM 工厂，20,000 ㎡厂房、15 条自动化产线，做护肤、彩妆、洗护、口腔、防晒、香氛六类产品的私标代工。工具页负责把「想要什么包装」快速具象化，工厂负责把它变成可量产的实物。',
      outputsTitle: '你会拿到什么',
      outputs: [
        '白底主图：纯白背景 + 棚拍光，适合电商列表与产品目录',
        '生活场景图：真实使用环境，适合详情页与社媒',
        '功效特写：瓶身质感与膏体细节，适合卖点表达',
        '礼盒陈列：套装组合效果，适合节日与礼赠定位',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        '当前是文生图：根据文字描述生成，不是把你的产品照片换成另一张背景',
        '生成的图用于方向沟通，不能直接当成品印刷稿——印刷需要矢量文件与色卡',
        '涉及功效宣称的文案不进图，按各市场法规另行审核',
      ],
      samplesTitle: '我们做过的包装实拍',
    },
    en: {
      eyebrow: 'Packaging design',
      h1: 'How do you generate cosmetic packaging mockups?',
      answer: 'Enter a product name and category, and the tool generates four packaging visuals: white-background hero, lifestyle scene, ingredient close-up, and gift-set display. Around 90 seconds, ready to use in an inquiry or an early selection round.',
      intro: 'A packaging mockup is the first step in choosing a product: agree on the direction before tooling and sampling. BIOSPHERE is a cosmetics OEM/ODM factory in Guangzhou with a 20,000 m² plant and 15 automated lines, manufacturing private-label skincare, colour cosmetics, hair and body care, oral care, sun care and fragrance. The tool makes the intent concrete; the factory makes it manufacturable.',
      outputsTitle: 'What you get',
      outputs: [
        'Hero shot: pure white background, studio lighting, for listings and catalogues',
        'Lifestyle scene: real usage context, for detail pages and social',
        'Ingredient close-up: bottle texture and product detail for claims',
        'Gift-set display: multi-item presentation for seasonal and gifting lines',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'Text-to-image only: generated from a description, not a background swap on your own product photo',
        'For direction, not for print — production artwork needs vector files and colour references',
        'Claim text is not rendered into images; claims are reviewed per market regulation separately',
      ],
      samplesTitle: 'Packaging we have produced',
    },
    ctaHref: '/pack/',
    samples: [
      { media: 169, zh: '发膜包装', en: 'Hair mask packaging' },
      { media: 170, zh: '油痘肌护理精华包装', en: 'Blemish-prone serum packaging' },
      { media: 171, zh: '草本防晒包装', en: 'Herbal sun care packaging' },
      { media: 172, zh: '草本漱口水包装', en: 'Herbal mouthwash packaging' },
    ],
    faqs: [
      {
        zh: { q: '生成的效果图能直接拿去印刷吗？', a: '不能。AI 生成图是位图，用于方向确认与内部沟通；正式印刷需要矢量文件、专色与出血设置，由设计在刀版图上完成。' },
        en: { q: 'Can the generated image go straight to print?', a: 'No. AI output is a raster image for direction and internal alignment. Production printing needs vector artwork, spot colours and bleed, prepared on a dieline.' },
      },
      {
        zh: { q: '你们能按效果图开模打样吗？', a: '可以。工厂有 15 条自动化产线和配套包材供应链，常规瓶型可直接选，异形结构需要开模评估。具体结构、材质与数量按项目书面确认。' },
        en: { q: 'Can you tool and sample from a mockup?', a: 'Yes. The plant runs 15 automated lines with an in-house packaging supply chain. Standard bottles can be selected directly; custom structures need a tooling review. Structure, material and quantity are confirmed per project in writing.' },
      },
      {
        zh: { q: '生成一张图要多久？', a: '一次生成 4 张约 90 秒（串行出图，避免模型限流）。图片链接为临时地址，需要留存请下载保存。' },
        en: { q: 'How long does generation take?', a: 'About 90 seconds for four images, produced sequentially to avoid rate limits. Links are temporary — download anything you want to keep.' },
      },
    ],
    related: [
      { href: '/design/', zh: '在线设计中心', en: 'Online design centre' },
      { href: '/packaging/', zh: '包材库', en: 'Packaging library' },
      { href: '/portfolio/', zh: '成品展示', en: 'Product showcase' },
    ],
  },
  {
    slug: 'ecommerce-image-set',
    order: 20,
    zh: {
      eyebrow: '电商视觉',
      h1: '电商套图要拍几张、每张放什么？',
      answer: '化妆品电商套图通常 5–6 张：主图、卖点图、场景图、成分/功效图、规格图、礼盒图。核心是让买家在 3 秒内看懂「这是什么、给谁用、为什么买」。',
      intro: '套图不是拍得好看就行，是回答买家在列表页那一瞬间的三个问题。帛卉做代工时经常收到「有图但没有转化」的素材——问题通常出在顺序：卖点图放太后面，规格信息缺失，场景图与目标人群不匹配。',
      outputsTitle: '一套标准套图的结构',
      outputs: [
        '第 1 张 主图：产品正面 + 品牌名，白底，列表页第一眼',
        '第 2 张 卖点图：一句话核心卖点 + 产品局部特写',
        '第 3 张 场景图：真实使用场景，交代人群与时机',
        '第 4 张 成分/功效图：关键成分与作用，配检测或备案依据',
        '第 5 张 规格图：容量、剂型、用法，减少售前咨询',
        '第 6 张 礼盒/套装图：如有多件组合或礼赠定位',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        '当前工具支持按产品描述生成单张场景图，一次 4 张；整套 6 张需分两轮',
        '不支持把已有产品照片自动换背景或扩图',
        '图中不生成文字与 logo，避免模型输出乱码；文案由设计另行排版',
      ],
      samplesTitle: '我们做过的产品实拍',
    },
    en: {
      eyebrow: 'E-commerce visuals',
      h1: 'How many images does an e-commerce set need, and what goes in each?',
      answer: 'A cosmetic e-commerce set usually runs 5–6 images: hero, selling point, lifestyle, ingredient/benefit, specification, and gift set. The job is to answer "what is this, who is it for, why buy" within three seconds.',
      intro: 'A set is not about looking good; it answers the three questions a buyer has on the listing page. When OEM clients arrive with assets that do not convert, the usual cause is order: the selling point sits too late, specification is missing, or the lifestyle shot targets the wrong audience.',
      outputsTitle: 'Structure of a standard set',
      outputs: [
        'Image 1 hero: product front with brand, white background, first glance in a listing',
        'Image 2 selling point: one core claim with a product close-up',
        'Image 3 lifestyle: real usage context establishing audience and occasion',
        'Image 4 ingredient/benefit: key actives and what they do, with test or filing references',
        'Image 5 specification: volume, format, how to use — cuts pre-sales questions',
        'Image 6 gift/set: for multi-item bundles or gifting positioning',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'The current tool generates scene images from a product description, four per run; a full six-image set takes two runs',
        'No automatic background replacement or outpainting from an existing product photo',
        'No text or logos are baked into images, avoiding garbled model output; copy is laid out by a designer',
      ],
      samplesTitle: 'Products we have produced',
    },
    ctaHref: '/design/',
    samples: [
      { media: 173, zh: '双源精华', en: 'Dual-source essence' },
      { media: 174, zh: '固体牙膏片', en: 'Solid toothpaste tablets' },
      { media: 175, zh: '晒后修护喷雾', en: 'After-sun cooling spray' },
      { media: 176, zh: '脱毛后护理喷雾', en: 'Post-hair-removal spray' },
    ],
    faqs: [
      {
        zh: { q: '套图为什么不能只做一张主图？', a: '主图决定点击，其余图决定转化。只做主图，买家点进来后缺少卖点与规格信息，会转向竞品或反复问客服。' },
        en: { q: 'Why not just make a hero image?', a: 'The hero decides the click; the rest decide conversion. With only a hero, the buyer lands without claims or specifications and either leaves or floods support with questions.' },
      },
      {
        zh: { q: '你们能提供真实产品的实拍吗？', a: '可以。已量产的 1,164 款成品都有实拍图，可在成品展示页查看；定制款按打样后实拍。' },
        en: { q: 'Can you provide real product photography?', a: 'Yes. All 1,164 mass-produced items have real shots in the product showcase; custom items are shot after sampling.' },
      },
      {
        zh: { q: '图的尺寸按平台要求给吗？', a: '按项目确认。不同平台（天猫、亚马逊、独立站）主图规格与白底要求不同，提交需求时说明目标平台即可。' },
        en: { q: 'Are sizes matched to each platform?', a: 'Confirmed per project. Main-image specs and white-background rules differ across Tmall, Amazon and standalone stores — state the target platform in the brief.' },
      },
    ],
    related: [
      { href: '/portfolio/', zh: '成品展示', en: 'Product showcase' },
      { href: '/design/', zh: '在线设计中心', en: 'Online design centre' },
      { href: '/services/cross-border-seller/', zh: '跨境卖家服务', en: 'Cross-border seller services' },
    ],
  },
  {
    slug: 'gift-box-design',
    order: 30,
    zh: {
      eyebrow: '礼盒设计',
      h1: '化妆品礼盒怎么设计才不显廉价？',
      answer: '礼盒的质感来自三件事：结构（开合方式与内衬）、材质（纸、布、皮革与工艺）、细节（烫金、压纹、内托）。先定价格带与送礼场景，再定结构，最后才是图案。',
      intro: '同一套产品装进不同礼盒，终端定价能差一倍。工厂端能控制的是结构与工艺落地能力：白卡、灰板、特种纸、烫金烫银、UV、压纹、植绒内托都能做，关键是先确认预算区间与开合体验。',
      outputsTitle: '礼盒设计的三个决策顺序',
      outputs: [
        '先定价格带：决定用灰板还是白卡、是否上特殊工艺',
        '再定结构：天地盖、书型盒、抽屉盒、翻盖盒，影响开模与人工成本',
        '再定内衬：EVA、纸浆托、植绒、绸布，决定产品固定与开箱体验',
        '最后定视觉：图案、烫印、专色，在刀版图上排版',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        'AI 生成的是礼盒陈列效果，不是可生产的刀版文件',
        '结构设计需按实物尺寸出刀版，工具图无法替代结构工程',
        '特殊工艺（烫金/UV/压纹）的效果需以打样实物为准，屏幕预览存在色差',
      ],
      samplesTitle: '我们做过的套装实拍',
    },
    en: {
      eyebrow: 'Gift boxes',
      h1: 'How do you design a cosmetic gift box that does not look cheap?',
      answer: 'Perceived quality comes from three things: structure (opening and inner tray), material (paper, cloth, leather and finishing), and detail (foil, embossing, inlay). Set the price band and gifting occasion first, then structure, then artwork.',
      intro: 'The same products in a different box can support twice the retail price. What the factory controls is structural feasibility and finishing: white card, greyboard, specialty paper, hot foil, UV, embossing and flocked trays are all available — the key is agreeing budget and unboxing experience first.',
      outputsTitle: 'The order of three decisions',
      outputs: [
        'Price band first: determines greyboard vs white card, and whether specialty finishes are viable',
        'Structure second: lid-and-base, book-style, drawer or flip-top — drives tooling and labour',
        'Tray third: EVA, moulded pulp, flocking or satin — decides product security and unboxing',
        'Visuals last: pattern, foil, spot colour, laid out on the dieline',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'AI output is a gift-set display, not a production dieline',
        'Structural design needs a dieline built from real dimensions; a render cannot replace structural engineering',
        'Foil, UV and emboss effects must be judged from a physical proof — screen previews drift in colour',
      ],
      samplesTitle: 'Sets we have produced',
    },
    ctaHref: '/pack/',
    samples: [
      { media: 177, zh: '提亮身体乳', en: 'Brightening body lotion' },
      { media: 178, zh: '九草本果冻面膜', en: 'Nine-herb jelly mask' },
      { media: 179, zh: '乳液包装', en: 'Lotion packaging' },
      { media: 180, zh: '身体护理包装', en: 'Body care packaging' },
    ],
    faqs: [
      {
        zh: { q: '礼盒最小起订量是多少？', a: '按结构与工艺确认。常规天地盖与抽屉盒的起订门槛低于异形结构；具体数量在项目沟通中以书面形式给出。' },
        en: { q: 'What is the minimum order for gift boxes?', a: 'Depends on structure and finishing. Standard lid-and-base and drawer boxes have a lower threshold than custom structures; exact quantities are given in writing per project.' },
      },
      {
        zh: { q: '能在礼盒上做烫金和压纹吗？', a: '可以。烫金、烫银、UV、击凸、压纹、植绒内托都能做，具体效果以打样为准。' },
        en: { q: 'Can you do foil stamping and embossing?', a: 'Yes. Hot foil, UV, embossing, debossing and flocked trays are all available; final effect is judged from a physical proof.' },
      },
      {
        zh: { q: '礼盒和产品能一起做吗？', a: '可以。产品灌装与礼盒组装在同一工厂完成，减少两地协调与运输损耗。' },
        en: { q: 'Can the box and the product be made together?', a: 'Yes. Filling and gift-box assembly happen in the same plant, removing cross-supplier coordination and transit damage.' },
      },
    ],
    related: [
      { href: '/pack/', zh: '外盒与礼盒', en: 'Cartons & gift boxes' },
      { href: '/packaging/', zh: '包材库', en: 'Packaging library' },
      { href: '/design/', zh: '在线设计中心', en: 'Online design centre' },
    ],
  },
  {
    slug: 'label-design',
    order: 40,
    zh: {
      eyebrow: '标签设计',
      h1: '化妆品标签必须包含哪些信息？',
      answer: '标签至少要有：产品名称、全成分表（INCI，按含量降序）、净含量、生产者/责任人名称与地址、生产批号与限期使用日期、使用方法和必要的安全警示。出口还要按目标市场加当地语言与备案号。',
      intro: '标签是被罚得最多的一环。中国按《化妆品标签管理办法》要求，欧盟按 EC 1223/2009 加 CPNP 通报号与责任人，美国按 FDA 与 MoCRA，东南亚多国要求本地语言与 HALAL 标识。同一款产品卖不同市场，标签必须分开做。',
      outputsTitle: '标签必备要素清单',
      outputs: [
        '产品名称与品类（不得暗示医疗功效）',
        '全成分表：INCI 名称，含量降序，1% 以下可不排序',
        '净含量与规格',
        '生产者与责任人名称、地址（进口品标责任人）',
        '生产批号、限期使用日期或开封后使用期限（PAO）',
        '使用方法与必要警示语',
        '目标市场附加项：备案/通报号、当地语言、HALAL 标识等',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        'AI 生成的是标签视觉方向，不是合规文本',
        '成分表与宣称必须由法规审核确认后才能上印刷稿',
        '不同市场标签不可通用，需按市场分别出稿',
      ],
      samplesTitle: '我们做过的标签实拍',
    },
    en: {
      eyebrow: 'Labels',
      h1: 'What must a cosmetic label contain?',
      answer: 'At minimum: product name, full ingredient list (INCI, descending by concentration), net content, producer or responsible-person name and address, batch number and expiry, usage instructions and necessary warnings. Exports add local language and filing numbers for the target market.',
      intro: 'Labels are where penalties concentrate. China follows the Cosmetics Labelling Measures, the EU requires EC 1223/2009 plus a CPNP notification number and a responsible person, the US follows FDA and MoCRA, and several Southeast Asian markets require local language and HALAL marking. One product sold into different markets needs separate labels.',
      outputsTitle: 'Mandatory label elements',
      outputs: [
        'Product name and category (no implied medicinal efficacy)',
        'Full INCI ingredient list, descending by concentration; below 1% may be unordered',
        'Net content and format',
        'Producer and responsible-person name and address',
        'Batch number, expiry date, or period-after-opening (PAO)',
        'Directions and required warnings',
        'Market add-ons: filing/notification number, local language, HALAL mark, etc.',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'AI output is a visual direction, not compliant copy',
        'Ingredient lists and claims must pass regulatory review before artwork',
        'Labels are not interchangeable across markets; each market needs its own artwork',
      ],
      samplesTitle: 'Labels we have produced',
    },
    ctaHref: '/pack/',
    samples: [
      { media: 169, zh: '发膜标签', en: 'Hair mask label' },
      { media: 170, zh: '精华标签', en: 'Serum label' },
      { media: 175, zh: '喷雾标签', en: 'Spray label' },
      { media: 177, zh: '身体乳标签', en: 'Body lotion label' },
    ],
    faqs: [
      {
        zh: { q: '成分表必须用中文还是 INCI 英文名？', a: '中国境内销售用《已使用化妆品原料目录》中的中文名称；出口按目标市场要求，欧盟与美国用 INCI 英文名。' },
        en: { q: 'Should the ingredient list be in Chinese or INCI?', a: 'For sale in China, use the Chinese names from the official ingredient catalogue; for export, follow the target market — the EU and US use INCI names.' },
      },
      {
        zh: { q: '同一款产品能共用一张标签吗？', a: '不能。不同市场对语言、责任人、备案号、警示语的要求不同，必须按市场分别出稿。' },
        en: { q: 'Can one product share a single label across markets?', a: 'No. Language, responsible person, filing number and warnings differ by market, so each needs its own artwork.' },
      },
      {
        zh: { q: '标签设计图能直接给印刷厂吗？', a: '需要转成矢量文件并按刀版排版，标注专色、出血与最小字号；法规文本审核通过后才能定稿。' },
        en: { q: 'Can the design go straight to the printer?', a: 'It must be converted to vector artwork on a dieline with spot colours, bleed and minimum type size specified; regulatory text must clear review first.' },
      },
    ],
    related: [
      { href: '/compliance/', zh: '跨境合规', en: 'Cross-border compliance' },
      { href: '/inci/', zh: 'INCI 查询', en: 'INCI lookup' },
      { href: '/design/', zh: '在线设计中心', en: 'Online design centre' },
    ],
  },
  {
    slug: 'amazon-product-images',
    order: 50,
    zh: {
      eyebrow: '亚马逊主图',
      h1: '亚马逊化妆品主图有哪些硬性要求？',
      answer: '主图必须是纯白背景（RGB 255,255,255）、产品占画面 85% 以上、无 logo 水印与促销文字、无道具、分辨率不低于 1600px 长边（建议 2000px），且必须是实物拍摄或高质量渲染。',
      intro: '亚马逊主图不合规会直接下架或压制曝光。化妆品类目额外要求：套装需展示全部内容物、不得出现「Best Seller」等字样、成分图不能出现医疗暗示。这些规则与独立站不同，同一套图不能直接搬。',
      outputsTitle: '主图与辅图的分工',
      outputs: [
        '主图：纯白底、产品占 85%、无任何文字与道具',
        '辅图 2：卖点/成分，可出现文字但要符合宣称规则',
        '辅图 3：使用场景或使用步骤',
        '辅图 4：规格与尺寸对比',
        '辅图 5：包装全貌或礼盒展开',
        '视频：可选，展示质地与使用过程',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        'AI 生成图不能直接当亚马逊主图——主图要求纯白底实物，生成图常被判为合成',
        '工具可用于辅图与场景图的方向确认',
        '最终主图建议实拍，或使用通过审核的渲染图',
      ],
      samplesTitle: '我们做过的产品实拍',
    },
    en: {
      eyebrow: 'Amazon images',
      h1: 'What are the hard requirements for Amazon cosmetic main images?',
      answer: 'The main image must be pure white (RGB 255,255,255), with the product filling at least 85% of the frame, no logos, watermarks or promotional text, no props, and a long edge of at least 1600 px (2000 px recommended). It must be a real photograph or a high-quality render.',
      intro: 'A non-compliant main image gets suppressed or delisted. Cosmetics add further rules: sets must show every included item, terms like "Best Seller" are prohibited, and ingredient visuals must not imply medical effects. These differ from standalone-store rules, so one set cannot simply be reused.',
      outputsTitle: 'How main and secondary images divide the work',
      outputs: [
        'Main: pure white, product at 85%, no text and no props',
        'Image 2: selling points or ingredients — text allowed within claim rules',
        'Image 3: usage context or steps',
        'Image 4: specification and size comparison',
        'Image 5: full packaging or box opened out',
        'Video: optional, showing texture and application',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'AI output cannot be used as an Amazon main image — the rule calls for a real product on pure white, and generated images are often flagged as composites',
        'The tool is for secondary and scene images, for direction',
        'The final main image should be photographed, or a render that passes review',
      ],
      samplesTitle: 'Products we have produced',
    },
    ctaHref: '/design/',
    samples: [
      { media: 171, zh: '防晒包装', en: 'Sun care packaging' },
      { media: 172, zh: '漱口水包装', en: 'Mouthwash packaging' },
      { media: 174, zh: '牙膏片包装', en: 'Toothpaste tablet packaging' },
      { media: 178, zh: '面膜包装', en: 'Sheet mask packaging' },
    ],
    faqs: [
      {
        zh: { q: 'AI 生成的图能直接上传亚马逊吗？', a: '主图不建议——亚马逊要求实物或高质量渲染，生成图容易被判合成。辅图与场景图可以用，但要确认不违反宣称规则。' },
        en: { q: 'Can AI images be uploaded to Amazon directly?', a: 'Not for the main image — Amazon requires real photography or high-quality renders, and generated images are often flagged. Secondary and scene images are usable if claims comply.' },
      },
      {
        zh: { q: '主图需要多大分辨率？', a: '长边至少 1600px 才能启用缩放功能，建议 2000px。低于 1000px 会失去放大查看。' },
        en: { q: 'What resolution does the main image need?', a: 'At least 1600 px on the long edge to enable zoom, with 2000 px recommended. Below 1000 px loses zoom entirely.' },
      },
      {
        zh: { q: '套装产品主图怎么拍？', a: '必须展示套装内全部内容物，不能只拍外盒。若为礼盒，建议一图展示外盒、一图展示展开后的内容。' },
        en: { q: 'How should a set be photographed?', a: 'Every included item must be visible — not just the outer box. For gift sets, show the closed box and the opened contents in separate images.' },
      },
    ],
    related: [
      { href: '/services/cross-border-seller/', zh: '跨境卖家服务', en: 'Cross-border seller services' },
      { href: '/compliance/', zh: '跨境合规', en: 'Cross-border compliance' },
      { href: '/portfolio/', zh: '成品展示', en: 'Product showcase' },
    ],
  },
  {
    slug: 'detail-page',
    order: 60,
    zh: {
      eyebrow: '详情页',
      h1: '化妆品详情页应该按什么顺序写？',
      answer: '推荐顺序：痛点共鸣 → 核心卖点 → 成分与机制 → 使用体验 → 规格与用法 → 资质与背书 → 常见疑问。先让买家「觉得说的是我」，再给购买理由，最后消除顾虑。',
      intro: '详情页不是产品说明书，是一段有顺序的说服。多数转化差的详情页问题不在设计，而在顺序：一上来讲品牌故事，买家还没被说动就滑走了。',
      outputsTitle: '详情页的七个板块',
      outputs: [
        '痛点：目标人群正在经历的具体困扰，用场景而非形容词',
        '卖点：一句话说清差异，配产品特写',
        '成分与机制：关键活性成分及其作用路径',
        '使用体验：质地、气味、吸收速度、适用肤质',
        '规格与用法：容量、剂型、频次、注意事项',
        '资质与背书：GMPC / ISO 22716 / HALAL、检测报告',
        '常见疑问：用法、搭配、禁忌、售后',
      ],
      limitsTitle: '能力边界（先说清楚）',
      limits: [
        '功效表述必须与备案资料一致，不能超出已备案范围',
        '不能出现医疗用语与绝对化用语（如「治疗」「最有效」）',
        '不同平台对详情页长度与图片规格要求不同，需按平台出稿',
      ],
      samplesTitle: '我们做过的产品实拍',
    },
    en: {
      eyebrow: 'Detail pages',
      h1: 'In what order should a cosmetic detail page be written?',
      answer: 'Recommended order: pain point → core benefit → ingredients and mechanism → usage experience → specification and directions → credentials → FAQ. Make the buyer feel "this is about me", then give a reason to buy, then remove doubt.',
      intro: 'A detail page is not a manual; it is an ordered argument. Most underperforming pages fail on sequence rather than design: they open with brand story, and the buyer scrolls away before being persuaded.',
      outputsTitle: 'The seven blocks',
      outputs: [
        'Pain point: the specific problem the audience has, in a scene rather than adjectives',
        'Benefit: the difference in one sentence, with a product close-up',
        'Ingredients and mechanism: key actives and how they work',
        'Experience: texture, scent, absorption, suitable skin types',
        'Specification and directions: volume, format, frequency, cautions',
        'Credentials: GMPC / ISO 22716 / HALAL, test reports',
        'FAQ: usage, pairing, contraindications, after-sales',
      ],
      limitsTitle: 'Where it stops',
      limits: [
        'Efficacy wording must match the filed dossier and cannot exceed it',
        'Medical terminology and absolutes (cure, most effective) are prohibited',
        'Length and image specs differ by platform; artwork is produced per platform',
      ],
      samplesTitle: 'Products we have produced',
    },
    ctaHref: '/design/',
    samples: [
      { media: 173, zh: '精华详情', en: 'Essence detail' },
      { media: 176, zh: '护理喷雾详情', en: 'Care spray detail' },
      { media: 179, zh: '乳液详情', en: 'Lotion detail' },
      { media: 180, zh: '身体护理详情', en: 'Body care detail' },
    ],
    faqs: [
      {
        zh: { q: '详情页多长合适？', a: '移动端为主时建议控制在 6000px 以内，7 个板块各 1–2 屏。过长的页面完成率低，关键信息反而看不到。' },
        en: { q: 'How long should a detail page be?', a: 'For mobile-first, keep it under 6000 px with one or two screens per block. Overlong pages lose completion, so key information gets missed.' },
      },
      {
        zh: { q: '功效可以写多强？', a: '以备案资料与检测报告为限。超出备案范围属于违规宣称，平台与监管都会处罚。' },
        en: { q: 'How strong can efficacy claims be?', a: 'Only as far as the filed dossier and test reports support. Claims beyond the filing are violations, penalised by both platform and regulator.' },
      },
      {
        zh: { q: '你们能提供哪些背书材料？', a: '工厂持有 GMPC、ISO 22716、HALAL 认证；可按需提供检测报告与备案信息。' },
        en: { q: 'What supporting materials can you provide?', a: 'The factory holds GMPC, ISO 22716 and HALAL certifications; test reports and filing information are provided as needed.' },
      },
    ],
    related: [
      { href: '/services/factory-quality/', zh: '工厂质量', en: 'Factory quality' },
      { href: '/portfolio/', zh: '成品展示', en: 'Product showcase' },
      { href: '/design/', zh: '在线设计中心', en: 'Online design centre' },
    ],
  },
];

export const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));
