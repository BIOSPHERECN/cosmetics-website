-- 2026-09-23 网站会员 + 每日查看限额(创始人:「配方列表可以看,但是点击就开启注册会员,免费版只可以一天看20个!收费版看100个」)
-- 表名与平台站(skin2oem)同名同义:mb_members / mb_views;配额判定两站同一份 lib/quota.ts。
-- 登录走邮件魔法链接,不存密码。plan_id:free | pro,后台「网站会员」页手改。
CREATE TABLE IF NOT EXISTS mb_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  plan_id       TEXT NOT NULL DEFAULT 'free',
  status        TEXT NOT NULL DEFAULT 'active',
  country       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
-- 每日查看计数:(会员, 北京日, 条目) 主键 —— INSERT OR IGNORE 天然幂等,同一天同一条只记一次。
-- item_key:dec:<id> 成分解读 / ing:<slug> 原料 / fml:<code> 配方 / q:<问题> AI 搜索
CREATE TABLE IF NOT EXISTS mb_views (
  member_id INTEGER NOT NULL,
  day       TEXT NOT NULL,
  item_key  TEXT NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, day, item_key)
) WITHOUT ROWID;
