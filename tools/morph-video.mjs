/**
 * 「白瓶 → 高端设计」变身片 —— 把 pack-morph 出的四帧串成竖版短视频。
 *
 * 分镜见仓库根目录 STORYBOARD.md。这里只实现骨架那一版:
 *   幕① 0.0–3.5s  起点:白瓶 + 三行钩子(不出品牌名)
 *   幕② 3.5–11.5s 四步变身,每步 2 秒,字幕跟着走
 *   幕③ 11.5–15.0s 成品定格 + 落点
 *
 * 与分镜的两处**故意不同**,都是合规判断:
 *   · 钩子里的「报价翻了 4 倍」删掉了。分镜自己的自检表也写着
 *     「无编造数字 —— 没有实据就换成不带数字的说法」。我们没有这个依据。
 *   · 片尾明确标注「AI 生成的设计效果演示」。变身段本来就是效果图,
 *     不标注等于让人以为这是我们做出来的成品。
 *
 * 渲染:HyperFrames(本地、免费、无水印),与 tools/pack-video.mjs 同一条工具链。
 * 用法:node tools/morph-video.mjs --frames .video/morph --render
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HF_HOME = process.env.HF_HOME ?? 'F:/0cosmetic/_video-toolchain';
const HF = join(HF_HOME, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), String(arr[i + 1] ?? '').startsWith('--') ? true : arr[i + 1] ?? true]);
  return a;
}, []));

const FRAMES = args.frames ?? join(ROOT, '.video', 'morph');
const START = args.start ?? join(ROOT, '.video', 'ST-A1044-one.png');
const OUT = args.out ?? join(ROOT, '.video', 'morph-film');
const [W, H] = String(args.size ?? '1080x1920').split('x').map(Number);
const px = (f) => Math.round(Math.min(W, H) * f);

/* 四步:文件名 → 字幕。与 STORYBOARD 第二节的时间码一致(每步 2 秒)。 */
const STEPS = [
  { f: '1-material.png',  zh: '第一步 · 材质', en: 'Step 1 · Material' },
  { f: '2-structure.png', zh: '第二步 · 结构', en: 'Step 2 · Structure' },
  { f: '3-colour.png',    zh: '第三步 · 色彩', en: 'Step 3 · Colour' },
  { f: '4-light.png',     zh: '第四步 · 光影', en: 'Step 4 · Light' },
];
const T = { hook: 0, morph: 3.5, per: 2, end: 15 };
const t2 = T.morph + STEPS.length * T.per;   // 变身结束 = 11.5

