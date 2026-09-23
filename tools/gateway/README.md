# 帛卉网关(tools/gateway)

本机 + 云端两份 OpenAI 兼容模型网关,**自己写的,只用 Node / Worker 内置能力,不装依赖**。
创始人 2026-09-18:「抓紧配置 AI 模型的网关,要不然总是报错」+ 铁令「结合几十个开源取其好的部分改成自己的,不是抄」
—— 不装 new-api / one-api / litellm / OmniRoute,只吸收它们的机制(OmniRoute 源码分析见 `crm/开源分析-OmniRoute-2026-09-18.md`)。

## 客户端只需要知道的三件事

| 填什么 | 本机(创始人电脑) | 云(手机 / 员工电脑 / 主站) |
|---|---|---|
| 接口地址 | `http://127.0.0.1:8788/v1`(WorkBuddy 填 `…/v1/chat/completions`) | `https://gateway.biosphere-ai.com/v1` |
| API Key | `~/.bohui-gateway/TOKEN.txt` 那一把(前 6 位 199dc0) | 同一把 |
| 模型名 | `bohui-chat`(通用型 AI)· `bohui-image`(出图片)· `bohui-video`(出视频) | 同,云版出视频不做 |

WorkBuddy / OpenCode / DSH 怎么加一条「自定义 OpenAI 兼容模型」由创始人自己操作(铁令:机器全局配置不许代改),
填上面三项即可;`bohui-fast / bohui-reason / bohui-vision` 留给脚本与后台,客户端不展示(`GET /v1/models?all=1` 才列)。
安装包预置 `_openwork-src/apps/desktop/resources/presets/bohui-ai.opencode.json` 已指向本机网关,key 走环境变量 `BOHUI_AI_KEY`(装机时设成网关令牌)。

## 机制(core.mjs,两版共用)

| 机制 | 做法 |
|---|---|
| key 池轮询 | 同一渠道多把 key(D1 `providers.api_keys` 逗号池)轮着用,冷却中的跳过;全冷时挑最早到期的硬试一次 |
| 按 key 冷却 | 失败 → 该 key 冷却:上游给了 `retry-after`(秒 / `1h2m3s` / epoch / 日期)按它;没给:限流类 20s 起、其它 60s 起,再犯翻倍,封顶 15 分钟;成功即清零 |
| 失败三分类 | 429/401/5xx/连不上 → 换 key(冷却);**402 或「额度尽/余额不足/今日额度」文本 → 整渠道锁到北京时间次日 0 点**(429 只有明说 daily/today 才锁);404「模型不存在」→ 该渠道对该模型永久跳过;403 apikey/权限类 → 换 key 不锁;400 → 换下一家 |
| 空 2xx | 非流式对话 2xx 但 content / reasoning / tool_calls 全空(且非 length 截断)→ 算失败换下一把 |
| 路由策略 | 别名带 `strategy`:`ordered` 按序兜底 · `least-latency` 最近 20 次平均耗时最低者先(500ms 分档,同档按质量 EWMA)· `longest-context` 按 ctx 上限、估算 tokens 超上限的跳过 · `round-robin` 按渠道 `weight`(1–10)加权轮询 |
| 质量 EWMA | 每渠道 α=0.2:成功 1、429 记 0.5、其它失败 0;样本少向 0.5 收缩(50 次满置信);/status 展示 |
| 带图自动看图 | `bohui-chat` 的 messages 里有 `image_url` → 自动改走 `bohui-vision` 链(kimi-k3 → 日日新 6.8 → Agnes 3.0) |
| 请求前压缩 | 只做两件事(默认开,别名 `compress:false` 可关):空白折叠;工具结果 JSON 精简(数组留首 5 末 2、对象留 20 键)。user 最后一条原文不动。头 `x-bohui-chars: 原/压后` |
| SSE 透传 | 流式原样 chunked 转发,默认补 `stream_options.include_usage` 记 tokens |
| 请求整形 | 商汤 glm-/deepseek-v4/kimi- 默认 `reasoning_effort:'none'`+`thinking:{type:'disabled'}`(不关 max_tokens 全被思考吃光);kimi 强制 temperature=1;Agnes 3.0 默认 `enable_thinking:false`;商汤出图默认 `response_format:'url', watermark:false` |
| 提示词改写 | 出图 / 出视频前先让 `bohui-fast` 按「视觉内容总监」口径 + 莱诺鸟模板库(D1 `render_templates`,按 瓶型/罐/软管/泵/套装/场景 匹配)改写成英文提示词 + 负面词 + 一句中文说明;原话以「原样:」或「/raw」开头则不改写;每次记 `logs/rewrites-日期.jsonl` |

别名表(`DEFAULT_ALIASES`,config.json 的 `aliases` 可覆盖):

