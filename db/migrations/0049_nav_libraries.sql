-- 0049(2026-09-07):导航顶层改成「产品库」索引页,四个库做下拉子项。
--
-- 创始人:「你摆错了,包材库应该是下拉的选项,而不是顶部。
--   点顶部要不然就是下拉,要不然进入综合介绍下面几个库的索引,然后可以分布点击进入」
--
-- 0043 把顶层直接指到 /packaging/,等于用一个库的名字代表四个库:
-- 找包材的人看不到配方,找配方的人以为这站只有包材。
-- 现在顶层是 /libraries/ 索引页,包材/配方/原料/成品四项挂在它下面。
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status)
VALUES ('biosphere-ai','libraries',NULL,'external',1,3,'published');

INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt) VALUES
((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='libraries'),'zh-cn',
 '产品库','四个库,是一条产线上的四段 —— 包材、配方、包装盒、成品',
 '广州帛卉化妆品的产品库总览:3,716 款包材、100 支配方、92 款包装盒、94 条草本原料。四个库是同一条产线上先后相连的四段,从任一段都能进。',0),
((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='libraries'),'en',
 'Libraries','Four libraries, four stages of one production line',
 'Packaging, formulas, cartons and finished products from a Guangzhou botanical cosmetics factory: 3,716 containers, 100 formulas, 92 cartons, 94 botanical actives. Enter at any stage.',0);

-- 四个库挂到它下面
UPDATE pages SET parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='libraries'),
                 sort_order=31 WHERE site_id='biosphere-ai' AND slug='packaging';
UPDATE pages SET sort_order=32 WHERE site_id='biosphere-ai' AND slug='formulas';
UPDATE pages SET sort_order=33 WHERE site_id='biosphere-ai' AND slug='ingredients';
UPDATE pages SET sort_order=34 WHERE site_id='biosphere-ai' AND slug='products';
UPDATE pages SET parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='libraries')
 WHERE site_id='biosphere-ai' AND slug IN ('formulas','ingredients','products');
