-- 0089 ESG 全绿规则表 + 版本 ESG 结果列(2026-09-18 创始人:「开发部是需要符合 ESG 规范全绿的配方」;总工 09-17:「客户都要求全绿合规」)
-- 四支柱 pillar:regulatory 法规 / environment 环境 / social 社会 / safety 安全;每条 basis 写法规名+条款,note 一律「以最新官方文本为准」
-- match_type=registry 的 pattern 形如 'cn-stsc:CN-109/'(前缀匹配 inci_catalog.registry:no,带斜杠防 II 撞 III)
-- 规则由 tools/esg/rules-seed.py 灌(DELETE standard 再 INSERT),表结构幂等
CREATE TABLE IF NOT EXISTS esg_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  standard   TEXT DEFAULT 'bohui-esg-v1',
  pillar     TEXT CHECK(pillar IN ('regulatory','environment','social','safety')),
  scope      TEXT DEFAULT 'ALL',   -- 'ALL' 或逗号市场码 eu,cn,us,us-ca,us-hi,kr,jp,asean,br,ca,fr,palau,id
  applies    TEXT DEFAULT 'all',   -- all|rinse-off|leave-on|sunscreen
  match_type TEXT CHECK(match_type IN ('key','prefix','contains','regex','tag','registry')),
  pattern    TEXT,
  severity   TEXT CHECK(severity IN ('red','yellow')),
  title_zh   TEXT,
  reason_zh  TEXT,
  basis      TEXT,
  basis_url  TEXT,
  effective_from TEXT,
  limit_pct  REAL,
  note       TEXT,
  active     INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_esg_rules_std ON esg_rules(standard, active);
-- 版本卡存 esgCheck 结果(形状见契约);ALTER 不幂等,只跑一次
ALTER TABLE formula_versions ADD COLUMN esg_json TEXT;
