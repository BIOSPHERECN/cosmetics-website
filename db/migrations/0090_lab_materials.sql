-- 0090 原料库(2026-09-18 创始人:「还有要可以改配方的原料,多选原料和价格」「晚点资料就会导入」)
-- 价格只认导入或人工填,不编(09-17:「原料价格:明天看看资料库应该是有的,没有就需要另外安排人维护」)
-- inci_key = factKey(inci 第一个成分),与 ingredient_facts 同口径;复配原料 inci 存整串
CREATE TABLE IF NOT EXISTS lab_materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT,                       -- 物料编码(导入表若有);按它合并
  name_zh     TEXT NOT NULL,
  trade_name  TEXT,                       -- 牌号 / 商品名
  inci        TEXT NOT NULL,
  inci_key    TEXT,
  supplier    TEXT,
  cas         TEXT,
  function_zh TEXT,
  use_min     REAL,
  use_max     REAL,
  price       REAL,                       -- 空 = 待导入,页面显示「无价」,不编
  price_unit  TEXT DEFAULT 'CNY/kg',
  price_at    TEXT,                       -- 报价日期
  moq         TEXT,
  lead_days   INTEGER,
  origin      TEXT,
  tags        TEXT DEFAULT '[]',
  note        TEXT,
  status      TEXT DEFAULT 'active',      -- active | off(不物理删)
  updated_by  TEXT,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lab_materials_key    ON lab_materials(inci_key);
CREATE INDEX IF NOT EXISTS idx_lab_materials_name   ON lab_materials(name_zh);
CREATE INDEX IF NOT EXISTS idx_lab_materials_status ON lab_materials(status);
