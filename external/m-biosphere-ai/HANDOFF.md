# 给 marvis 那台机器 —— 请先读这一页再发版

2026-08-28,`biosphere-ai.com` 上做了一次安全修复并切换了 Worker。
**你那边的源码还是修复前的版本。** 直接发版会踩三个坑,下面按「会不会当场坏」排序。

---

## ⚠ 坑一:你的 `wrangler deploy` 现在不会生效了

域名 `biosphere-ai.com` 已从 `m-biosphere-ai` 改指 **`m-biosphere-ai-v2`**。

你照旧发 `m-biosphere-ai`,命令会成功、控制台会显示新版本,
**但线上一点变化都没有** —— 因为没人在访问那个 Worker 了。
这种"发了等于没发"最耗时间,因为它不报错。

**两条路选一条:**

- **推荐**:把下面的改动合进你的源码,然后发到 `m-biosphere-ai-v2`
  (`wrangler.toml` 里 `name` 改一下即可)
- 或者:先把域名切回 `m-biosphere-ai`(见 `ROLLBACK.md`),但那样下面两个坑都会回来

---

## ⚠ 坑二:AI 会返回 401 —— 这是预期的,不是新故障

原来的前端是**带着网关令牌直连**的:

```js
headers: { 'Authorization': 'Bearer sk-router-…' }   // ← 写死在页面里
```

那串令牌在 **5 个文件**里都有:`ai-center.html`、`index.html`、
`all-products.html`、`assets/js/main.js`,以及 —— **`robots.txt`**。

robots.txt 是全站被抓取最频繁的文件,搜索引擎、SEO 工具、网页存档都会存它。
所以那个令牌**必须当作已经外流**,已在网关侧停用(名字叫「皮肤检测服务」)。

**结果:任何还带着旧令牌的代码,调 AI 一律 401。**
不是网关坏了,是那把钥匙被换掉了。

---

## 需要合进源码的改动(很小,四个文件六处)

### 1. 前端:不再直连网关,改调本站接口

| 文件 | 行 | 原来 | 改成 |
|---|---|---|---|
| `ai-center.html` | 388 | `fetch('https://router.biosphere-ai.com/v1/chat/completions', {` | `fetch('/api/ai/chat', {` |
| `ai-center.html` | 434 | 同上 | 同上 |
| `ai-center.html` | 452 | `var API = "https://router.biosphere-ai.com/v1/chat/completions";` | `var API = "/api/ai/chat";` |
| `assets/js/main.js` | 445 | 同上 | `var API = "/api/ai/chat";` |
| `index.html` | 888 | `var API = "https://router.biosphere-ai.com/api/design";` | `var API = "/api/ai/design";` |
| `all-products.html` | 389 | 同上 | `var API = "/api/ai/design";` |

### 2. 前端:三处 `Authorization` 头整行删掉

```js
// 删掉这些片段(连同前面的逗号)
, 'Authorization': 'Bearer sk-router-…'
, "Authorization": "Bearer " + GATE_KEY
```

以及 `var GATE_KEY = "sk-router-…";` 这一行 —— **四个文件里都有**。

> 密钥不进浏览器,这是唯一的根治办法。
> 前端做的任何遮掩(混淆、拆成几段再拼、放在单独的 js 里)都只是让复制它多花十秒钟。

### 3. `robots.txt` 要重写

线上那份是 62KB、里面混进了一整页 JS(含密钥),这是构建事故。
已重写为正常的 3.7KB robots 指令,见本目录 `public/robots.txt`。

### 4. Worker:新增两个服务端代理

代码在本目录 `index.js`,搜 `/api/ai/chat` 与 `/api/ai/design`。
要点:

- 令牌从 `env.AI_ROUTER_KEY` 读(Worker secret,不进代码不进 git)
- 按 IP 限流:对话 15 次/时,出图 6 次/时
- 模型白名单 —— 不给白名单就等于把最贵的那个也开放出去
- `max_tokens` 与出图张数封顶(前端传什么都不能直接信,它可以被改)
- 校验 `Origin` —— 不是强防护(可伪造),但能挡住"把我们的接口当免费 API 用"

**部署前必须先配:**

```bash
wrangler secret put AI_ROUTER_KEY   # 值找我要,或在网关后台新建一个
```

---

## 顺带修的(不影响你,但合进来更好)

| 问题 | 原来 | 现在 |
|---|---|---|
| 管理密码与签名密钥 | 硬编码在 bundle 里 | 只从 env 读,不留兜底常量 |
| 令牌签名 | `sha256(密钥+payload)` | HMAC-SHA256 |
| 签名比较 | `!==`(可按字节爆破) | 恒定时间比较 |
| 密码哈希 | 单次 SHA-256、无盐 | PBKDF2 6 万次(**旧格式仍认,登录时自动升级**) |
| 登录 | 可无限试 | 10 次失败锁 15 分钟 |
| 改密码 | 旧令牌照样能用 | 立即全部作废,当前会话换发 |
| 上传 | 只信客户端声明的 MIME | 校验文件头 |
| `/assets/` 取图 | 只按 base64 解 → 解不动就回退成首页 HTML | 先看文件头,取不到就老实 404 |
| 语言前缀跳转 | 301(浏览器永久缓存) | 302 |
| HTML 注入国家码 | `.text()` 全量读 + `no-store` | HTMLRewriter 流式,缓存留得住 |

> `/assets/` 那条当时是**线上正在发生的故障**:14 张后台上传的图里有 5 张
> 返回 `200` + `text/html` + 60KB 首页。状态码是 200,任何监控都不会报。

---

## 验收怎么跑

```bash
node external/m-biosphere-ai/verify.mjs https://biosphere-ai.com
```

38 项,覆盖静态站、语言跳转、鉴权、密钥轮换、登录、上传、公开接口、
改密码踢下线、登录限速。合完代码发版后跑一遍,全绿再走。

---

## 一句话总结分歧点

线上现在跑的是**从生产站抓下来的副本 + 上述修复**,你手上是**原始源码**。
两边迟早要合 —— 合的方向应该是**把修复搬进你的源码**,而不是反过来:
你那边有完整的构建流程与设计稿,我这边只有产物。
