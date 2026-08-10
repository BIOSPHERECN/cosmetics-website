# 帛卉集团 5 站工程 · 施工进度与接班说明

> **给任何接班的 CC 会话:先读完本文件再动手。** 最后更新:2026-08-11 深夜施工中。
> 本文件是崩溃/重启后的唯一续接依据 —— 每完成一个球就回来更新它。

---

## 一、这是什么

帛卉集团 BOHUI 旗下 **5 个独立站**的 monorepo。技术栈:Astro 静态站 + pnpm workspace,
零 JS、零外链、四语(zh-cn / zh-tw / en / ja)。部署 GitHub + Cloudflare Pages。

**核心架构 ——「1 套模板 × 20 套风格」**:
版式与内容只有一套(`packages/core/src/layouts/HomePage.astro`),
风格靠 `<html>` 上的三个属性叠加切换,换风格不动任何页面代码:

```
:root(中性)  →  [data-school](八大流派)  →  [data-brand][data-variant](20 套提案)
tokens.css       schools.css                variants.css
```

创始人在**风格实验室**并排看 20 套 → 挑定 → 改 `registry.ts` 里该站的 `defaultVariant` 一处 → 整站换装。

---

## 二、部署目标(血证级,绝不能错)

| 项 | 值 |
|---|---|
| GitHub 账号 | **`BIOSPHERECN`**(本机 gh 未登录此号,keyring 里的 `hosonzuo`/`w8848` **都不是**目标) |
| Cloudflare | `Huanggw20@gmail.com's Account`,账户 ID 尾六位 `e2f2b2` |
| 凭据位置 | 仓库根 `.env`(已被 .gitignore 焊死)。**创始人已填好并验证通过。** |

**铁律**:所有推送/部署一律走 `.env` 里的 `GH_TOKEN` / `CLOUDFLARE_API_TOKEN` 环境变量
(令牌自带账号归属,物理上推不错),**永不依赖本机 gh 登录态**。
执行前必须 `gh api user --jq .login` 反查,回显 `BIOSPHERECN` 才继续。
**凭据的值不得写入任何文件、命令行、日志或记忆。**

已验证通过(2026-08-11):
- `gh api user` → `BIOSPHERECN`(2026-07-28 建号)
- `wrangler whoami` → 账户 ID `…e2f2b2` ✅ 与记忆校验位一致

---

## 三、进度总账(2026-08-11 深夜施工完毕)

| # | 球 | 状态 |
|---|---|---|
| 1 | 注册表升级:20 套风格定义(每套自带流派) | ✅ |
| 2 | `variants.css`:20 套风格令牌覆盖层 | ✅ |
| 3 | 信息架构组件(页头/Hero/品类矩阵/流程/证据/询盘带/页脚) | ✅ |
| 4 | 5 站四语内容数据 | ✅ |
| 5 | 共享首页模板 + 5 站页面接通 | ✅ |
| 6 | 风格实验室:20 套真实全页 + 画廊索引 | ✅ |
| 7 | 全量构建 + 实测真数字 | ✅ |
| 8 | 后台 CMS 选型调研 | 🟡 真实数据已拿到,A/B 两案见第六节,**待创始人拍板** |
| 9 | ship-gate 上线审计 + 修复 | ✅ 三项 FAIL 已清零 |
| 10 | GitHub Actions 自动部署流水线 | 🟡 已写好推上去,**待创始人补两个 repo Secret** |
| 11 | 询盘页 + 清零导航死链 | ✅ |
| 12 | 产品目录页 `/products/` | ⬜ 缺产品数据与实拍图,已从导航移除 |
| 13 | 品牌故事页 `/brand/` | ⬜ 未开工,已从导航移除 |

### 已上线地址(全部 noindex,免费 pages.dev)

| 站点 | 地址 |
|---|---|
| **风格实验室(先看这个)** | https://bohui-style-lab.pages.dev |
| BEAUTY2OEM | https://bohui-beauty2oem.pages.dev |
| SKIN2OEM | https://bohui-skin2oem.pages.dev |
| BIOSPHERE-AI | https://bohui-biosphere-ai.pages.dev |
| MEDIERBA | https://bohui-medierba.pages.dev |
| BIOSPHERE-ORALCARE | https://bohui-biosphere-oralcare.pages.dev |

