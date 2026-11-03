import type { APIRoute } from 'astro';
import { FORMULA_NOTICE_ZH, FORMULA_NOTICE_EN } from '../../lib/no-ai-formula';

export const prerender = false;

/**
 * AI 共创工作台(一句话要配方)已关闭 —— 2026-09-24 老板会议:
 * 不给客户 AI 现编配方(没经过稳定性测试),只从帛卉 13,000+ 个成熟配方里匹配现成的。
 * 旧管线(解析 → 检索 → 模型解释)在 git 历史 75e77d6 里;接口不再调模型、不查库。
 */
export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { lang?: string };
  const zh = String(b.lang ?? 'zh-cn').startsWith('zh');
  return new Response(JSON.stringify({ ok: false, off: true, msg: zh ? FORMULA_NOTICE_ZH : FORMULA_NOTICE_EN }), {
    status: 410, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
