/**
 * 视觉模型横评 —— 同一张图,所有已配 key 的视觉模型同时跑,并排比。
 *
 * 为什么要自己测而不是看榜单:
 *   通用榜单测的是「看图说话」的平均水平,我们要的是「读肌肤外观特征并输出结构化 JSON」。
 *   这两件事的排名经常不一样 —— 有的模型描述能力强但不肯乖乖出 JSON,
 *   有的中文表达一般但结构化极稳。对我们来说后者更有用,因为下游要拿它检索配方。
 *
 * 所以评分口径就三条,都是能自动判的:能不能跑通、出不出合法 JSON、字段全不全。
 * 主观的「描述得好不好」交给人看并排结果自己判断,不假装能自动打分。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json } from '../../../lib/guard';
import { loadFleet, vision, type Provider } from '../../../lib/fleet';

export const prerender = false;

const SCHEMA = `{"skin_type":"干性/中性/混合性/油性","observations":[{"trait":"","area":"","degree":""}],"concerns":[""],"avoid":[""]}`;
const NEED = ['skin_type', 'observations', 'concerns'];

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const { image } = (await request.json()) as { image?: string };
    if (!image?.startsWith('data:image/')) return json({ ok: false, msg: '没有收到图片' }, 400);
    if (image.length > 2_200_000) return json({ ok: false, msg: '图片过大' }, 413);

    const all = await loadFleet(c.db, env as any);
    // 有 key 就参评 —— 「标记了能读图」是我们填的,不是事实;跑一次才是事实
    const pool = all.filter((p) => p.keys?.length);
    if (!pool.length) return json({ ok: false, msg: '没有任何已配 key 的供应商' }, 503);

    // 并发跑,不然 6 家串行要等一分多钟
    const results = await Promise.all(pool.map((p) => run(p)));

    // 排序:先按能否用(通),再按结构完整度,最后按快慢
    results.sort((a, b) =>
      Number(b.ok) - Number(a.ok) || b.score - a.score || a.ms - b.ms);

    return json({ ok: true, list: results });
  } catch (e) {
    return json({ ok: false, msg: `横评失败:${e instanceof Error ? e.message.slice(0, 160) : String(e)}` }, 500);
  }

  async function run(p: Provider) {
    const t0 = Date.now();
    const base = {
      id: p.id, label: p.label, model: p.visionModel || p.model,
      ok: false, score: 0, ms: 0, json_ok: false, fields: [] as string[],
      text: '', note: '',
    };
    try {
      const r = await vision(
        env as any, image!,
        `观察这张面部照片的外观特征,只输出 JSON,结构如下:\n${SCHEMA}`,
        {
          system: '你是化妆品配方顾问,不是医生。只描述外观特征,不给任何疾病名称或诊疗建议。只输出 JSON。',
          json: true, maxTokens: 700,
          fleet: [{ ...p, vision: true, visionModel: p.visionModel || p.model }],
        },
      );
      base.ok = true;
      base.ms = r.ms;
      base.text = r.text.slice(0, 1200);
      base.model = r.model;

      const parsed = parse(r.text);
      base.json_ok = !!parsed;
      if (parsed) {
        base.fields = NEED.filter((k) => parsed[k] !== undefined && parsed[k] !== null && String(parsed[k]).length > 0);
        // 打分只算能自动判的:跑通 2 分 + 出合法 JSON 2 分 + 每个必需字段 2 分
        base.score = 2 + 2 + base.fields.length * 2;
      } else {
        base.score = 2;
        base.note = '能读图,但没有按要求输出 JSON';
      }
    } catch (e) {
      base.ms = Date.now() - t0;
      base.note = e instanceof Error ? e.message.slice(-60) : '失败';
    }
    return base;
  }
};

function parse(s: string): any {
  try { return JSON.parse(s); } catch { /* 常见:包了一层 ``` */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
