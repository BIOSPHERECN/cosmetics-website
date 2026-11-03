-- 0054(2026-09-08):导航「选品链路」指向新的链位工作台。
-- 旧 /selector/ 已改成 301,站内既有链接与外部收录都不会断。
UPDATE pages SET slug='chain' WHERE site_id='biosphere-ai' AND slug='selector';
