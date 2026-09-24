-- 09-24 D2 公司库读量第二轮:/inci/[registry]/?p=N 不带词的翻页是读量第一名(3 小时 1,780 次 × 3.9 万行 = 6,900 万行)。
-- 原来只有 idx_inci_registry(registry):先取整个目录再临时排序 ORDER BY no,eu-cosing 一次 3.6 万行。
-- (registry, no) 让它按索引顺序只读 OFFSET+50 行。回滚:DROP INDEX IF EXISTS idx_inci_reg_no;
CREATE INDEX IF NOT EXISTS idx_inci_reg_no ON inci_catalog (registry, no);
