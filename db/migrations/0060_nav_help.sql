-- 0060(2026-09-09):把五个新板块接进导航。
-- 它们全部 200 已经好几天了,但首页上
-- href="/zh-cn/{faq,compare,guides,cases,about/founder}/" 实测命中 0 ——
-- 只有爬虫进得去,人进不去。建好了不开门。
--
-- 这些 slug 是**文件路由**,不是数据库页。pages 行只用来喂导航:
-- Astro 的静态文件路由优先于 [...path],插了行也不会改变页面由谁渲染。
-- services(138) 与 libraries(139) 一直就是这么做的,照同一套来。
--
-- 结构:新开一个顶层「选型指南」(guides,它本身就是指南索引页),
-- 常见问题 / 选型对比 / 客户场景 挂它下面;创始人挂「关于帛卉」(36)下面。
-- sort_order 5 —— 排在「OEM/ODM 服务」之后、「工厂实力」之前。

DELETE FROM pages WHERE site_id='biosphere-ai'
  AND slug IN ('guides','faq','compare','cases','about/founder');

INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES
  (148, 'biosphere-ai', 'guides',        NULL, 'standard', 1,  5, 'published'),
  (149, 'biosphere-ai', 'faq',            148, 'standard', 1, 10, 'published'),
  (150, 'biosphere-ai', 'compare',        148, 'standard', 1, 20, 'published'),
  (151, 'biosphere-ai', 'cases',          148, 'standard', 1, 30, 'published'),
  (152, 'biosphere-ai', 'about/founder',   36, 'standard', 1, 10, 'published');

INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES
  (148, 'zh-cn', '选型指南', '操作指南',           '从询价到上市,每一步该做什么、卡在哪。'),
  (149, 'zh-cn', '常见问题', '化妆品代工常见问题', '采购最常问的 20 个问题,每条第一句就是答案。'),
  (150, 'zh-cn', '选型对比', '选 A 还是选 B',      '代工模式、包材、产地、材质怎么选,一题一页。'),
  (151, 'zh-cn', '客户场景', '这类需求我们怎么接', '按客户处境走一遍:条件、结论、卡点、时间线。'),
  (152, 'zh-cn', '创始人',   '一株植物的东方使命', '黄光文的时间线:2001 学徒到 2025 AI 智造。'),
  (148, 'en', 'Guides',      'How-to guides',       'From RFQ to launch: what to do at each step and where it stalls.'),
  (149, 'en', 'FAQ',         'Contract manufacturing FAQ', 'The 20 questions buyers ask most, answered in the first line.'),
  (150, 'en', 'Comparisons', 'A or B',              'Sourcing model, packaging, origin, material — one question per page.'),
  (151, 'en', 'Scenarios',   'How we take this on', 'Walked through by buyer situation: conditions, verdict, timeline.'),
  (152, 'en', 'Founder',     'The eastern mission of one plant', 'A checkable timeline from 2001 to 2025.');
