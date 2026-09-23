-- 0047(2026-09-07):补回 453 条被当成「已翻译」存下来的英文原文标题。
-- 外部诊断先发现泰/印地/菲首页 title 是英文,一查是全站性的:
-- 13 个语种共 453 条 page_i18n.title 等于英文原文,mt 却标着 1。
-- 翻译失败被记成了成功 —— 和今天另外两次事故同一个病根。
-- 只动 title 一列;译文等于原文、或非拉丁语种译出全 ASCII 的,一律不写。

UPDATE page_i18n SET title='Lĩnh vực hoạt động', mt=1 WHERE page_id=40 AND lang='vn';
UPDATE page_i18n SET title='Sản xuất', mt=1 WHERE page_id=41 AND lang='vn';
UPDATE page_i18n SET title='Chất lượng & Tuân thủ', mt=1 WHERE page_id=48 AND lang='vn';
UPDATE page_i18n SET title='Ươm tạo thương hiệu', mt=1 WHERE page_id=42 AND lang='vn';
UPDATE page_i18n SET title='Phân tích da bằng AI', mt=1 WHERE page_id=88 AND lang='vn';
UPDATE page_i18n SET title='Phân tích da bằng AI', mt=1 WHERE page_id=89 AND lang='vn';
UPDATE page_i18n SET title='Phân tích da bằng AI', mt=1 WHERE page_id=90 AND lang='vn';
UPDATE page_i18n SET title='Studio Đồng Sáng Tạo AI', mt=1 WHERE page_id=95 AND lang='vn';
