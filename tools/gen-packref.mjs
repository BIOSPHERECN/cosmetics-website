/**
 * 包装风格参考库 —— 给 /[lang]/pack(AI 包装设计)用。
 *
 * 为什么不在网站里实时出图(2026-09-02 实测结论):
 *   Agnes 的 /images/generations 前面挂着边缘限流,而 Cloudflare Worker 的出口 IP
 *   是共享的 —— 同一秒本机直连成功、经 Worker 必 429(error code 1015)。
 *   同一家的对话接口从 Worker 调却正常,所以这是对方对"贵接口"的策略,不是我们的 bug,
 *   也不是我们能靠改代码绕过去的(创始人:「我咋有资格和 Agnes 说放行」)。
 *
 * 于是改成本地预生成 + 线上实时匹配:
 *   · 本地跑(本机 IP 不被拦,仓库里 gen-pkg-images.mjs 一直是这么出图的);
 *   · 一次生成一套风格库,存 R2、进媒体库;
 *   · 网站读懂客户的瓶子后,从库里挑最贴的两版展示 —— 秒出、必出、质量可控。
 *
 * 用法:node tools/gen-packref.mjs [--force]
 */
import { existsSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const FORCE = process.argv.includes('--force');
const OUT_DIR = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/packref';
mkdirSync(OUT_DIR, { recursive: true });

const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

/* 统一底座:让 12 张出自同一影棚,客户比较的是"结构与工艺"的差别,
   不是"这张打光好看"的差别 —— 变量只留风格本身。 */
const STYLE =
  'premium cosmetic packaging product photography, an outer carton box standing beside its bottle, '
  + 'no text, no logo, no watermark, soft even studio lighting, seamless neutral background, '
  + 'sharp focus, photorealistic, square composition';

/** 12 个方向 —— 覆盖美妆代工最常被问到的外盒路线 */
const STYLES = [
  { key: 'minimal-white',   label: '极简白盒 + 烫金',   p: 'matte white folding carton with subtle gold foil hairline border, ultra minimal' },
  { key: 'kraft-eco',       label: '牛皮纸环保盒',       p: 'uncoated brown kraft paper carton, visible fibre texture, eco natural look' },
  { key: 'soft-touch-black',label: '磨砂黑 + 局部 UV',   p: 'soft-touch matte black carton with glossy spot-UV pattern catching the light' },
  { key: 'herbal-green',    label: '草本绿 + 压纹',      p: 'sage green carton with deboss embossed botanical pattern, tactile paper' },
  { key: 'window-box',      label: '开窗盒',             p: 'carton with a die-cut transparent window revealing the bottle inside' },
  { key: 'rigid-drawer',    label: '抽屉式硬盒',         p: 'rigid drawer-style gift box, thick board, ribbon pull, luxury feel' },
  { key: 'paper-tube',      label: '圆筒纸罐',           p: 'cylindrical paper tube container with metal lid, minimal wrap' },
  { key: 'tube-hangcard',   label: '软管挂卡',           p: 'squeeze tube with printed hanging card backing board, retail peg ready' },
  { key: 'tin-can',         label: '马口铁罐',           p: 'printed tinplate round can with lid, subtle metallic sheen' },
  { key: 'pearl-emboss',    label: '珠光纸 + 浮雕',      p: 'pearlescent shimmer paper carton with raised embossed crest' },
  { key: 'bold-mono',       label: '单色极简大字',       p: 'single flat colour carton with very large clean typographic block, bold modern' },
  { key: 'illustrated',     label: '插画风草本',         p: 'carton covered in delicate hand-drawn botanical illustration, editorial feel' },
];

async function gen(prompt, dst) {
  const r = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  const d = (await r.json()).data?.[0];
  const buf = d?.b64_json
    ? Buffer.from(d.b64_json, 'base64')
    : Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
  await sharp(buf).resize(1024, 1024, { fit: 'cover' }).webp({ quality: 82 }).toFile(dst);
  return statSync(dst).size;
}

const done = [];
for (const s of STYLES) {
  const dst = `${OUT_DIR}/${s.key}.webp`;
  if (existsSync(dst) && !FORCE) { console.log(`  跳过(已有) ${s.key}`); done.push(s); continue; }
  try {
    const n = await gen(`${s.p}. ${STYLE}`, dst);
    console.log(`  出图 ${s.key} ${(n / 1024).toFixed(0)}KB`);
    done.push(s);
  } catch (e) {
    console.log(`  失败 ${s.key}: ${String(e.message).slice(0, 90)}`);
  }
  /* 串行 + 间隔:Agnes 出图接口限流严,连发必 429 */
  await new Promise((r) => setTimeout(r, 6000));
}
console.log(`\n完成 ${done.length}/${STYLES.length} 张,文件在 ${OUT_DIR}`);
console.log('下一步:node tools/packref-publish.mjs  (传 R2 + 入媒体库)');
