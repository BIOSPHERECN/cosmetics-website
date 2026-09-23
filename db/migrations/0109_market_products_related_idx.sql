-- 0109(原 0105,撞号改名,已在公司库执行,内容未变)
-- 2026-09-23 解读详情页「同类产品」查询(pages/[lang]/decoder/[slug].astro 的 related)原来全表扫 148,891 行 / 次、约 200ms,
-- 过去 1 小时 8,548 次 = 14 亿行,占掉 D1 单线程近一半时间,登录会员的详情页(不进边缘缓存)因此 7–8 秒。
-- 表达式必须与查询里的 COALESCE(cat_zh, cat) 一字不差,否则用不上。
CREATE INDEX IF NOT EXISTS idx_mp_related ON market_products (COALESCE(cat_zh, cat), country, last_seen DESC, id DESC);
