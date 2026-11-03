-- 0017(2026-09-03):选品台内容的多语层。
-- 为什么单独一张通用表而不是给每张表配 *_i18n:
--   配方/包材/爆款三类的可译字段少且形状一致(都是短句),
--   一张 (类型, 编号, 语言, 字段) 的表就够,新增品类不用再加表。
-- 翻译由 GitHub Actions 调模型完成(Agnes 封了 Worker 出口 IP),
--   Worker 只做「给待译清单」与「收翻译结果」,见 /api/cron/i18n。
CREATE TABLE IF NOT EXISTS catalog_i18n (
  ref_type   TEXT NOT NULL,          -- formula / packaging / trend
  ref_code   TEXT NOT NULL,          -- formulas.code / packaging.code / trends.id
  lang       TEXT NOT NULL,
  field      TEXT NOT NULL,          -- texture / cert_notes / ai_summary / notes / so_what / title
  text       TEXT NOT NULL,
  mt         INTEGER NOT NULL DEFAULT 1,   -- 1=机器翻译(后台可标记人工校对过)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ref_type, ref_code, lang, field)
);
CREATE INDEX IF NOT EXISTS idx_catalog_i18n_lang ON catalog_i18n(lang, ref_type);
