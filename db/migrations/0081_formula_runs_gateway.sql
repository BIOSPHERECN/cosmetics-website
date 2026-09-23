-- 配方实验室 v0.1(2026-09-17 创始人:「需求经过一个网关到达专家,再进行分解分析,而不是实验室工程师去选专家」)。
-- formula_runs.step 新增取值 gateway | expert;expert 行与汇总行(step 仍是 recommend / generate)都用 gateway_run_id 指向网关行。
-- ALTER ADD COLUMN 不幂等:灌前 PRAGMA table_info(formula_runs) 确认没有这一列。
-- 2026-09-17 已灌线上(PRAGMA 见 cid 23 gateway_run_id),勿重跑;顺序跑全部迁移的脚本要把本文件跳过。
-- gateway_run_id 无索引(专家行按它扫表);要加走新文件 0082:CREATE INDEX IF NOT EXISTS idx_fruns_gw ON formula_runs(gateway_run_id, step, experts);
ALTER TABLE formula_runs ADD COLUMN gateway_run_id INTEGER;
