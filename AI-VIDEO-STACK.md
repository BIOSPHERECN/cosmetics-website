# AI 出片工具链盘点 · 2026-09-08

创始人:「AI 会做视频的插件,你有收集吗?vidmuse 也是其中一个,你需要深入分析。后面我们需要用上。」

下面每一条**能用/不能用都是今天实测的**,不是看文档抄的。带 ✅ 的我跑通过并留了产物,带 ❌ 的贴了原始报错。

---

## 一、结论先行

出一条能打的短视频,要**五个能力**,不是一个工具:

| 能力 | 我们现在 | 缺口 |
|:--|:--|:--|
| ① 编排 / 字幕 / 数据驱动 | ✅ HyperFrames,本地跑,免费 | 无 |
| ② 文生图 | ✅ agnes-image,7.5 秒出图 | 无 |
| ③ **图生图(白瓶 → 高端设计,保轮廓)** | ❌ 套餐挡住 | **头号缺口** |
| ④ 图生视频(静图 → 运镜) | ⚠️ agnes-video 通了,但免费档限流 | 额度 |
| ⑤ 配乐 / 音效 | ❌ 完全没有 | VidMuse 可补 |

**没有 ③,「从白瓶子变成漂亮的高端设计」这个片子就做不出来。** 这是唯一必须花钱解决的一环。

---

## 二、VidMuse —— 你提到的这个

- **它是什么**:视频 → 配乐。输入一段视频,输出与画面在语义和节奏上对得上的音乐。
- **出处**:CVPR 2025,港科大等,开源在 `github.com/ZeyueT/VidMuse`。
- **原理**:长短时视觉模块(LSTV)同时看局部细节与全局氛围,再由 Transformer 把视频 embedding 自回归解码成音乐 token。训练集 V2M 有 36 万条「视频-音乐」对,来源包括电影预告、广告片、纪录片 —— **广告片这一类正是我们要出的东西**。
- **对我们的价值**:补上第 ⑤ 环。我上一条视频你没提音乐,但**没有声音的短视频在抖音基本没有完播率**。VidMuse 的好处是不用去挑 BGM、不用担版权 —— 音乐是按我们自己的画面生成的。
- **代价**:要本地跑推理(有 GPU 才现实),不是一个 API key 就能用。本机没有独显的话,这一条要么租卡,要么改用商用 API。

**判断:值得装,但排在 ③ 后面。** 先解决「画面好不好看」,再解决「有没有声音」。

---

## 三、逐环实测

### ① 编排:HyperFrames ✅ 已跑通

HeyGen 开源,Apache-2.0,本地渲染,**没有按次计费**。

- 实测:1080×1920 / 9 秒 / **30.4 秒渲完** / 1.7 MB;方版 1080×1080 / 8 秒 / 16.8 秒。
- 环境已装好:Node 25、ffmpeg 6.1.1 + ffprobe(已永久进用户 PATH)、headless Chrome 已下好。
- 工具链在仓库外 `F:\0cosmetic\_video-toolchain`(在仓库里 npm install 会被 pnpm workspace 拖崩)。
- 我们的脚本:`tools/pack-video.mjs`,四幕结构,数据全部来自 `tools/pack-all.json`。

**它擅长**:字幕、数据可视化、快闪墙、版式动画、批量参数化出片。
**它不擅长**:任何需要「拍出来」的画面 —— 它不会凭空生成一只漂亮的瓶子。

### ② 文生图:agnes-image ✅ 通

```
POST /v1/images/generations  model=agnes-image-2.5-flash
→ HTTP 200,7,519 ms,返回 {url, b64_json, revised_prompt}
```
仓库里 `tools/gen-packref.mjs` 一直用它出包装风格参考图。
**注意**:从 Cloudflare Worker 调必 429(共享出口 IP 被限),只能本地跑 —— 这条早就写在那个脚本的注释里。

### ③ 图生图:❌ 当前套餐做不了

这是「白瓶 → 高端设计」的关键一步 —— 必须**保持同一个轮廓**,否则前后对比就不成立。

实测三次,全部失败:

