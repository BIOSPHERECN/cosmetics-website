-- 外部参考库(2026-09-16 05:27):WorkBuddy 抓的 jxxy.net 等资料 Markdown 进这里,和业务员自己的 playbooks 分开;只内部参考,不对外,不进产品。
CREATE TABLE IF NOT EXISTS kb_docs (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT, tags TEXT, source_url TEXT, source_site TEXT, body TEXT NOT NULL,
  n INTEGER, imported_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kb_docs_cat ON kb_docs(category);
