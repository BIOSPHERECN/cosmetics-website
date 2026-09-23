-- 销售知识库(2026-09-16 创始人:「作为 CRM 的知识库,让业务员快速提升」)。rules-for-ai 一篇进模型提示词。
CREATE TABLE IF NOT EXISTS playbooks (slug TEXT PRIMARY KEY, title TEXT NOT NULL, tags TEXT, body TEXT NOT NULL, source TEXT, uid INTEGER, updated_at TEXT DEFAULT (datetime('now')));
