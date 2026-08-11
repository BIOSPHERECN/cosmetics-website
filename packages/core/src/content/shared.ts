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
import type { Certification, InquiryFormLabels, WorkshopClip } from '../types.ts';
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

/**
 * 询盘页文案(5 站共用结构,只有邮箱与品牌名不同)
 * ───────────────────────────────────────────────────────────
 * 零后端方案:不做表单 POST(静态站没有服务端,接第三方表单服务会违反零外链纪律),
 * 改用「邮件预填模板」—— 点按钮直接唤起邮件客户端,主题与正文清单已填好。
 * 这对 B 端采购反而更顺手:他们本来就习惯用邮件,且邮件天然留痕、可转发给同事。
 * 后台落地后若需表单入库,再加一条服务端路由即可,本页版式不动。
 */
export const CONTACT: Record<Locale, {
  title: string;
  intro: string;
  checklistTitle: string;
  checklist: string[];
  mailButton: string;
  mailSubject: string;
  directTitle: string;
  emailLabel: string;
  responseLabel: string;
  responseValue: string;
  langLabel: string;
  langValue: string;
  note: string;
}> = {
  'zh-cn': {
    title: '发起询盘',
    intro: '把需求写清楚,我们的回复才有价值。下面这几项信息填得越具体,我们第一封回信就能给到可执行的方案,而不是一句「请提供更多信息」。',
    checklistTitle: '邮件里请包含',
    checklist: [
      '产品品类与剂型(例:精华 / 面霜 / 牙膏)',
      '目标市场与销售渠道(决定合规路径与标签规则)',
      '预估首单数量与年用量',
      '期望上市时间',
      '是否已有配方、包材或竞品参照',
      '预算区间(可给范围,便于我们匹配方案)',
    ],
    mailButton: '用邮件发起询盘',
    mailSubject: '询盘 · 产品开发需求',
    directTitle: '直接联系',
    emailLabel: '邮箱',
    responseLabel: '回复时效',
    responseValue: '两个工作日内书面回复',
    langLabel: '沟通语言',
    langValue: '中文 / English / 日本語',
    note: '我们不做消费者零售,不设线上购物车;本站所有入口都指向 B 端询盘。',
  },
  'zh-tw': {
    title: '發起詢價',
    intro: '把需求寫清楚,我們的回覆才有價值。下列資訊填得越具體,我們第一封回信就能給出可執行的方案,而非一句「請提供更多資訊」。',
    checklistTitle: '郵件中請包含',
    checklist: [
      '產品品類與劑型(例:精華 / 面霜 / 牙膏)',
      '目標市場與銷售通路(決定法規路徑與標籤規則)',
      '預估首單數量與年用量',
      '期望上市時間',
      '是否已有配方、包材或競品參照',
      '預算區間(可給範圍,便於我們匹配方案)',
    ],
    mailButton: '用郵件發起詢價',
    mailSubject: '詢價 · 產品開發需求',
    directTitle: '直接聯絡',
    emailLabel: '信箱',
    responseLabel: '回覆時效',
    responseValue: '兩個工作日內書面回覆',
    langLabel: '溝通語言',
    langValue: '中文 / English / 日本語',
    note: '我們不做消費者零售,不設線上購物車;本站所有入口皆指向 B 端詢價。',
  },
  en: {
    title: 'Start an inquiry',
    intro: 'A clear brief earns a useful reply. The more specific the items below, the more our first response can be an actionable plan rather than a request for more information.',
    checklistTitle: 'Please include in your email',
    checklist: [
      'Product category and format (e.g. serum, cream, toothpaste)',
      'Target market and sales channel — these determine the regulatory path and labelling rules',
      'Estimated first order quantity and annual volume',
      'Intended launch date',
      'Whether you already have a formula, packaging or a reference product',
      'Budget range — a range is fine and helps us match the right approach',
    ],
    mailButton: 'Send an inquiry by email',
    mailSubject: 'Inquiry · Product development brief',
    directTitle: 'Direct contact',
    emailLabel: 'Email',
    responseLabel: 'Response time',
    responseValue: 'Written reply within two working days',
    langLabel: 'Working languages',
    langValue: 'English / 中文 / 日本語',
    note: 'We do not sell to consumers and run no online cart; every route on this site leads to a B2B inquiry.',
  },
  ja: {
    title: 'お問い合わせ',
    intro: 'ご要望が明確なほど、返信の価値も高まります。以下の項目を具体的にお書きいただけると、最初のご返信から実行可能な提案をお出しできます。',
    checklistTitle: 'メールにご記載ください',
    checklist: [
      '製品カテゴリーと剤形(例:美容液 / クリーム / 歯みがき)',
      '対象市場と販売チャネル(法規経路と表示ルールを左右します)',
      '初回発注予定数量と年間数量',
      '希望する発売時期',
      '既存の処方・容器・参考製品の有無',
      'ご予算帯(範囲で結構です。ご提案の精度が上がります)',
    ],
    mailButton: 'メールで問い合わせる',
    mailSubject: 'お問い合わせ・製品開発のご相談',
    directTitle: '直接のご連絡',
    emailLabel: 'メール',
    responseLabel: '回答期限',
    responseValue: '2 営業日以内に書面でご回答',
    langLabel: '対応言語',
    langValue: '日本語 / 中文 / English',
    note: '当社は一般消費者向けの販売を行わず、オンラインカートも設けていません。本サイトの導線はすべて法人様のお問い合わせに向かいます。',
  },
};

