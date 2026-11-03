-- 0115(09-24 R2 公司库读量):解读库首页 /decoder/ 列表 ORDER BY last_seen DESC, id DESC LIMIT/OFFSET
-- 没有可用索引,每次整表排序读 29.6 万行(8 小时 806 次 = 2.4 亿行);按市场筛选同理(21.4 万行/次)。
-- 部分索引的 WHERE 必须与查询里的 BASE 一字不差(inci IS NOT NULL AND length(inci) > 30),否则规划器用不上。
-- 回滚:DROP INDEX IF EXISTS idx_mp_seen_ok; DROP INDEX IF EXISTS idx_mp_country_seen_ok;
CREATE INDEX IF NOT EXISTS idx_mp_seen_ok ON market_products (last_seen DESC, id DESC) WHERE inci IS NOT NULL AND length(inci) > 30;
CREATE INDEX IF NOT EXISTS idx_mp_country_seen_ok ON market_products (country, last_seen DESC, id DESC) WHERE inci IS NOT NULL AND length(inci) > 30;
