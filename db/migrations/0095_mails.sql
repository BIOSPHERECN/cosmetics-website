-- 0095 域名邮箱 · 后台邮件中心(2026-09-18 创始人:「先搭建在我们的后台,客户邮件统一在后台可以看到,并有提醒,避免错过」)
-- 收信:Cloudflare Email Routing → 独立 Email Worker(apps/mail-worker,名字 bohui-mail)解析后写本表,附件与原始 HTML 进 R2 mail/<message_id>/…
-- 发信:后台回信走 Resend,出站也记本表(direction='out'),同一 thread_id 串成一条线。
-- 正文 text 直接存库(截 200KB);html 只存 R2 键 —— 营销邮件的 HTML 动辄几百 KB,塞进 D1 行会把列表查询拖慢。
CREATE TABLE IF NOT EXISTS mails (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  direction        TEXT NOT NULL DEFAULT 'in',        -- in | out
  message_id       TEXT UNIQUE,                        -- RFC 5322 Message-ID,去重键(Email Routing 偶发重投)
  thread_id        TEXT,                               -- 会话线:首封 = 自己的 message_id;回信 = In-Reply-To / References 里最早那个
  from_addr        TEXT,
  from_name        TEXT,
  to_addrs         TEXT,                               -- 逗号分隔
  cc               TEXT,
  subject          TEXT,
  text             TEXT,                               -- 纯文本正文(无 text/plain 时由 html 剥标签得到)
  html_key         TEXT,                               -- R2 键:mail/<message_id>/body.html;后台经 sanitize 后 iframe sandbox 展示
  snippet          TEXT,                               -- 列表摘要,正文前 160 字
  attachments_json TEXT,                               -- [{name,size,r2_key,type}]
  received_at      TEXT,                               -- 收到 / 发出时间(UTC,ISO)
  spf              TEXT,                               -- pass / fail / none …(Authentication-Results 头里取)
  dkim             TEXT,
  spam_score       REAL,                               -- 0–100,简单规则:SPF 失败 +40、DKIM 失败 +20、群发关键词 +20、附件可执行 +40
  status           TEXT NOT NULL DEFAULT 'unread',     -- unread | read | replied | archived | spam
  assignee_uid     INTEGER,                            -- users.id;NULL = 没人认领
  inquiry_id       INTEGER,                            -- 「转为询盘」后回填
  matter_id        INTEGER,                            -- 「转为事项」(matters 表由别的任务在建)
  company_id       INTEGER,                            -- CRM 客户:按发件人邮箱在 contacts 里匹配
  ai_category      TEXT,                               -- 询盘 | 报价 | 样品 | 投诉 | 供应商 | 垃圾 | 其他
  ai_summary       TEXT,                               -- ≤60 字中文
  ai_reply         TEXT,                               -- 建议回复(对方语言),业务员可改后发
  replied_at       TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mails_status   ON mails (status);
CREATE INDEX IF NOT EXISTS idx_mails_received ON mails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mails_from     ON mails (from_addr);
CREATE INDEX IF NOT EXISTS idx_mails_thread   ON mails (thread_id);