/**
 * 落地页内嵌询盘表单标签(PDF 定案第 7 屏:姓名/公司/邮箱/国家/需求)
 * 5 站共用同一套字段 —— 字段一致,将来后台的询盘池才不用按站分表。
 */
export const FORM_LABELS: Record<Locale, InquiryFormLabels> = {
  'zh-cn': {
    name: '姓名', company: '公司', email: '邮箱', country: '国家/地区', need: '需求描述',
    submit: '提交询盘',
    privacyNote: '提交的信息仅用于回复本次询盘,不用于任何第三方营销。当前阶段由邮件直达业务负责人。',
  },
  'zh-tw': {
    name: '姓名', company: '公司', email: '信箱', country: '國家/地區', need: '需求描述',
    submit: '送出詢價',
    privacyNote: '送出的資訊僅用於回覆本次詢價,不用於任何第三方行銷。現階段以郵件直達業務負責人。',
  },
  en: {
    name: 'Name', company: 'Company', email: 'Email', country: 'Country / region', need: 'What you need',
    submit: 'Send inquiry',
    privacyNote: 'Your details are used only to answer this inquiry and are never passed to third-party marketing. At this stage the form reaches our account team by email.',
  },
  ja: {
    name: 'お名前', company: '会社名', email: 'メールアドレス', country: '国・地域', need: 'ご要望',
    submit: '送信する',
    privacyNote: 'ご記入内容は本件へのご回答のみに使用し、第三者のマーケティングには一切利用しません。現時点ではメールで担当者へ直接届きます。',
  },
};

/**
 * 车间实证三段(PDF 定案第 2 屏:乳化/灌装/包装各一段)
 * 各站工段名略有差异(口腔线是膏体制备而非乳化),用参数区分。
 * ⚠️ media 一律留空 —— PDF 摄影红线禁用素材库摆拍图,实拍到位前前端显示待补占位框。
 */
export function workshopClips(locale: Locale, kind: 'cosmetic' | 'oral' = 'cosmetic'): WorkshopClip[] {
  const first = {
    'zh-cn': kind === 'oral' ? '膏体制备' : '乳化车间',
    'zh-tw': kind === 'oral' ? '膏體製備' : '乳化車間',
    en: kind === 'oral' ? 'Paste compounding' : 'Emulsification',
    ja: kind === 'oral' ? 'ペースト調製' : '乳化工程',
  }[locale];

  const table: Record<Locale, { t: string; c: string; d: string }[]> = {
    'zh-cn': [
      { t: first, c: '真空乳化锅与温控记录,同一配方每批的工艺参数可回溯比对。', d: '45 秒' },
      { t: '灌装产线', c: '按剂型切换灌装头,在线称重剔除,装量偏差逐支监控。', d: '40 秒' },
      { t: '包装与出货检', c: '贴标、批号喷码、外箱码放,出货前按 AQL 抽检。', d: '35 秒' },
    ],
    'zh-tw': [
      { t: first, c: '真空乳化鍋與溫控紀錄,同一配方每批的製程參數可回溯比對。', d: '45 秒' },
      { t: '充填產線', c: '依劑型切換充填頭,線上秤重剔除,裝量偏差逐支監控。', d: '40 秒' },
      { t: '包裝與出貨檢', c: '貼標、批號噴碼、外箱碼放,出貨前依 AQL 抽檢。', d: '35 秒' },
    ],
    en: [
      { t: first, c: 'Vacuum emulsifiers with logged temperature control, so process parameters stay comparable batch to batch.', d: '45s' },
      { t: 'Filling lines', c: 'Filling heads swapped by format, with in-line checkweighing rejecting out-of-spec units.', d: '40s' },
      { t: 'Packing and outgoing check', c: 'Labelling, batch coding and case packing, with AQL sampling before release.', d: '35s' },
    ],
    ja: [
      { t: first, c: '真空乳化釜と温度記録により、同一処方のロット間で工程条件を照合できます。', d: '45秒' },
      { t: '充填ライン', c: '剤形に応じて充填ヘッドを切替え、インライン重量検査で規格外を排除します。', d: '40秒' },
      { t: '包装・出荷検査', c: 'ラベル貼付、ロット印字、ケース詰めを行い、出荷前に AQL 抜取検査を実施します。', d: '35秒' },
    ],
  };
  const ids = ['compound', 'filling', 'packing'];
  return table[locale].map((x, i) => ({ id: ids[i], title: x.t, caption: x.c, duration: x.d }));
}

/** 车间实证区块标题(各语言) */
export const WORKSHOP_BLOCK: Record<Locale, { title: string; intro: string }> = {
  'zh-cn': {
    title: '车间实证',
    intro: '判断一家代工厂是真是假,看车间比看文案快。以下三段覆盖乳化、灌装、包装三个关键工段,均为自有产线实拍,不做后期修饰。',
  },
  'zh-tw': {
    title: '車間實證',
    intro: '判斷一家代工廠是真是假,看車間比看文案快。以下三段涵蓋乳化、充填、包裝三個關鍵工段,皆為自有產線實拍,不做後製修飾。',
  },
  en: {
    title: 'Inside the plant',
    intro: 'A shop floor tells you more about a manufacturer than any brochure. These three clips cover compounding, filling and packing on our own lines, recorded without retouching.',
  },
  ja: {
    title: '製造現場',
    intro: '製造委託先の実力は、パンフレットより現場を見るほうが早く分かります。以下の三本は自社ラインの調製・充填・包装工程を、加工なしで撮影したものです。',
  },
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
