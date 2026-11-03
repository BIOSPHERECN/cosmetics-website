-- 0125 · 09-24 安全架构 C2(会员搜索单次读行封顶 3,000,代码见 apps/web/src/lib/search.ts)
-- ① 解读库、知识图谱的搜索从 '%词%' 全表扫(解读库一个新词约 60 万行,图谱约 1 万行)改走 FTS5 trigram(同 0113 的做法);
-- ② 1–2 个字 trigram 查不了,只做名称前缀,靠下面三个普通索引走范围扫描。
-- 只做加法。回滚(表或索引不在时页面自动退回有上限的旧写法,删了不会让页面出错):
--   DROP TRIGGER market_products_fts_ai; DROP TRIGGER market_products_fts_ad; DROP TRIGGER market_products_fts_au; DROP TABLE market_products_fts;
--   DROP TRIGGER kg_nodes_fts_ai; DROP TRIGGER kg_nodes_fts_ad; DROP TRIGGER kg_nodes_fts_au; DROP TABLE kg_nodes_fts;
--   DROP INDEX idx_mp_brand; DROP INDEX idx_inci_reg_zh; DROP INDEX idx_inci_reg_key;
-- 注意:D1 不能 export 含虚拟表的库 —— tools/deploy-copy.py 已改成导出前删这两张表、导出后按本文件重建。
-- 一次性成本:rebuild 读 market_products 约 15 万行、kg_nodes 约 8 千行,写 FTS 段若干千行。
-- 执行:照 0113 用 `wrangler d1 execute bohui-cms-v2 --remote --file`(先 source 公司 .env);0113 的 5.7 万行 rebuild 约 1 分钟。
-- 若 market_products_fts 的 rebuild 超时:表已建好,改为分段灌(每段一条语句,互不影响):
--   INSERT INTO market_products_fts(rowid, brand, title, title_zh) SELECT id, brand, title, title_zh FROM market_products WHERE id > 0 AND id <= 20000;(依次 20000–40000 …)
--   分段灌之前表必须是空的(重复灌会让同一 rowid 进索引两次);不确定就先 INSERT INTO market_products_fts(market_products_fts) VALUES ('delete-all')。

CREATE VIRTUAL TABLE IF NOT EXISTS market_products_fts USING fts5(
  brand, title, title_zh, content = 'market_products', content_rowid = 'id', tokenize = 'trigram');
CREATE TRIGGER IF NOT EXISTS market_products_fts_ai AFTER INSERT ON market_products BEGIN
  INSERT INTO market_products_fts(rowid, brand, title, title_zh) VALUES (new.id, new.brand, new.title, new.title_zh);
END;
CREATE TRIGGER IF NOT EXISTS market_products_fts_ad AFTER DELETE ON market_products BEGIN
  INSERT INTO market_products_fts(market_products_fts, rowid, brand, title, title_zh) VALUES ('delete', old.id, old.brand, old.title, old.title_zh);
END;
-- 每日灌库的 UPSERT 会把这三列原样再写一遍:值没变就不动 FTS,省掉无谓的写
CREATE TRIGGER IF NOT EXISTS market_products_fts_au AFTER UPDATE OF brand, title, title_zh ON market_products
  WHEN old.brand IS NOT new.brand OR old.title IS NOT new.title OR old.title_zh IS NOT new.title_zh BEGIN
  INSERT INTO market_products_fts(market_products_fts, rowid, brand, title, title_zh) VALUES ('delete', old.id, old.brand, old.title, old.title_zh);
  INSERT INTO market_products_fts(rowid, brand, title, title_zh) VALUES (new.id, new.brand, new.title, new.title_zh);
END;
INSERT INTO market_products_fts(market_products_fts) VALUES ('rebuild');

CREATE VIRTUAL TABLE IF NOT EXISTS kg_nodes_fts USING fts5(name, content = 'kg_nodes', content_rowid = 'id', tokenize = 'trigram');
CREATE TRIGGER IF NOT EXISTS kg_nodes_fts_ai AFTER INSERT ON kg_nodes BEGIN
  INSERT INTO kg_nodes_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER IF NOT EXISTS kg_nodes_fts_ad AFTER DELETE ON kg_nodes BEGIN
  INSERT INTO kg_nodes_fts(kg_nodes_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER IF NOT EXISTS kg_nodes_fts_au AFTER UPDATE OF name ON kg_nodes WHEN old.name IS NOT new.name BEGIN
  INSERT INTO kg_nodes_fts(kg_nodes_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO kg_nodes_fts(rowid, name) VALUES (new.id, new.name);
END;
INSERT INTO kg_nodes_fts(kg_nodes_fts) VALUES ('rebuild');

-- 1–2 字前缀:解读库按品牌;原料目录按「目录 + 中文名」「目录 + INCI 键」(页面用 INDEXED BY 指名,索引不在时报错退回空结果,不会整扫)
CREATE INDEX IF NOT EXISTS idx_mp_brand ON market_products (brand);
CREATE INDEX IF NOT EXISTS idx_inci_reg_zh ON inci_catalog (registry, name_zh);
CREATE INDEX IF NOT EXISTS idx_inci_reg_key ON inci_catalog (registry, inci_key);
