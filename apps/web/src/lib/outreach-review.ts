/**
 * 多 AI 赛马审核开发信(2026-10-08)。
 *
 * 由来:outreach-build.py 用一个模型写开发信,创始人要求「多 AI 去开会审核,需要更有吸引力的开发信」。
 * 这个模块不是让一个模型说了算 —— 让 3–5 个不同模型同时审核同一封草稿,各自打分 + 提改进版正文,
 * 取 score 最高的 rewrite 作为终稿;最高分 < 70 自动重写一轮再审。
 *
 * 审核维度(写在 system prompt 里,直接照搬 outreach-build.py 的 BAD 正则与红线规则):
 *   ① 开头是否提到对方具体产品 / 定位(不是空话)
 *   ② 是否有明确下一步动作(看一页 / 回一句)
 *   ③ 词数 ≤ 95
 *   ④ 无红线词(MOQ / price / small batch / professional / high-quality / lead time …)
 *   ⑤ 数字只准 "5-14 days"
 *   ⑥ 落款格式正确(BIOSPHERE · … · sales@biosphere-ai.com + 退订行)
 *   ⑦ 语气是否自然(不机器味)
 *   ⑧ 对方看了会不会回(吸引力)
 *
 * 调用方式:reviewOutreach(env, db, draft, prospect) → { finalBody, scores, consensus }
 * 调 fleet.chat() 并行调多个模型;每个模型返回 JSON { score, strengths, weaknesses, rewrite }。
 */
import { chat, loadFleet, type Provider, type FleetEnv } from './fleet';

/** 一条 prospect 的最小信息(给审核模型看,不含收件人姓名 —— 拍板默认 #22) */
export interface ReviewProspect {
  brand: string;
  website?: string | null;
  country?: string | null;
  market?: string | null;
  positioning?: string | null;
  hook?: string | null;
  categories?: string | null;
}

/** 单个模型的审核结果 */
export interface ModelReview {
  score: number;          // 0–100
  strengths: string[];
  weaknesses: string[];
  rewrite: string;        // 改进版正文(不含落款 / 退订行)
}

/** 返回里的评分行 */
export interface ScoreRow {
  model: string;          // provider id
  score: number;
  note: string;           // weaknesses 的第一句,或 strengths 摘要
}

/** reviewOutreach 返回值 */
export interface ReviewResult {
  finalBody: string;      // 终稿正文(取最高分 rewrite;不足 70 会再审一轮)
  scores: ScoreRow[];     // 每个模型的评分
  consensus: string;      // 共识摘要:多个模型一致指出的问题
}

/** ── 审核用 system prompt ──
 *  照搬 outreach-build.py 的 BAD 正则与红线规则,让模型按同一把尺子打分。 */
const REVIEW_SYSTEM = `你是一位资深外贸开发信审稿编辑。你在审核一封中国化妆品 OEM/ODM 工厂(广州,GMPC/ISO22716/HALAL)发给海外品牌方的英文开发信首封草稿。
严格按下面 8 个维度逐条检查,给出 0–100 的总分,并列出优点 / 缺点 / 改进版正文。

审核维度(逐条检查,任何一条不过都要扣分):
1. 开头是否提到对方的具体产品或定位 —— 必须是对方的事实句(对方做什么、卖什么、在哪个市场),不能是空话套话。
2. 是否有且仅有一个明确的下一步动作 —— 要么请对方回一句(哪个品类线会考虑外包),要么请对方看一页(/en/oem/<市场>/<品类>/);必须是问句结尾,且是正文的最后一句。
3. 词数 ≤ 95 词(只数正文,不含落款和退订行)。
4. 无红线词。命中以下任何一个就严重扣分:MOQ / minimum order / low MOQ / flexible MOQ / small batch / price / best price / lead time / USD / $ 数字 / 数字% / 数字 pcs|pieces|units / professional / high-quality / one-stop / synergy / leverage / "hope this email/message finds" / "just checking in" / 假 Re: / 假 Fwd: / 把我们说成对方国家的工厂(如 "Indonesian manufacturer")。
5. 数字只准出现 "5-14 days"(出样周期,工厂口径页唯一已填的数字)。任何其他天数 / 百分比 / 价格 / 数量都不允许。
6. 落款格式正确(系统会自动加,草稿里不该出现落款 —— 如果草稿里有落款,说明格式错)。
7. 语气自然,不机器味 —— 像一个真人业务员在写信,不像 AI 生成的模板。
8. 对方看了会不会回 —— 吸引力。如果读完不会想回,给低分。

改进版正文(rewrite 字段)的要求:
- 英文,≤ 95 词,只写正文,不写主题、不写落款、不写退订行(系统自动加)。
- 开头是对方的事实句(从 prospect 信息里取,不要编造)。
- 中间 1–2 句:我们能做什么(品类 + GMPC/ISO22716/HALAL + 产能 + 准时交付)。可提 1–2 个在库基底(如果有)。
- 最后一句:唯一的下一步动作,问句结尾。
- 不写 MOQ / 价格 / 交期 / 起订量 / 支付条款 / 电话 / 客户名 / 证书号。
- 不写 "hope this finds you well" / "just checking in" / 假 Re:/Fwd:。
- 对方的事实只用 prospect 信息里给的,不编造数字;不用 "recently / upcoming / soon / this year" 等相对时间词。

只输出 JSON,不要解释:
{"score": 0-100, "strengths": ["..."], "weaknesses": ["..."], "rewrite": "改进版正文(纯文本,≤95词,无落款)"}`;