| 别名 | 显示名 | 策略 | 候选链 |
|---|---|---|---|
| `bohui-chat` | 通用型 AI | least-latency | sensenova/glm-5.2 → sensenova-dsflash/deepseek-v4-flash → agnes-30flash-cn/agnes-3.0-flash(带图 → vision 链) |
| `bohui-image` | 出图片 | ordered | sensenova-u15/sensenova-u1.5-lite → agnes-image/agnes-image-2.5-flash |
| `bohui-video` | 出视频 | ordered | agnes-video/agnes-video-v2.0 |
| `bohui-fast`(隐藏) | | round-robin | dsflash → agnes-30flash-cn → sensenova-68 |
| `bohui-reason`(隐藏) | | ordered | sensenova-ds/deepseek-v4-pro → sensenova/glm-5.2 |
| `bohui-vision`(隐藏) | | ordered | sensenova-kimi/kimi-k3 → sensenova-68 → agnes-30flash-cn |

## 出图 / 出视频是怎么走的(本机版)

客户端只会调 `/v1/chat/completions`,所以:
- 选「出图片」说一句话 → 提示词改写 → `POST /images/generations`(带参考图则 `/images/edits`)→ 图下载到 `~/.bohui-gateway/images/<日期>/<id>.png`
  → 回一条 assistant 消息:`![出图](http://127.0.0.1:8788/images/…)` + 中文说明 + 改写后的提示词(可复制,改了再发就按你的)。
- 选「出视频」说一句话 → 改写成 3 镜头分镜提示词 → Agnes `POST /video/generations {model, prompt, negative_prompt}` 受理(`task_…`)
  → 每 8 秒 `GET /videos/{task}` 轮询(流式时发 SSE 注释保活报进度)→ 完成体 `status:completed, url:…mp4` → 下载到 `~/.bohui-gateway/videos/<日期>/<id>.mp4` → 回本地链接。
- 原生形状也在:`/v1/images/generations` `/v1/images/edits`(回包 url 已换成本地链接,原链接在 `original_url`)、`/v1/videos/generations`(回包多一个 `poll` 字段)、`GET /v1/videos/{id}`。
- `GET /images/… /videos/…` 本机免鉴权,给客户端渲染用。

**Agnes 视频接口真相(2026-09-18 实测)**:`agnes-video-v2.0` 直接受理,71 秒出 5 秒 1088×832 mp4;`agnes-video-2.5-flash` 另要 `mode` 参数(值探不出来,免费额度秒 429);
`.cn` 端 key#2/#3 可用,key#1 与 `.com` 端报「rate limit for free users」→ D1 `agnes-video` 行已改成 `.cn` + `v2.0`。分镜写的是 3×5 秒,但 v2.0 目前只出 5 秒。

## 云版(tools/gateway/worker)

`https://gateway.biosphere-ai.com`,Cloudflare Worker `bohui-gateway`,与本机版共用 `core.mjs`;冷却 / 计数 / 压缩累计放 KV `BOHUI_GW` 的 `state` 键(单键,并发会互相覆盖;要严格一致换 Durable Object);
渠道与 key 在 KV `config` 键(secret `GW_CONFIG` 上限 5.1KB,15 个渠道 5.6KB 放不下,自动退到 KV),令牌 secret `GW_TOKEN`,模板库 KV `templates`。
部署:`python tools/gateway/worker/deploy.py`(用 .env 账号;域名走账号级 API `/workers/domains` 挂,wrangler 的 custom_domain 会因 .env 令牌没有 Zone.Workers Routes 权限报 10000)。
云版出图回上游临时链接(不落盘);出视频回 501(走本机)。D1 `providers` 已加 `bohui-gateway` 行(tier 4,排在商汤直连前),主站 fleet.ts 部署后优先走它。

## 文件

| 文件 | 作用 |
|---|---|
| `core.mjs` | 机制(两版共用):配置归一、别名路由、key 池与冷却、失败分类、压缩、整形、提示词改写、状态视图、`runChain` |
| `bohui-gateway.mjs` | 本机版入口:HTTPS 直连→代理隧道、SSE 透传、媒体转存与静态服务、出图 / 出视频对话形状 |
| `worker/src/index.mjs` · `worker/wrangler.toml` · `worker/deploy.py` | 云版 |
| `sync-config.py` | D1 providers → `~/.bohui-gateway/config.json`(+首次 TOKEN.txt)+ `render_templates.json`;保留已有 port / aliases |
| `logs-to-d1.py` | jsonl → `ai_runs`(entity_type='gateway',prompt_key='GATEWAY:'+别名),input_hash 去重;已挂 `tools/collect/daily.bat`(前面先跑 sync-config) |
| `start-gateway.bat` / `stop-gateway.bat` | 常驻与停止(计划任务 Bohui-Gateway 登录自启,崩了 5 秒拉起,退出码 3=端口被占) |
| `smoke.mjs` | 自检:`node tools/gateway/smoke.mjs [--core] [https://gateway.biosphere-ai.com]` |
| `catalog-free-cn.json` | 65 家免费额度平台目录(OmniRoute 抽出,只作参考,不接入) |

