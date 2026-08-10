/**
 * 站点注册表 —— 帛卉集团 BOHUI 五站 + 一个风格实验室的唯一真源。
 * 域名/品牌色/风格提案全部只写在这里;脚手架生成器、风格实验室、各站页面都从此读取。
 * 来源:创始人 2026-08-11 提供的品牌视觉图 + 《100家独立站风格调研与复刻方案-v1.pdf》流派表。
 *
 * ★ 关键设计:风格提案(VariantDef)自带流派 ★
 *   同一域名的 4 套候选风格允许分属不同流派 —— 这样「玉竹米白」和「墨玉东方」
 *   才能真正气质迥异,而不是同一套配色的微调。创始人挑定后改 defaultVariant 一处即全站换装。
 */

/** 八大流派 id(与 schools.css 的 [data-school] 一一对应) */
export type SchoolId =
  | 'clinical'
  | 'factory-b2b'
  | 'clean-natural'
  | 'luxe'
  | 'dopamine'
  | 'narrative'
  | 'tech-spec'
  | 'performance';

/** 一套候选风格 = 流派底子 + 该域名专属令牌覆盖(variants.css) */
export interface VariantDef {
  /** v1..v4,同时是 [data-variant] 属性值与实验室 URL 片段 */
  id: string;
  /** 中文风格名(创始人挑选时看这个) */
  name: string;
  /** 该风格的英文/拉丁名(页面角标用) */
  nameEn: string;
  /** 底子流派 */
  school: SchoolId;
  /** 对标站点(全部来自 PDF 百站清单) */
  ref: string;
  /** 一句话气质描述 */
  note: string;
}

export interface SiteDef {
  id: string;
  /** 拉丁品牌名(<title> 后缀用) */
  name: string;
  /** 中文定位一句话 */
  nameZh: string;
  domain: string;
  url: string;
  /** 当前选定风格;创始人挑完改这一处即全站换装 */
  defaultVariant: string;
  /** 候选风格提案(3–5 套,互不相同) */
  variants: VariantDef[];
  /** 品牌主色(取自品牌视觉图) */
  brandColor: string;
  /** 是否允许收录(风格实验室不许) */
  indexable: boolean;
  /** 该站是否含应用型模块(biosphere-ai 的在线共创工作台) */
  hasStudio?: boolean;
}

