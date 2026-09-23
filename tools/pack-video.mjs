/**
 * 包材短视频出片 —— HyperFrames,竖版,按短视频的打法做,不是把网页搬进视频。
 *
 * 第一版做成了「白底静物 + 规格文字 + 缓慢推近」,创始人一句话否掉:
 *   「这种视频完全没价值啊,你要看看抖音、TikTok 别人是怎么样做视频的」。
 * 他是对的。那一版是一张会动的海报,不是短视频:
 *   · 横版方图,而信息流是竖版满屏的天下;
 *   · 第一帧是品牌名和产品照 —— 而算法在 **1.5 秒** 就决定要不要继续分发。
 *     前三秒不是拿来「介绍品牌」的,是拿来换取继续说话的权利;
 *   · 八秒一个镜头、只有一次推近 —— 信息密度接近零,没有任何理由不划走。
 *
 * 这一版按调研到的结构重做(权威信号 → 好奇缺口 → 兑现承诺):
 *   幕① 0.0–1.6s  钩子:满屏大字,说采购真正的痛点,**不出现品牌名**
 *   幕② 1.6–4.6s  奇观:48 张实拍快闪成墙 + 计数器跳到 4,518
 *                  ——「多」本身就是别人拍不出来的画面,这是我们独有的资产
 *   幕③ 4.6–7.4s  收敛:墙退场,一款居中放大,编码与规格逐行弹出
 *   幕④ 7.4–9.0s  兑现:一句承诺 + 站点
 *
 * 素材是真的:4,476 张白底实拍 + 每款的类型/材质/容量/参考价/起订量,
 * 视频里每个字都来自 tools/pack-all.json,没有一个是编的。
 * 文生视频做不了这件事 —— 它画不出「ST-A1044 这一款」的实物。
 *
 * 环境:Node ≥ 22 · ffmpeg 与 ffprobe 在 PATH 上 · 首次运行自动下载 headless Chrome。
 *   渲染工具链装在仓库**外面** F:\0cosmetic\_video-toolchain(HF_HOME 可覆盖)——
 *   在仓库里 npm install 会被上层 pnpm workspace 拖崩;
 *   而 node_modules/.bin 的 .CMD 在 Node ≥ 20 的 spawnSync 里是 EINVAL,
 *   所以直接用当前 node 跑 CLI 的 .mjs 入口。
 *
 * 用法:
 *   node tools/pack-video.mjs --hero ST-A1044 --render          竖版 1080×1920
 *   node tools/pack-video.mjs --hero ST-A1044 --size 1080x1080  方版(阿里国际站)
 *   node tools/pack-video.mjs --hero ST-A1044                   只生成,不渲染
 *     --wall 60 改快闪墙张数;--seconds 改总时长。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SNAP = join(ROOT, 'tools', 'pack-all.json');
const IMG_ROOT = join('F:', '0cosmetic', '_r2迁移中转', 'media', 'pack');
const IMG_DIRS = ['stnewwave', 'shunxu', 'web'].map((d) => join(IMG_ROOT, d));
const OUT_ROOT = join(ROOT, '.video');
const HF_HOME = process.env.HF_HOME ?? 'F:/0cosmetic/_video-toolchain';
const HF = join(HF_HOME, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), String(arr[i + 1] ?? '').startsWith('--') ? true : arr[i + 1] ?? true]);
  return a;
}, []));

const [W, H] = String(args.size ?? '1080x1920').split('x').map(Number);
const DUR = Number(args.seconds ?? 9);
const WALL = Number(args.wall ?? 48);
const VERT = H > W;

const TYPE_ZH = {
  'pump-bottle': '按压泵瓶', 'airless-bottle': '真空瓶', 'dropper-bottle': '滴管瓶',
  'spray-bottle': '喷雾瓶', 'screw-bottle': '旋盖瓶', 'flip-bottle': '翻盖瓶',
  'foam-pump': '泡沫泵瓶', 'roll-on': '走珠瓶', jar: '膏霜罐', tube: '软管',
  stick: '棒管', 'compact-powder-case': '粉盒', 'mask-pouch': '面膜袋',
  'outer-carton': '外盒', cap: '盖与泵头',
};
const FMT_ZH = {
  serum: '精华', essence: '精华水', cream: '面霜', lotion: '乳液', gel: '啫喱',
  toner: '化妆水', foam: '洁面泡沫', oil: '油', balm: '膏', powder: '粉',
  cushion: '气垫', mask: '面膜',
};

const findImg = (code) => {
  for (const d of IMG_DIRS) {
    const p = join(d, `${code}.webp`);
    if (existsSync(p)) return p;
  }
  return null;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = (f) => Math.round(Math.min(W, H) * f);

/* 幕的时间点。改总时长时按比例走,不用逐条改。 */
const T = (() => {
  const k = DUR / 9;
  return {
    wall: +(1.6 * k).toFixed(2),
    focus: +(4.6 * k).toFixed(2),
    cta: +(7.4 * k).toFixed(2),
    end: DUR,
  };
})();

