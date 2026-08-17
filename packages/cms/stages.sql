-- 叙事流程版块 —— 内容取自创始人文化墙上的六大能力。
--
-- 这六格本身就是一条序列(草本原料 → 古方研究 → 低温冷萃 → AI检测 → 智能溯源 → 智能制造),
-- 所以按阶段排,而不是拆成六张并列卡片 —— 并列排,链条就断了。
--
-- 纪律:不编任何数字。产能、认证数量、年限一概不写 ——
-- 没核实的指标是最廉价也最危险的一种「好看」,写进去就是不实宣称。
-- 每一阶段只写「我们在这一段做什么」,可核实的具体数字等创始人给。

INSERT INTO blocks (page_id, type, sort_order, is_visible)
SELECT p.id, 'stages', 15, 1
  FROM pages p
 WHERE p.slug = ''
   AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.page_id = p.id AND b.type = 'stages');

INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'zh-cn', json('{
  "eyebrow": "从一株药材到一支成品",
  "title": "六道工序,一条链",
  "intro": "代工厂到处都是,能把整条链管到底的没几家。下面六段不是六项服务,是同一支产品依次经过的六道工序 —— 每一道我们都自己管。",
  "stages": [
    {
      "name": "草本原料",
      "code": "BOTANY",
      "desc": "东方草本与巴西雨林草本两条原料线。原料不是买回来的一个批号,而是看得见来路、管得到规范的一片地。",
      "points": ["自有与合作种植基地", "道地产区优先", "采收期与部位可追"]
    },
    {
      "name": "古方研究",
      "code": "FORMULA",
      "desc": "把古方里的配伍关系翻译成现代配方能用的语言 —— 哪几味协同、哪几味相斥、什么比例下肤感才立得住。",
      "points": ["配伍关系梳理", "活性物与浓度区间", "肤感与稳定性平衡"]
    },
    {
      "name": "低温冷萃",
      "code": "EXTRACTION",
      "desc": "热提取快,但对热敏感的活性物是一种损耗。低温冷萃慢、成本高,换来的是活性物到成品时还在。",
      "points": ["低温工艺", "活性物保留", "批次一致性"]
    },
    {
      "name": "AI 检测",
      "code": "AI READ",
      "desc": "客户拍一张照片,视觉模型读出肌肤外观特征,再从我们的配方库里检索匹配的配方 —— 推荐的每一支都真实存在,能直接询价打样。",
      "points": ["外观特征结构化", "配方库检索", "先检索再解释"]
    },
    {
      "name": "智能溯源",
      "code": "TRACE",
      "desc": "从基地、原料批次、配方版本到成品批次,每一段都留记录。品牌方要对消费者讲的故事,得先在我们这里立得住。",
      "points": ["基地到批次", "配方版本留痕", "记录可调取"]
    },
    {
      "name": "智能制造",
      "code": "MAKE",
      "desc": "洁净车间分区生产,原料验收、洁净生产、智能灌装、质量检测、成品入库五段闭环,数据留痕、责任到人。",
      "points": ["车间分区", "在线检测", "数据留痕"]
    }
  ],
  "ctaLabel": "从第一道工序谈起 →"
}')
  FROM blocks b
 WHERE b.type = 'stages'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'zh-cn');

INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'en', json('{
  "eyebrow": "From the plant to the finished unit",
  "title": "Six stages, one chain",
  "intro": "Contract manufacturers are everywhere. Few govern the whole chain. What follows is not six services — it is six stages the same product passes through, and we hold each one.",
  "stages": [
    {
      "name": "Raw botany",
      "code": "BOTANY",
      "desc": "Two botanical lines: Eastern herbs and Brazilian rainforest botanicals. A raw material is not a batch number we buy in — it is land whose origin we can see and whose practice we can govern.",
      "points": ["Own and partner cultivation", "Origin-region first", "Harvest window traceable"]
    },
    {
      "name": "Classical formula research",
      "code": "FORMULA",
      "desc": "Translating the pairing logic of classical formulas into terms a modern formulation can use — what works together, what fights, and at what ratio the skin-feel still holds.",
      "points": ["Pairing logic", "Actives and ranges", "Feel versus stability"]
    },
    {
      "name": "Cold extraction",
      "code": "EXTRACTION",
      "desc": "Heat is fast, but heat-sensitive actives pay for it. Cold extraction is slower and costs more; what it buys is actives that are still there in the finished unit.",
      "points": ["Low-temperature process", "Active retention", "Batch consistency"]
    },
    {
      "name": "AI skin reading",
      "code": "AI READ",
      "desc": "A customer takes one photo; a vision model reads visible traits, then we retrieve matching formulas from our own library — every formula suggested is real and can go straight to sampling.",
      "points": ["Traits structured", "Library retrieval", "Retrieve before explain"]
    },
    {
      "name": "Traceability",
      "code": "TRACE",
      "desc": "Base, raw-material batch, formula version, finished batch — each step keeps a record. The story a brand tells its customers has to hold up here first.",
      "points": ["Base to batch", "Formula versioning", "Records retrievable"]
    },
    {
      "name": "Manufacturing",
      "code": "MAKE",
      "desc": "Zoned cleanroom production: intake, clean production, filling, quality check, finished-goods storage — a closed loop with records kept and ownership named.",
      "points": ["Zoned floor", "In-line inspection", "Records kept"]
    }
  ],
  "ctaLabel": "Start at stage one →"
}')
  FROM blocks b
 WHERE b.type = 'stages'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'en');

-- 首页原有的「品类矩阵 / 服务流程」与新阶段版块功能重叠,先隐藏不删 ——
-- 删了就没法一键对比回退。创始人看完新版再决定去留。
UPDATE blocks SET is_visible = 0
 WHERE type IN ('matrix', 'process')
   AND page_id IN (SELECT id FROM pages WHERE slug = '');
