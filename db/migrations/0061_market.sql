-- 市场情报:电商榜单快照(2026-09-16)。创始人:「最好可以生成一个图表展现,有销量走向数据分析」。
-- market_products 一款一条;market_snapshots 每天一条 —— 走向靠快照,不靠回忆。
CREATE TABLE IF NOT EXISTS market_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,            -- amazon-us / shopee-id / tokopedia / sephora …
  pid TEXT NOT NULL,                 -- ASIN / itemid
  title TEXT, brand TEXT, cat TEXT, url TEXT, img TEXT,
  inci TEXT,                         -- 有序成分表(后续从商品页抓)
  claims TEXT, size TEXT, country TEXT,
  first_seen TEXT, last_seen TEXT,
  UNIQUE(platform, pid)
);
CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, platform TEXT NOT NULL, pid TEXT NOT NULL, cat TEXT NOT NULL,
  rank INTEGER, price REAL, currency TEXT, rating REAL, reviews INTEGER, sold TEXT,
  UNIQUE(date, platform, pid, cat)
);
CREATE INDEX IF NOT EXISTS idx_ms_pid ON market_snapshots(platform, pid, date);
CREATE INDEX IF NOT EXISTS idx_ms_cat ON market_snapshots(cat, date, rank);
