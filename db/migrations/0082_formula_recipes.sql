-- 配方明细表(2026-09-17 创始人:「把原有的一些资料拍照导入我们的系统」)。
-- 老配方拍照 → op:ocr mode=recipe 识成表 → 人确认 → op:import_formula 写 formulas 一行(status='imported')+ 这里逐行明细。
-- formulas 只有 actives_json(前 8 味活性物),完整相表在这里;公开页永不读 status='imported' 的 formulas 行,明细自然也不外露。
-- pct 可为 NULL(识不清且人没填时不许入库,接口层 Σpct=100±0.5 兜底;列本身允许 NULL 是给以后区间行留的)。
-- 幂等(IF NOT EXISTS);2026-09-17 已灌线上。
CREATE TABLE IF NOT EXISTS formula_recipes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  formula_id INTEGER NOT NULL,                  -- formulas.id
  phase      TEXT NOT NULL DEFAULT '',          -- 相:A 水相 / B 油相 …
  seq        INTEGER NOT NULL,                  -- 表内行序(1 起)
  name       TEXT NOT NULL DEFAULT '',          -- 原料名(中文 / 商品名)
  inci       TEXT NOT NULL DEFAULT '',          -- INCI 名,大写
  pct        REAL,                              -- 质量百分比
  purpose    TEXT NOT NULL DEFAULT '',          -- 用途
  source     TEXT NOT NULL DEFAULT 'ocr',       -- ocr | manual
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_frecipes_f ON formula_recipes(formula_id, seq);
