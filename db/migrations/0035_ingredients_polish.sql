-- 0035(2026-09-07):原料类别归并 + 进导航与站点地图。
--
-- 类别被括号切碎了:「多酚(萜酚类)」「多酚(酚酸类)」「植物提取物(三萜皂苷单体)」
-- 「脂质(神经酰胺)」各只有 1 条。括号里是更细的分型,写进 family 就让筛选栏
-- 多出五个只有一条的类目 —— 那不是筛选,是噪音。细分信息在 mechanism 里已经写着,
-- family 只留大类。
UPDATE ingredients SET family = TRIM(SUBSTR(family, 1, INSTR(family, '(') - 1))
 WHERE INSTR(family, '(') > 1;
UPDATE ingredients SET family = TRIM(SUBSTR(family, 1, INSTR(family, '(') - 1))
 WHERE INSTR(family, '(') > 1;
UPDATE ingredients SET family = '活性物' WHERE family IN ('小分子有机物', '');

-- 原料库进导航
INSERT OR IGNORE INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
VALUES ('biosphere-ai', 'ingredients', NULL, 'external', 1, 4, 'published');
INSERT OR REPLACE INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (
  (SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ingredients'), 'zh-cn', '原料库',
  '草本原料库 —— 配伍禁忌、稳定性、投料要点,写在明处',
  '一百条常用草本与配套活性物,每条写明和什么一起用会出问题、见光遇氧高温会怎样、投料要注意什么。');
INSERT OR REPLACE INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (
  (SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='ingredients'), 'en', 'Ingredients',
  'Botanical ingredient library — incompatibilities, stability and processing',
  'One hundred botanicals with what they conflict with, how they behave under light, oxygen and heat, and what to watch during addition.');