export const SITES: SiteDef[] = [
  /* ══ 1. BEAUTY2OEM · 全球美妆智能制造平台 ══════════════════════
     品牌视觉:香槟金「B」+ 草本笔触;四项能力:全品类制造/品牌孵化/供应链整合/全球交付 */
  {
    id: 'beauty2oem',
    name: 'BEAUTY2OEM',
    nameZh: '全球美妆智能制造平台',
    domain: 'beauty2oem.com',
    url: 'https://beauty2oem.com',
    defaultVariant: 'v1',
    brandColor: '#a8823c',
    indexable: true,
    variants: [
      {
        id: 'v1',
        name: '工业蓝钢',
        nameEn: 'Industrial Steel',
        school: 'factory-b2b',
        ref: 'Intercos / Cosmax / KDC-One',
        note: '深蓝数字墙 + 栅格严整大标题。PDF 钦定的工厂实力语言,最像一家有产能的真工厂。',
      },
      {
        id: 'v2',
        name: '香槟金典',
        nameEn: 'Champagne Classic',
        school: 'luxe',
        ref: 'Quadpack / 花西子 / Aesop',
        note: '米金底 + 大号衬线 + 超大留白。承接品牌视觉图的香槟金,做"高端定制伙伴"而非"廉价代工"。',
      },
      {
        id: 'v3',
        name: '白皮书',
        nameEn: 'White Paper',
        school: 'clinical',
        ref: 'The Ordinary / KDC-One 能力矩阵页',
        note: '纯白底 + 细线表格 + 小字号高密度。像一份技术白皮书,信息密度压倒装饰。',
      },
      {
        id: 'v4',
        name: '墨色智造',
        nameEn: 'Obsidian Works',
        school: 'tech-spec',
        ref: 'Anker / Olaplex 暗色版',
        note: '近黑底 + 金色强调线。把"智能制造"讲成科技资产,夜色质感,适合展会大屏。',
      },
    ],
  },

  /* ══ 2. SKIN2OEM · 全球护肤智能制造平台 ════════════════════════
     品牌视觉:青色水滴 + 蜂窝分子;四项能力:护肤品研发制造/功效配方定制/高端方案/品质安全 */
  {
    id: 'skin2oem',
    name: 'SKIN2OEM',
    nameZh: '全球护肤智能制造平台',
    domain: 'skin2oem.com',
    url: 'https://skin2oem.com',
    defaultVariant: 'v1',
    brandColor: '#2e7c8c',
    indexable: true,
    variants: [
      {
        id: 'v1',
        name: '实验室青',
        nameEn: 'Lab Cyan',
        school: 'factory-b2b',
        ref: 'Cosmax / Kolmar Korea',
        note: '青灰企业色 + 数字墙。研发实验室气质的 B2B,与 BEAUTY2OEM 蓝钢同族不同色,矩阵感一致。',
      },
      {
        id: 'v2',
        name: '水感清透',
        nameEn: 'Aqua Clear',
        school: 'clean-natural',
        ref: 'Osea / Beauty of Joseon',
        note: '浅青米白 + 圆润大留白。把"护肤"讲成温和可信,弱化工厂味,适合面向品牌方的软性沟通。',
      },
      {
        id: 'v3',
        name: '功效证据',
        nameEn: 'Clinical Proof',
        school: 'clinical',
        ref: 'The Ordinary / Inkey List',
        note: '白底 + 青强调 + 成分表格化。功效配方定制的最强表达:数据说话,零修辞。',
      },
      {
        id: 'v4',
        name: '深海科技',
        nameEn: 'Deep Ocean',
        school: 'tech-spec',
        ref: 'Foreo / K18',
        note: '深青黑底 + 分子网格。高端护肤方案的科技侧,配蜂窝分子品牌符号最贴。',
      },
    ],
  },

  /* ══ 3. BIOSPHERE-AI · 全球生命美妆 AI 科技平台 ════════════════
     集团科技大脑;四项能力:AI配方研发/生命科学数据库/趋势洞察与预测/智能研发引擎
     创始人补充定位:不是展示站,是「在线产品共创工作台」(对标 PDF 第100号 Quadpack 在线选型器) */
  {
    id: 'biosphere-ai',
    name: 'BIOSPHERE-AI',
    nameZh: '全球生命美妆AI科技平台',
    domain: 'biosphere-ai.com',
    url: 'https://biosphere-ai.com',
    defaultVariant: 'v1',
    brandColor: '#3b4a8c',
    indexable: true,
    hasStudio: true,
    variants: [
      {
        id: 'v1',
        name: '深空数据',
        nameEn: 'Deep Space',
        school: 'tech-spec',
        ref: 'Olaplex / K18 / Anker',
        note: '黑蓝底 + 等宽数字 + 参数表。最直白的"AI 大脑"表达,数据密度高。',
      },
      {
        id: 'v2',
        name: '白室',
        nameEn: 'White Room',
        school: 'clinical',
        ref: 'Anker 白版 / CeraVe',
        note: '纯白 + 靛蓝单强调色。反其道而行:AI 不靠黑底炫技,靠极简与秩序显专业。',
      },
      {
        id: 'v3',
        name: '靛蓝矩阵',
        nameEn: 'Indigo Matrix',
        school: 'tech-spec',
        ref: 'Foreo / 科技参数流派变体',
        note: '靛蓝主色 + 细网格背景 + 发光强调。介于深空与白室之间,品牌色最忠实的一版。',
      },
      {
        id: 'v4',
        name: '共创工作台',
        nameEn: 'Co-Creation Studio',
        school: 'performance',
        ref: 'Quadpack 在线选型器 / e.l.f. 明快版',
        note: '明快紫蓝 + 应用型入口卡。把首页当产品工作台入口做,呼应"在线共创"定位;不做倒计时促销件。',
      },
    ],
  },

  /* ══ 4. MEDIERBA · 高端草本医学美容品牌 ════════════════════════
     品牌视觉:金环 + 绿叶侧脸;四项能力:草本科技护肤/功效修护抗衰/植物活性配方/自然与科学融合
     PDF 结论:中草药线出海 Beauty of Joseon 是最佳对标 */
  {
    id: 'medierba',
    name: 'MEDIERBA',
    nameZh: '高端草本医学美容品牌',
    domain: 'medierba.com',
    url: 'https://medierba.com',
    defaultVariant: 'v1',
    brandColor: '#3e6b47',
    indexable: true,
    variants: [
      {
        id: 'v1',
        name: '玉竹米白',
        nameEn: 'Jade Ivory',
        school: 'clean-natural',
        ref: 'Beauty of Joseon(实测暖白 #FCFBF9 / 衬线标题 / 2px 圆角)',
        note: 'PDF 钦定对标的忠实复刻:暖白底 + 衬线标题 + 近乎零圆角 + 大留白。东方草本的国际表达。',
      },
      {
        id: 'v2',
        name: '墨玉东方',
        nameEn: 'Ink Jade',
        school: 'luxe',
        ref: '雪花秀 Sulwhasoo / 花西子',
        note: '深墨绿底 + 金线 + 大号衬线。最贵的一版,把草本讲成东方奢华,适合高客单医美渠道。',
      },
      {
        id: 'v3',
        name: '本草纸本',
        nameEn: 'Herbal Manuscript',
        school: 'clean-natural',
        ref: '花西子东方美学 / Aesop 文本气质',
        note: '宣纸米色 + 中文衬线 + 竖排眉标。古籍质感,承接本厂中草药古方 IP,独此一家。',
      },
      {
        id: 'v4',
        name: '医研白',
        nameEn: 'Medical White',
        school: 'clinical',
        ref: 'CeraVe / La Roche-Posay',
        note: '临床白 + 草绿强调 + 功效表格。压住"医学美容"里的医学侧,主打专业可信。',
      },
    ],
  },

  /* ══ 5. BIOSPHERE-ORALCARE · AI 口腔生命科技平台 ═══════════════
     品牌视觉:紫色牙齿 + 轨道环;四项能力:口腔微生态研究/益生菌口腔护理/智能口腔方案/全生命周期口腔健康
     PDF 结论:牙膏功效证明页对标 Boka / Quip / NOBS */
  {
    id: 'biosphere-oralcare',
    name: 'BIOSPHERE-ORALCARE',
    nameZh: 'AI口腔生命科技平台',
    domain: 'biosphere-oralcare.com',
    url: 'https://biosphere-oralcare.com',
    defaultVariant: 'v1',
    brandColor: '#6b4c9a',
    indexable: true,
    variants: [
      {
        id: 'v1',
        name: '临床白',
        nameEn: 'Clinical White',
        school: 'clinical',
        ref: 'Boka / Quip / NOBS',
        note: 'PDF 钦定:白底 + 单一强调色 + 功效证明表格。口腔品类的默认可信语言。',
      },
      {
        id: 'v2',
        name: '薄荷微生态',
        nameEn: 'Mint Biome',
        school: 'clean-natural',
        ref: 'Boka 自然版 / Bite',
        note: '米白 + 薄荷绿紫双色 + 圆润留白。把"益生菌口腔护理"讲成温和日常,弱化药感。',
      },
      {
        id: 'v3',
        name: '紫夜科技',
        nameEn: 'Violet Night',
        school: 'tech-spec',
        ref: 'Foreo / 智能硬件系',
        note: '深紫黑 + 轨道环发光。呼应品牌图的行星轨道符号,主打"智能口腔方案"。',
      },
      {
        id: 'v4',
        name: '证据密度',
        nameEn: 'Evidence Dense',
        school: 'performance',
        ref: 'Hismile 结构(只取明快配色 + 证据密度)',
        note: 'PDF:洁牙片自有品牌转化页照此结构搭。明快紫 + 前后对比 + 数据密集;倒计时与促销角标一律不做。',
      },
    ],
  },
];

