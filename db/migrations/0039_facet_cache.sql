-- 0039(2026-09-07):筛选计数改成预计算,不再每次请求扫全表。
--
-- 事故复盘:包材库接进三千六百款之后,货架页每次未命中边缘缓存的加载都要跑
-- 三条 GROUP BY 扫全表 —— 约 1.1 万行读。我整晚用 ?cb=随机数 绕过缓存做验证,
-- 几十次下来把 D1 的每日读额度烧穿,结果三个库同时变成空货架
-- (查询报错 → catch 返回空数组 → 页面照常 200,但一件商品都没有)。
--
-- 两个教训都记下来:
--   一、筛选计数是"很少变、被反复读"的典型,该预计算,不该每次算;
--   二、页面在数据层失败时不该静默变空,要能看出是"取数失败"还是"真的没有"。
--       静默降级让我到今天早上才发现,而不是第一次发生时就发现。
CREATE TABLE IF NOT EXISTS facet_cache (
  k          TEXT PRIMARY KEY,        -- 例:packaging:zh-cn
  json       TEXT NOT NULL,           -- 预算好的筛选项与计数
  n_total    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
