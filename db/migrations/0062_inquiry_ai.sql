-- 询盘 AI 分级与通知(2026-09-16,创始人:「说了就要做,而不是等」)
ALTER TABLE inquiries ADD COLUMN ai_grade TEXT;      -- A 立即跟 / B 本周跟 / C 观察 / spam
ALTER TABLE inquiries ADD COLUMN ai_summary TEXT;    -- 一句话摘要 + 建议下一步
ALTER TABLE inquiries ADD COLUMN notified_at TEXT;   -- 通知发出时间
