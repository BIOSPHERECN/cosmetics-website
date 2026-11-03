-- 0020(2026-09-03):深度专题线。
-- 为什么与 news 分开:news 是快讯(800–1000 字、单源改写、每天几条),
--   reports 是专题(6000–15000 字、多源交叉、结论前置、附可核查来源清单),
--   两者的生产方式、校验标准、页面呈现都不一样,混在一张表里迟早互相将就。
-- 生产全部在 GitHub Actions:万字长文要分节生成、每节都要取证,
--   Worker 免费档单次 50 个子请求写不完一节。网站只负责派题、收稿、发布。
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'guide',   -- guide(操作指南)/ report(市场专题)/ compare(选型对比)
  topic       TEXT NOT NULL,                   -- 派题时写的题目
  market      TEXT NOT NULL DEFAULT 'GLOBAL',
  category    TEXT,
  title_zh    TEXT, title_en TEXT,
  summary_zh  TEXT, summary_en TEXT,           -- 结论前置的那一句
  body_zh     TEXT, body_en TEXT,              -- Markdown,含表格
  sources_json TEXT NOT NULL DEFAULT '[]',     -- [{title,url,date,publisher}] —— 末尾「本文来源(可核查)」
  outline_json TEXT NOT NULL DEFAULT '[]',     -- 大纲,分节生成时的进度依据
  words_zh    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued → writing → drafted → published / failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  leased_at   TEXT,                            -- 领题租约:工人被杀掉后 40 分钟自动回队
  err         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_q ON reports(status, created_at);

-- 开线先派 6 个题:全部是采购方真会搜、且我们答得出的题目
INSERT OR IGNORE INTO reports (slug, kind, topic, market, category) VALUES
 ('cn-filing-2026', 'guide', '2026 中国化妆品备案与注册全流程:每个环节的真实耗时、费用量级与常见驳回原因', 'CN', 'regulatory'),
 ('eu-cpnp-2026', 'guide', '出口欧盟怎么走:CPNP 通报、责任人、PIF 与 CPSR 的分工与时间线', 'EU', 'regulatory'),
 ('us-mocra-2026', 'guide', '美国 MoCRA 之后:设施注册、产品列名、责任人与 OTC 防晒的实际影响', 'US', 'regulatory'),
 ('latam-brazil-2026', 'report', '南美市场怎么进:巴西 ANVISA 与墨西哥 COFEPRIS 的准入路径、爆款品类与价格带', 'LATAM', 'market'),
 ('sampling-cost-2026', 'guide', '打样费为什么收、怎么算:从配方开发到大货的每一笔钱花在哪', 'GLOBAL', 'business'),
 ('pdrn-exosome-2026', 'report', 'PDRN 与外泌体:全球监管分化下,OEM 工厂能接什么单、不能接什么单', 'GLOBAL', 'ingredient');
