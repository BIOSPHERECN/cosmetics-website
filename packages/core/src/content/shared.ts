/**
 * 5 站共享内容层
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ TODO(创始人核实) ⚠️
 * 本文件及各站内容文件里的【认证清单、产能数字、研发人数、交付国家数、年限】
 * 全部是**占位样例**,用于验证版式与风格,尚未经创始人核实。
 *
 * 上线前必须逐项替换为真实数据。在此之前:
 *   · 所有构建默认 noindex(见 BaseLayout 的收录闸门 PUBLIC_LIVE)
 *   · 不得对外发布任何含这些数字的链接
 *
 * 将来接入后台(Directus / Keystatic)后,本文件由后台导出的 JSON 取代,
 * 形状必须继续符合 types.ts 的契约。
 * ═══════════════════════════════════════════════════════════════════
 */
import type { Certification } from '../types.ts';
import type { Locale } from '../i18n/index.ts';

/** 集团级资质(5 站共用)—— 占位样例,待核实 */
export const CERTS: Record<Locale, Certification[]> = {
  'zh-cn': [
    { id: 'iso22716', label: 'ISO 22716', note: '化妆品良好生产规范 GMPC' },
    { id: 'iso9001', label: 'ISO 9001', note: '质量管理体系' },
    { id: 'iso14001', label: 'ISO 14001', note: '环境管理体系' },
    { id: 'fda', label: 'FDA', note: '美国食品药品监督管理局企业注册' },
    { id: 'cpnp', label: 'EU CPNP', note: '欧盟化妆品法规通报' },
    { id: 'sgs', label: 'SGS / Intertek', note: '第三方检测与验厂报告' },
  ],
  'zh-tw': [
    { id: 'iso22716', label: 'ISO 22716', note: '化妝品優良製造規範 GMPC' },
    { id: 'iso9001', label: 'ISO 9001', note: '品質管理系統' },
    { id: 'iso14001', label: 'ISO 14001', note: '環境管理系統' },
    { id: 'fda', label: 'FDA', note: '美國食品藥物管理局企業註冊' },
    { id: 'cpnp', label: 'EU CPNP', note: '歐盟化妝品法規通報' },
    { id: 'sgs', label: 'SGS / Intertek', note: '第三方檢測與驗廠報告' },
  ],
  en: [
    { id: 'iso22716', label: 'ISO 22716', note: 'Good Manufacturing Practice for cosmetics' },
    { id: 'iso9001', label: 'ISO 9001', note: 'Quality management system' },
    { id: 'iso14001', label: 'ISO 14001', note: 'Environmental management system' },
    { id: 'fda', label: 'FDA', note: 'US FDA facility registration' },
    { id: 'cpnp', label: 'EU CPNP', note: 'EU cosmetic product notification' },
    { id: 'sgs', label: 'SGS / Intertek', note: 'Third-party testing and factory audit' },
  ],
  ja: [
    { id: 'iso22716', label: 'ISO 22716', note: '化粧品の適正製造規範 GMPC' },
    { id: 'iso9001', label: 'ISO 9001', note: '品質マネジメントシステム' },
    { id: 'iso14001', label: 'ISO 14001', note: '環境マネジメントシステム' },
    { id: 'fda', label: 'FDA', note: '米国 FDA 施設登録' },
    { id: 'cpnp', label: 'EU CPNP', note: 'EU 化粧品規則に基づく届出' },
    { id: 'sgs', label: 'SGS / Intertek', note: '第三者試験・工場監査' },
  ],
};

/** 认证墙标题与脚注(各语言) */
export const CERT_BLOCK: Record<Locale, { title: string; note: string }> = {
  'zh-cn': {
    title: '资质与合规',
    note: '证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。',
  },
  'zh-tw': {
    title: '資質與合規',
    note: '證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。',
  },
  en: {
    title: 'Certifications & compliance',
    note: 'Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.',
  },
  ja: {
    title: '認証とコンプライアンス',
    note: '証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。',
  },
};

/** 询盘直连邮箱(占位,待创始人指定真实邮箱) */
export const EMAIL: Record<string, string> = {
  beauty2oem: 'inquiry@beauty2oem.com',
  skin2oem: 'inquiry@skin2oem.com',
  'biosphere-ai': 'contact@biosphere-ai.com',
  medierba: 'contact@medierba.com',
  'biosphere-oralcare': 'inquiry@biosphere-oralcare.com',
};

/** 询盘带文案(B 端口吻,零促销件) */
export const INQUIRY: Record<Locale, { title: string; body: string; button: string }> = {
  'zh-cn': {
    title: '带着你的需求来,我们用一份可执行的方案回复',
    body: '无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。',
    button: '发起询盘',
  },
  'zh-tw': {
    title: '帶著你的需求來,我們以一份可執行的方案回覆',
    body: '無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。',
    button: '發起詢價',
  },
  en: {
    title: 'Bring us the brief — we reply with an actionable plan',
    body: 'Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.',
    button: 'Start an inquiry',
  },
  ja: {
    title: 'ご要望をお寄せください。実行可能な提案でお返しします',
    body: '既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。',
    button: 'お問い合わせ',
  },
};
