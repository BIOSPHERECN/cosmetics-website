-- 每站的视觉主题。
-- 此前主题写死在 BaseLayout 里(data-summer),5 个站没有一个能切 ——
-- 而创始人认可的是深金那一版。风格决定权本该在后台一个下拉框里,不该焊在代码里。
ALTER TABLE sites ADD COLUMN theme TEXT NOT NULL DEFAULT 'noir';