/** 风格实验室:不是对外站点,用于把 5 站 × 4 风格并排渲染供创始人挑选 */
export const STYLE_LAB: SiteDef = {
  id: 'style-lab',
  name: '风格实验室',
  nameZh: '五站候选风格并排预览',
  domain: 'localhost',
  url: 'http://localhost:4321',
  defaultVariant: 'v1',
  brandColor: '#b8974a',
  indexable: false,
  variants: [
    {
      id: 'v1',
      name: '画廊',
      nameEn: 'Gallery',
      school: 'factory-b2b',
      ref: '—',
      note: '实验室自身外壳,不参与评选。',
    },
  ],
};

/** 全部 20 套候选风格的扁平清单(实验室索引页与构建校验用) */
export const ALL_VARIANTS = SITES.flatMap((s) =>
  s.variants.map((v) => ({ site: s, variant: v })),
);

/** 按 id 取站点;找不到即抛错(构建期暴露,好过静默出错页) */
export function getSite(id: string): SiteDef {
  const s = SITES.find((x) => x.id === id);
  if (!s) throw new Error(`[registry] 未知站点 id: ${id}`);
  return s;
}

/** 取某站的指定风格;未指定则取 defaultVariant */
export function getVariant(site: SiteDef, variantId?: string): VariantDef {
  const id = variantId ?? site.defaultVariant;
  const v = site.variants.find((x) => x.id === id);
  if (!v) throw new Error(`[registry] 站点 ${site.id} 没有风格 ${id}`);
  return v;
}

