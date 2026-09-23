-- 0107(原 0105,与 0105_b2o 撞号后改名,已在公司库执行过,内容未变)开发信发送闸门(2026-09-23 A6)。吸收外贸获客 Agent 开源项目的五条机制,按帛卉的表重做:
--   ① 联系人有效性校验:outreach_contact_check,一邮箱一行;只有 valid 能进审批与发送(tools/prospect/contact_check.py 写,后台可人工确认)
--   ② 三段独立审批:调研(prospects.research_ok_*)→ 文案(outreach_log.approved_*)→ 发送(管理员点「真发」,进 outbox)
--   ③ 发前二次校验:联系人状态 / ICP 分 / 草稿版本(approved_hash)/ 邮箱有效 + MX 实时复查 / 当日剩余额度,任何一条不过就不发
--   ④ 事务 outbox + 幂等键:同一收件邮箱同一封序号、同一品牌同一封序号,一辈子只进一次发件箱;先领租约再发,发到一半断掉的记 unknown 永不自动重发
--   ⑤ 发送后回查:只有拿到服务商回执 id 才记 sent;没回执记 unknown(不当已发、也不重发)
ALTER TABLE prospects ADD COLUMN needs_review INTEGER DEFAULT 0;   -- 1 = 官网 / 品牌名对不上,人工复核前不出开发信、不发
ALTER TABLE prospects ADD COLUMN review_note TEXT;                 -- 复核证据(旧域名、为什么判错、查到了什么)
ALTER TABLE prospects ADD COLUMN research_ok_at TEXT;              -- ① 调研审批:官网 / 品牌名 / ICP 理由人看过
ALTER TABLE prospects ADD COLUMN research_ok_by TEXT;

ALTER TABLE outreach_log ADD COLUMN approved_at TEXT;              -- ② 文案审批
ALTER TABLE outreach_log ADD COLUMN approved_by TEXT;
ALTER TABLE outreach_log ADD COLUMN approved_hash TEXT;            -- 审批时 收件人 + 主题 + 正文 + 调研关键字段 的 sha256;发前重算对不上 = 草稿或调研变过,要重审

CREATE TABLE IF NOT EXISTS outreach_contact_check (
  email      TEXT PRIMARY KEY,                 -- 小写
  status     TEXT NOT NULL,                    -- valid | risky | invalid
  reason     TEXT,                             -- 证据:MX、域名对得上官网 / 官网页面上出现过这个地址 / 人工确认
  checked_by TEXT,                             -- contact_check.py 或 后台账号邮箱
  checked_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  outreach_id  INTEGER NOT NULL,
  idem_key     TEXT NOT NULL UNIQUE,           -- 小写收件邮箱#封序号:同一邮箱的第 1 封只可能发一次
  brand_key    TEXT NOT NULL,                  -- 品牌归一键:SOMETHINC 三条线索、两个邮箱,也只发一封
  step         INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | unknown | failed
  approved_by  TEXT,                           -- ③ 发送审批人
  lease_until  TEXT,
  provider_id  TEXT,                           -- 服务商回执 messageId
  via          TEXT,
  error        TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  sent_at      TEXT,
  UNIQUE (brand_key, step)
);
CREATE INDEX IF NOT EXISTS idx_outbox_day ON outreach_outbox(created_at, status);
