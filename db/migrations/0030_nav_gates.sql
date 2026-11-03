-- 0030(2026-09-06):导航空壳闸。
--
-- 起因:mega-menu 勘察查出「行业资讯」挂在导航上,而 news 表 207 条**一条都没发布**
-- (total=207, is_published 合计 0)。客户点进去是空页 —— 这比没有这一项更糟。
-- 资讯本来就在改口径(法规动态 + 工厂动态、官方源、人工签发),内容到位之前先摘下来。
--
-- 同时把配方库补进导航与站点地图:页面 22:36 就上线了,但 pages 表里没有对应行,
-- 于是它既不在导航里、也不在 sitemap 里 —— 建了等于没建。
UPDATE pages SET in_nav = 0 WHERE site_id='biosphere-ai' AND slug='news';

INSERT OR IGNORE INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
VALUES ('biosphere-ai', 'formulas', NULL, 'external', 1, 2, 'published');
UPDATE pages SET sort_order = 3 WHERE site_id='biosphere-ai' AND slug='packaging';

INSERT OR REPLACE INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (
  (SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='formulas'), 'zh-cn', '配方库',
  '配方库 —— 按剂型、功效、市场翻,看中就报编码',
  '一百条配方规格,写明剂型、关键活性物方向、起订量与打样周期,点进去是完整规格与取样入口。');
INSERT OR REPLACE INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (
  (SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='formulas'), 'en', 'Formulas',
  'Formula library — browse by format, claim and market',
  'One hundred formula specifications with format, active direction, MOQ and sampling time; open one for the full spec and sampling.');
