-- 0121 · C2 客户档案详情页(2026-09-24):客户侧 DDL 草案 v2 的 §A / §B / §D / §E,外加 2 列本页需要的。
-- 依据:助手交付/BEAUTY2OEM/SOP执行版-v1/03-客户信息管理与CRM-全局设计-v2.md §2.2 §3.2 §4 §7;DDL草案-客户侧-未执行-v2.sql。
-- 不含(本页用不到,留给后续迁移,避免和 C3 预判撞列):§C b2o_profile_cards、§F deals/inquiries.card_id、§G pi_requests。
--   matters.order_type 已由 0118 加过,这里不再出现。同意 5 列已由 0111 加过。
-- 草案之外新增 2 列:b2o_profiles.grade_in_json(A/B/C 打分的输入,代码按公式重算用)、b2o_trust_log.pending(软信号 L5+ 与降级待主管确认)。
-- 只加法。ADD COLUMN 不幂等:执行前 PRAGMA table_info(b2o_profiles/activities/contacts) 核实下列列都不存在(09-24 已核:都不存在)。
-- 回滚:DROP TABLE b2o_trust_log; 各表 ALTER TABLE ... DROP COLUMN <列>(新列全空,不丢数据)。
-- 个人信息(G13):不新增任何手机号 / 微信号 / 姓名 / 具名邮箱列;联系人只存 contact_ref(如 C9001-选品)。

-- §A 客户产品档案扩列
ALTER TABLE b2o_profiles ADD COLUMN company_id     INTEGER;   -- = companies.id(唯一客户主键)
ALTER TABLE b2o_profiles ADD COLUMN seller_type    TEXT;      -- brand / tiktok / storegroup / catalog / channel / trader / factory
ALTER TABLE b2o_profiles ADD COLUMN grade          TEXT;      -- A / B / C / X;代码按 §2.2 公式算(lib/b2o-grade.ts),不手填
ALTER TABLE b2o_profiles ADD COLUMN grade_score    INTEGER;   -- 0–100
ALTER TABLE b2o_profiles ADD COLUMN grade_why      TEXT;      -- 各项得分 + 初评 / 重评
ALTER TABLE b2o_profiles ADD COLUMN grade_ok_by    INTEGER;   -- 销售确认分级的 users.id;NULL = 机器评未确认
ALTER TABLE b2o_profiles ADD COLUMN grade_in_json  TEXT NOT NULL DEFAULT '{}';  -- 打分输入 {cat, scale:[], timing, reach, x, small_only}
ALTER TABLE b2o_profiles ADD COLUMN money_model    TEXT;
ALTER TABLE b2o_profiles ADD COLUMN users_desc     TEXT;
ALTER TABLE b2o_profiles ADD COLUMN content_cap    TEXT;
ALTER TABLE b2o_profiles ADD COLUMN kol_cap        TEXT;
ALTER TABLE b2o_profiles ADD COLUMN supplier_count TEXT;
ALTER TABLE b2o_profiles ADD COLUMN decision_role  TEXT;      -- 只写角色,不写姓名
ALTER TABLE b2o_profiles ADD COLUMN test_cycle     TEXT;
ALTER TABLE b2o_profiles ADD COLUMN product_pref   TEXT;
ALTER TABLE b2o_profiles ADD COLUMN future_plan    TEXT;
ALTER TABLE b2o_profiles ADD COLUMN sku_roles_json TEXT NOT NULL DEFAULT '[]';  -- [{sku,url,role,price,note}],role ∈ 引流/利润/复购/内容/品牌/实验
ALTER TABLE b2o_profiles ADD COLUMN gap_note       TEXT;
ALTER TABLE b2o_profiles ADD COLUMN src_json       TEXT NOT NULL DEFAULT '{}';  -- {字段:S/P/A/I}
ALTER TABLE b2o_profiles ADD COLUMN source_channel TEXT;
ALTER TABLE b2o_profiles ADD COLUMN pool           TEXT NOT NULL DEFAULT 'active';  -- active / nurture / dropped / dnd
ALTER TABLE b2o_profiles ADD COLUMN nurture_until  TEXT;
ALTER TABLE b2o_profiles ADD COLUMN trust_at       TEXT;
ALTER TABLE b2o_profiles ADD COLUMN proven_json    TEXT NOT NULL DEFAULT '[]';
ALTER TABLE b2o_profiles ADD COLUMN next_action    TEXT;
ALTER TABLE b2o_profiles ADD COLUMN next_due       TEXT;
ALTER TABLE b2o_profiles ADD COLUMN last_in_at     TEXT;
ALTER TABLE b2o_profiles ADD COLUMN last_out_at    TEXT;
ALTER TABLE b2o_profiles ADD COLUMN silent_n       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE b2o_profiles ADD COLUMN data_auth_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE b2o_profiles ADD COLUMN public_ok      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE b2o_profiles ADD COLUMN delete_req_at  TEXT;
ALTER TABLE b2o_profiles ADD COLUMN purged_at      TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_b2o_profiles_company ON b2o_profiles(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2o_profiles_due   ON b2o_profiles(pool, next_due);
CREATE INDEX IF NOT EXISTS idx_b2o_profiles_trust ON b2o_profiles(pool, trust_level, trust_at);

-- §B 认同等级变更记录(对的错的都留;补记行 evidence 以「补记:」开头)
CREATE TABLE IF NOT EXISTS b2o_trust_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id    INTEGER NOT NULL,
  company_id    INTEGER,
  from_lv       INTEGER NOT NULL,
  to_lv         INTEGER NOT NULL,
  kind          TEXT NOT NULL,                 -- up / down / nurture / revive / drop / dnd
  evidence_type TEXT NOT NULL,                 -- quote 客户原话 / action 客户动作 / system 系统事件
  evidence      TEXT NOT NULL,                 -- ≤100 字,不写联系方式和姓名
  trig          TEXT,
  ref_type      TEXT,
  ref_id        INTEGER,
  next_proof    TEXT,
  by_uid        INTEGER,
  confirmed_by  INTEGER,                       -- L5 及以上与降级需主管确认
  pending       INTEGER NOT NULL DEFAULT 0,    -- 1 = 待主管确认、尚未落级(软信号 L5+ / 降级);确认后置 0 并落级
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_trust_log_profile ON b2o_trust_log(profile_id, at);

-- §D 跟进日志 = activities 扩列
ALTER TABLE activities ADD COLUMN direction   TEXT;
ALTER TABLE activities ADD COLUMN trig        TEXT;
ALTER TABLE activities ADD COLUMN cust_act    TEXT;
ALTER TABLE activities ADD COLUMN effective   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activities ADD COLUMN evidence    TEXT;
ALTER TABLE activities ADD COLUMN approved_by INTEGER;
ALTER TABLE activities ADD COLUMN lv_at       INTEGER;
CREATE INDEX IF NOT EXISTS idx_activities_act ON activities(cust_act, created_at);

-- §E 联系人:只加角色与引用,不加 wechat / phone
ALTER TABLE contacts ADD COLUMN role        TEXT;
ALTER TABLE contacts ADD COLUMN is_decision INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN contact_ref TEXT;
ALTER TABLE contacts ADD COLUMN consent_at  TEXT;
ALTER TABLE contacts ADD COLUMN dnd_at      TEXT;
