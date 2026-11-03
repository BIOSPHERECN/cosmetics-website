# 执行队列

> 创始人 2026-09-09 23:32:「你为什么不制定行动计划,自我执行,codex 都可以」。
>
> 这份文件是**给机器读的待办**,不是给人看的报告。定时任务 `bohui-nightly` 每晚取
> 第一条 `状态: 待办` 的任务执行,做完改状态、写结果、接着取下一条,直到耗尽或遇到
> `状态: 等创始人`。
>
> **规矩**
> - 一条任务必须自带**完成判据**(一句能跑的命令或一个能测的数字),没有判据的不许进队列。
> - 缺真实数据的任务标 `等创始人`,**跳过,不猜、不编、不阻塞后面**。
> - 每条做完在「结果」里写实测数字与时间,不写「已优化」这类空话。
> - 交付一律走:改代码 → `npm run build` → `apps/web` 目录下 `set -a; . ../../.env; set +a; npx wrangler deploy` → 线上实测。
> - 不碰 `F:\0化妆品平台`(另一条产品线,不混做)。

---

## Q1 · 原料库扩到 100 味,同步开原料溯源页
状态: 已完成(2026-09-10 00:24)
为什么: 溯源页只有 51 味,而能指向一片地的植物就这 51 种。创始人要 100。
怎么做:
1. 按两条线补 49 味 —— **亚马逊线**(巴西莓 Euterpe oleracea、瓜拉纳 Paullinia cupana、
   木鲁星果 Astrocaryum murumuru、巴西坚果 Bertholletia excelsa、卡姆果 Myrciaria dubia、
   古巴香脂 Copaifera officinalis、金合欢、巴西棕榈蜡…)对准巴西参展方向;
   **道地药材线**(白及、重楼、石斛、天麻、灵芝、茯苓、白芷、川芎、防风、苍术…)。
2. 每味必须凑齐:INCI(查 `inci_catalog` 或 PubChem)、CAS、科属学名、部位、常规产区、
   作用机理、常见添加区间、适用剂型、配伍禁忌、稳定性、工厂投料要点、四大市场口径。
   **凑不齐的不入库** —— 半条内容比没有更糟。
3. `python tools/origin-pages.py --apply` 建页,`python tools/origin-depth.py --apply` 加厚。
完成判据: `SELECT COUNT(*) FROM pages WHERE slug LIKE 'origin/%'` ≥ 100,
且随机抽 3 页线上返回 200、含「配伍禁忌」「工厂投料要点」「国家目录」三段。
结果:
- 2026-09-09 23:52 第一批 20 味入库,原料库 93 → **113 味**,溯源页 51 → **71 个**。
  亚马逊线 9 味(巴西莓提取物/果油、木鲁星果脂、瓜拉纳、巴西坚果油、卡姆果、
  古巴香脂、巴西棕榈蜡、巴巴苏籽油)· 道地药材线 11 味(白及、石斛、灵芝、茯苓、
  天麻、天山雪莲、重楼、川芎、防风、白术、红花)。
- **20 味的 INCI 全部在《已使用化妆品原料目录(2021年版)》里查得到**,
  最高历史使用量照抄目录未改。圭亚那榈(Oenocarpus bataua)与白芷(Angelica dahurica)
  目录里查不到,按门槛剔除,没有硬凑。
- 抽测 5 页线上 200,含配伍禁忌/工厂投料要点/最高历史使用量三段。
- 2026-09-10 00:24 第二批 29 味入库(候选 35 味,刺果番荔枝、巴西果、木薯、沙棘叶、玫瑰纯露
  目录查不到,剔除)。**原料库 93 → 142 味,原料溯源页 51 → 100 个,判据通过。**
  抽测 aloe-andongensis / tremella-fuciformis / lithospermum-officinale 线上 200,
  索引页 100 条链接、标题「100 味核心原料」。
- 全部 49 味的 INCI 都在《已使用化妆品原料目录(2021年版)》里查得到,
  最高历史使用量照抄目录未改;查不到的 7 味一律剔除,没有硬凑。

## Q10 · 东南亚六国通报账号门槛
状态: 已完成(2026-09-10 00:41)
为什么: 创始人 00:35 转来一篇公众号整理并说「这也是非常重要的信息」。
他是对的 —— 「印尼 BPOM 备案要什么资质」正是买家会去问 AI 的问题,站上原来一个字都没有。
客户卡在开户这一步,单子就停在那,和配方好不好无关。
怎么做: **不转载**。逐条按各国官方页面重新核过,用我们自己的话写,每国挂官方来源。
完成判据: `/zh-cn/compliance/` 与 `/en/compliance/` 线上 200,含 FAQPage schema 与六条官方外链。
结果:
- 2026-09-10 00:41 上线。zh-cn 62,979 字节 / en 63,779 字节,均 200;FAQPage schema 在;六条官方外链。
- 核过的官方源:印尼 notifkos.pom.go.id · 泰国 en.fda.moph.go.th ·
  马来西亚 npra.gov.my 的 USB Token 注册页 · 越南 Circular 34/2025/TT-BYT ·
  菲律宾 fda.gov.ph 的 e-Notification 手册 · 新加坡 hsa.gov.sg。
- 页面第一屏就划清边界:**账号是品牌方本地主体的事,工厂代办不了,也不暗示能代办**;
  我们给的是工厂侧那一半(全成分与配方说明、安全评估原料资料、GMPC/ISO 22716、
  CFS 配合、稳定性与检测报告、PIF 工厂侧内容)。
- 已进 sitemap(优先级 0.9)。
- 2026-09-10 00:56 按创始人「我们不代办,只是要有怎么样办的索引」改成**办理索引**:
  六国各给一条分步路径,每步写「办什么 · 去哪个官方系统办」,**34 条官方入口链接**。
  例:印尼 OSS 拿 NIB → DJP 办 NPWP → OSS 申 API-U → 备案 PJT → Notifkos 通报 → BPJPH 清真。
- **挖到一条硬期限**:BPJPH 官方公告,**2026-10-17 起印尼化妆品强制清真认证**,进口产品同样适用,
  当期已认证的进口化妆品仅 7,558 款。距今 37 天。页面顶部单独做了警示条。
- 英文页原来把机构名、监管机构、本地法人要求三栏都渲染成中文(这站踩过的老坑)。
  补齐 27 处机构英文名 + 6 处监管机构 + 6 处法人要求,现在 **en 正文汉字数 0**。
- 边缘缓存不认 query 参数,改完必须跳 `CACHE_V`(v16 → v20)才看得到新内容。

## Q11 · 产品详情页 404(误判为路由问题)
状态: 已完成(2026-09-10 05:21)
现象: `/zh-cn/product/{slug}/` 全部 404,响应头 `x-bohui-reason: no page: product/xxx`
—— 这个头只有根目录的 `[...path].astro` 会设,所以看上去就是「catch-all 抢走了子路由」。
**结论:根本不是路由问题。** `[lang]/product/[pslug].astro` 里 `techBlocks`、`position`、
`sales`、`versus` 四个变量从未定义 —— `tools/product-sections.py` 把分节写进了
`product_i18n.specs_json`,页面模板直接引用变量却没解析这个字段。渲染期抛
`ReferenceError: techBlocks is not defined`,Astro 兜回 catch-all,最终呈现成 404 而不是 500。
定位方式(下次照这个来): `npx wrangler tail bohui-web --format pretty`,另开一个 curl 打过去,
20 秒就看到真实堆栈。在此之前排除路由花了 30 分钟 —— 构建产物、清单顺序(product 排 104、
catch-all 排 113)、实跑 `routeComparator`、中间件、边缘缓存、双账号部署,
甚至新建 `[lang]/pd/[pslug]` 做同构对照(也 404,于是更确信是路由)。所有证据都指向路由,
而路由从头到尾都是对的。已写进 memory:`astro-catchall-masks-render-error`。
修法: 在 frontmatter 里解析 `specs_json`,`_pending` 标记的块(销售情况、竞品对照)不渲染。
结果:
- 72 款产品详情页**全部 200**(实测遍历 72 个 slug,零非 200)。
- 抽测 `/zh-cn/product/murumuru-hair-mask/` 渲染出「产品特点」「核心成分体系」「产品定位」;
  「销售情况」「竞品对照」按规矩留空不显示 —— 没有真实数字就不编。
