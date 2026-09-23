-- 0108 历史产品暂存表(2026-09-23,B2 导入管道 tools/b2o-products/)
--
-- 创始人要导入大量过去的产品。这些数据又杂又没审过,还带客户名、成本、配方比例,
-- 不能直接进 products(前台四处直接读它,只靠 status + site_id 过滤)。
-- 所以:先进这张表 → 人工审 → import.py --publish 按白名单拷进 products(仍是 draft)→ 后台上下架。
--
-- 规矩:
--   · 前台代码永不读此表
--   · 敏感字段(配方比例 / 成本 / 客户名称 / 客户品牌 / 内部备注)只进 private_json,发布时不拷
--   · 图片 key 写定不挪:media/legacy/<batch>/<sha1>.webp,审没审只看本表 status;
--     导入时只传 R2 不建 media 行(/media/{id} 是公开的顺序号,未审的图不能先有 id)
--   · 只加法:新表,不改任何已有表
CREATE TABLE IF NOT EXISTS product_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL,
  source_file     TEXT NOT NULL,
  source_row      INTEGER,
  dedup_key       TEXT NOT NULL UNIQUE,          -- 规范化(产品名|剂型|容量),重跑不重复
  status          TEXT NOT NULL DEFAULT 'pending', -- pending 待审 / review 需人工 / approved 已审 / published 已发布
  issues_json     TEXT NOT NULL DEFAULT '[]',
  name_zh         TEXT NOT NULL,
  name_en         TEXT,
  category        TEXT NOT NULL,
  format          TEXT NOT NULL,
  efficacy        TEXT,
  capacity        TEXT,
  packaging       TEXT,
  inci_json       TEXT NOT NULL DEFAULT '[]',
  markets         TEXT,
  launch_year     INTEGER,
  mass_produced   TEXT,
  reorder         TEXT,
  customer_type   TEXT,
  price_band      TEXT,
  skin_feel       TEXT,
  fragrance       TEXT,
  emulsion_system TEXT,
  preservative_system TEXT,
  prod_issues     TEXT,
  solutions       TEXT,
  images_json     TEXT NOT NULL DEFAULT '[]',    -- [{file, r2_key, bytes, width, height}]
  private_json    TEXT NOT NULL DEFAULT '{}',    -- 只后台
  site_id         TEXT,
  product_id      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_staging_batch ON product_staging(batch_id, status);
