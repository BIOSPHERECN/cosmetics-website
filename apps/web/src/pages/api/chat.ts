import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, paidFirst } from '../../lib/fleet';
import { chatInLanguage, replyLanguageFor, detectLanguage } from '../../lib/translate.ts';
import { overQuota, recordUse, tooMany, clientId } from '../../lib/ratelimit';

export const prerender = false;

/**
 * AI 客服 —— 「先机器人、后人工」的第一道接待(创始人对标 GitHub 支持机器人)。
 *
 * 接地纪律(与共创工作台同一条铁律):
 *   知识只来自**站内已审内容** —— answer 版块的 FAQ + 产品表,请求时现查现拼。
 *   不另建一份知识库:两份真相必然跑偏,站上改了话术,机器人下一句就跟上。
 *
 * 三条红线写死在系统提示里,不靠模型自觉:
 *   ① 绝不报价格/单价/区间 —— 报价只走书面(全站不展示价格是既定纪律);
 *   ② 资料里没有的数字与事实,一律「这个我不掌握」,并引导转人工;
 *   ③ 不做功效承诺(化妆品不是药品)。
 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;

  const who = clientId(request);
  if (await overQuota(db, 'ai.chat', who)) return tooMany('ai.chat');
  await recordUse(db, 'ai.chat', who);
  if (!db) return json({ ok: false, msg: '数据源未就绪' }, 500);

  const body = (await request.json().catch(() => ({}))) as {
    messages?: { role: string; content: string }[]; lang?: string; site?: string;
  };
  /* 历史由客户端带,服务端裁剪:最近 8 轮、单条 ≤1000 字 —— 防塞小说 */
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-8)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 1000) }));
  const last = [...history].reverse().find((m) => m.role === 'user');
  if (!last || !last.content.trim()) return json({ ok: false, msg: '请先输入问题' }, 400);

  const site = /^[a-z0-9-]{1,32}$/.test(body.site ?? '') ? body.site! : 'biosphere-ai';

  /* ── 现查站内事实 ── */
  const faqs = ((await db.prepare(
    `SELECT i.data_json FROM blocks b
       JOIN pages p ON p.id = b.page_id
       JOIN block_i18n i ON i.block_id = b.id AND i.lang = 'zh-cn'
      WHERE p.site_id = ? AND b.type = 'answer' AND b.is_visible = 1 LIMIT 12`,
  ).bind(site).all<{ data_json: string }>().catch(() => ({ results: [] as any[] }))).results ?? [])
    .flatMap((r) => {
      try {
        const d = JSON.parse(r.data_json);
        const one = d.question ? [{ q: d.question, a: d.answer }] : [];
        return [...one, ...(Array.isArray(d.faqs) ? d.faqs.map((f: any) => ({ q: f.q ?? f.question, a: f.a ?? f.answer })) : [])];
      } catch { return []; }
    })
    .filter((f) => f.q && f.a).slice(0, 20);

  const products = ((await db.prepare(
    `SELECT p.category, p.moq,
            (SELECT x.name FROM product_i18n x WHERE x.product_id = p.id
              ORDER BY CASE x.lang WHEN 'zh-cn' THEN 0 ELSE 1 END LIMIT 1) AS name
       FROM products p WHERE p.site_id = ? AND p.status = 'published' ORDER BY p.id LIMIT 40`,
  ).bind(site).all<any>().catch(() => ({ results: [] as any[] }))).results ?? []);

  /* ── 知识库检索(先检索再生成)──
     关键词打分:条目 keywords 里任一词出现在问题里 +3 分,标题整词命中 +2。
     CJK 不用分词 —— 「问题包含关键词」这个方向天然可靠。取 Top5,零命中就不喂,
     让模型走「不掌握→转人工」而不是拿无关条目硬答。 */
  const q = history.filter((m) => m.role === 'user').map((m) => m.content).join(' ').toLowerCase();
  const kbAll = ((await db.prepare(
    `SELECT title, content, keywords FROM kb_entries WHERE is_published = 1 ORDER BY sort_order`,
  ).all<{ title: string; content: string; keywords: string }>().catch(() => ({ results: [] as any[] }))).results ?? []);
  const kb = kbAll
    .map((e) => ({
      e,
      score: e.keywords.split(/[,，]/).filter((k) => k.trim() && q.includes(k.trim().toLowerCase())).length * 3
        + (q.includes(e.title.toLowerCase().replace(/[??]/g, '')) ? 2 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.e);

  const facts =
    (kb.length ? '【知识库(精编口径,优先采用)】\n' + kb.map((e) => `▸ ${e.title}\n${e.content}`).join('\n') + '\n' : '') +
    '【常见问答(站内已发布口径)】\n' +
    faqs.map((f) => `问:${f.q}\n答:${f.a}`).join('\n') +
    '\n【在产产品(名称·品类·起订口径)】\n' +
    products.map((p: any) => `${p.name} · ${p.category}${p.moq ? ` · ${p.moq}` : ''}`).join('\n');

  const fleet = paidFirst(await loadFleet(db, env as any));
  if (!fleet.length) return json({ ok: false, msg: '客服暂不在线,请直接发起询盘' }, 503);

  /* 回复语言跟人不跟页面。detectLanguage 是给翻译管线设计的(<20 字符不猜),
     聊天里短句是常态 ——「Do you make serum?」19 字符被放弃判定,
     结果创始人英文提问收到中文回复(「这尴尬了」)。聊天专用补判:
     整句无 CJK 且有拉丁字母、而页面语言是 CJK → 按英文回;
     含 CJK → 中文。页面语言本身是拉丁语种(fr/de/…)时不抢戏,仍回该语种。 */
  const replyLang = (() => {
    const txt = last.content;
    const d = detectLanguage(txt);
    if (d) return d;
    const hasCJK = /[぀-ヿ一-鿿가-힯]/.test(txt);
    if (hasCJK) return 'zh-cn';
    const pageIsCJK = ['zh-cn', 'zh-tw', 'jp', 'kr'].includes(body.lang ?? '');
    if (/[a-z]/i.test(txt) && pageIsCJK) return 'en';
    return replyLanguageFor(body.lang, txt);
  })();
  let reply = '';
  try {
    reply = await chatInLanguage(env as any, fleet, replyLang, [
      {
        role: 'system',
        content:
          '你是帛卉化妆品(BIOSPHERE)官网的接待客服,面向海外与国内的 B2B 采购客户。' +
          '你只依据下面的【资料】回答;资料里没有的事实与数字,回答「这个我不掌握,建议发起询盘由专员书面答复」。' +
          '三条绝对禁令:1) 绝不报任何价格、单价或价格区间 —— 价格一律以书面报价单为准;' +
          '2) 不编造认证、产能、交期等数字;3) 不做任何功效承诺(化妆品不是药品)。' +
          '回答要点式、克制,单次不超过 120 字;涉及打样、报价、定制配方时,主动建议点「转人工询盘」按钮(就在本对话框下方)。' +
          '输出为纯文本:不要用 Markdown 语法,**绝不输出任何 URL 或链接** —— 你编的链接一定是错的,按钮就在面板里,不需要链接。\n\n【资料】\n' +
          facts.slice(0, 6000),
      },
      ...history,
    ], { maxTokens: 400 });
  } catch {
    return json({ ok: false, msg: '客服暂时繁忙,请稍后再试或直接发起询盘' }, 502);
  }
  if (!reply.trim()) return json({ ok: false, msg: '客服暂时繁忙,请直接发起询盘' }, 502);
  return json({ ok: true, reply: reply.trim().slice(0, 1200) });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