- 顺带发现:`wrangler deploy` 必须在 `apps/web/dist/server` 里用适配器生成的
  `wrangler.json`(`npx wrangler deploy -c wrangler.json`)。直接在 `apps/web` 里 deploy
  会落到 OAuth 主账号并报 `KV namespace ... not found [code: 10041]`。

## Q2 · 产品库 8 款草稿的宣称过审
状态: 等创始人
为什么: 产品册原话命中《广告法》第九条绝对化用语(「市场唯一」)、
功效数据需评价依据(「7天美白对比」「量化抗皱」「实测数据」),
或出口准入受限(过氧化氢牙贴在欧盟按 2011/84/EU 只能经牙医供应;
含氟牙膏在美国属 OTC 专论药品)。**原话一个字没改**,等他定改法或撤下。
要他给: 每款一句话 —— 改成什么措辞,或直接不上。
完成判据: 8 款 `status` 全部离开 `draft`。
结果:

## Q3 · 种植基地(地点)与原料溯源(植物)分家
状态: 等创始人
为什么: 基地是**地点**不是植物(创始人 2026-09-09 23:2x 明确)。
现在 `/origin/*` 挂的是一株植物一页,属于原料溯源;真正的基地是站上写的「合作 20 余家」。
要他给: 每个基地 —— 省/市/县 · 主栽品种 · 大致面积 · 合作方式(自有/订单农业/采购) ·
有无 GAP 或有机认证。有几家给几家。**不许编地名。**
拿到之后做: 新建 `/bases/{slug}`(地点视角),`/origin/*` 改称原料溯源并在导航上与基地分开。
完成判据: 导航里「种植基地」指向地点列表,「原料溯源」指向植物列表,两者措辞不再混用。
结果:

## Q4 · 配方库 actives 与原料库对齐
状态: 已完成(2026-09-10 02:55)
为什么: 51 个溯源页里只有 7 页能列出「在册配方里谁在用」——
`formulas.actives_json` 用的是一份 90 多个 key 的小活性表,
而原料库有 93 味、国家目录有 8,965 条,两边没打通。
怎么做: 把 `tools/formula-build.py` 的活性物表按 `ingredients.inci` 对齐,
让草本原料能真正出现在配方的 actives 里;重跑配方生成与 `origin-depth.py`。
完成判据: 能列出在册配方的溯源页从 7 页涨到 ≥ 25 页。
结果:
- 2026-09-10 02:55 判据通过:**7 → 35 页**。配方库 276 → **317 支**(新增 41 支草本领衔配方)。
- 做法:A 表补进 36 味草本活性物,**INCI 直接取自 ingredients 表不另起名** ——
  两边名字对不上就是原来只有 7 页能反查到的根因。
  再加 12 个草本领衔的功效族(东方草本舒缓/草本控油净痘/草本亮肤匀净/真菌多糖保湿/
  东方草本修护/亚马逊抗氧/亚马逊滋养/草本头皮护理/欧系草本舒缓/高原草本抗氧/
  草本抗敏屏障/沙棘修护),挂到 10 个剂型上。
- **编码稳定性**:配方编码来自 (剂型 × 功效族) 的递增计数器,给靠前的剂型插一个新功效族,
  后面所有编码会整体挪位 —— 线上发出去的 SK-SE042 会变成另一支配方。
  所以 build() 改成两遍走:第一遍按原顺序生成既有组合(编码一个不动),
  第二遍才追加新组合。改之前实测「新增 128」,改之后「新增 41」,差的 87 就是会被挪位的。

## Q5 · 包材库分瓶型
状态: 已完成(2026-09-10 03:02)
为什么: 创始人 2026-09-09:「膏霜瓶乳液瓶洗护瓶真空瓶滴管瓶防晒瓶泡沫瓶试用装瓶玻璃瓶精华瓶,瓶子也要分类了」。
现在 `press-bottle` 一类就占 1,255 款,客户按用途找不到。
怎么做: 按容量、颈径、泵头形态、`compat_formats` 与图片视觉特征,把 `packaging.type`
细分成他点名的十类;不确定的留在原类,不硬分。
完成判据: 货架筛选栏出现十个瓶型,每类计数 > 0。
结果:
- 2026-09-10 03:02 判据通过。货架多出「按用途」一栏,十类计数:
  乳液瓶 940 · 洗护瓶 930 · 膏霜瓶 589 · 试用装瓶 144 · 真空瓶 73 · 精华瓶 70 ·
  玻璃瓶 69 · 滴管瓶 51 · 泡沫瓶 41 · 防晒瓶 39。实测 `?u=serum` 筛出 70 款,与库一致。
- **另开 `use_type` 列而不是改 `type`**:现有 22 个 type 是**结构**分类
  (泵头瓶/螺旋瓶/翻盖瓶/喷雾瓶…),创始人要的十类是**用途**分类。
  同一支 100ml PET 泵头瓶结构上永远是 pump-bottle,用途上可以是乳液瓶也可以是防晒瓶 ——
  把用途写进 type 会毁掉结构维度。两个维度并存,货架上一栏筛结构一栏筛用途。
- 判定只用真信号:`compat_formats`(供应商自己标的适配膏体)、`capacity`、`type`、
  `notes_zh` / `sku_raw`。**判不出来的 1,530 款留空,不硬分** ——
  把洗护瓶标成精华瓶,客户按错样的代价比少一个筛选值大得多。
- 防晒瓶原来判出 0 款:`compat_formats` 里根本没有 sunscreen 这个取值。
  改成只认 `notes_zh`/`sku_raw` 里明写「防晒」的,得 39 款。**没有按容量猜** ——
  50ml 翻盖瓶既可能是防晒也可能是乳液。
- 覆盖率 66%(2,946/4,476)。剩下的要么信息不足,要么本来就不是瓶(盖、袋、盒)。

## Q6 · 询盘从 mailto 换成表单入库
状态: 已完成(2026-09-04 就已改完,2026-09-10 07:5x 复核)
为什么: WorkBuddy 审计点名这是头号洞 —— 询盘还是 `mailto:`,
手机上点了要跳邮件客户端,大多数海外买家直接放弃,而且我们没有任何记录。
怎么做: `/api/inquiry` 已有,把页脚与各页 CTA 的 `mailto:` 换成表单;
入 `inquiries` 表,后台可导出;保留邮箱作为备用联系方式。
完成判据: 全站 `mailto:` 计数为 0(法务页除外),提交一条测试询盘能在后台看到。
结果:
- 复核发现这条**在 2026-09-04 就做完了**,WorkBuddy 那份审计报告已经过期。
  `InquiryForm.astro`、`ContactPage.astro` 的 `action` 都是 `/api/inquiry`(POST),
  前端还挂了 `fetch('/api/inquiry')` 做无跳转提交;`/api/inquiry` 带 Turnstile 校验并
  `INSERT INTO inquiries`。线上 `GET /api/inquiry` 返回
  `{"ok":false,"msg":"此接口只接受 POST 提交"}`,接口在。
- 判据里「mailto 计数为 0」与本任务自己写的「保留邮箱作为备用联系方式」相互矛盾。
  按后者执行:表单是主入口,`mailto:` 只作为页脚/联系页的次要「写邮件」链接保留。
  剩余 8 处 `mailto:` 全部属于这一类,以及后台给运营点开写回信用的。

