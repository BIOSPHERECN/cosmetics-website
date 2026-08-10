/**
 * BIOSPHERE-AI · 全球生命美妆 AI 科技平台 —— 首页四语内容
 * 四项能力取自品牌视觉图:AI配方研发 / 生命科学数据库 / 趋势洞察与预测 / 智能研发引擎。
 * 创始人补充定位:不是展示站,是「在线产品共创工作台」——文案按此口吻,导向"进来一起做产品"。
 * ⚠️ 数字为占位样例,见 shared.ts 顶部说明。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { CERTS, CERT_BLOCK, INQUIRY } from './shared.ts';

export const biosphereAi: Record<Locale, HomeContent> = {
  'zh-cn': {
    seo: {
      title: '全球生命美妆AI科技平台',
      description: 'AI配方研发、生命科学数据库、趋势洞察与预测、智能研发引擎。帛卉集团的科技大脑,赋能旗下全部制造平台与品牌。',
    },
    hero: {
      eyebrow: '科技之力',
      title: '让配方研发从「试出来」变成「算出来」',
      lead: '传统研发靠经验与反复试错,一个方向动辄数月。我们用生命科学数据库与 AI 引擎把候选空间先收窄,再交给实验室验证 —— 试错次数下降,方向感上升。',
      ctaPrimary: '预约平台演示',
      ctaSecondary: '了解技术架构',
    },
    stats: {
      title: '平台数据',
      items: [
        { value: '1,800 万', label: '成分与文献关联条目' },
        { value: '96 类', label: '皮肤与口腔生理指标' },
        { value: '<24 小时', label: '候选配方生成周期', note: '不含实验验证' },
        { value: '4 个', label: '在线赋能的制造与品牌平台' },
      ],
    },
    matrix: {
      title: '四项核心能力',
      intro: '这四块能力不是四个独立工具,是一条闭环:数据进来 → 模型算出方向 → 引擎生成配方 → 结果回流成新数据。',
      items: [
        {
          id: 'ai-formula',
          title: 'AI 配方研发',
          desc: '输入目标功效、剂型与成本约束,引擎在合规成分空间内生成候选配方,并给出每一条的依据与风险点。',
          bullets: ['多目标约束下的候选生成', '配伍冲突与稳定性风险预判'],
        },
        {
          id: 'database',
          title: '生命科学数据库',
          desc: '把分散的成分数据、文献结论与实测记录结构化,让每一次决策都能追溯到来源,而不是停留在"业内都这么做"。',
          bullets: ['成分—机理—功效的关联图谱', '实测数据回流,库随用随长'],
        },
        {
          id: 'trend',
          title: '趋势洞察与预测',
          desc: '监测全球市场的成分与概念热度变化,帮品牌在趋势成形之前决定要不要跟。',
          bullets: ['成分热度与概念生命周期追踪', '目标市场的差异化机会识别'],
        },
        {
          id: 'engine',
          title: '智能研发引擎',
          desc: '把上面三块接成一条可操作的工作流:在线提需求、看候选、下打样单,进度全程可见。',
          bullets: ['在线共创工作台,品牌方直接参与选型', '打样进度与实验结果同屏可见'],
        },
      ],
    },
    process: {
      title: '怎么用起来',
      intro: '平台不是给你一个黑箱结果,而是让你参与每一步的取舍。',
      steps: [
        { no: '01', title: '定义目标', desc: '在工作台里填目标功效、剂型、成本区间与目标市场,约束越清楚,候选质量越高。' },
        { no: '02', title: '生成候选', desc: '引擎给出多组候选配方,每组附依据、风险点与预估成本,支持并排比较。' },
        { no: '03', title: '共同筛选', desc: '你和我们的研发一起筛。被否掉的原因会回流进模型,下一轮更准。' },
        { no: '04', title: '实验验证', desc: '选定方向进实验室打样,实测数据同步回工作台,同时沉淀进数据库。' },
        { no: '05', title: '交产线', desc: '验证通过的配方直接转给 BEAUTY2OEM 或 SKIN2OEM 量产,参数无缝衔接。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-cn'].title, note: CERT_BLOCK['zh-cn'].note, items: CERTS['zh-cn'] },
    inquiry: INQUIRY['zh-cn'],
  },

  'zh-tw': {
    seo: {
      title: '全球生命美妝AI科技平台',
      description: 'AI配方研發、生命科學資料庫、趨勢洞察與預測、智能研發引擎。帛卉集團的科技大腦,賦能旗下全部製造平台與品牌。',
    },
    hero: {
      eyebrow: '科技之力',
      title: '讓配方研發從「試出來」變成「算出來」',
      lead: '傳統研發靠經驗與反覆試錯,一個方向動輒數月。我們用生命科學資料庫與 AI 引擎先收窄候選空間,再交給實驗室驗證 —— 試錯次數下降,方向感上升。',
      ctaPrimary: '預約平台展示',
      ctaSecondary: '了解技術架構',
    },
    stats: {
      title: '平台數據',
      items: [
        { value: '1,800 萬', label: '成分與文獻關聯條目' },
        { value: '96 類', label: '皮膚與口腔生理指標' },
        { value: '<24 小時', label: '候選配方生成週期', note: '不含實驗驗證' },
        { value: '4 個', label: '線上賦能的製造與品牌平台' },
      ],
    },
    matrix: {
      title: '四項核心能力',
      intro: '這四塊能力不是四個獨立工具,而是一條閉環:資料進來 → 模型算出方向 → 引擎生成配方 → 結果回流成新資料。',
      items: [
        { id: 'ai-formula', title: 'AI 配方研發', desc: '輸入目標功效、劑型與成本約束,引擎在合規成分空間內生成候選配方,並給出每一條的依據與風險點。', bullets: ['多目標約束下的候選生成', '配伍衝突與穩定性風險預判'] },
        { id: 'database', title: '生命科學資料庫', desc: '把分散的成分資料、文獻結論與實測紀錄結構化,讓每次決策都能追溯到來源,而非停留在「業內都這麼做」。', bullets: ['成分—機理—功效的關聯圖譜', '實測資料回流,庫隨用隨長'] },
        { id: 'trend', title: '趨勢洞察與預測', desc: '監測全球市場的成分與概念熱度變化,協助品牌在趨勢成形前決定是否跟進。', bullets: ['成分熱度與概念生命週期追蹤', '目標市場的差異化機會識別'] },
        { id: 'engine', title: '智能研發引擎', desc: '把上述三塊接成一條可操作的工作流:線上提需求、看候選、下打樣單,進度全程可見。', bullets: ['線上共創工作台,品牌方直接參與選型', '打樣進度與實驗結果同屏可見'] },
      ],
    },
    process: {
      title: '怎麼用起來',
      intro: '平台不是給你一個黑箱結果,而是讓你參與每一步的取捨。',
      steps: [
        { no: '01', title: '定義目標', desc: '在工作台填入目標功效、劑型、成本區間與目標市場,約束越清楚,候選品質越高。' },
        { no: '02', title: '生成候選', desc: '引擎給出多組候選配方,每組附依據、風險點與預估成本,支援並排比較。' },
        { no: '03', title: '共同篩選', desc: '你與我們的研發一起篩。被否決的原因會回流進模型,下一輪更準。' },
        { no: '04', title: '實驗驗證', desc: '選定方向進實驗室打樣,實測資料同步回工作台,同時沉澱進資料庫。' },
        { no: '05', title: '交產線', desc: '驗證通過的配方直接轉給 BEAUTY2OEM 或 SKIN2OEM 量產,參數無縫銜接。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-tw'].title, note: CERT_BLOCK['zh-tw'].note, items: CERTS['zh-tw'] },
    inquiry: INQUIRY['zh-tw'],
  },

  en: {
    seo: {
      title: 'Global AI Platform for Life-Science Beauty',
      description: 'AI-driven formulation, a life-science database, trend forecasting and an intelligent R&D engine. The technology brain of BOHUI Group, powering every manufacturing platform and brand under it.',
    },
    hero: {
      eyebrow: 'Technology Power',
      title: 'Move formulation from trial-and-error to computation',
      lead: 'Conventional R&D leans on experience and repeated trials — a single direction can take months. We narrow the candidate space first with a life-science database and an AI engine, then hand it to the lab. Fewer dead ends, clearer direction.',
      ctaPrimary: 'Request a platform demo',
      ctaSecondary: 'See the architecture',
    },
    stats: {
      title: 'Platform figures',
      items: [
        { value: '18M', label: 'Ingredient–literature linkages' },
        { value: '96', label: 'Skin and oral physiology indicators' },
        { value: '<24h', label: 'Candidate formula generation', note: 'excluding lab validation' },
        { value: '4', label: 'Manufacturing and brand platforms served' },
      ],
    },
    matrix: {
      title: 'Four core capabilities',
      intro: 'These are not four separate tools but one loop: data comes in, models point to a direction, the engine generates formulas, results flow back as new data.',
      items: [
        { id: 'ai-formula', title: 'AI-driven formulation', desc: 'Give the engine a target claim, format and cost ceiling; it generates candidate formulas inside the compliant ingredient space, each with its rationale and risk flags.', bullets: ['Candidate generation under multi-objective constraints', 'Compatibility conflicts and stability risks flagged in advance'] },
        { id: 'database', title: 'Life-science database', desc: 'Scattered ingredient data, published findings and measured records are structured so every decision traces to a source rather than to "how the industry does it".', bullets: ['Ingredient–mechanism–effect knowledge graph', 'Measured data flows back; the library grows with use'] },
        { id: 'trend', title: 'Trend insight and forecasting', desc: 'We track how ingredient and concept interest shifts across global markets, so brands can decide whether to follow before a trend fully forms.', bullets: ['Ingredient interest and concept lifecycle tracking', 'Differentiation opportunities by target market'] },
        { id: 'engine', title: 'Intelligent R&D engine', desc: 'The three above are wired into one workflow: submit a brief online, review candidates, order samples — with progress visible throughout.', bullets: ['An online co-creation studio where brands take part in selection', 'Sampling progress and lab results on the same screen'] },
      ],
    },
    process: {
      title: 'How it works in practice',
      intro: 'The platform does not hand you a black-box answer; it puts you inside every trade-off.',
      steps: [
        { no: '01', title: 'Define the target', desc: 'Enter the target claim, format, cost band and destination market. The tighter the constraints, the better the candidates.' },
        { no: '02', title: 'Generate candidates', desc: 'The engine returns several candidate formulas, each with rationale, risk flags and estimated cost, comparable side by side.' },
        { no: '03', title: 'Shortlist together', desc: 'You and our formulators shortlist jointly. Reasons for rejection flow back into the model, sharpening the next round.' },
        { no: '04', title: 'Validate in the lab', desc: 'The chosen direction goes to sampling; measured data returns to the studio and settles into the database.' },
        { no: '05', title: 'Hand to production', desc: 'Validated formulas transfer straight to BEAUTY2OEM or SKIN2OEM for manufacturing, with parameters carried across intact.' },
      ],
    },
    certs: { title: CERT_BLOCK.en.title, note: CERT_BLOCK.en.note, items: CERTS.en },
    inquiry: INQUIRY.en,
  },

  ja: {
    seo: {
      title: 'ライフサイエンス美容 AI プラットフォーム',
      description: 'AI 処方開発、ライフサイエンスデータベース、トレンド予測、インテリジェント研究開発エンジン。帛卉グループの技術頭脳として、傘下の製造プラットフォームとブランドを支えます。',
    },
    hero: {
      eyebrow: '科学の力',
      title: '処方開発を「試す」から「計算する」へ',
      lead: '従来の研究開発は経験と試行錯誤に依存し、一つの方向性に数か月を要します。当社はライフサイエンスデータベースと AI エンジンで候補空間を先に絞り込み、その後に実験で検証します。試行回数は減り、方向性は明確になります。',
      ctaPrimary: 'デモをご予約',
      ctaSecondary: '技術構成を見る',
    },
    stats: {
      title: 'プラットフォーム指標',
      items: [
        { value: '1,800 万', label: '成分と文献の関連付け件数' },
        { value: '96 種', label: '皮膚・口腔の生理指標' },
        { value: '24 時間未満', label: '候補処方の生成期間', note: '実験検証を除く' },
        { value: '4 つ', label: '支援する製造・ブランド基盤' },
      ],
    },
    matrix: {
      title: '四つの中核能力',
      intro: '四つの独立したツールではなく、一つの循環です。データが入り、モデルが方向を示し、エンジンが処方を生成し、結果が新たなデータとして戻ります。',
      items: [
        { id: 'ai-formula', title: 'AI 処方開発', desc: '目標とする有効性、剤形、コスト制約を入力すると、法規上許容される成分空間の中で候補処方を生成し、根拠とリスクを併記します。', bullets: ['多目的制約下での候補生成', '配合衝突と安定性リスクの事前検知'] },
        { id: 'database', title: 'ライフサイエンスデータベース', desc: '散在する成分データ、文献の結論、実測記録を構造化し、あらゆる判断が「業界の慣行」ではなく出典まで遡れるようにします。', bullets: ['成分—メカニズム—効果の知識グラフ', '実測データが還流し、蓄積とともに拡張'] },
        { id: 'trend', title: 'トレンド洞察と予測', desc: '世界市場における成分とコンセプトの関心の推移を追跡し、トレンドが固まる前に追随の可否を判断できるようにします。', bullets: ['成分の関心度とコンセプトのライフサイクル追跡', '対象市場ごとの差別化機会の特定'] },
        { id: 'engine', title: 'インテリジェント研究開発エンジン', desc: '上記三つを一つのワークフローに接続します。オンラインで要件を提出し、候補を確認し、試作を発注 —— 進捗は常に可視化されます。', bullets: ['ブランド様が選定に直接参加するオンライン共創スタジオ', '試作進捗と実験結果を同一画面で確認'] },
      ],
    },
    process: {
      title: '実際の進め方',
      intro: 'ブラックボックスの答えをお渡しするのではなく、すべての判断にご参加いただきます。',
      steps: [
        { no: '01', title: '目標の定義', desc: 'スタジオ上で目標とする有効性、剤形、コスト帯、対象市場を入力します。制約が明確なほど候補の質が上がります。' },
        { no: '02', title: '候補の生成', desc: 'エンジンが複数の候補処方を返し、それぞれに根拠、リスク、概算コストを付して並列比較できます。' },
        { no: '03', title: '共同での絞り込み', desc: '御社と当社の処方担当が共に選別します。不採用の理由はモデルへ還流し、次の精度を高めます。' },
        { no: '04', title: '実験による検証', desc: '選定した方向をラボで試作し、実測データはスタジオへ同期されると同時にデータベースへ蓄積されます。' },
        { no: '05', title: '量産への引き渡し', desc: '検証済み処方は BEAUTY2OEM または SKIN2OEM へそのまま引き継がれ、パラメータも欠落なく移管されます。' },
      ],
    },
    certs: { title: CERT_BLOCK.ja.title, note: CERT_BLOCK.ja.note, items: CERTS.ja },
    inquiry: INQUIRY.ja,
  },
};