代码在 `BIOSPHERECN/cosmetics-website` 的 **`bohui-monorepo` 分支**
(创始人 7 月的旧版原型在 `master`/`main`,一字未动)。

### 实测数字(全部亲测,非 build 自报)

| 指标 | 实测值 |
|---|---|
| 首页 JS | **0 字节 / 0 个文件**(目标 ≤50KB) |
| CSS(含全部 20 套风格) | 31.7 KB 未压缩 |
| 四语路由 | 5 站 × 4 语,全生成 |
| hreflang | 四语互指 + x-default,齐 |
| 站内死链 | **0**(全站每个链接都验过有对应文件) |
| 依赖漏洞 | 0 |
| 外链请求 | 0(无图床/字体/CDN/统计) |
| 收录闸门 | meta noindex + robots Disallow 双层 |

---

## 四、代码现状(文件级)

### 已完成 ✅
```
packages/core/src/
  registry.ts              5 站 + 20 套风格的唯一真源;getSite()/getVariant()/ALL_VARIANTS
  types.ts                 内容契约(HomeContent 等),将来 WP 导出 JSON 须符合此形状
  i18n/index.ts            四语字典 + localePath()/switchLocalePath()
  styles/tokens.css        中性令牌(已补 --ck-band-ink / --ck-hero-deco / --ck-cta-*)
  styles/schools.css       八大流派(已补 5 个深底流派的 --ck-band-ink)
  styles/variants.css      ★ 20 套风格覆盖层(本次核心产出)
  styles/base.css          排版基调 + 零 JS 淡入动效
  layouts/BaseLayout.astro HTML 外壳:hreflang/canonical/og + 三层风格属性
  layouts/HomePage.astro   ★ 共享首页模板(5 真站与 20 个预览页都渲染它)
  components/SiteHeader.astro     页头 + 语言切换(零 JS)
  components/Hero.astro           首屏(风格差异最大块,装饰层走 --ck-hero-deco 纯 CSS)
  components/StatWall.astro       数字墙
  components/CategoryMatrix.astro 品类能力矩阵(对标 KDC-One)
  components/ProcessSteps.astro   代工服务流程
  components/CertWall.astro       认证墙
  components/EvidenceGrid.astro   证据陈列(出处缺失会显眼提示,防无出处功效宣称)
  components/InquiryBand.astro    询盘转化带(零支付零购物车)
  components/SiteFooter.astro     页脚 + 集团品牌生态互链
tools/scaffold-sites.mjs   从 registry 生成各站 astro.config/site.ts/brand.css
.env.example               凭据模板
```

### 后续新增(本轮已完成)✅
```
packages/core/src/
  content/shared.ts        5 站共享:认证清单 / 询盘页文案 / 询盘带文案 / 邮箱
  content/<siteId>.ts      5 站 × 4 语 HomeContent(★ 数字与认证为占位样例,待核实)
  content/index.ts         内容索引 getHome(siteId, locale)
  robots.ts                robots.txt 正文生成(与收录闸门同判据)
  layouts/ContactPage.astro  询盘页(零后端:邮件预填模板)
  layouts/NotFound.astro     404 页(6 站共用,含四语入口)
sites/<id>/src/pages/
  [locale]/index.astro           首页薄壳(20 行)
  [locale]/contact/index.astro   询盘页薄壳(脚手架生成)
  404.astro / robots.txt.ts      脚手架生成
sites/style-lab/src/pages/
  index.astro                          画廊索引(iframe 并排 20 格)
  lab/[brand]/[variant]/index.astro    20 个真实全页预览
.github/workflows/deploy.yml     CI:矩阵并行 6 站 + 产物校验闸门
.gitattributes                   统一 LF,消除提交时刷屏的 CRLF 警告
```

### 仍缺 ⬜
```
sites/<id>/src/pages/[locale]/products/   产品目录页(缺产品数据与实拍图)
sites/<id>/src/pages/[locale]/brand/      品牌故事页(缺工厂实景与团队信息)
```
这两项已从页头页脚导航移除 —— **宁可导航少一项,也不要放点进去 404 的链接**。
建好后把 `nav` 数组里的两行加回 `SiteHeader.astro` 与 `SiteFooter.astro`。

