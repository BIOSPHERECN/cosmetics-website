-- CRM v1.5(2026-09-16 06:55):报价单、寄样、存量客户分层字段。字段名对齐 WorkBuddy 原型的 quote 对象;成本 / 毛利只给 admin 看(字段级脱敏)。
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, deal_id INTEGER, code TEXT, currency TEXT DEFAULT 'USD',
  lines_json TEXT NOT NULL,                 -- [{name, qty, unit_price, cost}] 行项目;cost 只 admin 可见
  subtotal REAL, cost_total REAL, margin REAL, valid_until TEXT, status TEXT DEFAULT 'draft',   -- draft / sent / accepted / rejected / expired
  note TEXT, uid INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, deal_id INTEGER, items TEXT NOT NULL, sent_at TEXT, carrier TEXT, tracking TEXT,
  feedback_due TEXT, feedback TEXT, status TEXT DEFAULT 'sent',   -- sent / received / feedback / no-response
  uid INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_samples_company ON samples(company_id);
ALTER TABLE companies ADD COLUMN last_order_at TEXT;
ALTER TABLE companies ADD COLUMN orders_12m INTEGER;
ALTER TABLE companies ADD COLUMN amount_12m REAL;
ALTER TABLE companies ADD COLUMN tier TEXT;      -- 存量分层:A 核心 / B 活跃 / C 沉睡 / D 流失(tools/crm/import_customers.py 按 RFM 算)
