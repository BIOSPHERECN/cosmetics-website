-- CRM v1(2026-09-16):客户 / 联系人 / 机会 / 活动。字段名对齐 WorkBuddy 原型 metadata.ts(account/contact/opportunity),两边 JSON 可互导。
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country TEXT, channel TEXT, type TEXT, website TEXT, annual_volume TEXT, tags TEXT, note TEXT,
  owner_uid INTEGER,                         -- NULL = 公海(没人认领);认领即锁单,别人不能改归属(WorkBuddy admin.ts 的防抢单思路)
  source TEXT, source_id INTEGER,            -- 从哪转来的:inquiry / prospect / manual + 原记录 id
  health INTEGER,                            -- 健康度 0–100(存量分层用,等订单数据)
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_website ON companies(website);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, name TEXT, title TEXT, email TEXT, whatsapp TEXT, lang TEXT, note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'discover',    -- discover 10% / design 25% / sampling 40% / quote 60% / negotiate 80% / won 100 / lost 0
  amount REAL, currency TEXT DEFAULT 'USD', prob INTEGER, close_date TEXT, lost_reason TEXT, competitor TEXT, owner_uid INTEGER,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, deal_id INTEGER, kind TEXT NOT NULL DEFAULT 'note',   -- note / call / email / whatsapp / sample / quote / status / system
  text TEXT NOT NULL, uid INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_company ON activities(company_id, id);
