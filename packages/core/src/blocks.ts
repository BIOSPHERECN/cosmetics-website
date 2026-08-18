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

export type BlockFamily = 'b2b' | 'dtc' | 'shared';

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
    defaults: { title: '资质与合规', note: '', items: [{ name: 'ISO 22716', code: '', note: '' }] },
    labels: { title: '标题', note: '说明', items: '证书', name: '名称', code: '编号' },
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
    id: 'signup', name: '订阅收口', family: 'dtc', renderer: 'Signup',
    note: '页面最后一块。留邮箱是最轻量的线索,会进后台的线索列表,来源标 newsletter。',
    sketch: '▬',
    defaults: { title: '订阅最新资讯', body: '一句说明。', placeholder: '邮箱地址', button: '订阅', note: '可随时退订。', tone: 'sand' },
    labels: { title: '标题', body: '说明', placeholder: '输入框提示', button: '按钮文字', note: '小字', tone: '底色' },
  },
];

export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
export const blockName = (id: string) => BLOCK_BY_ID.get(id)?.name ?? id;

export const FAMILY_NAME: Record<BlockFamily, string> = {
  shared: '通用',
  b2b: '代工站(B2B)',
  dtc: '品牌站(DTC)',
};
