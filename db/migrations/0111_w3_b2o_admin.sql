-- 0111 · W3 后台三件(2026-09-24):客户产品档案加「同意 5 列」。
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/DDL草案-客户侧-未执行-v2.sql §A0(「7 天先灌」那批,只这 5 列;§A–§G 等 14 天合并迁移)。
-- 只加法。ALTER ADD COLUMN 不幂等:执行前 PRAGMA table_info(b2o_profiles) 核实 5 列都不存在。
-- 回滚:D1(SQLite ≥3.35)可 ALTER TABLE b2o_profiles DROP COLUMN <列>;列全空,删列不丢数据。
ALTER TABLE b2o_profiles ADD COLUMN contact_ref   TEXT;  -- 主联系人内部编号(客户代号-角色,如 C9001-选品);不是手机号 / 微信号
ALTER TABLE b2o_profiles ADD COLUMN consent_at    TEXT;  -- 处理同意时间
ALTER TABLE b2o_profiles ADD COLUMN consent_ver   TEXT;  -- 告知版本,如 pi-2026-09-v1
ALTER TABLE b2o_profiles ADD COLUMN consent_via   TEXT;  -- web-checkbox / wecom-first-msg / paper / verbal-noted
ALTER TABLE b2o_profiles ADD COLUMN consent_xb_at TEXT;  -- 出境单独同意时间(PIPL 第 39 条);空 = 未同意出境
