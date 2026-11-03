-- 0093 爆款情报分析(2026-09-18 创始人:「爆款收集的不要忘记生成了!那是重要的情报分析」)
-- 一行 = 一周 × 一个市场 × 一个品类 的情报:stats_json 纯 SQL 统计(可复核),report_json 模型按统计写的结论,report_md 打印用。
-- period 用 ISO 周(YYYY-Www);UNIQUE 让 tools/market/intel-build.py 重跑同周直接 INSERT OR REPLACE,不堆重复行。
-- 铁令:出现频率不是销量 —— 统计只有款数/占比,不进销量字段。
CREATE TABLE IF NOT EXISTS market_intel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,          -- YYYY-Www
  market TEXT NOT NULL,          -- all / kr / jp / eu / us / gl
  category TEXT NOT NULL,        -- all / cat_zh
  stats_json TEXT,
  report_md TEXT,
  report_json TEXT,
  n_products INTEGER,
  model TEXT,                    -- 写报告的供应商 id(providers.id)
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period, market, category)
);
CREATE INDEX IF NOT EXISTS idx_market_intel_period ON market_intel(period);