```
POST /v1/images/edits  model=agnes-image-2.5-flash
→ 403 team not allowed to access model
     (可用清单:agnes-2.0-flash / agnes-image-2.0-flash / agnes-video-v2.0
      / agnes-image-2.1-flash / agnes-2.5-flash …)

POST /v1/images/edits  model=agnes-image-2.1-flash  → 503 no available server (24.3 秒后)
POST /v1/images/edits  model=agnes-image-2.0-flash  → 500 could not convert string to float: ''
```

**外面能做这件事的四个,按适配度排:**

| 模型 | 强在哪 | 对我们的意义 |
|:--|:--|:--|
| **FLUX Kontext** | 多主体编辑时保姿态、保版面;**文字保留最好** | 瓶身上要压品牌字时首选 |
| **Qwen-Image-Edit** | 像素级精度最好,中英文字替换保透视/材质/光影 | 出中文标签、做本地化版本首选 |
| **Nano Banana Pro**(Gemini) | 干净的产品图、颜色准 | 纯外观翻新、不带字时够用 |
| **即梦 / Seedream** | 国内直连、便宜 | 量大时的备选,文字会糊 |

**我的建议**:先接 **FLUX Kontext**(保轮廓 + 保字最稳),中文标签场景再补 **Qwen-Image-Edit**。两家都有按次计费的 API,不需要 GPU。

### ④ 图生视频:⚠️ 我们其实已经有了,但额度不够

**今天挖出来的**:舰队里那个一直标着 `can_image=0, can_text=0` 的 `agnes-video`,接口是通的 ——

```
POST /v1/video/generations   model=agnes-video-2.5-flash
→ HTTP 200 {"id":"task_QeFhXa6…","video_id":"video_…"}
GET  /v1/video/generations/{task_id}
→ 200 {"status":"NOT_START","progress":"0%","action":"textGenerate", …}
```
可用视频模型三个:`agnes-video-2.5-flash` / `agnes-video-2.5` / `agnes-video-v2.0`。

**但是**:再起第二个任务就吃
`429 You've reached the API rate limit for free users. Upgrade to a Token Plan`。
免费档跑视频不现实 —— 一条片子要好几个镜头,一个镜头一个任务。

**外面的替代**:可灵(Kling)、即梦、Seedance 都做图生视频且国内直连;Wan 2.x 开源可本地跑(要显卡)。

### ⑤ 配乐:❌ 没有

VidMuse(上面)或商用 API。目前我们的片子是**默片**。

### ⑥ 口播 / 数字人:不建议做

HeyGen 本体做这个,但工厂号真正跑得动的是**老板本人出镜说人话**。数字人在 B2B 供应链内容里反而掉信任 —— 采购要看的是真车间、真人。这一条我建议不投。

---

## 四、我们独有的、别人买不到的

工具都是公开的,谁都能买。真正的差别在素材:

- **4,476 张自有白底实拍** + 每款的类型/材质/容量/参考价/起订量
- **4,518 个自有编码**,能做到「报编码就能对上款」
- **18 张工厂实景照**、阿里店铺相册
- **13 味原料档案 + 三大产区**

文生视频画不出「ST-A1044 这一款」。**AI 是用来给我们的真实素材做包装的,不是用来替代素材的。** 这条界线一旦越过,做出来的就是别家也能做的通用广告片。

---

## 五、要你拍板的

1. **接哪一家图生图**(第 ③ 环,唯一卡死的一环)。
   我推荐 FLUX Kontext;要出中文标签再加 Qwen-Image-Edit。你给 key,我当天接上。
2. **agnes 要不要升 Token Plan**。升了 ④ 环直接可用,不用再找新供应商。
3. **VidMuse 跑在哪**。本机有独显就本地跑;没有就先用商用 BGM,或者暂时不加声音。

---

## 六、接上之后的片型(分镜与脚本另出)

1. **变身片**(你要的那条):白瓶 → 三版高端设计 → 成品在货架上。卡在第 ③ 环。
2. **品类片**:已经做出来了,4,518 款快闪墙 + 收敛到一款。
3. **痛点片**:选错瓶型的代价 —— 高油相配方把 PET 泡变形。
4. **工厂片**:18 张实景 + 运镜 + 数字字幕。
5. **对比片**:同一支配方装进三种包材,卖相差多少。
