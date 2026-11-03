-- ══════════════════════════════════════════════════════════════
-- 自有 AI 接入网关
--
-- 为什么要做:创始人手里有 9 家可用的模型 key,散在各处。
-- 每接一个新工具(公众号排版、客服、选品脚本)就要把这 9 把 key 抄一遍,
-- 而且哪一家挂了、哪一家余额没了,每个工具都要各自处理一遍降级。
--
-- 网关把这件事收成一个端点:对外只有一个地址、一把网关 key,
-- 形状照抄 OpenAI,任何支持 OpenAI 的客户端改一行 base_url 就能用。
-- 背后的 9 家、分档降级、书写系统校验全部复用现成的 fleet.ts。
--
-- key 不存明文:和用户口令一样存哈希。存明文的下场是数据库一旦泄露,
-- 9 家上游账号一起完蛋 —— 而网关 key 本身随时可以吊销重发,上游 key 不能。
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gateway_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,               -- 给谁用的,如「公众号排版脚本」
  prefix       TEXT    NOT NULL,               -- key 的前 8 位,用于在界面上认出是哪一把(不足以还原)
  key_hash     TEXT    NOT NULL UNIQUE,        -- SHA-256(key),不存明文
  enabled      INTEGER NOT NULL DEFAULT 1,
  -- 每小时调用上限。一把 key 被人拿去跑循环时,受损的是上游额度,
  -- 所以限流要在网关这一层做,而不是指望调用方自觉。
  hourly_limit INTEGER NOT NULL DEFAULT 200,
  -- 允许用哪些能力:chat / vision / image,逗号分隔。留空表示只允许 chat
  scopes       TEXT    NOT NULL DEFAULT 'chat',
  created_by   INTEGER,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  calls        INTEGER NOT NULL DEFAULT 0
);

-- 调用流水。做两件事:限流的计数依据,以及「这把 key 到底在被谁怎么用」的答案。
CREATE TABLE IF NOT EXISTS gateway_calls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id     INTEGER NOT NULL,
  at         TEXT    NOT NULL DEFAULT (datetime('now')),
  kind       TEXT    NOT NULL,                 -- chat / vision / models
  provider   TEXT,                             -- 最终由哪一家应答
  model      TEXT,
  ms         INTEGER,
  ok         INTEGER NOT NULL DEFAULT 1,
  err        TEXT,
  in_tokens  INTEGER,
  out_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gwcalls_key_at ON gateway_calls (key_id, at);
CREATE INDEX IF NOT EXISTS idx_gwcalls_at ON gateway_calls (at);
