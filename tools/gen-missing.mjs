/**
 * 补齐内容缺口的配图。
 *
 * 创始人的判据很明确:**图片不匹配就是不合格交付**。
 * 前面几格里有一批版块只有文字条目没有图(专利认证、客户品牌、企业慈善、
 * 参展、研发设备、IP 合作),还有几处用的是通用图 —— 采购一眼能看出是凑的。
 *
 * ── 为什么用 AI 生成而不是去抓图 ────────────────────────────
 * 创始人说过"图片先用别人的没问题、老板满意后再换"。
 * 但抓图有个抓不掉的毛病:**抓到的图和文案对不上**。
 * 搜"证书墙"会得到别家公司的证书、搜"展会"会得到别的行业的展台 ——
 * 而这正是他要解决的问题本身。
 * 生成能精确对上内容,而且没有版权尾巴,老板满意后换成实拍也更省事
 * (构图已经定了,照着拍就行)。
 *
 * ── 提示词按刚测到的工业风来写 ──────────────────────────────
 * 参考站(Hadrian #002548、Formlabs #3B3A38)的共同语言:
 * 深色但不纯黑、单一高饱和强调色、真实工业摄影而不是图库摆拍。
 * 所以每条提示词都带 "documentary industrial photography, no people posing,
 * muted palette" —— 避开图库那种笑脸握手的塑料感。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { d1 } from './d1.mjs';

const OUT_DIR = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/factory';
mkdirSync(OUT_DIR, { recursive: true });
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** 共同风格后缀 —— 让新图和站上已有的 23 张 AI 图看起来是一批 */
const STYLE = 'documentary industrial photography, natural light, muted desaturated palette, '
  + 'sharp focus, no text overlay, no logos, no posed smiling people, realistic, 3:2';

const WANT = [
  { id: 'certs-wall-01', zh: '认证证书墙:装裱的国际认证证书成排陈列',
    p: `A wall of framed certification documents in a modern cosmetics factory reception, rows of identical dark frames, clean white wall, ${STYLE}` },
  { id: 'certs-detail-01', zh: '认证证书特写:装裱证书与钢印',
    p: `Close-up of a framed quality certification document on a desk, embossed seal visible, shallow depth of field, ${STYLE}` },
  { id: 'brandwall-01', zh: '合作品牌墙:客户品牌产品陈列架',
    p: `A retail-style display shelf in a factory showroom filled with unbranded cosmetic bottles and jars in varied shapes, evenly lit, ${STYLE}` },
  { id: 'expo-booth-02', zh: '展会展台:美妆展会现场展位',
    p: `A modern minimal trade show booth for a cosmetics manufacturer, clean white and green structure, product display plinths, wide shot of exhibition hall, ${STYLE}` },
  { id: 'expo-meeting-01', zh: '展会洽谈:展台内的商务会谈',
    p: `Two people in business attire discussing over a tablet at a trade show booth counter, seen from behind, cosmetics samples on the counter, ${STYLE}` },
  { id: 'lab-equip-01', zh: '研发设备:高效液相色谱与分析仪器',
    p: `Laboratory analytical instruments on a stainless bench, chromatography system, digital readouts, cool white lab lighting, ${STYLE}` },
  { id: 'lab-equip-02', zh: '研发设备:实验室乳化与均质设备',
    p: `A benchtop homogenizer and small stainless emulsifying vessel in a cosmetics R&D lab, beakers with white cream, ${STYLE}` },
  { id: 'lab-stability-01', zh: '稳定性考察:恒温恒湿试验箱内的样品',
    p: `Rows of labelled sample jars inside a climate stability test chamber, glass door, digital temperature display, ${STYLE}` },
  { id: 'csr-01', zh: '企业慈善:向山区学校捐赠物资',
    p: `Cardboard supply boxes being unloaded outside a rural school building in mountainous China, volunteers in plain shirts, documentary style, ${STYLE}` },
  { id: 'csr-02', zh: '企业慈善:种植基地的农户合作',
    p: `Farmers harvesting herbs on a terraced mountain field, baskets of fresh green herbs, early morning light, ${STYLE}` },
  { id: 'ip-display-01', zh: '合作 IP:授权联名产品陈列',
    p: `A showcase of children oriented cosmetic packaging in bright colors on a white display table, generic cartoon-free designs, ${STYLE}` },
  { id: 'video-still-01', zh: '公司视频封面:厂区航拍视角',
    p: `Aerial view of a modern industrial manufacturing campus with white buildings and green landscaping, overcast sky, ${STYLE}` },
];

const agnes = d1(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)[0];
if (!agnes) { console.error('库里没有 agnes 供应商'); process.exit(1); }
const KEY = String(agnes.api_keys).split(',')[0].trim();
const BASE = String(agnes.base_url).replace(/\/+$/, '');

async function gen(p) {
  const r = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: p, n: 1, size: '1536x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  const d = j.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
  if (d?.url) {
    const img = await fetch(d.url, { signal: AbortSignal.timeout(120000) });
    if (!img.ok) throw new Error(`取图失败 HTTP ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('返回里既没有 b64 也没有 url');
}

/* 转 webp 再入库 —— 生成的是 PNG,一张 1.5–2MB,直接上站会拖慢首屏。
   sharp 在 pnpm store 里,按路径引 */
const sharp = (await import('../node_modules/.pnpm/sharp@0.35.3_@types+node@24.13.3/node_modules/sharp/dist/index.mjs')).default;

const sql = [];
let ok = 0, bad = 0;
for (const w of WANT) {
  const dst = `${OUT_DIR}/${w.id}.webp`;
  if (existsSync(dst)) { console.log(`  跳过(已有) ${w.id}`); continue; }
  try {
    const buf = await gen(w.p);
    await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dst);
    const bytes = (await import('node:fs')).statSync(dst).size;
    sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
      VALUES (${lit('static/factory/' + w.id + '.webp')},${lit(w.id + '.webp')},'image/webp',${bytes},
              '工厂实力',${lit(w.zh)},'url',${lit('/media/factory/' + w.id + '.webp')},'AI 生成 · agnes-image-2.1-flash')
      ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, alt_zh=excluded.alt_zh;`);
    console.log(`  ✓ ${w.id.padEnd(20)} ${(bytes / 1024).toFixed(0)}KB  ${w.zh}`);
    ok++;
  } catch (e) {
    console.log(`  ★ ${w.id.padEnd(20)} ${String(e.message).slice(0, 80)}`);
    bad++;
  }
}

if (sql.length) {
  const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/genimg.sql';
  writeFileSync(OUT, sql.join('\n'), 'utf8');
  d1(OUT, { file: true });
}
console.log(`\n生成 ${ok} 张,失败 ${bad} 张`);
if (ok) {
  const rows = d1(`SELECT id, filename FROM media WHERE folder='工厂实力' AND creator LIKE '%agnes%' ORDER BY id DESC LIMIT ${ok}`);
  rows.forEach((r) => console.log(`  /media/${r.id}  ${r.filename}`));
}
