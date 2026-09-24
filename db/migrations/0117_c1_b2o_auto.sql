-- 0117 · C1 BEAUTY2OEM 第一期自动化(2026-09-24 突击第 4 波)
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/06-全自动化流水线与经验资本账本-v2.md P03 / P04 / P12 / §七 第一期
-- 自动草稿表:P03 机会简报草稿 + P04 第 3/7/14 天再触达草稿。只存草稿,发送永远是人在企业微信里发,系统只记「已发」。
--   status:gen(生成中,租约)→ draft(待顾问核 + 管理员批)→ approved → sent;也可能 rejected / failed(失败最多重试 3 次)
--   唯一键 (profile_id, kind, base_at):同一客户同一基准时间同一种草稿只出一次(事件与 Cron 同时抢也只有一个赢)
-- 幂等:全部 IF NOT EXISTS。回滚:DROP TABLE b2o_auto_drafts;(只有本线写,删表不影响别的表)
CREATE TABLE IF NOT EXISTS b2o_auto_drafts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id    INTEGER NOT NULL,
  kind          TEXT NOT NULL,                 -- brief | retouch3 | retouch7 | retouch14
  base_at       TEXT NOT NULL DEFAULT '',      -- brief = '';再触达 = 当时的 brief_sent_at(沉默计时起点)
  status        TEXT NOT NULL DEFAULT 'gen',
  body          TEXT,
  flags         TEXT,                          -- 机检结果 JSON 数组
  model         TEXT,
  evidence      TEXT,                          -- 再触达用到的新证据(只有表名 + id + 日期)
  tries         INTEGER NOT NULL DEFAULT 1,
  approved_by   TEXT,
  approved_at   TEXT,
  approved_hash TEXT,                          -- 批准时正文的 SHA-256;点「已发」时重算,不一致要重审
  sent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (profile_id, kind, base_at)
);
CREATE INDEX IF NOT EXISTS idx_b2o_auto_drafts_status ON b2o_auto_drafts(status, updated_at);
