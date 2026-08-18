-- 接上演示用 banner 图。
-- 图是 CC0 / 公有领域(可商用免署名),来源与授权已随图入库备查。
-- 创始人给真图后在后台「页面与版块 → 超大首屏图 → 选择图片」换掉即可。
UPDATE block_i18n
   SET data_json = json_set(data_json,
       '$.image', '/media/3',
       '$.imageAlt', '面部护肤主题演示图(CC0,待替换为实拍)')
 WHERE block_id IN (SELECT id FROM blocks WHERE type = 'banner')
   AND lang = 'zh-cn';

UPDATE block_i18n
   SET data_json = json_set(data_json,
       '$.image', '/media/3',
       '$.imageAlt', 'Demo image (CC0) — to be replaced with our own photography')
 WHERE block_id IN (SELECT id FROM blocks WHERE type = 'banner')
   AND lang = 'en';
