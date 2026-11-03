-- AI 获客名单(2026-09-16):榜单挖品牌 → Brave 解析官网 → crawl4ai 背调 → 模型 ICP 评分 + 定制开发信。
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL, website TEXT NOT NULL UNIQUE, market TEXT, country TEXT, company TEXT,
  segment TEXT, categories TEXT, positioning TEXT, channels TEXT, scale_signals TEXT, mfg_signal TEXT, expansion_signal TEXT,
  contact_channels TEXT, icp_score INTEGER, icp_reason TEXT, hook TEXT,
  email_subject TEXT, email_body TEXT, next_step TEXT,
  source TEXT, model TEXT, status TEXT DEFAULT 'new',   -- new / sent / replied / meeting / quoted / won / lost / skip
  in_brand_leads INTEGER DEFAULT 0, note TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(icp_score DESC);
