-- 0048(2026-09-07):导航项改回「包材库」。
-- 0043 把它改成「产品库」当作三个库的父项,但创始人找不到 ——
-- 他嘴里那个东西就叫包材库,导航上写别的名字等于藏起来。
-- 链路四段在页面顶上的链路条里已经摆清楚了,导航不必再承担分组说明的职责。
UPDATE page_i18n SET nav_label='包材库'
 WHERE lang='zh-cn' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging');
UPDATE page_i18n SET nav_label='Packaging'
 WHERE lang='en' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging');
