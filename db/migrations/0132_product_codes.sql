-- 产品一码一物。消费者凭码查真伪：第一次查询为正品，再次查询只告警次数。
-- 不改 inquiries，也不改询盘漏斗事件表。
-- code 唯一。status 只允许 unused（未拆封）、activated（已有人查过）、void（作废）。
-- code_scans 只存哈希，不存原始 IP 或 User-Agent。
-- 回滚：停用读这两张表的页面和接口即可。已写入的码与查询记录仍在。
CREATE TABLE IF NOT EXISTS product_codes (
  code         TEXT NOT NULL UNIQUE,
  sku          TEXT,
  batch        TEXT,
  status       TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'activated', 'void')),
  activated_at TEXT
);

CREATE TABLE IF NOT EXISTS code_scans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash    TEXT,
  ua_hash    TEXT
);
CREATE INDEX IF NOT EXISTS idx_code_scans_code ON code_scans(code, id);
