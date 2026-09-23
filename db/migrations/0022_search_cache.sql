-- 0022(2026-09-03):AI 搜索的答案缓存。
-- Cloudflare 免费档要省着用:同一个问题反复问不该每次都烧一次模型调用,
-- 也让第二个人问同样问题时是「秒回」。7 天过期,库里内容更新后自然轮换。
CREATE TABLE IF NOT EXISTS search_cache (
  qkey       TEXT PRIMARY KEY,          -- 归一化后的问题 + 语种
  answer     TEXT NOT NULL,
  hits_json  TEXT NOT NULL,
  hits_n     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
