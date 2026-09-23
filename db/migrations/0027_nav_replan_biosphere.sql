-- 0027(2026-09-06):biosphere-ai 导航改规划。
--
-- 改之前是 13 个一级项平铺一排:关于我们 / 能力与服务 / 研发创新 / 种植基地 / 产品品类 /
-- 质量与合规 / 行业资讯 / 选品台 / AI 肌肤检测 / 包材库 / AI 共创 / AI 包装设计 / 联系询盘。
-- 一排十三个,客户第一眼看不出该点哪个;四个 AI 工具还各占一格,散成四摊。
--
-- 改之后七个一级项,每个下面挂真正相关的二级:
--   选品链路(直接进向导)· 包材库(直接进图册)· 解决方案(十个落地页)
--   AI 工作台(四个工具收一处)· 工厂实力(产能与检测)· 种植基地(自有原料是我们的差异)
--   关于帛卉(公司、品类、资讯),外加联系询盘。
--
-- selector / packaging / solutions / search 在 Astro 里都有真实路由,静态段优先级高于
-- [...path] 兜底,所以这些 pages 行只产出导航与 sitemap 条目,不抢渲染。
-- 只写 en 与 zh-cn:getNav 有语言回落链,其余语言由翻译定时任务补。

INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions',NULL,'external',1,3,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','ai',NULL,'external',1,4,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','search',NULL,'external',1,41,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/cross-border-seller',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,31,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/indie-brand',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,32,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/creator-brand',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,33,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/spa-salon',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,34,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/distributor',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,35,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/hotel-gift',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,36,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/herbal-skincare',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,37,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/sheet-mask',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,38,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/cleansing',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,39,'published');
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status) VALUES ('biosphere-ai','solutions/body-care',(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'external',1,40,'published');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'zh-cn','解决方案','解决方案 —— 按你是谁、按你要做什么','跨境卖家、独立品牌、创作者、美容院、经销商、礼赠定制,以及四个品类方案。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions'),'en','Solutions','Solutions — by who you are and what you make','Cross-border sellers, indie brands, creators, spas, distributors and gifting, plus four category solutions.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai'),'zh-cn','AI 工作台','AI 工作台 —— 搜索、肌肤检测、共创、包装设计','站内的 AI 工具收在一处:检索有出处的答案、肌肤方向判断、包装与文案共创。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai'),'en','AI workbench','AI workbench — search, skin, co-creation, packaging','Our AI tools in one place: sourced answers, skin direction, packaging and copy co-creation.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='search'),'zh-cn','AI 搜索','AI 搜索 —— 问一句,给带出处的答案','检索配方库、包材库、成分库、法规与市场信号,答案短,来源可点开核对。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='search'),'en','AI search','AI search — ask once, get a sourced answer','Searches formulas, packaging, ingredients, regulation and market signals. Short answers, checkable sources.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/cross-border-seller'),'zh-cn','跨境电商卖家','跨境电商卖家的代工方案','能上架、能补货、审核不卡住的货。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/cross-border-seller'),'en','Cross-border sellers','Contract manufacturing for cross-border sellers','Stock that lists, restocks and clears review.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/indie-brand'),'zh-cn','独立品牌主理人','独立品牌的第一批货','把钱花在对的地方,不花在返工上。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/indie-brand'),'en','Independent brands','The first production run for an indie brand','Spend on the product, not on rework.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/creator-brand'),'zh-cn','内容创作者与达人','创作者自有品牌的供货','粉丝已经在了,缺的是补得上货的产品。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/creator-brand'),'en','Creators','Supply for creator-owned brands','The audience is there; the supply has to keep up.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/spa-salon'),'zh-cn','美容院与 SPA','院线装与家居装成套定制','客户带回家的那支才是复购。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/spa-salon'),'en','Spas and salons','Professional and take-home sizes as one set','The take-home jar is the repeat order.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/distributor'),'zh-cn','海外经销商','经销商与采购商的稳定供货','编码不变、参数固定、资料齐全。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/distributor'),'en','Distributors','Reliable supply for distributors and importers','Fixed codes, fixed parameters, complete documents.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/hotel-gift'),'zh-cn','酒店与礼赠','酒店客用与礼赠定制','量大、规格小、交期硬,三件同时成立。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/hotel-gift'),'en','Hospitality and gifting','Hotel amenities and corporate gifting','High volume, small sizes, hard deadlines.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/herbal-skincare'),'zh-cn','草本护肤代工','草本护肤代工 —— 精华、面霜、水乳','以植物提取为主线的护肤主力剂型。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/herbal-skincare'),'en','Herbal skincare','Herbal skincare manufacturing','Serums, creams and lotions built on botanical extracts.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/sheet-mask'),'zh-cn','面膜与贴片','面膜与贴片代工','膜布、精华液、封口,三件都得对。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/sheet-mask'),'en','Sheet masks','Sheet mask and patch manufacturing','Substrate, essence and seal all have to be right.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/cleansing'),'zh-cn','洁面与卸妆','洁面与卸妆代工','洗得干净和洗完不紧绷,要同时做到。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/cleansing'),'en','Cleansers','Cleanser and makeup remover manufacturing','Clean thoroughly without leaving skin tight.');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/body-care'),'zh-cn','身体护理','身体护理代工','用量大、单价低,成本结构和面部完全不同。');
INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc) VALUES ((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='solutions/body-care'),'en','Body care','Body care manufacturing','High usage and low unit price — different arithmetic from facial.');