/** 把草稿 + prospect 信息拼成给模型的 user message */
function buildUserMsg(draft: string, prospect: ReviewProspect): string {
  const p = prospect;
  const lines = [
    `【Prospect 信息】`,
    `品牌:${p.brand}`,
    p.website ? `官网:${p.website}` : null,
    p.country ? `国家:${p.country}` : null,
    p.market ? `市场:${p.market}` : null,
    p.positioning ? `定位:${p.positioning}` : null,
    p.hook ? `事实钩子:${p.hook}` : null,
    p.categories ? `品类:${p.categories}` : null,
    ``,
    `【待审核草稿正文】`,
    draft,
  ].filter((x) => x !== null);
  return lines.join('\n');
}

/** 安全解析模型返回的 JSON(模型有时会包 ```json 或前后带废话) */
function parseReview(text: string): ModelReview | null {
  const t = String(text ?? '').trim();
  // 找第一个 { 到最后一个 }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e < 0 || e <= s) return null;
  try {
    const j = JSON.parse(t.slice(s, e + 1));
    const score = Number(j.score);
    if (isNaN(score)) return null;
    return {
      score: Math.max(0, Math.min(100, score)),
      strengths: Array.isArray(j.strengths) ? j.strengths.map((x: any) => String(x)).slice(0, 10) : [],
      weaknesses: Array.isArray(j.weaknesses) ? j.weaknesses.map((x: any) => String(x)).slice(0, 10) : [],
      rewrite: String(j.rewrite ?? '').trim(),
    };
  } catch {
    return null;
  }
}

/** 从舰队里挑 3–5 个不同的文本模型做赛马(优先不同 provider,避免同家重复) */
function pickReviewers(fleet: Provider[], count: number): Provider[][] {
  const textFleet = fleet.filter((p) => p.text !== false);
  if (!textFleet.length) return [];
  // 按 provider id 去重(同一家只取一个,免费池优先)
  const seen = new Set<string>();
  const unique: Provider[] = [];
  for (const p of textFleet) {
    const fam = p.id.split('-')[0];
    if (seen.has(fam)) continue;
    seen.add(fam);
    unique.push(p);
  }
  const n = Math.min(count, unique.length);
  // 取前 n 家(tier 排序已在 loadFleet 里做过)
  return unique.slice(0, n).map((p) => [p]);
}

/** 并行调多个模型审核同一封草稿 */
async function reviewRound(
  env: FleetEnv,
  db: D1Database | undefined,
  reviewers: Provider[][],
  draft: string,
  prospect: ReviewProspect,
  promptKey: string,
): Promise<{ provider: string; review: ModelReview | null; raw: string; ms: number }[]> {
  const userMsg = buildUserMsg(draft, prospect);
  const fleet = reviewers.flatMap((r) => r);

  const promises = reviewers.map(async (rp) => {
    const t0 = Date.now();
    try {
      const r = await chat(
        env,
        [
          { role: 'system', content: REVIEW_SYSTEM },
          { role: 'user', content: userMsg },
        ],
        {
          fleet: rp,
          json: true,
          temperature: 0.4,
          maxTokens: 1500,
          timeoutMs: 30_000,
          db,
          promptKey,
          promptVersion: 1,
          entity: prospect.brand ? { type: 'outreach_review', id: prospect.brand } : undefined,
        },
      );
      const review = parseReview(r.text);
      return { provider: r.provider, review, raw: r.text, ms: Date.now() - t0 };
    } catch (e) {
      // 单个模型挂了不影响其他 —— 赛马的意义就是有备胎
      return { provider: rp[0]?.id ?? 'unknown', review: null, raw: String(e).slice(0, 200), ms: Date.now() - t0 };
    }
  });

  return Promise.all(promises);
}