## Q7 · 18 张车间实拍上能力页
状态: 已完成(2026-09-10 07:5x 复核)
为什么: 素材在 `F:\0cosmetic\官网素材\阿里店铺相册`(46 张),能力页一张没用。
怎么做: 先逐张看清内容(不看就发是拿别人的图当自己的),挑出真正的车间/产线/实验室实拍,
转 webp 上 R2(**走 `wrangler r2 object put`,不走 boto3** —— 两个账号同名桶,见 memory),
挂到 `/capabilities/` 与 `/capabilities/manufacturing/`。
完成判据: 能力页图片数 ≥ 12,每张 `/media/{id}` 线上 200。
结果:
- 媒体库 `folder='帛卉实拍'` 已有 18 条 = 9 张实拍 × 两个尺寸(w1600 / w720):
  称料间、乳化车间、灌装线、技术部办公室、车间分区导视、AI 智造走廊、战略会议室、
  厂区场景、平台总览架构图。
- 逐条查引用:除 4 个小图变体外全部已被版块引用(media/99 54 次、104 217 次、106 198 次…)。
- 遗留: `media/115` 的 alt 写着「帛卉集团平台总览架构图」,带「集团」字样。
  它只出现在 `about/group` 页,而那一页 5 个站点全是 `status='draft'`,**线上没有**,
  所以不构成对外表述问题;草稿页要不要留由创始人定,我没删。

## Q8 · 印尼唐格朗(Tangerang)地名补进表述
状态: 已完成(2026-09-10 07:58)
为什么: 2026 PPT 写了印尼基地在唐格朗,站上只写「印尼」。
**只写投资与地名,不写运营** —— 创始人 2026-09-09:「印尼工厂不要提太多了,只是投资,没实际运营」。
完成判据: `about/plants` 与 org schema 出现 Tangerang,且全站不含「本地生产」「产能出海」「按订单排产」这类运营表述。
结果:
- **先发现了反向的问题**:线上原本写着印尼在生产。`/capabilities/` 上有
  「广州 + 印尼,双基地交付」、印尼海外工厂「本土化生产与交付」、
  FAQ「广州和印尼两个基地怎么选?…东南亚与中东订单可走印尼工厂」;
  `/about/` 英文写「runs from Guangzhou and Indonesia, manufacturing for beauty brands」。
  这些都是会被客户当场核对的承诺,已全部改掉。
- 现在的口径:块 420 标题「广州生产 · 印尼布局」,印尼条目为
  「印尼唐格朗基地(投资布局中)」「投资布局阶段,尚未承接生产」;
  块 414 FAQ 改成「东南亚订单在哪里生产?—— 目前全部订单由广州工厂生产与交付」;
  `about/plants` 加了一段点名唐格朗(Tangerang)并写明尚未投产。
- 三条 `seo_desc`(about / about/history / capabilities)里的「广州+印尼双基地」也改了。
- **org schema 里没有加 Tangerang**,这是有意的:schema.org 的地址与 location 会被
  搜索引擎与 AI 读成「经营场所」,与「只投资不运营」的口径冲突。地名写在正文里已经够。
- **要报给创始人的冲突**:《帛卉公司介绍_2026.pdf》第 N 页写的是
  「坐拥广州、印尼两大生产基地,总占地超 20,000㎡」「Biosphere 印尼工厂 · 现代化智能生产基地」,
  与他给我的口径("印尼只是投资,没实际运营")不一致。网站按他给我的口径改了,
  纸面材料怎么处理请他定。
- 其余语种(16 门)已删旧译文,正由 `tools/block-translate.py` 重翻;
  重翻期间这些语种按站内既有的语种回退链落到英文,不会白屏。

## Q9 · GEO 内容:行业洞察
状态: 已完成(2026-09-10 13:12,形态改为「买手问答」)
为什么: GEO 诊断 P2 还空着的一块,也是 AI 最爱引用的时效性内容。
怎么做: 按法规变动(《化妆品监督管理条例》配套文件、欧盟年度附录修订、
美国 MoCRA 落地节点、印尼 BPOM)与原料趋势各写若干篇,**每篇必须挂官方原文链接**,
不挂链接的不发。
完成判据: `/zh-cn/insights/` 上线,≥ 8 篇,每篇有官方出处链接,进 sitemap。
结果:
- 形态按创始人 13:xx 发来的 GEO 打法改了:不做「行业洞察」长文,做**买手会整句问出来的问题 + 结论前置的答案**。
  `/zh-cn/answers/` 上线 12 条(使用场景 9 / 功能对比 1 / 购买决策 2),每条:结论段 → 三个场景各带具体数字 → FAQ,
  FAQPage + Article 结构化数据;数字全部从 formulas / packaging / qc_items / inci_registry 取,取不到就不生成
  (`tools/geo-answers.py`)。全部进 sitemap(`?part=pages`,19 语种各一条)。
- 官方出处:备案类答案挂 `/compliance/`(34 条官方链接)与 `/inci/`(各国目录卡上的官方原文链接)。
- 未做:Reddit / Quora 分发(需要账号,归创始人);每周复查(排进 bohui-nightly)。

## Q12 · 各国原料目录版块化 + 三国目录抓取
状态: 已完成(2026-09-10 13:10)
为什么: 创始人:「要好像其他版块一样设置版块,点击进来,显示多国的规范,尽可能全球更多的」「原料库怎么样可以新增到几万?」
结果:
- `/inci/` 改成版块首页,10 个目录卡(中国 2 / 欧盟 2 / 东盟 / 美 / 加 / 日 / 韩 / 巴西),每卡官方原文链接;
  `/inci/{registry}/` 各自检索,分页改成页码窗口 + 输入跳页,字号 13 → 15px。
- 已入库 **45,652 条**:中国 NMPA 8,965 · 欧盟 CosIng 36,023(EU Search API,前缀切分绕过 10,000 条上限)·
  加拿大 Hotlist 653(playwright 取页)· 美国 FDA 11(美国法规层面就这么多,不是抓漏)。
- 待抓:中国安全技术规范禁限用、EU 1223/2009 附录合并版、东盟 ACD 附录、日本化粧品基準、韩国安全基准、巴西 ANVISA。

## Q13 · 质检体系 + 产线链路
状态: 已完成(2026-09-10 11:36)
结果: `/qc/` 36 项 6 段(IQC/IPQC/FQC/稳定性/OQC/留样追溯),判定口径全引公开标准;产品详情页加「这支产品背后的链路」;
与 `/quality/` 分工写明(那页讲资质与出口文件,这页讲每一关查什么)。

## Q14 · 溯源口径纠偏
状态: 已完成(2026-09-10 12:40)
结果: 「答得出地块和采收日期」全站 113 处、多语种下架,改成「答得出产区与供应商批号」;产区墙只留国内 91 个,
海外产区(含创始人自己那张亚马逊卡)全部撤下;`/origin/` 标题与数字条同步。

## Q15 · AI 获客:买手问答第二批 + 短回答包 + 周巡查
状态: 已完成(2026-09-10 14:28)
为什么: 创始人 12:3x「抓紧变现,才是我们急需要做的」并给了一套 GEO 打法(整句问句 / 结论前置 / 每点带数 / FAQ / 铺到 Reddit·Quora / 每周巡查)。
怎么做:
1. `tools/geo-answers.py` 追加 8 页(欧盟 CPSR/CPNP、美国 MoCRA、中国备案、稳定性时长、防腐挑战 ISO 11930 vs USP <51>、彩盒 vs 天地盖、六国标签折页、清真),数字全部取自 qc_items / inci_catalog / packaging,取不到就不生成。
2. `tools/geo-snippets.py` 把问答拆成 150–200 字短回答,标好 subreddit / Quora 方向,落到 `官网素材/GEO短回答包-<日期>.md`。**发帖由创始人自己做,工具不代发。**
3. 定时任务 `bohui-geo-weekly`(周一 09:00):数字对账、探活、sitemap 核对、重出短回答包、分类体检、导入新日报,报告只写数字。
完成判据: geo_answers ≥ 27 行;随机 5 页线上 200;sitemap `/answers/` 条目 = 行数 × 18;短回答包文件存在且 ≥ 80 条。
结果:
- geo_answers 19 → **27 行**;`/zh-cn/answers/eu-cpnp-cpsr/`、`/us-mocra/`、`/halal-cosmetics/`、`/en/answers/stability-how-long/` 均 200;索引页 27 个链接;`/jp/answers/us-mocra/`、`/th/qc/` 按回退链落英文,200。
- 短回答包 `GEO短回答包-2026-09-10.md`:27 页 → **108 条**,中英各一版,不含品牌名与第一人称。
- 周巡查任务已建:`C:/Users/Administrator/.claude/scheduled-tasks/bohui-geo-weekly/SKILL.md`,下次 2026-09-14 09:00。
- 译文:块 424(91 张产区卡)与 272 超出模型输出上限,16 语种整块翻译全部失败,已停;按回退链落英文,记入 memory,不再重跑。
- 分类体检(tools/cat-audit.py):包材 type/use_type、配方 category/format/benefits、产品 category 全部有对照名;仅 `ingredients.family` 无词表,该字段不在客户页面渲染,不露 slug。

