import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, paidFirst, image } from '../../../lib/fleet';
import { overQuota, recordUse, tooMany, clientId } from '../../../lib/ratelimit';
import { aiDailyCheck, aiBudgetResponse } from '../../../lib/fuse';

export const prerender = false;

/**
 * AI 电商套图（2026-10-28）—— 对标同类工具的「一张产品图 → 多场景套图」。
 *
 * 诚实边界：我们的出图模型（agnes / sensenova）是**文生图**，不吃上传图。
 * 所以这里做的是「产品描述 → 4 张电商场景图」，不是产品图换背景。
 * 等接入 img2img 模型后再支持真·上传图换场景，接口形状保持不变（多传一个 image）。
 *
 * 成本纪律：一次请求 = 4 次文生图，是最贵的一档 → ai.ecom-set 限 4 次/小时/IP；
 * 串行出图 + 1.2s 间隔，避开 Agnes 的 429/1015。
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const who = clientId(request);
  if (await overQuota(db, 'ai.ecom-set', who)) return tooMany('ai.ecom-set');

  let body: any = {};
  try { body = await request.json(); } catch { return json({ ok: false, msg: 'bad json' }, 400); }

  const product = String(body.product ?? '').trim().slice(0, 100);
  const category = String(body.category ?? '').trim().slice(0, 60);
  const market = String(body.market ?? '').trim().slice(0, 60);
  if (product.length < 2) return json({ ok: false, msg: '请填写产品名称或描述（至少 2 个字）' }, 400);

  /* 全站日预算:一次请求打 4 张图,按 4 计。放在参数校验之后、出图之前 ——
     校验失败的请求不烧模型,不该占预算。 */
  if (!(await aiDailyCheck({ db, cap: (env as any).AI_DAILY_CAP, cost: 4 })).ok) return aiBudgetResponse();

  await recordUse(db, 'ai.ecom-set', who);

  let fleet = paidFirst(await loadFleet(db, env)).filter((p: any) => p.image && p.keys?.length);
  /* 前端模型卡片选了具体模型时只用它（2026-10-30） */
  const wanted = String(body.model ?? '').trim();
  if (wanted) {
    const one = fleet.find((p: any) => p.id === wanted);
    if (one) fleet = [one];
  }
  if (!fleet.length) return json({ ok: false, msg: '出图模型暂不可用' }, 503);

  const subject = [product, category && `(${category})`, market && `for ${market} market`].filter(Boolean).join(' ');
  /* 4 个电商常见场景：白底主图 / 生活场景 / 成分/功效特写 / 礼盒陈列。
     每个 prompt 都强调「no text, no logo」—— 避免模型生成乱码文字。 */
  const scenes = [
    { key: 'main',   label: '白底主图',   p: `Professional e-commerce product photo of ${subject}, pure white seamless background, soft studio lighting, centered, high detail, no text, no logo, no watermark` },
    { key: 'life',   label: '生活场景',   p: `Lifestyle product photo of ${subject} on a clean bathroom counter with natural morning light, soft shadows, minimal props, realistic, no text, no logo` },
    { key: 'detail', label: '功效特写',   p: `Macro close-up product shot of ${subject}, texture and ingredients visible, soft directional light, premium cosmetics advertising style, no text, no logo` },
    { key: 'gift',   label: '礼盒陈列',   p: `Premium gift set presentation of ${subject}, elegant neutral packaging display, subtle gold accents, studio lighting, luxury cosmetics brand aesthetic, no text, no logo` },
  ];

  const images: { key: string; label: string; url: string }[] = [];
  const fails: string[] = [];
  for (const s of scenes) {
    try {
      const urls = await image(env as any, s.p, fleet as any, {} as any);
      if (urls[0]) images.push({ key: s.key, label: s.label, url: urls[0] });
      else fails.push(`${s.key}:empty`);
    } catch (e: any) {
      fails.push(`${s.key}:${String(e?.message ?? e).slice(0, 80)}`);
    }
    await sleep(1200);
  }

  await db?.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('ecom-set',?,?,datetime('now'),datetime('now'))`)
    .bind(`product=${product.slice(0, 40)} ok=${images.length} fail=${fails.length}`, images.length ? 'ok' : 'fail')
    .run().catch(() => {});

  if (!images.length) return json({ ok: false, msg: '出图失败，请稍后重试', fails }, 502);
  return json({ ok: true, images, fails, note: '图片链接为模型临时地址（约 24 小时有效），需要长期使用请下载保存。' });
};
