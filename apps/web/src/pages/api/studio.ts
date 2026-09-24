import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, chat, paidFirst } from '../../lib/fleet';
import { replyLanguageRule, chatInLanguage, replyLanguageFor } from '../../lib/translate.ts';
import { overQuota, recordUse, tooMany, clientId } from '../../lib/ratelimit';
import { aiGate } from '../../lib/member';
/* 站上已经写过的判断,压成 1.4k tokens 的摘要。
   不做检索是因为量级不到:三十几条整份带上比切片检索更准 ——
   切片会切断「这一题和那一题的关系」。4,476 款包材那种量级才需要检索。 */
import { kbDigest } from '@cosmetic/core/content/kb-digest.ts';
import { siteIdForHost } from '@cosmetic/core/content/tenant-map.ts';
import { CAT_LABEL, label } from '../../lib/catalog';

export const prerender = false;

/**
 * 2026-09-09 实测记录 —— 为什么这里**没有**相似度阈值。
 *
 * 试过。bge-m3 在这个库上的余弦分几乎不区分对错:
 *   「敏感肌舒缓的」(该命中)0.418 · 「儿童牙膏,要低泡不辣嘴」(该拒绝)0.426。
 * 该拒绝的还比该命中的高。原因是客户的问法只有六到十个字,而配方文档是八十字散文,
 * 短查询对长文档的余弦本来就被压在很窄一段 —— 阈值卡在哪都是掷骰子。
 *
 * 所以「库里没有这个品类」这件事**不靠分数判断,靠库存判断**:
 * 把库里真实存在的品类与剂型喂给解析器,让它自己说「这单我们接不了」。
 * 那是确定性的,而分数不是。
 */

