-- 0053(2026-09-08):询盘表加两个结构化字段。
--
-- 为什么加:现在只有 name/company/email/country/message。
-- 品类与数量级全靠客户写在留言里,跟单要逐条读、后台没法筛、也没法归因
-- 「哪类产品的询盘最多」。这两件恰恰是报价前必问的。
--
-- 为什么只加两个而不是八个:B2B 表单每多一个必填项完成率就掉一截。
-- 只问报价真正用得上的,其余留给留言。
ALTER TABLE inquiries ADD COLUMN category TEXT;
ALTER TABLE inquiries ADD COLUMN volume   TEXT;
