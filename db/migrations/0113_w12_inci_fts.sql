-- 0113 · 09-24 突击第 3 波 3A
-- ① beauty2oem 顶栏加「洞察」(页面本身是 src/pages/[lang]/insights.astro,这一行只给导航用)
-- ② W12:/inci/[reg] 搜索的 '%词%' 子串匹配改走 FTS5 trigram(eu-cosing 每次整扫 36,023 行)
-- 只做加法。回滚:
--   DELETE FROM page_i18n WHERE page_id=(SELECT id FROM pages WHERE site_id='beauty2oem' AND slug='insights');
--   DELETE FROM pages WHERE site_id='beauty2oem' AND slug='insights';
--   DROP TRIGGER inci_catalog_fts_ai; DROP TRIGGER inci_catalog_fts_ad; DROP TRIGGER inci_catalog_fts_au; DROP TABLE inci_catalog_fts;
--   (页面查询失败会自动回退 LIKE,删表不会让页面出错)
-- 注意:D1 不能 export 含虚拟表的库 —— tools/deploy-copy.py 已改成导出前删、导出后按本文件重建。

INSERT OR IGNORE INTO pages (site_id, slug, template, in_nav, sort_order, status)
VALUES ('beauty2oem', 'insights', 'standard', 1, 5, 'published');
INSERT OR IGNORE INTO page_i18n (page_id, lang, nav_label, title)
SELECT id, 'zh-cn', '洞察', '跨境美妆卖家选品与供应链洞察(2026 秋)' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'insights';

-- trigram:任意 3 字以上子串,大小写不敏感,中英通吃;不足 3 字页面仍走 LIKE
CREATE VIRTUAL TABLE IF NOT EXISTS inci_catalog_fts USING fts5(
  inci_key, name_zh, content = 'inci_catalog', content_rowid = 'rowid', tokenize = 'trigram');

CREATE TRIGGER IF NOT EXISTS inci_catalog_fts_ai AFTER INSERT ON inci_catalog BEGIN
  INSERT INTO inci_catalog_fts(rowid, inci_key, name_zh) VALUES (new.rowid, new.inci_key, new.name_zh);
END;
CREATE TRIGGER IF NOT EXISTS inci_catalog_fts_ad AFTER DELETE ON inci_catalog BEGIN
  INSERT INTO inci_catalog_fts(inci_catalog_fts, rowid, inci_key, name_zh) VALUES ('delete', old.rowid, old.inci_key, old.name_zh);
END;
-- 只盯两列:别的列(cas、限量、备注)批量回填时不产生 FTS 写
CREATE TRIGGER IF NOT EXISTS inci_catalog_fts_au AFTER UPDATE OF inci_key, name_zh ON inci_catalog BEGIN
  INSERT INTO inci_catalog_fts(inci_catalog_fts, rowid, inci_key, name_zh) VALUES ('delete', old.rowid, old.inci_key, old.name_zh);
  INSERT INTO inci_catalog_fts(rowid, inci_key, name_zh) VALUES (new.rowid, new.inci_key, new.name_zh);
END;

INSERT INTO inci_catalog_fts(inci_catalog_fts) VALUES ('rebuild');
