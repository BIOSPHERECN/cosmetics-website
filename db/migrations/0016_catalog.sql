-- 0016(2026-09-03):选品闭环三张表 —— 包材库、爆款情报,知识库补来源与关联字段。
-- 口径:formulas/packaging/trends 是「可筛选的事实层」,kb_entries 是「可编辑的叙述层」
--       (选型建议、专家经验、为什么这么选)。后台在知识库一处管理,AI 检索只查 kb + 三表。

CREATE TABLE IF NOT EXISTS packaging (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,          -- 包材号,如 AB-101
  type           TEXT NOT NULL,                 -- airless-bottle / dropper-bottle / jar / tube / stick ...
  material       TEXT NOT NULL DEFAULT '',      -- PP+PET / 玻璃+铝 / PCR-PET 50%
  capacity       TEXT,                          -- 30ml、15g、多规格用斜杠
  neck_size      TEXT,                          -- 18/415
  moq            INTEGER,
  lead_days      INTEGER,
  decoration     TEXT NOT NULL DEFAULT '',      -- 丝印,烫金,贴标
  sustainability TEXT NOT NULL DEFAULT '',      -- PCR 50%,可替换芯,单一材质
  compat_formats TEXT NOT NULL DEFAULT '',      -- serum,essence,oil —— 与 formulas.format 对齐
  cost_band      TEXT,                          -- low / mid / high
  notes_zh       TEXT,
  trend_tags     TEXT NOT NULL DEFAULT '',      -- 与 trends.claim_tag 对齐,用于「有证据的推荐」
  media_id       INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'sample',-- sample=示例规格(未经打样确认)/ active=真实在产
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_packaging_type ON packaging(type, status);

-- 爆款情报:每条必须带可核来源与日期,这是「证据链」的底座。无日期的不许入库。
CREATE TABLE IF NOT EXISTS trends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title_zh    TEXT NOT NULL,
  title_en    TEXT NOT NULL DEFAULT '',
  market      TEXT NOT NULL DEFAULT 'GLOBAL',   -- CN/EU/US/JP/KR/SEA/MEA/LATAM/GLOBAL
  category    TEXT NOT NULL DEFAULT '',
  format      TEXT NOT NULL DEFAULT 'any',
  claim_tag   TEXT NOT NULL DEFAULT '',         -- barrier-repair / pdrn / mono-material
  figure      TEXT,                             -- 可核数字,原文没有就留空
  source_name TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  source_date TEXT NOT NULL,                    -- YYYY-MM 或 YYYY-MM-DD,来自原文
  so_what_zh  TEXT,
  confidence  TEXT NOT NULL DEFAULT '中',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trends_tag ON trends(claim_tag, market);

-- 知识库补字段:归属(哪条配方/包材/专家)与来源(引用时能溯源)
ALTER TABLE kb_entries ADD COLUMN ref_type TEXT;      -- formula / packaging / expert / trend / general
ALTER TABLE kb_entries ADD COLUMN ref_code TEXT;      -- 对应 formulas.code / packaging.code / 专家 slug
ALTER TABLE kb_entries ADD COLUMN source_url TEXT;
ALTER TABLE kb_entries ADD COLUMN source_date TEXT;

-- 配方补两列:与爆款证据挂钩、以及是否示例
ALTER TABLE formulas ADD COLUMN trend_tags TEXT NOT NULL DEFAULT '';
