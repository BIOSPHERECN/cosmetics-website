/**
 * SKIN2OEM · 全球护肤智能制造平台 —— 首页四语内容
 * 四项能力取自品牌视觉图:护肤品研发制造 / 功效配方定制 / 高端护肤解决方案 / 品质与安全保障。
 * 含 evidence 区块(功效证据),供 v3「功效证据」风格发挥。
 * ⚠️ 数字与认证为占位样例,见 shared.ts 顶部说明。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { CERTS, CERT_BLOCK, INQUIRY } from './shared.ts';

export const skin2oem: Record<Locale, HomeContent> = {
  'zh-cn': {
    seo: {
      title: '全球护肤智能制造平台',
      description: '护肤品研发制造、功效配方定制、高端护肤解决方案、品质与安全保障。帛卉集团旗下护肤智造平台。',
    },
    hero: {
      eyebrow: '科技之力',
      title: '功效不是形容词,是可以被测出来的数字',
      lead: '我们把「有效」拆成可验证的指标:活性物浓度、透皮效率、稳定性周期、人体功效测试数据。配方定制从这些数字开始,不从修辞开始。',
      ctaPrimary: '发起询盘',
      ctaSecondary: '查看研发能力',
    },
    stats: {
      title: '研发与品控',
      items: [
        { value: '2,400+', label: '配方数据库条目', note: '含稳定性与相容性记录' },
        { value: '30 天', label: '常规打样周期', note: '复杂剂型另计' },
        { value: '18 项', label: '出厂检验项目' },
        { value: '10 万级', label: '洁净车间等级', note: '关键工序局部百级' },
      ],
    },
    matrix: {
      title: '四项核心能力',
      intro: '护肤品的难点不在「做出来」,在「做得稳、说得清、过得了检」。这四块能力对应的正是这三件事。',
      items: [
        {
          id: 'rnd',
          title: '护肤品研发制造',
          desc: '从概念配方到可量产工艺,实验室与产线用同一套参数,避免打样好看、大货翻车。',
          bullets: ['乳液 / 精华 / 面霜 / 面膜 / 精华油全剂型', '中试放大验证,配方一致性可追溯'],
        },
        {
          id: 'efficacy',
          title: '功效配方定制',
          desc: '按目标功效反推活性物组合与浓度区间,并给出对应的检测方案,让宣称有据可依。',
          bullets: ['抗衰 / 美白 / 舒缓 / 屏障修护方向', '活性物配伍与稳定性预实验'],
        },
        {
          id: 'premium',
          title: '高端护肤解决方案',
          desc: '高客单产品对肤感与质感的容错极低。我们在肤感调校上单独设一轮评估,不把它留给量产去赌。',
          bullets: ['肤感盲测与感官评价', '高端包材适配与相容性测试'],
        },
        {
          id: 'safety',
          title: '品质与安全保障',
          desc: '安全性数据是出口的通行证,也是品牌的护城河。人体安全性与功效测试统一归口安排。',
          bullets: ['人体斑贴与功效测试对接', '重金属 / 微生物 / 防腐挑战全项检'],
        },
      ],
    },
    process: {
      title: '合作怎么开始',
      intro: '功效类产品比普通品多一道验证环节,我们把它前置,避免上市前才发现宣称站不住。',
      steps: [
        { no: '01', title: '功效目标定义', desc: '先确定要宣称什么、面向哪个市场,倒推所需的测试类型与合规口径。' },
        { no: '02', title: '配方与预实验', desc: '活性物配伍、稳定性与相容性预实验同步跑,不合格的组合在这一步淘汰。' },
        { no: '03', title: '打样与肤感调校', desc: '寄样确认;肤感单独一轮盲测评估,改到位再进下一步。' },
        { no: '04', title: '功效与安全测试', desc: '按目标市场安排人体功效与安全性测试,拿到可支撑宣称的报告。' },
        { no: '05', title: '量产与交付', desc: '备案完成后量产,出厂 18 项检验,交付后工艺参数归档便于返单。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-cn'].title, note: CERT_BLOCK['zh-cn'].note, items: CERTS['zh-cn'] },
    evidence: {
      title: '宣称与支撑',
      intro: '每一句功效宣称背后应当有一份可出示的报告。以下为常见宣称与对应的支撑方式。',
      items: [
        { claim: '保湿力提升', proof: '角质层含水量仪器测定,使用前后对比', source: '第三方人体功效测试' },
        { claim: '屏障修护', proof: '经皮水分流失(TEWL)指标变化' },
        { claim: '温和不刺激', proof: '人体斑贴试验,受试者无刺激反应' },
        { claim: '配方稳定', proof: '加速稳定性试验,高低温与离心考察' },
      ],
    },
    inquiry: INQUIRY['zh-cn'],
  },

  'zh-tw': {
    seo: {
      title: '全球護膚智能製造平台',
      description: '護膚品研發製造、功效配方定制、高端護膚解決方案、品質與安全保障。帛卉集團旗下護膚智造平台。',
    },
    hero: {
      eyebrow: '科技之力',
      title: '功效不是形容詞,是可以被測出來的數字',
      lead: '我們把「有效」拆成可驗證的指標:活性物濃度、透皮效率、穩定性週期、人體功效測試數據。配方定制從這些數字開始,不從修辭開始。',
      ctaPrimary: '發起詢價',
      ctaSecondary: '查看研發能力',
    },
    stats: {
      title: '研發與品控',
      items: [
        { value: '2,400+', label: '配方資料庫條目', note: '含穩定性與相容性紀錄' },
        { value: '30 天', label: '常規打樣週期', note: '複雜劑型另計' },
        { value: '18 項', label: '出廠檢驗項目' },
        { value: '10 萬級', label: '無塵車間等級', note: '關鍵工序局部百級' },
      ],
    },
    matrix: {
      title: '四項核心能力',
      intro: '護膚品的難點不在「做出來」,在「做得穩、說得清、過得了檢」。這四塊能力對應的正是這三件事。',
      items: [
        { id: 'rnd', title: '護膚品研發製造', desc: '從概念配方到可量產製程,實驗室與產線用同一套參數,避免打樣好看、大貨翻車。', bullets: ['乳液 / 精華 / 面霜 / 面膜 / 精華油全劑型', '中試放大驗證,配方一致性可追溯'] },
        { id: 'efficacy', title: '功效配方定制', desc: '依目標功效反推活性物組合與濃度區間,並給出對應的檢測方案,讓宣稱有據可依。', bullets: ['抗衰 / 美白 / 舒緩 / 屏障修護方向', '活性物配伍與穩定性預實驗'] },
        { id: 'premium', title: '高端護膚解決方案', desc: '高客單產品對膚感與質感的容錯極低。我們在膚感調校上單獨設一輪評估,不把它留給量產去賭。', bullets: ['膚感盲測與感官評價', '高端包材適配與相容性測試'] },
        { id: 'safety', title: '品質與安全保障', desc: '安全性數據是出口的通行證,也是品牌的護城河。人體安全性與功效測試統一歸口安排。', bullets: ['人體貼膚與功效測試對接', '重金屬 / 微生物 / 防腐挑戰全項檢'] },
      ],
    },
    process: {
      title: '合作怎麼開始',
      intro: '功效類產品比一般品多一道驗證環節,我們把它前置,避免上市前才發現宣稱站不住。',
      steps: [
        { no: '01', title: '功效目標定義', desc: '先確定要宣稱什麼、面向哪個市場,倒推所需的測試類型與法規口徑。' },
        { no: '02', title: '配方與預實驗', desc: '活性物配伍、穩定性與相容性預實驗同步跑,不合格的組合在這一步淘汰。' },
        { no: '03', title: '打樣與膚感調校', desc: '寄樣確認;膚感單獨一輪盲測評估,改到位再進下一步。' },
        { no: '04', title: '功效與安全測試', desc: '依目標市場安排人體功效與安全性測試,取得可支撐宣稱的報告。' },
        { no: '05', title: '量產與交付', desc: '備案完成後量產,出廠 18 項檢驗,交付後製程參數歸檔便於返單。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-tw'].title, note: CERT_BLOCK['zh-tw'].note, items: CERTS['zh-tw'] },
    evidence: {
      title: '宣稱與支撐',
      intro: '每一句功效宣稱背後都應有一份可出示的報告。以下為常見宣稱與對應的支撐方式。',
      items: [
        { claim: '保濕力提升', proof: '角質層含水量儀器測定,使用前後對比', source: '第三方人體功效測試' },
        { claim: '屏障修護', proof: '經皮水分流失(TEWL)指標變化' },
        { claim: '溫和不刺激', proof: '人體貼膚試驗,受試者無刺激反應' },
        { claim: '配方穩定', proof: '加速穩定性試驗,高低溫與離心考察' },
      ],
    },
    inquiry: INQUIRY['zh-tw'],
  },

  en: {
    seo: {
      title: 'Global Intelligent Skincare Manufacturing',
      description: 'Skincare R&D and manufacturing, efficacy-driven custom formulation, premium skincare solutions, quality and safety assurance. The skincare platform of BOHUI Group.',
    },
    hero: {
      eyebrow: 'Technology Power',
      title: 'Efficacy is not an adjective — it is a number you can measure',
      lead: 'We break "effective" into verifiable indicators: active concentration, delivery efficiency, stability window, human efficacy test data. Custom formulation starts from those numbers, not from rhetoric.',
      ctaPrimary: 'Start an inquiry',
      ctaSecondary: 'See our R&D',
    },
    stats: {
      title: 'R&D and quality control',
      items: [
        { value: '2,400+', label: 'Formula database entries', note: 'with stability and compatibility records' },
        { value: '30 days', label: 'Standard sampling cycle', note: 'complex formats quoted separately' },
        { value: '18', label: 'Outgoing inspection items' },
        { value: 'ISO 8', label: 'Cleanroom classification', note: 'ISO 5 locally at critical steps' },
      ],
    },
    matrix: {
      title: 'Four core capabilities',
      intro: 'The hard part of skincare is not making it — it is making it consistently, substantiating it, and passing inspection. These four capabilities address exactly that.',
      items: [
        { id: 'rnd', title: 'Skincare R&D and manufacturing', desc: 'From concept formula to a production-ready process, lab and line share one parameter set, so a good sample does not become a failed batch.', bullets: ['Emulsions, serums, creams, masks and facial oils', 'Pilot scale-up validation with traceable formula consistency'] },
        { id: 'efficacy', title: 'Efficacy-driven formulation', desc: 'We work backwards from the target claim to an active combination and concentration range, and pair it with a testing plan that substantiates the claim.', bullets: ['Anti-ageing, brightening, soothing and barrier repair', 'Active compatibility and stability pre-trials'] },
        { id: 'premium', title: 'Premium skincare solutions', desc: 'High-ticket products leave almost no margin for error on texture. We add a dedicated sensory round rather than gambling it on production.', bullets: ['Blind sensory panels and evaluation', 'Premium packaging fit and compatibility testing'] },
        { id: 'safety', title: 'Quality and safety assurance', desc: 'Safety data is both an export passport and a brand moat. Human safety and efficacy testing are arranged under one owner.', bullets: ['Human patch and efficacy test coordination', 'Heavy metals, microbiology and preservative challenge testing'] },
      ],
    },
    process: {
      title: 'How engagements start',
      intro: 'Efficacy products carry one more validation step than ordinary ones. We move it early, so a claim never collapses just before launch.',
      steps: [
        { no: '01', title: 'Define the claim', desc: 'Decide what will be claimed and for which market, then work backwards to the required test types and regulatory wording.' },
        { no: '02', title: 'Formulation and pre-trials', desc: 'Active compatibility, stability and packaging compatibility run in parallel; combinations that fail are eliminated here.' },
        { no: '03', title: 'Sampling and sensory tuning', desc: 'Samples shipped for approval, with a separate blind sensory round before moving on.' },
        { no: '04', title: 'Efficacy and safety testing', desc: 'Human efficacy and safety testing arranged for the target market, producing reports that support the claim.' },
        { no: '05', title: 'Production and delivery', desc: 'Production after registration, 18-item outgoing inspection, and archived process parameters for repeat orders.' },
      ],
    },
    certs: { title: CERT_BLOCK.en.title, note: CERT_BLOCK.en.note, items: CERTS.en },
    evidence: {
      title: 'Claims and substantiation',
      intro: 'Every efficacy claim should have a report behind it that can be produced on request. Common claims and how they are supported:',
      items: [
        { claim: 'Improved hydration', proof: 'Instrumental measurement of stratum corneum water content, before and after', source: 'Third-party human efficacy testing' },
        { claim: 'Barrier repair', proof: 'Change in trans-epidermal water loss (TEWL)' },
        { claim: 'Gentle, non-irritating', proof: 'Human patch test with no irritation observed' },
        { claim: 'Formula stability', proof: 'Accelerated stability testing across temperature cycling and centrifugation' },
      ],
    },
    inquiry: INQUIRY.en,
  },

  ja: {
    seo: {
      title: 'グローバルスキンケア・スマート製造プラットフォーム',
      description: 'スキンケアの研究開発と製造、有効性起点の処方カスタマイズ、高付加価値ソリューション、品質と安全の保証。帛卉グループのスキンケア製造プラットフォーム。',
    },
    hero: {
      eyebrow: '科学の力',
      title: '有効性は形容詞ではなく、測定できる数値です',
      lead: '「効く」を検証可能な指標に分解します。有効成分濃度、経皮到達効率、安定性期間、ヒト試験データ —— 処方のカスタマイズは修辞ではなく、これらの数値から始まります。',
      ctaPrimary: 'お問い合わせ',
      ctaSecondary: '研究開発を見る',
    },
    stats: {
      title: '研究開発と品質管理',
      items: [
        { value: '2,400+', label: '処方データベース件数', note: '安定性・相容性の記録を含む' },
        { value: '30 日', label: '標準試作期間', note: '複雑な剤形は別途' },
        { value: '18 項目', label: '出荷検査項目' },
        { value: 'ISO 8', label: 'クリーンルーム等級', note: '重要工程は局所 ISO 5' },
      ],
    },
    matrix: {
      title: '四つの中核能力',
      intro: 'スキンケアの難所は「作ること」ではなく、「安定して作り、根拠を示し、検査を通すこと」です。四つの能力はまさにこの三点に対応します。',
      items: [
        { id: 'rnd', title: 'スキンケアの研究開発と製造', desc: 'コンセプト処方から量産可能な工程まで、ラボと製造ラインが同一のパラメータを共有し、試作は良いのに量産で崩れる事態を防ぎます。', bullets: ['乳液・美容液・クリーム・マスク・オイルの全剤形', 'パイロットスケールアップ検証と処方の追跡可能性'] },
        { id: 'efficacy', title: '有効性起点の処方設計', desc: '目標とする訴求から有効成分の組み合わせと濃度域を逆算し、対応する試験計画まで併せてご提示します。', bullets: ['エイジングケア / 明るさ / 鎮静 / バリア補修', '有効成分の配合適性と安定性の予備試験'] },
        { id: 'premium', title: '高付加価値ソリューション', desc: '高価格帯製品は使用感の許容幅が極めて狭いため、官能評価を独立した工程として設けます。', bullets: ['ブラインド官能評価パネル', '高級容器の適合性・相容性試験'] },
        { id: 'safety', title: '品質と安全の保証', desc: '安全性データは輸出の通行証であり、ブランドの堀でもあります。ヒト安全性試験と有効性試験を一元的に手配します。', bullets: ['ヒトパッチ試験・有効性試験の手配', '重金属 / 微生物 / 防腐力チャレンジ試験'] },
      ],
    },
    process: {
      title: '進め方',
      intro: '有効性訴求製品は通常品より検証工程が一つ多くなります。当社はこれを前倒しし、発売直前に訴求が成り立たないという事態を避けます。',
      steps: [
        { no: '01', title: '訴求目標の定義', desc: '何を訴求し、どの市場に向けるかを先に定め、必要な試験種別と法規上の表現を逆算します。' },
        { no: '02', title: '処方と予備試験', desc: '配合適性、安定性、容器相容性の予備試験を並行実施し、不適合の組み合わせをこの段階で除外します。' },
        { no: '03', title: '試作と使用感調整', desc: 'サンプルを発送してご確認いただき、使用感については独立したブラインド評価を経て次工程へ進みます。' },
        { no: '04', title: '有効性・安全性試験', desc: '対象市場に応じてヒト有効性試験と安全性試験を手配し、訴求を支える報告書を取得します。' },
        { no: '05', title: '量産と納品', desc: '届出完了後に量産、18 項目の出荷検査を実施。納品後は工程パラメータを保管しリピート発注に備えます。' },
      ],
    },
    certs: { title: CERT_BLOCK.ja.title, note: CERT_BLOCK.ja.note, items: CERTS.ja },
    evidence: {
      title: '訴求と根拠',
      intro: '有効性の訴求には、求めに応じて提示できる報告書が伴うべきです。代表的な訴求と、その裏づけ方法をご紹介します。',
      items: [
        { claim: '保湿力の向上', proof: '角層水分量の機器測定による使用前後の比較', source: '第三者機関によるヒト有効性試験' },
        { claim: 'バリア機能の補修', proof: '経表皮水分蒸散量(TEWL)の変化' },
        { claim: '低刺激性', proof: 'ヒトパッチ試験で刺激反応が認められないこと' },
        { claim: '処方の安定性', proof: '加速安定性試験(温度サイクル・遠心)' },
      ],
    },
    inquiry: INQUIRY.ja,
  },
};
