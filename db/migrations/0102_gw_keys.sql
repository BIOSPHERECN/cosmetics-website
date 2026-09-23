-- SueAI 网关控制面(0.3.1):上游 key 以 gw_keys 为准,providers.api_keys 只作历史。
-- 一把 key 一行;account = 上游账号(sensenova / agnes),同一账号的 key 对该账号所有模型通用。
-- 人控(status)与运行态(cooldown_until / last_error)同表 —— ponytail: 够用;并发上报互相覆盖只是少记一次冷却,不用 KV。
CREATE TABLE IF NOT EXISTS gw_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT 'bohui',
  account TEXT NOT NULL,                 -- sensenova | agnes
  secret TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 10,  -- 小的先用
  status TEXT NOT NULL DEFAULT 'active', -- active | paused(人停) | dead(坏 key,人恢复)
  cooldown_until INTEGER,                -- 秒级时间戳;限流/故障后到点自动可用
  strikes INTEGER NOT NULL DEFAULT 0,    -- 连续失败次数,成功后清零
  last_error TEXT,
  last_error_at TEXT,
  last_seen_at TEXT,                     -- 最近一次被 /v1/keys 下发
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project, secret)
);
CREATE INDEX IF NOT EXISTS gw_keys_acct ON gw_keys(project, account, status, priority);

-- 只记错误与状态变化,不记每次成功
CREATE TABLE IF NOT EXISTS gw_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT 'bohui',
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  key_id INTEGER,
  account TEXT,
  model TEXT,
  dept TEXT,
  client TEXT,                           -- 客户端标识:desktop/0.3.1 · script · worker
  kind TEXT NOT NULL,                    -- ratelimit | quota | auth | upstream | model_missing | paused | resumed | uncool | added | deleted
  status INTEGER,
  msg TEXT
);
CREATE INDEX IF NOT EXISTS gw_events_ts ON gw_events(project, ts DESC);

-- 客户端三条线各用哪个 provider(chat/image/video × primary/backup)
CREATE TABLE IF NOT EXISTS gw_roles (
  project TEXT NOT NULL DEFAULT 'bohui',
  role TEXT NOT NULL,                    -- chat.primary | chat.backup | image.primary | image.backup | video.primary
  provider_id TEXT NOT NULL,             -- providers.id
  PRIMARY KEY(project, role)
);
