-- 成分事实表(2026-09-17 创始人看了 INCIDecoder 产品页:「他们的信息好像更全,是需要学习的,我们是不是也可以变成这样」「这些其实也是可以对外的」)。
-- 一个 inci_key 一行:功能、中英文一句话、刺激/致痘 0–5、红黄绿、标签;由 tools/ingredients/facts-build.py 灌,前台 /decoder/ 只读。
-- inci_key 约定(与 P 任务同):全成分按 (?<!\d)[,;,;] 切,去括号,大写,空白压单个空格(不是 cn-nmpa 那套非字母数字压空格)。
-- rating: green/yellow/red;irritancy/comedogenic 0–5;tags JSON 数组,取值集合固定:
--   alcohol, fragrance, allergen26, paraben, silicone, sulfate, essential-oil, mineral-oil, peg, formaldehyde-releaser, animal-derived
-- src: model(模型填过) | rule(模型失败只落规则字段)。幂等(IF NOT EXISTS)。
CREATE TABLE IF NOT EXISTS ingredient_facts (
  inci_key     TEXT PRIMARY KEY,
  name_zh      TEXT,           -- cn-nmpa-2021 标准中文名
  functions    TEXT,           -- eu-cosing 功能(英文,逗号分,去掉「功能 」前缀)
  functions_zh TEXT,           -- 功能中译,逗号分
  what_zh      TEXT,           -- ≤60 字:在配方里干什么与注意点
  what_en      TEXT,           -- ≤30 词
  irritancy    INTEGER,        -- 0–5
  comedogenic  INTEGER,        -- 0–5
  rating       TEXT,           -- green / yellow / red
  tags         TEXT,           -- JSON 数组
  src          TEXT,
  updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_facts_rating ON ingredient_facts(rating);

-- 分子结构(PubChem,公共领域;创始人 2026-09-17:「那么多资源库都要抓回来,图文展示」「他们还有图片」)。
-- 由 tools/ingredients/structures-load.py 从 data/ingredients/structures.json 灌;png_key 是 R2 键,图本身由后续 r2-copy 走。
CREATE TABLE IF NOT EXISTS ingredient_structures (
  inci_key TEXT PRIMARY KEY,
  cid      INTEGER,            -- PubChem CID
  formula  TEXT,               -- 分子式
  mw       REAL,               -- 分子量
  smiles   TEXT,
  iupac    TEXT,
  png_key  TEXT                -- R2 键;NULL = 没图
);
