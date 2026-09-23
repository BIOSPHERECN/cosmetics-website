-- 0015: 把线上早已存在、但仓库里没有建表语句的两张表补进迁移(2026-09-03 审计发现 schema 失控)
-- 同时给 pack_jobs 加领单租约:leased_at / attempts(云端工人被超时杀掉后,单子 20 分钟自动回队,3 次失败置 failed)

CREATE TABLE IF NOT EXISTS kb_entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     category TEXT NOT NULL,
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     keywords TEXT NOT NULL DEFAULT '',
     is_published INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 100,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

CREATE TABLE IF NOT EXISTS pack_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  lang       TEXT,
  fact_line  TEXT,          -- 读图结论,便于人工回看
  brief      TEXT,          -- 客户补充的品牌方向
  prompt     TEXT NOT NULL, -- 出图提示词(网站拼好,本机直接用)
  status     TEXT NOT NULL DEFAULT 'queued',  -- queued / done / failed
  media_id   INTEGER,       -- 出好的图落在 media 表的哪一行
  err        TEXT,
  done_at    TEXT
, leased_at TEXT, attempts INTEGER NOT NULL DEFAULT 0);
