-- 0018(2026-09-03):爆款情报加「同款图 + 链接」。
-- 立场:这些图是**来源页面的配图**,按媒体引用方式呈现(缩略图 + 出处 + 日期 + 原文链接),
--       页面上明确标注「市场信息引用,非本厂产品」。不做成我们的产品图,不暗示代工关系。
-- 取图放 GitHub 工人做(抓 og:image → 压到 600px webp → 传 R2 media/trend/),
--   网站只存 media_id 与出处;Worker 不去外网抓图(50 子请求预算宝贵,且外站会挡)。
ALTER TABLE trends ADD COLUMN product_name TEXT;      -- 爆款单品/系列名(来源页标题里的)
ALTER TABLE trends ADD COLUMN ref_url TEXT;           -- 商品页或原文页,给客户点开看
ALTER TABLE trends ADD COLUMN image_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE trends ADD COLUMN image_credit TEXT;      -- 图片来源署名,页面必须显示
ALTER TABLE trends ADD COLUMN media_state TEXT NOT NULL DEFAULT 'pending';  -- pending/done/none
