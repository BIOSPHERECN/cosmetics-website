-- 创始人 2026-09-17 23:0x 底线:「抓取的全页面,需要 AI 撰写,不可以抄他们的!图片也需要另外网上找」。
-- 采来的 claims / 描述 / 图只留后台参考;对外只出我们自己写的 summary_*,图另找(img_src 记出处,img 未经核不上前台)。
ALTER TABLE market_products ADD COLUMN summary_zh TEXT;
ALTER TABLE market_products ADD COLUMN summary_en TEXT;
ALTER TABLE market_products ADD COLUMN summary_at TEXT;
ALTER TABLE market_products ADD COLUMN img_src TEXT;
