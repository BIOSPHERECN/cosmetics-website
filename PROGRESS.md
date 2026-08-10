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

## 三、进度总账

| # | 球 | 状态 |
|---|---|---|
| 1 | 注册表升级:20 套风格定义(每套自带流派) | ✅ 完成 |
| 2 | `variants.css`:20 套风格令牌覆盖层 | ✅ 完成 |
| 3 | 信息架构组件(页头/Hero/品类矩阵/流程/证据/询盘带/页脚) | ✅ 完成 |
| 4 | 5 站四语内容数据 | ⬜ **进行中,下一步就是它** |
| 5 | 共享首页模板 + 5 站页面接通 | 🟡 模板已写完,5 站页面待接 |
| 6 | 风格实验室:20 套真实全页 + 画廊索引 | ⬜ 未开始 |
| 7 | 全量构建 + 实测真数字 + 本地预览 | ⬜ 未开始 |
| 8 | 后台 CMS 选型调研(创始人新增要求) | 🟡 GitHub 真实数据已拿到,见第六节 |

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

### 待做 ⬜
```
packages/core/src/content/<siteId>.ts   5 站 × 4 语 HomeContent 数据  ← 下一步
sites/<id>/src/pages/[locale]/index.astro   5 站首页薄壳(目前只有 beauty2oem 有旧版页面,需改写)
sites/style-lab/src/pages/...           20 个预览全页 + 画廊索引
.github/workflows/deploy.yml            CI 部署
```

⚠️ **注意**:`sites/beauty2oem/src/pages/[locale]/index.astro` 是升级前的旧版页面
(自己写死 hero,没用 HomePage 模板),接通时要**改写**它。

---

## 五、下一步该干什么(按序)

1. **写内容数据** `packages/core/src/content/{beauty2oem,skin2oem,biosphere-ai,medierba,biosphere-oralcare}.ts`
   每个导出 `Record<Locale, HomeContent>`。内容取自创始人品牌视觉图的定位与四项能力。
   ⚠️ **数字与认证一律是占位样例**,文件顶部必须写明 `TODO(创始人核实)`;
   预览部署一律 noindex,防止未核实的产能数字被搜索引擎收录。
2. **接通 5 站首页**:每站 `[locale]/index.astro` 改成薄壳,`getStaticPaths` 铺四语,
   渲染 `<HomePage site={site} locale={locale} content={CONTENT[locale]} email=… />`。
3. **建风格实验室**:`sites/style-lab/src/pages/lab/[brand]/[variant]/index.astro`
   用 `ALL_VARIANTS` 铺 20 个真实全页(`embedded` 模式:关语言切换、关跨站外链、noindex);
   再做索引页用 `<iframe>` 缩略图并排 20 格,创始人点开即看。
4. **全量构建实测**:6 个站 `pnpm build`,量四语路由数 / hreflang / 首页 JS 体积 / CSS 体积。
5. **部署**:见第七节。

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

尚未定论,待补:各方案与 Astro + Cloudflare Pages 的贴合度、图片上传落地方式、
多语言与多站点(5 站共用一个后台)的支持深度、自托管成本。**结论出来前不向创始人下推荐。**

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

## 八、焊死的纪律(任何接班会话不得违反)

1. **凭据值不经手**:不写进文件、命令行、日志、记忆;只用 `.env` 环境变量引用。
2. **零外链**:不引任何图床、字体服务、CDN、第三方徽标。字体一律系统字体栈。
3. **零 To C 转化件**:无购物车、无支付、无促销倒计时、无折扣角标(5 站零成交,B 端询盘导向)。
4. **不抄闭源代码**:Shopify Dawn 等只做视觉参照,一行代码不抄。
5. **数字不实测不汇报**:build 是否过、体积多少、路由几条,一律跑完看真值再说。
6. **未核实的产能/认证数字**:预览一律 noindex,上线前必须由创始人核实替换。
