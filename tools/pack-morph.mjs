/**
 * 白瓶 → 高端设计:四步变身,逐帧推进。
 *
 * 分镜(STORYBOARD.md 第二节)要求「每步只加一个元素,不要一步到位」——
 * 观众要看到**过程**,不是看到结果。所以这里是一条链:
 * 每一步都拿上一步的产出当输入,而不是各自从白瓶重画一张。
 * 各自重画的话四张之间会互不连贯,剪起来就是四个不同的瓶子。
 *
 * 前提(2026-09-08 实测):
 *   · 源图必须是**单支**。库里很多实拍是「五支不同容量排一排」的规格图,
 *     整张喂进去模型会挑一支重画,谈不上保轮廓。先裁单支再进来。
 *   · 提示词必须写死 NO text / NO logo,否则模型会自己编一个假商标
 *     (第一次实测出了「OIC INOVE」)。
 *   · flux-2/edit 一次 3 积分。四步一条链 12 积分。
 *
 * 用法:node tools/pack-morph.mjs --src .video/ST-A1044-one.png --out .video/morph
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), String(arr[i + 1] ?? '').startsWith('--') ? true : arr[i + 1] ?? true]);
  return a;
}, []));
const VIDMUSE = process.env.VIDMUSE_BIN
  ?? (process.platform === 'win32' ? 'C:/Program Files/Git/mingw64/bin/vidmuse.exe' : 'vidmuse');
const SRC = args.src ?? '.video/ST-A1044-one.png';
const OUT = args.out ?? '.video/morph';

/* 共用的约束尾巴 —— 每一步都要带,少一句就会跑偏 */
const KEEP = 'Keep the exact same bottle silhouette, proportions, pump head shape, camera angle, '
  + 'framing and size in frame as the input image. Absolutely NO text, NO logo, NO lettering, NO branding anywhere. '
  + 'Photorealistic studio product photography.';

const STEPS = [
  { id: '1-material',  zh: '材质', p: `Change ONLY the body finish to frosted matte glass with a soft tactile surface. Keep the cap and collar as they are. Pure white background. ${KEEP}` },
  { id: '2-structure', zh: '结构', p: `Now add a slim brushed metal trim ring at the shoulder and another at the base. Keep the frosted glass body from the input. Pure white background. ${KEEP}` },
  { id: '3-colour',    zh: '色彩', p: `Now change the frosted body colour to a deep desaturated forest green, keeping the frosted texture and the metal trims. Pure white background. ${KEEP}` },
  { id: '4-light',     zh: '光影', p: `Now light it as a premium hero shot: soft side-rim light, visible glass refraction on the edges, gentle reflection on the surface below, deep neutral gradient background instead of pure white. ${KEEP}` },
];

function run(model, prompt, imgPath) {
  const param = JSON.stringify({ model_name: model, generation_type: 'image_to_image', prompt, image_urls: [imgPath] });
  /* 不能走 shell:Windows 上 shell 会按空格和引号把 JSON 拆散,
     CLI 收到的是半截字符串,报 `--param must be a JSON object`。
     直接给 .exe 的绝对路径,参数原样传过去。 */
  const out = execFileSync(VIDMUSE, ['model', 'run', '--param', param],
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const url = (out.match(/https:\/\/\S+\.(?:png|jpg|jpeg|webp)/) || [])[0];
  if (!url) throw new Error(`没拿到图片地址:${out.slice(-300)}`);
  return url;
}

function credits() {
  try {
    const j = JSON.parse(execFileSync(VIDMUSE, ['plan', 'get', '--output', 'json'],
      { encoding: 'utf8' }));
    return j.credits;
  } catch { return '?'; }
}

mkdirSync(OUT, { recursive: true });
if (!existsSync(SRC)) { console.log(`源图不在:${SRC}`); process.exit(1); }

console.log(`起点 ${SRC} · 当前积分 ${credits()}`);
let cur = SRC;
for (const s of STEPS) {
  process.stdout.write(`  ${s.id} (${s.zh}) … `);
  let url;
  try { url = run('fal-ai/flux-2/edit', s.p, cur); }
  catch (e) { console.log(`失败:${String(e).slice(0, 160)}`); process.exitCode = 1; break; }
  const dst = join(OUT, `${s.id}.png`);
  const buf = execFileSync('curl', ['-s', '-L', url], { encoding: 'buffer', maxBuffer: 1 << 26 });
  writeFileSync(dst, buf);
  console.log(`${(buf.length / 1024).toFixed(0)} KB → ${dst}`);
  cur = dst;   // 链式:下一步吃上一步的产出
}
console.log(`剩余积分 ${credits()}`);
