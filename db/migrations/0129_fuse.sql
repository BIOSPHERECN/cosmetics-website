-- 10-22 费用熔断保险丝(cost fuse):当天「缓存 miss → 渲染」次数触顶 → 全站非会员锁死(429),次日自动恢复。
-- 为什么计渲染次数:D1 Rows Read 免费 250 亿行/月(≈8.3 亿行/天),单页渲染几十~上百行;
--   正常日渲染 <10 万次,熔断线 30 万次 ≈ 3000 万行读/天,只占免费额度的 3.6% —— 平时永远碰不到,异常暴涨才触发。
-- 为什么按天:以 day 为主键,新的一天自然从 0 开始,熔断到 UTC+8 零点自动解除,不会把自己永久锁死。
-- 回滚:DROP TABLE IF EXISTS fuse_daily;
CREATE TABLE IF NOT EXISTS fuse_daily (
  day      TEXT PRIMARY KEY,
  renders  INTEGER NOT NULL DEFAULT 0,   -- 当日缓存 miss 渲染次数
  fired    INTEGER NOT NULL DEFAULT 0,   -- 1 = 熔断已触发,非会员请求一律 429
  fired_at TEXT                          -- 触发时间(UTC),留排查用
);
