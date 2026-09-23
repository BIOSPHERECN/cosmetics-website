-- 0088 成分—产品关系表(GPT 设计包 product_ingredients 落到现有 D1;2026-09-18 映射文档任务 I)
-- 依据:原料页 instr 子串匹配 PEG-8 会命中 PEG-80;按 decoder.ts splitInci+factKey 切好的键精确 JOIN
-- seq 从 1 = 标签标示顺序;GPT 原则「INCI 顺序 ≠ 精确浓度」,只存顺序不存浓度
CREATE TABLE IF NOT EXISTS market_product_inci (
  product_id INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  inci_key   TEXT    NOT NULL,
  PRIMARY KEY (product_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_mpi_key     ON market_product_inci (inci_key);
CREATE INDEX IF NOT EXISTS idx_mpi_key_pid ON market_product_inci (inci_key, product_id);
