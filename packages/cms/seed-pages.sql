-- 由 tools/seed-pages.mjs 生成,勿手改。重跑即刷新。
DELETE FROM block_i18n WHERE block_id IN (SELECT b.id FROM blocks b JOIN pages p ON p.id=b.page_id WHERE p.slug <> '');
DELETE FROM blocks WHERE page_id IN (SELECT id FROM pages WHERE slug <> '');
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","洁净等级按剂型分区,关键工序局部提升至更高等级。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","Cleanroom class is zoned by format, with critical steps locally upgraded."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","品牌方可以只要其中一项,也可以整包交给我们。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","Take one, or hand over the whole path."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","Every claim needs a matching test plan. If a direction cannot be substantiated, we say so."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","证书编号与有效期可在询盘后提供扫描件核验。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","Certificate numbers and validity can be verified against scanned copies upon inquiry."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BEAUTY2OEM","title":"","lead":"本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BEAUTY2OEM","title":"","lead":"Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='beauty2oem' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","All trademarks and content belong to BOHUI Group and may not be reproduced without permission."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='beauty2oem' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","洁净等级按剂型分区,关键工序局部提升至更高等级。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","Cleanroom class is zoned by format, with critical steps locally upgraded."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","品牌方可以只要其中一项,也可以整包交给我们。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","Take one, or hand over the whole path."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","Every claim needs a matching test plan. If a direction cannot be substantiated, we say so."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","证书编号与有效期可在询盘后提供扫描件核验。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","Certificate numbers and validity can be verified against scanned copies upon inquiry."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"SKIN2OEM","title":"","lead":"本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"SKIN2OEM","title":"","lead":"Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='skin2oem' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","All trademarks and content belong to BOHUI Group and may not be reproduced without permission."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='skin2oem' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","洁净等级按剂型分区,关键工序局部提升至更高等级。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","Cleanroom class is zoned by format, with critical steps locally upgraded."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","品牌方可以只要其中一项,也可以整包交给我们。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","Take one, or hand over the whole path."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","Every claim needs a matching test plan. If a direction cannot be substantiated, we say so."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","证书编号与有效期可在询盘后提供扫描件核验。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","Certificate numbers and validity can be verified against scanned copies upon inquiry."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-AI","title":"","lead":"Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-ai' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","All trademarks and content belong to BOHUI Group and may not be reproduced without permission."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-ai' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","洁净等级按剂型分区,关键工序局部提升至更高等级。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","Cleanroom class is zoned by format, with critical steps locally upgraded."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","品牌方可以只要其中一项,也可以整包交给我们。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","Take one, or hand over the whole path."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","Every claim needs a matching test plan. If a direction cannot be substantiated, we say so."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","证书编号与有效期可在询盘后提供扫描件核验。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","Certificate numbers and validity can be verified against scanned copies upon inquiry."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='medierba' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"MEDIERBA","title":"","lead":"本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"MEDIERBA","title":"","lead":"Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='medierba' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","All trademarks and content belong to BOHUI Group and may not be reproduced without permission."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='medierba' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["帛卉集团以自有工厂与研发中心为核心,为全球品牌提供从配方到成品的制造服务。","我们不承接一次性代工:每一个合作从产能匹配与合规判断开始,确保产品能在目标市场真正上市。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["BOHUI Group operates its own plants and R&D centres, serving global brands from formulation through to finished goods.","We do not take one-off jobs. Every engagement starts with capacity matching and a regulatory read, so the product can actually launch in its destination market."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/group' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/group';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["集团旗下五个平台分工明确:两个智造平台承担生产,一个 AI 平台承担研发,两个品牌平台面向终端。","这个结构让研发成果可以在多个制造平台之间复用,而不是每个品牌各自重复投入。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Five platforms divide the work: two manufacturing platforms produce, one AI platform develops, two brand platforms face the end market.","This lets R&D output be reused across manufacturing platforms rather than duplicated brand by brand."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/group' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/history' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/history';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["从单一车间到多品类产线,产能扩张始终跟着客户的品类需求走,而不是先建产线再找订单。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["From a single workshop to multi-category lines, capacity has always followed customer demand rather than being built ahead of orders."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/history' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/plants' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='about/plants';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["乳化、灌装、压粉、冷制多工艺并行,小批试产与大货共线,保证打样与量产的配方一致性。","洁净等级按剂型分区,关键工序局部提升至更高等级。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Emulsification, filling, powder pressing and cold process run in parallel; pilot batches share lines with production so formulas stay consistent from sample to scale.","Cleanroom class is zoned by format, with critical steps locally upgraded."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='about/plants' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们把代工拆成四件可以单独购买的能力:制造、品牌孵化、供应链整合、全球交付。","品牌方可以只要其中一项,也可以整包交给我们。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We split contract manufacturing into four capabilities you can buy separately: production, brand incubation, supply-chain integration, and global delivery.","Take one, or hand over the whole path."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/manufacturing' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/manufacturing';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["护肤、彩妆、洁护、口腔四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Skincare, colour, cleansing and oral care lines run in parallel, so one order can span categories instead of being split across factories."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/manufacturing' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/incubation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/incubation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["没有配方、没有包材、只有一个品牌想法也能开始。我们从品类定位往回推,给出可执行的产品线规划。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["No formula, no packaging, just an idea is enough to begin. We work backwards from category positioning to an executable product-line plan."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/incubation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/packaging' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='capabilities/packaging';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["包材选型直接决定成本结构与货架表现。我们提供结构打样与相容性测试,避免量产后才发现不适配。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Packaging choice drives both cost structure and shelf presence. We provide structural prototyping and compatibility testing so mismatches surface before production, not after."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='capabilities/packaging' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["研发不是把成分堆上去,而是在合规边界内找到功效与稳定性的平衡点。","每一条宣称都要有对应的检测方案;做不出证据的方向,我们会直接说。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["R&D is not stacking actives; it is finding the balance between efficacy and stability inside the regulatory envelope.","Every claim needs a matching test plan. If a direction cannot be substantiated, we say so."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/formulation' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd/formulation';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["配方库覆盖乳液、精华、面霜、面膜、膏体与粉体;既有配方可直接复刻,也可按目标功效重新设计。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["The formula library covers emulsions, serums, creams, masks, pastes and powders. Existing formulas can be reproduced, or new ones designed to a target claim."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/formulation' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/lab' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='rnd/lab';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["稳定性、相容性、微生物与防腐挑战在内部完成;人体功效与安全性测试对接第三方机构统一安排。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Stability, compatibility, microbiology and preservative challenge testing run in house; human efficacy and safety testing are arranged with third-party institutions."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='rnd/lab' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='products' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='products';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["下面是可做的剂型与起订量。选好规格加入询盘车,逛完一次性提交,不用每个剂型都填一遍表。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Below are the formats we make, with minimum order quantities. Pick a spec, add it to your list, and send everything at once."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='products' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='quality' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='quality';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["出口目的地不同,所需合规文件不同。我们按目的地清单逐项准备,不让货卡在关口。","证书编号与有效期可在询盘后提供扫描件核验。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Required documentation differs by destination market. We prepare each item against your destination checklist so shipments do not stall at the border.","Certificate numbers and validity can be verified against scanned copies upon inquiry."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='quality' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='contact' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='contact';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["把需求写清楚,我们的回复才有价值。品类、目标市场、预估数量、期望上市时间 —— 这四项填得越具体,第一封回信就越可执行。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["A clear brief earns a useful reply. Category, target market, estimated volume and intended launch date — the more specific these are, the more actionable our first response."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='contact' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='privacy' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='privacy';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["我们只收集为回复询盘所必需的信息:姓名、公司、邮箱、国家与需求描述。","这些信息不用于任何第三方营销,不出售、不交换。你可以随时来信要求删除。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["We collect only what is needed to answer an inquiry: name, company, email, country and your requirement.","This is never used for third-party marketing, never sold, never exchanged. You may request deletion at any time by email."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='privacy' AND b.type='prose' AND b.sort_order=1;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'hero',0,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","ctaPrimary":"发起询盘"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"eyebrow":"BIOSPHERE-ORALCARE","title":"","lead":"Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","ctaPrimary":"Start an inquiry"}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='terms' AND b.type='hero' AND b.sort_order=0;
INSERT INTO blocks (page_id,type,sort_order,is_visible,config_json)
      SELECT id,'prose',1,1,'{}' FROM pages WHERE site_id='biosphere-oralcare' AND slug='terms';
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'zh-cn','{"paragraphs":["本站内容供参考,不构成要约。产品规格、产能与交期以书面报价与合同约定为准。","站内所有商标与内容归帛卉集团所有,未经许可不得复制使用。"]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
INSERT INTO block_i18n (block_id,lang,data_json)
        SELECT b.id,'en','{"paragraphs":["Content on this site is for reference and does not constitute an offer. Specifications, capacity and lead times are governed by the written quotation and contract.","All trademarks and content belong to BOHUI Group and may not be reproduced without permission."]}' FROM blocks b JOIN pages p ON p.id=b.page_id
        WHERE p.site_id='biosphere-oralcare' AND p.slug='terms' AND b.type='prose' AND b.sort_order=1;
