-- 模型供应商 —— 后台可自行增删改,不必改代码重部署。
-- 这是「驾驭模型」与「锁死模型」的分界线:换一家、加一家、调档位,都在界面上完成。
CREATE TABLE IF NOT EXISTS providers (
  id            TEXT PRIMARY KEY,              -- cerebras / nvidia / agnes …
  label         TEXT NOT NULL,
  base_url      TEXT NOT NULL,                 -- 已含 /v1 的完整前缀
  model         TEXT NOT NULL,
  -- key 池,逗号分隔多个;单 key 限流时轮询到下一个
  api_keys      TEXT NOT NULL DEFAULT '',
  tier          INTEGER NOT NULL DEFAULT 10,   -- 数字小的先用
  can_text      INTEGER NOT NULL DEFAULT 1,
  can_image     INTEGER NOT NULL DEFAULT 0,
  can_video     INTEGER NOT NULL DEFAULT 0,
  is_free       INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,    -- 临时停用不必删,保留配置
  -- 最近一次体检结果,便于一眼看出谁在扛量谁挂了
  last_ok       INTEGER,
  last_ms       INTEGER,
  last_note     TEXT,
  last_check_at TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prov ON providers(enabled, tier);

-- 预置免费池六家(以创始人核定真源为准;讯飞不在池内,已退役)。
-- api_keys 留空 —— 由创始人在后台填,不预置任何凭据。
INSERT OR IGNORE INTO providers (id,label,base_url,model,tier,can_image,can_video,is_free) VALUES
 ('cerebras',   'Cerebras',   'https://api.cerebras.ai/v1',                  'llama-3.3-70b',              1,0,0,1),
 ('nvidia',     'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1',         'meta/llama-3.3-70b-instruct',2,0,0,1),
 ('siliconflow','硅基流动',    'https://api.siliconflow.cn/v1',               'Qwen/Qwen2.5-72B-Instruct',  3,0,0,1),
 ('zhipu',      '智谱 GLM',    'https://open.bigmodel.cn/api/paas/v4',        'glm-4-flash',                4,0,0,1),
 ('sensenova',  '商汤日日新',  'https://api.sensenova.cn/compatible-mode/v1', 'SenseChat-5',                5,0,0,1),
 ('agnes',      'Agnes AI',   'https://apihub.agnes-ai.com/v1',              'agnes-2.0-flash',            6,1,1,1);
