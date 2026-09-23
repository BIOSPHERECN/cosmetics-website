# biosphere-ai.com 设计系统

> 2026-09-02 立。判据来自 `apple-design`(emilkowalski,WWDC《Designing Fluid
> Interfaces》《The Details of UI Typography》提炼)与 apple.com 实测 token。
> 实现全部收在 `packages/core/src/styles/dtc.css` 末尾三段「Apple 层」,
> 作用域 `html[data-brand="biosphere-ai"]`,整段删除即可回滚。

## 一、色:两色底 + 一处重音

| 角色 | 值 | 用在哪 |
|---|---|---|
| 主底 | `#ffffff` | 大多数版块 |
| 次底 | `#f5f5f7` | 交替版块,制造节奏 |
| 品牌重音 | `#D0D0F0` 长春花紫 | **只用在数字带一条**;页脚沿用 |
| 墨色 | `#312052` 深紫 | 全部文字 |
| 分隔线 | `rgb(0 0 0 / .08)` | 极淡,让留白说话 |

**铁律:一页最多三种底色。** 此前是五种(米白/黄沙/浅紫/深紫/白),
读起来像拼贴 —— 这是"不高级"的头号原因。Apple 全站靠留白分区,不靠色块分区。
紫色是创始人从公司文档采样的品牌色,保留但降级为点缀,绝不再铺满整屏。

**禁用:** 米白 `#f9f8f5`(显暖旧)、黄沙 `#eeeedc`(显土)、任何第四种底色。

## 二、字:系统字体 + 字距分档

正文字体栈 = `-apple-system → SF Pro Text → Segoe UI Variable → 苹方`。
理由:系统字体自带光学字号、字距表与易读性调校,网络字体拿不到。
此前栈是 Futura → Century Gothic → Helvetica Neue → **Arial**(前两个多数机器没装),
Arial 配苹方正是"免费模板"观感的来源。

字距按字号分档(Apple:字距是字号的函数,绝不一个值走天下):

| 层级 | letter-spacing |
|---|---|
| h1 / 店招名 | `-0.02em` |
| h2 | `-0.01em` |
| h3 | `-0.005em` |
| 正文 | `0` |
| 小号大写 eyebrow | `0.14em`(原 0.25em 是编辑腔,不是 Apple 腔) |

标题字号上限(创始人 2026-08-31 定):H1 40px / H2 31px / H3 22px。
版心 `--ck-maxw: 112.5rem`(1800px)**是铁令,不可改**。

## 三、形与材质

- 按钮:**胶囊** `border-radius: 980px`,按下 `scale(0.97)`(Apple 第一铁律:响应发生在按下,不是松手)
- 卡片:圆角 `18px`,**双层阴影** `0 2px 8px /.04 + 0 8px 24px /.08`(单层是贴纸感)
- 页头:半透明 + `backdrop-filter: blur(20px) saturate(180%)`,内容从下面穿过;硬线换渐隐边

## 四、动效:先减后加

只在**用户直接触碰**的地方给即时反馈,统一 `0.22s` + `cubic-bezier(.25,.46,.45,.94)`:
可点卡片 `translateY(-2px)` + 阴影加深;正文内链下划线从中间长出。

**刻意不做:** 滚动视差、逐个入场淡入、数字滚动 —— 那些是"看起来有动效",
不是"用起来跟手",而且拖慢首屏。只动 `transform` / `opacity`,永不动 layout。

## 五、无障碍偏好三档

`prefers-reduced-motion` 取消位移;`prefers-reduced-transparency` 页头转实底;
焦点环 2px 实色 + 3px 外偏移,**即时出现,绝不做过渡动画**。

## 六、改这个站之前必读

1. **先量化再动刀**:用 `node tools/shot.mjs <url> <out> "" <宽> "<JS>"` 取当前计算值,拿数字对照,别凭感觉。
2. **token 层动刀**:改 CSS 变量,不逐组件打补丁。
3. **CSS 改动前必须** `rm -rf apps/web/node_modules/.vite`,否则改动被缓存吞掉。
4. **交付前实拍自审**:桌面 1440 + 手机 375 双档全页截图,切片逐段看过才算完成。
