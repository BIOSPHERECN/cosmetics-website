/**
 * 规格表读图 —— 把包材规格图上的尺寸、口径、容量读成结构化字段。
 *
 * 为什么必须做这一步:采购没法拿「250ml 膏霜罐」下单,要的是
 * 尺寸 91×81×65mm、裸瓶高 63、口径 68mm(配 A1782 内塞)。
 * 这些数字只印在规格图里,不在页面文字里 —— 不读出来,包材库就永远停在
 * 「看着还行」的层面,进不了「能对模具」的层面。
 *
 * 为什么放在 Worker 而不是本地脚本:模型 key 在 D1 的 providers 表里,
 * 本地脚本要用就得把 key 落到本地环境,那是我们一直避免的。
 * 走这个接口,key 不出云端,本地只负责传图与收结果。
 *
 * 鉴权用 x-cron-key 而不是后台会话:这是给批处理脚本用的,脚本没有浏览器会话。
 * 与 /api/cron/* 同一把钥匙,工人手里也只有这一把,拿不到 D1 里的模型 key。
 *
 * 纪律:读不出来就留空,绝不猜。一个猜出来的口径会让客户按错的泵头开模。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, vision } from '../../../lib/fleet';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const PROMPT = `这是一张化妆品包材的规格表图。把上面的参数读成 JSON,只返回 JSON,不要任何解释。

字段:
{
 "item_no": "货号 / ITEM NO. 那一行的值,如 A3650",
 "size_mm": "尺寸那一行的三个数,原样写成 91×81×65;只有两个数就写两个",
 "bare_height_mm": "裸瓶高(不含盖)的数字,如 63;没写就留空",
 "caliber": "口径 / CALIBER 的值,如 68mm;括号里配套件也带上,如 68mm(配A1782内塞)",
 "capacity": "参考容量 / CAPACITY 的值,如 250ml",
 "note": "括号里的补充说明,如「瓶身侧面带有指槽」;没有就留空"
}

铁律:
· 看不清或图上没有的字段一律留空字符串,**绝对不要猜、不要推算、不要补全**。
  一个猜出来的口径会让客户按错的泵头开模。
· 数字原样抄,不做单位换算,不四舍五入。
· 只读表格里的参数,不要把免责声明或页脚当成参数。`;

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false, error: 'auth' }, 403);
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, error: 'no-db' }, 503);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400); }
  const dataUrl = String(body.image ?? '');
  if (!dataUrl.startsWith('data:image/')) return json({ ok: false, error: 'need-data-url' }, 400);

  /* 可以指定用哪一路读图。实测商汤对这类表格图返回合法 JSON 但字段全空 ——
     它没真读进去,而 vision() 见到「有返回」就不再往下试,后面的 Agnes 根本轮不到。
     所以这里允许调用方点名,批处理前先用小样本比一比谁读得准。 */
  const want = String(body.provider ?? '').trim();
  let fleet = await loadFleet(db);
  if (want) fleet = fleet.filter((p: any) => String(p.id ?? '').includes(want));
  if (!fleet.length) return json({ ok: false, error: 'no-provider' }, 400);
  let out: any = null;
  try {
    out = await vision(env as any, dataUrl, PROMPT, {
      system: '你是包材工程师,只做一件事:把规格表图上的参数原样读成 JSON。看不清就留空,不猜。',
      json: true, maxTokens: 500, fleet,
    });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 160) }, 502);
  }

  let parsed: any = {};
  try {
    const m = (out?.text ?? '').match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch { /* 下面按空处理 */ }

  return json({
    ok: true,
    model: out?.provider ?? '',
    /* 读不出来时要能看到模型原话,否则只看到一堆空字段,分不清是「图看不清」
       还是「模型没按 JSON 回」。这一路是批处理专用接口,带上原文不外泄给访客。 */
    raw: String(out?.text ?? '').slice(0, 400),
    spec: {
      item_no: String(parsed.item_no ?? '').trim().slice(0, 32),
      size_mm: String(parsed.size_mm ?? '').trim().slice(0, 48),
      bare_height_mm: String(parsed.bare_height_mm ?? '').trim().slice(0, 16),
      caliber: String(parsed.caliber ?? '').trim().slice(0, 48),
      capacity: String(parsed.capacity ?? '').trim().slice(0, 32),
      note: String(parsed.note ?? '').trim().slice(0, 80),
    },
  });
};
