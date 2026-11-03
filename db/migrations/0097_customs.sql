-- 0097 海关数据情报(2026-09-18 创始人 13:5x:「出口单据把买家暴露给整条供应链,这对我们获客是好事,抓紧进入情报系统」)。
-- 来源只有两种:① 公开提单页(ImportYeti,人工浏览保存 → tools/prospect/customs-importyeti.py 解析;条款禁脚本抓取)
--               ② UN Comtrade 国家级统计(tools/prospect/customs-comtrade.py)。
-- 只存公司级字段;个人手机 / 私人邮箱一律不进库。source_url + captured_at 是溯源,每行必填。
CREATE TABLE IF NOT EXISTS customs_buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, country TEXT NOT NULL, city TEXT, website TEXT,
  hs_codes TEXT,                       -- JSON 数组,页面 HTS 表里出现过的码,如 ["3304.99.0029","3401.30.0090"]
  first_seen TEXT, last_seen TEXT,     -- YYYY-MM-DD,最早 / 最近一次出货
  shipments_12m INTEGER, shipments_36m INTEGER, weight_kg_12m REAL,
  top_suppliers_json TEXT,             -- [{name,country,shipments_12m,shipments}] 按累计出货排,最多 5 家
  top_origins_json TEXT,               -- [{country,shipments}]
  products_json TEXT,                  -- 产品描述样本(去重,≤12 条)
  source TEXT, source_url TEXT, captured_at TEXT,
  icp_score INTEGER, icp_reason TEXT,  -- tools/prospect/customs-score.py 的规则分;NULL = 还没打
  prospect_id INTEGER,                 -- ≥60 自动进 prospects 后回填
  status TEXT DEFAULT 'new',           -- new / pushed(已进线索) / skip
  UNIQUE(name, country)
);
CREATE INDEX IF NOT EXISTS idx_customs_buyers_score ON customs_buyers(icp_score DESC);

CREATE TABLE IF NOT EXISTS customs_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL,
  ship_date TEXT, supplier TEXT, supplier_country TEXT, hs_code TEXT, product_desc TEXT,
  weight_kg REAL, containers REAL, port TEXT, source_url TEXT,
  UNIQUE(buyer_id, ship_date, supplier, product_desc)
);
CREATE INDEX IF NOT EXISTS idx_customs_shipments_buyer ON customs_shipments(buyer_id, ship_date DESC);

-- 市场级:reporter(进口国)× HS × 年 × 伙伴国;partner='World' 是总量。value_usd 是 Comtrade primaryValue(CIF 美元)。
CREATE TABLE IF NOT EXISTS customs_trade (
  market TEXT NOT NULL, hs TEXT NOT NULL, year INTEGER NOT NULL, partner TEXT NOT NULL,
  value_usd REAL, weight_kg REAL, source TEXT,
  PRIMARY KEY(market, hs, year, partner)
);
