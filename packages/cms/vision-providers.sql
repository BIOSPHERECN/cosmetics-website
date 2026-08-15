-- 预置「能读图」的国产模型供应商,方便直接贴 key 就用。
--
-- 口径:只收兼容 OpenAI /chat/completions 且支持多模态 content 数组的接口 ——
--       这样接进来不用为每家写一套适配。
-- 全部 enabled=0、api_keys 为空:预置的是**配置**,不是凭据。
--       要用哪家,创始人自己填 key 并启用;不用的就留着,不占任何成本。
-- 模型名会随厂商更新而变,所以后台有「实测:哪几家真能读图」按钮 ——
--       以实测为准,不以这张表为准。

INSERT OR IGNORE INTO providers
  (id, label, base_url, model, vision_model, api_keys, tier, can_image, can_video, can_vision, is_free, enabled)
VALUES
  -- 字节跳动 · 火山方舟(豆包)。创始人提到的豆包就是这家
  ('doubao', '豆包 · 火山方舟', 'https://ark.cn-beijing.volces.com/api/v3',
   'doubao-1.5-pro-32k', 'doubao-1.5-vision-pro', '', 20, 0, 0, 1, 0, 0),

  -- 阿里 · 通义千问(百炼 OpenAI 兼容端点)
  ('qwen', '通义千问 · 阿里百炼', 'https://dashscope.aliyuncs.com/compatible-mode/v1',
   'qwen-plus', 'qwen-vl-max', '', 21, 0, 0, 1, 0, 0),

  -- 腾讯 · 混元
  ('hunyuan', '腾讯混元', 'https://api.hunyuan.cloud.tencent.com/v1',
   'hunyuan-turbos-latest', 'hunyuan-vision', '', 22, 0, 0, 1, 0, 0),

  -- 阶跃星辰 · Step,视觉能力口碑好
  ('stepfun', '阶跃星辰 Step', 'https://api.stepfun.com/v1',
   'step-1-8k', 'step-1v-8k', '', 23, 0, 0, 1, 0, 0),

  -- 百度 · 千帆(文心)
  ('qianfan', '百度千帆 · 文心', 'https://qianfan.baidubce.com/v2',
   'ernie-4.5-turbo-128k', 'ernie-4.5-turbo-vl-32k', '', 24, 0, 0, 1, 0, 0),

  -- MiniMax
  ('minimax', 'MiniMax', 'https://api.minimax.chat/v1',
   'abab6.5s-chat', 'abab6.5s-chat', '', 25, 0, 0, 1, 0, 0);

-- 已有的几家:补上视觉模型名(key 已由创始人配好,填了名字就能读图)
UPDATE providers SET can_vision=1, vision_model='glm-4v-flash'
 WHERE id='zhipu' AND (vision_model IS NULL OR vision_model='');
UPDATE providers SET can_vision=1, vision_model='SenseChat-Vision'
 WHERE id='sensenova' AND (vision_model IS NULL OR vision_model='');
UPDATE providers SET can_vision=1, vision_model='moonshot-v1-8k-vision-preview'
 WHERE id='kimi' AND (vision_model IS NULL OR vision_model='');
UPDATE providers SET can_vision=1, vision_model='Qwen/Qwen2.5-VL-7B-Instruct'
 WHERE id='siliconflow' AND (vision_model IS NULL OR vision_model='');