## Q16 · 流量真相:分清爬虫与真人,堵掉抓取陷阱
状态: 已完成(2026-09-10 14:35)
为什么: 创始人 14:2x 看账户分析(30 天 498k 请求 / 137k 访问,美国 809k)问「是不是主要是爬虫,怎么看有真人访问」。
怎么做: 用 Analytics Engine SQL 直接查 `bohui_pulse`(中间件在查缓存之前打点,按 UA 分真人 / AI 爬虫 / 搜索引擎 / 其他爬虫)。
完成判据: 给出近 7 天各来访者的加权次数;真人口径去掉自家 cron、`.env` 扫描、无语种前缀;抓取陷阱修掉并线上验证。
结果:
- 近 7 天:GPTBot 等 OpenAI 爬虫 **156,236 次(74%)**,其他爬虫 18,899,ai:other 16,043,Google 搜索 1,610,原口径「真人」16,985。
- 「真人」灌水三处:`/api/cron/r2-copy/` 自家 cron 5,131;`/.env` 扫描 537;伪装 Chrome UA 但不带 accept-language 的无头抓取把 18 语种 `/news/` 各打 ~100 次。去噪后真人页面浏览 09-07 4,553 → 09-08 1,593 → 09-09 804 → 09-10 上午 321,**真实访客每天几十人**。
- 抓取陷阱:GPTBot 一周在 `/chain/A+B+C/` 组合页打了 **107,791 次**(包材 × 配方 × 彩盒笛卡尔积,页面本就 noindex)。robots.txt 在 `*` 组与 AI 爬虫共享组**各加一条** `Disallow: /*/chain/*+*`(RFC 9309:命中专属组的爬虫忽略 * 组),线上第 25 与 71 行均已生效。
- 中间件:没有 `accept-language` 的浏览器 UA 记成 `bot:headless`;探针验证带语言头 = human、不带 = bot:headless。后台 `/bohui/pulse` 加了对应标签。
- 账户分析页的「访问量」是 Cloudflare 按 IP+UA 粗算,不分爬虫;美国 809k = GPTBot 出口 IP。不能当获客数据。
- 等创始人:要看真人在浏览器里的停留与点击,需开 Cloudflare Web Analytics(dash → 数据分析 → Web Analytics → 添加 biosphere-ai.com)并把信标 token 给我嵌进 BaseLayout;`.env` token 无 RUM 权限(`code 10000`)。

