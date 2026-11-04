/**
 * 版块注册表 —— 「这个站能拼出哪些屏」的唯一真源。
 *
 * 为什么要有它:
 *   在此之前,后台只能改**已经存在**的版块的文字。想加一屏、调顺序、
 *   临时藏掉一屏,都得找我改代码再发版 —— 那不叫后台,叫「文案输入框」。
 *   Shopify / WordPress 沉淀三十年的核心能力恰恰是这一件事:
 *   运营自己拼页面。所以先得有一张「有哪些积木、每块积木长什么样」的表。
 *
 * 这张表同时被三处读:
 *   · 后台「加版块」的版块库(名称、说明、示意图)
 *   · 新增版块时写进库的默认内容(defaults)
 *   · 字段表单的中文标签(labels)—— 没有它,运营看到的是 ctaHref 这种英文键名
 *
 * 加一种版块的完整步骤只有两步:
 *   ① 在这里补一条  ② 在 [...path].astro 的 switch 里加一个 case
 * 漏了第二步的表现是:后台能加、前台不渲染 —— 所以下面每条都标了 renderer 名,
 * 便于对照检查。
 */

export type BlockFamily = 'b2b' | 'dtc' | 'shared' | 'factory';

export interface BlockDef {
  /** 存进 blocks.type 的值 */
  id: string;
  /** 运营看到的名字 */
  name: string;
  /** 一句话说明它解决什么问题(不是描述它长什么样) */
  note: string;
  family: BlockFamily;
  /** 对应 [...path].astro 里的渲染组件名,便于核对有没有漏接 */
  renderer: string;
  /** 版块库里的示意图:纯 CSS 画的骨架,不引图片 */
  sketch: string;
  /** 新增时写入的默认内容 —— 直接可用的样例,不是空壳 */
  defaults: Record<string, unknown>;
  /** 字段中文名;没写的字段表单直接显示键名 */
  labels?: Record<string, string>;
  /** 只允许出现一次的版块(如通告条) */
  once?: boolean;
}

/* 示意图用一串字符描述结构,后台按它画方块 —— 比截图省事,也永远不会过期:
   ▭=整块  ▬=窄条  ≡=多行文字  ⊞=网格  ◧=左右对开  ⬤=圆点/头像  ⇄=横滑 */
