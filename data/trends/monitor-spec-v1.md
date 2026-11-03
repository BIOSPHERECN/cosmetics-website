---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 84f52d4144d5158c52b9219643223f5d_05814bff964d11f1ac84525400f8a581
    ReservedCode1: M/Wm2lv12rUyxdnRNIZZqkIBAF0jLu8lQ2Mg1SVjjI2LpJy+y+G67XdEoIHVGfc/4CUDlF8yZtpcWDmKxhTn8MHcZsUlDmozTnjx4hLNey7Gjm4sGhHPIhw44nl3sxxkssTmgIPyAP2H6paeQLKIKMuoYWLEHDECj5p6xQg6r6OgZjYbWPrRHi1PgTk=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 84f52d4144d5158c52b9219643223f5d_05814bff964d11f1ac84525400f8a581
    ReservedCode2: M/Wm2lv12rUyxdnRNIZZqkIBAF0jLu8lQ2Mg1SVjjI2LpJy+y+G67XdEoIHVGfc/4CUDlF8yZtpcWDmKxhTn8MHcZsUlDmozTnjx4hLNey7Gjm4sGhHPIhw44nl3sxxkssTmgIPyAP2H6paeQLKIKMuoYWLEHDECj5p6xQg6r6OgZjYbWPrRHi1PgTk=
---

# 爆款化妆品多平台监控方案 v1

> 覆盖平台：亚马逊（Amazon）· TikTok Shop · Temu · 美客多（Mercado Libre）
> 监控对象：各平台爆款化妆品（含细分品类、品牌、价格、销量、趋势等结构化数据）
> 产出形式：每日监控报告（Markdown 落盘 + 主动汇报）
> 方案日期：2026-08-12

---

## 一、技术调研结论（GitHub 爬虫生态 + Agent-Reach）

### 1.1 通用爬虫框架（GitHub 高星项目）

| 框架 | Stars | 语言 | 适用场景 | 备注 |
|---|---|---|---|---|
| Scrapy | 57.1k | Python | 大规模、多页面商品采集 | 持续活跃，需配 Playwright 插件处理 JS |
| Playwright | 73.5k | Python/Node/Java | 动态页面、模拟真实浏览器 | 反爬对抗首选 |
| Puppeteer | 90.9k | Node.js | Chrome 系动态页面 | Chrome 团队维护 |
| Crawlee | 17.9k | Node.js/TS | 静态/动态电商网站 | 内置反封锁工具包 |
| Selenium | 活跃 | 多语言 | 浏览器自动化、登录态场景 | 成熟稳定 |
| curl_cffi | 8.2k | Python | TLS 指纹伪装，绕过指纹检测 | 美客多 HTML 层抓取关键 |
| Crawl4ai | 高星 | Python | LLM 友好的网页抓取 | 已有 CrawlerPro 项目用于美客多+亚马逊 |

### 1.2 Agent-Reach（重点调研对象）

- 仓库：`github.com/Panniantong/agent-reach`，MIT 协议，完全免费。
- 定位：面向本地 CLI Agent（Claude Code / Cursor / OpenClaw 等）的「能力路由层」，解决社媒/平台 API 昂贵、鉴权繁琐、反爬 403 等问题。
- 底层机制：本地中介路由 + 伪装浏览器脚本，整合 yt-dlp、bili-cli、OpenCLI 等成熟 CLI 抓取器，统一入口 `agent-reach query`，自带 `agent-reach doctor` 诊断。
- 平台覆盖：网页阅读、YouTube、RSS、GitHub、B站、小红书、抖音、微博、Twitter/X、Reddit、Facebook、Instagram、LinkedIn、V2EX、雪球等 16+ 渠道。
- 关键结论：Agent-Reach 擅长**社媒与内容平台**（舆情、口碑、趋势信号），但电商商品结构化数据仍以平台官方 API + 电商专用爬虫为主力；两者可互补——Agent-Reach 采集社媒口碑（化妆品种草、测评、爆款信号），电商爬虫采集商品核心数据。

### 1.3 各平台数据源盘点

| 平台 | 最佳数据通道 | 数据能力 | 合规/门槛 |
|---|---|---|---|
| 亚马逊 | ① 官方 SP-API（需专业卖家资格）② 开源爬虫（amazon-scraper 1.7k stars、amzpy、CamelFakeSpot）③ ScrapeOps/Bright Data 托管 API | 标题/价格/评分/评论数/ASIN/图片/变体/BSR 排名 | 反爬严格（CAPTCHA/IP 封禁），需轮换代理 |
| 美客多 | ① **官方 API 免费开放**：`/trends`（每周 Top50 热搜）、`/highlights`（各品类 Top20 最畅销）、`/items`（商品详情）、`/search` ② meliscraper（Spring Boot+PG 快照式监控） | 价格/评分/销量/卖家/排名/趋势关键词 | 官方 API 免 OAuth 读公开数据，1500 req/min |
| TikTok Shop | ① 官方开放平台 API（需入驻资质）② 开源 TikTok scraper（alphaoumardev/Crawlers）③ 亮数据 TikTok Shop 商品采集器 ④ Tabcut 特看数据（商业数据平台） | 标题/价格/销量/评分/达人带货/直播数据 | 反爬极强，动态签名，建议托管 API 或官方 API |
| Temu | ① temu-listings-scraper（URL 批量提取结构化数据）② Temu 官方开放平台（部分国家开放） | 标题/价格/评分/评论/图片/店铺 | 页面 JS 重，需 Playwright 类方案 |

---

