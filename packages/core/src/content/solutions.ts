/**
 * 行业方案 / 品类方案 —— 按「客户是谁」和「要做什么品类」两条轴切出来的落地页。
 *
 * 为什么要这一层(2026-09-05 拆同行的站之后定的):
 *   采购找工厂时搜的不是「化妆品代工」,搜的是「跨境卖家 私有品牌」「美容院 院线装 定制」
 *   「面膜代工 起订量」—— 每一类客户的问法、痛点、要看的证据都不一样。
 *   一个通用的「OEM/ODM 服务」页面同时对这五类人说话,结果谁都觉得没说到自己。
 *   同行把这一层做成了 10 个独立落地页(6 类客户 + 4 个品类),这是他们做得最对的一件事。
 *
 *   但他们全站是客户端渲染的:实测每页 HTML 只有约 5,658 字节、可读正文 51 个字、零结构化数据 ——
 *   这 10 页对搜索引擎和 AI 检索基本不可见。我们照搬这个信息结构,内容整页服务端渲染,
 *   带 FAQ 与面包屑结构化数据。形态学他们的,字全是我们自己写的。
 *
 * 为什么不进 D1:这些页会被爬虫反复抓,放常量里是零数据库读、可整页边缘缓存;
 *   Workers 免费版每天的 D1 读次数要留给询盘与选品。将来要给后台改文案,
 *   再迁到 kb_entries 也不影响这里的页面结构。
 *
 * 纪律:
 *   · 只写我们真做得了的品类 —— 草本护肤是主线,不为了凑格子写彩妆代工、头发护理。
 *   · 不出现任何价格与报价区间;起订量与打样天数写「以书面确认为准」。
 *   · 法规只写方向,注明「以最新官方文本为准」,不写死生效日期,不代客户承担责任人角色。
 *   · 不编客户评价 —— 同行首页那五条署名推荐我们一条都不抄。
 */

export type Axis = 'audience' | 'category';

export interface Solution {
  slug: string;
  axis: Axis;
  /** 卡片与页头 */
  zh: SolutionCopy;
  en: SolutionCopy;
  /** 拉关联配方用:命中 formulas.category 或 formulas.benefits 里的任一值 */
  match: { category?: string[]; benefits?: string[]; format?: string[] };
  /** 包材库进这一页时预选的筛选参数,形如 't=jar' / 'g=bottle' —— 对齐重建后的包材库查询串 */
  packCat?: string;
}

export interface SolutionCopy {
  title: string;
  /** 卡片上的一句话 */
  tagline: string;
  /** 页头导语,两到三句 */
  lede: string;
  /** 「你现在大概卡在这几件事上」—— 用客户自己的说法写,不要用行业黑话 */
  pains: [string, string][];
  /** 「我们怎么接」—— 一步一行 */
  steps: [string, string][];
  /** 「先能给你什么」—— 每条都指向站内一个真实存在的东西 */
  proof: [string, string][];
  faq: [string, string][];
}

