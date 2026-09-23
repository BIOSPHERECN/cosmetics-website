import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';
import { env } from 'cloudflare:workers';
import { chat, loadFleet } from '../../../lib/fleet';

export const prerender = false;

/* 互动总结:业务员把 WhatsApp / 邮件往来贴进来,模型压成一条结构化跟进记录。
   来源:创始人 2026-09-16 转来的珍客「7 个 AI 场景」——「智能互动总结」省 80% 整理时间;
   我们只做最小版:贴文本 → 摘要 → 填回跟进框,人看一眼再点「记录」。不自动入库。 */
const PROMPT = `你是化妆品 OEM 工厂外贸业务经理的助手。下面是一段与客户的往来记录(邮件/WhatsApp/会议纪要,可能中英混杂)。
只输出中文,≤180 字,格式固定:
需求:(品类/规格/量/市场/认证)
关键人:(有则写职位,没有写"未知")
顾虑或异议:(价格/交期/MOQ/认证…没有写"无")
承诺与待办:(我方答应了什么、对方要给什么)
下一步:(一句话,含时间)`;

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { text } = (await request.json().catch(() => ({}))) as { text?: string };
  const body = (text ?? '').trim();
  if (body.length < 20) return json({ ok: false, msg: '先把往来记录贴进来(至少 20 字)' }, 400);
  try {
    const fleet = await loadFleet(c.db, env as any);
    const r = await chat(env as any, [{ role: 'system', content: PROMPT }, { role: 'user', content: body.slice(0, 6000) }], { fleet, maxTokens: 500, timeoutMs: 30000 });
    const out = String(r.text ?? '').trim();
    if (!out) return json({ ok: false, msg: '模型没有返回,稍后再试' }, 502);
    return json({ ok: true, summary: out });
  } catch (e: any) {
    return json({ ok: false, msg: `总结失败:${String(e?.message ?? e).slice(0, 120)}` }, 502);
  }
};
