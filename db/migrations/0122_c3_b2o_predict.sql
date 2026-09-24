-- 0122 · C3 预判引擎 MVP(2026-09-24)
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/02-领先预判引擎-执行设计-v2.md §3.2 §4.2 §4.5 §7.2;
--       DDL草案-预判侧-未执行-v2.sql 第 1 段(b2o_signals 原样)、第 2 段(b2o_opp_cards 只取本期用到的 6 列);
--       DDL草案-05-数据底座-v2.sql b2o_judgments(原样)。
-- 合并说明(撞列防护):以后 02/05 合并迁移里,b2o_signals、b2o_judgments 整段,以及 b2o_opp_cards 的
--   subject_key / stage_basis / gates_json / verdict_at / verdict_by / invalidation_json 六列都要删掉,否则 duplicate column。
--   b2o_predictions 的列 0112 已加齐,本文件不动。b2o_postmortems 不在本期(复盘结论先写 r30/r60/r90 + 账本 review)。
-- 只跑一次(ADD COLUMN 不幂等)。执行前核:PRAGMA table_info(b2o_opp_cards) 没有下列 6 列;b2o_signals、b2o_judgments 不存在(09-24 已核)。
-- 回滚:DROP TABLE b2o_judgments; DROP TABLE b2o_signals;(新表,只有本线写)
--       ALTER TABLE b2o_opp_cards DROP COLUMN <列>(逐列;新列只有本线写)。

-- 1) 计算出的信号:一行 = 某天 × 某信号 × 某主体 × 某窗口。由 tools/intel/predict.py 每日写,不调模型
CREATE TABLE IF NOT EXISTS b2o_signals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  calc_date     TEXT NOT NULL,
  code          TEXT NOT NULL,                 -- S1..S9 / C1
  direction     TEXT NOT NULL,                 -- 交易 / 内容 / 消费者 / 竞争 / 客户 / 跨市场
  country       TEXT NOT NULL,
  platform      TEXT NOT NULL,
  subject_type  TEXT NOT NULL,                 -- cat / claim / pid / brand / pain / store
  subject_key   TEXT NOT NULL,
  win           INTEGER NOT NULL,
  val           REAL,
  base          REAL,
  delta         REAL,
  n             INTEGER,
  passed        INTEGER NOT NULL DEFAULT 0,    -- 1 / -1 / 0,只由程序写
  is_proxy      INTEGER NOT NULL DEFAULT 0,
  promo         INTEGER NOT NULL DEFAULT 0,
  rules_version INTEGER,
  evidence      TEXT,
  origin        TEXT NOT NULL DEFAULT 'auto',  -- auto / manual / customer(customer 行永不公开、永不进模型原文)
  profile_id    INTEGER,
  score         REAL,
  status        TEXT NOT NULL DEFAULT 'new',   -- new / picked / judging / carded / dropped
  card_id       INTEGER,
  drop_reason   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(calc_date, code, country, platform, subject_type, subject_key, win)
);
CREATE INDEX IF NOT EXISTS idx_b2o_sig_subject ON b2o_signals(subject_type, subject_key, calc_date);
CREATE INDEX IF NOT EXISTS idx_b2o_sig_pass ON b2o_signals(calc_date, passed, direction);
CREATE INDEX IF NOT EXISTS idx_b2o_sig_profile ON b2o_signals(profile_id);
CREATE INDEX IF NOT EXISTS idx_b2o_sig_pick ON b2o_signals(calc_date, status, score);

-- 2) 判断原稿:正方 / 反方 / 裁决 每份一行(05-v2 原样)。argument 存 JSON,数字必须带 [F#] 出处
CREATE TABLE IF NOT EXISTS b2o_judgments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id  INTEGER NOT NULL,
  side           TEXT NOT NULL,              -- pro / con / expert / ruling
  judge_kind     TEXT NOT NULL,              -- ai / human
  judge_ref      TEXT NOT NULL,              -- 人 'u:<users.id>',AI 'ai:<slug>'
  model          TEXT,
  stance         TEXT,                       -- push / prepare / validate / watch / drop
  argument       TEXT NOT NULL,
  invalidation   TEXT,
  confidence     REAL,
  is_veto        INTEGER NOT NULL DEFAULT 0,
  evidence_json  TEXT NOT NULL DEFAULT '[]',
  ai_run_id      INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_judg_p ON b2o_judgments(prediction_id, side);

-- 3) 机会卡扩 6 列(预判侧 v2 第 2 段的子集;其余列等合并迁移)
ALTER TABLE b2o_opp_cards ADD COLUMN subject_key TEXT;         -- 'claim:ceramide' / 'cat:sunscreen',与 b2o_signals 对齐
ALTER TABLE b2o_opp_cards ADD COLUMN stage_basis TEXT;         -- 内部 JSON:{rule, signal_ids:[], tentative:1}
ALTER TABLE b2o_opp_cards ADD COLUMN gates_json TEXT;          -- 六道闸门;capability = 研发负责人签字 {r:pass|fail, by, at, note}
ALTER TABLE b2o_opp_cards ADD COLUMN invalidation_json TEXT;   -- 机器可核失效条件(§4.6 格式)
ALTER TABLE b2o_opp_cards ADD COLUMN verdict_at TEXT;          -- 状态最近一次人审时间
ALTER TABLE b2o_opp_cards ADD COLUMN verdict_by INTEGER;       -- users.id
CREATE INDEX IF NOT EXISTS idx_b2o_cards_subject ON b2o_opp_cards(subject_key);