状态目录 `~/.bohui-gateway/`(`C:\Users\Administrator\.bohui-gateway`):`config.json`(含密钥,不进仓库)、`TOKEN.txt`、`render_templates.json`、`gateway.pid`、`logs/`、`images/`、`videos/`。
为什么不放 `%LOCALAPPDATA%`:Claude 桌面版是 MSIX 包,从它里面起的进程写 AppData 会被虚拟化到 `Packages\Claude_*\LocalCache`,计划任务 / WorkBuddy / 创始人终端看不到(2026-09-18 实测);用户根目录两边一致。`BOHUI_GATEWAY_DIR` 可覆盖。

端口 **8788**:原定 8787 被 `D:\0AI\bohui-gateway\new-api.exe` 占着,首次生成配置时探测到就落了 8788;改 `config.json` 的 `port` 要重启。

## 起停 / 日常

```
Start-ScheduledTask Bohui-Gateway          # 起(登录时自动)
tools\gateway\stop-gateway.bat             # 停
python tools\gateway\sync-config.py        # D1 改了 key / 模板后同步,网关自动重载
node tools\gateway\smoke.mjs               # 自检(核心机制 + 真实 HTTP)
python tools\gateway\worker\deploy.py      # 云版重新部署(改了 core.mjs 也要跑)
```
状态页 `http://127.0.0.1:8788/`(云 `https://gateway.biosphere-ai.com/`),10 秒自刷:每把 key 状态 / 冷却到几点 / 近 1 小时成功·失败·429·平均耗时 / 渠道质量 / 整渠道封锁 / 压缩累计节省。

## 可扩的免费额度平台(仅供拍板,未接入 —— 舰队白名单铁令)

来自 `catalog-free-cn.json`(OmniRoute 目录抽出,65 家;数字以各家控制台为准)。境内直连 15 家里与我们相关的:

| 平台 | OpenAI 兼容地址 | 免费口径(目录记载) | 出口 | 条款 |
|---|---|---|---|---|
| 智谱 BigModel | `https://open.bigmodel.cn/api/paas/v4` | 长期免费 Flash 系列(限速) | 境内直连 | ok |
| 硅基流动 | `https://api.siliconflow.cn/v1` | 长期免费小模型(限速) | 境内直连 | caution |
| 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 新用户各模型限时赠额;耗尽即锁该模型 | 境内直连 | ok |
| 百度千帆 | `https://qianfan.baidubce.com/v2` | 长期免费 ernie 系(限速) | 境内直连 | caution |
| 火山方舟·豆包 | `https://ark.cn-beijing.volces.com/api/v3` | 注册赠 15M tokens | 境内直连 | ambiguous |
| DeepSeek 官方 | `https://api.deepseek.com` | 注册赠 5M tokens | 境内直连 | ok |
| 腾讯混元 | `https://api.hunyuan.cloud.tencent.com/v1` | 长期免费 hunyuan-pro(限速) | 境内直连 | caution |
| 魔搭 ModelScope | `https://api-inference.modelscope.cn/v1` | 每日重置,约 6M tokens/月 | 境内直连 | caution |
| Hugging Face | `https://router.huggingface.co/v1` | 每月约 200K tokens | 需代理 | caution |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | 注册赠额(gemma / nemotron) | 需代理 | caution |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | 每日免费额(429 带 retry-after) | 需代理 | caution |
| Groq / Cerebras / OpenRouter | 各自 `/v1` | 每日重置 1–6M tokens/月 | 需代理 | caution |

`tos: caution` = 目录标注「免费层条款对商用/自动化有限制」,接之前要看条款;白名单扩不扩由创始人拍板。

## 常见问题

- **401**:令牌不对。令牌在 `~/.bohui-gateway/TOKEN.txt`;改了要重开客户端。
- **429 一片**:商汤同账号几把 key 共享 tpm/rpm(四把同秒 429),别名链会落到 Agnes;真分流要不同账号的 key。
- **整渠道封锁**:状态页「整渠道封锁至 00:00」= 上游说额度用尽,到北京时间 0 点自动放开;想立刻放开:重启网关(本机)或删 KV `state`(云)。
- **agnes-ai.com 连不上**:先直连,连不上才走 `proxy`(127.0.0.1:7890,`BOHUI_PROXY` 可改);`.cn` 端点不走代理。
- **出图很慢 / 视频等很久**:商汤 U1.5 约 20 秒,Agnes 视频约 70–140 秒;流式客户端期间会收到 `: 生成中` 保活行。
- **改写把我的意思改没了**:原话开头写「原样:」即不改写;或复制回复里的英文提示词改了再发。

## 控制面(0.3.1,09-19)
帛卉电脑端不经网关转发:登录时 `GET https://gateway.biosphere-ai.com/v1/keys` 拉一份 key(与安装包 `keys.json` 同形)直连官方模型,出错 `POST /v1/report` 一条;
云端按状态码冷却 / 判死,下次拉取不再下发。源码 `worker/src/control.mjs`;表 `gw_keys` / `gw_roles` / `gw_events`(`db/migrations/0102_gw_keys.sql`);后台 `/bohui/gateway/`「上游 key」区块管。
`sync-config.py` 也改读 `gw_keys`(providers.api_keys 只作退路)。后台 / Worker 叫 SueAI 网关;客户端可见层只叫「帛卉通用网关」。
