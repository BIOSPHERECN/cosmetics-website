-- 0098 开发信发送记录(2026-09-18 公司域名邮箱通了;创始人 15:4x「继续干活」:先出样例给创始人审,他确认后再真发)。
-- 一封一行:草稿由 tools/prospect/outreach-build.py 写入(status='draft'),后台 /bohui/prospects/?tab=outreach 勾选后经 /api/admin/outreach 发出。
-- 发出去的信同时在 mails 表记一条 direction='out'(mail_id 指向它),对方回信由 apps/mail-worker 按 In-Reply-To / References(兜底:发件人邮箱)串回来。
-- step:1 首封 / 2 跟进(第 3–7 天)/ 3 沉默唤醒(第 14 天起)。2、3 先只留结构,首封回复率出来前不发。
CREATE TABLE IF NOT EXISTS outreach_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id   INTEGER NOT NULL,
  contact_email TEXT NOT NULL,
  step          INTEGER NOT NULL DEFAULT 1,
  subject       TEXT,
  body_text     TEXT,
  body_html     TEXT,
  mail_id       INTEGER,                        -- mails 表出站行
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | bounced | replied | unsubscribed
  reply_mail_id INTEGER,                        -- 对方回信在 mails 表的行
  replied_at    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outreach_prospect ON outreach_log(prospect_id, step);
CREATE INDEX IF NOT EXISTS idx_outreach_status   ON outreach_log(status);
CREATE INDEX IF NOT EXISTS idx_outreach_email    ON outreach_log(contact_email);

-- 抑制名单:对方回「unsubscribe / stop / 取消」就进来,发送前必查;退信地址也进来。删行 = 解除。
CREATE TABLE IF NOT EXISTS outreach_suppress (
  email      TEXT PRIMARY KEY,
  reason     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE prospects ADD COLUMN outreach_step INTEGER DEFAULT 0;   -- 已发到第几封(0 = 没发过)
ALTER TABLE prospects ADD COLUMN last_outreach_at TEXT;
