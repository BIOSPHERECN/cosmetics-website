-- 0118 · D03 经验账本护栏补漏 + 05 数据底座余项(2026-09-24 突击第 4 波)
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/DDL草案-05-数据底座-v2.sql §7 samples、§8 matters、§9 b2o_genes、§10 b2o_lessons;
--       DDL草案-客户侧-未执行-v2.sql §F matters.order_type;06-全自动化流水线与经验资本账本-v2.md §4.2 / §4.3;
--       突击计划 第 2 波 W9 验收遗留(冻结后 dissent、scores_json 仍能改;kind=judgment 带 supersedes 能绕过「带新证据」)。
-- 合并说明(撞列防护):05-v2 §5 给 b2o_predictions 加的 5 列、0112 的 b2o_predictions 重建与 b2o_ledger 整段,已由 0112 灌好,
--   本文件一概不再出现;以后 02/03/05/06 合并迁移同样要删掉这两段,否则 duplicate column。
-- 本文件不含(C2 CRM / C3 预判正在做,等它们落地后另开迁移,避免撞表):
--   b2o_judgments、b2o_postmortems、b2o_experts、v_b2o_expert_hits、b2o_questions、b2o_posts;
--   deals 的 gene_id / plan / line / lost_code;activities 的 next_event / next_due;b2o_opp_cards 的 evidence_json / ai_run_id。
-- 只跑一次(ADD COLUMN 不幂等)。执行前核:samples 13 列、matters 29 列,且都没有下面要加的列;b2o_genes、b2o_lessons 不存在。
-- 回滚(执行时 samples、matters 都是 0 行,两张新表 0 行,不丢数据):
--   DROP TRIGGER b2o_pred_frozen_upd2; DROP TRIGGER b2o_ledger_supersede_evidence;
--   DROP TABLE b2o_lessons; DROP TABLE b2o_genes;
--   ALTER TABLE samples DROP COLUMN version_no / gene_id / formula_version_id / pack_id / changes / feedback_cat / decided(逐列);
--   ALTER TABLE matters DROP COLUMN order_type / gene_id / sell_ref(逐列)。

-- 1) 冻结后,判断评分类列与审批记录也锁住(0112 的 b2o_pred_frozen_upd 只锁了判断原文)。
--    仍可改:outcome、r7/r30/r60/r90、biz_*、due30/60/90、is_public(公开另有触发器管)、updated_at。
CREATE TRIGGER IF NOT EXISTS b2o_pred_frozen_upd2
  BEFORE UPDATE OF id, trigger_kind, stage, resonance, gates_json, scores_json, score_total, dissent, rules_version,
                   reviewer_uid, reviewed_at ON b2o_predictions
  WHEN OLD.frozen_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'prediction frozen'); END;

-- 2) 改判必须带新证据(W5 B3),补 0112 只管 kind=correction 的漏洞。没有 new_evidence_ids 时拒绝:
--    a) 任何一行 supersedes 一条已冻结的判断(payload 带 frozen_hash);
--    b) kind=judgment 带 supersedes,却不是「同一对象上一条未冻结判断」的快照更新。
--    放行:ledger-sync 给草稿、market_intel 写的新快照(同一对象、上一条没冻结)。
CREATE TRIGGER IF NOT EXISTS b2o_ledger_supersede_evidence BEFORE INSERT ON b2o_ledger
  WHEN NEW.supersedes IS NOT NULL
   AND coalesce(json_array_length(json_extract(NEW.payload_json, '$.new_evidence_ids')), 0) = 0
   AND EXISTS (SELECT 1 FROM b2o_ledger o WHERE o.id = NEW.supersedes AND (
         (o.kind = 'judgment' AND json_extract(o.payload_json, '$.frozen_hash') IS NOT NULL)
      OR (NEW.kind = 'judgment' AND NOT (o.kind = 'judgment' AND o.entity_type = NEW.entity_type AND o.entity_id = NEW.entity_id))))
  BEGIN SELECT RAISE(ABORT, 'superseding a judgment needs new evidence'); END;

