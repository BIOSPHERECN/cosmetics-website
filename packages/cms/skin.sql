-- AI 肌肤检测记录。
--
-- ⚠ 刻意**不存照片**。人脸在《个人信息保护法》里属于敏感个人信息,
--   存了就要承担存储、加密、留存期限、删除响应的全套义务,而业务上并不需要 ——
--   我们要的是分析结论和它带来的选品线索,不是那张脸。
--   所以照片在内存里用完即弃,库里只留结构化结果。
CREATE TABLE IF NOT EXISTS skin_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'zh-cn',
  -- AI 读出的肤质特征(结构化),不含任何图像数据
  features_json TEXT NOT NULL DEFAULT '{}',
  -- 命中的配方 id 与匹配理由
  matched_json  TEXT,
  -- 给客户看的建议正文
  advice_text   TEXT,
  provider      TEXT,
  model         TEXT,
  ms            INTEGER,
  contact_email TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skin ON skin_sessions(site_id, created_at DESC);
