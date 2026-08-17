-- 媒体的来源与授权信息。
--
-- 为什么必须存:从图库导入的图,将来一定会有人问「这张哪来的、能不能用」。
-- 到时候翻不出出处,只能整批下架。存下来的成本是三列,不存的成本是一次撤站。
-- CC0 虽然免署名,来源照样记 —— 记的是「我们当时确认过它是 CC0」这件事。
ALTER TABLE media ADD COLUMN source_url TEXT;
ALTER TABLE media ADD COLUMN license TEXT;
ALTER TABLE media ADD COLUMN creator TEXT;
