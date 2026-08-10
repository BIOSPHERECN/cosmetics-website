/**
 * MEDIERBA · 高端草本医学美容品牌 —— 首页四语内容
 * 四项能力取自品牌视觉图:草本科技护肤 / 功效修护抗衰 / 植物活性配方 / 自然与科学融合。
 * ★ 口吻与另外四站不同:这是**自有品牌**,不是代工平台 —— 面向消费者与渠道商说话,
 *   讲的是"我们相信什么、怎么做出来的",而非"我们能替你做什么"。
 * ⚠️ 数字与认证为占位样例,见 shared.ts 顶部说明。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { CERTS, CERT_BLOCK, INQUIRY } from './shared.ts';

export const medierba: Record<Locale, HomeContent> = {
  'zh-cn': {
    seo: {
      title: '高端草本医学美容品牌',
      description: '草本科技护肤、功效修护抗衰、植物活性配方、自然与科学融合。帛卉集团旗下高端草本医学美容品牌 MEDIERBA。',
    },
    hero: {
      eyebrow: '自然之源',
      title: '东方本草,用现代科学的方式说话',
      lead: '一味草本能不能护肤,不该只由典籍来回答。我们把植物活性成分提取、纯化、定量,再用现代功效测试验证 —— 让传统的智慧,拿得出当代的证据。',
      ctaPrimary: '联系我们',
      ctaSecondary: '了解产品线',
    },
    stats: {
      title: '关于我们',
      items: [
        { value: '32 味', label: '在用草本活性原料' },
        { value: '5 年', label: '本草活性成分研究积累' },
        { value: '100%', label: '配方成分全表公开' },
        { value: '0', label: '香精与色素添加' },
      ],
    },
    matrix: {
      title: '我们相信的四件事',
      intro: '草本护肤最大的问题,是把"天然"当成免检金牌。我们不这样做 —— 天然只是起点,有效且安全才是终点。',
      items: [
        {
          id: 'herbal-tech',
          title: '草本科技护肤',
          desc: '从植物到活性物之间隔着提取工艺。同一味草本,提取方式不同,活性差几倍 —— 我们把工艺参数当配方的一部分来管理。',
          bullets: ['低温提取保留热敏活性', '活性物含量批批定量'],
        },
        {
          id: 'repair',
          title: '功效修护抗衰',
          desc: '抗衰不是一句宣称。我们把目标拆成屏障、纹理、紧致三条可测的线,分别验证。',
          bullets: ['屏障修护与纹理改善分开评估', '人体功效测试支撑核心宣称'],
        },
        {
          id: 'botanical',
          title: '植物活性配方',
          desc: '单一成分的故事好讲,复配的效果才实在。我们研究的是活性物之间的协同,而不是堆料。',
          bullets: ['多活性物协同与配伍验证', '刺激性前置评估,先安全后功效'],
        },
        {
          id: 'fusion',
          title: '自然与科学融合',
          desc: '传统配伍提供方向,现代方法提供证据。两者缺一,产品要么没根,要么没据。',
          bullets: ['古方思路的现代转译', '成分全表公开,不做隐藏配方'],
        },
      ],
    },
    process: {
      title: '一瓶产品是怎么来的',
      intro: '从一味草本到一瓶成品,我们要走完这五步 —— 任何一步不通过,产品就不上市。',
      steps: [
        { no: '01', title: '选材溯源', desc: '确定品种、产地与采收期。同种草本产地不同,活性差异显著,来源必须可追溯。' },
        { no: '02', title: '提取纯化', desc: '低温提取与纯化,去除致敏与刺激组分,保留目标活性物。' },
        { no: '03', title: '活性定量', desc: '每批原料测活性物含量,不达标不投产 —— 这是"批次稳定"唯一的保证方式。' },
        { no: '04', title: '配方验证', desc: '配伍、稳定性、刺激性依次验证,任一项不合格即回到配方阶段。' },
        { no: '05', title: '功效确认', desc: '人体功效测试确认核心宣称,报告可应要求出示,之后才排产上市。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-cn'].title, note: CERT_BLOCK['zh-cn'].note, items: CERTS['zh-cn'] },
    evidence: {
      title: '我们说的每句话,都指得出依据',
      intro: '以下是产品页上会出现的宣称,以及它们各自的支撑方式。没有支撑的话,我们不写。',
      items: [
        { claim: '植物活性成分含量可查', proof: '每批原料出具活性物定量检测报告', source: '内部质控 + 第三方复检' },
        { claim: '温和不刺激', proof: '人体斑贴试验,受试者无刺激反应' },
        { claim: '屏障修护', proof: '经皮水分流失(TEWL)与角质层含水量双指标' },
        { claim: '无香精无色素', proof: '成分全表公开,配方中无相关成分' },
      ],
    },
    inquiry: INQUIRY['zh-cn'],
  },

  'zh-tw': {
    seo: {
      title: '高端草本醫學美容品牌',
      description: '草本科技護膚、功效修護抗衰、植物活性配方、自然與科學融合。帛卉集團旗下高端草本醫學美容品牌 MEDIERBA。',
    },
    hero: {
      eyebrow: '自然之源',
      title: '東方本草,用現代科學的方式說話',
      lead: '一味草本能否護膚,不該只由典籍回答。我們把植物活性成分提取、純化、定量,再以現代功效測試驗證 —— 讓傳統的智慧,拿得出當代的證據。',
      ctaPrimary: '聯絡我們',
      ctaSecondary: '了解產品線',
    },
    stats: {
      title: '關於我們',
      items: [
        { value: '32 味', label: '在用草本活性原料' },
        { value: '5 年', label: '本草活性成分研究累積' },
        { value: '100%', label: '配方成分全表公開' },
        { value: '0', label: '香精與色素添加' },
      ],
    },
    matrix: {
      title: '我們相信的四件事',
      intro: '草本護膚最大的問題,是把「天然」當成免檢金牌。我們不這樣做 —— 天然只是起點,有效且安全才是終點。',
      items: [
        { id: 'herbal-tech', title: '草本科技護膚', desc: '從植物到活性物之間隔著萃取工藝。同一味草本,萃取方式不同,活性差幾倍 —— 我們把工藝參數當作配方的一部分管理。', bullets: ['低溫萃取保留熱敏活性', '活性物含量批批定量'] },
        { id: 'repair', title: '功效修護抗衰', desc: '抗衰不是一句宣稱。我們把目標拆成屏障、紋理、緊緻三條可測的線,分別驗證。', bullets: ['屏障修護與紋理改善分開評估', '人體功效測試支撐核心宣稱'] },
        { id: 'botanical', title: '植物活性配方', desc: '單一成分的故事好講,複方的效果才實在。我們研究的是活性物之間的協同,而非堆料。', bullets: ['多活性物協同與配伍驗證', '刺激性前置評估,先安全後功效'] },
        { id: 'fusion', title: '自然與科學融合', desc: '傳統配伍提供方向,現代方法提供證據。兩者缺一,產品要麼沒根,要麼沒據。', bullets: ['古方思路的現代轉譯', '成分全表公開,不做隱藏配方'] },
      ],
    },
    process: {
      title: '一瓶產品是怎麼來的',
      intro: '從一味草本到一瓶成品,我們要走完這五步 —— 任何一步不通過,產品就不上市。',
      steps: [
        { no: '01', title: '選材溯源', desc: '確定品種、產地與採收期。同種草本產地不同,活性差異顯著,來源必須可追溯。' },
        { no: '02', title: '萃取純化', desc: '低溫萃取與純化,去除致敏與刺激組分,保留目標活性物。' },
        { no: '03', title: '活性定量', desc: '每批原料檢測活性物含量,不達標不投產 —— 這是「批次穩定」唯一的保證方式。' },
        { no: '04', title: '配方驗證', desc: '配伍、穩定性、刺激性依序驗證,任一項不合格即回到配方階段。' },
        { no: '05', title: '功效確認', desc: '人體功效測試確認核心宣稱,報告可應要求出示,之後才排產上市。' },
      ],
    },
    certs: { title: CERT_BLOCK['zh-tw'].title, note: CERT_BLOCK['zh-tw'].note, items: CERTS['zh-tw'] },
    evidence: {
      title: '我們說的每句話,都指得出依據',
      intro: '以下是產品頁上會出現的宣稱,以及它們各自的支撐方式。沒有支撐的話,我們不寫。',
      items: [
        { claim: '植物活性成分含量可查', proof: '每批原料出具活性物定量檢測報告', source: '內部品管 + 第三方複檢' },
        { claim: '溫和不刺激', proof: '人體貼膚試驗,受試者無刺激反應' },
        { claim: '屏障修護', proof: '經皮水分流失(TEWL)與角質層含水量雙指標' },
        { claim: '無香精無色素', proof: '成分全表公開,配方中無相關成分' },
      ],
    },
    inquiry: INQUIRY['zh-tw'],
  },

  en: {
    seo: {
      title: 'Herbal Medical Aesthetics',
      description: 'Herbal science skincare, repair and anti-ageing efficacy, botanical active formulation, nature and science combined. MEDIERBA, the herbal medical aesthetics brand of BOHUI Group.',
    },
    hero: {
      eyebrow: 'Natural Origin',
      title: 'Eastern botanicals, stated in the language of modern science',
      lead: 'Whether a herb belongs in skincare should not be settled by old texts alone. We extract, purify and quantify botanical actives, then verify them with modern efficacy testing — so traditional knowledge can produce contemporary evidence.',
      ctaPrimary: 'Contact us',
      ctaSecondary: 'Explore the range',
    },
    stats: {
      title: 'About us',
      items: [
        { value: '32', label: 'Botanical actives in use' },
        { value: '5 years', label: 'Research into herbal actives' },
        { value: '100%', label: 'Full ingredient disclosure' },
        { value: '0', label: 'Added fragrance or colourant' },
      ],
    },
    matrix: {
      title: 'Four things we hold to',
      intro: 'The besetting problem of herbal skincare is treating "natural" as a free pass. We do not. Natural is the starting point; effective and safe is the finish line.',
      items: [
        { id: 'herbal-tech', title: 'Herbal science skincare', desc: 'Between a plant and an active lies an extraction process. The same herb, extracted differently, can vary several-fold in activity — so we manage process parameters as part of the formula.', bullets: ['Low-temperature extraction preserves heat-sensitive actives', 'Active content quantified batch by batch'] },
        { id: 'repair', title: 'Repair and anti-ageing efficacy', desc: 'Anti-ageing is not a claim you simply make. We split the target into barrier, texture and firmness — three measurable lines, each verified separately.', bullets: ['Barrier repair and texture improvement assessed apart', 'Human efficacy testing behind the core claims'] },
        { id: 'botanical', title: 'Botanical active formulation', desc: 'A single-ingredient story is easy to tell; it is the combination that has to work. We study synergy between actives rather than stacking them.', bullets: ['Synergy and compatibility verification across actives', 'Irritation assessed first — safety before efficacy'] },
        { id: 'fusion', title: 'Nature and science combined', desc: 'Tradition supplies direction, modern method supplies evidence. Without either, a product is rootless or unsubstantiated.', bullets: ['Classical formulation logic, translated for today', 'Full ingredient disclosure, no hidden blends'] },
      ],
    },
    process: {
      title: 'How a bottle comes to exist',
      intro: 'From a single herb to a finished product, these five steps must all pass. If any one fails, the product does not launch.',
      steps: [
        { no: '01', title: 'Sourcing', desc: 'Species, origin and harvest window are fixed. The same herb varies markedly by origin, so provenance must be traceable.' },
        { no: '02', title: 'Extraction', desc: 'Low-temperature extraction and purification remove sensitising and irritant fractions while retaining the target actives.' },
        { no: '03', title: 'Quantification', desc: 'Every raw batch is measured for active content. Below spec, it does not enter production — this is the only real guarantee of batch consistency.' },
        { no: '04', title: 'Formula validation', desc: 'Compatibility, stability and irritation are verified in sequence; any failure returns the formula to the bench.' },
        { no: '05', title: 'Efficacy confirmation', desc: 'Human efficacy testing confirms the core claims, with reports available on request. Only then is production scheduled.' },
      ],
    },
    certs: { title: CERT_BLOCK.en.title, note: CERT_BLOCK.en.note, items: CERTS.en },
    evidence: {
      title: 'Every statement points to something',
      intro: 'These are claims that appear on our product pages, and how each is supported. If we cannot support it, we do not write it.',
      items: [
        { claim: 'Botanical active content is verifiable', proof: 'A quantitative active-content report is issued for every raw batch', source: 'Internal QC plus third-party re-testing' },
        { claim: 'Gentle, non-irritating', proof: 'Human patch test with no irritation observed' },
        { claim: 'Barrier repair', proof: 'Trans-epidermal water loss (TEWL) and stratum corneum hydration, measured together' },
        { claim: 'No fragrance, no colourant', proof: 'Full ingredient list published; neither appears in the formula' },
      ],
    },
    inquiry: INQUIRY.en,
  },

  ja: {
    seo: {
      title: 'ハーバル・メディカルビューティー',
      description: 'ハーバルサイエンススキンケア、補修とエイジングケア、植物由来アクティブ処方、自然と科学の融合。帛卉グループのハーバル・メディカルビューティーブランド MEDIERBA。',
    },
    hero: {
      eyebrow: '自然の源',
      title: '東洋の本草を、現代科学の言葉で語る',
      lead: 'ある生薬が肌に有用かどうかは、古典だけが答えるべき問いではありません。植物由来の有効成分を抽出し、精製し、定量したうえで、現代の有効性試験で検証します。伝統の知恵に、現代の根拠を。',
      ctaPrimary: 'お問い合わせ',
      ctaSecondary: '製品ラインを見る',
    },
    stats: {
      title: '私たちについて',
      items: [
        { value: '32 種', label: '使用中の植物由来有効成分' },
        { value: '5 年', label: '本草有効成分の研究蓄積' },
        { value: '100%', label: '全成分の開示' },
        { value: '0', label: '香料・着色料の添加' },
      ],
    },
    matrix: {
      title: '私たちが大切にする四つのこと',
      intro: 'ハーバルスキンケア最大の問題は、「天然」を無検査の免罪符にしてしまうことです。天然は出発点にすぎず、有効かつ安全であることが到達点です。',
      items: [
        { id: 'herbal-tech', title: 'ハーバルサイエンススキンケア', desc: '植物と有効成分の間には抽出工程があります。同じ生薬でも抽出法が違えば活性は数倍変わるため、工程条件を処方の一部として管理します。', bullets: ['低温抽出で熱に弱い成分を保持', '有効成分量をロットごとに定量'] },
        { id: 'repair', title: '補修とエイジングケア', desc: 'エイジングケアは唱えるものではありません。バリア・キメ・ハリという測定可能な三つの線に分解し、個別に検証します。', bullets: ['バリア補修とキメ改善を分けて評価', '中核訴求はヒト有効性試験で裏づけ'] },
        { id: 'botanical', title: '植物由来アクティブ処方', desc: '単一成分の物語は語りやすいものですが、実際に効くのは組み合わせです。成分を重ねるのではなく、相乗作用を研究します。', bullets: ['複数有効成分の相乗性と配合適性の検証', '刺激性を先に評価 —— 安全が先、有効性は後'] },
        { id: 'fusion', title: '自然と科学の融合', desc: '伝統は方向を、現代の手法は根拠を与えます。どちらを欠いても、製品は根なしか、裏づけなしになります。', bullets: ['古方の考え方を現代に翻訳', '全成分を開示し、隠し処方を持たない'] },
      ],
    },
    process: {
      title: '一本の製品ができるまで',
      intro: '一つの生薬から完成品まで、この五段階をすべて通過する必要があります。どこか一つでも通らなければ、発売しません。',
      steps: [
        { no: '01', title: '原料の選定と追跡', desc: '品種・産地・採取時期を確定します。同じ生薬でも産地により活性が大きく異なるため、由来は追跡可能でなければなりません。' },
        { no: '02', title: '抽出と精製', desc: '低温抽出と精製により、感作性・刺激性の画分を除き、目的の有効成分を残します。' },
        { no: '03', title: '有効成分の定量', desc: '原料ロットごとに含量を測定し、規格を下回れば製造に回しません。ロット安定性を担保する唯一の方法です。' },
        { no: '04', title: '処方の検証', desc: '配合適性、安定性、刺激性を順に検証します。一項目でも不合格なら処方段階に戻します。' },
        { no: '05', title: '有効性の確認', desc: 'ヒト有効性試験で中核訴求を確認します。報告書はご請求に応じて提示可能で、その後に生産を計画します。' },
      ],
    },
    certs: { title: CERT_BLOCK.ja.title, note: CERT_BLOCK.ja.note, items: CERTS.ja },
    evidence: {
      title: '述べることには、必ず裏づけがあります',
      intro: '製品ページに掲載する訴求と、その裏づけ方法です。裏づけられないことは書きません。',
      items: [
        { claim: '植物由来有効成分の含量を確認できる', proof: '原料ロットごとに有効成分の定量試験報告を発行', source: '社内品質管理および第三者による再試験' },
        { claim: '低刺激性', proof: 'ヒトパッチ試験で刺激反応が認められないこと' },
        { claim: 'バリア補修', proof: '経表皮水分蒸散量(TEWL)と角層水分量の二指標' },
        { claim: '香料・着色料不使用', proof: '全成分を公開しており、処方に該当成分を含みません' },
      ],
    },
    inquiry: INQUIRY.ja,
  },
};