function html() {
  const stepEls = STEPS.map((s, i) => {
    const at = T.morph + i * T.per;
    return `      <div id="s${i}" class="clip shot" data-start="${at.toFixed(2)}" data-duration="${(T.per + 0.35).toFixed(2)}" data-track-index="${i + 2}">
        <img src="assets/${s.f}" alt="" />
      </div>
      <div id="c${i}" class="clip cap" data-start="${at.toFixed(2)}" data-duration="${T.per.toFixed(2)}" data-track-index="${i + 7}">
        <b>${s.zh}</b><span>${s.en}</span>
      </div>`;
  }).join('\n');

  const tl = STEPS.map((_, i) => {
    const at = (T.morph + i * T.per).toFixed(2);
    return `      tl.from("#s${i} img", { opacity: 0, scale: 1.06, duration: 0.5, ease: "power2.out" }, ${at});
      tl.from("#c${i}", { y: 22, opacity: 0, duration: 0.36, ease: "power3.out" }, ${(T.morph + i * T.per + 0.15).toFixed(2)});
      tl.to("#c${i}", { opacity: 0, duration: 0.26, ease: "power2.in" }, ${(T.morph + i * T.per + T.per - 0.3).toFixed(2)});`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0B0B0C; }
      body { font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #fff; }
      #root { position: relative; width: ${W}px; height: ${H}px; }
      .scene { position: absolute; inset: 0; }
      .shot { position: absolute; inset: 0; display: grid; place-items: center; }
      .shot img { width: ${px(0.78)}px; border-radius: ${px(0.02)}px; }

      .hook { display: flex; flex-direction: column; justify-content: flex-end;
              padding: 0 ${px(0.09)}px ${px(0.14)}px; gap: ${px(0.016)}px;
              background: linear-gradient(to top, rgba(11,11,12,.92) 34%, rgba(11,11,12,0) 62%); }
      .hk1 { font-size: ${px(0.056)}px; color: #9A9AA0; }
      .hk2 { font-size: ${px(0.098)}px; font-weight: 800; line-height: 1.18; letter-spacing: -0.02em; }
      .hk3 { font-size: ${px(0.046)}px; color: #A98BD6; margin-top: ${px(0.02)}px; }

      .cap { position: absolute; left: 0; right: 0; bottom: ${px(0.16)}px; text-align: center; }
      .cap b { display: block; font-size: ${px(0.072)}px; font-weight: 800; letter-spacing: -0.01em;
               text-shadow: 0 ${px(0.006)}px ${px(0.03)}px rgba(0,0,0,.85); }
      .cap span { display: block; margin-top: ${px(0.006)}px; font-size: ${px(0.036)}px; color: #C9C9CF;
                  letter-spacing: 0.04em; }

      .end { display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
             padding: 0 ${px(0.09)}px ${px(0.10)}px; gap: ${px(0.018)}px; text-align: center;
             background: linear-gradient(to top, rgba(11,11,12,.94) 30%, rgba(11,11,12,0) 58%); }
      .end .big { font-size: ${px(0.086)}px; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }
      .end .sub { font-size: ${px(0.040)}px; color: #9A9AA0; line-height: 1.5; }
      .end .site { margin-top: ${px(0.014)}px; padding: ${px(0.016)}px ${px(0.048)}px; border-radius: 999px;
                   background: #7C4DA8; font-size: ${px(0.038)}px; font-weight: 600; }
      /* 合规标注:变身段是效果演示,不标注等于让人以为这是拍出来的成品 */
      .mark { position: absolute; left: 0; right: 0; bottom: ${px(0.035)}px; text-align: center;
              font-size: ${px(0.026)}px; color: #6E6E73; letter-spacing: 0.04em; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${T.end}"
         data-width="${W}" data-height="${H}">

      <div id="base" class="clip shot" data-start="0" data-duration="${(T.morph + 0.35).toFixed(2)}" data-track-index="0">
        <img src="assets/start.png" alt="" />
      </div>
      <div id="hook" class="clip scene hook" data-start="0" data-duration="${(T.morph + 0.35).toFixed(2)}" data-track-index="1">
        <div class="hk1" id="hk1">同一支料体,同一条产线</div>
        <div class="hk2" id="hk2">卖相的差距<br />从来不在料里</div>
        <div class="hk3" id="hk3">十五秒看完四步</div>
      </div>

${stepEls}

      <div id="fin" class="clip shot" data-start="${t2.toFixed(2)}" data-duration="${(T.end - t2).toFixed(2)}" data-track-index="11">
        <img src="assets/4-light.png" alt="" />
      </div>
      <div id="endc" class="clip scene end" data-start="${t2.toFixed(2)}" data-duration="${(T.end - t2).toFixed(2)}" data-track-index="12">
        <div class="big" id="ebig">还是那支料体</div>
        <div class="sub" id="esub">4,476 款现货包材 · 报编码就能对上款</div>
        <div class="site" id="esite">biosphere-ai.com</div>
      </div>
      <div id="mark" class="clip mark" data-start="${T.morph.toFixed(2)}" data-duration="${(T.end - T.morph).toFixed(2)}" data-track-index="13">
        画面为 AI 生成的设计效果演示,非成品实拍
      </div>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      /* 一条 paused 时间线。HyperFrames 按帧 seek,任何自走的动画都会渲出不确定的帧。 */
      const tl = gsap.timeline({ paused: true });

      tl.from("#base img", { scale: 1.05, opacity: 0, duration: 0.8, ease: "power2.out" }, 0);
      tl.from("#hk1", { y: 22, opacity: 0, duration: 0.3, ease: "power3.out" }, 0.15);
      tl.from("#hk2", { y: 38, opacity: 0, duration: 0.42, ease: "power3.out" }, 0.32);
      tl.from("#hk3", { y: 16, opacity: 0, duration: 0.3, ease: "power3.out" }, 0.75);
      tl.to("#hook", { opacity: 0, duration: 0.3, ease: "power2.in" }, ${T.morph - 0.15});
      tl.to("#base", { opacity: 0, duration: 0.3, ease: "power2.in" }, ${T.morph - 0.1});

${tl}

      tl.from("#fin img", { opacity: 0, duration: 0.4, ease: "power2.out" }, ${t2.toFixed(2)});
      tl.to("#fin img", { scale: 1.04, duration: ${(T.end - t2).toFixed(2)}, ease: "none" }, ${t2.toFixed(2)});
      tl.from("#ebig", { y: 28, opacity: 0, duration: 0.36, ease: "power3.out" }, ${(t2 + 0.2).toFixed(2)});
      tl.from("#esub", { y: 18, opacity: 0, duration: 0.32, ease: "power3.out" }, ${(t2 + 0.38).toFixed(2)});
      tl.from("#esite", { scale: 0.88, opacity: 0, duration: 0.32, ease: "back.out(2)" }, ${(t2 + 0.56).toFixed(2)});
      tl.from("#mark", { opacity: 0, duration: 0.5 }, ${T.morph.toFixed(2)});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

mkdirSync(join(OUT, 'assets'), { recursive: true });
if (!existsSync(START)) { console.log(`起点图不在:${START}`); process.exit(1); }
copyFileSync(START, join(OUT, 'assets', 'start.png'));
for (const s of STEPS) {
  const src = join(FRAMES, s.f);
  if (!existsSync(src)) { console.log(`缺帧:${src} —— 先跑 tools/pack-morph.mjs`); process.exit(1); }
  copyFileSync(src, join(OUT, 'assets', s.f));
}
writeFileSync(join(OUT, 'index.html'), html());
writeFileSync(join(OUT, 'hyperframes.json'), JSON.stringify({
  $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
}, null, 2) + '\n');
console.log(`  ✓ ${W}×${H} · ${T.end}s · ${STEPS.length} 步 → ${OUT}`);

if (!args.render) { console.log('\n加 --render 才渲染。'); process.exit(0); }
try {
  execFileSync(process.execPath, [HF, 'render'], {
    cwd: OUT, stdio: 'inherit',
    env: { ...process.env, PATH: `${join(HF_HOME, 'bin')};${process.env.PATH}` },
  });
} catch (e) {
  console.log(`  × 渲染失败:${String(e).slice(0, 200)}`);
  process.exitCode = 1;
}
