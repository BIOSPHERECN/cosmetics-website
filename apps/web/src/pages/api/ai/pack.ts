/**
 * AI 外包装设计 —— 上传一张裸瓶照片,拿到可打样的外包装方案。
 *
 * 创始人 2026-09-02:「之前我们可以按照裸瓶图片设计外包装,现在看不到入口了」——
 * 旧站有这个功能(bhbohui/data/packaging.json),新站从没建过,这里补上。
 *
 * 与另外两条 AI 线的分工:
 *   肌肤检测  从一张脸出发 —— 客户不知道自己要什么;
 *   AI 共创   从一句话出发 —— 客户知道要什么但说不清;
 *   包装设计  从一支瓶子出发 —— **客户手里已经有实物**,要的是"它穿什么衣服"。
 *   第三种最接近成交:能把样品照片发过来的客户,通常已经在比价了。
 *
 * 两步管线,刻意分开:
 *   ① 读图(vision)—— 先把瓶子读成结构化事实:剂型、容器、材质、颜色、容量感。
 *      不让生图模型自己"看着办",是因为它会把瓶型也一起改掉 ——
 *      而客户要的是**他那支瓶子**的外包装,不是另一支好看的瓶子。
 *   ② 出图(image)—— 把①的事实 + 客户的品牌调性拼成提示词,出两版外观。
 *
 * 出图失败不算整体失败:方案文字本身就有价值(能带回去开会),
 * 图只是加分项 —— 所以图挂了仍返回 ok，前端按有无图分别渲染。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, vision, image, chat, paidFirst } from '../../../lib/fleet';
import { overQuota, recordUse, tooMany, clientId, sweep } from '../../../lib/ratelimit';
import { aiGate, getMember } from '../../../lib/member';
import { aiDailyCheck, aiBudgetResponse } from '../../../lib/fuse';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/** 读图产出的结构化事实 —— 字段刻意少,每一条都能直接进包材需求单 */
interface BottleFacts {
  dosage: string;      // 剂型:精华 / 面霜 / 洗发水…
  container: string;   // 容器:滴管瓶 / 软管 / 广口瓶…
  material: string;    // 材质观感:玻璃 / PET / 铝罐…
  capacity: string;    // 容量感:30ml 级 / 100ml 级…
  colors: string[];    // 主色
  notes: string;       // 其它值得写进需求单的观察
}

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;

  /* 限流:这个接口公开,且每次调用**同时**打视觉与出图两条线,
     比肌肤检测更贵。没有这道闸,一个写错的爬虫就能把免费额度烧干。 */
  const who = clientId(request);
  if (await overQuota(db, 'ai.pack', who)) return tooMany('ai.pack');
  /* 09-24 C10(代码审计 P1-4):只给会员用,并计每日额度 —— 不登录、只按 IP 限次时,换 IP 就能把模型免费额度烧干 */
  const denied = await aiGate(request, env, db, 'ai.pack');
  if (denied) return denied;

  try {
    await recordUse(db, 'ai.pack', who);
    if (Math.random() < 0.02) await sweep(db);

    const body = (await request.json().catch(() => ({}))) as {
      image?: string; brief?: string; lang?: string; consent?: boolean;
    };
    if (!body.consent) return json({ ok: false, msg: '需要先勾选同意,才能分析这张照片' }, 400);

    const img = (body.image ?? '').trim();
    if (!img.startsWith('data:image/')) return json({ ok: false, msg: '没有收到有效的图片' }, 400);
    /* 3MB 上限:前端已压缩,超了多半是绕过前端直接打接口 */
    if (img.length > 4_200_000) return json({ ok: false, msg: '图片过大,请重新拍摄' }, 413);

    const brief = (body.brief ?? '').trim().slice(0, 600);
    const fleet = paidFirst(await loadFleet(db, env as any));
    if (!fleet.some((p) => p.vision)) return json({ ok: false, msg: 'AI 读图暂不可用,请稍后再试' }, 503);

    /* 全站日预算:读图 + 出图 = 2 次模型调用。放在入参校验之后,
       坏请求不该占预算;但放在模型调用之前,重试也算钱。 */
    if (!(await aiDailyCheck({ db, cap: (env as any).AI_DAILY_CAP, cost: 2 })).ok) return aiBudgetResponse();

    /* 失败原因必须带回前端:静默 catch 让"没有结果"和"哪一步坏了"变成同一件事 */
    let visionErr = '', planErr = '';

    // ── ① 读图:把瓶子读成事实
    const seen = await vision(
      env as any,
      img,
      '这是一支化妆品的裸瓶实物照。只描述你**真实看到**的,不要推测品牌或功效。'
      + '严格返回 JSON:{"dosage":"剂型","container":"容器形态","material":"材质观感",'
      + '"capacity":"容量感","colors":["主色1","主色2"],"notes":"其它观察"}',
      /* 1600:Agnes 是推理模型,给少了它把额度花在思考上、正文返回空(实测 200→空 / 1200→完整) */
      { json: true, maxTokens: 1600, fleet },
    ).catch((e) => { visionErr = e instanceof Error ? e.message : String(e); return null; });

    let facts: BottleFacts | null = null;
    try {
      const raw = seen?.text ?? '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) facts = JSON.parse(m[0]) as BottleFacts;
    } catch { /* 解析不了就走降级:facts 留空,下面用原始描述 */ }

    const factLine = facts
      ? `剂型 ${facts.dosage} · 容器 ${facts.container} · 材质 ${facts.material}`
        + ` · 容量 ${facts.capacity} · 主色 ${(facts.colors ?? []).join('/')}`
      : (seen?.text ?? '').slice(0, 200);

    /* ② 方案 + 选图合成一次调用 ──────────────────────────────
       原先拆成三趟(读图 / 写方案 / 挑风格),一次请求打三趟模型:慢(实测 127 秒),
       且任何一趟被限流,那一段就空着而其余照常返回 —— 客户看到的是
       "有图没方案"这种莫名其妙的半成品。合并后只剩两趟,快且要么全有要么全无。 */
    const { results: lib } = await (db
      ? db.prepare(`SELECT id, alt_zh FROM media WHERE folder='packref' ORDER BY id`)
          .all<{ id: number; alt_zh: string }>()
          .catch(() => ({ results: [] as any[] }))
      : Promise.resolve({ results: [] as any[] }));
    const menu = (lib as any[]).map((x, i) => `${i + 1}. ${x.alt_zh}`).join('\n');

    const out = await chat(
      env as any,
      [
        {
          role: 'system',
          content:
            '你是化妆品包材结构与视觉设计顾问,服务 B2B 品牌方。'
            + '只给可执行建议,不写营销话术,不承诺功效,不编造认证或数字。'
            + '涉及材料与工艺时说明取舍(成本、起订量、运输)。用简体中文。'
            + '只返回 JSON,不要任何解释文字。',
        },
        {
          role: 'user',
          content:
            `客户上传了一支裸瓶,读图结果:${factLine || '未知'}。\n`
            + (brief ? `客户补充需求:${brief}\n` : '')
            + `可选外盒风格:\n${menu}\n\n`
            + '返回 JSON:{"plan":"四段方案,每段两三句话,段间空一行:'
            + '①外盒结构建议(形式材质工艺及原因) ②视觉方向(呼应瓶身而不是盖过它) '
            + '③落地要点(印刷、模切、运输防护) ④打样前要客户确认的三个问题",'
            + '"picks":[风格序号,风格序号],"why":"选这两个风格的一句话理由",'
            /* render_prompt 是关键:客户的"品牌方向"必须由模型翻译成具体画面语言
               (材质、色彩、光线、氛围、版面),再交给出图模型。
               此前是把中文原话夹进固定英文模板,模板锁死了浅底/白盒,客户说什么都无效。 */
            + '"render_prompt":"给文生图模型的英文提示词,60-100 词:先写这支瓶子本身(形态材质颜色容量,必须与读图一致),'
            + '再把客户的品牌方向具体化成画面(外盒的材质与颜色、烫印或压纹等工艺、背景氛围与光线、整体气质),'
            + '若客户有明确要求(颜色/材质/风格/市场)必须体现,不要套用默认的白盒浅底;'
            + '结尾固定加 photorealistic product packaging render, sharp focus, no watermark"}',
        },
      ],
      { json: true, maxTokens: 2200, fleet, timeoutMs: 120000 },
    ).catch((err) => { planErr = err instanceof Error ? err.message : String(err); return null; });

    let plan = '', why = '', renderPrompt = '';
    let picks: { id: number; label: string }[] = [];
    try {
      const m = (out?.text ?? '').match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        plan = String(j.plan ?? '');
        why = String(j.why ?? '');
        renderPrompt = String(j.render_prompt ?? '').trim();
        picks = (j.picks ?? [])
          .map((n: number) => (lib as any[])[n - 1])
          .filter(Boolean)
          .map((x: any) => ({ id: x.id, label: x.alt_zh }));
      }
    } catch { /* 解析失败下面兜底 */ }
    /* 兜底:JSON 没解析出来就把原文当方案,风格退回前两个 —— 页面不留空 */
    if (!plan) plan = (out?.text ?? '').slice(0, 1800);
    if (!picks.length) picks = (lib as any[]).slice(0, 2).map((x) => ({ id: x.id, label: x.alt_zh }));

    const renders = picks.map((x) => `/media/${x.id}`);
    const renderLabels = picks.map((x) => x.label);

    /* ③ 定制出图下单 ────────────────────────────────────────────
       风格库给的是"最接近的现成款",客户真正想要的是**他那支瓶子**的定制外观。
       但 Agnes 的出图接口在边缘拦掉 Cloudflare Worker 的出口 IP(隔离实测 4ms 即 429/1015),
       而创始人本机直连正常 —— 所以这里只下单,真正出图由本机定时任务领走。
       客户先秒看到风格方向,定制图随后补上,两不耽误。 */
    let jobId: number | null = null;
    if (db) {
      /* 优先用模型按客户方向写的画面提示词;兜底模板也不再锁死背景与构图,
         只保留"要有外盒、要真实、不要水印"三条底线 */
      const fallback =
        `Cosmetic packaging render: a ${facts?.container ?? 'bottle'} in ${facts?.material ?? 'glass'}, `
        + `${(facts?.colors ?? []).join(' and ') || 'neutral'} tones, ${facts?.capacity ?? '30ml'} scale, `
        + 'with its outer carton designed to match. '
        + (brief ? `Brand direction: ${brief}. ` : '')
        + 'photorealistic product packaging render, sharp focus, no watermark.';
      const prompt = renderPrompt.length > 40 ? renderPrompt : fallback;
      /* 09-24 P1-2:出图单记下会员,进度与取图只回给本人(0127 加的列;没迁移时退回老写法,出图照常、只是只有员工能看) */
      const mid = (await getMember(request, env, db))?.id ?? null;
      const r = await db
        .prepare(`INSERT INTO pack_jobs (lang, fact_line, brief, prompt, member_id) VALUES (?,?,?,?,?) RETURNING id`)
        .bind(body.lang ?? 'zh-cn', factLine.slice(0, 300), brief, prompt, mid)
        .first<{ id: number }>()
        .catch(() => db.prepare(`INSERT INTO pack_jobs (lang, fact_line, brief, prompt) VALUES (?,?,?,?) RETURNING id`)
          .bind(body.lang ?? 'zh-cn', factLine.slice(0, 300), brief, prompt).first<{ id: number }>().catch(() => null));
      jobId = r?.id ?? null;
    }

    return json({
      ok: true,
      facts,
      factLine,
      plan,
      why,
      renders,
      provider: out?.model ?? seen?.model ?? '',
      /* 出图失败要说清楚,否则前端只能显示"没有图"而不知为何 */
      /* 面向客户要说人话:「[fleet] 出图失败 429」是给我们看的,不是给采购看的。
         Agnes 对出图这个贵接口做了边缘限流,而 Worker 的出口 IP 是共享的,
         高峰期容易撞上 —— 这不是客户做错了什么,得说清楚并给出路。 */
      renderLabels,
      jobId,
      renderPrompt: (renderPrompt || '').slice(0, 400),
      renderNote: renders.length ? '' : '风格库暂未就绪',
      planNote: plan ? '' : (planErr || '方案生成失败,请重试'),
      visionNote: factLine ? '' : (visionErr || '读图没有返回内容'),
    });
  } catch (e) {
    return json({ ok: false, msg: `分析失败:${e instanceof Error ? e.message.slice(0, 120) : ''}` }, 500);
  }
};
