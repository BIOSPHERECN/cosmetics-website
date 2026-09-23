-- 邮件防护(创始人 2026-09-18 17:3x:「万一别人用大附件炸我们,R2 费用就爆了!一定要先审核,确认是我们的才可以接收」)
-- mail_trust:发件人白名单(邮箱或 @域名);mails.trust:trusted | unknown | spam;mail_quota:每日附件落 R2 的字节数,封顶。
CREATE TABLE IF NOT EXISTS mail_trust (
  pattern    TEXT PRIMARY KEY,           -- 小写:完整邮箱 a@b.com 或域名 @b.com
  level      TEXT NOT NULL DEFAULT 'trusted',   -- trusted | blocked
  note       TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mail_quota (
  day   TEXT PRIMARY KEY,               -- UTC 日期 YYYY-MM-DD
  bytes INTEGER NOT NULL DEFAULT 0,     -- 当日附件 + html 落 R2 的字节
  mails INTEGER NOT NULL DEFAULT 0      -- 当日入库封数(同一发件人轰炸也计)
);
ALTER TABLE mails ADD COLUMN trust TEXT;   -- trusted | unknown | spam;NULL = 0099 之前的老行
CREATE INDEX IF NOT EXISTS idx_mails_trust ON mails(trust, received_at);
