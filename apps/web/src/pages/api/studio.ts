import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, chat } from '../../lib/fleet';

export const prerender = false;

/**
 * AI 共创工作台 —— 客户用大白话说需求,拿回 3–5 条候选配方 + 推荐理由。
 *
 * 管线严格三步,顺序不可调换(借鉴 SueAI 的 grounding 铁律):
 *   ① 解析:模型把自然语言转成结构化条件(品类/剂型/功效/市场/量级)
 *   ② 检索:**先查配方库**,拿到真实候选
 *   ③ 生成:模型只在候选范围内解释"为什么推荐这条"
 *
 * 为什么必须是这个顺序:
 *   直接让模型"推荐配方"= 它会凭空编。客户拿着编出来的参数下单,
 *   工厂做不出来是要赔钱的。所以模型**只允许在库里已有的行中挑选与解释**,
 *   检索为空时诚实回"库中暂无匹配",绝不让模型补位。
 *
 * 同时沿用「认知三档」:每条推荐标明依据层级 ——
 *   ① 配方库直证(挂配方号)② 工艺推演 ③ 待验证。禁止把②③当①用。
 */
export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: '数据源未就绪' }, 500);

  const body = (await request.json().catch(() => ({}))) as { input?: string; lang?: string; site?: string };
  const input = (body.input ?? '').trim();
  if (input.length < 4) return json({ ok: false, msg: '请把需求说得再具体一点' }, 400);
  if (input.length > 2000) return json({ ok: false, msg: '需求描述过长,请精简到 2000 字以内' }, 400);

  const fleet = await loadFleet(db, env as any);
  if (!fleet.length) {
    return json({ ok: false, msg: '尚未配置任何模型,请在后台「模型舰队」填入 API Key' }, 503);
  }

  // ── ① 解析:自然语言 → 结构化条件 ───────────────────────────
  let filters: any = {};
  try {
    const r = await chat(
      env as any,
      [
        {
          role: 'system',
          content:
            '你是化妆品代工的需求解析器。把客户的自然语言需求转成 JSON,只输出 JSON 不要解释。' +
            '字段:category(skincare/makeup/cleansing/oral/body 之一或空)、' +
            'format(serum/cream/mask/foam/oil/powder/balm/toothpaste 等或空)、' +
            'benefits(英文小写关键词数组,如 hydrating/brightening/anti-aging/soothing/barrier/acne)、' +
            'markets(CN/EU/US/JP/ID 数组)、qty(预估数量整数或 null)。' +
            '拿不准的字段留空,不要猜。',
        },
        { role: 'user', content: input },
      ],
      { json: true, temperature: 0.1, maxTokens: 300, fleet },
    );
    filters = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, ''));
  } catch {
    // 解析失败不中断:退化成全库按功效关键词粗筛,总比直接报错好
    filters = {};
  }

  // ── ② 检索:先查库,拿真实候选 ──────────────────────────────
  const where: string[] = [`status IN ('active','sample')`];
  const bind: unknown[] = [];
  if (filters.category) { where.push('category = ?'); bind.push(String(filters.category)); }
  if (filters.format) { where.push('format = ?'); bind.push(String(filters.format)); }
  if (Array.isArray(filters.benefits) && filters.benefits.length) {
    where.push('(' + filters.benefits.map(() => 'benefits LIKE ?').join(' OR ') + ')');
    for (const b of filters.benefits.slice(0, 5)) bind.push(`%${String(b)}%`);
  }
  if (Array.isArray(filters.markets) && filters.markets.length) {
    where.push('(' + filters.markets.map(() => 'markets LIKE ?').join(' OR ') + ')');
    for (const m of filters.markets.slice(0, 5)) bind.push(`%${String(m)}%`);
  }
  if (Number.isFinite(filters.qty)) { where.push('moq <= ?'); bind.push(Number(filters.qty)); }

  let { results } = await db
    .prepare(`SELECT code,category,format,benefits,actives_json,texture,moq,lead_days,markets,status,ai_summary
                FROM formulas WHERE ${where.join(' AND ')} ORDER BY moq LIMIT 8`)
    .bind(...bind)
    .all<any>();

  // 条件太严导致零命中时,放宽到只按品类再试一次 —— 给客户空结果是最差的体验
  let relaxed = false;
  if (!results?.length && filters.category) {
    relaxed = true;
    const r2 = await db
      .prepare(`SELECT code,category,format,benefits,actives_json,texture,moq,lead_days,markets,status,ai_summary
                  FROM formulas WHERE status IN ('active','sample') AND category = ? ORDER BY moq LIMIT 8`)
      .bind(String(filters.category))
      .all<any>();
    results = r2.results;
  }

  if (!results?.length) {
    return json({
      ok: true, matched: [], filters,
      note: '配方库中暂无直接匹配的条目。请补充品类或功效方向,或直接发起询盘由研发人工评估。',
    });
  }

  // ── ③ 生成:只在候选范围内解释,不得引入库外配方 ─────────────
  let advice = '';
  try {
    const r = await chat(
      env as any,
      [
        {
          role: 'system',
          content:
            '你是化妆品代工的方案顾问。下面给你客户需求与**候选配方清单**。' +
            '规则:只能从清单里挑选与解释,**绝不允许提出清单之外的配方或参数**;' +
            '每条推荐说明匹配了客户的哪一点、以及需要注意什么(如起订量、打样周期、目标市场限制)。' +
            '不要给出具体使用剂量,不要做功效承诺。中文回答,每条 2-3 句,最多 4 条。',
        },
        { role: 'user', content: `客户需求:${input}\n\n候选配方:\n${results.map((r: any) => r.ai_summary).join('\n')}` },
      ],
      { temperature: 0.3, maxTokens: 900, fleet },
    );
    advice = r.text;
  } catch (e) {
    advice = '';
  }

  // 留痕:既是询盘线索,也是下一轮改进匹配的语料
  await db
    .prepare(`INSERT INTO studio_sessions (site_id,lang,raw_input,parsed_json,matched_json) VALUES (?,?,?,?,?)`)
    .bind(
      String(body.site ?? 'beauty2oem'), String(body.lang ?? 'zh-cn'), input,
      JSON.stringify(filters), JSON.stringify(results.map((r: any) => r.code)),
    )
    .run()
    .catch(() => {});

  return json({
    ok: true,
    filters,
    relaxed,
    // 明示样例数据 —— 不让客户误以为是可下单的真配方
    hasSample: results.some((r: any) => r.status === 'sample'),
    matched: results.map((r: any) => ({
      code: r.code, category: r.category, format: r.format,
      benefits: String(r.benefits).split(',').filter(Boolean),
      actives: JSON.parse(r.actives_json || '[]'),
      texture: r.texture, moq: r.moq, leadDays: r.lead_days,
      markets: String(r.markets).split(',').filter(Boolean),
      isSample: r.status === 'sample',
    })),
    advice,
  });
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
