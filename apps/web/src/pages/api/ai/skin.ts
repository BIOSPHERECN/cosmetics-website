/**
 * AI 肌肤检测 —— 拍一张照片,给出护肤选品建议。
 *
 * 两条红线焊进代码,不是写在文档里靠人记:
 *
 *  ① **不是诊疗**。护肤品不是药,一旦输出「你有痤疮/皮炎/玫瑰痤疮」这类词,
 *     性质就从「选品参阅」变成「诊断」—— 那是执业行为,没有资质就是违法,
 *     而且一旦客户据此延误就医,责任在我们。所以:
 *       · 系统提示里明令禁止病名与诊断句式;
 *       · 输出后再做一次关键词兜底过滤(模型不总是听话);
 *       · 主语永远是配方与成分,不是「你」。
 *
 *  ② **不留存人脸**。人脸在《个人信息保护法》里是敏感个人信息,
 *     存了就要承担加密、留存期限、删除响应的全套义务,而业务上并不需要那张脸 ——
 *     我们要的是结论。所以照片只在内存里过一遍,库里只落结构化结果。
 *
 * 管线是 grounding-first:先看图取特征 → 从配方库检索候选 → 让模型只在候选里解释。
 * 不这么做,模型会推荐库里根本不存在的配方,客户一问「这个多少钱」就穿帮。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, vision, chat } from '../../../lib/fleet';

export const prerender = false;

/** 出现这些词就说明模型越界成诊断了,整条建议作废重来比放出去安全 */
const BANNED = [
  '痤疮', '粉刺病', '皮炎', '湿疹', '玫瑰痤疮', '酒渣鼻', '银屑病', '白癜风',
  '黄褐斑病', '毛囊炎', '真菌', '感染', '病变', '诊断', '确诊', '病症', '治疗',
  '药物', '处方', '就医', '疾病',
];