/** 生成共识摘要:多个模型一致指出的 weakness */
function buildConsensus(reviews: { provider: string; review: ModelReview | null }[]): string {
  const valid = reviews.filter((r) => r.review);
  if (!valid.length) return '所有模型审核失败,无法形成共识';
  if (valid.length === 1) {
    const r = valid[0].review!;
    return r.weaknesses.length ? `主要问题:${r.weaknesses.join('; ')}` : '无明显问题';
  }
  // 统计 weakness 关键词出现次数:同一个问题被多个模型指出 = 共识
  const kwMap = new Map<string, { count: number; example: string }>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  for (const { review } of valid) {
    for (const w of review!.weaknesses) {
      const k = norm(w);
      if (!k) continue;
      const ex = kwMap.get(k);
      if (ex) ex.count++;
      else kwMap.set(k, { count: 1, example: w });
    }
  }
  const consensus = [...kwMap.entries()]
    .filter(([, v]) => v.count >= 2)   // ≥ 2 个模型指出
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([, v]) => v.example);
  if (!consensus.length) {
    const avg = valid.reduce((s, r) => s + r.review!.score, 0) / valid.length;
    return `平均分 ${avg.toFixed(0)},模型间无明显一致问题`;
  }
  return `共识问题(多模型一致):${consensus.join('; ')}`;
}

/**
 * 多 AI 赛马审核一封开发信草稿。
 *
 * 流程:
 *   1. 并行调 3–5 个不同模型审核同一封草稿
 *   2. 每个模型输出 { score, strengths, weaknesses, rewrite }
 *   3. 取 score 最高的 rewrite 作为终稿
 *   4. 如果最高分 < 70,用最高分的 rewrite 重写一轮再审
 *   5. 记录每个模型评分到 D1(outreach_log 的 approved_hash 字段扩展存 JSON)
 *
 * @param env   Worker env(含 DB 和各家 key)
 * @param db    D1Database(落 ai_runs + 写评分到 outreach_log)
 * @param draft 待审核的草稿正文(不含落款 / 退订行)
 * @param prospect  目标 prospect 信息(不含收件人姓名)
 * @param outreachLogId  可选:outreach_log.id,用于回写评分 JSON
 */
export async function reviewOutreach(
  env: FleetEnv,
  db: D1Database | undefined,
  draft: string,
  prospect: ReviewProspect,
  outreachLogId?: number,
): Promise<ReviewResult> {
  const fleet = await loadFleet(db, env);
  const reviewers = pickReviewers(fleet, 5);

  if (!reviewers.length) {
    // 没有可用模型,原样返回(不抛错,让调用方决定怎么处理)
    return {
      finalBody: draft,
      scores: [],
      consensus: '没有可用的审核模型,跳过审核',
    };
  }

  // 第一轮审核
  let round = await reviewRound(env, db, reviewers, draft, prospect, 'outreach-review');
  let valid = round.filter((r) => r.review);

  if (!valid.length) {
    return {
      finalBody: draft,
      scores: round.map((r) => ({ model: r.provider, score: 0, note: '审核失败' })),
      consensus: '所有模型审核失败',
    };
  }

  // 取最高分
  let best = valid.reduce((a, b) => (b.review!.score > a.review!.score ? b : a));
  let bestBody = best.review!.rewrite || draft;

  // 最高分 < 70:用 best rewrite 重写一轮再审
  if (best.review!.score < 70 && best.review!.rewrite) {
    const round2 = await reviewRound(env, db, reviewers, best.review!.rewrite, prospect, 'outreach-review-r2');
    const valid2 = round2.filter((r) => r.review);
    if (valid2.length) {
      const best2 = valid2.reduce((a, b) => (b.review!.score > a.review!.score ? b : a));
      // 第二轮最高分更高才用第二轮结果
      if (best2.review!.score > best.review!.score) {
        best = best2;
        bestBody = best2.review!.rewrite || bestBody;
      }
      // 合并两轮评分(第二轮覆盖第一轮同模型)
      const r2Map = new Map(round2.map((r) => [r.provider, r]));
      round = round.map((r) => r2Map.get(r.provider) ?? r);
      valid = round.filter((r) => r.review);
    }
  }

  const scores: ScoreRow[] = round.map((r) => ({
    model: r.provider,
    score: r.review?.score ?? 0,
    note: r.review
      ? (r.review.weaknesses[0] ?? (r.review.strengths[0] ?? `score ${r.review.score}`))
      : '审核失败',
  }));

  const consensus = buildConsensus(valid);

  // 记录评分 JSON 到 outreach_log(approved_hash 字段扩展存 JSON)
  if (db && outreachLogId) {
    try {
      const reviewJson = JSON.stringify({
        reviewed_at: new Date().toISOString(),
        scores: scores.map((s) => ({ model: s.model, score: s.score })),
        top_score: best.review!.score,
        consensus: consensus.slice(0, 500),
        rounds: best.review!.score < 70 ? 2 : 1,
      });
      // approved_hash 原存 sha256 审批快照;这里扩展为 JSON 字符串(以 { 开头区分)
      // 调用方在审批时仍会用 draftHash 重新算 sha256 覆盖;这里只是把审核过程留痕
      await db.prepare(
        `UPDATE outreach_log SET approved_hash = ? WHERE id = ? AND approved_hash IS NULL`,
      ).bind(reviewJson, outreachLogId).run();
    } catch {
      // 记录失败不影响审核结果
    }
  }

  return {
    finalBody: bestBody,
    scores,
    consensus,
  };
}
