-- 0025(2026-09-04):包材供应商档案 + 我们自己的编码体系。
-- 为什么要这张表:图册是别人的,人会走、文件会丢、网盘会乱。
--   把「这个瓶型来自谁、找谁、什么价、起订多少、什么时候能交」沉淀成一行记录,
--   资料才不会跟着某个微信聊天记录一起消失。
-- 编码规则:{厂简称前缀}-P{页码},单品再加 -{序号},例 FLD-P042、FLD-P042-3。
--   编码里带厂简称 = 看一眼就知道找谁,跟单时报得出口。
CREATE TABLE IF NOT EXISTS suppliers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh     TEXT NOT NULL UNIQUE,       -- 中文全名
  short_zh    TEXT NOT NULL,              -- 简称(对内叫法)
  prefix      TEXT NOT NULL UNIQUE,       -- 编码前缀,如 FLD
  slug        TEXT NOT NULL UNIQUE,       -- 路径用
  city        TEXT,
  categories  TEXT,                       -- 主营:泵头,瓶身,软管…
  contact     TEXT, phone TEXT, wechat TEXT, email TEXT, website TEXT,
  moq_note    TEXT,                       -- 起订口径
  lead_note   TEXT,                       -- 交期口径
  cert_note   TEXT,                       -- 有哪些认证/审厂记录
  price_note  TEXT,                       -- 报价习惯、账期、模具费口径
  rating      INTEGER,                    -- 1–5,内部评分
  notes       TEXT,                       -- 合作记录、踩过的坑
  status      TEXT NOT NULL DEFAULT 'active',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE pack_assets ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE pack_assets ADD COLUMN our_code TEXT;      -- FLD-P042
CREATE INDEX IF NOT EXISTS idx_pack_assets_code ON pack_assets(our_code);

INSERT OR IGNORE INTO suppliers (name_zh, short_zh, prefix, slug, city, categories) VALUES
 ('余姚富兰德','富兰德','FLD','fulande','宁波余姚','泵头,喷雾器,瓶身'),
 ('富麒','富麒','FQ','fuqi',NULL,'瓶身,膏霜罐'),
 ('广州九圆','九圆','JY','jiuyuan','广州','瓶身,膏霜罐,广口瓶'),
 ('广州合创','合创','HC','hechuang','广州','瓶身,泵头'),
 ('广州名创','名创','MC','mingchuang','广州','瓶身,软管'),
 ('惠州艾儿克','艾儿克','AEK','aierke','惠州','瓶身,膏霜罐'),
 ('时凯','时凯','SK','shikai',NULL,'瓶身,泵头'),
 ('汕头嘉雅','嘉雅','JIA','jiaya','汕头','瓶身,盖'),
 ('世捷包装','世捷','SJ','shijie',NULL,'瓶身');