/* 重排:一级只留七个,其余全部收进对应的二级 */
UPDATE pages SET sort_order=1, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='selector';
UPDATE pages SET sort_order=2, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='packaging';
UPDATE pages SET sort_order=50, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='capabilities';
UPDATE pages SET sort_order=51, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='capabilities/manufacturing';
UPDATE pages SET sort_order=52, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='rnd/formulation';
UPDATE pages SET sort_order=53, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='rnd/lab';
UPDATE pages SET sort_order=54, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='quality';
UPDATE pages SET sort_order=55, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='about/plants';
UPDATE pages SET sort_order=56, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='capabilities/incubation';
UPDATE pages SET sort_order=57, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities') WHERE site_id='biosphere-ai' AND slug='capabilities/packaging';
UPDATE pages SET sort_order=42, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai') WHERE site_id='biosphere-ai' AND slug='search';
UPDATE pages SET sort_order=43, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai') WHERE site_id='biosphere-ai' AND slug='skin';
UPDATE pages SET sort_order=44, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai') WHERE site_id='biosphere-ai' AND slug='studio';
UPDATE pages SET sort_order=45, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ai') WHERE site_id='biosphere-ai' AND slug='pack';
UPDATE pages SET sort_order=58, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='origin';
UPDATE pages SET sort_order=60, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='about';
UPDATE pages SET sort_order=61, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about') WHERE site_id='biosphere-ai' AND slug='about/history';
UPDATE pages SET sort_order=62, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about') WHERE site_id='biosphere-ai' AND slug='products';
UPDATE pages SET sort_order=63, parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about') WHERE site_id='biosphere-ai' AND slug='news';
UPDATE pages SET sort_order=70, parent_id=NULL WHERE site_id='biosphere-ai' AND slug='contact';
UPDATE pages SET in_nav=0 WHERE site_id='biosphere-ai' AND slug='rnd';

/* 「能力与服务」是我们的内部说法,客户在意的是工厂本身 */
UPDATE page_i18n SET nav_label='工厂实力' WHERE lang='zh-cn' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities');
UPDATE page_i18n SET nav_label='Factory' WHERE lang='en' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='capabilities');
UPDATE page_i18n SET nav_label='选品链路' WHERE lang='zh-cn' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='selector');
UPDATE page_i18n SET nav_label='关于帛卉' WHERE lang='zh-cn' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='about');
