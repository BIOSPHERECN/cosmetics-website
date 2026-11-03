-- 0019(2026-09-03):鹰眼情报系统。
-- 分四张表,对应情报的四个阶段:源 → 长报告(投喂)→ 切片 → 结构化条目。
-- 采集与分析全部跑 GitHub Actions(Worker 免费档单次只有 50 子请求,自己抓必死);
-- 网站端只做三件事:发派工单、收结构化结果、给人看。

-- ① 情报源登记册:采什么、怎么采、上次采得怎么样
CREATE TABLE IF NOT EXISTS intel_sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'rss',        -- rss/html-list/json-api/official-db/search-query/sitemap
  parser      TEXT NOT NULL DEFAULT 'rss',        -- rss/list-detail/json/browser(browser-use 攻坚)/search
  intel_type  TEXT NOT NULL,                      -- 新品爆款/成分动向/法规变动/备案数据/电商榜单/展会采购/同行动态/原料价格
  market      TEXT NOT NULL DEFAULT 'GLOBAL',
  lang        TEXT NOT NULL DEFAULT 'en',
  cadence     TEXT NOT NULL DEFAULT 'daily',      -- daily/weekly/monthly
  parse_hint  TEXT,                               -- 给采集器的实现要点
  robots_ok   INTEGER NOT NULL DEFAULT 1,
  js_required INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_ok_at  TEXT,
  last_note   TEXT,                               -- 上次跑的结果/错误,后台一眼看出哪条源哑了
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_intel_sources_run ON intel_sources(enabled, cadence, last_run_at);

-- ② 长报告投喂口:marvis 每天那种几万字的南美爆款报告直接倒进来
CREATE TABLE IF NOT EXISTS intel_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  origin      TEXT NOT NULL DEFAULT 'manual',     -- marvis/manual/crawler
  market      TEXT NOT NULL DEFAULT 'LATAM',
  report_date TEXT,                               -- 报告自身的日期,不是入库日
  source_url  TEXT,
  chars       INTEGER NOT NULL DEFAULT 0,
  raw_text    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',    -- pending → chunked → done
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ③ 切片:几万字一次喂不进模型,按段切开逐块抽取
CREATE TABLE IF NOT EXISTS intel_chunks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES intel_reports(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',     -- pending → done/failed
  attempts   INTEGER NOT NULL DEFAULT 0,
  leased_at  TEXT,                                -- 领单租约,工人被杀掉后 20 分钟自动回队
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_intel_chunks_q ON intel_chunks(status, report_id, seq);

-- ④ 结构化情报条目:鹰眼的最终产物,选品台的爆款证据从这里升上去
CREATE TABLE IF NOT EXISTS intel_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER REFERENCES intel_sources(id) ON DELETE SET NULL,
  report_id     INTEGER REFERENCES intel_reports(id) ON DELETE SET NULL,
  intel_type    TEXT NOT NULL DEFAULT '新品爆款',
  market        TEXT NOT NULL DEFAULT 'GLOBAL',
  category      TEXT,
  brand         TEXT,
  product_name  TEXT,
  title_zh      TEXT NOT NULL,
  summary_zh    TEXT,
  claims        TEXT,                             -- 卖点/宣称,逗号分隔
  ingredients   TEXT,                             -- 点名的成分,逗号分隔
  price_band    TEXT,
  claim_tag     TEXT,                             -- 与 trends.claim_tag / formulas.trend_tags 对齐
  source_name   TEXT NOT NULL,
  source_url    TEXT,
  published_at  TEXT,                             -- 情报自身日期;没有可信日期的不收(铁令)
  confidence    TEXT NOT NULL DEFAULT '中',
  factory_note  TEXT,                             -- 对工厂意味着什么:该备什么配方/包材/资质
  dedupe_hash   TEXT UNIQUE,                      -- 同一条情报多源重复时挡在门外
  status        TEXT NOT NULL DEFAULT 'new',      -- new → promoted(升到 trends)/ dropped
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_intel_items_q ON intel_items(status, intel_type, market, published_at);
