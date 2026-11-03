-- 0023(2026-09-04 评审后):资讯线转向。
-- 砍掉「自动改写行业媒体报道」这个体裁 —— 两个原因,效果那条比法律那条更要命:
--   ① 法律:改写带分析的行业报道属演绎,规模化多语对外提供踩反不正当竞争法数据条款;
--   ② 效果:AI 引擎引用原始媒体而非转述者,转述稿没有别人没有的数据点,进不了引用位;
--      而且搜行业新闻的是同行与媒体,不是来下单的品牌方 —— 等于花力气给别人做嫁衣。
-- 换成三种买家真会问 AI 的内容(每周 2–3 条,人工签发):
--   regulatory  官方公告 + 帛卉解读(官方文件本身不受著作权保护,价值在「这对代工意味着什么」)
--   company     自家的事(新证书、新产线、脱敏案例、交期数据)—— 全网只有我们有
--   commentary  引用式点评(标题 + 链接 + 150 字自己的话,不放图、不改写正文)
ALTER TABLE news ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE news ADD COLUMN signed_by TEXT;          -- 人工签发人,空 = 未签发,不许发布
ALTER TABLE news ADD COLUMN official_url TEXT;       -- 官方原文链接(regulatory 必填)
UPDATE news SET kind='legacy';                       -- 存量 207 篇标为历史,内部可查,不再对外
