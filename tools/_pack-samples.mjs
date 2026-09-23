// 3 张「参考站风格」包材样图,走 Agnes 文生图(免费,不用 vidmuse 登录)。输出到 scratchpad/pack-samples/
import { writeFileSync, mkdirSync } from 'node:fs';
import { d1 } from './d1.mjs';
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/claude/F--0cosmetic/9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8/scratchpad/pack-samples';
mkdirSync(OUT, { recursive: true });
const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');
const STYLE = 'premium studio packaging render in the style of a high-end cosmetics manufacturer catalog, single product centered, '
  + 'soft warm beige-to-cream gradient backdrop, soft diffused key light with gentle rim light, subtle floor reflection, '
  + 'photorealistic materials, unbranded: absolutely NO text, NO logo, NO lettering, square 1:1, no hands, no people';
const SHOTS = [
  { f: '1-airless-pump', p: `A 50ml frosted white glass airless pump bottle with a matte champagne-gold collar and smooth white cap, ${STYLE}` },
  { f: '2-cream-jar', p: `A 50g thick-walled frosted glass cream jar with a brushed silver metal lid, ${STYLE}` },
  { f: '3-dropper', p: `A 30ml amber glass serum dropper bottle with a matte black dropper cap, ${STYLE}` },
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
