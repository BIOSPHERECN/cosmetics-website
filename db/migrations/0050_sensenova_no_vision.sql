-- 0050(2026-09-07):sensenova 的 can_vision 改成 0。
-- 实测:给它发图片消息不会报错,它照常返回格式正确的 JSON,
-- 但每一张都答 unknown —— 它看不见图。
-- 「模型答不知道」和「模型看不见图」在日志里长得一模一样,
-- 而这一位标错会让整批视觉任务静默产出空结果(今天就这么丢了两轮)。
UPDATE providers SET can_vision=0 WHERE id='sensenova';
