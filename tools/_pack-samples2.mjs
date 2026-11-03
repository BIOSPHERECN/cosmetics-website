// 第二轮样图:① 参考站包材站那种「白底图」(反推提示词) ② reference AI 画廊那种「场景图」。Agnes 文生图,免费。
import { writeFileSync, mkdirSync } from 'node:fs';
import { d1 } from './d1.mjs';
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/pack-samples2';
mkdirSync(OUT, { recursive: true });
const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');

/* 白底图:从 rhinobirdbeauty.com/package 的商品图反推 —— 平光、纯浅灰底、无渐变无道具、正视微俯、白标「Your Brand Here」、极淡接触阴影、留白多 */
const WHITE = (item) => `E-commerce catalog product photo of a single ${item}, front view at eye level with a very slight top-down angle, perfectly centered, `
  + `isolated on a seamless flat very light gray background (#F4F4F4) with no gradient and no horizon line, `
  + `the bottle wears a plain white minimal label with small gray placeholder text "Your Brand Here" and one tiny line of text below it, `
  + `soft even diffuse studio light, matte clean surfaces, only a faint soft contact shadow under the base, no props, no reflections, `
  + `photorealistic 3D product render, product fills about 75% of the frame height, square 1:1, no hands, no people`;

/* 场景图:reference 画廊的路子 —— 一个概念一个道具组(成分 / 材质 / 季节),真实材质,浅景深,高端广告 */
const SCENE = (s) => `${s}, commercial skincare advertising photography, photorealistic materials, shallow depth of field, soft natural key light, `
  + `refined minimal label typography on the bottle, rich but natural color, square 1:1, no hands, no people`;

const SHOTS = [
  { f: 'w1-dropper', p: WHITE('30ml frosted white glass serum dropper bottle with white dropper cap and slim silver collar') },
  { f: 'w2-pump-foam', p: WHITE('150ml white PET foaming pump bottle with a white foam pump head') },
  { f: 'w3-cream-jar', p: WHITE('50g white frosted glass cream jar with a flat matte white screw lid') },
  { f: 's1-orange-vc', p: SCENE('A coral-orange frosted glass serum bottle with a white pump standing beside fresh cut orange halves and a small green sprig on a bright white marble tabletop, morning window light, fresh vitamin-C energy mood') },
  { f: 's2-oak-amber', p: SCENE('A tall amber glass dropper bottle resting on a raw oak wood block with a few dry moss pieces and one oak leaf, deep forest-green backdrop, warm side light, quiet woody premium mood') },
];
for (const s of SHOTS) {
  const t = Date.now();
  const r = await fetch(`${BASE}/images/generations`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: s.p, n: 1, size: '1024x1024' }), signal: AbortSignal.timeout(180000) });
  if (!r.ok) { console.log(s.f, 'HTTP', r.status, (await r.text()).slice(0, 200)); continue; }
  const d = (await r.json()).data?.[0];
  const buf = d?.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
  const ext = buf[0] === 0x89 ? 'png' : buf[0] === 0xff ? 'jpg' : 'webp';
  writeFileSync(`${OUT}/${s.f}.${ext}`, buf);
  console.log(s.f, `${(buf.length / 1024).toFixed(0)} KB`, `${((Date.now() - t) / 1000).toFixed(0)}s`);
}
