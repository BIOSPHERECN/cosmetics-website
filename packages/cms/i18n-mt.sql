-- 机器翻译标记 —— 让「谁翻的、什么时候翻的」在库里留痕。
--
-- 为什么必须留痕:机器译文可用但不可尽信。没有这个标记,
-- 三个月后没人分得清哪句是人写的、哪句是模型补的,校对就无从下手 ——
-- 只能整篇重读,那等于没翻。有了标记,校对的人只看 mt=1 的那些。
ALTER TABLE site_i18n    ADD COLUMN mt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE site_i18n    ADD COLUMN mt_at TEXT;
ALTER TABLE page_i18n    ADD COLUMN mt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE page_i18n    ADD COLUMN mt_at TEXT;
ALTER TABLE block_i18n   ADD COLUMN mt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE block_i18n   ADD COLUMN mt_at TEXT;
ALTER TABLE product_i18n ADD COLUMN mt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_i18n ADD COLUMN mt_at TEXT;

-- 繁体中文按创始人「不要繁体字」的要求下线,库里 113 行残留一并清掉。
-- 留着不是无害的:后台的「译文缺口」列会把它算进分母,
-- 让人以为还有一门语言没翻完,天天盯着一个不存在的缺口。
DELETE FROM site_i18n    WHERE lang = 'zh-tw';
DELETE FROM page_i18n    WHERE lang = 'zh-tw';
DELETE FROM block_i18n   WHERE lang = 'zh-tw';
DELETE FROM product_i18n WHERE lang = 'zh-tw';
