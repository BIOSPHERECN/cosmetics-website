-- 爆款原文归档(创始人 2026-09-19 15:3x:「抓取的是原文,进入我们的库,然后自己改写才展现到前端和后台」)
-- 一条产品一行完整原始 JSON(全成分含浓度、功能标签、原文描述、抓取时间),前台/后台只展示改写字段;原文只作改写与重跑的依据。
CREATE TABLE IF NOT EXISTS market_product_raw (
  pid        TEXT PRIMARY KEY,          -- 与 market_products.pid 同(产品 URL)
  raw_json   TEXT NOT NULL,             -- 抓到的整行 JSON 原文
  scraped_at TEXT,                      -- 原文里的抓取时间
  src_file   TEXT,                      -- 来自哪个 jsonl(便于重跑)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
