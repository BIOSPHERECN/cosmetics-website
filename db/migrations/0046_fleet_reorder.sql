-- 0046(2026-09-07):舰队顺序改为商汤优先,Agnes 退到后面。
--
-- 实测:从 Cloudflare Workers 出去的请求,Agnes 一律返回
--   429 error code: 1015(Cloudflare 自己的限流码)
-- 于是资讯管线每篇文章都先在 agnes / agnes-25flash / agnes-25pro 三档上
-- 各撞一次 429、各带重试,cap=1 一次调用要 200 秒,cap=4 直接超时 280 秒。
-- 摘要一条都生成不出来,文章入库时是空的。
--
-- 顺序只在白名单内部调整:商汤(sensenova)和 Agnes 都是创始人批准的供应商,
-- 这里改的是"先问谁",不是"能问谁"。
-- Agnes 保留在链路里 —— 它从本机和 GitHub Actions 出去是通的,
-- 只有 Workers 这条出口被拦;将来那边解限了,把 tier 调回来即可。
UPDATE providers SET tier = 1 WHERE id = 'sensenova';
UPDATE providers SET tier = 2 WHERE id = 'sensenova-ds';
UPDATE providers SET tier = 3 WHERE id = 'sensenova-kimi';
UPDATE providers SET tier = 4 WHERE id = 'sensenova-68';
UPDATE providers SET tier = 5 WHERE id = 'longcat';
UPDATE providers SET tier = 6 WHERE id = 'agnes';
UPDATE providers SET tier = 7 WHERE id = 'agnes-25flash';
UPDATE providers SET tier = 8 WHERE id = 'agnes-25pro';
UPDATE providers SET tier = 9 WHERE id = 'agnes-cn';