-- 3) 样品版本字段(05-v2 §7;对应 表单模板/样品版本记录-v2.csv)
ALTER TABLE samples ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE samples ADD COLUMN gene_id INTEGER;              -- b2o_genes.id
ALTER TABLE samples ADD COLUMN formula_version_id INTEGER;   -- formula_versions.id(配方实验室)
ALTER TABLE samples ADD COLUMN pack_id INTEGER;              -- packaging.id
ALTER TABLE samples ADD COLUMN changes TEXT;                 -- 相对上一版改了什么
ALTER TABLE samples ADD COLUMN feedback_cat TEXT;            -- texture / scent / absorb / look / pack / efficacy / other
ALTER TABLE samples ADD COLUMN decided TEXT;                 -- ok 定稿 / revise 寄下一版 / drop 放弃

-- 4) 订单与商业结果落 matters(客户侧-v2 §F + 05-v2 §8);金额类只由财务填,接口不算、不补、不编
ALTER TABLE matters ADD COLUMN order_type TEXT;   -- test 测试单 / bulk 大货 / repeat 复购;kind='订单' 时必填
ALTER TABLE matters ADD COLUMN gene_id    INTEGER;
ALTER TABLE matters ADD COLUMN sell_ref   TEXT;   -- 客户卖货反馈的引用号;原文放境内存储,D1 不存(客户授权才收)

-- 5) 产品基因库(05-v2 §9;gene_code = 表单模板/快样目录.csv 的快样编号,研发签字后才导入)
CREATE TABLE IF NOT EXISTS b2o_genes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  gene_code        TEXT UNIQUE NOT NULL,        -- 快样编号,如 QB-ORAL-001
  product_id       INTEGER,                     -- products.id
  catalog_ref      TEXT,                        -- 产品册页码 / 款号
  category         TEXT NOT NULL,               -- oral / face / body / sun / hair / mask …(按名称重归类,不信 products.category)
  form             TEXT,
  actives          TEXT,                        -- 核心成分(INCI)
  claims           TEXT,                        -- 可说的卖点(已清洗)
  texture          TEXT,
  tier             TEXT,                        -- A / B / C(初值,待校准)
  sample_ready     TEXT NOT NULL DEFAULT 'unknown',   -- yes / no / unknown(研发标)
  materials_stock  TEXT NOT NULL DEFAULT 'unknown',   -- yes / partial / no / unknown(采购标)
  pack_types       TEXT NOT NULL DEFAULT '[]',
  pack_shelf_n     INTEGER,                     -- 同类型可选包材款式数(供应商现货,对外不引用)
  reg_json         TEXT NOT NULL DEFAULT '{}',  -- {国:{status, halal, level, slow, note}}
  stability        TEXT,                        -- 有 / 无报告,不写数
  used_projects    INTEGER NOT NULL DEFAULT 0,
  used_orders      INTEGER NOT NULL DEFAULT 0,
  fast_score       REAL,
  confidentiality  TEXT NOT NULL DEFAULT 'internal',  -- internal / member / public
  status           TEXT NOT NULL DEFAULT 'draft',     -- draft / verified / retired
  verified_by      INTEGER, verified_at TEXT,
  evidence_json    TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_genes_rank ON b2o_genes(status, tier, fast_score);

-- 6) 工程经验(05-v2 §10;六段式:什么变了 / 什么条件 / 发生了什么 / 为什么 / 怎么处理 / 结果,外加一句规则)
CREATE TABLE IF NOT EXISTS b2o_lessons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gene_id       INTEGER, sample_id INTEGER, formula_version_id INTEGER, deal_id INTEGER,
  changed       TEXT NOT NULL,
  condition     TEXT,
  phenomenon    TEXT NOT NULL,
  cause         TEXT,
  cause_level   TEXT NOT NULL DEFAULT 'guess',   -- confirmed / guess
  handling      TEXT,
  result        TEXT,
  rule          TEXT,
  severity      TEXT NOT NULL DEFAULT 'minor',   -- minor / major / blocker
  tags          TEXT NOT NULL DEFAULT '[]',
  drafted_by    TEXT,                             -- ai / users.id
  verified_by   INTEGER, verified_at TEXT,        -- 研发确认后才进检索
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_lessons_g ON b2o_lessons(gene_id, verified_at);
