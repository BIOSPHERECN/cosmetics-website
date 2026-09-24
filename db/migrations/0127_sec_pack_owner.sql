-- 0127 · 09-24 代码审计 P1-2(安全架构 C11):客户定制出图记归属。
-- 以前 /api/ai/pack-status?id= 与 /media/{id} 都按顺序号公开:从 1 数到 N 就能看遍所有客户的包装效果图(常带客户品牌与未上市包装)。
-- 现在出图单记下发起的会员(api/ai/pack、api/design/iterate 已只给会员用),进度与取图只回给本人或后台员工(照平台 09-24 的做法)。
-- 只做加法。老单子 member_id 为空 = 只有后台员工能看。回滚:ALTER TABLE pack_jobs DROP COLUMN member_id;
ALTER TABLE pack_jobs ADD COLUMN member_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_pack_jobs_media ON pack_jobs (media_id);   -- /api/ai/pack-img 按图反查出图单(原来没有索引,要整扫 pack_jobs)
