-- 0112 · W9 经验账本合一(2026-09-24)
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/06-全自动化流水线与经验资本账本-v2.md §4.2、§4.3、§八;
--       21-社媒与情报系统/吸收方案-G3 第 1 条;22-知识库与专家思维/源码拆解-RAG与科研-v1.md B2、B3。
-- 只跑一次(ADD COLUMN 与重建不幂等)。执行前核:b2o_predictions 0 行、没有 frozen_at 列、没有 b2o_ledger 表。
-- 本文件已把 b2o_predictions 的全部待加列一次加齐(02 预判侧 v2 §3a/3b、05 v2 的 5 列、06 v2 的 3 列、W5 B2 的 2 列)。
--   → 合并迁移(02/03/05/06 合一)里 b2o_predictions 的重建、ADD COLUMN、冻结与公开触发器、b2o_ledger 整段都要删掉,否则 duplicate column。
-- 回滚:b2o_predictions 与 b2o_ledger 执行时都是 0 行 → DROP TABLE b2o_ledger; 再按 0105_b2o.sql 原样重建 b2o_predictions(DROP 会连带删触发器)。

-- 1) b2o_predictions 重建:is_public 默认改 0(0105 是 1)。表 0 行,整表复制不丢数据
CREATE TABLE b2o_predictions_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id       INTEGER,
  made_at       TEXT NOT NULL DEFAULT (date('now')),
  title         TEXT NOT NULL,
  fact          TEXT, anomaly TEXT,
  pro           TEXT, con TEXT, ruling TEXT,
  analogy       TEXT, uncertainty TEXT, invalidation TEXT, action TEXT,
  verdict       TEXT,
  r30           TEXT, r60 TEXT, r90 TEXT,
  outcome       TEXT NOT NULL DEFAULT 'pending',
  biz_inquiries INTEGER NOT NULL DEFAULT 0,
  biz_samples   INTEGER NOT NULL DEFAULT 0,
  biz_quotes    INTEGER NOT NULL DEFAULT 0,
  biz_orders    INTEGER NOT NULL DEFAULT 0,
  is_public     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO b2o_predictions_new SELECT * FROM b2o_predictions;
DROP TABLE b2o_predictions;
ALTER TABLE b2o_predictions_new RENAME TO b2o_predictions;
CREATE INDEX IF NOT EXISTS idx_b2o_pred_pub ON b2o_predictions(is_public, made_at);

-- 2) 02 预判侧 v2 §3b
ALTER TABLE b2o_predictions ADD COLUMN trigger_kind TEXT;
ALTER TABLE b2o_predictions ADD COLUMN stage TEXT;
ALTER TABLE b2o_predictions ADD COLUMN resonance TEXT;
ALTER TABLE b2o_predictions ADD COLUMN gates_json TEXT;
ALTER TABLE b2o_predictions ADD COLUMN scores_json TEXT;
ALTER TABLE b2o_predictions ADD COLUMN score_total INTEGER;
ALTER TABLE b2o_predictions ADD COLUMN dissent TEXT;
ALTER TABLE b2o_predictions ADD COLUMN rules_version INTEGER;
ALTER TABLE b2o_predictions ADD COLUMN review_status TEXT NOT NULL DEFAULT 'draft';  -- draft / approved / rejected
ALTER TABLE b2o_predictions ADD COLUMN reviewer_uid INTEGER;
ALTER TABLE b2o_predictions ADD COLUMN reviewed_at TEXT;
ALTER TABLE b2o_predictions ADD COLUMN r7 TEXT;
ALTER TABLE b2o_predictions ADD COLUMN biz_shown INTEGER;
ALTER TABLE b2o_predictions ADD COLUMN biz_interest INTEGER;
ALTER TABLE b2o_predictions ADD COLUMN biz_paid INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_b2o_pred_review ON b2o_predictions(review_status);
CREATE INDEX IF NOT EXISTS idx_b2o_pred_card ON b2o_predictions(card_id);
-- 3) 05 v2(evidence_json 每条带 rel = support / oppose / background,即 W5 B1)
ALTER TABLE b2o_predictions ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE b2o_predictions ADD COLUMN biz_revisions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE b2o_predictions ADD COLUMN due30 TEXT;
ALTER TABLE b2o_predictions ADD COLUMN due60 TEXT;
ALTER TABLE b2o_predictions ADD COLUMN due90 TEXT;
-- 4) 06 v2 冻结三列
ALTER TABLE b2o_predictions ADD COLUMN frozen_at TEXT;
ALTER TABLE b2o_predictions ADD COLUMN frozen_hash TEXT;
ALTER TABLE b2o_predictions ADD COLUMN query_spec TEXT;
-- 5) W5 B2 证伪条件:对手判断下会看到什么;怎样算无法判定
ALTER TABLE b2o_predictions ADD COLUMN rival_sees TEXT;
ALTER TABLE b2o_predictions ADD COLUMN undecidable_if TEXT;

