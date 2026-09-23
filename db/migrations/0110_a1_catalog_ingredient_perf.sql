-- 2026-09-23 A1:原料详情页三条重查询的处理记录(本迁移不改库结构,只留档;索引都已存在)
--   ① ingredient_facts `inci_key = ? OR inci_key LIKE ?`:全表 5,8xx 行/次 → 加 [lo, hi) 前缀区间走主键索引,21–183 行/次
--   ② inci_catalog `inci_key LIKE ?`:全表 57,0xx 行/次 → 同上走 idx_inci_catalog_key,276–1,514 行/次
--   ③ market_product_inci 自连接(常与它同配的成分):烟酰胺 1,336,383 行/次 → 只在含它的前 200 个产品里算,约 2.4–2.9 万行/次
-- 代码见 apps/web/src/pages/[lang]/ingredients/[slug].astro 与 _CatalogIngredient.astro。
-- 未做:market_product_inci (product_id, inci_key) 覆盖索引(可再省一半读,但一次性写 193 万行且拖慢灌库)。
SELECT 1;
