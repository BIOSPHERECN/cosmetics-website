-- 超大首屏 banner 版块。
-- image 留空 —— 组件会显示「此处需要一张首屏大图」并给出媒体库入口,
-- 而不是塞一张假图装作做完了。创始人在后台点「选择图片」即可换。
INSERT INTO blocks (page_id, type, sort_order, is_visible)
SELECT p.id, 'banner', -1, 1
  FROM pages p
 WHERE p.slug = ''
   AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.page_id = p.id AND b.type = 'banner');

INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'zh-cn', json('{
  "image": "",
  "imageAlt": "",
  "eyebrow": "草本匠心 · AI 赋能",
  "title": "从一株药材到一支成品",
  "lead": "东方草本与巴西雨林草本两条原料线,从种植端到成品端同属一个体系。",
  "ctaPrimary": "发起询盘",
  "ctaSecondary": "看可做剂型",
  "height": "82vh"
}')
  FROM blocks b WHERE b.type = 'banner'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'zh-cn');

INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'en', json('{
  "image": "",
  "imageAlt": "",
  "eyebrow": "Herbal craft · AI-enabled",
  "title": "From the plant to the finished unit",
  "lead": "Two botanical lines — Eastern herbs and Brazilian rainforest — cultivation and manufacturing inside one system.",
  "ctaPrimary": "Start an inquiry",
  "ctaSecondary": "See what we make",
  "height": "82vh"
}')
  FROM blocks b WHERE b.type = 'banner'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'en');

-- 大 banner 顶掉原来的首屏与叙事阶段:一个首屏就够,两个是打架
UPDATE blocks SET is_visible = 0
 WHERE type IN ('hero', 'stages')
   AND page_id IN (SELECT id FROM pages WHERE slug = '');
-- 复刻版恢复原有的品类矩阵与服务流程(对应原站的分类区与生态区)
UPDATE blocks SET is_visible = 1
 WHERE type IN ('matrix', 'process')
   AND page_id IN (SELECT id FROM pages WHERE slug = '');