---

## 五、下一步该干什么(按序)

### 等创始人拍板的(不许自作主张)

1. **挑风格** —— 去 https://bohui-style-lab.pages.dev 看 20 套,告诉我「站点 + 编号」。
   落地方式:改 `registry.ts` 里该站的 `defaultVariant` 一处 → 重新构建部署即整站换装。
2. **后台选型** —— A 案 Directus(推荐)/ B 案 Keystatic,详见第六节。**没拍板不开工。**
3. **核实占位数据** —— 产能、研发人数、交付国家数、认证清单全部待替换,
   替换完成前不得设 `PUBLIC_LIVE=1`。

### 不需要拍板、可以直接干的

4. **建 `/products/` 产品目录页** —— 需要创始人先提供产品清单与实拍图;
   数据结构已在 `types.ts` 定义好(`ProductsFile` / `Product`)。建完后把导航项加回
   `SiteHeader.astro` 与 `SiteFooter.astro` 的 `nav` 数组。
5. **建 `/brand/` 品牌故事页** —— 契约 `BrandPage` 已定义;需要创始人提供工厂实景与团队信息。
6. **CSS 瘦身(可选)** —— 目前每个真站都打包了全部 20 套风格的令牌(31.7KB)。
   实际只需自己那一套。可在 `BaseLayout` 改为按站条件引入,预计降到 ~12KB。
   优先级低:gzip 后差异约 4KB,不值得为此增加构建复杂度。

### 创始人醒来后要点两下的两件事

- **让 CI 跑起来**:GitHub → `BIOSPHERECN/cosmetics-website` → Settings → Secrets and
  variables → Actions → New repository secret,加两条:
  `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`(值在本地 `.env` 里)。
  加完后推代码即自动构建部署 6 站。
  (当前 PAT 无 Secrets 写权限,我写不进去;在此之前用本地 wrangler 部署,照常可用。)
- **可选**:若希望仓库转私有,GitHub → Settings → General → 最下方 Change visibility。
  当前是公开仓,代码里无任何凭据,但内容策略由创始人定。

---

## 六、后台 CMS 选型(创始人 2026-08-11 新增要求)

要求原文:「要有一个好像 WP 和 shopify 那样的后台可以管理,自己可以上传图片自行修改!
后台一定要稳定全面!不是粗制滥造」+「去 GitHub 上找一些可用的开源,一定要最新的技术」。

**已拿到的真实 GitHub 数据(2026-08-11 实测,非印象)**:

| 项目 | 星数 | 最后提交 | 最新版本 | 语言 |
|---|---|---|---|---|
| strapi/strapi | 72,833 | 2026-08-10 | v5.51.2 | TypeScript |
| payloadcms/payload | 44,075 | 2026-08-10 | v3.87.1 | TypeScript |
| directus/directus | 37,275 | 2026-08-10 | v12.2.0 | TypeScript |
| decaporg/decap-cms | 19,289 | 2026-08-10 | 3.15.x | JavaScript |
| tinacms/tinacms | 13,720 | 2026-08-10 | — | TypeScript |
| keystonejs/keystone | 9,940 | 2026-08-10 | — | TypeScript |
| hunvreus/pagescms | 3,901 | **2026-06-23** | 2.1.8 | TypeScript |
| sveltia/sveltia-cms | 2,687 | 2026-08-10 | v0.184.0 | JavaScript |
| Thinkmill/keystatic | 2,269 | 2026-08-10 | 无 release | TypeScript |

**npm 周下载量(2026-08-11 实测,反映真实采用度)**:
`payload` 637,299 · `@strapi/strapi` 178,237 · `@directus/sdk` 168,451 · `tinacms` 147,705 ·
`@keystatic/core` 117,390 · `@keystatic/astro` 27,329 · `decap-cms-app` 30,363

### 收敛为两条路(明早请创始人拍板)