function composition(hero, wallCodes, total) {
  const type = TYPE_ZH[hero.type] ?? hero.type;
  const caps = String(hero.capacity ?? '').split('/').filter(Boolean).slice(0, 4);
  const fmts = String(hero.compat_formats ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((f) => FMT_ZH[f] ?? f).slice(0, 3);
  const cols = VERT ? 6 : 8;

  const specs = [
    [type, fmts.length ? `适配${fmts.join(' / ')}` : ''],
    [caps.join(' / '), hero.material || ''],
    [hero.price_ref ? `${hero.price_ref} / 只 · FOB 广州` : '',
     hero.moq ? `起订 ${Number(hero.moq).toLocaleString('en-US')}` : ''],
  ].map((r) => r.filter(Boolean).join('　·　')).filter(Boolean);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0B0B0C; }
      body { font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif; color: #fff; }
      #root { position: relative; width: ${W}px; height: ${H}px; }
      .scene { position: absolute; inset: 0; }

      /* 幕① 钩子:满屏大字。第一帧不是品牌名,是采购自己说过的那句话 */
      .hook { display: flex; flex-direction: column; justify-content: center;
              padding: 0 ${px(0.09)}px; gap: ${px(0.018)}px; }
      .hk1 { font-size: ${px(0.062)}px; font-weight: 500; color: #9A9AA0; }
      .hk2 { font-size: ${px(0.108)}px; font-weight: 800; line-height: 1.16; letter-spacing: -0.02em; }
      .hk3 { font-size: ${px(0.050)}px; font-weight: 500; color: #A98BD6; margin-top: ${px(0.026)}px; }

      /* 幕② 快闪墙:「多」本身就是画面 */
      .wall { display: grid; grid-template-columns: repeat(${cols}, 1fr);
              gap: ${px(0.008)}px; padding: ${px(0.018)}px; align-content: center; }
      .cellimg { width: 100%; aspect-ratio: 1/1; object-fit: contain;
                 background: #fff; border-radius: ${px(0.010)}px; }
      .scrim { background: rgba(11,11,12,.58); }
      .count { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; }
      .count .n { display: block; font-size: ${px(0.21)}px; font-weight: 800; letter-spacing: -0.03em;
                  font-variant-numeric: tabular-nums; }
      .count .u { display: block; margin-top: ${px(0.006)}px; font-size: ${px(0.052)}px;
                  font-weight: 600; color: #E6E6EA; }

      /* 幕③ 收敛到一款 */
      .focus { display: flex; flex-direction: column; align-items: center; justify-content: center;
               gap: ${px(0.016)}px; padding: 0 ${px(0.08)}px; }
      .focus img { width: ${px(0.60)}px; background: #fff; border-radius: ${px(0.028)}px; }
      .fcode { margin-top: ${px(0.014)}px; font-size: ${px(0.112)}px; font-weight: 800; letter-spacing: -0.02em;
               font-family: ui-monospace, "SF Mono", Consolas, monospace; }
      .fspec { font-size: ${px(0.040)}px; color: #C9C9CF; text-align: center; line-height: 1.55; }

      /* 幕④ 兑现 */
      .cta { display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: ${px(0.020)}px; padding: 0 ${px(0.09)}px; text-align: center; }
      .cta .big { font-size: ${px(0.100)}px; font-weight: 800; line-height: 1.18; letter-spacing: -0.02em; }
      .cta .sub { font-size: ${px(0.044)}px; color: #9A9AA0; line-height: 1.5; }
      .cta .site { margin-top: ${px(0.018)}px; padding: ${px(0.018)}px ${px(0.05)}px;
                   border-radius: 999px; background: #7C4DA8; font-size: ${px(0.042)}px; font-weight: 600; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}"
         data-width="${W}" data-height="${H}">

      <div id="sHook" class="clip scene hook" data-start="0" data-duration="${(T.wall + 0.35).toFixed(2)}" data-track-index="0">
        <div class="hk1" id="hk1">跟包材厂对款的时候,别再说</div>
        <div class="hk2" id="hk2">「就那个<br />圆圆的白瓶子」</div>
        <div class="hk3" id="hk3">他们真的不知道你说的是哪一款</div>
      </div>

      <div id="sWall" class="clip scene wall" data-start="${T.wall}" data-duration="${(T.focus - T.wall + 0.35).toFixed(2)}" data-track-index="1">
        ${wallCodes.map((c) => `<img class="cellimg" src="assets/wall/${esc(c)}.webp" alt="" />`).join('\n        ')}
      </div>
      <div id="sScrim" class="clip scene scrim" data-start="${T.wall}" data-duration="${(T.focus - T.wall + 0.35).toFixed(2)}" data-track-index="2"></div>
      <div id="sCount" class="clip count" data-start="${T.wall}" data-duration="${(T.focus - T.wall + 0.35).toFixed(2)}" data-track-index="3">
        <span class="n" id="cnum">0</span>
        <span class="u" id="cunit">款包材 · 每款一个编码</span>
      </div>

      <div id="sFocus" class="clip scene focus" data-start="${T.focus}" data-duration="${(T.cta - T.focus + 0.35).toFixed(2)}" data-track-index="4">
        <img id="fimg" src="assets/${esc(hero.code)}.webp" alt="${esc(hero.code)}" />
        <div class="fcode" id="fcode">${esc(hero.code)}</div>
        ${specs.map((s, i) => `<div class="fspec" id="fs${i}">${esc(s)}</div>`).join('\n        ')}
      </div>

      <div id="sCta" class="clip scene cta" data-start="${T.cta}" data-duration="${(T.end - T.cta).toFixed(2)}" data-track-index="5">
        <div class="big" id="cbig">报编码<br />就能对上款</div>
        <div class="sub" id="csub">${total.toLocaleString('en-US')} 款在线可筛 · 白底实拍 · 规格写在明处</div>
        <div class="site" id="csite">biosphere-ai.com</div>
      </div>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      /* 一条 paused 时间线。HyperFrames 按帧 seek ——
         任何自走的动画(setInterval、自动播放、CSS animation)都会渲出不确定的帧。 */
      const tl = gsap.timeline({ paused: true });
      const H1 = ${T.wall}, H2 = ${T.focus}, H3 = ${T.cta};

      /* 幕① 前 1.5 秒定生死:三行字压着节奏进,不留缓冲 */
      tl.from("#hk1", { y: 26, opacity: 0, duration: 0.30, ease: "power3.out" }, 0.05);
      tl.from("#hk2", { y: 44, opacity: 0, duration: 0.40, ease: "power3.out" }, 0.20);
      tl.from("#hk3", { y: 18, opacity: 0, duration: 0.32, ease: "power3.out" }, 0.60);
      tl.to("#sHook", { opacity: 0, duration: 0.26, ease: "power2.in" }, H1 - 0.06);

      /* 幕② 快闪墙:逐格弹出,0.012 秒一格 —— 这一段要的就是「密」 */
      tl.from("#sWall .cellimg", { scale: 0.4, opacity: 0, duration: 0.34,
        stagger: { each: 0.012, from: "random" }, ease: "back.out(2)" }, H1);
      tl.from("#sScrim", { opacity: 0, duration: 0.45 }, H1 + 0.45);
      /* 计数器走补间再写 DOM —— seek 到任意帧都会重算,不是自增,可复现 */
      const cnt = { v: 0 };
      tl.to(cnt, { v: ${total}, duration: 1.1, ease: "power2.out",
        onUpdate: () => { document.getElementById("cnum").textContent = Math.round(cnt.v).toLocaleString("en-US"); } }, H1 + 0.5);
      tl.from("#cunit", { y: 20, opacity: 0, duration: 0.36, ease: "power3.out" }, H1 + 0.75);
      tl.to("#sWall", { scale: 1.14, opacity: 0, duration: 0.34, ease: "power2.in" }, H2 - 0.1);
      tl.to("#sScrim", { opacity: 0, duration: 0.28, ease: "power2.in" }, H2 - 0.1);
      tl.to("#sCount", { opacity: 0, duration: 0.28, ease: "power2.in" }, H2 - 0.1);

      /* 幕③ 从「多」收敛到「这一款」—— 承诺开始兑现 */
      tl.from("#fimg", { scale: 0.72, opacity: 0, duration: 0.44, ease: "back.out(1.4)" }, H2);
      tl.from("#fcode", { y: 30, opacity: 0, duration: 0.34, ease: "power3.out" }, H2 + 0.20);
      tl.from("#sFocus .fspec", { y: 18, opacity: 0, duration: 0.30, stagger: 0.09, ease: "power3.out" }, H2 + 0.36);
      tl.to("#sFocus", { opacity: 0, duration: 0.24, ease: "power2.in" }, H3 - 0.06);

      /* 幕④ 一句话说清能拿到什么 */
      tl.from("#cbig", { y: 34, opacity: 0, duration: 0.38, ease: "power3.out" }, H3);
      tl.from("#csub", { y: 20, opacity: 0, duration: 0.32, ease: "power3.out" }, H3 + 0.16);
      tl.from("#csite", { scale: 0.86, opacity: 0, duration: 0.32, ease: "back.out(2)" }, H3 + 0.32);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

function main() {
  const rows = JSON.parse(readFileSync(SNAP, 'utf8'));
  const total = rows.length;
  const heroCode = String(args.hero ?? 'ST-A1044').toUpperCase();
  const hero = rows.find((r) => r.code.toUpperCase() === heroCode);
  if (!hero) { console.log(`库里没有 ${heroCode}`); process.exit(1); }
  const heroImg = findImg(hero.code);
  if (!heroImg) { console.log(`${hero.code} 本地没有实拍`); process.exit(1); }

  /* 快闪墙挑图:跨类型轮着抽,画面才有形状差异 ——
     同一类型连着放,墙看起来就只有一款瓶子复制了四十八次。 */
  const byType = new Map();
  for (const r of rows) {
    if (!r.img || r.code === hero.code || !findImg(r.code)) continue;
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push(r.code);
  }
  const buckets = [...byType.values()];
  const wall = [];
  for (let i = 0; wall.length < WALL && i < 500; i++) {
    for (const b of buckets) { if (b[i]) wall.push(b[i]); if (wall.length >= WALL) break; }
  }

  const dir = join(OUT_ROOT, `${hero.code}-${W}x${H}`);
  mkdirSync(join(dir, 'assets', 'wall'), { recursive: true });
  copyFileSync(heroImg, join(dir, 'assets', `${hero.code}.webp`));
  for (const c of wall) copyFileSync(findImg(c), join(dir, 'assets', 'wall', `${c}.webp`));
  writeFileSync(join(dir, 'index.html'), composition(hero, wall, total));
  writeFileSync(join(dir, 'hyperframes.json'), JSON.stringify({
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
  }, null, 2) + '\n');
  console.log(`  ✓ ${hero.code}  ${W}×${H}  ${DUR}s  墙 ${wall.length} 张  → ${dir}`);

  if (!args.render) {
    console.log(`\n只生成了合成。先看效果:\n  node "${HF}" preview "${dir}"\n加 --render 才渲染。`);
    return;
  }
  try {
    /* ffmpeg / ffprobe 已经加进用户 PATH,但已经开着的终端不会自动刷新 ——
       这里再把工具链的 bin 临时挂到前面,新老终端都能跑。 */
    execFileSync(process.execPath, [HF, 'render'], {
      cwd: dir, stdio: 'inherit',
      env: { ...process.env, PATH: `${join(HF_HOME, 'bin')};${process.env.PATH}` },
    });
  } catch (e) {
    /* 渲染失败必须报出来。最常见的是 ffmpeg / ffprobe 不在 PATH ——
       CLI 只打一行提示就退出,不抛异常,静默当成功过一次。 */
    console.log(`  × 渲染失败:${String(e).slice(0, 200)}`);
    process.exitCode = 1;
  }
}

main();
