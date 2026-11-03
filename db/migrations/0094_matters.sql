-- 0094 业务协同工作台(2026-09-18 创始人发来「业务协同工作台」截图:「我们的工作台也非常的重要」)
-- 吸收的是机制不是界面:一条「业务事项」= 客户 + 需求 + 跟进 + 财务 + 其他 五段;状态机 待确认→跟进中→执行中→已完成→已回款(lost 已终止旁路);
-- 每次状态变更、每条跟进都进 matter_logs,时间线跨事项可看。
-- 铁令:amount / received / receivable 只由人填,接口不算、不补、不编;code 形如 BX20260918-001(北京时间当天序号)。
CREATE TABLE IF NOT EXISTS matters (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  company_id     INTEGER,                    -- 关联 companies(可空:客户还没建档也能先记事项)
  company_name   TEXT,
  contact        TEXT,
  phone          TEXT,
  industry       TEXT,
  kind           TEXT,                       -- 询盘 / 打样 / 报价 / 订单 / 售后 / 合作 / 其他
  title          TEXT,
  owner_uid      INTEGER,                    -- 负责人
  priority       TEXT DEFAULT 'normal',      -- low / normal / high / urgent
  due_date       TEXT,
  status         TEXT DEFAULT 'pending',     -- pending 待确认 / following 跟进中 / doing 执行中 / done 已完成 / paid 已回款 / lost 已终止
  next_follow_at TEXT,
  note           TEXT,
  amount         REAL,                       -- 合作金额(人填)
  received       REAL,                       -- 已收(人填)
  receivable     REAL,                       -- 待收(人填;到 paid 要求 <=0,否则要 force)
  currency       TEXT DEFAULT 'USD',
  invoice_status TEXT,                       -- 未开 / 已开 / 部分
  source         TEXT,                       -- 来源渠道
  follower_uid   INTEGER,                    -- 跟进人(可与负责人不同)
  internal_note  TEXT,
  inquiry_id     INTEGER,                    -- 由询盘转入时记原 id
  deal_id        INTEGER,                    -- 由机会转入时记原 id
  is_draft       INTEGER DEFAULT 0,
  created_by     INTEGER,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
CREATE INDEX IF NOT EXISTS idx_matters_owner  ON matters(owner_uid);
CREATE INDEX IF NOT EXISTS idx_matters_due    ON matters(due_date);
CREATE TABLE IF NOT EXISTS matter_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  matter_id   INTEGER NOT NULL,
  uid         INTEGER,
  at          TEXT DEFAULT CURRENT_TIMESTAMP,
  kind        TEXT,                          -- note / status / call / email / meeting / sample / quote / payment
  text        TEXT,
  from_status TEXT,
  to_status   TEXT
);
CREATE INDEX IF NOT EXISTS idx_matter_logs_matter ON matter_logs(matter_id, at);