export const SOLUTIONS: Solution[] = [
  /* ── 行业方案:按客户类型 ───────────────────────────────────────── */
  {
    slug: 'cross-border-seller',
    axis: 'audience',
    match: { benefits: ['hydrating', 'brightening', 'barrier'] },
    zh: {
      title: '跨境电商卖家',
      tagline: 'Amazon、TikTok Shop、独立站 —— 要能上架、能补货、能过审的货',
      lede: `你要的不是一支好用的精华,是一支能顺利上架、能持续补货、审核不会卡住的货。
             我们把工厂这一侧能确定下来的东西先给你:剂型能不能做、包材有没有现货、
             成分在目标市场是不是可用、打样要多久。剩下的你才好排上架节奏。`,
      pains: [
        ['首批不敢下太多,但工厂起订量压着', '起订量卡在三条线里最高的那条:产线最小可控批量、包材厂起订量、换线分摊。三条我们都摊开给你看,再谈能压到哪。'],
        ['listing 已经写好了,却发现成分在那个站点不能用', '选品阶段就先过一遍目标市场的成分方向,而不是等标签打样出来才发现要改配方。'],
        ['补货周期不确定,广告不敢投', '打样与量产周期在方案里就写清楚,包材是现货款还是开模款分开标 —— 这两者的补货速度差一个数量级。'],
      ],
      steps: [
        ['说清你的站点和价位段', '哪个平台、卖到哪个国家、想打哪个价位段。这三件决定剂型与包材的选择范围,比功效诉求更早。'],
        ['选剂型与包材', '在选品链路里过一遍,出一份带编码的清单 —— 配方号 + 包材号,双方指的是同一个东西。'],
        ['打样', '寄样确认肤感、香型、包材手感与印刷效果。这一步不确认,后面全是返工。'],
        ['量产与补货', '首批下单后,后续补货按同一套编码走,不用重新描述需求。'],
      ],
      proof: [
        ['包材库', '五千多页实物图册,按泵头、瓶身、软管、膏霜罐分好类,看中哪一款直接报编码。'],
        ['选品链路', '六步走完,出一份可以直接发给同事的方案:剂型、包材、可售市场、打样周期。'],
        ['市场信号', '每条爆款判断都挂着来源与日期,可以点开核对,不是「据说很火」。'],
      ],
      faq: [
        ['你们能做 FBA 直发吗?', '我们是工厂,交货到你指定的仓或货代。头程与入仓预约由你或你的货代安排,我们配合出箱单、装箱资料与所需的工厂侧文件。'],
        ['能不能先做一小批测款?', '可以谈。测款批量取决于剂型与包材:现货包材的常规剂型好安排,开模包材或特殊剂型的最小批量会明显高一些。具体下限在打样阶段一并确认。'],
        ['成分合不合规谁来判断?', '我们提供工厂侧资料(配方成分表、原料信息、工厂资质),合规结论由品牌方与其在当地的责任人出具。我们只写方向,不代你承担申报责任。'],
        ['包装上能印我自己的品牌吗?', '可以,这是代工的常规做法。标签内容需按目标市场规则审校后再定稿。'],
      ],
    },
    en: {
      title: 'Cross-border sellers',
      tagline: 'Amazon, TikTok Shop, DTC — stock that lists, restocks and clears review',
      lede: `You do not need one great serum. You need stock that gets listed, restocks on schedule and does not stall in review.
             We fix the factory side first: what we can make, which packaging is in stock, whether the ingredients are usable in your market,
             and how long sampling takes. Then you can plan your launch.`,
      pains: [
        ['A cautious first order, blocked by MOQ', 'MOQ is the highest of three limits: minimum controllable batch, packaging supplier MOQ and changeover amortisation. We show all three, then discuss where the floor really is.'],
        ['The listing is written, then an ingredient turns out to be restricted', 'We check ingredient direction for your target market during selection, not after label artwork is printed.'],
        ['Restock timing is unclear, so ad spend stays parked', 'Sampling and production lead times are written into the proposal, and stock packaging is flagged separately from tooled packaging — the restock speed differs by an order of magnitude.'],
      ],
      steps: [
        ['Tell us the marketplace and price tier', 'Which platform, which countries, which price tier. These three narrow format and packaging before any claim does.'],
        ['Pick format and packaging', 'Run the selector once and get a coded list — formula code plus packaging code, so both sides mean the same object.'],
        ['Sample', 'Confirm texture, fragrance, packaging feel and print. Skipping this step is where rework comes from.'],
        ['Produce and restock', 'After the first order, restocks run on the same codes with no re-briefing.'],
      ],
      proof: [
        ['Packaging library', 'Over five thousand catalogue pages sorted into pumps, bottles, tubes and jars. Quote the code you see.'],
        ['Selector', 'Six steps to a proposal you can forward internally: format, packaging, sellable markets, sampling time.'],
        ['Market signals', 'Every trend claim carries a source and a date you can open and check.'],
      ],
      faq: [
        ['Do you ship into FBA?', 'We are the factory and deliver to your warehouse or forwarder. First-leg freight and inbound appointments are arranged by you or your forwarder; we supply packing lists and the factory-side documents required.'],
        ['Can we run a small test batch?', 'It can be discussed. Test volume depends on format and packaging: standard formats in stock packaging are straightforward, while tooled packaging or unusual formats carry a noticeably higher floor. The exact minimum is confirmed at sampling.'],
        ['Who decides whether ingredients are compliant?', 'We provide factory-side documentation. The compliance conclusion is issued by the brand and its local responsible person. We describe direction; we do not take on your filing liability.'],
        ['Can we print our own brand?', 'Yes, that is the normal contract-manufacturing arrangement. Label content is reviewed against your market rules before artwork is finalised.'],
      ],
    },
  },
  {
    slug: 'indie-brand',
    axis: 'audience',
    match: { benefits: ['barrier', 'soothing', 'sensitive'] },
    zh: {
      title: '独立品牌主理人',
      tagline: '从 0 到 1 的第一批货,最怕的是钱花在返工上',
      lede: `第一批货最贵的不是配方,是试错。改一次包材要重开模,改一次配方要重做稳定性,
             每一次返工都吃掉你本来该花在推广上的钱。
             所以我们把顺序倒过来:先把定位与可行性对齐,再动打样。`,
      pains: [
        ['想法很清楚,但不知道能不能做出来', '把你的定位讲一遍,我们回你哪些做得了、哪些做不了、哪些能做但代价不划算 —— 这一步不收费。'],
        ['同时找了好几家工厂,报的东西对不上', '因为大家用的不是同一套编码。我们给的方案里配方与包材都有编码,你拿去对比就是同一个基准。'],
        ['被「什么都能做」吓到', '什么都能做通常意味着什么都不专。我们把主线写在明处:草本护肤。不在主线上的,我们会直接说不接。'],
      ],
      steps: [
        ['先聊定位,不聊配方', '卖给谁、什么价位、什么渠道、什么调性。定位不清的时候讨论配方是浪费彼此时间。'],
        ['出一份可行性清单', '哪些方向可做、对应什么剂型、大概什么周期。你拿这份去做预算与排期。'],
        ['打样', '一次寄样通常包含两到三个方向的对比,不是只给一个让你猜。'],
        ['定稿量产', '肤感、香型、包材、印刷全部封样确认后再排产。'],
      ],
      proof: [
        ['选品链路', '不用先懂配方也能走完:选品类、选市场、看方案。'],
        ['专家会诊', '配方、法规、包装、成本几个角度分别给意见,分歧的地方我们会说明白,不给你一个和稀泥的结论。'],
        ['包材库', '直接翻实物图册,比在脑子里想像瓶子快得多。'],
      ],
      faq: [
        ['我完全不懂配方,能沟通吗?', '可以。你把想做成什么样、给谁用讲清楚就够了,剂型与成分是我们该翻译的部分。'],
        ['起订量是多少?', '按剂型与包材差别很大,不同方案不同下限。把你的首批规划告诉我们,我们给一个可行的数字,不用一个统一数字糊弄你。'],
        ['配方是我的还是你们的?', '你带来的配方归你;我们的常规配方属于工厂,你使用它不排他。要做排他的定制配方,需要单独约定。'],
        ['能帮我做品牌设计吗?', '包装结构与印刷工艺我们能给建议并配合出刀版;品牌视觉设计不是我们的主业,你自己找设计方会更合适。'],
      ],
    },
    en: {
      title: 'Independent brand founders',
      tagline: 'The first production run — where the money is lost to rework',
      lede: `On a first run the expensive part is not the formula, it is the trial and error.
             Changing packaging means new tooling; changing a formula means repeating stability work.
             So we invert the order: align positioning and feasibility first, then start sampling.`,
      pains: [
        ['A clear idea, unclear whether it can be made', 'Describe the positioning and we will tell you what we can make, what we cannot, and what is possible but not worth the cost. That step is free.'],
        ['Several factories quoted, and nothing lines up', 'Because nobody shares a reference system. Our proposals carry formula and packaging codes, so comparisons run on one baseline.'],
        ['"We can make anything" is a warning sign', 'It usually means nothing in particular. Our line is herbal skincare. If your project is off that line, we will say so.'],
      ],
      steps: [
        ['Positioning before formulation', 'Who buys it, at what price, through which channel, in what tone. Discussing formulas before this is wasted time on both sides.'],
        ['A feasibility list', 'Which directions are workable, in which formats, on roughly what timeline. Use it for budget and scheduling.'],
        ['Sample', 'One shipment usually carries two or three comparable directions rather than a single take-it-or-leave-it option.'],
        ['Lock and produce', 'Texture, fragrance, packaging and print are all approved as physical samples before scheduling.'],
      ],
      proof: [
        ['Selector', 'You do not need formulation knowledge to finish it: pick a category, pick markets, read the proposal.'],
        ['Expert panel', 'Formulation, regulatory, packaging and cost views given separately. Where they disagree, we say so instead of averaging it away.'],
        ['Packaging library', 'Browse real catalogue pages instead of imagining bottles.'],
      ],
      faq: [
        ['I know nothing about formulation. Can we still work together?', 'Yes. Explain what you want it to be and who it is for. Translating that into formats and ingredients is our job.'],
        ['What is the MOQ?', 'It varies widely by format and packaging. Tell us your first-run plan and we will give a workable number rather than one blanket figure.'],
        ['Who owns the formula?', 'A formula you bring stays yours. Our standard formulas belong to the factory and your use of them is non-exclusive. Exclusive custom development is agreed separately.'],
        ['Can you design my brand?', 'We advise on packaging structure and print processes and supply dielines. Brand visual design is not our discipline — a dedicated studio will serve you better.'],
      ],
    },
  },
  {
    slug: 'creator-brand',
    axis: 'audience',
    match: { benefits: ['hydrating', 'soothing'], format: ['mask', 'serum'] },
    zh: {
      title: '内容创作者与达人',
      tagline: '粉丝已经在了,缺的是一支拿得出手、补得上货的产品',
      lede: `你的难点和普通品牌相反:流量不缺,缺的是接得住流量的供货。
             一次直播卖空之后两个月补不上货,比卖不动更伤。
             所以我们优先跟你确认的是补货节奏,而不是产品有多惊艳。`,
      pains: [
        ['一波推广卖空,补货跟不上', '现货包材 + 常规剂型的组合补货最快。方案里我们会明确标出哪些是现货款。'],
        ['产品必须经得起镜头前拆开看', '包材的手感、印刷的清晰度、瓶口的做工 —— 这些在图册里看不出来,必须打样上手。'],
        ['粉丝会追问成分', '我们给你一份可对外的成分说明,写清有什么、为什么加,不写浓度,也不写疗效。'],
      ],
      steps: [
        ['确认量级与节奏', '大概多少人会买、多久推一次。这决定了包材该选现货还是开模。'],
        ['选一支主打', '第一支不要做系列。一支打透了再扩,比一次上五支后全部滞销好。'],
        ['打样上手', '寄样时我们会多寄一两版包材对比,方便你在镜头前做选择。'],
        ['量产 + 预备补货', '首批量产的同时锁定包材备料,补货周期能压掉大半。'],
      ],
      proof: [
        ['包材库', '按类别翻,看中哪一款报编码,不用截图给业务猜。'],
        ['单品页', '每一款配方有独立链接,可以直接发进群里给团队看。'],
        ['市场信号', '哪个方向在涨,带来源和日期,选品时不靠感觉。'],
      ],
      faq: [
        ['能不能不露出工厂?', '可以。我们只做代工,产品对外是你的品牌,我们不在你的包装与页面上出现。'],
        ['能做小批量试水吗?', '可以谈,取决于剂型与包材。走现货包材的常规剂型最容易安排。'],
        ['我可以指定某个成分吗?', '可以。需要你提供该原料的正式技术资料与安全信息,我们先评估相容性再排样。'],
        ['能承诺效果吗?', '不能,我们也不建议你在宣传里承诺。功效宣称需要相应的测试与合规审校,由品牌方按当地规则出具。'],
      ],
    },
    en: {
      title: 'Creators and talent',
      tagline: 'The audience is already there — what is missing is product that can be restocked',
      lede: `Your problem is the inverse of a normal brand's: demand is not the constraint, supply is.
             Selling out in one livestream and then waiting two months for stock hurts more than slow sales.
             So the first thing we pin down with you is restock rhythm, not how remarkable the product sounds.`,
      pains: [
        ['One campaign clears the stock, and restock lags', 'Stock packaging plus a standard format restocks fastest. Proposals mark clearly which items are stock.'],
        ['The product has to survive being opened on camera', 'Packaging feel, print sharpness, neck finish — none of it shows in a catalogue. It has to be sampled in hand.'],
        ['Your audience will ask about ingredients', 'We give you a shareable ingredient explanation: what is in it and why. No concentrations, no therapeutic claims.'],
      ],
      steps: [
        ['Confirm volume and rhythm', 'Roughly how many buyers, and how often you promote. That decides stock versus tooled packaging.'],
        ['Pick one hero', 'Do not launch a range first. One product that lands beats five that sit.'],
        ['Sample in hand', 'We usually include one or two alternative packaging options so you can choose on camera.'],
        ['Produce and pre-stage restock', 'Packaging components are reserved during the first run, which removes most of the restock wait.'],
      ],
      proof: [
        ['Packaging library', 'Browse by category and quote the code — no screenshots for sales to decode.'],
        ['Item pages', 'Every formula has its own link you can drop into a team chat.'],
        ['Market signals', 'Which direction is growing, with source and date, so selection is not guesswork.'],
      ],
      faq: [
        ['Can the factory stay invisible?', 'Yes. We manufacture only. The product goes to market as your brand, and we do not appear on your packaging or pages.'],
        ['Can we start small?', 'It can be discussed, depending on format and packaging. Standard formats in stock packaging are easiest to arrange.'],
        ['Can I specify an ingredient?', 'Yes. Provide the supplier technical file and safety information, and we assess compatibility before scheduling a sample.'],
        ['Can you guarantee results?', 'No, and we would advise against claiming them. Efficacy claims require corresponding testing and review, issued by the brand under local rules.'],
      ],
    },
  },
  {
    slug: 'spa-salon',
    axis: 'audience',
    match: { benefits: ['soothing', 'repair', 'barrier'] },
    packCat: 't=jar',
    zh: {
      title: '美容院与 SPA 连锁',
      tagline: '院线装与家居装成套做,客户带回家的那支才是复购',
      lede: `院线的生意不在单次护理,在客户带回家的那支。
             所以院线装与家居装要成套设计:同一条配方主线、同一套视觉,
             手法和产品讲的是同一件事,顾问才好开口。`,
      pains: [
        ['院线装用得顺手,零售装没人买', '通常是两条产品线各做各的。成套设计是让顾客把护理台上的体验带回家。'],
        ['大包装成本压不下来', '院线装走大规格 + 简装,把成本让给容量而不是包材,这是院线和零售最大的差别。'],
        ['加盟店多,补货杂', '统一编码后,各店报编码补货,总部对账清楚。'],
      ],
      steps: [
        ['先定护理流程', '你的招牌项目是几步、每步用什么质地。产品是跟着手法走的,反过来做一定别扭。'],
        ['院线装与家居装配对', '同一主线出两个规格:护理台上的大规格,和顾客带走的零售规格。'],
        ['打样试做', '让美容师上手试,她们对质地的意见比任何人都准。'],
        ['量产与补货编码', '每支给一个编码,门店按编码补货。'],
      ],
      proof: [
        ['包材库', '膏霜罐、大规格瓶、按压泵各类都能翻,院线装常用的大容量款单列。'],
        ['配方详情页', '每支配方一页,发给你的美容师团队直接看规格。'],
        ['专家会诊', '肤感与刺激性方面的意见单独出,院线产品对刺激性的容忍度比零售低。'],
      ],
      faq: [
        ['院线装和零售装能用同一条配方吗?', '主线可以相同,但通常会分别调整:院线装偏专业感与用量,零售装偏肤感与耐受。'],
        ['能做我们自己的品牌吗?', '可以,这就是代工。品牌与商标由你持有。'],
        ['起订量按每支算还是整套算?', '按单支剂型算。成套下单时不同剂型的起订量不能互相抵扣,这一点在方案里会写清楚。'],
        ['能提供培训资料吗?', '我们提供产品侧的使用说明与注意事项;手法培训与话术是你的专业部分,由你自己编写更合适。'],
      ],
    },
    en: {
      title: 'Spas and salon chains',
      tagline: 'Professional and take-home sizes designed together — the take-home jar is the repeat order',
      lede: `A treatment room does not make its money on the single session; it makes it on the product the client takes home.
             So professional and retail sizes should be designed as one set: one formula line, one visual language.
             When the treatment and the product tell the same story, your consultants have something to say.`,
      pains: [
        ['The professional size works, the retail size does not sell', 'Usually because the two lines were developed separately. Designing them as a set carries the treatment-room experience home.'],
        ['Bulk sizes cost too much', 'Professional sizes run large format with plain packaging — spend on volume rather than on the container. That is the core difference from retail.'],
        ['Many franchise locations, messy restocking', 'With one code per item, each location restocks by code and head office can reconcile.'],
      ],
      steps: [
        ['Define the treatment protocol first', 'How many steps your signature service has, and what texture each step needs. Product follows technique, never the reverse.'],
        ['Pair professional and take-home', 'One formula line in two sizes: the large format on the trolley, the retail size the client takes.'],
        ['Sample and trial', 'Let your therapists use it. Their read on texture is more reliable than anyone else\'s.'],
        ['Produce with restock codes', 'Every item gets a code; locations restock by code.'],
      ],
      proof: [
        ['Packaging library', 'Jars, large-format bottles and pumps, with the high-capacity items professionals use listed separately.'],
        ['Formula pages', 'One page per formula, ready to forward to your therapist team.'],
        ['Expert panel', 'Texture and irritation potential are reviewed separately — professional products have less tolerance for irritation than retail.'],
      ],
      faq: [
        ['Can the professional and retail sizes share one formula?', 'The line can be shared, but they are usually tuned separately: professional leans clinical and generous, retail leans on skin feel and tolerance.'],
        ['Can it carry our own brand?', 'Yes, that is what contract manufacturing is. The brand and trademark stay yours.'],
        ['Is MOQ per item or per set?', 'Per format. Ordering a set does not let one format\'s volume offset another\'s, and proposals state this explicitly.'],
        ['Do you provide training material?', 'We supply product-side directions and cautions. Technique training and consultation scripts are your expertise and are better written by you.'],
      ],
    },
  },
  {
    slug: 'distributor',
    axis: 'audience',
    match: { benefits: ['hydrating', 'brightening'] },
    zh: {
      title: '海外经销商与采购商',
      tagline: '要的是稳定供货与齐全的工厂资料,不是一次性成交',
      lede: `你评估一家工厂看的不是样品有多惊艳,是它能不能连续三年按时交货、
             资料齐不齐、换人之后事情还接不接得上。
             这一页写的是我们这一侧能提供的确定性。`,
      pains: [
        ['工厂资料要一次次去催', '常用的工厂侧资料我们成套准备,不用每次单独申请。'],
        ['换了对接人,之前谈的全部要重讲', '所有配方与包材都有编码,历史方案按编码可查,人换了编码不换。'],
        ['批次之间有差异', '关键工序参数与原料来源固定后,批次差异才谈得上控制。我们会写明哪些参数是锁死的。'],
      ],
      steps: [
        ['明确市场与品类', '你要覆盖的国家与品类范围,决定了哪些方向能走。'],
        ['索取资料与样品', '工厂侧资料与样品同时安排,你的技术与法规同事可以并行评估。'],
        ['小批试产', '先跑一批验证流程与包装适配,而不是直接大批量。'],
        ['长期供货', '固定编码、固定参数、固定周期。'],
      ],
      proof: [
        ['包材库', '完整的实物图册,采购能直接圈款。'],
        ['法规动态', '官方来源的更新加上我们的解读,方向性的变化不至于漏掉。'],
        ['配方详情页', '每支一页,规格与可售市场写在明处,方便你内部传阅。'],
      ],
      faq: [
        ['可以给独家吗?', '区域独家可以谈,通常与量级和期限挂钩,需要单独约定。'],
        ['能提供哪些工厂侧文件?', '常见的包括配方成分表、原料信息、生产与质量体系相关资料。具体清单按你的市场要求确认 —— 各国要求不同,以最新官方文本为准。'],
        ['注册申报谁来做?', '在多数市场,申报由当地的责任人或进口商完成,我们提供工厂侧资料配合。我们不代客户承担责任人角色。'],
        ['最小起订量?', '按剂型与包材确定,长期合作可以按年度量级另谈。'],
      ],
    },
    en: {
      title: 'Distributors and importers',
      tagline: 'Reliable supply and a complete document set — not a one-off deal',
      lede: `You do not judge a factory by how impressive the sample is. You judge it on whether it can deliver on time for three years,
             whether the paperwork is complete, and whether things still run after your contact changes.
             This page is about the certainty we can offer on our side.`,
      pains: [
        ['Chasing factory documents every time', 'We keep the commonly requested factory-side documents prepared as a set rather than issuing them ad hoc.'],
        ['A new contact means re-explaining everything', 'Every formula and packaging item has a code. Past proposals are retrievable by code; people change, codes do not.'],
        ['Batch-to-batch variation', 'Variation is only controllable once critical process parameters and raw material sources are fixed. We state which parameters are locked.'],
      ],
      steps: [
        ['Define markets and categories', 'The countries and categories you cover determine which directions are workable.'],
        ['Request documents and samples', 'Both are arranged together so your technical and regulatory colleagues can review in parallel.'],
        ['Trial run', 'Validate the process and packaging fit on a small batch before committing to volume.'],
        ['Long-term supply', 'Fixed codes, fixed parameters, fixed cycle.'],
      ],
      proof: [
        ['Packaging library', 'The full catalogue, so procurement can mark items directly.'],
        ['Regulatory updates', 'Official-source updates with our reading, so directional changes are not missed.'],
        ['Formula pages', 'One page each, with specifications and sellable markets stated plainly for internal circulation.'],
      ],
      faq: [
        ['Can we have exclusivity?', 'Territory exclusivity can be discussed. It is normally tied to volume and term and agreed separately.'],
        ['Which factory documents can you provide?', 'Typically the ingredient list, raw material information, and production and quality system documentation. The exact set is confirmed against your market\'s requirements, which differ by country — the latest official text governs.'],
        ['Who handles registration?', 'In most markets filing is done by the local responsible person or importer, with factory-side documents from us. We do not act as the responsible person on your behalf.'],
        ['What is the minimum order?', 'Set by format and packaging. Long-term arrangements can be discussed on an annual volume basis.'],
      ],
    },
  },
  {
    slug: 'hotel-gift',
    axis: 'audience',
    match: { format: ['cream', 'lotion', 'foam'] },
    packCat: 't=tube',
    zh: {
      title: '酒店与礼赠定制',
      tagline: '量大、规格小、交期硬 —— 这三件同时成立才算能做',
      lede: `礼赠与酒店客用的难点不在配方,在同时满足三件事:量大、规格小、交期不能拖。
             小规格意味着包材单价占比高,量大意味着任何一点浪费都会放大,
             交期硬意味着任何一个环节掉链子都补不回来。`,
      pains: [
        ['小规格算下来包材比料还贵', '小规格是包材主导的生意。选型阶段就要从包材倒推,而不是先定配方。'],
        ['活动日期定死了,不能延', '排期从交付日倒推,包材备料是最长的那一段,先锁它。'],
        ['要配套一整套,规格还不一样', '成套时按剂型分别确认起订量,不能合并计算 —— 这一点提前讲清能省掉后面的争执。'],
      ],
      steps: [
        ['先定交付日与总量', '这两个数字决定了后面所有选择的可行范围。'],
        ['从包材倒推', '在包材库里先圈现货小规格,再匹配能装的剂型。'],
        ['打样确认', '小规格更要上手确认,尤其是软管封口与旋盖手感。'],
        ['分批交付', '大批量通常分批交,减少仓储压力与风险集中。'],
      ],
      proof: [
        ['包材库', '软管、小规格瓶、旅行装一类单独归类,现货款优先。'],
        ['选品链路', '按交期与量级筛,不合适的方向直接排除。'],
        ['配方详情页', '规格写在明处,方便你走内部采购审批。'],
      ],
      faq: [
        ['最小规格能做到多少?', '取决于包材,常见旅行装规格都能覆盖。具体以选定的包材编码为准。'],
        ['能印我们的标识吗?', '可以。丝印、贴标、烫金都能做,金银珠光类不承诺色差数值,以实物封样为准。'],
        ['交期能压到多短?', '取决于包材是现货还是需要备料。现货款最快,开模款不建议用在硬交期的项目上。'],
        ['能开发票并走对公吗?', '可以,按正常贸易流程走。'],
      ],
    },
    en: {
      title: 'Hospitality and corporate gifting',
      tagline: 'High volume, small sizes, hard deadlines — all three at once, or it does not work',
      lede: `The difficulty in gifting and hotel amenities is not the formula. It is satisfying three constraints together:
             high volume, small sizes and a deadline that cannot move.
             Small sizes make packaging the dominant cost, volume magnifies any waste, and a hard date leaves no room to recover.`,
      pains: [
        ['At small sizes the packaging costs more than the contents', 'Small format is a packaging-led business. Work backwards from packaging at the selection stage rather than fixing the formula first.'],
        ['The event date is fixed and cannot slip', 'Schedule backwards from delivery. Packaging procurement is the longest leg, so lock it first.'],
        ['A full set is needed, in mixed sizes', 'For sets, MOQ is confirmed per format and cannot be pooled. Saying so early avoids the argument later.'],
      ],
      steps: [
        ['Fix the delivery date and total volume', 'These two numbers bound every choice that follows.'],
        ['Work backwards from packaging', 'Mark stock small-format items in the library first, then match a format that fits them.'],
        ['Confirm by sample', 'Small formats especially need hands-on approval — tube sealing and cap feel above all.'],
        ['Deliver in batches', 'Large volumes usually ship in batches to reduce storage pressure and concentrated risk.'],
      ],
      proof: [
        ['Packaging library', 'Tubes, small-format bottles and travel sizes are categorised separately, with stock items first.'],
        ['Selector', 'Filter by lead time and volume so unworkable directions drop out early.'],
        ['Formula pages', 'Specifications stated plainly for internal purchasing approval.'],
      ],
      faq: [
        ['How small can the size go?', 'It depends on packaging; common travel sizes are covered. The selected packaging code governs.'],
        ['Can we print our logo?', 'Yes — silkscreen, labels and hot stamping. We do not commit to numeric colour tolerance on metallics; an approved physical sample governs.'],
        ['How short can lead time be?', 'It depends on whether packaging is in stock or needs procurement. Stock items are fastest; tooled packaging is not advisable on a hard deadline.'],
        ['Can you invoice a company account?', 'Yes, through normal trade procedure.'],
      ],
    },
  },

  /* ── 品类方案:只写主线做得了的 ─────────────────────────────────
     刻意不设「彩妆代工」「头发护理代工」独立落地页 —— 我们的主线是草本护肤,
     为了凑满格子去写没有产能支撑的页面,是把询盘引到我们接不住的地方。 */
  {
    slug: 'herbal-skincare',
    axis: 'category',
    match: { category: ['skincare'], format: ['serum', 'cream', 'lotion', 'essence', 'ampoule'] },
    zh: {
      title: '草本护肤代工',
      tagline: '精华、面霜、水乳 —— 植物提取为主线的护肤主力剂型',
      lede: `这是我们的主线。精华、面霜、乳液这三类占了绝大多数的询盘,
             难点也集中在这里:植物提取物在体系里的稳定性、颜色与气味随时间的变化、
             以及不同活性物之间的相容。这些都是打样阶段要一件件验的。`,
      pains: [
        ['提取物加进去颜色会变', '植物提取物的天然色素与氧化是常见问题。可以通过体系设计与包材避光来控制,但要在打样阶段就验证,不能等量产。'],
        ['想要清爽,又想要成分足', '这两件通常互相拉扯。肤感是配方里最难描述也最容易翻车的部分,必须寄样确认。'],
        ['活性物之间打架', '不同活性物对 pH 与温度的要求不同,叠加时要重新排相容性。这是不能省的一步。'],
      ],
      steps: [
        ['定诉求与肤感', '想解决什么、要什么质地。这两件比成分表更早决定方向。'],
        ['选体系与活性物', '在能稳定共存的范围内选,而不是把好听的成分全堆上。'],
        ['稳定性与相容性验证', '包材相容性一起做 —— 配方和包材要一起验,分开验会漏。'],
        ['封样量产', '肤感、颜色、气味三项都封样,量产时按封样比对。'],
      ],
      proof: [
        ['配方库', '按诉求、剂型、可售市场筛,每支有独立页面与编码。'],
        ['成分库', '关键成分的基本信息与常见使用方向,选型时可对照。'],
        ['专家会诊', '配方、法规、成本三方分别给意见。'],
      ],
      faq: [
        ['能做「纯天然」宣称吗?', '不同市场对这类宣称的口径不同,而且大多需要相应依据。我们的做法是把成分与工艺讲清楚,宣称口径由品牌方按当地规则确定。'],
        ['可以用我指定的提取物吗?', '可以。需要该原料的技术资料与安全信息,我们先做相容性评估。'],
        ['能不能不加防腐?', '「不加防腐」和「产品在保质期内安全」是两件事。可以讨论替代的防护策略,但需要相应的微生物挑战验证支持。'],
        ['打样要多久?', '按剂型与活性物复杂度不同。常规体系较快,含多种活性物或需要新做稳定性的会更久,具体在方案里写明。'],
      ],
    },
    en: {
      title: 'Herbal skincare manufacturing',
      tagline: 'Serums, creams and lotions — the core formats, built on botanical extracts',
      lede: `This is our main line. Serums, creams and emulsions account for most of our enquiries,
             and the difficulties concentrate here: extract stability in the system, colour and odour drift over time,
             and compatibility between actives. Each of these is verified during sampling, one at a time.`,
      pains: [
        ['The colour shifts once extracts go in', 'Natural pigments and oxidation are common. System design and light-blocking packaging control it, but it must be verified during sampling, not in production.'],
        ['Light texture and a generous active load', 'These usually pull against each other. Texture is the hardest part of a formula to describe and the easiest to get wrong, so it must be confirmed by physical sample.'],
        ['Actives that fight each other', 'Different actives demand different pH and temperature windows, so combinations need fresh compatibility work. This step cannot be skipped.'],
      ],
      steps: [
        ['Define the claim and the texture', 'What it should address and how it should feel. Both settle the direction before any ingredient list does.'],
        ['Choose the system and actives', 'Within what can coexist stably, rather than stacking every appealing ingredient.'],
        ['Stability and compatibility testing', 'Run packaging compatibility alongside — formula and container must be tested together or gaps appear.'],
        ['Approve and produce', 'Texture, colour and odour are all approved as retained samples and compared against in production.'],
      ],
      proof: [
        ['Formula library', 'Filter by claim, format and sellable market. Every item has its own page and code.'],
        ['Ingredient library', 'Baseline information and common use directions for key ingredients, for reference during selection.'],
        ['Expert panel', 'Formulation, regulatory and cost views given separately.'],
      ],
      faq: [
        ['Can we claim "all natural"?', 'Markets read that claim differently and most require substantiation. We describe ingredients and process precisely; the claim wording is set by the brand under local rules.'],
        ['Can you use an extract I specify?', 'Yes. We need its technical file and safety information, and we run a compatibility assessment first.'],
        ['Can it be preservative-free?', '"No preservative" and "safe through shelf life" are two different statements. Alternative protection strategies can be discussed, supported by appropriate challenge testing.'],
        ['How long is sampling?', 'It depends on format and active complexity. Standard systems are quicker; multiple actives or new stability work take longer, and the proposal states which applies.'],
      ],
    },
  },
  {
    slug: 'sheet-mask',
    axis: 'category',
    match: { format: ['mask', 'sheet-mask', 'sleeping-mask', 'bio-cellulose-mask', 'eye-patch', 'lip-mask'] },
    packCat: 't=mask-pouch',
    zh: {
      title: '面膜与贴片代工',
      tagline: '膜布、精华液、封口 —— 三件里任何一件出问题,整片就废了',
      lede: `面膜看起来简单,实际上是三件事的组合:膜布、精华液、封装。
             膜布决定贴合与体感,精华液决定效果与稳定,封装决定能不能撑到保质期。
             客户投诉最多的从来不是配方,是膜布干、贴不住、漏液。`,
      pains: [
        ['贴不住、容易掉', '这是膜布选型与裁切版型的问题,不是精华液的问题。要先解决膜布。'],
        ['放几个月就变味', '精华液的防护体系与封口密封性一起决定。两边都要验。'],
        ['一片精华液太少或太多', '含液量影响成本也影响体感,要在打样时按目标人群试出来。'],
      ],
      steps: [
        ['选膜布', '常见的几类膜布触感与贴合差别很大,先寄空白膜布让你上手。'],
        ['配精华液', '在膜布能承载的黏度范围内设计,黏度不对再好的配方也铺不匀。'],
        ['封装与含液量', '确定单片含液量与封口方式。'],
        ['稳定性与量产', '成片做稳定性,而不是只测精华液。'],
      ],
      proof: [
        ['配方库', '面膜类配方按诉求分好,可直接看规格。'],
        ['包材库', '面膜袋与贴片包装单列。'],
        ['市场信号', '哪类面膜在哪个市场在涨,带来源。'],
      ],
      faq: [
        ['可以做冻干或生物纤维吗?', '不同膜材工艺差别很大,能不能做要按具体品类确认。请直接说明你想要的膜材,我们回是否在产能内。'],
        ['单片含液量一般多少?', '按膜布与目标体感确定,不同产品差别不小,以打样确认为准。'],
        ['能做单片独立包装的印刷吗?', '可以,袋材印刷是常规工艺。'],
        ['贴片类(眼贴、唇贴)能做吗?', '看具体形态与膜材,请把参考样品或规格发来,我们按实际产能回复。'],
      ],
    },
    en: {
      title: 'Sheet mask and patch manufacturing',
      tagline: 'Substrate, essence, seal — any one of the three fails and the whole sheet is wasted',
      lede: `Masks look simple and are actually three things at once: substrate, essence and packaging.
             The substrate decides fit and feel, the essence decides performance and stability, the seal decides whether it survives shelf life.
             Complaints are almost never about the formula — they are about a dry sheet, poor fit or leakage.`,
      pains: [
        ['It slides off the face', 'That is a substrate and pattern-cutting problem, not an essence problem. Fix the substrate first.'],
        ['The smell changes after a few months', 'Determined jointly by the essence protection system and seal integrity. Both need testing.'],
        ['Too little or too much essence per sheet', 'Loading affects both cost and sensory experience, and is dialled in during sampling against your target user.'],
      ],
      steps: [
        ['Choose the substrate', 'Common substrate types differ sharply in feel and adhesion. We send blank sheets first so you can judge by hand.'],
        ['Formulate the essence', 'Designed within the viscosity range the substrate can carry — wrong viscosity will not spread evenly no matter how good the formula.'],
        ['Seal and loading', 'Fix per-sheet loading and the sealing method.'],
        ['Stability and production', 'Stability is run on the finished sheet, not on the essence alone.'],
      ],
      proof: [
        ['Formula library', 'Mask formulas grouped by claim, with specifications on view.'],
        ['Packaging library', 'Mask sachets and patch packaging listed separately.'],
        ['Market signals', 'Which mask types are growing in which markets, with sources.'],
      ],
      faq: [
        ['Can you make lyophilised or bio-cellulose masks?', 'Substrate processes differ considerably. Tell us the substrate you want and we will confirm whether it is within our capability.'],
        ['What is the usual essence loading?', 'Set by substrate and target feel; it varies enough that sampling governs.'],
        ['Can individual sachets be printed?', 'Yes, sachet printing is standard.'],
        ['Can you make eye or lip patches?', 'It depends on the form and substrate. Send a reference sample or specification and we will answer against actual capability.'],
      ],
    },
  },
  {
    slug: 'cleansing',
    axis: 'category',
    match: { format: ['foam', 'gel', 'oil', 'balm'], benefits: ['cleansing'] },
    packCat: 't=tube',
    zh: {
      title: '洁面与卸妆代工',
      tagline: '洗得干净和洗完不紧绷,是一条配方里最难同时做到的两件事',
      lede: `洁面是复购最快的品类,也是最容易被差评的品类 —— 因为体感立刻就能感觉到。
             泡沫的细腻度、冲洗的顺滑感、洗完的紧绷感,客户三十秒内就有结论。
             所以洁面的打样比其他品类更依赖真人试用。`,
      pains: [
        ['洗完紧绷', '通常是表活体系过强或复配不合理。要在打样阶段用真人试,不能只看指标。'],
        ['泡沫不够绵密', '泡沫质感由表活复配与增稠体系共同决定,跟"泡多不多"不是一回事。'],
        ['卸妆力和温和度冲突', '这是这个品类的根本矛盾。要先定清楚是卸浓妆还是日常防晒,方向不同做法完全不同。'],
      ],
      steps: [
        ['定使用场景', '早晚洁面?卸妆后二次清洁?卸浓妆?场景不同,体系完全不同。'],
        ['选体系', '氨基酸、皂基、非离子各有取舍,按你的定位与价位段选。'],
        ['真人试用', '这个品类必须做真人试,指标好看但手感差是常见结果。'],
        ['封样量产', '泡沫、气味、稠度全部封样。'],
      ],
      proof: [
        ['配方库', '洁面与卸妆类配方,按体系与肤感分。'],
        ['包材库', '软管、泵瓶、按压瓶各类都能翻。'],
        ['专家会诊', '刺激性与肤感角度单独出意见。'],
      ],
      faq: [
        ['氨基酸洁面成本高多少?', '不同体系成本档不同,我们在方案里标成本档而不写具体价格。价格以书面确认为准。'],
        ['能做无泡的吗?', '可以,清洁乳与卸妆油这类本来就是低泡或无泡体系。'],
        ['卸妆油会不会闷痘?', '与油脂选择和乳化能力有关。可以按你的目标人群调整油脂组合,但不做疗效承诺。'],
        ['能同时做洁面和卸妆一支吗?', '可以做二合一,但要接受它在两个方向上都不会做到极致。定位阶段就要想清楚取舍。'],
      ],
    },
    en: {
      title: 'Cleanser and makeup remover manufacturing',
      tagline: 'Cleaning thoroughly and not leaving skin tight — the hardest pair to satisfy in one formula',
      lede: `Cleansers repurchase fastest and attract criticism fastest, because the experience registers immediately.
             Foam fineness, rinse slip, the tightness afterwards — a user reaches a verdict within thirty seconds.
             So sampling in this category depends on real human trials more than any other.`,
      pains: [
        ['Skin feels tight afterwards', 'Usually an over-strong or poorly balanced surfactant system. It has to be trialled on real users, not judged on figures alone.'],
        ['The foam is not dense enough', 'Foam quality comes from surfactant blending and the thickening system, which is a different question from how much foam appears.'],
        ['Removal power versus mildness', 'This is the category\'s fundamental tension. Decide first whether it removes heavy makeup or everyday sunscreen — the approaches diverge completely.'],
      ],
      steps: [
        ['Define the use occasion', 'Daily cleansing? A second cleanse after removal? Heavy makeup? The system changes entirely with the occasion.'],
        ['Choose the system', 'Amino-acid, soap-based and non-ionic each trade off differently. Choose against your positioning and price tier.'],
        ['Human trial', 'Mandatory here. Good numbers with poor feel is a common outcome.'],
        ['Approve and produce', 'Foam, odour and viscosity are all approved as retained samples.'],
      ],
      proof: [
        ['Formula library', 'Cleansing formulas grouped by system and skin feel.'],
        ['Packaging library', 'Tubes, pump bottles and press bottles all browsable.'],
        ['Expert panel', 'Irritation potential and sensory feel reviewed separately.'],
      ],
      faq: [
        ['How much more does an amino-acid cleanser cost?', 'Systems sit in different cost bands. We mark the band in proposals rather than quoting a figure; price is confirmed in writing.'],
        ['Can it be low-foam?', 'Yes. Cleansing milks and cleansing oils are low-foam or foam-free systems by design.'],
        ['Will a cleansing oil cause breakouts?', 'It relates to oil selection and emulsification capacity. The oil blend can be tuned to your target user, but we make no therapeutic promise.'],
        ['Can one product both cleanse and remove makeup?', 'A two-in-one is possible, provided you accept it will not be best-in-class at either. Make that trade-off consciously at the positioning stage.'],
      ],
    },
  },
  {
    slug: 'body-care',
    axis: 'category',
    match: { format: ['lotion', 'cream', 'foam', 'oil'] },
    packCat: 'g=bottle',
    zh: {
      title: '身体护理代工',
      tagline: '用量大、单价低 —— 成本结构和面部护理完全是两套算法',
      lede: `身体护理的算法和面部完全不同:用量按百毫升计,单价按面部的零头计。
             所以成本必须从大规格包材和料体成本一起倒推,
             照搬面部配方直接放大规格,做出来通常卖不动。`,
      pains: [
        ['照面部配方放大,成本下不来', '身体护理要重新做成本结构,不是把面霜装进大瓶子。'],
        ['大规格包材占成本比例高', '大瓶、泵头、纸箱都比想像的贵。选型时要一起算。'],
        ['香型比功效更影响复购', '身体护理的复购很大程度取决于香型是否耐闻。这一项要单独打样。'],
      ],
      steps: [
        ['定规格与价位', '多少毫升、卖多少钱。这两个数字先定,配方才有边界。'],
        ['选大规格包材', '在包材库里先圈大规格现货款。'],
        ['配料体与香型', '香型单独做几版对比,不要只做一版。'],
        ['封样量产', '气味、稠度、泵出量都封样。'],
      ],
      proof: [
        ['包材库', '大规格瓶与按压泵单列,现货款优先。'],
        ['配方库', '身体护理相关剂型可按规格与成本档筛。'],
        ['选品链路', '按价位段与规格筛,不合适的方向先排除。'],
      ],
      faq: [
        ['能做磨砂类吗?', '看颗粒类型与体系,请说明想要的颗粒与体感,我们按实际产能回复。'],
        ['香型能自己指定吗?', '可以。你可以指定香精供应商,或者由我们提几版给你选。'],
        ['大规格的起订量会更高吗?', '通常会,因为大规格包材本身的起订量高。具体以选定包材为准。'],
        ['能做家庭装和旅行装两个规格吗?', '可以,但两个规格的起订量分别计算,不能合并。'],
      ],
    },
    en: {
      title: 'Body care manufacturing',
      tagline: 'High usage, low unit price — the cost arithmetic is nothing like facial care',
      lede: `Body care runs on different arithmetic: usage is measured in hundreds of millilitres and unit price is a fraction of facial.
             Cost therefore has to be worked backwards from large-format packaging and bulk cost together.
             Scaling a facial formula into a bigger bottle usually produces something that does not sell.`,
      pains: [
        ['A scaled-up facial formula will not hit the cost', 'Body care needs its own cost structure. It is not a face cream in a larger container.'],
        ['Large packaging dominates the cost', 'Big bottles, pumps and cartons all cost more than expected, and must be counted at selection time.'],
        ['Fragrance drives repurchase more than efficacy', 'Repeat purchase depends heavily on whether the scent stays pleasant over time. Sample it separately.'],
      ],
      steps: [
        ['Fix size and price', 'How many millilitres, at what retail price. Those two numbers bound the formula.'],
        ['Choose large-format packaging', 'Mark stock large-format items in the library first.'],
        ['Develop the base and fragrance', 'Run several fragrance versions in comparison rather than one.'],
        ['Approve and produce', 'Odour, viscosity and pump output are all approved as retained samples.'],
      ],
      proof: [
        ['Packaging library', 'Large-format bottles and pumps listed separately, stock items first.'],
        ['Formula library', 'Body formats filterable by size and cost band.'],
        ['Selector', 'Filter by price tier and size so unworkable directions drop out early.'],
      ],
      faq: [
        ['Can you make scrubs?', 'It depends on the particle type and system. Describe the particles and feel you want and we will answer against actual capability.'],
        ['Can we specify the fragrance?', 'Yes. You may nominate a fragrance house, or we can present several options.'],
        ['Is MOQ higher for large sizes?', 'Usually, because large-format packaging carries a higher MOQ itself. The selected packaging governs.'],
        ['Can we do both a family size and a travel size?', 'Yes, but MOQ is counted separately for each size and cannot be pooled.'],
      ],
    },
  },

  /* ── 品类方案:口腔护理(SOP第8节要求) ─────────────────────────── */
  {
    slug: 'oral-care',
    axis: 'category',
    match: { category: ['oral'] },
    packCat: 't=tube',
    zh: {
      title: '口腔护理代工',
      tagline: '牙膏、洁牙片、漱口水 —— 有配方库、有法规方向、有产线',
      lede: `口腔护理不是护肤的附属品:配方体系不同(摩擦剂/保湿剂/活性成分),
             法规要求不同(含氟/不含氟/各市场备案),产线也不同。
             我们把已经做过的19条口腔配方摊开,你能直接对上品类和剂型。`,
      pains: [
        ['牙膏备案到底要走哪个流程', '不同市场的备案要求不同:含氟牙膏在中国按化妆品管理,在部分海外市场按药品或医疗器械管理。先确认目标市场的分类,再选配方方向。'],
        ['洁牙片是新剂型,工厂没做过', '配方库里有三条洁牙片基底,可以做直接压片也可以做崩解片。但这是新剂型,打样周期比传统牙膏长,需要提前规划。'],
        ['漱口水的防腐体系不好定', '漱口水最大的技术难点不是功效,是防腐。pH值、醇含量、防腐剂配伍都要打样验证,不是配方表上写上就行。'],
      ],
      steps: [
        ['确认目标市场与法规分类', '含氟/不含氟、化妆品/药品/医疗器械分类,决定配方可选范围。'],
        ['选剂型', '牙膏(膏体)/洁牙片(片剂)/漱口水(液体),配方库按剂型分类。'],
        ['打样', '寄样确认口感、泡沫量、使用感。口腔产品一定要试口感,不能只看成分表。'],
        ['备案与量产', '目标市场的备案文件由责任人提交,我们提供配方资料和检测报告。'],
      ],
      proof: [
        ['配方库', '19条口腔配方(含三条洁牙片基底),按剂型和功效分类。'],
        ['包材库', '牙膏管、口腔护理瓶按规格分类,有现货款。'],
        ['法规方向', '各市场的口腔护理法规方向已梳理,以最新官方文本为准。'],
      ],
      faq: [
        ['牙膏含氟可以吗?', '可以,但含氟牙膏在部分市场需要额外备案。建议先确认目标市场再决定。'],
        ['洁牙片最小起订量?', '洁牙片是压片工艺,起订量取决于压片线的最小批量。以书面确认为准。'],
        ['漱口水可以加酒精吗?', '可以,但醇含量影响防腐体系和运输分类。打样时一起测试。'],
        ['可以同时做牙膏和漱口水吗?', '可以,但两条产线分别计MOQ,不能合并。'],
      ],
    },
    en: {
      title: 'Oral care manufacturing',
      tagline: 'Toothpaste, tooth tablets, mouthwash — formulas, regulatory direction, production lines',
      lede: `Oral care is not skincare's side project: different formula systems (abrasives, humectants, actives),
             different regulatory requirements (fluoride classification varies by market),
             different production lines. We show you our 19 oral formulas so you can match category and format.`,
      pains: [
        ['Which registration path does toothpaste need?', 'Fluoride toothpaste is classified differently across markets — cosmetic in some, drug or medical device in others. Confirm the market classification before selecting a formula direction.'],
        ['Tooth tablets are new — has the factory done them?', 'Our formula library includes three tooth tablet bases — direct compression or dispersible. But this is a newer format; sampling takes longer than conventional toothpaste.'],
        ['Mouthwash preservative systems are tricky', 'The hardest part of mouthwash is not efficacy — it is preservation. pH, alcohol content, preservative compatibility must all be sampled and tested.'],
      ],
      steps: [
        ['Confirm target market and regulatory class', 'Fluoride/non-fluoride, cosmetic/drug/medical device classification determines the formula space.'],
        ['Select format', 'Toothpaste (paste) / tooth tablets (tablet) / mouthwash (liquid). Formula library is sorted by format.'],
        ['Sample', 'Test taste, foam, mouthfeel. Oral products must be trialled for sensory experience, not just read off an ingredient list.'],
        ['Register and produce', 'Registration documents are filed by the responsible person. We provide formulation data and test reports.'],
      ],
      proof: [
        ['Formula library', '19 oral formulas (including three tooth tablet bases), sorted by format and function.'],
        ['Packaging library', 'Toothpaste tubes and oral care bottles by specification, stock items available.'],
        ['Regulatory direction', 'Oral care regulatory direction by market compiled; latest official text prevails.'],
      ],
      faq: [
        ['Can we use fluoride?', 'Yes, but fluoride toothpaste may require additional registration in some markets. Confirm your target market first.'],
        ['What is the MOQ for tooth tablets?', 'Tooth tablets use a tableting process. MOQ depends on the minimum batch of the tableting line. Subject to written confirmation.'],
        ['Can mouthwash contain alcohol?', 'Yes, but alcohol content affects preservation and transport classification. Test during sampling.'],
        ['Can we do toothpaste and mouthwash together?', 'Yes, but the two production lines carry separate MOQs and cannot be combined.'],
      ],
    },
  },

  /* ── 行业方案:产品开发与打样(SOP第8节要求) ─────────────────── */
  {
    slug: 'product-development',
    axis: 'audience',
    match: { benefits: ['hydrating', 'brightening', 'barrier', 'soothing'] },
    zh: {
      title: '产品开发与打样',
      tagline: '从概念到可以寄的样品 —— 六步选品链路走完出一套方案',
      lede: `很多客户不是来「下大单」的,是来「开发一个新品」的。
             需要的是:能不能做、大概多少钱、打样要多久、什么时候能上。
             我们的六步选品链路把不确定的部分摊在台面上,走完出一份带编码的方案。`,
      pains: [
        ['只有一个概念,不知道能不能做', '能不能做取决于剂型、活性成分稳定性、包材适配。先过一遍选品链路,出一份可行性判断。'],
        ['打样周期不确定,排不上上市节奏', '打样不是提交需求等结果,中间要试肤感、调香型、确认包材。每一步都卡时间。'],
        ['开发完了发现某个成分在目标市场不能用', '选品阶段就先过一遍成分合规,而不是等标签出来才发现要改配方。'],
      ],
      steps: [
        ['说清你的概念和目标市场', '什么功效、什么剂型、卖到哪个国家、什么价位段。这四件决定后续一切。'],
        ['配方可行性判断', '配方库里有没有接近的基底?活性成分稳定性够不够?包材有没有现货?'],
        ['选品链路六步走', '品类→剂型→包材→功效→市场→打样周期,每步出一个可核对的编码。'],
        ['打样与反馈', '寄样确认。样品不确认,量产全是返工。'],
      ],
      proof: [
        ['配方库', '按品类和功效分类,每条配方有编码,可以按编码报样。'],
        ['包材库', '5000+页实物图册,按泵头/瓶身/软管/膏霜罐分类。'],
        ['选品链路', '六步走完,出一份可以直接发给同事的方案:剂型/包材/可售市场/打样周期。'],
      ],
      faq: [
        ['打一次样要多久?', '取决于剂型和包材。常规剂型约2-3周,新剂型或开模包材更长。以实际排产确认为准。'],
        ['打样费用多少?', '打样费用取决于配方复杂度和包材。具体费用以书面报价为准,不在此做范围承诺。'],
        ['可以只打样不下单吗?', '可以。打样和量产是分开的,打样确认后可以选择不下单。'],
        ['打样样品可以改吗?', '可以。打样就是用来调整的,肤感/香型/颜色/包材都可以在打样阶段调。'],
      ],
    },
    en: {
      title: 'Product development and sampling',
      tagline: 'From concept to a sample you can send — six-step selection path outputs a plan',
      lede: `Many clients come not to place a large order, but to develop a new product.
             They need to know: can we make it, roughly how much, how long to sample, when can it launch.
             Our six-step selection path puts the unknowns on the table and outputs a coded plan.`,
      pains: [
        ['Only have a concept — no idea if it is feasible', 'Feasibility depends on format, active stability, packaging compatibility. Run it through the selection path first.'],
        ['Sampling timeline is unclear — cannot plan launch', 'Sampling is not submit-and-wait. It involves testing feel, adjusting fragrance, confirming packaging. Each step takes time.'],
        ['Developed the formula, only to find an ingredient is banned in the target market', 'Ingredient compliance is checked during selection, not after labels are printed.'],
      ],
      steps: [
        ['State your concept and target market', 'What benefit, what format, which country, what price tier. These four determine everything that follows.'],
        ['Formula feasibility check', 'Is there a close base in the formula library? Is the active stable enough? Is the packaging available?'],
        ['Six-step selection path', 'Category → format → packaging → benefit → market → sampling timeline. Each step outputs a verifiable code.'],
        ['Sample and feedback', 'Send samples for confirmation. Without sample sign-off, mass production is all rework.'],
      ],
      proof: [
        ['Formula library', 'Sorted by category and benefit. Each formula has a code; request samples by code.'],
        ['Packaging library', '5,000+ pages of physical catalogues, sorted by pump / bottle / tube / jar.'],
        ['Selection path', 'Six steps output a plan you can forward to a colleague: format / packaging / markets / sampling timeline.'],
      ],
      faq: [
        ['How long does one sampling round take?', 'Depends on format and packaging. Conventional formats about 2-3 weeks; new formats or custom moulds longer. Subject to production schedule.'],
        ['How much does sampling cost?', 'Depends on formula complexity and packaging. Specific pricing by written quote only — no range commitments here.'],
        ['Can we sample without placing an order?', 'Yes. Sampling and mass production are separate. You can choose not to order after sampling.'],
        ['Can samples be modified?', 'Yes. Sampling exists for adjustment — feel, fragrance, colour, packaging can all be changed at this stage.'],
      ],
    },
  },

  /* ── 行业方案:工厂质量体系(SOP第8节要求) ─────────────────────── */
  {
    slug: 'factory-quality',
    axis: 'audience',
    match: {},
    zh: {
      title: '广州工厂质量体系',
      tagline: 'GMPC · ISO 22716 · HALAL —— 看得见的认证,摸得着的流程',
      lede: `买家最怕的不是价格高,是工厂说不清自己的质量标准。
             我们把认证、生产流程、质检节点摊开:每一项认证是什么、覆盖了什么,
             每一步生产谁检查、查什么。不吹「质量第一」,给证据。`,
      pains: [
        ['工厂说有认证,但不清楚认证覆盖了什么', 'GMPC和ISO 22716是化妆品良好生产规范,HALAL是清真认证。每项认证覆盖范围不同,不能笼统说「有认证」。'],
        ['不知道生产过程中哪里有质检', '质检不是出厂前统一查,是每个关键节点都有:原料入库/半成品/灌装/包装/成品出厂。每个节点查什么,我们列出来。'],
        ['打样和量产的质量标准不一样怎么办', '打样确认的配方和包材就是量产标准。量产时每批留样,有偏差可以对照。'],
      ],
      steps: [
        ['查看认证清单', 'GMPC(化妆品良好生产规范)/ISO 22716(化妆品GMP)/HALAL(清真)。以证书原件为准。'],
        ['了解生产流程质检节点', '原料入库检测→乳化过程监控→灌装前检验→包装后抽检→成品留样。每个节点有记录。'],
        ['打样确认即量产标准', '打样确认的肤感/香型/包材/印刷就是量产标准,有偏差可对照留样。'],
        ['量产留样追溯', '每批量产留样,有偏差可以对照。留样保存期限按品类定。'],
      ],
      proof: [
        ['认证墙', 'GMPC/ISO 22716/HALAL证书展示,以原件为准。'],
        ['工厂照片', '生产车间/乳化设备/灌装线/质检实验室实拍。'],
        ['生产流程', '从原料到出库的完整流程,标注每个质检节点。'],
      ],
      faq: [
        ['工厂有FDA注册吗?', 'FDA是美国的注册/通报机制,不是工厂认证。我们的工厂认证是GMPC和ISO 22716。FDA相关注册由责任人提交。'],
        ['可以参观工厂吗?', '可以。提前预约,安排参观生产车间和质检实验室。'],
        ['每批产品都有质检报告吗?', '每批有质检记录和留样。完整质检报告根据需要提供。'],
        ['HALAL认证覆盖所有产品吗?', 'HALAL认证覆盖符合清真要求的产品。不含HALAL认证的产品按常规生产。'],
      ],
    },
    en: {
      title: 'Guangzhou factory quality system',
      tagline: 'GMPC · ISO 22716 · HALAL — visible certifications, tangible processes',
      lede: `What buyers fear most is not high prices — it is a factory that cannot articulate its own quality standards.
             We lay out our certifications, production flow, and inspection checkpoints: what each certification covers,
             who checks what at each stage. Not empty claims of "quality first" — evidence.`,
      pains: [
        ['Factory claims certifications but cannot explain coverage', 'GMPC and ISO 22716 are cosmetics good manufacturing practice standards. HALAL is a halal certification. Each covers different scopes — "we have certs" is not enough.'],
        ['No idea where quality checks happen in production', 'Quality checks are not just at the end — they are at every key node: raw material intake, bulk, filling, packaging, finished goods. We list what is checked at each.'],
        ['How do sampling and mass production standards differ?', 'The formula and packaging confirmed during sampling become the mass production standard. Each batch retains samples for comparison.'],
      ],
      steps: [
        ['Review certification list', 'GMPC (cosmetics GMP) / ISO 22716 (cosmetics GMP) / HALAL (halal). Subject to original certificates.'],
        ['Understand production quality checkpoints', 'Raw material intake testing → emulsion process monitoring → pre-filling inspection → post-packaging sampling → finished goods retention. Each node logged.'],
        ['Sample sign-off equals mass production standard', 'Feel, fragrance, packaging, print confirmed during sampling are the mass production standard. Deviations checked against retained samples.'],
        ['Mass production sample retention', 'Every batch retains samples for deviation comparison. Retention period by category.'],
      ],
      proof: [
        ['Certification wall', 'GMPC / ISO 22716 / HALAL certificates on display. Originals prevail.'],
        ['Factory photos', 'Production floor, emulsion equipment, filling line, QC lab — real photos.'],
        ['Production flow', 'Full flow from raw materials to dispatch, with each quality checkpoint marked.'],
      ],
      faq: [
        ['Is the factory FDA-registered?', 'FDA is a US registration/notification mechanism, not a factory certification. Our factory certifications are GMPC and ISO 22716. FDA-related filings are submitted by the responsible person.'],
        ['Can we visit the factory?', 'Yes. Make an appointment in advance. Tours of production floor and QC lab arranged.'],
        ['Does every batch come with a quality report?', 'Every batch has quality records and retained samples. Full quality reports provided on request.'],
        ['Does HALAL certification cover all products?', 'HALAL covers products that meet halal requirements. Non-HALAL products are produced under standard process.'],
      ],
    },
  },
];

export const byAxis = (axis: Axis) => SOLUTIONS.filter((s) => s.axis === axis);
export const findSolution = (slug: string) => SOLUTIONS.find((s) => s.slug === slug) ?? null;