export const BLOCKS: BlockDef[] = [
  /* ── 通用 ───────────────────────────────────────────── */
  {
    id: 'announce', name: '顶部通告条', family: 'shared', renderer: 'AnnounceBar', once: true,
    note: '整站最先被看见的一行。放当期最想让人知道的一件事:新品线、展会、认证到手。',
    sketch: '▬',
    defaults: { text: '在这里写一句当期最想让人看到的话', linkText: '了解更多', linkHref: '/zh-cn/about/' },
    labels: { text: '文案', linkText: '链接文字', linkHref: '链接地址', bg: '底色', fg: '字色' },
  },
  {
    id: 'prose', name: '正文段落', family: 'shared', renderer: 'Motion/prose',
    note: '纯文字段落。用来讲清楚一件需要展开说的事。',
    sketch: '≡',
    defaults: { paragraphs: ['第一段。', '第二段。'] },
    labels: { paragraphs: '段落' },
  },

  /* ── B2B 代工站 ─────────────────────────────────────── */
  {
    id: 'hero', name: '首屏(标题式)', family: 'b2b', renderer: 'Hero',
    note: '内页的首屏。一句定位 + 一句解释 + 一个动作。',
    sketch: '▭≡',
    defaults: { eyebrow: '', title: '在这里写页面主标题', lead: '一句话说明这一页讲什么。' },
    labels: { eyebrow: '眉标', title: '主标题', lead: '导语' },
  },
  {
    id: 'banner', name: '首屏(分割大图)', family: 'b2b', renderer: 'BigBanner',
    note: '左文右图的首屏。字在纯色场上,换任何图都读得清。',
    sketch: '◧',
    defaults: { eyebrow: '', title: '主标题', lead: '导语', image: '', ctaText: '发起询盘', ctaHref: '/zh-cn/contact/' },
    labels: { eyebrow: '眉标', title: '主标题', lead: '导语', image: '图片', imageAlt: '图片说明', ctaText: '按钮文字', ctaHref: '按钮链接' },
  },
  {
    id: 'matrix', name: '品类能力矩阵', family: 'b2b', renderer: 'CategoryMatrix',
    note: 'B 端采购最想一眼看到的:你到底能做哪些品类、做到什么程度。',
    sketch: '⊞',
    defaults: { title: '四项核心能力', intro: '', items: [{ title: '能力一', desc: '一句话说明', bullets: ['要点', '要点'] }] },
    labels: { title: '标题', intro: '导语', items: '能力项', desc: '说明', bullets: '要点', moq: '起订量' },
  },
  {
    id: 'process', name: '服务流程', family: 'b2b', renderer: 'ProcessSteps',
    note: '从第一封邮件到第一批货要走几步,每步交付什么、需要你确认什么。',
    sketch: '▬▬▬',
    defaults: { title: '合作怎么开始', intro: '', steps: [{ no: '01', title: '需求沟通', desc: '说明' }] },
    labels: { title: '标题', intro: '导语', steps: '步骤', no: '序号', desc: '说明' },
  },
  {
    id: 'certs', name: '资质证书墙', family: 'b2b', renderer: 'CertWall',
    note: '证书编号与有效期可核验。出口目的地不同,需要的文件也不同。',
    sketch: '⊞',
    /* 字段名必须和 CertWall 实际读的一致(label,不是 name)——
       注册表的默认值同时是"给运营看的样例",写错了会把错误的字段名教给所有人。 */
    defaults: { title: '资质与合规', note: '', items: [{ id: 'iso22716', label: 'ISO 22716', note: '化妆品良好生产规范' }] },
    labels: { title: '标题', note: '说明', items: '证书', id: '标识', label: '证书名称', note: '说明' },
  },
  {
    id: 'evidence', name: '功效佐证', family: 'b2b', renderer: 'EvidenceGrid',
    note: '每一条功效宣称背后应该有一份能拿得出来的报告。',
    sketch: '⊞',
    defaults: { title: '宣称与佐证', intro: '', items: [{ claim: '宣称', proof: '佐证方式' }] },
    labels: { title: '标题', intro: '导语', items: '条目', claim: '宣称', proof: '佐证' },
  },
  {
    id: 'bases', name: '生产基地', family: 'b2b', renderer: 'ProductionBases',
    note: '种植端与制造端在同一个体系里 —— 原料不是买来的批号,是能追到源头的土地。',
    sketch: '⊞',
    defaults: { eyebrow: '', title: '生产基地', intro: '', items: [{ name: '基地名', type: 'make', region: '所在地', area: '', focus: '' }] },
    labels: { title: '标题', intro: '导语', items: '基地', name: '名称', type: '类型(grow 种植 / make 制造)', region: '所在地', area: '面积或产能', focus: '主要品种或能力' },
  },
  {
    id: 'stages', name: '叙事流程', family: 'b2b', renderer: 'NarrativeStages',
    note: '不是六项服务,是同一批原料要经过的六个阶段。',
    sketch: '≡▬',
    defaults: { eyebrow: '', title: '一条链,六个阶段', intro: '', stages: [{ title: '阶段', desc: '说明' }] },
    labels: { title: '标题', intro: '导语', stages: '阶段', desc: '说明' },
  },
  {
    id: 'inquiry', name: '询盘引导条', family: 'b2b', renderer: 'InquiryBand',
    note: '把需求说清楚,我们回一份可执行的方案。放在页面末尾收口。',
    sketch: '▬',
    defaults: { title: '把需求发给我们', body: '两个工作日内书面回复。', ctaText: '发起询盘' },
    labels: { title: '标题', body: '正文', ctaText: '按钮文字' },
  },

  /* ── DTC 自有品牌站 ─────────────────────────────────── */
  {
    id: 'slideshow', name: '首屏轮播', family: 'dtc', renderer: 'Slideshow',
    note: '整屏图交叉淡入,文字压在底部渐变上。品牌站的开场,负责让人停住。',
    sketch: '▭⬤⬤⬤',
    defaults: {
      slides: [{ image: '', alt: '' }],
      eyebrow: '', title: '第一行\n第二行', lead: '一句话说明品牌主张。',
      ctaText: '现在看看', ctaHref: '/zh-cn/products/', interval: 6000,
    },
    labels: { slides: '轮播图', image: '图片', alt: '图片说明', eyebrow: '眉标', title: '主标题(换行用回车)', lead: '导语', ctaText: '按钮文字', ctaHref: '按钮链接', interval: '自动播放间隔(毫秒,0=不自动)' },
  },
  {
    id: 'centercta', name: '居中招揽屏', family: 'dtc', renderer: 'CenterCta',
    note: '紧贴首屏之后,把「停住」变成「往下走的第一步」。按钮上要写具体动作。',
    sketch: '≡▬',
    defaults: { title: '一句招揽', body: '一句解释。', ctaText: '开始', ctaHref: '/zh-cn/skin/', tone: 'sand' },
    labels: { title: '标题', body: '说明', ctaText: '按钮文字', ctaHref: '按钮链接', tone: '底色(paper 暖白 / sand 沙色)' },
  },
  {
    id: 'bandimg', name: '通栏大图屏', family: 'dtc', renderer: 'BandImage',
    note: '一张整宽图 + 一行超大英文 + 一行大写中文。用来分段、换气。',
    sketch: '▭',
    defaults: { image: '', alt: '', display: 'collection', title: '系列名', ctaText: '看系列', ctaHref: '/zh-cn/products/' },
    labels: { image: '图片', alt: '图片说明', display: '超大英文', title: '标题', ctaText: '按钮文字', ctaHref: '按钮链接' },
  },
  {
    id: 'shelf', name: '商品架(横滑)', family: 'dtc', renderer: 'Shelf',
    note: '横向滚动的商品卡。右边露出半张是「还有」的信号 —— 这是横滑架最有效的细节。',
    sketch: '⇄',
    defaults: {
      title: '精选', moreText: '查看全部', moreHref: '/zh-cn/products/', tone: 'paper',
      items: [{ name: '产品名', nameEn: 'Product', image: '', note: '剂型 · 规格', swatches: [] }],
    },
    labels: { title: '标题', moreText: '更多文字', moreHref: '更多链接', tone: '底色', items: '商品', name: '名称', nameEn: '英文名', image: '图片', note: '规格(不要写价格)', swatches: '色卡', badge: '角标', href: '链接' },
  },
  {
    id: 'split', name: '图文对开', family: 'dtc', renderer: 'SplitFeature',
    note: '左图右文。连着几屏时交替翻面,眼睛在两侧来回摆,自然分段。',
    sketch: '◧',
    defaults: { image: '', alt: '', eyebrow: '新品', title: '系列名', body: '一段介绍。', ctaText: '选购', ctaHref: '/zh-cn/products/', flip: false, tone: 'sand' },
    labels: { image: '图片', alt: '图片说明', eyebrow: '眉标', title: '标题', body: '正文', ctaText: '按钮文字', ctaHref: '按钮链接', flip: '图放右边(true/false)', tone: '底色' },
  },
  {
    id: 'statement', name: '陈述屏', family: 'dtc', renderer: 'Statement',
    note: '一整屏只放一句话。长页里的呼吸口 —— 不给留白,读者会越滑越快。',
    sketch: '≡',
    defaults: { eyebrow: '', title: '一句品牌陈述', body: '一句展开。', tone: 'leaf' },
    labels: { eyebrow: '眉标', title: '标题', body: '正文', tone: '底纹(leaf 草叶渐变 / sand 沙色)' },
  },
  {
    id: 'perks', name: '权益三联', family: 'dtc', renderer: 'Perks',
    note: '整屏背景图压暗 + 三个描边格。放会员、订阅、回收这类持续性关系。',
    sketch: '⊞',
    defaults: { image: '', veil: 0.55, items: [{ icon: '★', title: '权益标题', note: '一句说明' }] },
    labels: { image: '背景图', veil: '遮罩深浅(0-1)', items: '权益', icon: '符号', title: '标题', note: '说明' },
  },
  {
    id: 'social', name: '社媒墙', family: 'dtc', renderer: 'SocialWall',
    note: '四张方图。承担社会证明 —— 要选用户视角的实拍,棚拍图放这儿会读成品牌自说自话。',
    sketch: '⊞',
    defaults: { title: '关注我们', handle: '@brand', tone: 'paper', items: [{ image: '', href: '#' }] },
    labels: { title: '标题', handle: '账号', tone: '底色', items: '图片', image: '图片', href: '链接' },
  },
  {
    id: 'storehero', name: '工厂店招', family: 'dtc', renderer: 'StoreHero',
    note: '厂区全景 + 公司全称 + 资质角标。工厂店的开场:三秒内回答「你是谁、多大、凭什么」。',
    sketch: '▭◱',
    defaults: {
      image: '', alt: '', company: '公司全称', tagline: '一句能力概括。',
      badges: [{ text: '已核验供应商', kind: 'verified' }, { text: '经营 12 年' }, { text: 'ISO 22716' }],
      ctaText: '发起询盘', ctaHref: '/zh-cn/contact/', secondText: '看可做剂型', secondHref: '/zh-cn/products/',
    },
    labels: { image: '厂区全景图', alt: '图片说明', company: '公司全称', tagline: '一句话概括', badges: '资质角标', text: '文字', kind: '类型(verified 显绿勾 / 留空为普通)', ctaText: '主按钮', ctaHref: '主按钮链接', secondText: '次按钮', secondHref: '次按钮链接' },
  },
  {
    id: 'statsband', name: '数字实力条', family: 'dtc', renderer: 'StatsBand',
    note: '四五个硬数字横排。采购判断「这家够不够大」最快的入口,该紧跟店招。',
    sketch: '▬▬▬▬',
    defaults: {
      tone: 'ink',
      items: [
        { value: '12', unit: '年', label: '专注化妆品制造' },
        { value: '28,000', unit: '㎡', label: '厂房面积' },
        { value: '16', unit: '条', label: '生产线' },
        { value: '43', unit: '国', label: '出口市场' },
      ],
    },
    labels: { tone: '底色(ink 深色 / paper 浅色)', items: '数据', value: '数值', unit: '单位', label: '说明' },
  },
  {
    id: 'procgrid', name: '工艺图网格', family: 'dtc', renderer: 'ProcGrid',
    note: '带标题条的小方图,3×2 排。阿里工厂店最标志性的一块 —— 采购看三秒就判断你有没有厂。',
    sketch: '⊞⊞',
    defaults: {
      eyebrow: '', title: '生产实力', intro: '',
      cols: 3,
      items: [{ image: '', label: '乳化车间', note: '' }],
    },
    labels: { eyebrow: '眉标', title: '标题', intro: '导语', cols: '每行几张', items: '图', image: '图片', label: '图上标题', note: '第二行小字' },
  },
  {
    id: 'formats', name: '可做剂型(询盘车)', family: 'b2b', renderer: 'ProductGrid',
    note: '产品页的剂型网格。原来这份清单硬编码在页面代码里,结果英文访客看到的是整段中文 —— '
        + '翻译管线只处理数据库内容,碰不到代码里的字符串。挪进来之后运营能改、翻译能跟。',
    sketch: '⊞',
    defaults: {
      items: [{ id: 'serum', name: '精华液', summary: '一句说明', image: '', moq: '柔性起订量',
                options: { 容量: ['30ml', '50ml'] } }],
    },
    labels: { items: '剂型', id: '标识(英文,询盘车用)', name: '剂型名', summary: '一句说明',
              image: '图片', moq: '起订量说明', options: '可选规格' },
  },
  {
    id: 'answer', name: '开头直答(GEO)', family: 'dtc', renderer: 'AnswerBlock',
    note: 'AI 答案引擎优先抓「直接回答问题」的段落。一段 100–150 字、开门见山的回答会被整段引用,'
        + '并在答案里带出品牌名;而一篇第三屏才说清能做什么的页面,模型提炼不出东西。'
        + '附带的常见问题会同时写进 FAQPage 结构化数据。',
    sketch: '？',
    defaults: {
      question: '访客最想问的那个问题',
      answer: '第一句就给结论,不要铺垫。100–150 字。',
      faqs: [{ q: '常见问题', a: '答案' }],
      tone: 'paper',
    },
    labels: { question: '问题', answer: '直接回答(100–150 字)', faqs: '常见问题',
              q: '问', a: '答', tone: '底色(paper / sand)' },
  },
  {
    id: 'procribbon', name: '工序流程带', family: 'dtc', renderer: 'ProcRibbon',
    note: '编号 + 连接线 + 小图的横向流程。工厂真正独有的信息是**顺序** —— 图网格表达不了顺序,只能表达「我们有这些」。',
    sketch: '①—②—③',
    defaults: {
      eyebrow: 'PROCESS', title: '一批料要走的路', intro: '', tone: 'deep',
      steps: [{ name: '称量配料', hand: '配料单 + 复核签字', image: '' }],
    },
    labels: { eyebrow: '眉标', title: '标题', intro: '导语', tone: '底色(deep 深墨绿 / paper / sand)', steps: '工序', name: '工序名', hand: '这一步交出什么', image: '小图' },
  },
  {
    id: 'signup', name: '订阅收口', family: 'dtc', renderer: 'Signup',
    note: '页面最后一块。留邮箱是最轻量的线索,会进后台的线索列表,来源标 newsletter。',
    sketch: '▬',
    defaults: { title: '订阅最新资讯', body: '一句说明。', placeholder: '邮箱地址', button: '订阅', note: '可随时退订。', tone: 'sand' },
    labels: { title: '标题', body: '说明', placeholder: '输入框提示', button: '按钮文字', note: '小字', tone: '底色' },
  },

  /* ── 工厂版首页(2026-09-21 创始人:「首页每一行都是一个模块可以添加删除,可以自行替换图片」)──
     渲染器 FactoryBlock.astro。文案里可写占位符,渲染时从库填数:{products} {summaries} {formulas} {classics} {packaging}
     {regs} {inci} {lines} {certs} {certs3} {markets} {cats} {marketNames} {site} {date};链接写 whatsapp 会换成本站 WhatsApp。 */
  {
    id: 'fx_hero', name: '巨大主张 + 找同款', family: 'factory', renderer: 'FactoryBlock/fx_hero', once: true,
    note: '首屏:一句主张、一句导语、找同款搜索框、三条入口、一张整幅横幅(可换)。',
    sketch: '≡ ▬ ⊞ ▭',
    defaults: {
      eyebrow: '广州化妆品 OEM / ODM 工厂 · {lines} 条自动化产线 · {certs3}',
      title: '先找到值得做的产品,', sub: '再由我们把它做出来。',
      lead: '从一个产品想法,到一批可以卖到目标市场的成品。找同款、拆全成分、匹配在库配方基底、寄样、合规资料、包装、试产、大货,由 {site} 的工厂团队完成;你的品牌与客户始终是你的。',
      placeholder: '例:玻尿酸精华、SPF50 轻薄防晒、氨基酸洁面、烟酰胺身体乳', submit: '找同款',
      items: [
        { label: '找产品机会', note: '不知道下一款做什么?看机会卡', href: '#opps' },
        { label: '我有产品想法', note: '在库配方基底按品类 / 剂型 / 功效筛', href: '/formulas/' },
        { label: '已有产品要代工', note: '发全成分表或样品,工厂直接出方案', href: 'whatsapp' },
      ],
      hint: '你只说目标。找同款、配方、包材、法规、打样、生产由工厂负责。',
      image: '', imageAlt: '',
    },
    labels: { sub: '标题第二行', hint: '小字提示', submit: '搜索按钮文字', image: '横幅图(约 1500×600)' },
  },
  {
    id: 'fx_six', name: '六项能力(数字读库)', family: 'factory', renderer: 'FactoryBlock/fx_six',
    note: '每张卡:名称、证据行(数字用占位符自动填)、一句说明、链接、可选配图。',
    sketch: '⊞',
    defaults: {
      title: '不是口号:六项能力,每项都有证据',
      intro: '预判落到生产:帛卉自有产线和成熟配方,加上公开市场与法规数据。',
      items: [
        { label: '市场爆款情报', evidence: '{products} 款公开市场产品情报 · {summaries} 条配方视角解读', note: '从公开渠道收集,用于判断同类产品的成分结构、主打活性物与宣称边界。', href: '/decoder/', image: '' },
        { label: '在库配方基底', evidence: '{formulas} 条可直接打样的配方基底 · {classics} 条古方文献数字化', note: '不是从零研发:按品类、剂型、功效、目标市场匹配基底,改活性物与肤感,寄样评估。', href: '/formulas/', image: '' },
        { label: '工厂与产线', evidence: '{lines} 条自动化产线 · {certs}', note: '护肤 / 身体 / 洗护 / 防晒 / 彩妆 / 口腔;欢迎验厂,证书复印件与产线视频随时给。', href: '/about/', image: '' },
        { label: '包材款式库', evidence: '{packaging} 款包材可选', note: '瓶、罐、软管、泵头等款式库:先按剂型选结构,再确认供应与定制方案。', href: '/packaging/', image: '' },
        { label: '法规与合规', evidence: '{regs} 个市场准入要点 · {inci} 条原料目录', note: '美国 FDA、欧盟 CPNP、英国 SCPN、加拿大 CNF 注册均已开户;印尼 BPOM、马来 NPRA、沙特 SFDA 等配方阶段先核限用与禁用。', href: '/regulations/', image: '' },
        { label: '目标市场落地', evidence: '{markets} 个市场 × {cats} 个品类代工页', note: '{marketNames}:每个市场的备案路径、责任方、标签要点与买手问答。', href: '/oem/', image: '' },
      ],
    },
    labels: { evidence: '证据行(可用占位符)' },
  },
  {
    id: 'fx_opps', name: '什么产品值得做?', family: 'factory', renderer: 'FactoryBlock/fx_opps', once: true,
    note: '机会引擎写入 pulse opps，文案用最近更新（不暗示每日刷新）。',
    sketch: '⊞',
    defaults: {
      title: '什么产品值得做?',
      intro: '按跨境爆款榜、同类产品库与目标市场法规整理 · 最近更新 {date} · 星级是相对定性,不是测算数字。',
      empty: '机会卡按最近一次成功生成展示;先看配方库或直接说你的处境。',
      axes: ['市场需求', '竞争程度', '价格空间', '供应链可行性'], submit: '让工厂给方案',
      moreText: '没有你要的?发一句话说你的处境,工厂按目标市场给方向', moreHref: 'whatsapp',
    },
    labels: { axes: '四个维度名', empty: '无卡片时的导语', submit: '卡片按钮文字', moreText: '底部链接文字', moreHref: '底部链接地址' },
  },
  {
    id: 'fx_latest', name: '看到一个产品,就交给工厂做', family: 'factory', renderer: 'FactoryBlock/fx_latest', once: true,
    note: '五步流程 + 最新入库的六款全球真产品图(自动取,有图的)。',
    sketch: '▬ ⊞',
    defaults: {
      title: '看到一个产品,就交给工厂做',
      intro: '输入产品名:先在公开市场产品情报中找同款、拆全成分结构,再匹配在库基底、核目标市场法规,然后寄样。成本与起订按项目由工厂报,页面不估数。',
      steps: ['找同款', '拆全成分', '匹配在库基底', '寄样评估', '试产与大货'],
      sub: '最新入库的全球产品',
    },
    labels: { sub: '产品图上方的小标题' },
  },
  {
    id: 'fx_bases', name: '在库配方基底(按品类)', family: 'factory', renderer: 'FactoryBlock/fx_bases', once: true,
    note: '九个品类各列三条真基底(自动读 formulas 表);这里配每个品类的缩略图。',
    sketch: '⊞',
    defaults: {
      title: '在库配方基底:按品类看真产品',
      intro: '每一条都有编号、剂型与功效标签,点编号看基底说明;寄样通常 5–14 天。这里列的是基底,不是你的最终配方 —— 活性物、肤感、香型按你的品牌改。',
      countText: '{n} 条基底', moreText: '看全部',
      items: [
        { cat: 'skincare', image: '' }, { cat: 'body', image: '' }, { cat: 'makeup', image: '' }, { cat: 'oral', image: '' }, { cat: 'cleansing', image: '' },
        { cat: 'suncare', image: '' }, { cat: 'haircare', image: '' }, { cat: 'kids', image: '' }, { cat: 'fragrance', image: '' },
      ],
    },
    labels: { cat: '品类代码(skincare / body / makeup / oral / cleansing / suncare / haircare / kids / fragrance)', countText: '计数文案({n} 换成数字)', moreText: '看全部文字' },
  },
  {
    id: 'fx_steps', name: '从需求到交付', family: 'factory', renderer: 'FactoryBlock/fx_steps',
    note: '七步(或任意步)流程卡。数字不写,唯一可写「寄样通常 5–14 天」。',
    sketch: '⊞',
    defaults: {
      title: '从需求到交付,一个项目里完成',
      intro: '你不需要自己找配方师、包材厂、检测机构、报关行;每一步在同一个项目里,由同一个对接人跟到底。',
      steps: [
        { label: '需求', note: '品类 / 目标市场 / 首批数量 / 参考产品或全成分表' }, { label: '匹配基底', note: '从在库基底里选 2–3 条,定活性物与肤感方向' },
        { label: '寄样', note: '通常 5–14 天;评估后修改再寄' }, { label: '合规资料', note: '目标市场备案 / 通报路径与责任方,标签与宣称核对' },
        { label: '包装', note: '现货包材选型或定制,包装稿逐字核对' }, { label: '试产', note: '小批量走一遍产线,确认稳定性与灌装' }, { label: '大货与放行', note: '按 QC 项目检测,放行报告随货' },
      ],
    },
  },
  {
    id: 'fx_contact', name: '开始一个项目(WhatsApp + 邮箱)', family: 'factory', renderer: 'FactoryBlock/fx_contact', once: true,
    note: '收口:WhatsApp 按钮(号码读站点设置)+ 邮箱按钮。',
    sketch: '▬',
    defaults: { title: '开始一个项目', intro: '把你的全成分表、目标市场、首批数量发给我们,工厂两个工作日内回方案与寄样安排。', submit: 'WhatsApp 直接聊', mailText: '发邮件' },
    labels: { submit: 'WhatsApp 按钮文字', mailText: '邮件按钮文字' },
  },

  /* ── BEAUTY2OEM 跨境卖家共创(2026-09-23 A7)── 渲染器同为 FactoryBlock.astro;数据读 b2o_* 三张表(db/migrations/0105_b2o.sql) */
  {
    id: 'fx_cards', name: '产品机会卡(三级保密)', family: 'factory', renderer: 'FactoryBlock/fx_cards', once: true,
    note: '读 b2o_opp_cards 里 status=published 的卡。公开层给所有人;member_json 只给登录会员;strategic_json 前台永不显示。',
    sketch: '⊞',
    defaults: { title: '产品机会预判', intro: '只放趋势与判断过程;具体产品方向按你的店铺给。', empty: '首批机会卡正在复核,上线前先提交店铺,我们按你的店铺先看。', limit: 30,
      lockText: '具体产品方向:提交店铺后按你的店铺给', lockHref: '/brief/', moreText: '提交店铺,拿机会简报', moreHref: '/brief/' },
    labels: { limit: '最多显示几张', lockText: '未登录时卡片底部链接文字', lockHref: '该链接地址', empty: '没有卡时的导语' },
  },
  {
    id: 'fx_ledger', name: '预判记录簿(对的错的都公开)', family: 'factory', renderer: 'FactoryBlock/fx_ledger', once: true,
    note: '读 b2o_predictions 里 is_public=1 的记录,顶部自动统计成立 / 错了 / 待验证 / 商业命中。',
    sketch: '≡',
    defaults: { title: '预判记录', intro: '每条判断都写正方、反方、裁决和失效条件,30 / 60 / 90 天回填结果。', empty: '第一批预判正在写入。' },
    labels: { empty: '没有记录时的说明' },
  },
  {
    id: 'fx_brief', name: '提交店铺拿机会简报(表单)', family: 'factory', renderer: 'FactoryBlock/fx_brief', once: true,
    note: '客户产品档案表单,提交写 b2o_profiles + inquiries(后台询盘列表可见)。表单字段固定,这里只改标题、导语、按钮与回执。',
    sketch: '▭',
    defaults: { title: '提交店铺,24 小时内拿《客户产品机会简报》', intro: '先搞懂你的生意,再说产品。', submit: '提交,24 小时内拿简报', okText: '', hint: '' },
    labels: { okText: '提交成功回执(空=默认)', hint: '按钮旁小字' },
  },
];

export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
export const blockName = (id: string) => BLOCK_BY_ID.get(id)?.name ?? id;

export const FAMILY_NAME: Record<BlockFamily, string> = {
  factory: '工厂版首页',
  shared: '通用',
  b2b: '代工站(B2B)',
  dtc: '品牌站(DTC)',
};
