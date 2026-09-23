-- ══════════════════════════════════════════════════════════════
-- 询盘补三个字段:来源页、外部来源、已读时间。
--
-- 为什么值得单独加一次迁移:
--
-- source_path —— 这条询盘是从**哪一页**发出来的。
--   没有它,后台只能回答「这个月来了 20 条」;有了它才能回答
--   「20 条里 12 条来自生产线页,种植基地页一条没有」——
--   前者是记账,后者才是能据以改内容的信息。
--   代工站的内容投入很难验证效果,这一列是最便宜的验证方式。
--
-- referrer —— 站外来源(Google / 阿里 / 直接访问)。
--   同样是为了回答「钱花在哪有用」。只存 host,不存完整 URL:
--   完整 URL 常带搜索词和会话 id,那属于访客隐私,我们不需要也不该留。
--
-- read_at —— 已读时间。后台导航要显示未读角标,
--   而「未读」不能用 status='new' 代替:业务上「新线索」和「没人看过」
--   是两件事(看过了但还没回复,依然是 new)。
-- ══════════════════════════════════════════════════════════════

ALTER TABLE inquiries ADD COLUMN source_path TEXT;
ALTER TABLE inquiries ADD COLUMN referrer    TEXT;
ALTER TABLE inquiries ADD COLUMN read_at     TEXT;

CREATE INDEX IF NOT EXISTS idx_inq_site_created ON inquiries (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inq_unread ON inquiries (site_id, read_at);
