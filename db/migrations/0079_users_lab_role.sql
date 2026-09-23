-- 实验室角色(2026-09-17 创始人:「总工 / 配方师 / 打版员 / 业务 / 老板 / 管理员」)。NULL = 非实验室成员。
-- 本文件只此一句且不幂等:灌前先 d1("PRAGMA table_info(users)") 确认没有 lab_role;灌后再查一次;d1_exec 返回 0 且打印「灌库失败」时先查 PRAGMA 再决定要不要重跑。
ALTER TABLE users ADD COLUMN lab_role TEXT;