-- 6) 冻结后判断原文(含 B2 两列)和冻结列本身不能改,行不能删
CREATE TRIGGER IF NOT EXISTS b2o_pred_frozen_upd
  BEFORE UPDATE OF title, fact, anomaly, pro, con, ruling, analogy, uncertainty, invalidation, action, verdict, card_id, made_at,
                   query_spec, rival_sees, undecidable_if, evidence_json, frozen_at, frozen_hash, review_status ON b2o_predictions
  WHEN OLD.frozen_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'prediction frozen'); END;
CREATE TRIGGER IF NOT EXISTS b2o_pred_frozen_del BEFORE DELETE ON b2o_predictions
  WHEN OLD.frozen_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'prediction frozen'); END;
CREATE TRIGGER IF NOT EXISTS b2o_pred_public_ins AFTER INSERT ON b2o_predictions
  WHEN NEW.frozen_at IS NULL AND NEW.is_public <> 0 BEGIN UPDATE b2o_predictions SET is_public = 0 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS b2o_pred_public_upd BEFORE UPDATE OF is_public ON b2o_predictions
  WHEN NEW.is_public = 1 AND NEW.frozen_at IS NULL BEGIN SELECT RAISE(ABORT, 'not frozen, cannot be public'); END;

-- 7) 经验账本(06 v2 §八 原样):只追加;payload 只放 id / 枚举 / 数字 / 哈希
CREATE TABLE IF NOT EXISTS b2o_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  author TEXT NOT NULL,                                -- uid:<n> | job:<流水线>@<host>
  author_kind TEXT NOT NULL,                           -- human | machine
  payload_json TEXT NOT NULL,
  supersedes INTEGER,                                  -- 更正 / 新快照指向旧行
  confirms INTEGER,
  ai_run_ids TEXT,
  prev_hash TEXT,
  hash TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal'
);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON b2o_ledger(entity_type, entity_id, id);
CREATE INDEX IF NOT EXISTS idx_ledger_kind_ts ON b2o_ledger(kind, ts);
CREATE TRIGGER IF NOT EXISTS b2o_ledger_no_update BEFORE UPDATE ON b2o_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS b2o_ledger_no_delete BEFORE DELETE ON b2o_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
-- 更正必须指向真实存在的旧行
CREATE TRIGGER IF NOT EXISTS b2o_ledger_supersedes_ref BEFORE INSERT ON b2o_ledger
  WHEN NEW.supersedes IS NOT NULL AND NOT EXISTS (SELECT 1 FROM b2o_ledger WHERE id = NEW.supersedes)
  BEGIN SELECT RAISE(ABORT, 'supersedes points to missing row'); END;
-- W5 B3 改判必须带新证据:更正一条 judgment,payload 里 new_evidence_ids 不能为空
CREATE TRIGGER IF NOT EXISTS b2o_ledger_rejudge_evidence BEFORE INSERT ON b2o_ledger
  WHEN NEW.kind = 'correction' AND (SELECT kind FROM b2o_ledger WHERE id = NEW.supersedes) = 'judgment'
   AND coalesce(json_array_length(json_extract(NEW.payload_json, '$.new_evidence_ids')), 0) = 0
  BEGIN SELECT RAISE(ABORT, 'correction of judgment needs new evidence'); END;
-- 当前口径:没被后来行 supersedes 的行
CREATE VIEW IF NOT EXISTS b2o_ledger_current AS
  SELECT l.* FROM b2o_ledger l WHERE NOT EXISTS (SELECT 1 FROM b2o_ledger n WHERE n.supersedes = l.id);
