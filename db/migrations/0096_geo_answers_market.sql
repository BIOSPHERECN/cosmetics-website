-- 0096 买手问答扩容(2026-09-18 创始人:「SEO、GEO 要真的给我们带入客户」)。
-- geo_answers 从 27 扩到 100(tools/geo/answers-expand.py 生成),新题按市场 / 品类挂到法规页与意图页的「相关问答」——
-- 之前的挂法只认 slug = notify-<市场>,新题 slug 各异,靠这两列匹配。NULL = 通用题(不按市场挂)。
ALTER TABLE geo_answers ADD COLUMN market TEXT;      -- 市场代码,与 regulations.id / OEM_MARKETS.id 同口径(id / my / sa / ae / ph / vn / th / us / eu / cn …)
ALTER TABLE geo_answers ADD COLUMN category TEXT;    -- 品类,与 OEM_CATEGORIES.id 同口径(skincare / body-care / hair-care / cleansing / sun-care / makeup)
ALTER TABLE geo_answers ADD COLUMN expert TEXT;      -- 生成时套的专家 slug(expert_skills.slug),溯源用
CREATE INDEX IF NOT EXISTS idx_geo_market ON geo_answers(market);
-- 老题回填:notify-<市场> 与三条单市场题按 slug 反推市场,其余保持 NULL(通用)
UPDATE geo_answers SET market = substr(slug, 8) WHERE slug LIKE 'notify-%';
UPDATE geo_answers SET market = 'us' WHERE slug = 'us-mocra';
UPDATE geo_answers SET market = 'eu' WHERE slug = 'eu-cpnp-cpsr';
UPDATE geo_answers SET market = 'cn' WHERE slug = 'china-filing';
