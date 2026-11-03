-- 2026-09-24 D04:公司库补「成分 × 市场法规状态」,数据从平台库整表同步(skin2oem/tools/platform/sync-ims-company.py)。
-- 结构与平台库 0129 相同,只多一列 fact_key:
--   inci_key 保持平台原样(入库期口径:upper/空白/全半角/去不可见,保留标点括号 —— 化学名的核心常在括号里,不能去);
--   fact_key = decoder.ts factKey(inci_key)(查询期口径:去括号内容、去脚注符),把「SPIRONOLACTONE」「SPIRONOLACTONE (INN)」这类同名多写法并到一个键上。
-- 成分页查法规状态请用 WHERE fact_key IN (?, ?),不要用 inci_key —— 否则带 (INN)、括号别名的那 2,944 行永远查不到。
CREATE TABLE IF NOT EXISTS ingredient_market_status (
  inci_key TEXT NOT NULL,
  market TEXT NOT NULL,            -- ISO2,或区域码 ASEAN/MERCOSUR/GSO/EAEU/EU/CAN
  status TEXT NOT NULL,            -- prohibited / restricted / permitted / listed
  sub_type TEXT,
  max_pct REAL,
  max_pct_rinse REAL,
  conditions TEXT,                 -- 条件原文,不改写不翻译
  annex TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  evidence_level TEXT NOT NULL DEFAULT 'C',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  fact_key TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (inci_key, market, source)
);
CREATE INDEX IF NOT EXISTS idx_ims_market ON ingredient_market_status (market, status);
CREATE INDEX IF NOT EXISTS idx_ims_fact ON ingredient_market_status (fact_key);

CREATE TABLE IF NOT EXISTS markets_meta (
  market TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  bloc TEXT,
  name_zh TEXT, name_en TEXT,
  authority TEXT,
  framework TEXT,
  official_url TEXT,
  sort_order INTEGER DEFAULT 100
);
