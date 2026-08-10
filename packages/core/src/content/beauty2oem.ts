/**
 * BEAUTY2OEM · 全球美妆智能制造平台 —— 首页四语内容
 * 定位与四项能力取自创始人品牌视觉图:全品类美妆制造 / 品牌孵化与定制 / 供应链整合 / 全球交付服务。
 * ⚠️ 数字与认证为占位样例,见 shared.ts 顶部说明。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { CERTS, CERT_BLOCK, INQUIRY } from './shared.ts';

export const beauty2oem: Record<Locale, HomeContent> = {
  'zh-cn': {
    seo: {
      title: '全球美妆智能制造平台',
      description: '全品类美妆制造、品牌孵化与定制、供应链整合与全球交付。帛卉集团旗下美妆智造平台,以研发实力与产能规模支撑品牌从 0 到量产。',
    },
    hero: {
      eyebrow: '智造之美',
      title: '从配方到成品,一站式美妆智能制造',
      lead: '我们不只是代工车间。从配方研发、包材选型、合规备案到全球交付,把一个想法变成能上架的产品,中间的每一环我们都替品牌方跑通。',
      ctaPrimary: '发起询盘',
      ctaSecondary: '查看制造能力',
    },
    stats: {
      title: '产能与规模',
      items: [
        { value: '1.2 亿支', label: '年综合产能', note: '按标准品折算' },
        { value: '8 大品类', label: '覆盖品类', note: '护肤 / 彩妆 / 洁护 / 香氛等' },
        { value: '120 人', label: '研发与工艺团队' },
        { value: '46 国', label: '累计交付国家与地区' },
      ],
    },
    matrix: {
      title: '四项核心能力',
      intro: '品牌方在不同阶段需要的东西不一样 —— 有的要一条配方,有的要一整套从 0 到 1。这四块能力可以单独用,也可以打包用。',
      items: [
        {
          id: 'manufacturing',
          title: '全品类美妆制造',
          desc: '护肤、彩妆、洁护、香氛四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。',
          bullets: ['乳化 / 灌装 / 压粉 / 冷制多工艺线', '小批量试产与大货同线,配方一致性可控', '半固体、液体、粉体剂型全覆盖'],
        },
        {
          id: 'incubation',
          title: '品牌孵化与定制',
          desc: '没有配方、没有包材、只有一个品牌想法,也能开始。我们从品类定位往回推,给出可执行的产品线规划。',
          bullets: ['配方定制与既有配方复刻', '包材选型与结构打样', '视觉与文案的产品端落地建议'],
        },
        {
          id: 'supplychain',
          title: '供应链整合',
          desc: '原料、包材、检测、物流分散在不同供应商时,交期与成本最容易失控。我们把它收拢成一条链。',
          bullets: ['原料溯源与替代方案库', '包材集采,降低小单起订压力', '第三方检测与合规文件统一归口'],
        },
        {
          id: 'delivery',
          title: '全球交付服务',
          desc: '出口目的地不同,合规要求与标签规则也不同。我们按目的地清单准备文件,不让货卡在关口。',
          bullets: ['目的地合规文件逐项准备', '多语言标签与说明书排版', '海运 / 空运 / 快递多渠道方案'],
        },
      ],
    },
    process: {
      title: '合作怎么开始',
      intro: '从第一封邮件到第一批货,通常五步。每一步交付什么、需要你确认什么,我们提前写清楚。',
      steps: [
        { no: '01', title: '需求对接', desc: '说清品类、目标市场、预算区间与期望上市时间,我们给出可行性判断与初步方案。' },
        { no: '02', title: '配方打样', desc: '实验室出样,寄样确认肤感、外观与稳定性;需要调整的地方在这一步改完。' },
        { no: '03', title: '样品确认', desc: '包材结构与成品样一并确认,同步启动第三方检测与合规文件。' },
        { no: '04', title: '量产备案', desc: '按目的地完成备案与注册,量产排期锁定,原料与包材同步到位。' },
        { no: '05', title: '交付履约', desc: '大货生产、出货检验、物流安排;交付后配方与工艺参数归档,便于返单复产。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-cn'].title, note: CERT_BLOCK['zh-cn'].note, items: CERTS['zh-cn'] },
    inquiry: INQUIRY['zh-cn'],
  },

  'zh-tw': {
    seo: {
      title: '全球美妝智能製造平台',
      description: '全品類美妝製造、品牌孵化與定制、供應鏈整合與全球交付。帛卉集團旗下美妝智造平台,以研發實力與產能規模支撐品牌從 0 到量產。',
    },
    hero: {
      eyebrow: '智造之美',
      title: '從配方到成品,一站式美妝智能製造',
      lead: '我們不只是代工車間。從配方研發、包材選型、法規備案到全球交付,把一個想法變成能上架的產品,中間每一環我們都替品牌方跑通。',
      ctaPrimary: '發起詢價',
      ctaSecondary: '查看製造能力',
    },
    stats: {
      title: '產能與規模',
      items: [
        { value: '1.2 億支', label: '年綜合產能', note: '按標準品折算' },
        { value: '8 大品類', label: '覆蓋品類', note: '護膚 / 彩妝 / 潔護 / 香氛等' },
        { value: '120 人', label: '研發與製程團隊' },
        { value: '46 國', label: '累計交付國家與地區' },
      ],
    },
    matrix: {
      title: '四項核心能力',
      intro: '品牌方在不同階段需要的東西不一樣 —— 有的要一條配方,有的要一整套從 0 到 1。這四塊能力可單獨使用,也可打包使用。',
      items: [
        {
          id: 'manufacturing',
          title: '全品類美妝製造',
          desc: '護膚、彩妝、潔護、香氛四條產線並行,同一訂單可跨品類組合,不必分散到多家工廠。',
          bullets: ['乳化 / 充填 / 壓粉 / 冷製多製程線', '小批試產與大貨同線,配方一致性可控', '半固體、液體、粉體劑型全覆蓋'],
        },
        {
          id: 'incubation',
          title: '品牌孵化與定制',
          desc: '沒有配方、沒有包材、只有一個品牌想法,也能開始。我們從品類定位往回推,給出可執行的產品線規劃。',
          bullets: ['配方定制與既有配方複刻', '包材選型與結構打樣', '視覺與文案的產品端落地建議'],
        },
        {
          id: 'supplychain',
          title: '供應鏈整合',
          desc: '原料、包材、檢測、物流分散在不同供應商時,交期與成本最容易失控。我們把它收攏成一條鏈。',
          bullets: ['原料溯源與替代方案庫', '包材集採,降低小單起訂壓力', '第三方檢測與法規文件統一歸口'],
        },
        {
          id: 'delivery',
          title: '全球交付服務',
          desc: '出口目的地不同,法規要求與標籤規則也不同。我們依目的地清單準備文件,不讓貨卡在關口。',
          bullets: ['目的地法規文件逐項準備', '多語言標籤與說明書排版', '海運 / 空運 / 快遞多管道方案'],
        },
      ],
    },
    process: {
      title: '合作怎麼開始',
      intro: '從第一封郵件到第一批貨,通常五步。每一步交付什麼、需要你確認什麼,我們提前寫清楚。',
      steps: [
        { no: '01', title: '需求對接', desc: '說清品類、目標市場、預算區間與期望上市時間,我們給出可行性判斷與初步方案。' },
        { no: '02', title: '配方打樣', desc: '實驗室出樣,寄樣確認膚感、外觀與穩定性;需要調整的地方在這一步改完。' },
        { no: '03', title: '樣品確認', desc: '包材結構與成品樣一併確認,同步啟動第三方檢測與法規文件。' },
        { no: '04', title: '量產備案', desc: '依目的地完成備案與註冊,量產排期鎖定,原料與包材同步到位。' },
        { no: '05', title: '交付履約', desc: '大貨生產、出貨檢驗、物流安排;交付後配方與製程參數歸檔,便於返單複產。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-tw'].title, note: CERT_BLOCK['zh-tw'].note, items: CERTS['zh-tw'] },
    inquiry: INQUIRY['zh-tw'],
  },

  en: {
    seo: {
      title: 'Global Intelligent Beauty Manufacturing',
      description: 'Full-category beauty manufacturing, brand incubation and customization, supply-chain integration and global delivery. The beauty manufacturing platform of BOHUI Group.',
    },
    hero: {
      eyebrow: 'Intelligent Manufacturing',
      title: 'From formula to finished product — one manufacturing partner',
      lead: 'We are more than a filling line. Formulation, packaging selection, regulatory registration, global delivery — every step between an idea and a shelf-ready product is one we run on your behalf.',
      ctaPrimary: 'Start an inquiry',
      ctaSecondary: 'See our capabilities',
    },
    stats: {
      title: 'Capacity and scale',
      items: [
        { value: '120M units', label: 'Annual capacity', note: 'standard-unit equivalent' },
        { value: '8 categories', label: 'Categories covered', note: 'skincare, colour, cleansing, fragrance and more' },
        { value: '120', label: 'R&D and process engineers' },
        { value: '46', label: 'Countries and regions shipped to' },
      ],
    },
    matrix: {
      title: 'Four core capabilities',
      intro: 'Brands need different things at different stages — sometimes a single formula, sometimes the whole path from zero to one. These four blocks work on their own or together.',
      items: [
        {
          id: 'manufacturing',
          title: 'Full-category manufacturing',
          desc: 'Skincare, colour cosmetics, cleansing and fragrance lines run in parallel, so one order can span categories instead of being split across factories.',
          bullets: ['Emulsion, filling, powder pressing and cold-process lines', 'Pilot batches share the line with production runs, keeping formula consistency controllable', 'Semi-solid, liquid and powder formats covered'],
        },
        {
          id: 'incubation',
          title: 'Brand incubation and customization',
          desc: 'No formula, no packaging, just a brand idea is enough to begin. We work backwards from category positioning to an executable product-line plan.',
          bullets: ['Custom formulation and reproduction of existing formulas', 'Packaging selection and structural prototyping', 'Product-side guidance for visual identity and copy'],
        },
        {
          id: 'supplychain',
          title: 'Supply-chain integration',
          desc: 'When ingredients, packaging, testing and logistics sit with different vendors, lead time and cost are the first things to slip. We consolidate them into one chain.',
          bullets: ['Ingredient traceability and a library of substitutes', 'Pooled packaging procurement to ease MOQ pressure', 'Third-party testing and compliance documents under one owner'],
        },
        {
          id: 'delivery',
          title: 'Global delivery',
          desc: 'Compliance and labelling rules differ by destination. We prepare documentation against the destination checklist so shipments do not stall at the border.',
          bullets: ['Destination-specific compliance documentation', 'Multilingual labels and insert typesetting', 'Sea, air and courier routing options'],
        },
      ],
    },
    process: {
      title: 'How engagements start',
      intro: 'From first email to first shipment is usually five steps. What each step delivers, and what we need you to sign off, is written down in advance.',
      steps: [
        { no: '01', title: 'Brief', desc: 'Tell us the category, target market, budget range and intended launch date. We come back with a feasibility read and an outline plan.' },
        { no: '02', title: 'Formulation', desc: 'Lab samples are produced and shipped for sign-off on texture, appearance and stability. Adjustments happen here.' },
        { no: '03', title: 'Sample approval', desc: 'Packaging structure and finished samples are approved together, with third-party testing and compliance documents started in parallel.' },
        { no: '04', title: 'Registration', desc: 'Destination registration completed, production slot locked, ingredients and packaging staged.' },
        { no: '05', title: 'Delivery', desc: 'Production, outgoing inspection and logistics. Formula and process parameters are archived afterwards so repeat orders reproduce exactly.' },
      ],
    },
    certs: { title: CERT_BLOCK.en.title, note: CERT_BLOCK.en.note, items: CERTS.en },
    inquiry: INQUIRY.en,
  },

  ja: {
    seo: {
      title: 'グローバル美容スマート製造プラットフォーム',
      description: '全カテゴリー化粧品製造、ブランド育成とカスタマイズ、サプライチェーン統合、グローバル納品。帛卉グループの化粧品スマート製造プラットフォーム。',
    },
    hero: {
      eyebrow: 'スマート製造',
      title: '処方から完成品まで、一貫したスマート製造',
      lead: '当社は充填工場にとどまりません。処方開発、容器選定、法規登録、グローバル納品 —— アイデアが棚に並ぶ製品になるまでの各工程を、ブランド様に代わって進めます。',
      ctaPrimary: 'お問い合わせ',
      ctaSecondary: '製造能力を見る',
    },
    stats: {
      title: '生産能力と規模',
      items: [
        { value: '1.2 億本', label: '年間総生産能力', note: '標準品換算' },
        { value: '8 カテゴリー', label: '対応カテゴリー', note: 'スキンケア / メイク / 洗浄 / フレグランス ほか' },
        { value: '120 名', label: '研究開発・製造技術チーム' },
        { value: '46 か国', label: '累計納品国・地域' },
      ],
    },
    matrix: {
      title: '四つの中核能力',
      intro: 'ブランド様が必要とするものは段階ごとに異なります。処方一本の場合も、ゼロからの立ち上げ一式の場合もあります。四つの能力は単独でも、まとめてでもご利用いただけます。',
      items: [
        {
          id: 'manufacturing',
          title: '全カテゴリー製造',
          desc: 'スキンケア、メイク、洗浄、フレグランスの四ラインが並行稼働。一つの発注でカテゴリーをまたげるため、複数工場に分散する必要がありません。',
          bullets: ['乳化 / 充填 / プレス / 冷製の複数工程ライン', '試作と量産が同一ライン、処方の再現性を管理', '半固形・液体・粉体の剤形に対応'],
        },
        {
          id: 'incubation',
          title: 'ブランド育成とカスタマイズ',
          desc: '処方も容器もなく、ブランドの構想だけでも着手できます。カテゴリー戦略から逆算し、実行可能な製品ライン計画をご提案します。',
          bullets: ['処方のカスタム開発と既存処方の再現', '容器選定と構造試作', 'ビジュアル・コピーの製品側への落とし込み'],
        },
        {
          id: 'supplychain',
          title: 'サプライチェーン統合',
          desc: '原料、容器、試験、物流が別々の取引先に分散すると、納期とコストが真っ先に崩れます。当社はこれを一本の鎖にまとめます。',
          bullets: ['原料のトレーサビリティと代替案のライブラリ', '容器の共同調達で小ロットの負担を軽減', '第三者試験と法規書類の窓口を一本化'],
        },
        {
          id: 'delivery',
          title: 'グローバル納品',
          desc: '仕向地ごとに法規要件と表示ルールが異なります。仕向地チェックリストに沿って書類を準備し、通関で止まらないようにします。',
          bullets: ['仕向地別の法規書類を個別準備', '多言語ラベルと添付文書の組版', '海上・航空・クーリエの複数ルート'],
        },
      ],
    },
    process: {
      title: '進め方',
      intro: '最初のメールから初回出荷まで、通常は五段階です。各段階の成果物とご確認いただく事項は、あらかじめ明文化します。',
      steps: [
        { no: '01', title: 'ご要望の確認', desc: 'カテゴリー、対象市場、予算帯、希望する発売時期をお知らせください。実現性の判断と概略案をご返答します。' },
        { no: '02', title: '処方試作', desc: 'ラボで試作品を製造し、使用感・外観・安定性のご確認用に発送します。調整はこの段階で完了させます。' },
        { no: '03', title: 'サンプル承認', desc: '容器構造と完成品サンプルを併せてご承認いただき、第三者試験と法規書類を並行して開始します。' },
        { no: '04', title: '登録・届出', desc: '仕向地の届出・登録を完了し、量産枠を確保。原料と容器を同時に手配します。' },
        { no: '05', title: '納品', desc: '量産、出荷検査、物流手配。納品後は処方と工程パラメータを保管し、リピート発注時に同一品を再現します。' },
      ],
    },
    certs: { title: CERT_BLOCK.ja.title, note: CERT_BLOCK.ja.note, items: CERTS.ja },
    inquiry: INQUIRY.ja,
  },
};
