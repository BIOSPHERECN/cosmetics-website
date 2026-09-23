-- 决策人(2026-09-16 07:00 创始人:「官网信息没价值,要去领英抓相关负责人」)。一家品牌多条;只记姓名、职位、LinkedIn 链接、公司页公开的邮箱;转客户时复制进 contacts。
CREATE TABLE IF NOT EXISTS prospect_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_id INTEGER, brand TEXT NOT NULL, name TEXT NOT NULL, title TEXT, linkedin TEXT, email TEXT, source TEXT, note TEXT,
  created_at TEXT DEFAULT (datetime('now')), UNIQUE(brand, name)
);
CREATE INDEX IF NOT EXISTS idx_pc_prospect ON prospect_contacts(prospect_id);
ALTER TABLE contacts ADD COLUMN linkedin TEXT;
