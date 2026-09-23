-- 0029(2026-09-06):设计项目与版本链。
--
-- 创始人原话:「他生成的图片,可以自己接着修改,然后接着生成,那么就会形成一种依赖」。
-- 这句话把 AI 出图从「一个玩具」变成了「一个留人的机制」:
--   一次性出图,客户看完就走,我们什么也没留下;
--   可继续修改的出图,客户会攒下三五版稿子 —— 那些稿子在我们这里,人就在我们这里。
--
-- 所以要存的不是图,是**项目**:一条从「我想做个什么」到「就照这版打样」的轨迹。
--
-- 身份怎么办:不做注册。链接本身就是钥匙(token),客户存住链接就回得来;
-- 留邮箱是可选项,留了才算线索。理由很实在 —— 注册墙会挡掉大部分只是来看看的人,
-- 而我们要的恰恰是让他先玩起来,玩出感情再留资。
--
-- 迭代怎么实现:出图模型(agnes-image)是文生图,没有 img2img。
-- 所以「接着改」落在**提示词**上:每一版存完整 prompt,改动时由文本模型
-- 在上一版 prompt 基础上按客户的话改写,而不是从零重拼 —— 这样风格才连得住。

CREATE TABLE IF NOT EXISTS design_projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT NOT NULL UNIQUE,          -- 访问密钥,就是 URL 里那一段
  title        TEXT NOT NULL DEFAULT '',
  lang         TEXT NOT NULL DEFAULT 'zh-cn',
  brief        TEXT NOT NULL DEFAULT '',      -- 客户最初那句话,原样存,不改写
  pack_code    TEXT,                          -- 关联包材编码(可空)
  formula_code TEXT,                          -- 关联配方编码(可空)
  email        TEXT,                          -- 留了才算线索
  status       TEXT NOT NULL DEFAULT 'active',-- active / inquired / archived
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_design_updated ON design_projects(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS design_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  n            INTEGER NOT NULL,              -- 第几版,从 1 起
  parent_n     INTEGER,                       -- 基于哪一版改的;第一版为空
  change_note  TEXT NOT NULL DEFAULT '',      -- 客户这次说的改动,原话
  prompt       TEXT NOT NULL,                 -- 实际送去出图的提示词,存全量便于回溯与复现
  job_id       INTEGER,                       -- pack_jobs.id
  media_id     INTEGER,                       -- 出好的图
  status       TEXT NOT NULL DEFAULT 'queued',-- queued / done / failed
  err          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, n)
);
CREATE INDEX IF NOT EXISTS idx_dv_project ON design_versions(project_id, n);
CREATE INDEX IF NOT EXISTS idx_dv_job ON design_versions(job_id);

-- 队列里要能回指是哪个项目的哪一版,否则跑图的机器出完图不知道该回填到哪
ALTER TABLE pack_jobs ADD COLUMN version_id INTEGER;
