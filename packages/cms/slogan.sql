-- 品牌口号:一株植物的东方使命
--
-- 放三个位置,都是品牌最先被看见的地方:
--   ① 首屏标题 —— 全站最大的一行字,口号就该在这
--   ② 页脚陈述句 —— 访客滚到底最后记住的一句
--   ③ 报头定位语 —— 每一页顶部都带着
--
-- 原来的「从一株药材到一支成品」降为导语:它是对口号的解释,不是口号本身。
-- 英文是直译,创始人若有定稿版本在后台改一处即可(三处都读同一份内容)。

-- ① 首屏
UPDATE block_i18n
   SET data_json = json_set(data_json,
       '$.eyebrow', 'BOHUI · 帛卉集团',
       '$.title',   '一株植物的东方使命',
       '$.lead',    '从一株药材到一支成品。东方草本与巴西雨林草本两条原料线,种植端与制造端同属一个体系。')
 WHERE lang = 'zh-cn'
   AND block_id IN (SELECT id FROM blocks WHERE type = 'banner');

UPDATE block_i18n
   SET data_json = json_set(data_json,
       '$.eyebrow', 'BOHUI GROUP',
       '$.title',   'One plant. An Eastern mission.',
       '$.lead',    'From the plant to the finished unit. Eastern herbs and Brazilian rainforest botanicals — cultivation and manufacturing inside one system.')
 WHERE lang = 'en'
   AND block_id IN (SELECT id FROM blocks WHERE type = 'banner');

-- ② 页脚陈述句 + ③ 报头定位语(都读 site_i18n.tagline)
UPDATE site_i18n SET tagline = '一株植物的东方使命' WHERE lang = 'zh-cn';
UPDATE site_i18n SET tagline = 'One plant. An Eastern mission.' WHERE lang = 'en';
UPDATE site_i18n SET tagline = '一つの植物、東方の使命。' WHERE lang = 'ja';
