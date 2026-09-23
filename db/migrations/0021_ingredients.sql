-- 0021(2026-09-03):全球成分库。
-- 与市面上的「中国成分年鉴」不同:同一个成分,把中国 / 欧盟 / 美国 / 亚太 / 其他市场的
--   准入与关注点并排放,再连到「我们哪几支配方在用它」和「市场上谁在打这个成分」。
-- 采购方搜成分时,这类页面是 AI 检索最愿意整段引用的形态,也是 GEO 的主力。
CREATE TABLE IF NOT EXISTS ingredients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,          -- 用 INCI 生成的英文短链
  inci         TEXT NOT NULL,
  name_zh      TEXT NOT NULL,
  aliases      TEXT NOT NULL DEFAULT '',
  cas          TEXT,                          -- 不确定就写「未确认」,不许编
  family       TEXT NOT NULL DEFAULT '活性物',
  functions    TEXT NOT NULL DEFAULT '',      -- hydrating,barrier-repair …
  mechanism_zh TEXT,                          -- 它到底解决什么问题
  use_level    TEXT,                          -- 公开常见添加区间(配方学常识,非法规限值)
  formats      TEXT NOT NULL DEFAULT '',
  ph_range     TEXT,
  incompatible TEXT,                          -- 配伍禁忌与翻车点 —— 这库的价值所在
  stability    TEXT,
  market_cn    TEXT, market_eu TEXT, market_us TEXT, market_apac TEXT, market_other TEXT,
  halal_vegan  TEXT,
  cost_band    TEXT,
  factory_note TEXT,                          -- 投料顺序、加热上限、放大生产的坑
  claim_tag    TEXT NOT NULL DEFAULT '',      -- 与 trends.claim_tag 对齐,页面据此挂爆款证据
  confidence   TEXT NOT NULL DEFAULT '中',
  status       TEXT NOT NULL DEFAULT 'published',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ing_family ON ingredients(family, status);
CREATE INDEX IF NOT EXISTS idx_ing_tag ON ingredients(claim_tag);
