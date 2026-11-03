-- 0128 · 09-26 帛卉网关接入免费额度池(第一期:只接对话类)。
--
-- 为什么要接:网关现在只跑商汤 + Agnes 两家。09-21 那天 WorkBuddy 一天 1.5 亿 token 把商汤日额度
-- 上午就吃光,之后整条链只剩 429。catalog-free-cn.json(OmniRoute 抽出,65 家)里真正拿到手、
-- 能用的免费 key 是 Groq / OpenRouter / Kilo 三家 —— tools/gw_import_free_keys.py(09-26)已把它们
-- 写进 gw_keys。这一步把对应的**渠道**补上,不然有 key 也没处使。
--
-- 第一期只接对话类:can_image = can_video = can_vision = 0,出图 / 出视频一条都不接。
--   ① 免费层的出图 / 出视频额度普遍是「每天几张」,一轮就锁,不如不给;
--   ② 商汤 U1.5 出图、Agnes 出视频已经能出,没必要拿条款标 caution 的免费层去顶。
--
-- key 不写进 providers.api_keys,这是故意的:
--   免费池的 key 在 gw_keys 里,导入时一律 status='paused';sync-config.py 只取 status='active' 的。
--   也就是说这批渠道**导入即存在,但没人激活就一行流量都不会走**。
--   附带好处:fleet.ts 会把没 key 的供应商整条剔掉,主站舰队不受这次改动影响。
--
-- 出口:三家都是境外域名。本机网关配 proxy(127.0.0.1:7890,先直连、连不上才走它);
--   云版 deploy.py 的 KEEP 里没有 proxy 字段,Worker 从 Cloudflare 出去本来就是境外出口,直连即可。
--
-- tier 从 41 起:排在商汤 / Agnes 后面只作兜底。也不进 bohui-chat / bohui-fast 的链,
--   只在隐藏别名 bohui-free 里(core.mjs)—— 这三家的免费层条款对商用 / 自动化标的是 caution,
--   要不要并进主链由创始人拍板(舰队白名单铁令)。
--
-- 激活步骤:后台「上游 key」把这三家的 key 从 paused 改成 active → python tools/gateway/sync-config.py
--   → 网关下一个请求自动重载 → node tools/gateway/smoke.mjs 验证。
--
-- 回滚:DELETE FROM providers WHERE id LIKE 'free-%';(gw_keys 里那批 key 另在后台停掉)

INSERT OR IGNORE INTO providers (id, label, base_url, model, api_keys, tier, can_text, can_image, can_video, can_vision, is_free, dialect, enabled) VALUES
 ('free-groq-oss120',  'Groq · gpt-oss-120b(免费层)',       'https://api.groq.com/openai/v1',  'openai/gpt-oss-120b',          '', 41, 1, 0, 0, 0, 1, 'openai', 1),
 ('free-groq-oss20',   'Groq · gpt-oss-20b(免费层)',        'https://api.groq.com/openai/v1',  'openai/gpt-oss-20b',           '', 42, 1, 0, 0, 0, 1, 'openai', 1),
 ('free-or-lfm',       'OpenRouter · LFM 2.5 2.6B(free)',   'https://openrouter.ai/api/v1',    'liquid/lfm-2.5-2.6b:free',     '', 43, 1, 0, 0, 0, 1, 'openai', 1),
 ('free-kilo-step37',  'Kilo · Step 3.7 Flash(free)',       'https://api.kilo.ai/api/gateway', 'stepfun/step-3.7-flash:free',  '', 44, 1, 0, 0, 0, 1, 'openai', 1),
 ('free-kilo-m25',     'Kilo · MiniMax M2.5(free)',         'https://api.kilo.ai/api/gateway', 'minimax/minimax-m2.5:free',    '', 45, 1, 0, 0, 0, 1, 'openai', 1);

-- 三家都是每日重置的小额度,撞 429 就换下一家;这里把 ctx 写进 providers 不方便(表没这列),
-- 上下限口径统一记在 core.mjs 的 CTX_BY_MODEL。
