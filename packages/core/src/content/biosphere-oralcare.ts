/**
 * BIOSPHERE-ORALCARE · AI 口腔生命科技平台 —— 首页四语内容
 * 四项能力取自品牌视觉图:口腔微生态研究 / 益生菌口腔护理 / 智能口腔解决方案 / 全生命周期口腔健康。
 * PDF 结论:口腔品类的可信语言 = 白底 + 单一强调色 + 功效证明表格(对标 Boka / Quip / NOBS),
 * 因此本站 evidence 区块是主角,不是配角。
 * ⚠️ 数字与认证为占位样例,见 shared.ts 顶部说明。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { CERTS, CERT_BLOCK, INQUIRY } from './shared.ts';

export const biosphereOralcare: Record<Locale, HomeContent> = {
  'zh-cn': {
    seo: {
      title: 'AI口腔生命科技平台',
      description: '口腔微生态研究、益生菌口腔护理、智能口腔解决方案、全生命周期口腔健康。帛卉集团旗下 AI 口腔生命科技平台。',
    },
    hero: {
      eyebrow: '智造之美',
      title: '口腔不是要杀菌,是要把菌群调回平衡',
      lead: '强效杀菌会连同有益菌一起清除,短期清爽,长期失衡。我们从口腔微生态出发,用益生菌与温和配方把菌群推回平衡态 —— 这是更慢、但更对的路。',
      ctaPrimary: '发起询盘',
      ctaSecondary: '查看研究方向',
    },
    stats: {
      title: '研究与验证',
      items: [
        { value: '260 株', label: '口腔菌株资源库' },
        { value: '12 项', label: '功效验证指标' },
        { value: '3 个', label: '全生命周期产品线', note: '婴幼儿 / 成人 / 银发' },
        { value: '0', label: '强效杀菌剂添加' },
      ],
    },
    matrix: {
      title: '四项核心能力',
      intro: '口腔护理长期被当成"清洁"问题,我们把它当成"生态"问题 —— 这决定了下面四块能力的组织方式。',
      items: [
        {
          id: 'microbiome',
          title: '口腔微生态研究',
          desc: '先弄清健康口腔的菌群长什么样,才谈得上调节。菌株资源库与测序分析是这一切的地基。',
          bullets: ['菌株分离、鉴定与保藏', '菌群结构测序与差异分析'],
        },
        {
          id: 'probiotics',
          title: '益生菌口腔护理',
          desc: '把有益菌活着送到口腔并留下来,难点在活性保持与定植。这是配方与工艺共同的课题。',
          bullets: ['活性菌在膏体中的存活率控制', '定植能力评估与验证'],
        },
        {
          id: 'smart',
          title: '智能口腔解决方案',
          desc: '口腔状态是变化的,护理方案也该跟着变。我们把检测数据接进方案推荐,而不是所有人用同一支牙膏。',
          bullets: ['基于检测数据的个性化方案', '硬件与配方的协同设计'],
        },
        {
          id: 'lifecycle',
          title: '全生命周期口腔健康',
          desc: '婴幼儿、成人、银发人群的口腔问题完全不同,配方逻辑不能通用。我们按人生阶段分线开发。',
          bullets: ['分阶段的安全性与功效标准', '吞咽风险与摩擦剂强度分级'],
        },
      ],
    },
    process: {
      title: '合作怎么开始',
      intro: '口腔品类合规要求高于普通化妆品,我们把合规判断放在最前面,不让方向性风险拖到后期。',
      steps: [
        { no: '01', title: '品类与合规判断', desc: '先确定产品属化妆品还是特殊用途,目标市场的注册路径与宣称边界随之确定。' },
        { no: '02', title: '配方与菌株选型', desc: '按目标功效选定菌株与基质,同步评估活性保持与摩擦剂强度。' },
        { no: '03', title: '打样与稳定性', desc: '样品确认口感、泡沫与质地;活性菌存活率在货架期内跟踪考察。' },
        { no: '04', title: '功效与安全验证', desc: '按目标市场安排功效与安全测试,拿到可支撑宣称的报告。' },
        { no: '05', title: '注册与量产', desc: '完成注册备案后排产,出货前逐批复检活性指标。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-cn'].title, note: CERT_BLOCK['zh-cn'].note, items: CERTS['zh-cn'] },
    evidence: {
      title: '功效与支撑',
      intro: '口腔类宣称的监管尺度比一般护肤更严。以下每一条都对应一种可出示的验证方式;缺出处的条目会被显式标出,不做模糊处理。',
      items: [
        { claim: '有益菌活性保持', proof: '货架期内活菌数定期检测,记录衰减曲线', source: '内部稳定性考察' },
        { claim: '减少牙菌斑', proof: '牙菌斑指数(PLI)使用前后对比' },
        { claim: '改善口腔异味', proof: '挥发性硫化物(VSC)仪器测定' },
        { claim: '温和不刺激口腔黏膜', proof: '口腔黏膜刺激性试验' },
        { claim: '低摩擦不伤釉质', proof: '相对牙本质磨耗值(RDA)测定' },
      ],
    },
    inquiry: INQUIRY['zh-cn'],
  },

  'zh-tw': {
    seo: {
      title: 'AI口腔生命科技平台',
      description: '口腔微生態研究、益生菌口腔護理、智能口腔解決方案、全生命週期口腔健康。帛卉集團旗下 AI 口腔生命科技平台。',
    },
    hero: {
      eyebrow: '智造之美',
      title: '口腔不是要殺菌,是要把菌叢調回平衡',
      lead: '強效殺菌會連同有益菌一起清除,短期清爽,長期失衡。我們從口腔微生態出發,以益生菌與溫和配方把菌叢推回平衡態 —— 這是更慢、但更對的路。',
      ctaPrimary: '發起詢價',
      ctaSecondary: '查看研究方向',
    },
    stats: {
      title: '研究與驗證',
      items: [
        { value: '260 株', label: '口腔菌株資源庫' },
        { value: '12 項', label: '功效驗證指標' },
        { value: '3 條', label: '全生命週期產品線', note: '嬰幼兒 / 成人 / 銀髮' },
        { value: '0', label: '強效殺菌劑添加' },
      ],
    },
    matrix: {
      title: '四項核心能力',
      intro: '口腔護理長期被當成「清潔」問題,我們把它當成「生態」問題 —— 這決定了下面四塊能力的組織方式。',
      items: [
        { id: 'microbiome', title: '口腔微生態研究', desc: '先弄清健康口腔的菌叢長什麼樣,才談得上調節。菌株資源庫與定序分析是這一切的地基。', bullets: ['菌株分離、鑑定與保藏', '菌叢結構定序與差異分析'] },
        { id: 'probiotics', title: '益生菌口腔護理', desc: '把有益菌活著送到口腔並留下來,難點在活性保持與定殖。這是配方與製程共同的課題。', bullets: ['活性菌在膏體中的存活率控制', '定殖能力評估與驗證'] },
        { id: 'smart', title: '智能口腔解決方案', desc: '口腔狀態是變化的,護理方案也該跟著變。我們把檢測資料接進方案推薦,而非所有人用同一支牙膏。', bullets: ['基於檢測資料的個人化方案', '硬體與配方的協同設計'] },
        { id: 'lifecycle', title: '全生命週期口腔健康', desc: '嬰幼兒、成人、銀髮族的口腔問題完全不同,配方邏輯不能通用。我們依人生階段分線開發。', bullets: ['分階段的安全性與功效標準', '吞嚥風險與摩擦劑強度分級'] },
      ],
    },
    process: {
      title: '合作怎麼開始',
      intro: '口腔品類法規要求高於一般化妝品,我們把法規判斷放在最前面,不讓方向性風險拖到後期。',
      steps: [
        { no: '01', title: '品類與法規判斷', desc: '先確定產品屬化妝品或特殊用途,目標市場的註冊路徑與宣稱邊界隨之確定。' },
        { no: '02', title: '配方與菌株選型', desc: '依目標功效選定菌株與基質,同步評估活性保持與摩擦劑強度。' },
        { no: '03', title: '打樣與穩定性', desc: '樣品確認口感、泡沫與質地;活性菌存活率於保存期內追蹤考察。' },
        { no: '04', title: '功效與安全驗證', desc: '依目標市場安排功效與安全測試,取得可支撐宣稱的報告。' },
        { no: '05', title: '註冊與量產', desc: '完成註冊備案後排產,出貨前逐批複檢活性指標。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-tw'].title, note: CERT_BLOCK['zh-tw'].note, items: CERTS['zh-tw'] },
    evidence: {
      title: '功效與支撐',
      intro: '口腔類宣稱的監管尺度比一般護膚更嚴。以下每一條都對應一種可出示的驗證方式;缺出處的條目會被顯式標出,不做模糊處理。',
      items: [
        { claim: '有益菌活性保持', proof: '保存期內活菌數定期檢測,記錄衰減曲線', source: '內部穩定性考察' },
        { claim: '減少牙菌斑', proof: '牙菌斑指數(PLI)使用前後對比' },
        { claim: '改善口腔異味', proof: '揮發性硫化物(VSC)儀器測定' },
        { claim: '溫和不刺激口腔黏膜', proof: '口腔黏膜刺激性試驗' },
        { claim: '低摩擦不傷琺瑯質', proof: '相對牙本質磨耗值(RDA)測定' },
      ],
    },
    inquiry: INQUIRY['zh-tw'],
  },

  en: {
    seo: {
      title: 'AI Oral Life-Science Platform',
      description: 'Oral microbiome research, probiotic oral care, intelligent oral solutions and lifelong oral health. The AI oral life-science platform of BOHUI Group.',
    },
    hero: {
      eyebrow: 'Intelligent Manufacturing',
      title: 'Oral care is not about killing bacteria — it is about restoring balance',
      lead: 'Aggressive antibacterials clear the beneficial flora along with the rest: fresh in the short term, unbalanced in the long. We start from the oral microbiome and use probiotics and gentle formulation to push the flora back toward equilibrium. Slower, but the right road.',
      ctaPrimary: 'Start an inquiry',
      ctaSecondary: 'See our research',
    },
    stats: {
      title: 'Research and validation',
      items: [
        { value: '260', label: 'Oral strains in our library' },
        { value: '12', label: 'Efficacy validation indicators' },
        { value: '3', label: 'Life-stage product lines', note: 'infant, adult, senior' },
        { value: '0', label: 'Harsh antibacterial agents added' },
      ],
    },
    matrix: {
      title: 'Four core capabilities',
      intro: 'Oral care has long been treated as a cleaning problem. We treat it as an ecological one — which is what shapes the four capabilities below.',
      items: [
        { id: 'microbiome', title: 'Oral microbiome research', desc: 'You cannot modulate a flora you have not characterised. A strain library and sequencing analysis are the foundation of everything else.', bullets: ['Strain isolation, identification and preservation', 'Community sequencing and differential analysis'] },
        { id: 'probiotics', title: 'Probiotic oral care', desc: 'Delivering beneficial bacteria alive and helping them stay is the hard part — a question of viability and colonisation that formulation and process must answer together.', bullets: ['Viability control within the paste matrix', 'Colonisation capability assessment'] },
        { id: 'smart', title: 'Intelligent oral solutions', desc: 'Oral condition changes over time, and care should change with it. We feed measurement data into recommendations rather than giving everyone the same tube.', bullets: ['Personalised regimens driven by measurement data', 'Hardware and formulation designed together'] },
        { id: 'lifecycle', title: 'Lifelong oral health', desc: 'Infants, adults and seniors face entirely different oral problems; one formulation logic cannot serve all. We develop separate lines by life stage.', bullets: ['Stage-specific safety and efficacy standards', 'Swallowing risk and abrasivity graded by stage'] },
      ],
    },
    process: {
      title: 'How engagements start',
      intro: 'Oral products face stricter regulation than ordinary cosmetics, so we settle the regulatory read first rather than letting directional risk surface late.',
      steps: [
        { no: '01', title: 'Category and regulatory read', desc: 'Establish whether the product is a cosmetic or a special-purpose product; the registration path and claim boundaries for the target market follow from that.' },
        { no: '02', title: 'Formula and strain selection', desc: 'Strains and base are selected against the target benefit, with viability and abrasivity assessed in parallel.' },
        { no: '03', title: 'Sampling and stability', desc: 'Samples confirm taste, foam and texture, while viable counts are tracked across shelf life.' },
        { no: '04', title: 'Efficacy and safety validation', desc: 'Testing arranged for the target market, producing reports that support the claims.' },
        { no: '05', title: 'Registration and production', desc: 'Production follows registration, with viability indicators re-checked batch by batch before shipment.' },
      ],
    },
    certs: { title: CERT_BLOCK.en.title, note: CERT_BLOCK.en.note, items: CERTS.en },
    evidence: {
      title: 'Claims and substantiation',
      intro: 'Oral claims are held to a stricter standard than general skincare. Each line below maps to a verification method that can be produced on request; entries lacking a source are flagged explicitly rather than blurred.',
      items: [
        { claim: 'Probiotic viability maintained', proof: 'Viable counts measured periodically across shelf life, with the decay curve recorded', source: 'Internal stability programme' },
        { claim: 'Reduced dental plaque', proof: 'Plaque index (PLI) compared before and after use' },
        { claim: 'Improved oral malodour', proof: 'Instrumental measurement of volatile sulphur compounds (VSC)' },
        { claim: 'Gentle on oral mucosa', proof: 'Oral mucosal irritation testing' },
        { claim: 'Low abrasivity, enamel-safe', proof: 'Relative dentin abrasivity (RDA) measurement' },
      ],
    },
    inquiry: INQUIRY.en,
  },

  ja: {
    seo: {
      title: 'AI オーラルライフサイエンス・プラットフォーム',
      description: '口腔マイクロバイオーム研究、プロバイオティクスによるオーラルケア、インテリジェントな口腔ソリューション、生涯にわたる口腔健康。帛卉グループの AI オーラルライフサイエンス基盤。',
    },
    hero: {
      eyebrow: 'スマート製造',
      title: 'オーラルケアは殺菌ではなく、菌叢を平衡へ戻すこと',
      lead: '強力な殺菌は有用菌まで一掃します。短期的には爽快でも、長期的には不均衡を招きます。当社は口腔マイクロバイオームを起点に、プロバイオティクスと低刺激処方で菌叢を平衡へ戻します。時間はかかりますが、正しい道だと考えます。',
      ctaPrimary: 'お問い合わせ',
      ctaSecondary: '研究領域を見る',
    },
    stats: {
      title: '研究と検証',
      items: [
        { value: '260 株', label: '口腔菌株ライブラリ' },
        { value: '12 項目', label: '有効性検証の指標' },
        { value: '3 系列', label: 'ライフステージ別製品ライン', note: '乳幼児 / 成人 / シニア' },
        { value: '0', label: '強力な殺菌剤の配合' },
      ],
    },
    matrix: {
      title: '四つの中核能力',
      intro: 'オーラルケアは長く「洗浄」の問題として扱われてきましたが、当社は「生態」の問題として捉えます。この視点が以下四つの能力の組み立て方を決めています。',
      items: [
        { id: 'microbiome', title: '口腔マイクロバイオーム研究', desc: '健康な口腔の菌叢像を把握しなければ、調整は語れません。菌株ライブラリとシーケンス解析がすべての土台です。', bullets: ['菌株の分離・同定・保存', '菌叢構造のシーケンスと差分解析'] },
        { id: 'probiotics', title: 'プロバイオティクス・オーラルケア', desc: '有用菌を生きたまま届け、留まらせることが難所です。生存性と定着性は、処方と製造工程が共に答えるべき課題です。', bullets: ['ペースト基材中での生菌率の管理', '定着能力の評価と検証'] },
        { id: 'smart', title: 'インテリジェントな口腔ソリューション', desc: '口腔の状態は変化します。ケアもそれに追随すべきです。測定データを提案に接続し、全員に同じ一本を配ることはしません。', bullets: ['測定データに基づく個別ケア設計', 'ハードウェアと処方の協調設計'] },
        { id: 'lifecycle', title: '生涯にわたる口腔健康', desc: '乳幼児・成人・シニアでは口腔の課題がまったく異なり、単一の処方思想では対応できません。ライフステージごとにラインを分けて開発します。', bullets: ['段階別の安全性・有効性基準', '誤嚥リスクと研磨剤強度の等級設定'] },
      ],
    },
    process: {
      title: '進め方',
      intro: '口腔製品は一般化粧品より規制が厳格なため、法規判断を最初に置き、方向性のリスクを後工程へ持ち越しません。',
      steps: [
        { no: '01', title: 'カテゴリーと法規の判断', desc: '化粧品か特定用途製品かを確定し、対象市場の登録経路と訴求の範囲を定めます。' },
        { no: '02', title: '処方と菌株の選定', desc: '目標とする効果に応じて菌株と基材を選定し、生存性と研磨性を並行して評価します。' },
        { no: '03', title: '試作と安定性', desc: '味・泡立ち・テクスチャーをご確認いただきつつ、保存期間中の生菌数を追跡します。' },
        { no: '04', title: '有効性・安全性の検証', desc: '対象市場に応じた試験を手配し、訴求を支える報告書を取得します。' },
        { no: '05', title: '登録と量産', desc: '登録完了後に生産へ移行し、出荷前にロットごとの生菌指標を再確認します。' },
      ],
    },
    certs: { title: CERT_BLOCK.ja.title, note: CERT_BLOCK.ja.note, items: CERTS.ja },
    evidence: {
      title: '訴求と根拠',
      intro: '口腔製品の訴求は一般的なスキンケアより厳格に扱われます。以下の各項目は、求めに応じて提示できる検証方法に対応します。出典を欠く項目は曖昧にせず、明示的に表示します。',
      items: [
        { claim: 'プロバイオティクスの生存性維持', proof: '保存期間中の生菌数を定期測定し、減衰曲線を記録', source: '社内安定性プログラム' },
        { claim: '歯垢の低減', proof: '歯垢指数(PLI)の使用前後比較' },
        { claim: '口臭の改善', proof: '揮発性硫黄化合物(VSC)の機器測定' },
        { claim: '口腔粘膜への低刺激性', proof: '口腔粘膜刺激性試験' },
        { claim: '低研磨でエナメル質にやさしい', proof: '相対象牙質研磨値(RDA)の測定' },
      ],
    },
    inquiry: INQUIRY.ja,
  },
};
