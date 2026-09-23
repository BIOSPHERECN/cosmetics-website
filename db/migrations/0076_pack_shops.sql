-- 1688 店铺(2026-09-16 创始人:「采集要找好的工厂,然后一个个收集」)。资质从店铺页读:入驻年 / 回头率 / 服务分 / 主营 / 所在地;
-- qualified = 自动达标(入驻≥5 年且回头率≥30%);decision = 老板 / 采购在后台点的「要 / 不要」,人拍板优先于自动。
CREATE TABLE IF NOT EXISTS pack_shops (
  shop_key TEXT PRIMARY KEY, shop_url TEXT, name TEXT, years INTEGER, repeat_rate REAL, score REAL, main_cat TEXT, loc TEXT,
  items INTEGER DEFAULT 0, qualified INTEGER DEFAULT 0, decision TEXT, note TEXT, first_seen TEXT, last_seen TEXT
);