/**
 * AI 共创工作台 —— 客户用大白话说需求,拿回 3–5 条候选配方 + 推荐理由。
 *
 * 管线严格三步,顺序不可调换(grounding 铁律):
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

  /* 同 /api/ai/skin:公开接口 + 真实模型调用 = 必须限流,理由见 lib/ratelimit.ts */
  const who = clientId(request);
  if (await overQuota(db, 'ai.studio', who)) return tooMany('ai.studio');
  /* 09-24 C10(代码审计 P1-4):只给会员用,并计每日额度 —— 不登录、只按 IP 限次时,换 IP 就能把模型免费额度烧干 */
  const denied = await aiGate(request, env, db, 'ai.studio');
  if (denied) return denied;
  await recordUse(db, 'ai.studio', who);
  if (!db) return json({ ok: false, msg: '数据源未就绪' }, 500);

  const body = (await request.json().catch(() => ({}))) as { input?: string; lang?: string; site?: string };
  const input = (body.input ?? '').trim();
  if (input.length < 4) return json({ ok: false, msg: '请把需求说得再具体一点' }, 400);
  if (input.length > 2000) return json({ ok: false, msg: '需求描述过长,请精简到 2000 字以内' }, 400);

  const fleet = paidFirst(await loadFleet(db, env as any));
  if (!fleet.length) {
    return json({ ok: false, msg: '尚未配置任何模型,请在后台「模型舰队」填入 API Key' }, 503);
  }

  /* 库里**真实有什么**。不查这一步,解析器就会凭常识猜:
     线上实测「儿童牙膏,要低泡不辣嘴」被它解析成 category=skincare / format=cream,
     于是 SQL 老老实实回了八支面霜 —— 对采购来说这不是「没有」,
     是「这家工厂听不懂人话」。223 行的 GROUP BY,代价可以忽略。 */
  const { results: catRows } = await db.prepare(
    `SELECT category, GROUP_CONCAT(DISTINCT format) fmts, COUNT(*) n
       FROM formulas WHERE status IN ('active','sample') GROUP BY category ORDER BY n DESC`,
  ).all<any>();
  const catalogLine = (catRows ?? [])
    .map((r: any) => `${r.category}(${r.n} 支):${r.fmts}`).join(' | ');
  const realCats = new Set((catRows ?? []).map((r: any) => String(r.category)));

  // ── ① 解析:自然语言 → 结构化条件 ───────────────────────────
  let filters: any = {};
  let outOfCatalog = false;
  try {
    // 客户用什么语言写需求,就用什么语言回;判不出来才退回页面语种
    const replyLang = replyLanguageFor(body.lang, input);

    /* 2026-09-08 修:这里原本写的是 `advice = await …` 然后 `JSON.parse(r.text…)`。
       两处都错:`advice` 在下面第 118 行才 `let` 声明 —— 同一个函数作用域里
       提前赋值就是 TDZ ReferenceError;而 `r` 根本不存在,`chatInLanguage`
       返回的也是字符串不是对象。两个错都被下面那个空 catch 吞掉,
       结果是**每一次请求 filters 都退化成 {}**,选品台从来没真正解析过需求。
       构建不报、接口照常 200 —— 这就是没有类型检查的代价。 */
    const parsed = await chatInLanguage(
      env as any,
      fleet,
      replyLang,
      [
        {
          role: 'system',
          content:
            '你是化妆品代工的需求解析器。把客户的自然语言需求转成 JSON,只输出 JSON 不要解释。' +
            '字段:category(skincare/makeup/cleansing/oral/body/suncare/haircare/kids/fragrance 之一或空)、' +
            'format(serum/cream/mask/foam/oil/powder/balm/toothpaste/mouthwash/shampoo/edt 等或空)、' +
            'benefits(英文小写关键词数组,如 hydrating/brightening/anti-aging/soothing/barrier/acne)、' +
            'markets(CN/EU/US/JP/ID 数组)、qty(预估数量整数或 null)。' +
            '拿不准的字段留空,不要猜。' +
            /* 关键的一句:允许它说「没有」。不给这个出口,模型一定会硬塞一个最像的品类。 */
            `

配方库现在**只有**这些品类与剂型:
${catalogLine}
` +
            /* 2026-09-09:这里原本举的例子是「牙膏、漱口水、香水」——
               写的时候库里确实没有,今天补进 19 支口腔、7 支香氛、8 支儿童之后,
               这句话就变成了让模型拒掉我们**真做得了**的生意。
               例子换成库里确实没有的,并且改成以上面那份清单为准。 */
            '如果客户要的东西明显不在上面那份清单里(例如宠物用品、口服食品、家庭清洁剂、医疗器械),' +
            '**只输出** {"outOfCatalog": true},不要退而求其次挑一个最像的品类。' +
            '硬塞一个不对的品类,比诚实说没有更伤。',
        },
        { role: 'user', content: input },
      ],
      { json: true, temperature: 0.1, maxTokens: 300, fleet },
    );
    filters = JSON.parse(parsed.replace(/^```json\s*|\s*```$/g, ''));
    /* 双保险:模型自己承认接不了,或者报了一个库里根本没有的品类 */
    outOfCatalog = filters?.outOfCatalog === true
      || (filters?.category && !realCats.has(String(filters.category)));
  } catch (e) {
    // 解析失败不中断:退化成全库按功效关键词粗筛,总比直接报错好。
    // 但要留痕 —— 上一版空 catch 把一个必现的 ReferenceError 藏了不知道多久。
    console.error('[studio] 需求解析失败,退化为粗筛:', e instanceof Error ? e.message : e);
    filters = {};
  }

  /* 接不了就当场说,不要再往下检索 —— 往下走的每一步都只会让这个「没有」
     变成一堆看起来像匹配的面霜。顺带把我们**确实有**的列出来:
     客户可能只是换个说法就能接上,而空着让他自己猜是最差的收尾。 */
  if (outOfCatalog) {
    return json({
      ok: true, matched: [], filters, outOfCatalog: true,
      /* 给客户看的必须是中文品类名。`skincare(146 支)` 这种是我们后台的写法,
         摆到客户面前就是一句没翻译完的话。 */
      note: `这类产品目前不在我们的在册配方库里。现有品类:${
        (catRows ?? []).map((r: any) => `${label(CAT_LABEL as any, String(r.category), true)}(${r.n} 支)`).join('、')
      }。如果你要的是这几类之外的产品线,可以直接发起询盘 —— 能不能做由研发评估,不在这里替他们答。`,
    });
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

  /* ── ②-b 语义兜底:SQL 查不到时,用向量检索再捞一次 ─────────────
     SQL 只认精确值与 LIKE。客户说「油痘肌夏天用不闷的清爽精华」,
     解析器压成 benefits=['oil-control'] 之后,配方库里写「控油」而没写
     'oil-control' 的那些就全查不到 —— 结果是明明有货却回「暂无匹配」。

     向量检索按语义找,不依赖关键词对齐。**它只用来补候选,不改规则**:
     捞回来的编码仍要回 D1 取真实字段,再进第 ③ 步生成 ——
     生成阶段永远只能引用库里真实存在的配方,这条不松动。 */
  /* 触发条件不能只是「零命中」。解析器把需求解析成全空时(客户用的是
     「不闷」「清爽」这种库里没有对应字段的说法),SQL 没有任何 WHERE,
     返回的就是按 moq 排序的前八条 —— 不是匹配,是「随便八条」。
     那种情况下拿到八条结果反而更糟:它看起来像匹配,其实是噪音。
     所以:零命中要走语义,**解析全空也要走语义**。 */
  /* 2026-09-09 再修 · 语义从「兜底」改成「排序」。
     上一版只在零命中或解析全空时才跑向量,结果是:只要解析器吐出一个
     category=skincare,SQL 就按 moq 排序回最便宜的八支 —— 于是
     「敏感肌舒缓的」和「想要一个能提亮的」拿到的是**同一批** SR-1102/1105/1107。
     不是匹配,是「最便宜的八支护肤」。客户问什么都给同样的答案,比空结果更伤。

     现在每次请求都跑一次向量(受全站日闸约束),用它来**排**候选:
     语义命中的排前面,SQL 结果补齐后面,去重后取 8。
     向量在这里的作用是排序而不是救火 —— 它本来就更擅长这个。 */
  let semantic = false;
  let vtop: number | null = null;
  /* 命中的向量 id 直接回出来。2026-09-09:同一个索引,用 REST 查「儿童牙膏」
     前五名全是牙膏(0.63-0.66),Worker 里查却回一堆面霜、最高分 0.42x。
     只看分数看不出差在哪一步,回 id 才能对账。 */
  let vids: string[] = [];
  {
    try {
      const ai = (env as any).AI;
      const vec = (env as any).VECTORIZE;
      /* 全站日闸:按 IP 的 20 次/小时挡不住分布式脚本。
         这一条不分 IP,超了就跳过语义、用原来的 SQL 结果 —— 降级但不报错。 */
      const kbFull = await overQuota(db, 'kb.query', 'global');
      if (kbFull) console.warn('[studio] 向量检索已达全站日上限,本次跳过语义');
      if (ai && vec && !kbFull) {
        await recordUse(db, 'kb.query', 'global');
        const e = await ai.run('@cf/baai/bge-m3', { text: [input] });
        const qv = (e?.data ?? e?.result?.data ?? [])[0];
        if (Array.isArray(qv)) {
          /* returnMetadata 必须是 'all'。'indexed' 只回**建过元数据索引**的字段,
             早期没建索引时 metadata 会全空,按 kind 过滤会把命中全丢掉 ——
             表现是「语义检索跑了但一条都没捞回来」,而且不报错。

             2026-09-09 修 · 这一段之前是 topK=20 全库捞、再在结果里挑 kind==='formula'。
             实测坏在**配比**上:库里 4,699 条向量,包材占 4,476 条(95%),配方只有 100 条。
             而包材的检索文本里本来就写着「适配 精华」,和「清爽精华」这种问法**正面竞争** ——
             于是前 20 名几乎全是瓶子,漏下来的配方是排名边缘的残渣。
             线上实测:问「适合油痘肌、夏天用不闷的清爽精华」,回的是粉底液和气垫。

             全库检索 + 事后过滤 = 把过滤条件放在了最没用的位置。
             改成在**检索时**就按 kind 限定(Vectorize 的 filter,需要 kind 上的元数据索引),
             topK 直接就是配方里的前 8 名 —— 不再和包材抢名额。 */
          /* namespace 而不是 filter —— filter 是搜完再筛,namespace 是先分区再搜。
             见 cron/kb-index.ts 里那段注释:filter 版本对任何问题都回 0.42x,
             因为近邻是在 4,476 条包材里挑出来的,配方拿到的只是筛剩下的。 */
          const hit = await vec.query(qv, {
            topK: 8, returnMetadata: 'all', namespace: 'formula',
          });
          const ms: any[] = hit?.matches ?? [];
          vtop = ms.length ? Math.round((ms[0].score ?? 0) * 1000) / 1000 : null;
          vids = ms.slice(0, 5).map((m: any) => `${m.id}@${Math.round((m.score ?? 0) * 1000)}`);
          /* 相似度下限。向量检索**永远**会给你 topK 条 —— 库里没有的东西,
             它就把最不相干的那几条排前面还给你。线上实测过一次:
             问「儿童牙膏,要低泡不辣嘴」,配方库里根本没有口腔与儿童线(100 条里
             只有护肤/彩妆/防晒/身体/清洁/洗护六类),于是它回了口红和粉底 ——
             对采购来说这不是「没找到」,是「这家工厂不懂我在说什么」。

             宁可诚实说没有。低于阈值就当零命中,走下面那条「暂无直接匹配」的路,
             让客户补品类或直接发询盘 —— 那条路已经写好了,只是之前没人走得到。 */
          const codes = ms
            .filter((m: any) => m?.metadata?.code)
            .map((m: any) => String(m.metadata.code)).slice(0, 8);
          if (codes.length) {
            const r3 = await db
              .prepare(`SELECT code,category,format,benefits,actives_json,texture,moq,lead_days,markets,status,ai_summary
                          FROM formulas WHERE status IN ('active','sample')
                           AND code IN (${codes.map(() => '?').join(',')})`)
              .bind(...codes).all<any>();
            const byCode = new Map((r3.results ?? []).map((r: any) => [String(r.code), r]));
            /* 按向量给的顺序摆,而不是 D1 的返回顺序 —— IN(...) 不保证顺序,
               照抄回来就等于把排序又丢了一次。 */
            const ordered = codes.map((c) => byCode.get(c)).filter(Boolean);
            if (ordered.length) {
              const seen = new Set(ordered.map((r: any) => String(r.code)));
              const fill = (results ?? []).filter((r: any) => !seen.has(String(r.code)));
              results = [...ordered, ...fill].slice(0, 8);
              semantic = true;
            }
          }
        }
      }
    } catch (e) {
      /* 检索层挂了不该让整个接口挂 —— 但要留痕,不然又是一个静默降级 */
      console.error('[studio] 语义检索失败,继续走空结果:', e instanceof Error ? e.message : e);
    }
  }

  if (!results?.length) {
    return json({
      ok: true, matched: [], filters, vtop, vids,
      note: '配方库中暂无直接匹配的条目。请补充品类或功效方向,或直接发起询盘由研发人工评估。',
    });
  }

  // ── ③ 生成:只在候选范围内解释,不得引入库外配方 ─────────────
  let advice = '';
  try {
    // 客户用什么语言写需求,就用什么语言回;判不出来才退回页面语种
    const replyLang = replyLanguageFor(body.lang, input);

    // 同 skin.ts:校验过语言才返回,不合格换下一家
    advice = await chatInLanguage(
      env as any,
      fleet,
      replyLang,
      [
        {
          role: 'system',
          content:
            '你是化妆品代工的方案顾问。下面给你客户需求与**候选配方清单**。' +
            '规则:只能从清单里挑选与解释,**绝不允许提出清单之外的配方或参数**;' +
            '每条推荐说明匹配了客户的哪一点、以及需要注意什么(如起订量、打样周期、目标市场限制)。' +
            '不要给出具体使用剂量,不要做功效承诺。每条 2-3 句,最多 4 条。' +
            /* 口径统一:网页上说「首批 3,000 件可接」,AI 不能说「一般 5,000 起」——
               同一个问题两个口径,采购会当场发现,而不一致比说错更伤。
               顺带让它把相关页面的链接给出去,访客点得进去,站内链接也顺了。 */
            '\n\n' + kbDigest() +
            '\n涉及上面这些题目时,沿用已写的判断与措辞,并在末尾给出对应链接(用当前语种前缀)。' +
            replyLanguageRule(replyLang),
        },
        { role: 'user', content: `客户需求:${input}\n\n候选配方:\n${results.map((r: any) => r.ai_summary).join('\n')}` },
      ],
      { temperature: 0.3, maxTokens: 900 },
    );
  } catch (e) {
    advice = '';
  }

  // 留痕:既是询盘线索,也是下一轮改进匹配的语料
  await db
    .prepare(`INSERT INTO studio_sessions (site_id,lang,raw_input,parsed_json,matched_json) VALUES (?,?,?,?,?)`)
    .bind(
      String(body.site ?? siteIdForHost(new URL(request.url).hostname) ?? 'biosphere-ai'),
      String(body.lang ?? 'zh-cn'), input,
      JSON.stringify(filters), JSON.stringify(results.map((r: any) => r.code)),
    )
    .run()
    .catch(() => {});

  return json({
    ok: true,
    filters,
    relaxed,
    /* 明示这次是语义兜底捞回来的 —— 后台看数据时能分清两条路径的命中率。
       vtop 是语义最高分:调阈值时要看的就是它,不然只能靠猜。 */
    semantic, vtop, vids,
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
