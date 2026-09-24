-- 0123(09-24 零读取第一批,施工图 v2 §1.2 B / 1-5):成分页两段改读固定表,访客路径不再现算。
-- 原来 _CatalogIngredient.astro 每次渲染现算两条(公司库部署后残留第 1、2 名,合计每天约 1.5 亿行):
--   「含该成分的热销产品」market_product_inci JOIN market_products + COUNT(*) OVER ()
--   「常与它同配的成分」 含它的前 100 个产品里的共现 CTE
-- 现在由 tools/ing-precompute.py 本机算好写进来,页面按主键读 1–2 行;表里没有的键,两段都不显示,不回退现算。
-- 键:market_product_inci.inci_key。每行存的是「该键 ∪ cnKey(该键)」两个键合起来的结果,等于原查询 IN (fk, ck)。
-- h:内容指纹,刷新脚本只写 h 变了的行。WITHOUT ROWID:主键就是表本身,写一行只记一行写(不另写一份主键索引)。
-- 回滚:DROP TABLE IF EXISTS ing_prods; DROP TABLE IF EXISTS ing_cooc;(页面查不到表时两段不显示,不报错)
CREATE TABLE IF NOT EXISTS ing_prods (
  inci_key TEXT PRIMARY KEY,
  total    INTEGER NOT NULL,   -- 含该成分的产品总数(原 COUNT(*) OVER ())
  json     TEXT NOT NULL,      -- 前 12 款 [{id,brand,title,title_zh,country,cat,cat_zh}],按 last_seen DESC, id DESC
  h        TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS ing_cooc (
  inci_key TEXT PRIMARY KEY,
  json     TEXT NOT NULL,      -- 前 8 个共现成分 [{inci_key,name_zh,rating}],已排除自身与 BASE 基础成分
  h        TEXT NOT NULL
) WITHOUT ROWID;
