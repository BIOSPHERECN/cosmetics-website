-- 0087 治理层(2026-09-18)。依据:创始人「结合他的建议,继续推进系统的完善」+ GPT 设计包原则:
-- AI 结果默认 draft 人审后 approved;每次 AI 调用记 model+prompt 版本+输入哈希+tokens+耗时;任务要能看见谁停了(「看看他们有没有停止」);趋势要时间窗口。
-- 不重建,落到现有 D1。全部 IF NOT EXISTS,幂等;只建新表/新列,不动既有数据。

-- 提示词目录(GPT ai_prompt_versions):prompt_key + version 定位一份提示词,ai_runs 引用它
CREATE TABLE IF NOT EXISTS ai_prompts (
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  purpose TEXT,
  system_prompt TEXT,
  output_schema TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prompt_key, version)
);

-- 每次 AI 调用一行(GPT ai_runs):fleet.ts chat/vision/image 成败都落;cost_est 只在 providers 有单价时算,不编数字
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  prompt_key TEXT,
  prompt_version INTEGER,
  provider TEXT,
  model TEXT,
  entity_type TEXT,
  entity_id TEXT,
  input_hash TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_est REAL,
  latency_ms INTEGER,
  ok INTEGER,
  error TEXT,
  confidence REAL,
  review_status TEXT DEFAULT 'draft',
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_ts ON ai_runs(ts);
CREATE INDEX IF NOT EXISTS idx_ai_runs_provider_ts ON ai_runs(provider, ts);
CREATE INDEX IF NOT EXISTS idx_ai_runs_prompt ON ai_runs(prompt_key);

-- 任务中心(GPT jobs):后台脚本注册 + 心跳,一眼看到谁停了(创始人:「看看他们有没有停止」)
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  job_type TEXT,
  host TEXT,
  pid INTEGER,
  status TEXT DEFAULT 'running',
  progress INTEGER,
  total INTEGER,
  note TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at TEXT,
  finished_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_name_started ON jobs(name, started_at);

-- 每日出现记录:时间序列从今天开始积累(GPT:趋势要时间窗口;频率≠销量)
CREATE TABLE IF NOT EXISTS market_product_seen (
  product_id INTEGER NOT NULL,
  seen_date TEXT NOT NULL,
  PRIMARY KEY (product_id, seen_date)
);

-- AI 结果默认 draft,人审后 approved(GPT 原则 1)
ALTER TABLE market_products ADD COLUMN summary_status TEXT DEFAULT 'draft';
ALTER TABLE ingredient_facts ADD COLUMN review_status TEXT DEFAULT 'draft';
-- 每百万 tokens 单价(人民币);留空则 ai_runs.cost_est 为 NULL,不编数字
ALTER TABLE providers ADD COLUMN price_in REAL;
ALTER TABLE providers ADD COLUMN price_out REAL;

-- 提示词目录:P001–P009 purpose 抄 GPT prompt-catalog.md;system_prompt 占位,等各模块接上时再填真提示词
INSERT OR IGNORE INTO ai_prompts (prompt_key, version, purpose, system_prompt, output_schema) VALUES
('P001', 1, 'product_analyzer:输入产品名称、品牌、市场、价格、容量、claims、INCI;输出 positioning, target_consumer, claims, key_ingredients, botanical_profile, formula_structure, fragrance_profile, texture_profile, price_segment, differentiation, evidence, confidence', '占位:产品分析器,待接入时填真提示词', '{"type":"object"}'),
('P002', 1, 'formula_structure_analyzer:禁止输出精确添加量除非输入提供;输出 base_system, surfactant_system, emulsifier_system, silicone_system, oil_system, active_system, preservative_system, fragrance_system, texture_system, botanical_system, formula_fingerprint, confidence(一律 estimated)', '占位:配方骨架分析器,INCI 顺序≠精确浓度', '{"type":"object"}'),
('P003', 1, 'consumer_review_analyzer:输入评论;输出 purchase_reasons, complaints, desired_improvements, texture_feedback, fragrance_feedback, effect_feedback, sentiment_summary, confidence', '占位:消费者评论分析器', '{"type":"object"}'),
('P004', 1, 'ingredient_trend_analyzer:输入时间窗口、国家、品类、产品集合;输出 rising_ingredients, declining_ingredients, combinations, evidence, confidence;区分出现频率增长与销量增长,没有销量数据不得声称销量增长', '占位:成分趋势分析器,频率≠销量', '{"type":"object"}'),
('P005', 1, 'opportunity_generator:输入市场、品类、价格、产品/成分/评论/趋势统计、Bohui capability;输出 opportunity, evidence, risks, score_components, confidence;不得预测销量或宣称必然爆品', '占位:机会生成器,评分可解释', '{"type":"object"}'),
('P006', 1, 'customer_matcher:输入客户画像、需求、历史产品、候选机会、Bohui 能力;输出 matches[](score_components, reason, evidence, confidence)', '占位:客户匹配器,硬约束先过', '{"type":"object"}'),
('P007', 1, 'odm_generator:输入客户需求、市场机会、竞品结构、Bohui 原料、配方库、包材、工艺;输出 3 套差异化方案(formula_direction, hero_ingredients, claims, texture, fragrance, packaging, cost_target, development_risk, regulatory_questions)', '占位:ODM 方案生成器,套 41 位专家思维', '{"type":"object"}'),
('P008', 1, 'sales_message_generator:输入客户、推荐产品、证据;输出英文邮件、WhatsApp、LinkedIn 短消息;不得虚构客户信息、认证、测试结果、专利或市场数据', '占位:销售话术生成器,商务条款只用工厂口径', '{"type":"object"}'),
('P009', 1, 'formula_substitution_assistant:输入竞品成分结构、Bohui 可用原料;输出功能等价候选、成本方向、法规检查项、稳定性风险;不得声称完全等效', '占位:配方替代助手', '{"type":"object"}'),
-- 已在用的七个 key(version 1):配方实验室四步 + 成分事实 + 爆款简介 + 爆款中文
('LAB-GATEWAY', 1, '配方实验室·网关:从需求单选专家席位与提问(api/admin/formula-lab.ts op=gateway)', '提示词在代码 apps/web/src/lib/formula-lab-prompts 内', '{"type":"object"}'),
('LAB-EXPERT', 1, '配方实验室·专家:每位专家按席位问题给意见(op=expert)', '提示词在代码内', '{"type":"object"}'),
('LAB-SYNTH', 1, '配方实验室·汇总:刘/黄总工把专家意见合成一栏方案(op=synthesize / recommend / generate)', '提示词在代码内', '{"type":"object"}'),
('LAB-REVIEW', 1, '配方实验室·审核:李总工点评两版(op=review)', '提示词在代码内', '{"type":"object"}'),
('FACTS-BUILD', 1, '成分事实:tools/ingredients/facts-build.py 按 inci_key 批量出 what_zh/functions/rating', '提示词在脚本内', '{"type":"object"}'),
('PRODUCT-SUMMARY', 1, '爆款简介:tools/market/product_summaries.py 出 summary_zh/summary_en(AI 自写不抄)', '提示词在脚本内', '{"type":"object"}'),
('HOT-ZH', 1, '爆款中文:tools/market/hot_zh.py 出 title_zh/cat_zh', '提示词在脚本内', '{"type":"object"}');
