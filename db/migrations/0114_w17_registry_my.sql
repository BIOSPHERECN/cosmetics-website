-- 0114 · WP-17 马来西亚化妆品备案「持证公司」线索宇宙(只加表,不动旧表)
-- 出处:Ministry of Health Malaysia / data.gov.my「cosmetic_notifications」
--   https://data.moh.gov.my/data-catalogue/cosmetic_notifications
--   许可 CC BY 4.0(https://creativecommons.org/licenses/by/4.0/),对外引用须署名上述出处
-- 原始字段只有 notif_no / product / company / date_notif,全是企业层;本表只存按公司聚合的数,不存个人信息
-- 写入:tools/prospect/notif-my.py(INSERT OR REPLACE,按 company_key 覆盖)
-- 回滚:DROP TABLE registry_my_holders;
CREATE TABLE IF NOT EXISTS registry_my_holders (
  company_key   TEXT PRIMARY KEY,          -- 公司名去标点空白转大写,仅作聚合键
  company       TEXT NOT NULL,             -- 备案持证公司(最常见写法)
  n_products    INTEGER NOT NULL,          -- 备案产品数(全量)
  n_24m         INTEGER NOT NULL,          -- 近 24 个月备案数
  first_notif   TEXT,
  last_notif    TEXT,
  top_brands    TEXT,                      -- JSON [[品牌,产品数],…] 按产品名前缀推断,须人工核
  top_share     REAL,                      -- 第一品牌占比;高 = 像自有品牌方,低 = 像分销商
  prospect_ids  TEXT,                      -- 匹配到的 prospects.id(逗号分隔)
  brand_lead_ids TEXT,                     -- 匹配到的 brand_leads.id
  match_by      TEXT,                      -- company / brand
  researchable  INTEGER NOT NULL DEFAULT 0,-- 未匹配且近 24 月 ≥20 款且 top_share ≥0.5
  data_as_of    TEXT,
  imported_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rmh_research ON registry_my_holders(researchable, n_24m DESC);
