import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, type Ctx } from '../../../lib/guard';
import { vision, image as genImage, loadFleet } from '../../../lib/fleet';
import { parseJson } from '../../../lib/formula-lab';
import { putMedia, type StorageEnv } from '../../../lib/storage';

export const prerender = false;

/* 效果图提示词(2026-09-17 创始人:「后台要有个图片转提示词」「工具都很强大,提示词不行,AI图就很惨」「提示词方面一定要优化」)。
   op 式单 POST,照 formula-lab.ts 的骨架(apiGuard → switch → try/catch);不套 requireLab —— 设计(editor)没有 lab_role,
   看得见页面就得能用。roleAllows 已放行 admin / editor;lab 账号要用得在 guard.ts 给 cap 'prompts' 开口(不在本任务文件范围)。 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  try {
    switch (b.op) {
      case 'reverse': return await opReverse(c, b);     // 图 → 提示词(fleet.vision)
      case 'save':    return await opSave(c, b);     // 反推结果存入库
      case 'render':  return await opRender(c, b);   // 提示词 + 产品描述 → fleet.image 一张 → media
      case 'list':    return await opList(c, b);     // 按类目取库
      default:        return json({ ok: false, msg: '未知操作' }, 400);
    }
  } catch (e) {
    return json({ ok: false, msg: `失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};

const str = (v: unknown, max = 2000): string => String(v ?? '').trim().slice(0, max);
const CATS = ['dropper-bottle', 'jar', 'tube', 'pump-bottle', 'gift-set', 'lifestyle'];   // 与 0084 迁移 / packaging.type 对齐
const MAX_BYTES = 4 * 1024 * 1024;

/* 与 tools/render/_look.py 同一份提示 —— 72 条库存就是这套字段反推出来的,后台反推必须同口径,否则库里两种格式。
   「GitHub和很多网站都有反向推理是什么提示词的」:要的就是这种六要素 + 可直接喂 Flux/Midjourney 的英文。 */
const REVERSE_PROMPT = `You are a senior commercial product photographer and Midjourney/Flux prompt engineer.
Look at this cosmetic product render (bottle / jar / tube in a scene). Reverse-engineer it.
Return ONLY a JSON object with these keys (no markdown fence):
{
 "scene": "背景/环境,中文,一句",
 "lighting": "光位与光质,中文,一句(主光方向、硬软、轮廓光、反光板)",
 "camera": "机位/焦段/景深/视角,中文,一句",
 "props": "道具与材质,中文,逗号分隔",
 "palette": "主色与配色,中文,逗号分隔",
 "mood": "情绪与风格关键词,中文,逗号分隔",
 "prompt_en": "60-110 words. Midjourney/Flux style commercial product photography prompt. Cover: subject + material/finish, lighting, background/environment, composition, lens/camera, post-processing. Do NOT mention any brand name or label text; say 'blank label' if needed.",
 "prompt_zh": "prompt_en 的中文对照"
}`;

async function opReverse(c: Ctx, b: any) {
  const img = typeof b.image === 'string' ? b.image : '';
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(img);
  if (!m) return json({ ok: false, msg: '图片要是 jpg / png / webp 的 base64 data URL' }, 400);
  if (Math.floor(m[2].length * 3 / 4) > MAX_BYTES) return json({ ok: false, msg: '图片超过 4MB,请先压小' }, 413);
  const pool = (await loadFleet(c.db, env as any)).filter((p) => p.vision);
  if (!pool.length) return json({ ok: false, msg: '没有可用的视觉模型,请到「模型舰队」给能读图的行填 key' }, 503);
  // 推理模型留一倍余量(fleet.ts MIN_TOKENS 的教训);json:true 让 vision 走 JSON 口径
  const r = await vision(env as any, img, REVERSE_PROMPT, { json: true, maxTokens: 2500, fleet: pool });
  const out = parseJson(r.text);
  if (!out?.prompt_en) return json({ ok: false, msg: `模型没吐出 prompt_en(${r.provider}),换张更清楚的产品图再试` }, 200);
  const pick = (k: string) => str(out[k], 1500);
  return json({ ok: true, provider: r.provider, model: r.model, ms: r.ms,
    scene: pick('scene'), lighting: pick('lighting'), camera: pick('camera'), props: pick('props'), palette: pick('palette'), mood: pick('mood'),
    prompt_en: pick('prompt_en'), prompt_zh: pick('prompt_zh') });
}

