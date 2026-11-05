-- RFQ 真闭环：去重键、测试标记、指派、接单、跟进。
-- 测试线索 is_test=1 不得转入 companies（有效客户）。
-- 通知失败只写 notify_error / assignee_notify_error，不删 inquiries 行。
-- 回滚：不删列（SQLite 不能安全 DROP COLUMN 而不重建表）。新代码不读这些列时旧行仍在。
ALTER TABLE inquiries ADD COLUMN dedupe_key TEXT;
ALTER TABLE inquiries ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inquiries ADD COLUMN assignee_uid INTEGER;
ALTER TABLE inquiries ADD COLUMN assigned_at TEXT;
ALTER TABLE inquiries ADD COLUMN assignee_notified_at TEXT;
ALTER TABLE inquiries ADD COLUMN assignee_notify_error TEXT;
ALTER TABLE inquiries ADD COLUMN accepted_at TEXT;
ALTER TABLE inquiries ADD COLUMN accepted_by INTEGER;
ALTER TABLE inquiries ADD COLUMN followup_text TEXT;
ALTER TABLE inquiries ADD COLUMN followup_at TEXT;
ALTER TABLE inquiries ADD COLUMN notify_error TEXT;

CREATE INDEX IF NOT EXISTS idx_inquiries_dedupe ON inquiries(site_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_inquiries_accept ON inquiries(site_id, accepted_at);

-- 线上已有此表（对话流）。仓库迁移里原先没有 CREATE，这里补一份，已存在则不动。
CREATE TABLE IF NOT EXISTS inquiry_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL,
  user_id    INTEGER,
  kind       TEXT NOT NULL DEFAULT 'note',
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inq ON inquiry_notes(inquiry_id, id);
