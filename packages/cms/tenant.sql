-- 一域名一后台:账号归属到站点。
--
-- 现在所有后台页都跨站查,谁登录都看得见 5 个品牌的全部内容 ——
-- 对 B2B 是不合适的:5 条产品线可能是 5 拨人在运营,
-- 让做口腔护理的人翻得到彩妆代工的询盘和配方,是管理漏洞不是便利。
--
-- site_id 为空 = 集团管理员,可管所有站(创始人自己);
-- 填了站点 = 只能管那一个站,连数据都查不到别站的。
ALTER TABLE users ADD COLUMN site_id TEXT REFERENCES sites(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_users_site ON users(site_id);
