-- 0116 · N1 获客证据表 + 规则分表(只加表,不动旧表)
-- 写入:tools/prospect/score.py --run --apply(INSERT OR IGNORE 证据 / INSERT OR REPLACE 分数)
-- 读取:只在本机脚本与人工核查时读;网站请求路径不读这两张表(新增线上读量 0)
-- 回滚:DROP TABLE lead_scores; DROP TABLE lead_evidence;
CREATE TABLE IF NOT EXISTS lead_evidence (
  id          INTEGER PRIMARY KEY,
  subject     TEXT NOT NULL,              -- bl:<brand_leads.id> · my:<registry_my_holders.company_key> · p:<prospects.id>
  dim         TEXT NOT NULL,              -- S/M/C/K/D/X(排除依据)/email/whatsapp/site
  value       TEXT,                       -- 抽出的字段值(如 maker、retail:sephora、info@x.com)
  quote       TEXT NOT NULL,              -- 原句(官网/备案原文;brand_leads 字段按原样,见 extractor)
  url         TEXT NOT NULL,              -- 原句所在页
  grade       TEXT NOT NULL,              -- E1 可核验 · E2 第三方/整理文字 · E3 推断措辞
  extractor   TEXT NOT NULL,              -- 官网原句 / 官网原文 / 政府备案原文 / brand_leads字段 / 候选域名探活
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subject, dim, url, quote)
);
CREATE TABLE IF NOT EXISTS lead_scores (
  subject   TEXT NOT NULL,
  rule_ver  TEXT NOT NULL,                -- 规则版本;改规则换版本号,旧分作废但保留
  name      TEXT, market TEXT,
  s INTEGER, e REAL, m INTEGER, c INTEGER, k INTEGER, t INTEGER, d INTEGER,
  total     INTEGER NOT NULL,
  tier      TEXT NOT NULL,                -- A / B / C / 不跟 / 排除
  why       TEXT,                         -- 分项与依据摘要
  verdict   TEXT,                         -- 合规市场矩阵判定
  scored_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subject, rule_ver)
);
CREATE INDEX IF NOT EXISTS idx_ls_tier ON lead_scores(rule_ver, tier, total DESC);
