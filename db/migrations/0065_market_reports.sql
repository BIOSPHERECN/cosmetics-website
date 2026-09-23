-- 爆款周报:tools/market/report.py 生成,后台 /bohui/market/ 展示
CREATE TABLE IF NOT EXISTS market_reports (date TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'amazon', json TEXT NOT NULL, md TEXT, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, platform));
