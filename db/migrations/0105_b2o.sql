-- BEAUTY2OEM(帛卉 · 国内跨境卖家产品共创)三张业务表,2026-09-23 A7 线。
-- 字段依据:助手交付/BEAUTY2OEM/跨境共创SOP与专家预判-讨论摘要-20260923.md(§四 §五 §六 + 17:4x 正式收拢)

-- 客户产品档案:简报表单写入;trust_level = 认同七级(0 未接触,1 信息 … 7 战略),next_proof = 下一步要证明什么
CREATE TABLE IF NOT EXISTS b2o_profiles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id    INTEGER,
  company       TEXT, contact TEXT, wechat TEXT, phone TEXT, email TEXT,
  own_brand     TEXT,
  platforms     TEXT,
  markets_now   TEXT, markets_next TEXT,
  cats_now      TEXT, cats_next TEXT,
  store_url     TEXT, hero_urls TEXT,
  price_band    TEXT, best_sellers TEXT, monthly_new TEXT,
  mode          TEXT,
  traffic       TEXT,
  factory_pain  TEXT, core_need TEXT, decision_time TEXT, scale TEXT,
  trust_level   INTEGER NOT NULL DEFAULT 0,
  next_proof    TEXT,
  brief_due_at  TEXT,
  brief_sent_at TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_profiles_status ON b2o_profiles(status, created_at);

-- 产品机会卡:公开层是普通列;member_json = 注册会员层;strategic_json = 战略客户层(前台永不读)
CREATE TABLE IF NOT EXISTS b2o_opp_cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT UNIQUE,
  status         TEXT NOT NULL DEFAULT 'draft',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  country        TEXT, platform TEXT,
  stage          TEXT,
  headline       TEXT,
  signals        TEXT,
  reasoning      TEXT,
  counter        TEXT,
  verdict        TEXT,
  member_json    TEXT NOT NULL DEFAULT '{}',
  strategic_json TEXT NOT NULL DEFAULT '{}',
  source         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_cards_pub ON b2o_opp_cards(status, sort_order);

-- 预判记录簿:对的错的都留;正方 / 反方 / 裁决;30/60/90 天回填;商业命中四个计数
CREATE TABLE IF NOT EXISTS b2o_predictions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id       INTEGER,
  made_at       TEXT NOT NULL DEFAULT (date('now')),
  title         TEXT NOT NULL,
  fact          TEXT, anomaly TEXT,
  pro           TEXT, con TEXT, ruling TEXT,
  analogy       TEXT, uncertainty TEXT, invalidation TEXT, action TEXT,
  verdict       TEXT,
  r30           TEXT, r60 TEXT, r90 TEXT,
  outcome       TEXT NOT NULL DEFAULT 'pending',
  biz_inquiries INTEGER NOT NULL DEFAULT 0,
  biz_samples   INTEGER NOT NULL DEFAULT 0,
  biz_quotes    INTEGER NOT NULL DEFAULT 0,
  biz_orders    INTEGER NOT NULL DEFAULT 0,
  is_public     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_b2o_pred_pub ON b2o_predictions(is_public, made_at);
