-- 配方实验室 v0(2026-09-17 创始人:「功能上强大,使用上要简单」)。全部 IF NOT EXISTS,可重跑。
-- materials / formula_recipes / material_prices / filing_* / formula_docs / sample_orders 的列名依赖明天三份样例,放 0081。

CREATE TABLE IF NOT EXISTS formula_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                    -- YYMM-NNN(北京时间),如 2609-001
  customer TEXT,
  category TEXT NOT NULL,                       -- formulas 现有英文码:skincare/body/makeup/oral/cleansing/suncare/haircare/kids/fragrance
  format TEXT NOT NULL,                         -- formulas 现有英文码;手填剂型也存这里(候选按品类筛)
  claims TEXT NOT NULL DEFAULT '',              -- 目标功效,中文逗号串
  markets TEXT NOT NULL DEFAULT 'cn',           -- 逗号串,取值 = regulations.id:cn/eu/us/jp/kr/asean
  constraints_json TEXT NOT NULL DEFAULT '{}',  -- {halal,vegan,fragrance_free,no_mit_cmit,preservative_free,ph_low,ph_high,other}
  cost_band TEXT,                               -- low/mid/high
  brief TEXT,                                   -- 客户与竞品参考
  status TEXT NOT NULL DEFAULT 'open',          -- open/sampling/final
  owner_uid INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fp_status ON formula_projects(status, updated_at);

CREATE TABLE IF NOT EXISTS formula_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  step TEXT NOT NULL,                           -- recommend | generate
  round INTEGER NOT NULL DEFAULT 1,             -- 页面传;同一轮左右两行同 round
  side TEXT NOT NULL,                           -- L | R
  attempt INTEGER NOT NULL DEFAULT 1,           -- 重试 +1,每次一行
  provider_id TEXT,
  model TEXT,
  is_free INTEGER NOT NULL DEFAULT 0,           -- 1 = 走了临时免费兜底
  experts TEXT NOT NULL DEFAULT '',             -- 召集的 slug 逗号串
  prompt_hash TEXT,                             -- sha256(system + user),两栏同值即同题
  input_json TEXT NOT NULL,                     -- 完整 messages + meta(含比例区间与维基页,属 recipe 字段组)
  raw_text TEXT,                                -- 模型原文(解析失败时也留,前 8000 字)
  output_json TEXT,                             -- 解析后的 JSON
  gate_json TEXT,                               -- {red:[],yellow:[],dropped:[],tiers:{①:n,②:n,③:n}}
  ok INTEGER NOT NULL DEFAULT 0,
  err TEXT,
  ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  chosen INTEGER NOT NULL DEFAULT 0,
  uid INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fruns_p ON formula_runs(project_id, step, round);

CREATE TABLE IF NOT EXISTS formula_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,                  -- v1 v2 …;定稿配方编号 v1 期才发
  parent_version_id INTEGER,                    -- op:'edit' 时指向被改的版本
  source_run_id INTEGER NOT NULL,
  base_codes TEXT NOT NULL DEFAULT '',          -- 勾选基底 formulas.code 逗号串
  recipe_json TEXT NOT NULL,                    -- 行数组;唯一含比例的列
  rationale_json TEXT,                          -- {process, ph_window, efficacy_logic, selling_points, risks, verify, decisions_for_customer}
  gate_json TEXT,                               -- 采纳时的闸门结果 + {edited:1} 标记
  status TEXT NOT NULL DEFAULT 'draft',         -- draft/sampled/final
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, version_no)
);

CREATE TABLE IF NOT EXISTS formula_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,             -- 该版本第几次打版
  ph REAL,
  viscosity TEXT,                               -- 先 TEXT(mPa·s 数值或描述),明天按表改
  centrifuge TEXT,
  freeze_thaw TEXT,
  accel_40c TEXT,
  appearance TEXT,
  odor TEXT,
  skin_feel TEXT,
  customer_text TEXT,
  decision TEXT,                                -- adjust | accept
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ffb_v ON formula_feedback(version_id);

CREATE TABLE IF NOT EXISTS formula_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  kind TEXT NOT NULL,                           -- recipe | cost(cost 今晚只建不写)
  ref TEXT NOT NULL,                            -- run:123 | version:7
  at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_falog ON formula_access_log(uid, at);

CREATE TABLE IF NOT EXISTS expert_skills (
  slug TEXT PRIMARY KEY,                        -- 保留 bohui- 前缀
  kind TEXT NOT NULL DEFAULT 'expert',          -- expert | panel
  domain TEXT NOT NULL,                         -- 专家:description「。」前最后一个括号;panel 固定 '总控'
  title TEXT NOT NULL,                          -- 「# 」一级标题
  triggers TEXT NOT NULL DEFAULT '',            -- **何时召集** 段原文;panel 为空
  core TEXT NOT NULL,                           -- 专家:头部 + 开口前必问 + 判断口径 + 红线;panel:= body
  body TEXT NOT NULL,                           -- frontmatter 之后全文
  keywords TEXT NOT NULL DEFAULT '',            -- 「检索词:」行;panel 为空
  for_lab INTEGER NOT NULL DEFAULT 0,           -- 1 = 配方相关 23 位,召集只在这里挑
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wiki_pages (
  slug TEXT PRIMARY KEY,                        -- ingredient/{ingredients.slug} | format/{formulas.format}
  kind TEXT NOT NULL,                           -- ingredient | format
  title TEXT NOT NULL,                          -- 中文(剂型页用 formula-lab-zh.json 的 FORMAT_ZH)
  body_md TEXT NOT NULL,
  links_json TEXT NOT NULL DEFAULT '[]',        -- 互链 slug 数组
  sources_json TEXT NOT NULL DEFAULT '[]',      -- [{table,key}]
  version INTEGER NOT NULL DEFAULT 1,
  compiled_by TEXT NOT NULL DEFAULT 'script',   -- script | provider:{id}
  tier TEXT NOT NULL DEFAULT '①',               -- 整页最低认知档:脚本编译 ①,带模型综述 ②
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wiki_kind ON wiki_pages(kind);

-- inci_catalog(57,058 行)按 inci_key 查:gate() 每栏两次 IN、loadContext 一次、公开原料页也走它,没索引每次整表扫 5 万行。
-- 线上已手工建过同名索引(2026-09-17 sqlite_master 可见),这里补进迁移让仓库与线上一致;IF NOT EXISTS 可重跑。
CREATE INDEX IF NOT EXISTS idx_inci_catalog_key ON inci_catalog(inci_key);
