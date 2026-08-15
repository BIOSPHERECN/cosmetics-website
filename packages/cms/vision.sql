-- 视觉能力位。
-- 「看图」与「出图」是两种能力,之前只记了 can_image(出图),
-- 结果后台看不出哪家能做肌肤检测。而且同一家的视觉模型往往和文本模型不是同一个
-- (智谱 glm-4-flash 是文本、glm-4v-flash 才看图),所以视觉模型名要单独存。
ALTER TABLE providers ADD COLUMN can_vision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE providers ADD COLUMN vision_model TEXT;

-- 已知支持视觉的几家,预填模型名(key 由创始人自己填,这里不碰 key)
UPDATE providers SET can_vision=1, vision_model='glm-4v-flash'          WHERE id='zhipu';
UPDATE providers SET can_vision=1, vision_model='SenseChat-Vision'      WHERE id='sensenova';
UPDATE providers SET can_vision=1, vision_model='moonshot-v1-8k-vision-preview' WHERE id='kimi';
UPDATE providers SET can_vision=1, vision_model='Qwen/Qwen2.5-VL-7B-Instruct'   WHERE id='siliconflow';