const FEATURE_SCHEMA = `{
  "usable": true 或 false,
  "reason": "usable 为 false 时说明原因(如未检测到面部、光线过暗、图像模糊)",
  "skin_type": "干性 / 中性 / 混合性 / 油性 其中之一",
  "observations": [{ "trait": "观察到的外观特征", "area": "部位", "degree": "轻微 / 中等 / 明显" }],
  "concerns": ["用护肤语汇描述的关注点,如 保湿不足、屏障脆弱、油光明显、肤色不匀、纹理粗糙"],
  "avoid": ["需要谨慎的成分方向,如 高浓度酸类、强清洁表活"]
}`;

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;

  try {
    const body = (await request.json()) as {
      image?: string; lang?: string; site?: string; consent?: boolean;
    };
    const { image, lang = 'zh-cn', site = 'beauty2oem', consent } = body;

    // 敏感个人信息必须单独同意,而且同意要能证明是这一次给的
    if (!consent) return json({ ok: false, msg: '需要先勾选同意,才能分析这张照片' }, 400);
    if (!image || !image.startsWith('data:image/')) {
      return json({ ok: false, msg: '没有收到有效的图片' }, 400);
    }
    // base64 比原始字节大约 1.37 倍;2.2MB 的 data URL 约合 1.6MB 原图
    if (image.length > 2_200_000) {
      return json({ ok: false, msg: '图片过大,请重新拍摄(前端会自动压缩,若仍失败请换一张)' }, 413);
    }

    const fleet = await loadFleet(db, env as any);
    if (!fleet.some((p) => p.vision)) {
      return json({
        ok: false,
        msg: '尚未配置具备读图能力的模型。请在后台「模型舰队」为一家支持视觉的供应商填上 API Key 并勾选「可读图」。',
      }, 503);
    }

    // ── 第一步:看图取特征 ────────────────────────────────
    const vr = await vision(
      env as any,
      image,
      `请观察这张面部照片的**外观特征**,按下面的 JSON 结构输出,只输出 JSON:\n${FEATURE_SCHEMA}`,
      {
        system:
          '你是化妆品配方顾问,不是医生。你的任务是描述皮肤的外观特征以便推荐护肤品。' +
          '严禁给出任何疾病名称、诊断、治疗或用药建议;' +
          '只使用护肤语汇(干燥、出油、毛孔明显、肤色不匀、纹理粗糙、泛红等)描述你看到的外观。' +
          '若图中没有清晰面部,把 usable 设为 false 并说明原因。',
        json: true,
        fleet,
      },
    );

    const feat = safeJson(vr.text);
    if (!feat) return json({ ok: false, msg: 'AI 返回格式异常,请重试' }, 502);
    if (feat.usable === false) {
      return json({ ok: false, msg: feat.reason || '这张照片看不清,请在明亮光线下正对镜头重拍' }, 422);
    }

    // ── 第二步:从配方库检索候选(grounding)────────────────
    // 关键:候选只能来自库里真实存在的配方。没有这一步,模型会编出不存在的配方号
    const concerns: string[] = Array.isArray(feat.concerns) ? feat.concerns.slice(0, 6) : [];
    const COLS = `id, code, category, format, benefits, actives_json, texture, moq, lead_days, markets`;

    let candidates: any[] = [];
    if (db) {
      // 命中数当排序依据:一条配方命中的关注点越多排越前。
      // 用 SUM(CASE…) 而不是把 WHERE 条件在 ORDER BY 里再抄一遍 ——
      // 抄一遍既要重复绑参、又容易和 WHERE 走岔,是很典型的对不上的写法。
      const score = concerns.length
        ? concerns.map(() => `(CASE WHEN (benefits LIKE ? OR texture LIKE ? OR IFNULL(ai_summary,'') LIKE ?) THEN 1 ELSE 0 END)`).join(' + ')
        : '0';
      const binds = concerns.flatMap((c) => [`%${c}%`, `%${c}%`, `%${c}%`]);
      const { results } = await db.prepare(
        `SELECT ${COLS}, (${score}) AS hits
           FROM formulas WHERE status='active'
          ORDER BY hits DESC, IFNULL(moq, 999999) ASC LIMIT 8`
      ).bind(...binds).all<any>();
      // 一条都没命中时也给候选:总比空手强,但让模型知道匹配度低
      candidates = (results ?? []).filter((f: any) => f.hits > 0);
      if (!candidates.length) candidates = (results ?? []).slice(0, 5);
    }

    if (!candidates.length) {
      return json({
        ok: false,
        msg: '配方库里还没有可用配方,无法给出选品建议。请先在后台导入真实配方。',
        features: feat,
      }, 503);
    }

    // ── 第三步:只在候选里解释 ────────────────────────────
    const catalog = candidates.map((f) => {
      const a = safeJson(f.actives_json) ?? [];
      const acts = Array.isArray(a) ? a.map((x: any) => `${x.name}${x.pct ? ' ' + x.pct : ''}`).join('、') : '';
      return `- ${f.code}(${f.category}/${f.format});功效:${f.benefits};活性物:${acts};肤感:${f.texture ?? '未标注'};起订 ${f.moq ?? '面议'}`;
    }).join('\n');

    const cr = await chat(env as any, [
      {
        role: 'system',
        content:
          '你是化妆品受托制造企业的配方顾问,面向的是想做自有品牌的客户。' +
          '严禁任何疾病名称、诊断、治疗、用药或就医建议 —— 你推荐的是化妆品,不是药。' +
          '**只能从给定的配方清单里推荐**,不得虚构配方号或清单外的配方;' +
          '若清单里没有合适的,就直说没有合适的,不要硬凑。' +
          '主语用配方和成分,不要用「你的皮肤有…」这类判断句式。语言简洁、不夸大、不用绝对化用语。',
      },
      {
        role: 'user',
        content:
          `照片读出的外观特征:${JSON.stringify(feat)}\n\n` +
          `可选配方清单(只能从这里选):\n${catalog}\n\n` +
          `请输出:\n` +
          `1)一段不超过 120 字的肤况描述(描述外观,不下判断);\n` +
          `2)推荐 2-3 个配方,每个写明配方号、为什么适配这些外观特征、预期肤感;\n` +
          `3)一句选品提示(如需要避开的成分方向)。\n` +
          `用${lang === 'en' ? '英文' : '中文'}输出,不要用 Markdown 标题符号。`,
      },
    ], { fleet, maxTokens: 900, temperature: 0.4 });

    // 兜底过滤:模型不总是听话,越界了宁可不给建议
    const hit = BANNED.find((w) => cr.text.includes(w));
    if (hit) {
      return json({
        ok: false,
        msg: '本次生成的内容涉及诊疗表述,已拦截。请重试;如反复出现,请联系我们的配方顾问。',
      }, 422);
    }

    const matched = candidates.slice(0, 3).map((f) => ({ id: f.id, code: f.code }));

    // 只落结构化结果,照片不入库
    let sid: number | null = null;
    if (db) {
      const r = await db.prepare(
        `INSERT INTO skin_sessions (site_id, lang, features_json, matched_json, advice_text, provider, model, ms)
         VALUES (?,?,?,?,?,?,?,?) RETURNING id`
      ).bind(site, lang, JSON.stringify(feat), JSON.stringify(matched), cr.text,
             `${vr.provider}+${cr.provider}`, `${vr.model}+${cr.model}`, vr.ms + cr.ms)
        .first<{ id: number }>().catch(() => null);
      sid = r?.id ?? null;
    }

    return json({
      ok: true,
      id: sid,
      features: feat,
      advice: cr.text,
      formulas: candidates.slice(0, 3).map((f) => ({
        code: f.code, category: f.category, format: f.format,
        benefits: f.benefits, texture: f.texture, moq: f.moq, lead_days: f.lead_days,
      })),
      meta: { vision: `${vr.provider}/${vr.model}`, text: `${cr.provider}/${cr.model}`, ms: vr.ms + cr.ms },
      disclaimer: '本结果基于照片外观特征生成,仅供护肤品选型参阅,不构成任何医疗诊断或治疗建议。照片未被保存。',
    });
  } catch (e) {
    return json({ ok: false, msg: `分析失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};

function safeJson(s: string): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* 模型常包一层 ```json */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
