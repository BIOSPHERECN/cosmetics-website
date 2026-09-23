-- 0092 推演沙盘(2026-09-18 创始人:「1 省算力,2 推演,是不是很像我们 SueAI 的多专家探讨」「你需要把这些机制用于帛卉的规划上」)
-- 吸收 MiroFish 的 材料→实体关系→差异化 Agent→多轮互动→报告 五步,改成我们自己的:Agent 用 expert_skills 的角色专家口径,不是随机人格。
-- 一次推演一行;分步推进(Worker 单请求有时限):step new→entities→agents→round1…roundN→report→done,每步由接口 op=step 推一格。
-- entities_json / agents_json / transcript_json / report_json 全是 JSON 文本,形状见 apps/web/src/lib/sandbox.ts;tokens_in/out 累加各步 chat() 的 usage。
CREATE TABLE IF NOT EXISTS sandbox_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT,
  brief          TEXT,                       -- 议题原文(创始人一句话)
  market         TEXT,                       -- market_products.country 口径:kr / jp / us / eu / gl
  category       TEXT,                       -- market_products.cat_zh 口径:精华 / 面霜 …
  entities_json  TEXT,                       -- {brands[],ingredients[],channels[],consumer_segments[],regulators[],competitors[],events[],relations[{a,rel,b}]}
  agents_json    TEXT,                       -- [{name,role,stance_seed,cares[],style,memory[]}] × 8
  rounds         INTEGER DEFAULT 3,          -- 接口上限 4
  step           TEXT DEFAULT 'new',
  transcript_json TEXT,                      -- [[{agent,stance,statement,ask,shift}] × rounds]
  report_json    TEXT,
  status         TEXT DEFAULT 'running',     -- running / done / failed
  tokens_in      INTEGER DEFAULT 0,
  tokens_out     INTEGER DEFAULT 0,
  error          TEXT,
  created_by     TEXT,                       -- users.email
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_created ON sandbox_runs (created_at DESC);
