-- 0024(2026-09-04):包材图册资产。
-- 十家瓶厂的 PDF 图册(831 页)拆页存 R2,每页打类别标签,
-- 让"我要找泵头/软管/膏霜罐"能直接翻到页,而不是从头翻 366 页。
-- 单品裁剪(B 线)另存,item_of 指回它所属的页。
CREATE TABLE IF NOT EXISTS pack_assets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier    TEXT NOT NULL,          -- 中文全名,跟单时报得出口
  supplier_s  TEXT NOT NULL,          -- 厂简写,路径与检索用
  book        TEXT NOT NULL,          -- 哪一本图册
  page        INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'page',   -- page 整页 / item 单品裁剪
  item_of     INTEGER REFERENCES pack_assets(id) ON DELETE CASCADE,
  category    TEXT,                   -- 泵头/瓶身/软管/膏霜罐/盖/喷雾器/其他
  codes       TEXT,                   -- 页面上出现的型号,如 FS306-A1,FS306-B2
  specs       TEXT,                   -- 抓到的规格,如 Ø42/100ml
  r2_key      TEXT NOT NULL UNIQUE,
  width       INTEGER, height INTEGER, bytes INTEGER,
  source      TEXT NOT NULL DEFAULT 'text',   -- 分类依据:text 文字层 / vision 视觉模型 / manual 人工
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pack_assets_q ON pack_assets(supplier_s, category, page);