| | **A 案 · Directus 自托管** | **B 案 · Keystatic 内置** |
|---|---|---|
| 后台形态 | 独立后台应用,**最像 WP/Shopify** | 后台长在站点里(`/keystatic`) |
| 媒体库 | ★ 真媒体库:批量拖拽、全局搜索、复用、裁剪 | 图片拖进去直接提交到仓库,够用但无全局资产库 |
| 多语言 | ★ 内置翻译机制,四语同屏编辑 | 靠字段建模实现,可用但要自己搭 |
| 多站点(5 站) | ★ 一个后台管 5 站,权限分离 | 每站一个后台,或共用一仓多集合 |
| 修订历史/权限 | ★ 内置 | 靠 git 历史,权限=GitHub 权限 |
| 服务器 | **要一台常驻小服务器 + 数据库** | **零服务器**,与现有 GitHub+CF 架构零摩擦 |
| 成熟度 | 37,275★ / v12.2.0 / 每日更新 | 2,269★ / `@keystatic/astro` v5.2.0 / 每日更新 |
| 与本项目贴合 | 构建时拉取 JSON → 静态站(契约已按此设计) | 与 Astro 同仓,改完自动触发构建 |

**我的推荐:A 案 Directus。** 理由:创始人明确要求「稳定全面、不粗制滥造」,而
「像 WP 那样的后台」的核心正是**媒体库 + 多语言 + 权限 + 修订历史**这四件,Directus 全部内置且成熟;
Keystatic 胜在零服务器,但媒体管理是它的短板,恰好是创始人最在意的一环(图片必须人工上传)。
代价诚实说清:A 案需要一台常驻小服务器(每月数美元级),这是唯一新增成本。

⚠️ 尚未验证、动手前必须补:Directus 官方镜像在目标服务器上的部署路径、
其 REST 导出与本仓 `types.ts` 契约的字段映射、图片派生尺寸生成放在 Directus 侧还是构建侧。
**不要跳过验证直接开工。**

---

## 七、部署步骤(凭据已就位,可直接执行)

```bash
cd /f/0cosmetic/cosmetic-sites
set -a; . <(sed 's/\r$//' .env); set +a
gh api user --jq .login          # 必须回显 BIOSPHERECN,否则立即停手
```

然后:建私有仓 → 首次推送 → `wrangler pages deploy` 6 个项目(5 真站 + 风格实验室)。
域名未接,先用免费 `*.pages.dev` 给创始人看效果。

---

## 七点五、接班会话必须加载的 skill(创始人 2026-08-11 明令:「严格按照更好的 skill 来规范执行」)

开工前**先加载,不许裸奔**:

| skill | 何时用 | 为什么 |
|---|---|---|
| `cc-constitution` | **每次开工第一件事** | 最高工作宪法:谦卑用 skill、驾驭 GitHub、禁哄、先调研后施工、一张沙盘追踪 |
| `agent-reach` | 任何调研(CMS 选型、顶流站拆解) | 15 平台路由器,禁自己发明搜索方案;用前先 `agent-reach doctor --json` |
| `ship-gate` | **部署上线前必跑** | 89 项上线前审计,防粗制滥造上线 |
| `self-eval` | 每次向创始人汇报前 | 诚实自评防分数注水;数字不实测不汇报 |
| `karpathy-coder` / `code-reviewer` | 写完代码提交前 | 防过度工程、防复杂度失控 |
| `execution-watchdog` | 需要长时间值守/日报时 | 监督一律建 GitHub cron,别靠本地线程盯 |
| `zero-r2-move` | 一旦碰 Cloudflare R2(后台图片存储) | 铁律:绝不事后 copy 搬图(曾一天烧 $40) |

配合 `task` 工具维持一张沙盘,禁「说这个忘那个」。

---

## 八、焊死的纪律(任何接班会话不得违反)

1. **凭据值不经手**:不写进文件、命令行、日志、记忆;只用 `.env` 环境变量引用。
2. **零外链**:不引任何图床、字体服务、CDN、第三方徽标。字体一律系统字体栈。
3. **零 To C 转化件**:无购物车、无支付、无促销倒计时、无折扣角标(5 站零成交,B 端询盘导向)。
4. **不抄闭源代码**:Shopify Dawn 等只做视觉参照,一行代码不抄。
5. **数字不实测不汇报**:build 是否过、体积多少、路由几条,一律跑完看真值再说。
6. **未核实的产能/认证数字**:预览一律 noindex,上线前必须由创始人核实替换。