## 二、监控系统架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    数据采集层（每日定时触发）                  │
│  亚马逊: 开源爬虫/SP-API   美客多: 官方API(/trends /highlights)│
│  TikTok Shop: 托管API/官方API   Temu: temu-listings-scraper   │
│  社媒信号: Agent-Reach(小红书/抖音/TikTok 口碑与种草趋势)        │
├─────────────────────────────────────────────────────────────┤
│                    数据清洗与标准化层                          │
│  字段映射/去重/价格归一化(多币种→USD)/商品ID统一(ASIN/MLB/SPU)   │
├─────────────────────────────────────────────────────────────┤
│                    存储层（时间序列快照）                       │
│  SQLite/PostgreSQL：每日快照表 + 商品主档表 + 价格历史表         │
├─────────────────────────────────────────────────────────────┤
│                    爆款识别与分析层                            │
│  爆款指数 = 销量增速×0.4 + 排名提升×0.3 + 社媒热度×0.2 + 折扣×0.1 │
│  分类：新晋爆款 / 持续爆款 / 价格异动 / 口碑风险                 │
├─────────────────────────────────────────────────────────────┤
│                    报告层（每日 08:00 自动生成）                │
│  日报 Markdown → output 目录 + 主动汇报                        │
└─────────────────────────────────────────────────────────────┘
```

## 三、商品数据字段规范（每款爆款的详细数据）

| 字段 | 说明 | 来源平台 |
|---|---|---|
| 商品ID | ASIN / MLB编号 / SPU / Temu商品ID | 全平台 |
| 标题 | 商品完整标题 | 全平台 |
| 品牌 | 品牌名（化妆品必采字段） | 全平台 |
| 类目 | 一级/二级类目（美妆/护肤/彩妆/个护） | 全平台 |
| 当前价格 | 标准化为 USD，保留原始币种 | 全平台 |
| 原价/折扣 | 划线价、折扣率 | 全平台 |
| 销量 | 近30天销量/总销量（平台披露为准） | 美客多/TikTok/亚马逊BSR |
| 评分 | 平均评分（0-5） | 全平台 |
| 评论数 | 累计评论量 | 全平台 |
| 排名 | BSR/类目畅销排名 | 亚马逊/美客多 |
| 上架时间 | 首次观测时间（判断新品） | 自建 |
| 价格历史 | 7日/30日价格曲线 | 自建快照 |
| 销量趋势 | 日环比/周环比 | 自建快照 |
| 社媒热度 | 种草帖数/互动量/达人提及（Agent-Reach） | 小红书/抖音/TikTok |
| 店铺/卖家 | 店铺名、卖家评分 | 全平台 |
| 图片 | 主图/详情图 URL | 全平台 |
| 链接 | 商品页 URL | 全平台 |

## 四、技术选型建议（按平台）

| 平台 | 推荐方案 | 成本 | 优先级 |
|---|---|---|---|
| 美客多 | 官方 API（/trends + /highlights + /items）直连，无需 OAuth | 免费 | P0 先落地 |
| 亚马逊 | 开源 amazon-scraper 起步 + 轮换代理；进阶 SP-API | 低（代理费） | P1 |
| TikTok Shop | 亮数据/Bright Data 托管采集器 或 官方开放平台 API | 中 | P1 |
| Temu | temu-listings-scraper 按爆款候选 URL 批量提取 | 低 | P2 |
| 社媒信号 | Agent-Reach（小红书/抖音/TikTok 口碑、种草趋势） | 免费 | P2 |

## 五、每日报告模板（日报结构）

```markdown
# 跨境美妆爆款监控日报 YYYY-MM-DD

## 一、今日爆款总览（四平台 Top 榜单）
| 平台 | 商品 | 品牌 | 价格 | 评分 | 爆款指数 | 变化 |

## 二、新晋爆款（昨日未上榜，今日入榜）
| 平台 | 商品 | 品牌 | 价格 | 入榜理由 |

## 三、持续爆款与趋势
- 连续 X 日上榜商品、销量/排名变化

## 四、价格异动监控
- 涨价/降价 Top 商品（含幅度）

## 五、社媒热度信号（Agent-Reach 采集）
- 小红书/抖音/TikTok 种草帖、达人提及 Top 化妆品

## 六、风险与建议
- 库存/口碑风险、选品建议
```

## 六、落地路线图

| 阶段 | 内容 | 前置条件 |
|---|---|---|
| Phase 1（本周） | 美客多官方 API 接入 + 爆款识别 + 日报骨架 | 免费注册美客多开发者应用 |
| Phase 2（1-2周） | 亚马逊爬虫接入 + 代理配置；TikTok Shop 托管采集器接入 | 代理账号 / Bright Data Key |
| Phase 3（2-4周） | Temu 接入 + Agent-Reach 社媒信号接入 | 无 |
| 持续 | 每日 08:00 定时任务自动生成日报 | 定时任务已配置 |

### 所需凭据清单（需用户提供/注册）
1. 美客多开发者应用 CLIENT_ID/CLIENT_SECRET（免费）
2. 亚马逊：可选（开源爬虫可先跑，代理账号建议自备）
3. TikTok Shop：官方开放平台资质 或 亮数据 Key
4. Agent-Reach：无需 Key（零配置渠道立即可用）

---

## 附录：核心参考资源
- Agent-Reach：github.com/Panniantong/agent-reach
- awesome-amazon-scrapers：github.com/The-Web-Scraping-Playbook/awesome-amazon-scrapers
- meliscraper（美客多畅销监控 API）：github.com/laporeon/meliscraper
- temu-listings-scraper：github.com/aston-llrich/temu-listings-scraper
- 美客多官方趋势 API：developers.mercadolibre.com（/trends、/highlights）
- CrawlerPro（Crawl4ai 抓美客多/亚马逊）：github.com/CarlosHp1996/CrawlerPro
*（内容由AI生成，仅供参考）*
