-- 询盘漏斗事件（P0-5）。只新增这张表，不改 inquiries 的列，也不改公开入库那句 INSERT。
-- 同一条线索的同一个节点只记一次：唯一键是 (site_id, inquiry_id, dedupe_key)。
-- inquiry_id 就是对外的 ticket_id（提交接口返回的那个数）。
--
-- 列和验收说法的对应：
--   source            来源渠道（rfq / sample / form …）
--   source_path       来源页面路径
--   market            市场（国家或城市）
--   product_id        产品编号
--   cta               按钮（询盘 / 申请样品 / 开发同款，或 sample / quote / docs）
--   intent            意图，和按钮分列存放
--   saved_at          入库时间（等于 inquiries.created_at）
--   assignee_uid      负责人用户编号（邮箱不存这张表，查询时再去 users 补）
--   followup_status   这一下发生时的跟进状态（inquiries.status）
--   event             节点名：cta / saved / dedupe / assign / accept / followup / status
--   created_at        这一下写入的时间
--
-- 不存客户邮箱、姓名、电话、正文。
-- 回滚：停用读这张表的代码即可。旧线索行仍在 inquiries。
CREATE TABLE IF NOT EXISTS inquiry_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id      INTEGER NOT NULL,
  site_id         TEXT NOT NULL,
  event           TEXT NOT NULL,
  dedupe_key      TEXT NOT NULL,
  source          TEXT,
  source_path     TEXT,
  market          TEXT,
  product_id      TEXT,
  cta             TEXT,
  intent          TEXT,
  saved_at        TEXT,
  assignee_uid    INTEGER,
  followup_status TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiry_events_dedupe
  ON inquiry_events(site_id, inquiry_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_inquiry_events_ticket
  ON inquiry_events(site_id, inquiry_id, id);
