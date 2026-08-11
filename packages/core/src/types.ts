/**
 * 内容契约类型 —— 与 content/SCHEMA.md 一一对应。
 * 这是「内容 JSON → 前端」的唯一接口:将来 WordPress REST 导出脚本
 * 必须产出符合这些类型的 JSON;字段增删先改 SCHEMA.md 与本文件,再改导出脚本。
 */

/** 每页通用 SEO 块 */
export interface SeoBlock {
  /** <title> 与 og:title(站名后缀由 SEOHead 组件自动追加) */
  title: string;
  /** meta description,建议 70–160 字符 */
  description: string;
}

/** 资质认证条目(占位徽标由前端统一绘制,内容层只给文字) */
export interface Certification {
  id: string;
  label: string;
  note?: string;
}

export interface BrandContact {
  email: string;
  phone?: string;
  address?: string;
  hoursNote?: string;
}

/** 旗下品牌互链(施工图钦定:默认开,可整站关;样板站暂无数据) */
export interface CrossBrand {
  name: string;
  url: string;
}

/** brand.json —— 品牌信息 */
export interface BrandInfo {
  brandId: string;
  name: string;
  shortName?: string;
  tagline: string;
  description: string;
  contact: BrandContact;
  certifications: Certification[];
  crossBrands?: CrossBrand[];
}

/** 产品品类(静态分组用,不做客户端筛选) */
export interface ProductCategory {
  id: string;
  name: string;
  tagline?: string;
  /** 品类入口卡占位图(站内 SVG 路径) */
  image?: string;
}

export interface ProductHighlight {
  name: string;
  desc: string;
}

export interface ProductSpec {
  label: string;
  value: string;
}

/** products.json 里的单个产品 */
export interface Product {
  /** 全语言共享的稳定 slug(URL 用),只许小写字母/数字/连字符 */
  slug: string;
  /** 所属品类 id,必须能在 categories 里找到 */
  category: string;
  name: string;
  /** 一句话卖点(列表卡用) */
  summary: string;
  /** 详情页正文(2–4 句) */
  description: string;
  /** 站内占位 SVG 路径,如 /images/placeholder/prod-xxx.svg */
  image: string;
  imageAlt?: string;
  highlights: ProductHighlight[];
  specs: ProductSpec[];
  /** 是否在首页产品线卡里优先露出 */
  featured?: boolean;
}

/** products.json 整体 */
export interface ProductsFile {
  categories: ProductCategory[];
  products: Product[];
}

export interface HeroBlock {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image?: string;
  imageAlt?: string;
  ctaPrimary?: string;
  ctaSecondary?: string;
}

export interface InquiryCta {
  title: string;
  body?: string;
  button: string;
}

/** pages/home.json */
export interface HomePage {
  seo: SeoBlock;
  hero: HeroBlock;
  lines: { title: string; intro?: string };
  certs: { title: string; note?: string };
  inquiry: InquiryCta;
}

/* ══════════════════════════════════════════════════════════════
   以下为「PDF 钦定信息架构」的内容契约:数字墙 / 认证墙 / 品类矩阵
   + 参数表(科技参数流派)+ 证据陈列(口腔功效证明)。
   依据《100家独立站风格调研与复刻方案-v1.pdf》对本厂的结论:
   「本厂落地页信息架构首选:数字墙+认证墙+品类矩阵」
   ══════════════════════════════════════════════════════════════ */

/** 数字墙单项:产能/研发/交付等硬数字,是 B 端信任的第一层 */
export interface StatItem {
  value: string;
  label: string;
  note?: string;
}

/** 品类能力矩阵单项(对标 KDC-One 的品类能力矩阵页) */
export interface MatrixItem {
  id: string;
  title: string;
  desc: string;
  /** 该品类下的代表剂型,PDF 定案要求每列 3–5 个 */
  bullets?: string[];
  /** 起订量区间 —— PDF 定案明确要求标注,B 端采购第一个想知道的就是这个 */
  moq?: string;
}

/**
 * 车间实证单元(PDF 定案第 2 屏)
 * 原文:「30-60 秒车间实拍视频(乳化/灌装/包装各一段),配一行说明」,参照 Cosmax 工厂展示。
 * PDF 摄影红线:车间与设备实拍为主,冷白光,不加滤镜,**禁用素材库摆拍图**。
 * 因此 media 未提供时,前端画的是「待补实拍」占位框,绝不拿库存图充数。
 */