/** 八大流派(与 schools.css 的 [data-school] 一一对应),含 PDF 对本厂的处置结论 */
export const SCHOOLS: { id: SchoolId; zh: string; refs: string; use: string }[] = [
  { id: 'clinical', zh: '临床极简', refs: 'The Ordinary / Inkey List / CeraVe / Quip', use: '口腔站 v1、护肤站 v3、AI 站 v2、MEDIERBA v4' },
  { id: 'factory-b2b', zh: '工厂实力B2B', refs: 'Intercos / Cosmax / KDC-One / Quadpack', use: 'PDF 钦定本厂首选;两个 2OEM 站的 v1' },
  { id: 'clean-natural', zh: '清洁自然', refs: 'Beauty of Joseon / Osea / Bite / Boka', use: 'PDF:中草药线 BOJ 最佳对标;MEDIERBA v1·v3、SKIN2OEM v2、口腔 v2' },
  { id: 'luxe', zh: '奢华质感', refs: 'Aesop / Sulwhasoo / 花西子 / Quadpack', use: 'BEAUTY2OEM v2(香槟金)、MEDIERBA v2(墨玉东方)' },
  { id: 'dopamine', zh: '多巴胺Z世代', refs: 'Starface / Bubble / ColourPop', use: 'PDF:彩妆车间接年轻品牌代工时作趋势参考;当前 20 套里不启用' },
  { id: 'narrative', zh: '明星/叙事', refs: 'Rare Beauty / Rhode / Fenty', use: 'PDF:本厂无名人 IP,不复刻;仅占位' },
  { id: 'tech-spec', zh: '科技参数', refs: 'Olaplex / K18 / Foreo / Anker', use: 'AI 站 v1·v3、口腔 v3、BEAUTY2OEM v4、SKIN2OEM v4' },
  { id: 'performance', zh: '流量效率', refs: 'Hismile / e.l.f. / SHEIN', use: '只取明快配色与证据密度;AI 站 v4、口腔 v4;不做倒计时与促销角标' },
];
