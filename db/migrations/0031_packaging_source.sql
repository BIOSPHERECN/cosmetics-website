-- 0031(2026-09-06):包材条目记住它是从哪儿来的。
--
-- 创始人:「后台要保存 1688 的链接,这样才可以对应」。
-- 他要的不只是留个链接 —— 是让每一款包材永远能回溯到源头:
-- 客户问「这款还有没有货、能不能换个盖」,业务点开链接就能找到那家、那个商品、那十个规格,
-- 不用再去翻聊天记录猜是哪一家。
--
-- 供应商名进的是 supplier_ref(内部),不进任何对外字段 —— 包材库页面的规矩没变:
-- 只显示我们自己的编码,供应商是我们的产能,不是公开信息。
ALTER TABLE packaging ADD COLUMN source_url TEXT;        -- 1688 商品链接
ALTER TABLE packaging ADD COLUMN source_offer_id TEXT;   -- 1688 offerId,链接改版也还认得出
ALTER TABLE packaging ADD COLUMN supplier_ref TEXT;      -- 供应商(内部可见,不对外)
ALTER TABLE packaging ADD COLUMN sourced_at TEXT;        -- 抓取时间,判断规格是否过期
ALTER TABLE packaging ADD COLUMN sku_raw TEXT;           -- 原始规格串,如「68牙-200ml」,便于和供应商对话时原样引用
CREATE INDEX IF NOT EXISTS idx_packaging_offer ON packaging(source_offer_id);

-- 图也要能回溯:哪张图来自哪个商品、原图 URL 是什么、过没过人工审核
ALTER TABLE pack_assets ADD COLUMN source_url TEXT;
ALTER TABLE pack_assets ADD COLUMN source_offer_id TEXT;
ALTER TABLE pack_assets ADD COLUMN reject_reason TEXT;   -- 被判掉的原因,人工复核时能看懂机器为什么否决
