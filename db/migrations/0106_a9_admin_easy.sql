-- A9 后台易改易传(2026-09-23)。只加法。
--
-- ① product_internal:产品的成本与配方比例。单独一张表而不是加在 products 上 ——
--    前台所有产品查询都是 SELECT p.* / JOIN products,放在 products 里迟早有一句把成本带到公开页。
--    这张表前台代码一次都不读;后台只对 研发(chief/formulator)/ 财务(finance)/ 老板(boss)读写。
CREATE TABLE IF NOT EXISTS product_internal (
  product_id  INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cost        TEXT,        -- 成本说明(自由文本:单价、核算口径、确认人)
  formula     TEXT,        -- 配方比例 / 配方编号
  updated_by  INTEGER,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ② page_versions:页面的草稿与回退快照。
--    kind='draft'  未发布的改动(与保存接口同一形状的 JSON),每页最多一份,不动线上;
--    kind='backup' 每次发布 / 结构改动前的整页快照(版块 + 全部语种文案 + 页面标题),「撤销上一次改动」就是还原最新一份。
CREATE TABLE IF NOT EXISTS page_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  note        TEXT,
  snap_json   TEXT NOT NULL,
  user_id     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id, kind, id);
