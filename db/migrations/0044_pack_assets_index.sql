-- 0044(2026-09-07):给 pack_assets 建索引 —— 这是打爆 D1 的真凶。
--
-- 量化定位(wrangler d1 insights,不是猜):
--   包材货架那条 SELECT 单次读 3,922,345 行,跑 59 次共读 2.31 亿行,
--   queryEfficiency 0.0000043 —— 每读一百万行只有四行有用。
--   而 packaging 表只有 3,716 行。
--
-- 为什么会读四百万行:货架要「有实拍图的排前面」,写成了
--   ORDER BY (SELECT COUNT(*) FROM pack_assets a2 WHERE a2.our_code = packaging.code ...)
-- 加上另一条同形状的 has_img 子查询。pack_assets 上没有 our_code 索引,
-- 于是每一行 packaging 都把 pack_assets 全表扫一遍:3,716 × ~1,050 ≈ 390 万。
-- 两条子查询就是两遍。
--
-- 教训:相关子查询的代价是「外层行数 × 内层扫描量」,这个乘法在本地小数据上
-- 完全看不出来,一上三千行的真实数据就是四百万。上线前该看的不是「快不快」,
-- 是「读了多少行」—— insights 里那个 queryEfficiency 就是给这个用的。
CREATE INDEX IF NOT EXISTS idx_pack_assets_code_rev ON pack_assets(our_code, reviewed);
CREATE INDEX IF NOT EXISTS idx_packaging_status_type ON packaging(status, type);
