-- 媒体存储:先用 D1 直存(浏览器端已压到 WebP ≤1MB),等 R2 开通再切驱动。
-- 之所以能这么做:D1 单个 blob 上限 1MB,而网页用图经 WebP 1600px 压缩通常 100–300KB。
-- 存 driver 字段是为了将来混存 —— 老图留在 D1,新图进 R2,前台按 driver 取,不用迁移。
ALTER TABLE media ADD COLUMN data BLOB;
ALTER TABLE media ADD COLUMN driver TEXT NOT NULL DEFAULT 'd1';
ALTER TABLE media ADD COLUMN url TEXT;
CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder, created_at DESC);
