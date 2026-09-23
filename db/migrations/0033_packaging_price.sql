-- 0033(2026-09-07):包材参考价。
--
-- 创始人:「价格是要有的」「只是需要在原有的基础上*2,因为实际的价格会有不同的」
--         「特别有些商家的价格是用超低价,然后联系报价是不一样的」。
--
-- 所以这里存的**不是成本**,是一个锚点,而且必须分成两层:
--   source_price  1688 页面上的挂牌价。这个数常常是引流价 —— 挂 ¥3.20,真去问是另一个数。
--                 只进内部,任何对外字段都不引用它。
--   price_ref     = source_price × price_mult(默认 2),对外显示为**参考价**。
--                 乘 2 不是毛利率,是因为挂牌价本身不可信,留出足够的缓冲,
--                 免得业务被一个假低价框住,谈到一半发现连成本都不够。
--
-- 页面上必须写「参考价,实际以书面报价为准」。这一条不是客气话:
-- 挂牌价失真是这批数据的已知性质,不标出来就是我们在替供应商的引流价背书。
ALTER TABLE packaging ADD COLUMN source_price REAL;        -- 1688 挂牌价(内部,可能是引流价)
ALTER TABLE packaging ADD COLUMN source_price_note TEXT;   -- 例:「挂牌 ¥3.20 起,1688,2026-09-07」
ALTER TABLE packaging ADD COLUMN price_mult REAL NOT NULL DEFAULT 2.0;
ALTER TABLE packaging ADD COLUMN price_ref REAL;           -- = source_price × price_mult,对外参考价
ALTER TABLE packaging ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'CNY';
ALTER TABLE packaging ADD COLUMN price_unit TEXT;          -- 套 / 只 / 个
ALTER TABLE packaging ADD COLUMN stock_note TEXT;          -- 例:「库存 94782 套」,判断是不是现货