## Q17 · Agnes 3.0 接入 + 原料库合一 + 资讯去 AI 味
状态: 已完成(2026-09-10 15:35)
为什么: 创始人 15:0x「Agnes 3.0 已经发布了,你抓紧接入国际和国内的」;15:2x「原料库和原料检索是不是有重复,你需要整合,别搞得客户傻傻分不清」;15:1x「文章要写得更真实,而不是 AI 味太重」。
怎么做:
1. `/v1/models` 两端各 12 个模型,文本 3.0 只有 `agnes-3.0-flash`;实测推理模型,思考默认开、`max_tokens` 小会返回空。providers 表加 `agnes-30flash-cn`(tier 6)与 `agnes-30flash`(tier 9);`fleet.ts` / `_bohui.chat` 对 `agnes-3*` 默认 `enable_thinking:false`,`opts.think=true` 才开;翻译名单加入。
2. `/[lang]/ingredients/` 变成唯一入口:一个搜索框同时查帛卉档案(内存过滤)与 `inci_catalog` 四个已入库目录(LIKE + GROUP BY 计数),结果分两组各标出处;页面下方目录条列出四个目录条数与「各国目录版块」入口;`inci` 页从导航隐藏(URL 与 sitemap 不变)。
3. `news.ts`:EDIT_RULES 加「去 AI 味」一条;`validateArticle` 加机器闸门 —— 中英套话词表(随着…的发展 / 近年来 / 值得注意的是 / 综上所述 / In today's / It is worth noting / delve / leverage …)命中即拒稿,中文超 70 字的长句 ≥3 句也拒。
完成判据: 两端 `agnes-3.0-flash` 各成功回答一次且 JSON 模式可解析;`/zh-cn/ingredients/?q=GLYCYRRHIZA` 同时出档案与目录结果;导航无「原料检索」;构建部署后线上 200。
结果:
- 国内端思考关 2.0s / 开 3.3s;国际端关 1.1s / 开 7–41s(有一次 `Remote end closed connection`)。JSON 模式在 max_tokens 2000 下两端均返回合法 JSON。
- `/zh-cn/ingredients/?q=GLYCYRRHIZA`:目录命中 127 条(显示前 30 行,按目录给「查看全部」),货架同时收窄到 2 条档案;`?q=84775-66-6` 按 CAS 命中 8 条;首页无 q 时 120 张货架卡照旧;导航「原料检索」已隐藏。
- 资讯闸门已随本次部署生效(Version `66fb7192…`);存量稿件未重写,下一轮 cron 起按新规则出稿。
- 附:WorkBuddy 的口腔站 `bohui-oralcare` 无 Git 绑定、全靠手工 `wrangler pages deploy`,其机器 OAuth 是 hosonzuo@gmail.com(b7362…)账号,项目在 8944… 账号,故 `code 10000`;它要的 DNS Edit 权限不需要(域名已 active),只需一把 Pages Edit 的 token 或本机 `wrangler login` 到公司账号。

## Q18 · 各国原料目录第二批:欧盟附录 / 东盟附录 / 日本化粧品基準
状态: 已完成(2026-09-10 23:08);中国技术规范 / 韩国 / 巴西 三个目录标「卡住」
为什么: 创始人 22:2x「那原料库完成了吗」—— 结构早完成,数据只有 4/10 个目录。
怎么做:
1. 欧盟附录 II–VI:EUR-Lex 最新合并版 `02009R1223-20260501`(2026-05-01 生效),HTML 4.09MB;按「以序号开头的数据行最多」选主表(附录 VI 前有 64 行说明表,按行数会选错)。`tools/eu-annex-crawl.py`。
2. 东盟附录 II/III/IV/VI:NPRA 转发的 2026-06-10 版 PDF,curl 000,新写 `tools/pw-download.py` 用浏览器网络栈下;PyMuPDF `find_tables` 抽表,表头文字认列(附录 III 的名字列叫「Substance/CAS No」,先认 substance 再认 cas);附录 IV 的 CI 列被并成一格,改按文本行「5 位 CI 号 + 颜色」解析。`tools/asean-annex-crawl.py`。
3. 日本化粧品基準:厚労省法令 DB 两页 HTML;別表 1 是编号纯文本,2–4 是版式表格(表头为空,靠「成分名」认),第 2 页无标题默认归別表 4。`tools/jp-std-crawl.py`。
4. 主键坑:`inci_catalog.no` 跨目录唯一,东盟第一次整批 `SQLITE_CONSTRAINT_PRIMARYKEY`,改带 `ASEAN-` 前缀。
完成判据: 各目录条数进库并在 `/zh-cn/inci/` 卡片与 `/zh-cn/ingredients/` 目录条上显示;`inci_registry.status='live'`。
结果:
- eu-annex **2,355** 条(II 1,760 / III 354 / IV 154 / V 54 / VI 33;III 的 691 行里 rowspan 续行无序号未收)· asean-acd **2,162** 条(II 1,719 / III 240 / IV 141 / VI 62)· jp-std **142** 条(別表 1 30 / 2 62 / 3 16 / 4 34)。
- 目录总计 **7/10 已入库,50,311 条**;`/zh-cn/inci/` 显示「10 个目录、已入库 50,311 条」,原料库首页目录条同步。
- 卡住的三个,原因都不在解析:
  · cn-stsc:NMPA 对本机整台不可达 —— curl 直连 412 挑战,Chromium 无头/有头/绕代理都回 39 字节空页,创始人自己的 Chrome 也是错误页;浙江药监镜像 404。**解法:换一台能打开 nmpa.gov.cn 的机器下 PDF 放进 `官网素材/`,按 `tools/nmpa-catalog.py` 的 PDF 路数解析。**
  · kr-safety:law.go.kr / elaw.klri.re.kr 都是 frame 套 session,无头只拿到几百字节外壳。
  · br-anvisa:datalegis 有 Cloudflare 人机挑战;in.gov.br 经本机代理回空页、直连超时。
  三张卡片仍标「待抓取」并挂官方原文链接,不拿别的目录冒充。

## Q19 · 原料页「各市场目录状态」+ 美国色素 + 欧盟附录续行
状态: 已完成(2026-09-10 23:20)
为什么: 创始人 23:1x「你先抓住做好自己的」。目录数据进了 7 个,但客户在原料页上仍只看到中国一条;买手问的是「我要卖的那几个国家分别能不能用」。
怎么做:
1. `[lang]/ingredients/[slug].astro`:按 INCI 精确 key 一次查 7 个目录,新增「各市场目录状态」段,逐目录给结论。措辞分三类不混:命中 → 「已列入(序号)+ 备注」;负面清单(欧盟附录 / 东盟 / 日本 / 加拿大 / 美国)未列 → 「禁限用表未列出 —— 不等于无限制」;正面目录(CosIng / 中国目录)未列 → 「未收录」;目录未抓取 → 「先看官方原文」。
2. `inci_registry.status` 之前只有三个新目录被标 live,us-fda / ca-hotlist 仍是 pending,页面上误显示「待抓取」;改成按 `inci_catalog` 里有数据即 live。CosIng 备注里「限制 ban substances that deplete the ozone layer」是 otherRestrictions 字段的通用脚注,7,339 行一并剥掉。
3. 美国色素:eCFR 官方 XML(Part 73 / 74,§ 写成 `&#xA7;`,Subpart C = Cosmetics),`tools/us-fda-colors.py` 抽 63 节,带「眼部不可用 / 含眼部用途 / 仅外用 / 须批次认证」标记;主键 `US-73.2030` 避免撞目录。us-fda 11 → **74** 条。
4. 欧盟附录 III 的 rowspan 续行(同一物质在不同产品类型的上限)之前被跳过;改为并回上一条备注,164 条限用物质补全了分类型上限(水杨酸 III/98:淋洗 3.0% / 其他 2.0% / 身体乳等 0.5%,3 岁以下不得用)。
完成判据: 原料页出现「各市场目录状态」并对水杨酸给出欧盟附录 III/98 + 加拿大 R-124 命中;us-fda ≥ 60;III/98 备注含三档浓度。
结果:
- `/zh-cn/ingredients/salicylic-acid/`:中国 06405 已列入 · CosIng 37595(III/98 V/3)· 欧盟附录 III/98 三档上限 · 加拿大 R-124 限用 · 东盟/日本「禁限用表未列出」;人参提取物:中国 05483、CosIng 56922,其余「未列出」。149 味里 CosIng 命中 131、中国 125、欧盟附录 4、加拿大 1(精确 INCI)。
- us-fda 74 条;eu-annex 2,355 条(III 续行合并 164 条);目录总计 **50,374 条**。
- 顺手刷新 27 页买手问答里的目录条数。
- 配方页同样加了「活性物在各市场目录里的状态」(`[lang]/formula/[code].astro`,只列命中):SR-1101 依克多因 CN 06443 / CosIng 56122,泛醇 CN 02292 / CosIng 35839;工艺参数照旧上锁,法规状态是公开事实。

---

## Q20 · 韩国 / 中国两个目录借第三方源补齐 + 原始资料归档
状态: 已完成(2026-09-10 23:56)
为什么: 创始人 23:3x「你要去调用第三方的,那才是更多的 / 他们都帮你收集了,你要去用他们搜索」;23:5x「资料存入你的文件夹,别乱放」。官方站(MFDS 法令库、nmpa.gov.cn)对本机不可达,不能一直挂「待抓取」。
怎么做:
1. kr-safety:大韩化妆品协会(helpcosmetic.or.kr)转载的 MFDS 官方英文译本(Notification 2023-73)附录 1 禁用 / 附录 2 限用 PDF,PyMuPDF 按列名认列(首行空表头),换页续行并回;`tools/kr-safety-crawl.py`,主键 `KR-{附录}/{序}`。
2. cn-stsc:化妆品法规网(hzpwjc.cn)逐条转录的 7 张表(2021 禁用原料 1,284 / 禁用植动物 109 / 表 3 限用 47 / 表 4 防腐剂 51 / 表 5 防晒剂 27 / 表 6 着色剂 157 / 表 7 染发剂 75),条数与 NMPA 原文逐表一致;`tools/cn-stsc-crawl.py`,主键 `CN-{表}/{序号}`。坑:表 6 的「1 2 3 …」列号行、109 表 1261 号长名字被录成两行,都要处理,否则主键撞。中检院(NMPA 直属)镜像的 2015 版 PDF 13.8MB 用 curl_cffi 流式取回留作对照。
3. 站上中英文备注都写明「第三方转录 / 协会转载,以官方原文为准」,不冒充官方抓取。
4. 原始资料从 %TEMP% 统一搬到 `data/registries/`(24 个文件 + README 列来源 URL 与大小),六个解析器 `--dir` 默认指过去;`.gitignore` 排除(第三方转录与大 PDF 不进公开仓)。
完成判据: 两目录 status=live 且 `/zh-cn/inci/cn-stsc/`、`/zh-cn/inci/kr-safety/` 有表;统一搜索 benzyl alcohol 能命中 cn-stsc;%TEMP% 里不再有解析依赖。
结果: kr-safety **1,268** 条、cn-stsc **1,750** 条;目录 **9/10 上线,共 53,392 条**;只剩 br-anvisa(datalegis 是 Cloudflare 人机挑战,in.gov.br 直连超时,第三方镜像还没找到能整表下载的)。等创始人表第 7 行(技术规范 PDF)不再需要。

---

## Q21 · 巴西目录借第三方法规库补齐 —— 十个目录全部上线
状态: 已完成(2026-09-11 00:17)
为什么: 创始人「他们都帮你收集了,你要去用他们搜索」。巴西官方镜像(gov.br 全域、bvsms、in.gov.br 公报、州政府转载)对本机全是 TLS 断连,anvisalegis 是 Cloudflare 人机挑战(不解),不能一直挂「待抓取」。
怎么做:
1. 搜索引擎 + curl_cffi 逐个探第三方:LegisWeb(2021 年前的附件全开、之后要订阅)、Cosmetoguia(行业媒体,有 2021–2022 现行表)、NormasBrasil(只有摘要)、Cenofisco(要登录)、巴拉圭商会 CAEDHPA(MERCOSUR 决议 PDF 全是扫描件)、阿根廷 InfoLEG / argentina.gob.ar(只有正文没附件表)。
2. 取到四张表:禁用 = LegisWeb 的 RDC 83/2016 附件(= GMC 62/14,1,375 项,带 CAS/EC/欧盟附录 II 序号)+ RDC 529/2021 新增 8 项(ANVISA 公告,CAS 从本库欧盟条目取);限用 + 香精致敏原 = Cosmetoguia 的 RDC 530/2021(90 + 26);防腐剂 = RDC 528/2021(60);防晒剂 = RDC 600/2022(36)。`tools/br-anvisa-crawl.py`,主键 `BR-{决议}/{序号}`。
3. 坑:LegisWeb 把附件表嵌在版式表的单元格里,`<table>.*?</table>` 非贪婪只切到前 705 行,后 670 行丢掉;改成整页扫 `<tr>`、靠「首格是序号」认数据行。Bash heredoc 又把 `\b` 写成退格,补丁一律走 Write。
4. 着色剂表(RDC 628/2022 = GMC 16/12)只有扫描件,本机没有 OCR,先不进库,站上中英文备注都写明。
完成判据: br-anvisa status=live,`/zh-cn/inci/br-anvisa/` 有表且带来源声明;hub 十个目录无「待抓取」。
结果: br-anvisa **1,595** 条;十个目录 **全部上线,共 54,987 条**。原始资料 30 个文件在 `data/registries/`(README 列来源)。

---

## Q22 · 导航按产线链路重排(七站)
状态: 已完成(2026-09-11 01:12)
为什么: 创始人 01:0x「各种类,我觉得你要思考下如何更好的摆放,形成一条链路」。原顶级导航按类型分组(产品库 / AI 工作台 / 服务 / 选型指南 / 工厂实力 / 原料溯源 / 关于),采购看不出各版块在产线上的先后。
怎么做:
1. 顶级项 = 七站,按工序编号(序号是真信息):① 源头·原料(溯源 / 草本原料库 / 各国原料目录 / 知识图谱 / AI 搜索)→ ② 包材(包材方案 / AI 包装设计)→ ③ 配方(技术与配方 / 实验室 / AI 共创 / AI 工作台)→ ④ 包装盒(外盒礼盒 / 彩盒·说明书·烟包膜)→ ⑤ 成品(产品品类 / 生产制造 / 工厂与产能 / OEM·ODM 服务 / 品牌孵化 / 工厂实力)→ ⑥ 质检·合规(质检体系 / 各国法规 / 东南亚通报账号)→ ⑦ 市场·获客(爆款调研 / 买手问答 / 对比 / 案例 / FAQ / 资讯 / AI 肌肤检测);「选品链路」工作台留在最前,「联系询盘」收 关于 / 创始人 / 发展历程。②③④⑤ 沿用 09-07 定的「先包材、再配方、再包装盒、才有产品」。
2. URL 一个不改;只动 pages.parent_id / sort_order / in_nav 与 18 语种 nav_label(`tools/nav-chain.py`,幂等)。产品库 hub 与 13 味草本子页退出导航(页面保留)。
3. 「④ 包装盒」没有独立页,slug 直接是包材库筛选地址(带 ?):页头 / masthead 拼链接遇 ? 不补斜杠,sitemap 跳过带 ? 的 slug。
4. CACHE_V v23→v24 全站 bust,部署。
完成判据: 首页与任一内页顶栏为「选品链路 · ①…⑦ · 联系询盘」九项;④ 链接落到 `/packaging/?t=use-gift,outer-carton`;sitemap 200 且不含带 ? 的地址。
结果: 已上线;zh-cn / en 都验过(en 为「1 · Source & botanicals … 7 · Market & buyers」)。

---

## Q23 · 各国化妆品法规版块(42 个市场 + 2025–2026 动态)
状态: 已完成(2026-09-11 01:4x)
为什么: 创始人 00:4x「你只写了东南亚的,还有全球的各国法规,还需要去收集最新的法规规定,那才是更全面的」。站上原来的「各国备案索引」只有东南亚六国的通报账号门槛。
怎么做:
1. 三个子代理并行用搜索引擎从官方站 / 法规咨询机构页整理 42 个市场(欧盟、英国、瑞士、土耳其、欧亚联盟、美国、加拿大、墨西哥、巴西、阿根廷、安第斯、智利、秘鲁;中国大陆、港、台、日、韩、东盟指令 + 新马泰印越菲、印度、澳、新;海合会、沙特、阿联酋、以色列、埃及、南非、尼日利亚、肯尼亚、摩洛哥、巴基斯坦、孟加拉、斯里兰卡、哈萨克、乌克兰),每市场:主管机构 / 主法规与引用号 / 生效 / 最近修订(日期·内容·来源)/ 上市路径 / 境内责任人 / 安全档案 / 标签要点 / 动物试验 / 禁限用清单(对得上本站目录的挂链接)/ 官方链接 / 来源;另 28 条 2025–2026 动态(欧盟 Omnibus VII/VIII、2026/909、过敏原标注 2026-07-31;英国 SI 2026/23;加拿大过敏原 2026-04-12;美国 MoCRA 进展;巴西 RDC 1.029/1.030;中国 NMPA 70 号公告、安评完整版;台湾 PIF 全面强制;韩国安评法;东盟 43 届附录;沙特 21 项禁用;哈萨克 EEC 74/2025;乌克兰 737 号决议 …)。
2. 原始 JSON 进 `data/regulations/`(README 列来源纪律),`tools/regulations-load.py` 用 Agnes 3.0(思考关、6 路并行)把英文句子译成中文,upsert 进 D1 `regulations` / `regulation_updates`。
3. 新页 `/[lang]/regulations/`:顶部 2025–2026 动态时间线,按地区筛,每市场一张卡,能对上的目录一键跳 `/inci/{registry}`;中英文都有免责(以官方原文为准,不是法律意见)。挂在导航 ⑥ 质检·合规 下;原「各国备案索引」改名「东南亚通报账号」,不再冒充全球。
坑: 页面首次上线 200 但 0 字节 —— SiteFooter 少传 `siblings` / `email`,`siblings.length` 抛 TypeError,Astro 流式渲染把异常吞成空 200;`wrangler tail` 一眼看出。构建两次 EPERM 删不掉 dist:Bash 会话的 cwd 停在 dist/server 里,Windows 不让删当前目录;先 cd 出来。翻译一开始 20 秒一句:舰队默认顺序商汤在前,改成 Agnes 3.0 优先 + 线程池。
完成判据: `/zh-cn/regulations/` 出 42 张卡 + 28 条动态,中文字段是译文而非英文;⑥ 下拉出现「各国法规」。
结果: 01:48 上线。zh/en 各 42 张卡、10 个地区、28 条动态、15 处直接跳本站目录;中文字段为 Agnes 译文(338 句缓存在 `data/regulations/_zh-cache.json`);⑥ 质检·合规 下拉 = 质检体系 / 各国法规 / 东南亚通报账号。另一坑:`_bohui.d1()` 走 `--command` + shell=True,URL 里的 `&` 被 cmd 当分隔符,jp/tw/mx 三条被截断丢掉;改成攒 SQL 文件走 `d1_exec`。

---

## Q24 · 整套代码 + 内容库复制到创始人自己的 CF 账号
状态: 已完成(2026-09-11 02:05)
为什么: 创始人 00:5x「你整理好之后,就复制一套代码到我的CF账号,我们准备另外发布一套系统,这边将进行全面的草本风格的改变」。公司站不动,副本独立。
怎么做:
1. `tools/deploy-copy.py`:去掉 .env 的两个变量 → wrangler 走本机 OAuth(hosonzuo@gmail.com,账号 b7362e…);在那边建 D1 `bohui-cms-v2`(f5010e65-8c6d-419f-8bf0-3e41762463f6)、KV `SESSION`(81c04d03823c40a98300f10977dc73a0)、Vectorize `bohui-kb`;从构建产物的 wrangler.json 生成 `dist/server/wrangler.copy.json`(Worker 名 `biosphere-ai`,tenant-map 按 workers.dev 第一段认站;TURNSTILE_SITE_KEY 清空,workers.dev 域名上验证组件会挡登录);secrets 从 .env 灌 R2_* / AUTH_SECRET / CRON_KEY / ANYSEARCH_KEY。
2. 公司库 `wrangler d1 export`(54 MB,53 张表)→ 用副本配置 `d1 execute --file -c wrangler.copy.json` 导入。
坑: OAuth 打 API 偶发 timed out(加了重试);`d1 list --json` 前后夹着警告(取第一个 JSON 值);构建与副本部署不能同时跑(clean-build 删 dist 时上传正在读);导库不带 `-c` 会拿公司 database_id 去他账号找 → 7404。
完成判据: https://biosphere-ai.hosonzuo.workers.dev/zh-cn/ 出首页,`/zh-cn/inci/` 有目录数。
结果: https://biosphere-ai.hosonzuo.workers.dev 首页 / 目录 / 法规 / 产品 / 配方 / 图谱 / 原料页全部 200;副本库 55 张表、inci_catalog 54,987、pages 248、regulations 42。导库两轮:第一轮 `FOREIGN KEY constraint failed`(导出按表名序,子表排父表前),第二轮延迟外键仍失败 → 剥掉建表里的 REFERENCES 子句后 476 秒导完(副本是快照,外键约束少了不影响跑;创始人那边要改成新系统时自己再定表结构)。登录页在 workers.dev 上不出 Turnstile(site key 绑域名),AUTH_SECRET 等 6 个 secret 已同步;R2 图片走他账号里同名 bohui-photo + S3 凭据。

---

## Q25 · 验收前:六站总览页 + 基地线索库 + 首页导览 + 全站体检
状态: 已完成(2026-09-11 10:1x)
为什么: 创始人 02:1x「下午公司老板需要全面验收!每个版块需要真的有东西,而不是找不到看不清楚」;随后三条纠正:「为什么每个版块前面加数字」「要不然悬停下拉,要不然点击进总览再显示下拉,你现在点击进入就是一个版块」「包装盒也是包材的,为什么你独立,这是错的」;另交来《草本原料基地.xlsx》:「你看看别人收集的,你看看你收集的」。
怎么做:
1. 顶栏改六站(源头·原料 / 包材 / 配方 / 成品 / 质检·合规 / 市场·获客),标签去序号,包装盒并回包材;每站一个总览页 `/stage/{key}/`(`[lang]/stage/[key].astro`):子项从导航树取,每张卡一句说明 + 实数(D1 batch 计数),站与站之间有上一站/下一站;悬停照旧出下拉。`tools/nav-stages.py` 幂等迁移;`getNav` 不再自动挂「父标签 · N」。
2. 创始人的 74 家基地线索(3 组别、8 家首批优选)入 D1 `herb_bases`,新页 `/bases/`(按组别筛、首批优选筛、主营品种自动挂到草本原料库),措辞「线索 · 持续核实,不代表已签约」;进 源头·原料 下拉。原表存 `data/bases/`。
3. 首页加「一条产线,六站看完」导览块(procgrid,zh/en),六张卡直达各站总览。
4. `tools/site-audit.py`:导航能点到的 48 页逐页量字数 / 卡片 / 占位词,结果在 `data/audit/site-audit-zh-cn.md`;修掉「含待抓取目录」旧文案。
坑: 首页英文块的 JSON 里有 `&`,走 `d1()` 命令行被 cmd 截断 → 改 SQL 文件;`nav-stages.py` 234 次 D1 调用要 10 分钟,以后批量标签也走文件。
结果: 顶栏「选品链路 · 源头·原料 · 包材 · 配方 · 成品 · 质检·合规 · 市场·获客 · 联系询盘」,点顶级进总览、悬停出下拉;/bases/ 74 张卡;首页导览块上线;体检表见 data/audit/。

---

## Q26 · 验收当天上午的六条纠正
状态: 已完成(2026-09-11 10:5x)
1. 「为什么每个版块前面加数字 / 104 是什么概念」→ 标签去序号,`getNav` 不再自动挂「父标签 · N」。
2. 「悬停下拉,点击进总览」→ 六站总览页 `/stage/{key}/`(Q25),顶级项落总览。
3. 「包装盒也是包材的」→ 并回包材站。
4. 「图谱、AI 搜索合并」→ AI 搜索退出下拉(仍在 AI 工作台与图谱页可达)。
5. 「/regulations/ 要做成独立业务,GEO/SEO 才读得到」→ 一市场一页 `/regulations/{id}/`(标题即买手会搜的句子,FAQ 结构化数据,42 页进 sitemap),列表页卡片标题链过去。
6. 「缺成熟产品展示版块,把过去代工的产品上传」→ `products.is_showcase` + 前台 `/portfolio/` + 后台 /bohui/products 勾「成熟产品展示」;图片走 /bohui/media。不写客户品牌。
7. 印尼《BPOM 限用物质》PDF(338 页,PerBPOM 17/2022)→ `tools/id-bpom-crawl.py` 入 `id-bpom` 目录;「预留上传端口」→ 后台 `/bohui/registries/` 贴 CSV(no,name,inci,cas,note)即建目录,`api/admin/registry`;权限:后台 /bohui/users 已有 admin / editor / sales / viewer 四种角色(Q14)。
8. 「会员机制:注册看全部、配方按检索条件展示一部分、卖点可看、成分比不对外」→ 成分比与工艺参数现在就不对外(配方页上锁);注册门槛是下一步,见 等创始人 表。

---

## Q27 · 验收当天下午(13:00–14:00)一口气上线的东西
状态: 已完成(2026-09-11 14:05)
- 首页轮播:创始人给的无字图,统一 1920×600(16:5),`object-fit: contain` + 高度跟比例走,不裁不放大;后续图放 `A:\0产品库\瓶子工厂\banner\final\`,用 `data/banner/` 里同样的裁切脚本。
- 导航:实底浅紫 #ecebfa(透明会和正文叠字);桌面居中;字体 A−/A+(改 html font-size,localStorage 记)。
- 首页块序按六站链路。
- 爆款监控:日报 + 周报合并为 `/trends/reports/`(周为组、日为条,14 天 / 4 周);爆款库 `/trends/` 4/6 列密排 + 趋势 SVG(日期×区域、品牌 Top10、平台占比)。日报正文进 D1 trend_report_sections(md-lite 渲染,表格截 40 行)。
- 品牌目标清单 `/brands/`:632 家(24 批 sonnet 子代理 + 创始人 8 月的 100 家风格调研并入:流派/视觉/转化/可借鉴/适配度),中文列由 Agnes 批翻(8 行一包),分页 60/页,国家筛选中文。「用于下午展示,后面会隐藏」(indexable=false)。
- 古方库 `/classics/`:创始人交的 986 方(抽检确认 5 置顶 / 主候选 26 / 外用 591 / 含禁用组分 364 只列名),页头挂图谱四数;进「源头·原料」下拉。
- 包材:列表卡「设计」+ 详情「一键生成包装设计」→ `/pack/?pack=CODE&type&material&capacity` 预填。
- 联系方式:号码 / 微信号 / 联系人全部删,只留「WhatsApp / WeChat:填表后我们联系」。
- AI 客服慢:providers.tier 改序,国内 Agnes 3.0 第一(原商汤 glm-5.2 20 秒/句)。
坑: 子代理并行 5 个把 Fable 额度打爆(429),换 sonnet;WebSearch 会话配额 200 次也被前几批用光,后面批次靠 WebFetch 官网;`d1()` 走命令行遇 `&` 截断;杀进程的 PowerShell 匹配到自己把 bash 会话带崩;CF 整站 purge 需 zone Cache Purge 权限(token 没有,靠 CACHE_V)。

---

## Q28 · 核心代码复制到 F:\0化妆品平台 → GitHub 个人号 + CF 个人号 + 交接文档
状态: 已完成(2026-09-11 17:1x)
为什么: 创始人 16:4x「把项目的核心代码和现在做的,除了那些公司文档都复制到这,并发布到 GitHub+CF 我的个人号上,并写好交接文档」。
怎么做:
1. 过滤复制:apps/ packages/ db/ tools/ data/ + package.json/pnpm 三件 + DESIGN.md + .claude/launch.json;不带公司 md 文档、docs/、logs/、.env、tools/.* 抓取缓存(267 MB)、data/registries、data/dump、sites/ 退役静态站、external/。52 MB、900 文件。
2. 写 HANDOVER.md(账号资源表、目录、本地跑、两套部署、数据表与装载工具、六站链路、AI 线、红线、已知坑、外部数据路径、待办)+ README.md + .env.example(只键名)。
3. git init → 私有仓 https://github.com/hosonzuo/cosmetic-platform(gh 切 hosonzuo;~/.gitconfig 全局用户名是 BIOSPHERECN,本地覆盖成 hosonzuo 才推得上)。
4. pnpm install → build → `tools/deploy-copy.py --skip-db` → https://biosphere-ai.hosonzuo.workers.dev 200(urllib 探测 403 是 UA 被挡,curl 带浏览器 UA 正常)。
坑: apps/web 下有个 Windows 保留名文件 `nul`,copytree 会炸,跳过。
结果: 副本目录、私有仓、个人 CF 三处同步。17:2x 创始人「CF 个人号改 skin2oem」→ Worker 改名 `skin2oem`(https://skin2oem.hosonzuo.workers.dev),副本仓租户映射把 skin2oem 主机指到完整内容,旧 Worker biosphere-ai 已删;「D1 也要复制到个人 CF」→ 整库 64.7 MB 分 10 块导入成功(60 张表),整批导入两次失败:D1_RESET_DO 回滚一次、代理超时一次,已改成分块+重试;导完全站 is_live=0(noindex)。data/dump 误提交 64 MB 已从仓库剔除。

---

## Q29 · 品牌目标清单改第三方视角:月访问量等多维数据 + 自产/代工调研 + 中性合作角度
状态: 进行中(2026-09-11 17:0x 起)
为什么: 创始人 16:5x「客户品牌也需要官网月访问量等多维数据,深入分析合作的各种角度,是不是本土生产或 OEM/ODM 都要深入调研;先用第三方角度专业分析,别和帛卉结合,那会缩小了解面」;稍早「只可以国家名字简写」「继续深挖」。
怎么做:
1. 国家简称:D1 里 4 条带注释的改掉;`tools/brand-leads-load.py` 加 `short_country()`(砍括号/分号/斜杠,英→中映射 60 国),`data/brands/_exclude.txt` 记创始人剔除的 26 家国内品牌,装载器跳过(之前删过一次又被回灌)。
2. brand_leads 加 28 列:visits_month/visits_period/rank_global/rank_country/rank_category/bounce/pages_visit/duration/top_geo/top_source(Similarweb 公开页)、mfg_model/mfg_country/mfg_evidence、channels/price_tier/funding、analysis/coop_angles + 8 个 _zh。
3. 子代理按 `data/brands/enrich/PROMPT.md` 逐家查(WebSearch 已用满 200 次/会话,改 WebFetch 打 Brave 搜索页 + 官网 + Similarweb),20 家一块,`todo-N.json → done-N.json`;`tools/brand-enrich-load.py --apply` 灌;`tools/brand-leads-zh.py --enrich` 译。
4. `/brands/` 页改版:价格带与生产方式标签、流量 KPI 条、主要地区/来源、母公司/营收/融资/渠道/生产方式(附证据)/联系渠道/负责人/第三方分析/合作角度;新增按生产方式筛选;不再显示「切入点」。
5. 同时继续扩充:batch25–30(美国、欧洲、日韩、东南亚、中东印度非洲、拉美加澳的新锐品牌)。
结果(2026-09-11 19:3x): 735 家、51 国全部完成第三方多维补充;465 家有 Similarweb 月访问量(其余 Similarweb 公开页不显示小站数字,照实留空);生产方式:自产 168 / 委托代工 61 / 混合 20 / 未披露 486(只认官网、维基、日韩商品页法定制造商披露,查不到不猜);同域同名重复合并 5 组,查实停业/域名易主/无法确认的 10 家删除并记 `_exclude.txt`。38 块 sonnet 子代理 + 5 块访问量回补,搜索通道(WebSearch 200 次/会话、Brave 429、Exa 免费额度、DDG 验证码)全封,靠 WebFetch 官网 + 维基 + Similarweb。公司站 v42 已发;个人 D1 整库再导。

---

## Q30 · GEO 四步落地(创始人 2026-09-11 20:4x 转来 Dan Koe 打法:「这个也需要用到我们的网站」)
状态: 第一轮已完成(2026-09-11 21:1x),后续按周滚动
怎么做:
1. 第一步「先被看见」:早已达标 —— robots.txt 明确放行 GPTBot/OAI-SearchBot/ChatGPT-User/ClaudeBot/PerplexityBot 等(RFC 9309 专属组自带后台禁抓);关于/产品中心/六站总览均为 SSR 纯 HTML。
2. 第二步「答案块」:42 个市场法规页首段加 `.answer` 直答(≤100 字,由库里上市路径/责任人/标签三字段各取第一句拼成,数字与正文同源);六站总览页首段直答 + meta description 同文,数字取自本页 counts。
3. 第三步「问题式标题」:法规页 `<title>`/H1 改成「在 X 卖化妆品要走什么流程?…」;买手问答 `/answers/` 本来就是问句;其余内容页下一轮。
4. 第四步「被引频率」:中间件打点新增 `cite:openai/perplexity/anthropic`(ChatGPT-User 等实时取页 = 正被引用)与 blob6 来路 `ref:chatgpt/perplexity/claude/gemini/bing/google/baidu`;`tools/pulse-collect.py` 采本周/上周对照并另存 `pulse` 表 `geo:YYYY-Www` 周快照;`/bohui/pulse` 新增「被引频率(GEO)」面板:被引取回、AI 带来的真人、AI 抓取、被引页涨跌、落地页、每周手工对照的 8 个查询词。
5. 22:1x 创始人「各国的是不是单独链接,是不是更利于 GEO」「你朝着必须引入 GEO 和 SEO 流量奋斗」→ 一页一问再拆两块:古方单页 `/zh-cn/classics/{id}/`(只给抽检确认 + v2 主候选 31 方,候选表噪音多不放单页;禁用组分方不建;组成重洗掉繁体剂量「兩錢」与做法词,装载器同步)、原料基地按「品种 × 产区」单页 `/zh-cn/bases/{最小id}/`(同组其它 id 302 过去;不给单家第三方公司立页)。两类只在中文语种出页并进站点地图,hreflang 只互指中文。列表页加链接。
待办: GSC「AI 概览展示次数」要创始人给 Search Console 权限;每周一跑一次 `python tools/pulse-collect.py` 并在 ChatGPT/Perplexity 手搜 8 个词记录;被引页的共同点复制到其它页;原料/指南页标题改问句。

---

## 等创始人给的东西(不阻塞队列,拿到就插队)

| # | 要什么 | 卡住谁 |
|:--|:--|:--|
| 1 | GitHub PAT | 678 个未提交改动推不上去,今天所有东西只有 F 盘一份 |
| 2 | 100 个基地的真实地点清单 | Q3 |
| 3 | 8 款产品的宣称改法 | Q2 |
| 4 | 付费模型 key | 对客 AI 跑在免费层,随时可能断供 |
| 5 | 平台域名与主体 | `F:\0化妆品平台`(另一条线) |
| 6 | Cloudflare Web Analytics 信标 token(dash → 数据分析 → Web Analytics → 添加站点) | Q16,看真人停留与点击 |
| 7 | ~~《化妆品安全技术规范(2015年版)》PDF~~ 已自行解决(中检院镜像 PDF + 第三方转录表,Q20) | — |
| 8 | 会员机制的口径:注册要哪些字段(邮箱 / 公司 / 市场)、哪些页要登录才看全部(原料库 / 配方库 / 目录?)、免费能看几条 | 会员门槛(下一步) |
| 9 | token 加 Zone → Cache Purge 权限(想一键清 CF 缓存时用;现在靠 CACHE_V 等效) | 缓存 |
| 10 | Google Search Console 权限(看「AI 概览展示次数」与低点击高排名页) | Q30 GEO 第二、四步 |
