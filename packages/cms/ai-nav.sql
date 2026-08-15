-- 把 AI 肌肤检测与 AI 共创接进各站导航。
--
-- 这两页是独立的静态路由(src/pages/[lang]/skin.astro、studio.astro),
-- 不由数据库渲染。但导航是从 pages 表生成的 ——
-- 所以这里只建「导航条目」,页面内容仍由那两个路由负责。
-- Astro 的路由优先级会让 /zh-cn/skin/ 命中静态路由而不是通配路由,不会冲突。
--
-- 放在 products 之后、contact 之前:先看能做什么,再用 AI 试,最后询盘。

INSERT INTO pages (site_id, slug, template, in_nav, sort_order, status)
SELECT s.id, 'skin', 'external', 1, 60, 'published'
  FROM sites s
 WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.site_id = s.id AND p.slug = 'skin');

INSERT INTO pages (site_id, slug, template, in_nav, sort_order, status)
SELECT s.id, 'studio', 'external', 1, 61, 'published'
  FROM sites s
 WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.site_id = s.id AND p.slug = 'studio');

INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
SELECT p.id, 'zh-cn', 'AI 肌肤检测', 'AI 肌肤检测', '拍一张照片,读出肌肤外观特征并匹配可打样的配方。'
  FROM pages p WHERE p.slug = 'skin'
   AND NOT EXISTS (SELECT 1 FROM page_i18n i WHERE i.page_id = p.id AND i.lang = 'zh-cn');

INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
SELECT p.id, 'en', 'AI Skin Reading', 'AI Skin Reading', 'One photo, visible skin traits read and matched to formulas you can sample.'
  FROM pages p WHERE p.slug = 'skin'
   AND NOT EXISTS (SELECT 1 FROM page_i18n i WHERE i.page_id = p.id AND i.lang = 'en');

INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
SELECT p.id, 'zh-cn', 'AI 共创', 'AI 共创工作台', '一句话说需求,当场拿到可打样的配方方案。'
  FROM pages p WHERE p.slug = 'studio'
   AND NOT EXISTS (SELECT 1 FROM page_i18n i WHERE i.page_id = p.id AND i.lang = 'zh-cn');

INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
SELECT p.id, 'en', 'AI Co-Creation', 'AI Co-Creation Studio', 'Describe it in one sentence, get a formula plan you can sample.'
  FROM pages p WHERE p.slug = 'studio'
   AND NOT EXISTS (SELECT 1 FROM page_i18n i WHERE i.page_id = p.id AND i.lang = 'en');