export interface WorkshopClip {
  id: string;
  /** 工段名,如「乳化车间」 */
  title: string;
  /** 一行说明 */
  caption: string;
  /** 时长标注,如「45 秒」 */
  duration?: string;
  /** 实拍素材站内路径;缺省即显示待补占位 */
  media?: string;
}

/**
 * 合作证明单元(PDF 定案第 6 屏)
 * 原文:「服务品牌数/出口国家数/客户评价(可匿名),**不用绝对化用语**」。
 * 客户名一律匿名化到「地区 + 品类 + 角色」粒度,避免未授权披露客户关系。
 */
export interface Testimonial {
  quote: string;
  /** 匿名归属,如「欧洲某护肤品牌 · 采购负责人」 */
  attribution: string;
}

/** 落地页内嵌询盘表单字段标签(PDF 定案第 7 屏:姓名/公司/邮箱/国家/需求) */
export interface InquiryFormLabels {
  name: string;
  company: string;
  email: string;
  country: string;
  need: string;
  submit: string;
  /** 提交去向说明,让访客知道数据到哪去 */
  privacyNote: string;
}

/** 代工服务流程单步(B 端最关心「怎么合作」,PDF 工厂实力流派的标配版块) */
export interface ProcessStep {
  /** 步骤序号,如 01 */
  no: string;
  title: string;
  desc: string;
  /** 该步耗时 —— PDF 定案要求「标注各步时长」,交期是 B 端决策的关键变量 */
  duration?: string;
}

/** 证据陈列单项:一句主张 + 一份支撑(对标临床极简流派的功效证明页) */
export interface EvidenceItem {
  claim: string;
  proof: string;
  source?: string;
}

/** 首页完整内容契约(WordPress 导出脚本须产出此形状) */
export interface HomeContent {
  seo: SeoBlock;
  hero: {
    eyebrow?: string;
    title: string;
    lead: string;
    ctaPrimary: string;
    ctaSecondary?: string;
  };
  stats: { title?: string; items: StatItem[] };
  /** 第 2 屏 车间实证 —— 仅代工站使用;自有品牌站(MEDIERBA)不适用 */
  workshop?: { title: string; intro?: string; clips: WorkshopClip[] };
  matrix: { title: string; intro?: string; items: MatrixItem[] };
  process: { title: string; intro?: string; steps: ProcessStep[] };
  certs: { title: string; note?: string; items: Certification[] };
  /** 第 6 屏 合作证明 —— 服务品牌数/出口国家数 + 匿名客户评价 */
  proof?: { title: string; intro?: string; stats: StatItem[]; testimonials: Testimonial[] };
  /** 第 7 屏 落地页内嵌询盘表单 */
  form?: { title: string; intro?: string; labels: InquiryFormLabels };
  /** 可选:仅证据导向的站点(口腔/功效)使用 */
  evidence?: { title: string; intro?: string; items: EvidenceItem[] };
  /** 可选:仅科技参数流派使用 */
  specs?: { title: string; rows: ProductSpec[] };
  inquiry: InquiryCta;
}

export interface StorySection {
  heading: string;
  body: string;
  image?: string;
  imageAlt?: string;
}

export interface BrandStat {
  value: string;
  label: string;
}

/** pages/brand.json —— 品牌故事页 */
export interface BrandPage {
  seo: SeoBlock;
  hero: HeroBlock;
  sections: StorySection[];
  stats?: BrandStat[];
}

/** pages/products.json —— 产品目录页 */
export interface ProductsPage {
  seo: SeoBlock;
  title: string;
  intro?: string;
}

export interface ContactFormLabels {
  name: string;
  company: string;
  email: string;
  message: string;
  submit: string;
  note?: string;
}

export interface ContactDirect {
  title: string;
  emailLabel: string;
  phoneLabel: string;
  addressLabel: string;
}

/** pages/contact.json —— 联系询盘页 */
export interface ContactPage {
  seo: SeoBlock;
  title: string;
  intro?: string;
  form: ContactFormLabels;
  direct: ContactDirect;
}