async function opSave(c: Ctx, b: any) {
  const prompt_en = str(b.prompt_en, 3000);
  if (!prompt_en) return json({ ok: false, msg: 'prompt_en 为空,没东西可存' }, 400);
  const category = CATS.includes(b.category) ? b.category : 'lifestyle';
  const r = await c.db.prepare(
    `INSERT INTO render_prompts (category,scene,prompt_en,prompt_zh,lighting,camera,props,palette,mood,src,sample_img) VALUES (?,?,?,?,?,?,?,?,?,'reverse',?) RETURNING id`,
  ).bind(category, str(b.scene), prompt_en, str(b.prompt_zh, 3000), str(b.lighting), str(b.camera), str(b.props), str(b.palette), str(b.mood), str(b.sample_img, 200) || null)
    .first<{ id: number }>();
  return json({ ok: true, id: r?.id });
}

async function opList(c: Ctx, b: any) {
  const cat = CATS.includes(b.category) ? b.category : '';
  const { results } = await c.db.prepare(
    `SELECT id,category,scene,prompt_en,prompt_zh,lighting,camera,props,palette,mood,src,sample_img,score FROM render_prompts WHERE (?='' OR category=?) ORDER BY id LIMIT 300`,
  ).bind(cat, cat).all();
  return json({ ok: true, list: results ?? [] });
}

/* 「批量生产AI更好的效果图,才可以交付」:库里的 prompt_en 已含光位/机位/道具/后期,用户只补产品四要素。
   产品句放最前(生图模型按前后权重),再接库里的场景句;库句里原本的主体描述保留 —— 实测换主体比整句重写稳。 */
async function opRender(c: Ctx, b: any) {
  let prompt_en = str(b.prompt_en, 3000);
  if (!prompt_en && b.id) {
    const row = await c.db.prepare(`SELECT prompt_en FROM render_prompts WHERE id=?`).bind(Number(b.id)).first<{ prompt_en: string }>();
    prompt_en = row?.prompt_en ?? '';
  }
  if (!prompt_en) return json({ ok: false, msg: '缺少提示词' }, 400);
  const product = str(b.product, 120), material = str(b.material, 80), color = str(b.color, 60), cap = str(b.cap, 60);
  if (!product) return json({ ok: false, msg: '先填产品(如 30ml airless pump bottle)' }, 400);
  const subject = `Product: ${[color, material, product].filter(Boolean).join(' ')}${cap ? ` with ${cap} cap` : ''}, blank label, no text. `;
  const prompt = (subject + prompt_en.replace(/\{product\}/g, product).replace(/\{material\}/g, material).replace(/\{color\}/g, color).replace(/\{cap\}/g, cap)).slice(0, 3500);

  const fleet = await loadFleet(c.db, env as any);
  const urls = await genImage(env as any, prompt, fleet);      // n=1 一次一张(fleet.ts 里写死,Agnes n>1 直接 400)
  if (!urls.length) return json({ ok: false, msg: '出图接口没返回图片' }, 502);
  // 存 R2 走 news-art.ts 同一套:拉 URL → putMedia → media 一行 → 前台用 /media/{id} 签名代理
  const buf = await (await fetch(urls[0], { signal: AbortSignal.timeout(60_000) })).arrayBuffer();
  const stored = await putMedia(env as unknown as StorageEnv, { body: buf, mime: 'image/png' });
  const m = await c.db.prepare(
    `INSERT INTO media (r2_key, filename, mime, bytes, folder, alt_zh, uploaded_by, driver, url) VALUES (?,?,?,?,?,?,?,'r2',NULL) RETURNING id`,
  ).bind(stored.key, stored.key.split('/').pop(), 'image/png', buf.byteLength, '效果图', `${product} · AI 效果图`, c.sess.uid).first<{ id: number }>();
  return json({ ok: true, url: `/media/${m?.id}`, media_id: m?.id, prompt });
}
