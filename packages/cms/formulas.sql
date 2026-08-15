-- 配方库 —— AI 共创工作台的地基。
-- 没有这张表,AI 就只是个套壳:客户问什么它编什么,反而砸招牌。
-- 真实配方数据才是竞品抄不走的护城河;AI 的作用是让它可检索、可解释。

CREATE TABLE IF NOT EXISTS formulas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,          -- 内部配方号,如 SR-2401
  category      TEXT NOT NULL,                 -- skincare / makeup / cleansing / oral / body
  format        TEXT NOT NULL,                 -- serum / cream / mask / tube / powder …
  -- 功效标签,多值以逗号分隔(D1 无数组类型;查询用 LIKE,量级几千行足够快)
  benefits      TEXT NOT NULL DEFAULT '',      -- hydrating,brightening,anti-aging …
  -- 关键活性物与浓度区间,供 AI 解释"为什么推荐这条"
  actives_json  TEXT NOT NULL DEFAULT '[]',    -- [{"name":"烟酰胺","pct":"2-5%"}]
  texture       TEXT,                          -- 肤感描述,决定客户满意度的隐性变量
  moq           INTEGER,                       -- 起订量(支/罐)
  cost_band     TEXT,                          -- low / mid / high,不写具体价
  lead_days     INTEGER,                       -- 打样天数
  -- 合规:各市场可否直接申报,避免推荐了却出不了关
  markets       TEXT NOT NULL DEFAULT '',      -- CN,EU,US,JP,ID …
  cert_notes    TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  -- 供 AI 检索的自然语言摘要;由文本模型按上面字段生成一次后存下,避免每次检索都调模型
  ai_summary    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_f_cat ON formulas(category, format, status);
CREATE INDEX IF NOT EXISTS idx_f_moq ON formulas(moq);

-- 共创会话:客户的每一次"说需求→拿方案",全程留痕
-- 既是询盘线索,也是训练下一轮匹配的语料
CREATE TABLE IF NOT EXISTS studio_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  raw_input     TEXT NOT NULL,                 -- 客户原话,一字不改地存
  parsed_json   TEXT,                          -- AI 解析出的结构化需求
  matched_json  TEXT,                          -- 命中的配方 id 与匹配理由
  copy_text     TEXT,                          -- 生成的卖点文案
  image_urls    TEXT,                          -- 生成的包装图
  video_url     TEXT,
  contact_email TEXT,                          -- 留了邮箱才算线索
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ss ON studio_sessions(site_id, created_at DESC);
