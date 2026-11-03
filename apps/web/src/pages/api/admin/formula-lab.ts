import { judge } from '../../../lib/jev';
import { redact } from '../../../lib/mail';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision, requireLab, LAB_ROLES, type Ctx } from '../../../lib/guard';
import { chat, vision, loadFleet, type ChatResult } from '../../../lib/fleet';
import {
  MARKET_ZH, COST_BAND_ZH, LAB_SIDES, splitList, safeJson, parseConstraints, nextProjectCode, resolveSide, loadContext, loadIngredients,
  buildMessages, promptHash, parseJson, gate, toRecipe, rateMaterials, priceMaterials, esgCheck, formatToForm, marketsToCodes, type CostSummary,
  convene, roster, buildGatewayMessages, gateGateway, buildExpertMessages, normExpert, buildSynthesisExtra, EXPERT_BUDGET,
  buildBriefMessages, normBrief, buildReviewMessages, normReview, renderVersion,
  OCR_PROMPT, normOcrRecipe, nextImportCode,
  type Step, type Stage, type RunStep, type Side, type ProjectRow, type RunRow, type VersionRow, type RecipeRow, type GenerateOut, type RecommendOut, type GateJson, type GateCtx, type SideProvider,
  type ExpertRow, type ExpertOut, type GatewayOut, type GatewayMeta, type Constraints, type OcrMode, type OcrRow, canCost, stripCost } from '../../../lib/formula-lab';

import { factKey } from '../../../lib/decoder';   // lab_materials.inci_key 与 ingredient_facts 同口径(任务 M)

export const prerender = false;
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');   // 原料库 op 的占位符;SQL 一律参数绑定

/* 配方实验室 v0 的全部写操作(2026-09-17 创始人:「功能上强大,使用上要简单」)。op 式单 POST,照 packsource.ts。
   三层闸门里这里是第二层(操作层):apiGuard 已按 cap 放行,这里先统一 requireLab(任一实验室角色),再每个 op 第一行收紧 ——
   漏写一个 op 就是整表可写,所以每个 op 函数第一行必须是 requireLab,不许挪到别处。
   第三层(字段脱敏)在 lib/formula-lab.ts 的 redact,本文件返回体一律不带 output / recipe(页面 reload 后 SSR 经 redact 渲染),
   所以这里没有脱敏代码 —— 不是漏了,是接口根本不吐内容。 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = requireLab(c, ...LAB_ROLES); if (deny) return deny;        // 先统一拦,再各 op 收紧
  const b = (await request.json().catch(() => ({}))) as any;
  try {
    switch (b.op) {
      case 'create':    return await opCreate(c, b);
      case 'brief':     return await opBrief(c, b);         // 对话入口:一句话 → 需求单 → 建项目(缺品类 / 剂型只追问一句)
      case 'recommend': return await opRun(c, b, 'recommend');
      case 'generate':  return await opRun(c, b, 'generate');
      case 'retry':     return await opRetry(c, b);
      case 'gateway':    return await opGateway(c, b);     // v0.1 会诊:总控拆题 + 定席
      case 'expert':     return await opExpert(c, b);      //         逐位专家审核(页面串行 / 并发调)
      case 'synthesize': return await opSynthesize(c, b);  //         汇总成一栏(与 recommend / generate 同款行)
      case 'review':     return await opReview(c, b);      //         李总工点评两版(side J,step='review')
      case 'adopt':     return await opAdopt(c, b);
      case 'edit':      return await opEdit(c, b);
      case 'esg':       return await opEsg(c, b);           // 版本表 ESG 四支柱核查 → esg_json(创始人 09-18;任务 G)
      case 'feedback':  return await opFeedback(c, b);
      case 'ocr':            return await opOcr(c, b);            // 拍照 → 文字 / 配方表(任一实验室角色)
      case 'import_formula': return await opImportFormula(c, b);  // 确认后的配方表 → formulas + formula_recipes
      case 'materials':       return await opMaterials(c, b);       // 原料库(创始人 09-18「多选原料和价格」):读 任一实验室角色
      case 'material_save':   return await opMaterialSave(c, b);    //   写 chief / formulator / boss;purchasing / finance 只改价 / 供应商 / 交期 / 备注
      case 'material_import': return await opMaterialImport(c, b);  //   批量 upsert ≤500 行
      case 'material_delete': return await opMaterialDelete(c, b);  //   status='off',不物理删
      case 'material_confirm': return await opMaterialConfirm(c, b); //   采购确认 / 财务确认(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」)
      default:          return json({ ok: false, msg: '未知操作' }, 400);
    }
  } catch (e) {
    return json({ ok: false, msg: `失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};
/** 原料选择框用 GET 搜(创始人 09-17「使用上要简单」):?q=&limit= 只走 materials 一个 op */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const deny = requireLab(c, ...LAB_ROLES); if (deny) return deny;
  const u = new URL(request.url);
  return await opMaterials(c, { q: u.searchParams.get('q') ?? '', limit: u.searchParams.get('limit') ?? 20, status: u.searchParams.get('status') ?? 'active' });
};

/* ── 小工具 ─────────────────────────────────────────────────────────────────── */
const str = (v: unknown, max = 2000): string => String(v ?? '').trim().slice(0, max);
/** 数字字段:空串 / null / undefined → null;非有限数 → NaN(调用方据此报错) */
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const isUnique = (e: unknown) => /UNIQUE/i.test(e instanceof Error ? e.message : String(e));
/** 走过 UNIQUE 撞车重试一次的 batch:版本号 / 项目号都是「先算 MAX 再插」,并发时会撞,重试一次足够(v0 没有第二个人同时点) */
async function batchOnce(c: Ctx, mk: () => D1PreparedStatement[]): Promise<D1Result[]> {
  try { return await c.db.batch(mk()); }
  catch (e) { if (!isUnique(e)) throw e; return await c.db.batch(mk()); }
}
const noModel = (side: Side) => `${LAB_SIDES[side].persona}没有可用模型,请到「模型舰队」给 ${[LAB_SIDES[side].id, LAB_SIDES[side].alt, LAB_SIDES[side].fallback].filter(Boolean).join(' / ')} 行填 key`;
/** 基底只认 formulas 里真有的编号(opRun / opGateway 共用):模型拿到的「基底」若是假编号,整栏草案都会围着一个不存在的配方讲。recommend 不要基底 */
async function checkBases(c: Ctx, step: Step, raw: unknown): Promise<string[] | Response> {
  if (step !== 'generate') return [];
  const base_codes = [...new Set((Array.isArray(raw) ? raw : []).map((x: unknown) => str(x, 40)).filter(Boolean))].slice(0, 3) as string[];
  if (!base_codes.length) return json({ ok: false, msg: '生成配方要先勾 1–3 个基底' }, 400);   // 6.2:没基底模型会自由发挥
  const found = (await c.db.prepare(`SELECT code FROM formulas WHERE code IN (${base_codes.map(() => '?').join(',')})`).bind(...base_codes).all<{ code: string }>()).results ?? [];
  const have = new Set(found.map((r) => r.code));
  const miss = base_codes.filter((x) => !have.has(x));
  if (miss.length) return json({ ok: false, msg: `基底编号不存在:${miss.join(', ')}` }, 400);
  return base_codes;
}
/** 同 (project, step, round, side[, experts]) 的 MAX(attempt)+1:重试 / 重跑不与前一行同号。experts 只在专家行传(同一轮每位专家各自计数) */
async function nextAttempt(c: Ctx, project_id: number, step: RunStep, round: number, side: Side, experts = ''): Promise<number> {
  const r = await c.db.prepare(`SELECT COALESCE(MAX(attempt),0) n FROM formula_runs WHERE project_id=? AND step=? AND round=? AND side=? AND (?='' OR experts=?)`)
    .bind(project_id, step, round, side, experts, experts).first<{ n: number }>();
  return (r?.n ?? 0) + 1;
}

/* ── create:填需求单(动作①)───────────────────────────────────────────── */
async function opCreate(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const category = str(b.category, 40), format = str(b.format, 40);
  if (!category || !format) return json({ ok: false, msg: '品类与剂型必填' }, 400);
  // 市场只认 regulations.id 里的六项;一个都不认得就落 cn —— 需求单没有市场,法规块就没法装
  const markets = splitList(b.markets).filter((m) => m in MARKET_ZH);
  const cost_band = str(b.cost_band, 10);
  if (cost_band && !(cost_band in COST_BAND_ZH)) return json({ ok: false, msg: '成本档只能是 low / mid / high' }, 400);
  // 硬约束只收白名单键:constraints_json 会原样进提示词,不让前端塞任意字段。
  // 对象(constraints)与串(constraints_json)两种都认 —— 页面曾发串、接口只读对象,清真/无香/pH 全部静默丢过一次
  const k = (b.constraints && typeof b.constraints === 'object' ? b.constraints : safeJson<Record<string, unknown>>(b.constraints_json, {})) as Record<string, unknown>;
  const constraints = {
    halal: !!k.halal, vegan: !!k.vegan, fragrance_free: !!k.fragrance_free, no_mit_cmit: !!k.no_mit_cmit, preservative_free: !!k.preservative_free,
    ph_low: num(k.ph_low), ph_high: num(k.ph_high), other: str(k.other, 500),
  };
  if (Number.isNaN(constraints.ph_low) || Number.isNaN(constraints.ph_high)) return json({ ok: false, msg: 'pH 要填数字' }, 400);

  const r = await createProject(c, { customer: str(b.customer, 200) || null, category, format, claims: str(b.claims, 500), markets, constraints, cost_band: cost_band || null, brief: str(b.brief, 4000) || null });
  return r instanceof Response ? r : json({ ok: true, ...r });
}

/** 建项目的插入逻辑(opCreate 表单 / opBrief 对话共用):编号 MAX+1 + UNIQUE 撞车重算一次 + 只记元数据的 revisions */
type NewProject = { customer: string | null; category: string; format: string; claims: string; markets: string[]; constraints: Constraints; cost_band: string | null; brief: string | null };
async function createProject(c: Ctx, p: NewProject): Promise<{ id: number; code: string } | Response> {
  const insert = (code: string) => c.db.prepare(
    `INSERT INTO formula_projects (code, customer, category, format, claims, markets, constraints_json, cost_band, brief, owner_uid)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  ).bind(code, p.customer, p.category, p.format, p.claims, p.markets.length ? p.markets.join(',') : 'cn',
    JSON.stringify(p.constraints), p.cost_band, p.brief, c.sess.uid).first<{ id: number }>();

  // 编号 MAX+1 不在事务里,两人同时建单会撞 UNIQUE:重算一次再插,再撞就让人重点(2.3 已定 8)
  let code = await nextProjectCode(c.db);
  let row: { id: number } | null;
  try { row = await insert(code); }
  catch (e) {
    if (!isUnique(e)) throw e;
    code = await nextProjectCode(c.db);
    try { row = await insert(code); } catch (e2) { if (isUnique(e2)) return json({ ok: false, msg: '编号冲突,请重试' }, 409); throw e2; }
  }
  const id = row!.id;
  await logRevision(c.db, 'formula_projects', id, null, null, { action: 'create', code, category: p.category, format: p.format, markets: p.markets.join(',') }, c.sess.uid);
  return { id, code };
}

/* ── brief:对话入口(动作①的替代:「说说要做什么」)──────────────────────
   请求 {text, project_id?}。无 project_id:刘总工的模型(json,1500 tokens)从 text 提需求单;品类或剂型判不出 → {ok:true, ask, draft} 不建项目,
   页面把追问显示为系统气泡、下一句与本句拼起来再发;齐了 → createProject → {ok:true, id, code, brief}。
   有 project_id:把 text 追加到 projects.brief(后续需求),返回 {ok:true, id}。提取本身不落 formula_runs(没有项目挂不了),只在建成后 revisions 记 action:'brief'。 */
async function opBrief(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const text = str(b.text, 4000);
  if (!text) return json({ ok: false, msg: '先说说要做什么' }, 400);
  const project_id = Number(b.project_id) || 0;
  if (project_id) {
    const p = await c.db.prepare(`SELECT id, brief FROM formula_projects WHERE id=?`).bind(project_id).first<{ id: number; brief: string | null }>();
    if (!p) return json({ ok: false, msg: '需求单不存在' }, 404);
    const brief = [p.brief, text].filter(Boolean).join('\n').slice(-4000);   // 超长保留最新的一段;原话在 revisions 不留(只记元数据)
    await c.db.prepare(`UPDATE formula_projects SET brief=?, updated_at=datetime('now') WHERE id=?`).bind(brief, project_id).run();
    await logRevision(c.db, 'formula_projects', project_id, null, null, { action: 'brief_append', chars: text.length }, c.sess.uid);
    return json({ ok: true, id: project_id });
  }

  // 品类 / 剂型只认 formulas 里真有的码(与 candidates() 同一状态筛),模型对不上就 null → 追问
  const [cq, fq] = await c.db.batch([
    c.db.prepare(`SELECT category k FROM formulas WHERE status IN ('sample','active') GROUP BY category ORDER BY COUNT(*) DESC`),
    c.db.prepare(`SELECT format k FROM formulas WHERE status IN ('sample','active') GROUP BY format ORDER BY COUNT(*) DESC`),
  ]);
  const cats = ((cq.results ?? []) as { k: string }[]).map((r) => r.k).filter(Boolean);
  const fmts = ((fq.results ?? []) as { k: string }[]).map((r) => r.k).filter(Boolean);
  if (!cats.length || !fmts.length) return json({ ok: false, msg: '配方库为空,无法提取需求单' }, 500);

  const sp = await resolveSide(c.db, 'L');
  if (!sp) return json({ ok: false, msg: noModel('L') }, 503);
  const r = await chat(env as any, buildBriefMessages(text, cats, fmts), { fleet: [sp.p], json: true, temperature: 0.1, maxTokens: 1500, timeoutMs: 60_000 });
  const parsed = parseJson(r.text);
  if (!parsed) return json({ ok: false, msg: '没听清,请换个说法再说一遍' });
  const d = normBrief(parsed, text, cats, fmts);
  if (!d.category || !d.format) return json({ ok: true, ask: d.ask, draft: d });
  const created = await createProject(c, { customer: d.customer, category: d.category, format: d.format, claims: d.claims, markets: d.markets, constraints: d.constraints, cost_band: d.cost_band, brief: d.brief });
  if (created instanceof Response) return created;
  await logRevision(c.db, 'formula_projects', created.id, null, null, { action: 'brief', provider_id: sp.p.id, is_free: sp.is_free, ms: r.ms }, c.sess.uid);
  return json({ ok: true, ...created, brief: d });
}

/* ── recommend / generate:跑一栏 ───────────────────────────────────────── */
async function opRun(c: Ctx, b: any, step: Step) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const project_id = Number(b.project_id);
  const side = b.side as Side;
  const round = Math.max(1, Math.floor(Number(b.round) || 1));
  if (!project_id || (side !== 'L' && side !== 'R')) return json({ ok: false, msg: '缺少 project_id 或 side(L/R)' }, 400);
  const project = await c.db.prepare(`SELECT * FROM formula_projects WHERE id=?`).bind(project_id).first<ProjectRow>();
  if (!project) return json({ ok: false, msg: '需求单不存在' }, 404);

  const base_codes = await checkBases(c, step, b.base_codes);
  if (base_codes instanceof Response) return base_codes;

  const sp = await resolveSide(c.db, side);
  if (!sp) return json({ ok: false, msg: noModel(side) }, 503);

  const ctx = await loadContext(c.db, project, step, base_codes);
  const messages = buildMessages(step, ctx);
  const hash = await promptHash(messages);
  return runChat(c, {
    project_id, step, round, side, attempt: 1, sp, messages, hash,
    experts: ctx.meta.experts.join(','),
    input_json: JSON.stringify({ messages, meta: ctx.meta }),   // ingredients_all 149 行不进库,retry 时重新读
    g: ctx,
  });
}

/* ── retry:复用 input_json 原样重发一栏(任何时候可点)────────────────── */
async function opRetry(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const run = await c.db.prepare(`SELECT * FROM formula_runs WHERE id=?`).bind(Number(b.run_id) || 0).first<RunRow>();
  if (!run) return json({ ok: false, msg: '记录不存在' }, 404);
  const input = safeJson<{ messages?: { role: 'system' | 'user'; content: string }[]; meta?: GateCtx['meta'] } | null>(run.input_json, null);
  if (!input?.messages?.length || !input.meta) return json({ ok: false, msg: '这条记录没有完整提示词,无法重发' }, 400);
  const step = run.step as Step, side = run.side as Side;
  if (step !== 'recommend' && step !== 'generate') return json({ ok: false, msg: '网关行 / 专家行不走重试:重新提交会诊,或对该专家再点一次审核' }, 400);
  const sp = await resolveSide(c.db, side);
  if (!sp) return json({ ok: false, msg: noModel(side) }, 503);
  // attempt 取同栏同轮的 MAX+1 而不是 run.attempt+1:对同一条原始记录点两次「重试」,后者不该和前者同号
  return runChat(c, {
    project_id: run.project_id, step, round: run.round, side, attempt: await nextAttempt(c, run.project_id, step, run.round, side), sp,
    messages: input.messages, hash: run.prompt_hash ?? await promptHash(input.messages),
    experts: run.experts, input_json: run.input_json!, gateway_run_id: run.gateway_run_id ?? null,   // 汇总行重试仍挂在原网关下
    g: { meta: input.meta, ingredients_all: await loadIngredients(c.db) },
  });
}

/* 一次 chat → 一行 formula_runs(成败都留,5.6)。四种行(recommend / generate / gateway / expert)都从这里出生。
   先 INSERT 再 UPDATE 而不是算完一次写:chat() 超时 / 抛错时也要有行,页面才能显示 err 与「重试本栏」;
   解析与闸门失败同样落在这一行上,不自动重发(人点重试)。 */
type CallParams = {
  project_id: number; step: RunStep; round: number; side: Side; attempt: number; sp: SideProvider;
  messages: { role: 'system' | 'user'; content: string }[]; hash: string; experts: string; input_json: string;
  gateway_run_id?: number | null; maxTokens: number; timeoutMs: number;
};
/** 步骤 → ai_prompts.prompt_key;recommend / generate / synthesize 都是「合成一栏方案」,归 LAB-SYNTH */
const LAB_PROMPT_KEY: Record<string, string> = { gateway: 'LAB-GATEWAY', expert: 'LAB-EXPERT', review: 'LAB-REVIEW' };
/** 任务 C ③(2026-09-18 创始人「1 省算力」):同项目、同步骤、同 prompt_hash、ok=1 且 24 小时内的最近一行 → 复用 output_json 不打模型。
    只开 gateway / expert(汇总步两栏要出两版不同方案,不缓存)。命中仍插一行 formula_runs(tokens 为空、input_json 带 cached_from),
    下游 synthesize 按 gateway_run_id 找专家行、页面按 run_id 追踪,链路不用改;基线统计只算 tokens_in 非空的行,缓存行不混进去。 */
const CACHE_STEPS = new Set<RunStep>(['gateway', 'expert']);
async function cachedOutput(c: Ctx, p: CallParams): Promise<{ id: number; output_json: string; provider_id: string | null; model: string | null; is_free: number } | null> {
  if (!CACHE_STEPS.has(p.step)) return null;
  return c.db.prepare(
    `SELECT id, output_json, provider_id, model, is_free FROM formula_runs
     WHERE project_id=? AND step=? AND prompt_hash=? AND ok=1 AND output_json IS NOT NULL AND created_at > datetime('now','-1 day') ORDER BY id DESC LIMIT 1`,
  ).bind(p.project_id, p.step, p.hash).first();
}
async function callAndInsert(c: Ctx, p: CallParams) {
  const { sp } = p;
  const t0 = Date.now();
  let r: ChatResult | null = null, err: string | null = null;
  const hit = await cachedOutput(c, p);
  if (hit) {
    // output_json 是闸门 / 归一后的结果,再过一遍 gateGateway / normExpert 是幂等的;raw_text 截过 8000 字所以不用它
    const ins = await c.db.prepare(
      `INSERT INTO formula_runs (project_id, step, round, side, attempt, provider_id, model, is_free, experts, prompt_hash, input_json, raw_text, ok, err, ms, tokens_in, tokens_out, uid, gateway_run_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,0,NULL,0,NULL,NULL,?,?) RETURNING id`,
    ).bind(p.project_id, p.step, p.round, p.side, p.attempt, hit.provider_id, hit.model, hit.is_free, p.experts, p.hash,
      JSON.stringify({ ...safeJson<Record<string, unknown>>(p.input_json, {}), cached_from: hit.id }), c.sess.uid, p.gateway_run_id ?? null).first<{ id: number }>();
    const run_id = ins!.id;
    r = { text: hit.output_json, provider: hit.provider_id ?? '', model: hit.model ?? '', ms: 0 };
    return { run_id, r, err, base: { run_id, is_free: hit.is_free, label: sp.label, persona: sp.persona, model: hit.model, ms: 0, cached: true, cached_from: hit.id } };
  }
  try {
    // 治理层(2026-09-18):每次调用落 ai_runs,prompt_key 按步骤映射到 ai_prompts 的 LAB-* 四个 key,实体挂项目
    r = await chat(env as any, p.messages, { fleet: [sp.p], json: true, temperature: 0.2, maxTokens: p.maxTokens, timeoutMs: p.timeoutMs,
      promptKey: LAB_PROMPT_KEY[p.step] ?? 'LAB-SYNTH', entity: { type: 'formula_project', id: p.project_id }, inputHash: p.hash, db: c.db });
  } catch (e) {
    err = (e instanceof Error ? e.message : String(e)).slice(0, 1000);   // 整句留着:页面按「401 / 404 / model / 已判死」字样给提示(4.5)
  }
  const ms = r?.ms ?? Date.now() - t0;
  const ins = await c.db.prepare(
    `INSERT INTO formula_runs (project_id, step, round, side, attempt, provider_id, model, is_free, experts, prompt_hash, input_json, raw_text, ok, err, ms, tokens_in, tokens_out, uid, gateway_run_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?) RETURNING id`,
  ).bind(p.project_id, p.step, p.round, p.side, p.attempt, sp.p.id, sp.p.model, sp.is_free, p.experts, p.hash, p.input_json,
    r ? r.text.slice(0, 8000) : null, err, ms, r?.usage?.in ?? null, r?.usage?.out ?? null, c.sess.uid, p.gateway_run_id ?? null).first<{ id: number }>();
  const run_id = ins!.id;
  return { run_id, r, err, base: { run_id, is_free: sp.is_free, label: sp.label, persona: sp.persona, model: sp.p.model, ms } };
}
/** 解析模型原文;失败把 err 写回该行并返回 null(调用方据此回「JSON 解析失败」) */
async function parseRun(c: Ctx, run_id: number, text: string): Promise<Record<string, any> | null> {
  const o = parseJson(text);
  if (!o) await c.db.prepare(`UPDATE formula_runs SET err='JSON 解析失败' WHERE id=?`).bind(run_id).run();
  return o;
}

/** recommend / generate(含会诊汇总)一栏:chat + INSERT + 解析 + 闸门 + UPDATE。extra 并进返回体(汇总步带 missing) */
async function runChat(c: Ctx, p: Omit<CallParams, 'maxTokens' | 'timeoutMs' | 'step'> & { step: Step; g: GateCtx; extra?: Record<string, unknown> }) {
  const { step } = p;
  /* 02:2x 实测:兜底两家都是推理模型,3000 被思考吃光返回空;思考已在 fleet.ts 按模型名关掉,
     这里的 max_tokens 只给正文 —— 推荐 5–10 张卡约 2–3k、草案含相表约 4–6k,各留一倍余量。 */
  const { run_id, r, err, base } = await callAndInsert(c, { ...p, maxTokens: step === 'recommend' ? 6000 : 10000, timeoutMs: step === 'recommend' ? 120_000 : 180_000 });
  if (!r) return json({ ok: false, ...base, ...p.extra, msg: err });
  const parsed = await parseRun(c, run_id, r.text);
  if (!parsed) return json({ ok: false, ...base, ...p.extra, msg: 'JSON 解析失败,可点「重试本栏」' });
  const g = await gate(c.db, step, parsed, p.g);
  await c.db.batch([
    c.db.prepare(`UPDATE formula_runs SET output_json=?, gate_json=?, ok=?, err=? WHERE id=?`)
      .bind(JSON.stringify(g.out), JSON.stringify(g.gate), g.ok ? 1 : 0, g.ok ? null : (g.msg ?? '推荐结果全部不在候选集内'), run_id),   // g.msg:全绿标不通过的逐项原因(任务 L)
    c.db.prepare(`UPDATE formula_projects SET updated_at=datetime('now') WHERE id=?`).bind(p.project_id),   // 列表页按 updated_at 排,跑过就浮上来
  ]);
  return json({ ok: g.ok, ...base, ...p.extra, gate: { red: g.gate.red.length, yellow: g.gate.yellow.length }, msg: g.ok ? undefined : `${g.msg ?? '推荐结果全部不在候选集内'},可点「重试本栏」` });
}

/* ── 会诊网关(v0.1,创始人 05:4x:「需求经过一个网关到达专家,再进行分解分析,而不是实验室工程师去选专家」)──
   三个 op 由页面串起来:gateway(一次)→ expert(每位一次,页面控并发)→ synthesize(L、R 各一次)。
   每一步都是一行 formula_runs;不写 revisions(formula_runs 就是留档)。 */

/** 读网关行 + 它的 meta / output;三处共用。未成功的网关行不许往下走 */
async function loadGateway(c: Ctx, id: unknown): Promise<{ run: RunRow; meta: GatewayMeta; out: GatewayOut } | Response> {
  const run = await c.db.prepare(`SELECT * FROM formula_runs WHERE id=? AND step='gateway'`).bind(Number(id) || 0).first<RunRow>();
  if (!run) return json({ ok: false, msg: '网关记录不存在' }, 404);
  const meta = safeJson<{ meta?: GatewayMeta } | null>(run.input_json, null)?.meta;
  const out = safeJson<GatewayOut | null>(run.output_json, null);
  if (!run.ok || !meta || !out) return json({ ok: false, msg: '网关拆解未成功,请重新提交会诊' }, 400);
  return { run, meta, out };
}

/* ── gateway:总控拆题 + 定席 ────────────────────────────────────────────── */
async function opGateway(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const stage = b.stage as Stage;
  if (stage !== 'recommend' && stage !== 'generate') return json({ ok: false, msg: 'stage 只能是 recommend / generate' }, 400);
  const round = Math.max(1, Math.floor(Number(b.round) || 1));
  const project = await c.db.prepare(`SELECT * FROM formula_projects WHERE id=?`).bind(Number(b.project_id) || 0).first<ProjectRow>();
  if (!project) return json({ ok: false, msg: '需求单不存在' }, 404);
  const base_codes = await checkBases(c, stage, b.base_codes);
  if (base_codes instanceof Response) return base_codes;
  // 网关走左栏模型;左栏没 key 才用右栏。专家行沿用网关的 side,汇总行才分左右
  let side: Side = 'L';
  let sp = await resolveSide(c.db, side);
  if (!sp) { side = 'R'; sp = await resolveSide(c.db, side); }
  if (!sp) return json({ ok: false, msg: '左右两栏都没有可用模型,请到「模型舰队」给 deepseek / dashscope(或商汤兜底两行)填 key' }, 503);

  const ctx = await loadContext(c.db, project, stage, base_codes, { lite: true });   // 网关只用候选 / 基底,不裁 → candidate_codes 是全集
  const r = await roster(c.db);
  if (!r.rows.length) return json({ ok: false, msg: '专家名册为空(expert_skills 未灌)' }, 500);
  const messages = buildGatewayMessages(ctx, r);
  const convened = convene(project, stage).slugs;
  const meta: GatewayMeta = { stage, base_codes: ctx.meta.base_codes, round, must: [], optional: [], convened, dropped: [], candidate_codes: ctx.meta.candidate_codes };
  const call = await callAndInsert(c, {
    project_id: project.id, step: 'gateway', round, side, attempt: await nextAttempt(c, project.id, 'gateway', round, side), sp,
    messages, hash: await promptHash(messages), experts: '', input_json: JSON.stringify({ messages, meta }),
    maxTokens: 4000, timeoutMs: 120_000,   // 拆解 + 名单约 1–2k 字,留一倍
  });
  if (!call.r) return json({ ok: false, ...call.base, msg: call.err });
  const parsed = await parseRun(c, call.run_id, call.r.text);
  if (!parsed) return json({ ok: false, ...call.base, msg: 'JSON 解析失败,可重新提交会诊' });

  const g = gateGateway(parsed, r.rows, convened);
  meta.must = g.out.must.map((s) => s.slug); meta.optional = g.out.optional.map((s) => s.slug); meta.dropped = g.dropped;
  /* Jev 影子(09-22 创始人「jev 要接入」第三处):同一份需求单让 Jev 从名册里挑「最该先召集的一位」+ 要不要第二位,
     与总控名单并排记进 meta.jev,不改席位。跑一阵子对照命中率,再决定让它做总控的第一道。 */
  try {
    const brief = String(messages[messages.length - 1]?.content ?? '').slice(0, 5000);
    const criteria: Record<string, string> = {}; for (const x of r.rows.slice(0, 250)) criteria[x.slug] = `${x.title}(${x.domain})`;
    const jr = await judge(env as any, redact(brief), { first: { type: 'choice', instructions: '按这份需求单,最该先召集哪位专家?', criteria }, needs_second: { type: 'noul', instructions: '这个问题需要第二位专家一起会诊吗?' } }, 6000);
    if (jr) (meta as any).jev = { first: jr.answers.first?.choice ?? '', conf: jr.answers.first?.confidence ?? null, needs_second: jr.answers.needs_second?.noul ?? null, ms: jr.ms, hit_must: meta.must.includes(String(jr.answers.first?.choice ?? '')) };
  } catch { /* 影子不影响会诊 */ }
  await c.db.batch([
    c.db.prepare(`UPDATE formula_runs SET output_json=?, input_json=?, experts=?, ok=1, err=NULL WHERE id=?`)
      .bind(JSON.stringify(g.out), JSON.stringify({ messages, meta, ...('cached_from' in call.base ? { cached_from: call.base.cached_from } : {}) }), meta.must.join(','), call.run_id),   // 缓存命中行保留 cached_from 标记(任务 C ③)
    c.db.prepare(`UPDATE formula_projects SET updated_at=datetime('now') WHERE id=?`).bind(project.id),
  ]);
  const by = new Map(r.rows.map((x) => [x.slug, x]));
  const seat = (s: { slug: string; question: string }) => ({ ...s, title: by.get(s.slug)?.title ?? s.slug, domain: by.get(s.slug)?.domain ?? '' });
  return json({ ok: true, ...call.base, sub_questions: g.out.analysis.sub_questions.length, must: g.out.must.map(seat), optional: g.out.optional.map(seat), jev: (meta as any).jev ?? null });
}

/* ── expert:一位专家审核(幂等:同网关同 slug 已有成功行就直接返回它)──── */
async function opExpert(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const slug = str(b.slug, 80);
  const gw = await loadGateway(c, b.gateway_run_id);
  if (gw instanceof Response) return gw;
  const seat = [...gw.out.must, ...gw.out.optional].find((s) => s.slug === slug);
  if (!seat) return json({ ok: false, msg: '该专家不在本次会诊名单里' }, 400);
  const e = await c.db.prepare(`SELECT slug,title,domain,core FROM expert_skills WHERE slug=?`).bind(slug).first<ExpertRow>();
  if (!e) return json({ ok: false, msg: `专家未入库:${slug}` }, 404);
  const prev = await c.db.prepare(`SELECT id, ms, is_free, output_json FROM formula_runs WHERE gateway_run_id=? AND step='expert' AND experts=? AND ok=1 ORDER BY id DESC LIMIT 1`)
    .bind(gw.run.id, slug).first<{ id: number; ms: number | null; is_free: number; output_json: string | null }>();
  if (prev) return json({ ok: true, run_id: prev.id, slug, title: e.title, stance: safeJson<ExpertOut | null>(prev.output_json, null)?.stance ?? '', ms: prev.ms, is_free: prev.is_free, cached: true });

  const project = await c.db.prepare(`SELECT * FROM formula_projects WHERE id=?`).bind(gw.run.project_id).first<ProjectRow>();
  if (!project) return json({ ok: false, msg: '需求单不存在' }, 404);
  const side = gw.run.side as Side;
  const sp = await resolveSide(c.db, side);   // 与网关同一侧 = 同一家模型
  if (!sp) return json({ ok: false, msg: noModel(side) }, 503);
  const ctx = await loadContext(c.db, project, gw.meta.stage, gw.meta.base_codes, { lite: true });   // 专家提示词有自己的 EXPERT_BUDGET,不用规则席位 core 与维基页
  const { messages, dropped } = buildExpertMessages(e, seat.question, ctx, gw.out);
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  const call = await callAndInsert(c, {
    project_id: project.id, step: 'expert', round: gw.run.round, side, attempt: await nextAttempt(c, project.id, 'expert', gw.run.round, side, slug), sp,
    messages, hash: await promptHash(messages), experts: slug, gateway_run_id: gw.run.id,
    input_json: JSON.stringify({ messages, meta: { stage: gw.meta.stage, base_codes: gw.meta.base_codes, round: gw.run.round, slug, question: seat.question, budget: { chars, limit: EXPERT_BUDGET, dropped } } }),
    maxTokens: 6000, timeoutMs: 180_000,   // 意见 + 数字表 + 建议原料约 2–3k
  });
  if (!call.r) return json({ ok: false, ...call.base, slug, msg: call.err });
  const parsed = await parseRun(c, call.run_id, call.r.text);
  if (!parsed) return json({ ok: false, ...call.base, slug, msg: 'JSON 解析失败,可点重试' });
  const out = normExpert(parsed, gw.meta.stage);
  await c.db.prepare(`UPDATE formula_runs SET output_json=?, ok=1, err=NULL WHERE id=?`).bind(JSON.stringify(out), call.run_id).run();
  return json({ ok: true, run_id: call.run_id, slug, title: e.title, stance: out.stance, ms: call.base.ms, is_free: call.base.is_free, ...('cached' in call.base ? { cached: true } : {}) });   // 同题 24h 内命中缓存时 cached:true(任务 C ③)
}

/** 某网关下的专家意见:每位取最新一条成功行;缺席 = must 里没有成功行(旁听缺席不算)。synthesize / review 共用 */
async function loadExperts(c: Ctx, gw: { run: RunRow; out: GatewayOut }) {
  const rows = (await c.db.prepare(`SELECT experts, output_json FROM formula_runs WHERE gateway_run_id=? AND step='expert' AND ok=1 ORDER BY id DESC`)
    .bind(gw.run.id).all<{ experts: string; output_json: string | null }>()).results ?? [];
  const bySlug = new Map<string, ExpertOut>();
  for (const r of rows) if (!bySlug.has(r.experts)) { const o = safeJson<ExpertOut | null>(r.output_json, null); if (o) bySlug.set(r.experts, o); }
  const seats = [...gw.out.must.map((s) => ({ ...s, must: true })), ...gw.out.optional.map((s) => ({ ...s, must: false }))];
  const t = new Map((await c.db.prepare(`SELECT slug,title,domain FROM expert_skills WHERE slug IN (${seats.map(() => '?').join(',')})`).bind(...seats.map((s) => s.slug))
    .all<{ slug: string; title: string; domain: string }>()).results?.map((x) => [x.slug, x]) ?? []);
  const experts = seats.filter((s) => bySlug.has(s.slug)).map((s) => ({ slug: s.slug, title: t.get(s.slug)?.title ?? s.slug, domain: t.get(s.slug)?.domain ?? '', must: s.must, out: bySlug.get(s.slug)! }));
  const missing = gw.out.must.map((s) => s.slug).filter((s) => !bySlug.has(s));
  return { experts, missing, missingTitles: missing.map((s) => t.get(s)?.title ?? s) };
}

/* ── synthesize:汇总成一栏(与 recommend / generate 同款行,带 gateway_run_id)── */
async function opSynthesize(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const side = b.side as Side;
  if (side !== 'L' && side !== 'R') return json({ ok: false, msg: '缺少 side(L/R)' }, 400);
  const gw = await loadGateway(c, b.gateway_run_id);
  if (gw instanceof Response) return gw;
  const project = await c.db.prepare(`SELECT * FROM formula_projects WHERE id=?`).bind(gw.run.project_id).first<ProjectRow>();
  if (!project) return json({ ok: false, msg: '需求单不存在' }, 404);
  const stage = gw.meta.stage;
  const { experts, missing, missingTitles } = await loadExperts(c, gw);
  if (!experts.length) return json({ ok: false, msg: '还没有任何专家意见,先跑专家审核' }, 400);

  const sp = await resolveSide(c.db, side);
  if (!sp) return json({ ok: false, msg: noModel(side) }, 503);
  const extra = buildSynthesisExtra(gw.out, experts, missingTitles);
  const ctx = await loadContext(c.db, project, stage, gw.meta.base_codes, { extra });   // 预算含会诊意见
  const messages = buildMessages(stage, ctx, extra);
  // 闸门按专家看到的候选全集判「候选外」(网关行 meta 里存的);老网关行没存就退回本次 ctx 的
  const candidate_codes = gw.meta.candidate_codes ?? ctx.meta.candidate_codes;
  return runChat(c, {
    project_id: project.id, step: stage, round: gw.run.round, side, attempt: await nextAttempt(c, project.id, stage, gw.run.round, side), sp,
    messages, hash: await promptHash(messages), experts: experts.map((e) => e.slug).join(','), gateway_run_id: gw.run.id,
    input_json: JSON.stringify({ messages, meta: { ...ctx.meta, candidate_codes, gateway_run_id: gw.run.id, missing } }),
    g: { ...ctx, meta: { ...ctx.meta, candidate_codes } }, extra: { missing },
  });
}

/* ── review:李总工点评两版(side='J',step='review',挂在同一网关下)──
   请求 {gateway_run_id};读该网关下 L / R 两条 ok=1 的汇总行(最新 attempt)+ 专家意见 → 独立审核者口径 → 一行 formula_runs。
   返回 {ok, run_id, recommendation, ms, is_free, persona};内容本身 reload 后经 redact 渲染(业务只见 summary + recommendation)。 */
async function opReview(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const gw = await loadGateway(c, b.gateway_run_id);
  if (gw instanceof Response) return gw;
  const project = await c.db.prepare(`SELECT * FROM formula_projects WHERE id=?`).bind(gw.run.project_id).first<ProjectRow>();
  if (!project) return json({ ok: false, msg: '需求单不存在' }, 404);
  const stage = gw.meta.stage;
  const latest = (side: Side) => c.db.prepare(`SELECT * FROM formula_runs WHERE gateway_run_id=? AND step=? AND side=? AND ok=1 ORDER BY attempt DESC, id DESC LIMIT 1`)
    .bind(gw.run.id, stage, side).first<RunRow>();
  const [L, R] = await Promise.all([latest('L'), latest('R')]);
  if (!L || !R) return json({ ok: false, msg: `${!L ? LAB_SIDES.L.persona : LAB_SIDES.R.persona}的方案还没出来,两版齐了才能点评` }, 400);
  const text = (r: RunRow) => renderVersion(stage, safeJson<RecommendOut | GenerateOut>(r.output_json, {} as any), safeJson<GateJson | null>(r.gate_json, null));

  const sp = await resolveSide(c.db, 'J');
  if (!sp) return json({ ok: false, msg: noModel('J') }, 503);
  const { experts, missingTitles } = await loadExperts(c, gw);
  const consult = experts.length ? buildSynthesisExtra(gw.out, experts, missingTitles).user : undefined;
  const messages = buildReviewMessages({ project, constraints: parseConstraints(project.constraints_json) }, stage, text(L), text(R), consult);
  const call = await callAndInsert(c, {
    project_id: project.id, step: 'review', round: gw.run.round, side: 'J', attempt: await nextAttempt(c, project.id, 'review', gw.run.round, 'J'), sp,
    messages, hash: await promptHash(messages), experts: experts.map((e) => e.slug).join(','), gateway_run_id: gw.run.id,
    input_json: JSON.stringify({ messages, meta: { stage, round: gw.run.round, gateway_run_id: gw.run.id, liu_run_id: L.id, huang_run_id: R.id, missing: missingTitles } }),
    maxTokens: 6000, timeoutMs: 180_000,   // 七项对比 + 合并方案约 2–3k
  });
  if (!call.r) return json({ ok: false, ...call.base, persona: sp.persona, msg: call.err });
  const parsed = await parseRun(c, call.run_id, call.r.text);
  if (!parsed) return json({ ok: false, ...call.base, persona: sp.persona, msg: 'JSON 解析失败,可再点一次点评' });
  const out = normReview(parsed);
  await c.db.batch([
    c.db.prepare(`UPDATE formula_runs SET output_json=?, ok=1, err=NULL WHERE id=?`).bind(JSON.stringify(out), call.run_id),
    c.db.prepare(`UPDATE formula_projects SET updated_at=datetime('now') WHERE id=?`).bind(project.id),
  ]);
  return json({ ok: true, run_id: call.run_id, recommendation: out.recommendation, ms: call.base.ms, is_free: call.base.is_free, persona: sp.persona });
}

/* ── adopt:把某栏草案采纳成 vN ─────────────────────────────────────────── */
/** 版本表的 gate_json 形状:红项已剔除,只留黄项 + 被剔的红项(含 unlisted)+ 三档计数;op:'edit' 再加 edited:1 */
type VersionGate = { yellow: GateJson['yellow']; dropped: GateJson['red']; tiers: GateJson['tiers']; side: string; edited?: 1; cost?: CostSummary };   // cost:版本成本汇总(任务 M;放 gate_json 因它每版重建,rationale_json 在 edit 时原样复制会过期)

async function opAdopt(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const run = await c.db.prepare(`SELECT * FROM formula_runs WHERE id=?`).bind(Number(b.run_id) || 0).first<RunRow>();
  if (!run) return json({ ok: false, msg: '记录不存在' }, 404);
  if (run.step !== 'generate' || !run.ok) return json({ ok: false, msg: '只能采纳成功的「生成」栏' }, 400);
  const out = safeJson<GenerateOut | null>(run.output_json, null);
  if (!out?.phases?.length) return json({ ok: false, msg: '这栏没有相表,无法采纳' }, 400);
  const gj = safeJson<GateJson>(run.gate_json, { red: [], yellow: [], dropped: [], tiers: { '①': 0, '②': 0, '③': 0 } });

  // 红项(库内未找到 / 禁用 / 清单外)剔除并列进 dropped(已定 10);黄项保留带 flag,黄牌要人签是备案步的事
  const { rows } = toRecipe(out, gj);
  if (!rows.length) return json({ ok: false, msg: '相表里的原料全是红项,没有可采纳的行;请先重试本栏' }, 400);
  const { summary: cost } = await priceMaterials(c.db, rows);   // 采纳即按原料库定价快照进行(创始人 09-18「多选原料和价格」);无价行不编
  const vg: VersionGate = { yellow: gj.yellow, dropped: gj.red, tiers: gj.tiers, side: run.side, cost };
  const rationale = {
    process: out.process ?? [], ph_window: out.ph_window ?? null, efficacy_logic: out.efficacy_logic ?? [], selling_points: out.selling_points ?? [],
    risks: out.risks ?? [], verify: out.verify ?? [], decisions_for_customer: out.decisions_for_customer ?? [],
  };
  const meta = safeJson<{ meta?: { base_codes?: string[] } } | null>(run.input_json, null)?.meta;
  const base_codes = (meta?.base_codes ?? []).join(',');

  // 版本号写成子查询:D1 batch 里前一句的结果绑不到后一句,「先查后绑」在 batch 外就有并发窗口(2.3)
  const res = await batchOnce(c, () => [
    c.db.prepare(
      `INSERT INTO formula_versions (project_id, version_no, parent_version_id, source_run_id, base_codes, recipe_json, rationale_json, gate_json, status, created_by)
       SELECT ?, COALESCE(MAX(version_no),0)+1, NULL, ?, ?, ?, ?, ?, 'draft', ? FROM formula_versions WHERE project_id=? RETURNING id, version_no`,
    ).bind(run.project_id, run.id, base_codes, JSON.stringify(rows), JSON.stringify(rationale), JSON.stringify(vg), c.sess.uid, run.project_id),
    c.db.prepare(`UPDATE formula_runs SET chosen=1 WHERE id=?`).bind(run.id),
    c.db.prepare(`UPDATE formula_projects SET status='sampling', updated_at=datetime('now') WHERE id=?`).bind(run.project_id),
  ]);
  const v = res[0].results[0] as { id: number; version_no: number };
  const esg = await saveEsg(c, v.id, run.project_id, rows);   // 采纳即算一次 ESG 并存(任务 G)
  // 只记元数据:revisions 给所有 admin 看,recipe_json / output_json 一个字都不能进去(3.4)
  await logRevision(c.db, 'formula_versions', v.id, null, null, { project_id: run.project_id, version_no: v.version_no, action: 'adopt', run_id: run.id }, c.sess.uid);
  return json({ ok: true, version_id: v.id, version_no: v.version_no, dropped: vg.dropped.length, esg });
}

/* ── edit:改比例 → 新版本(已定 3「看改比例」)───────────────────────── */
async function opEdit(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const old = await c.db.prepare(`SELECT * FROM formula_versions WHERE id=?`).bind(Number(b.version_id) || 0).first<VersionRow>();
  if (!old) return json({ ok: false, msg: '版本不存在' }, 404);
  const edits = Array.isArray(b.rows) ? b.rows as { seq?: string; pct?: unknown; pct_low?: unknown; pct_high?: unknown; drop?: boolean }[] : [];
  if (!edits.length) return json({ ok: false, msg: '没有改动' }, 400);

  // v0 只改已有行的三个数或删行,不加新原料 —— 加原料要过闸门(红黄 / 目录限量),放 v1
  const rows = safeJson<RecipeRow[]>(old.recipe_json, []);
  const bySeq = new Map(rows.map((r) => [r.seq, r]));
  const touchedInci = new Set<string>();   // 新加 / 改名的行,保存前对药监局目录核一遍(对不上只标黄,由总工负责)
  const dropSeq = new Set<string>();
  let changed = 0;
  for (const e of edits) {
    if (!e || typeof e !== 'object') return json({ ok: false, msg: 'rows 里每项要是对象' }, 400);
    const ea = e as any;
    if (ea.add) {   // 加行(创始人 12:5x:「需要修改的是成分和比例」):相字母 + 该相下一个序号
      const phase = str(ea.phase, 20) || 'A', letter = (phase.match(/[A-Za-z]/)?.[0] ?? 'A').toUpperCase();
      const n = rows.filter((x) => (x.seq || '').startsWith(letter + '-')).length + 1;
      const name = str(ea.name, 80), inci = str(ea.inci, 120).toUpperCase();
      if (!name && !inci) return json({ ok: false, msg: '新行要有原料名或 INCI' }, 400);
      const add: RecipeRow = { seq: `${letter}-${n}`, phase: rows.find((x) => (x.seq || '').startsWith(letter + '-'))?.phase ?? phase, name: name || inci, inci: inci || name,
        pct: num(ea.pct), pct_low: num(ea.pct_low), pct_high: num(ea.pct_high), purpose: str(ea.purpose, 80), tier: '③', source: 'manual', flag: 'yellow', catalog_no: null,
        material_id: Number.isFinite(Number(ea.material_id)) && Number(ea.material_id) > 0 ? Number(ea.material_id) : null } as RecipeRow;   // 从原料库选来的新行带 id(创始人 09-18)
      for (const v of [add.pct, add.pct_low, add.pct_high]) if (v !== null && !Number.isFinite(v)) return json({ ok: false, msg: `${add.seq} 的比例要填数字` }, 400);
      rows.push(add); bySeq.set(add.seq, add); touchedInci.add(add.seq); changed++; continue;
    }
    const seq = str(e.seq, 20);
    const r = bySeq.get(seq);
    if (!r) return json({ ok: false, msg: `未知行:${seq || '(空)'}` }, 400);
    if (e.drop) { dropSeq.add(seq); changed++; continue; }
    const ex = e as any;
    for (const k of ['name', 'inci', 'purpose'] as const) {
      if (typeof ex[k] === 'string' && str(ex[k], 120) !== ((r as any)[k] ?? '')) { (r as any)[k] = k === 'inci' ? str(ex[k], 120).toUpperCase() : str(ex[k], 120); if (k !== 'purpose') { r.flag = 'yellow'; r.source = 'manual'; touchedInci.add(seq); } if (k === 'inci') r.material_id = null; changed++; }   // 改了 INCI 就解绑原料,保存时按新 inci_key 重取价
    }
    if ('material_id' in ex) { const mid = num(ex.material_id); if (mid !== null && !Number.isFinite(mid)) return json({ ok: false, msg: `${seq} 的原料 id 要是数字` }, 400); if ((r.material_id ?? null) !== mid) { r.material_id = mid; changed++; } }   // 多选原料(创始人 09-18):页面选中某供应商牌号就把 id 传上来
    const next = { pct: 'pct' in e ? num(e.pct) : r.pct, pct_low: 'pct_low' in e ? num(e.pct_low) : r.pct_low, pct_high: 'pct_high' in e ? num(e.pct_high) : r.pct_high };
    for (const v of Object.values(next)) if (v !== null && !Number.isFinite(v)) return json({ ok: false, msg: `${seq} 的比例要填数字` }, 400);
    // 0 ≤ low ≤ pct ≤ high ≤ 100,pct 可空;区间可空(模型没给时就是 null)
    const lo = next.pct_low ?? 0, hi = next.pct_high ?? 100;
    if (lo < 0 || hi > 100 || lo > hi || (next.pct !== null && (next.pct < lo || next.pct > hi)))
      return json({ ok: false, msg: `${seq} 的比例不合规:要满足 0 ≤ 下限 ≤ 定值 ≤ 上限 ≤ 100` }, 400);
    if (next.pct !== r.pct || next.pct_low !== r.pct_low || next.pct_high !== r.pct_high) { Object.assign(r, next); changed++; }
  }
  if (!changed) return json({ ok: false, msg: '没有改动' }, 400);
  const kept = rows.filter((r) => !dropSeq.has(r.seq));
  if (!kept.length) return json({ ok: false, msg: '不能把所有行都删掉' }, 400);
  // 创始人 2026-09-17 12:1x:「完整比例必须总和是 100%」—— 一旦有行填了定值,所有保留行都要填,且 Σpct = 100(±0.01);服务端兜底,不信前端
  const withPct = kept.filter((r) => r.pct !== null && r.pct !== undefined);
  if (withPct.length) {
    if (withPct.length < kept.length) return json({ ok: false, msg: `还有 ${kept.length - withPct.length} 行没填完整比例;填齐后合计要等于 100%` }, 400);
    const total = withPct.reduce((a, r) => a + Number(r.pct), 0);
    if (Math.abs(total - 100) > 0.01) return json({ ok: false, msg: `完整比例合计 ${total.toFixed(2)}%,必须等于 100%` }, 400);
  }
  await rateMaterials(c.db, kept);   // 改了成分就重算绿标等级(总工 09-17「按照美丽修行那种标准确认」),与 gate 同一查询
  const { summary: cost } = await priceMaterials(c.db, kept);   // 保存版本前按原料库重新取价快照(创始人 09-18「多选原料和价格」)
  const vg = { ...safeJson<Partial<VersionGate>>(old.gate_json, {}), edited: 1 as const, cost };

  const res = await batchOnce(c, () => [
    c.db.prepare(
      `INSERT INTO formula_versions (project_id, version_no, parent_version_id, source_run_id, base_codes, recipe_json, rationale_json, gate_json, status, created_by)
       SELECT ?, COALESCE(MAX(version_no),0)+1, ?, ?, ?, ?, ?, ?, 'draft', ? FROM formula_versions WHERE project_id=? RETURNING id, version_no`,
    ).bind(old.project_id, old.id, old.source_run_id, old.base_codes ?? '', JSON.stringify(kept), old.rationale_json ?? null, JSON.stringify(vg), c.sess.uid, old.project_id),
    c.db.prepare(`UPDATE formula_projects SET updated_at=datetime('now') WHERE id=?`).bind(old.project_id),
  ]);
  const v = res[0].results[0] as { id: number; version_no: number };
  const esg = await saveEsg(c, v.id, old.project_id, kept);   // 改成分 / 比例后重算 ESG(任务 G)
  // 只记元数据,不记改了哪些比例(3.4)
  await logRevision(c.db, 'formula_versions', v.id, null, null, { project_id: old.project_id, version_no: v.version_no, action: 'edit', parent_version_id: old.id, rows_changed: changed }, c.sess.uid);
  return json({ ok: true, version_id: v.id, version_no: v.version_no, rows_changed: changed, esg });
}

/* ── esg:版本 ESG 四支柱核查(创始人 09-18「符合 ESG 规范全绿」;任务 G)────────── */
/** 按项目市场 / 剂型 / 约束跑 esgCheck,写 esg_json。列由迁移加;列还没加时 UPDATE 失败只吞掉,结果照样返回 */
async function saveEsg(c: Ctx, version_id: number, project_id: number, rows: RecipeRow[]) {
  const p = await c.db.prepare(`SELECT format, markets, constraints_json FROM formula_projects WHERE id=?`).bind(project_id).first<Pick<ProjectRow, 'format' | 'markets' | 'constraints_json'>>();
  if (!p) return null;
  const k = parseConstraints(p.constraints_json);
  const esg = await esgCheck(c.db, rows.map((r) => ({ seq: r.seq, inci: r.inci, name: r.name, pct: r.pct ?? r.pct_high ?? null })), {
    markets: marketsToCodes(p.markets), form: formatToForm(p.format), sunscreen: /^(sun-|spf$)/.test(p.format), strict: !!(k.all_green || k.esg), vegan: !!k.vegan,
  });
  await c.db.prepare(`UPDATE formula_versions SET esg_json=? WHERE id=?`).bind(JSON.stringify(esg), version_id).run().catch(() => {});
  return esg;
}
async function opEsg(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator', 'boss'); if (deny) return deny;   // 能看比例的角色都能点「ESG 核查」;不改配方
  const v = await c.db.prepare(`SELECT id, project_id, recipe_json FROM formula_versions WHERE id=?`).bind(Number(b.version_id) || 0).first<Pick<VersionRow, 'id' | 'project_id' | 'recipe_json'>>();
  if (!v) return json({ ok: false, msg: '版本不存在' }, 404);
  const rows = safeJson<RecipeRow[]>(v.recipe_json, []);
  if (!rows.length) return json({ ok: false, msg: '这版没有配方行' }, 400);
  const esg = await saveEsg(c, v.id, v.project_id, rows);
  if (!esg) return json({ ok: false, msg: '需求单不存在' }, 404);
  return json({ ok: true, version_id: v.id, esg, msg: esg.pass === null ? 'esg_rules 表未建,尚未核查' : undefined });
}

/* ── feedback:打版结果(动作③;打版员唯一能走的 op)───────────────────── */
/** 白名单 9 字段;明天按实验室的表调列名时改这里和 0081 迁移即可 */
const FB_FIELDS = ['ph', 'viscosity', 'centrifuge', 'freeze_thaw', 'accel_40c', 'appearance', 'odor', 'skin_feel', 'customer_text'] as const;

async function opFeedback(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator', 'sampler'); if (deny) return deny;
  const version_id = Number(b.version_id) || 0;
  const ver = await c.db.prepare(`SELECT id, project_id FROM formula_versions WHERE id=?`).bind(version_id).first<{ id: number; project_id: number }>();
  if (!ver) return json({ ok: false, msg: '版本不存在' }, 404);
  const decision = str(b.decision, 10) || null;
  if (decision && decision !== 'adjust' && decision !== 'accept') return json({ ok: false, msg: 'decision 只能是 adjust / accept' }, 400);
  const ph = num(b.ph);
  if (ph !== null && !Number.isFinite(ph)) return json({ ok: false, msg: 'pH 要填数字' }, 400);

  // 动态列只从白名单取(照 formula.ts),前端多传的键一律无视
  const cols: string[] = [], vals: unknown[] = [];
  for (const f of FB_FIELDS) {
    if (!(f in b)) continue;
    cols.push(f); vals.push(f === 'ph' ? ph : (str(b[f], 2000) || null));
  }
  if (!cols.length && !decision) return json({ ok: false, msg: '至少填一项结果或选一个结论' }, 400);

  // round = 该版本已有条数 + 1,写成子查询与 INSERT 同一句,免得两人同时记第 2 次打版
  const stmts = [
    c.db.prepare(
      `INSERT INTO formula_feedback (version_id, round, decision, created_by${cols.map((x) => `, ${x}`).join('')})
       SELECT ?, COUNT(*)+1, ?, ?${cols.map(() => ', ?').join('')} FROM formula_feedback WHERE version_id=? RETURNING id, round`,
    ).bind(version_id, decision, c.sess.uid, ...vals, version_id),
  ];
  // 打版通过 → 版本进「已打版」;调整 / 未定不动状态(定稿 final 是 v1 的事)
  if (decision === 'accept') stmts.push(c.db.prepare(`UPDATE formula_versions SET status='sampled' WHERE id=?`).bind(version_id));
  const res = await c.db.batch(stmts);
  const fb = res[0].results[0] as { id: number; round: number };
  await logRevision(c.db, 'formula_feedback', fb.id, null, null, { project_id: ver.project_id, version_id, round: fb.round, decision, action: 'feedback' }, c.sess.uid);
  return json({ ok: true, id: fb.id, round: fb.round });
}

/* ── ocr:拍照 → 文字 / 配方表(2026-09-17 创始人:「拍照上传转文字录入」「把原有的一些资料拍照导入」)──
   请求 {image: dataURL(jpg/png/webp,≤4MB), mode:'text'|'recipe', project_id?}。任一实验室角色。
   视觉模型 = providers 里 enabled=1 且 can_vision=1 的行(现只有 Agnes);一个都没有 → 503。
   每次一行 formula_runs(step='ocr', side='L', project_id 可为 0):input_json 只存 {mode, bytes} 不存图;output_json 存结果;失败也留行(err)。
   mode=text → {ok, text};mode=recipe → {ok, rows, title, notes, unsure}。 */
const OCR_MAX_BYTES = 4 * 1024 * 1024;
async function opOcr(c: Ctx, b: any) {
  const deny = requireLab(c, ...LAB_ROLES); if (deny) return deny;
  const mode = b.mode as OcrMode;
  if (mode !== 'text' && mode !== 'recipe') return json({ ok: false, msg: 'mode 只能是 text / recipe' }, 400);
  const image = typeof b.image === 'string' ? b.image : '';
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return json({ ok: false, msg: '图片要是 jpg / png / webp 的 base64 data URL' }, 400);
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes > OCR_MAX_BYTES) return json({ ok: false, msg: `图片 ${(bytes / 1048576).toFixed(1)}MB,超过 4MB,请先压小` }, 413);

  const pool = (await loadFleet(c.db, env as any)).filter((p) => p.vision);
  if (!pool.length) return json({ ok: false, msg: '没有可用的视觉模型,请到「模型舰队」给能读图的行(如 Agnes)填 key 并启用' }, 503);
  const project_id = Number(b.project_id) || 0;
  const prompt = OCR_PROMPT[mode];
  const t0 = Date.now();
  let r: ChatResult | null = null, err: string | null = null;
  try {
    // 配方表几十行 JSON 约 2–4k tokens;Agnes 2.x 是推理模型,再留一倍(fleet.ts MIN_TOKENS 的教训)
    r = await vision(env as any, image, prompt.user, { system: prompt.system, json: mode === 'recipe', maxTokens: mode === 'recipe' ? 6000 : 3000, fleet: pool,
      entity: project_id ? { type: 'formula_project', id: project_id } : undefined, db: c.db });   // 治理层:OCR 也落 ai_runs
  } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 1000); }
  const ms = r?.ms ?? Date.now() - t0;

  let out: Record<string, unknown> | null = null;
  if (r) {
    if (mode === 'text') out = { text: r.text.trim().slice(0, 8000) };
    else { const parsed = parseJson(r.text); if (parsed) out = normOcrRecipe(parsed); else err = 'JSON 解析失败'; }
  }
  const p = pool.find((x) => x.id === r?.provider) ?? pool[0];
  await c.db.prepare(
    `INSERT INTO formula_runs (project_id, step, round, side, attempt, provider_id, model, is_free, experts, prompt_hash, input_json, raw_text, output_json, ok, err, ms, uid)
     VALUES (?,'ocr',1,'L',1,?,?,?,'',NULL,?,?,?,?,?,?,?)`,
  ).bind(project_id, r?.provider ?? p.id, r?.model ?? (p.visionModel ?? p.model), p.free ? 1 : 0, JSON.stringify({ mode, bytes }),
    mode === 'recipe' && r ? r.text.slice(0, 8000) : null, out ? JSON.stringify(out) : null, out ? 1 : 0, out ? null : err, ms, c.sess.uid).run();

  if (!out) return json({ ok: false, msg: err === 'JSON 解析失败' ? '没识别出表格,请换一张更清晰、更正的图再试' : `识别失败:${err}` }, err === 'JSON 解析失败' ? 200 : 502);
  return json({ ok: true, ms, ...out });
}

/* ── import_formula:确认后的配方表 → formulas 一行(status='imported')+ formula_recipes 明细 ──
   请求 {title, category, format, rows:[{phase,name,inci,pct,purpose,source?}], orig_code?, notes?, benefits?}。chief / formulator。
   code = IMP-YYMM-NNN;Σpct 必须 = 100 ±0.5;actives_json = 有 INCI 且 pct ≤ 5 的前 8 味(与 formulas.actives_json 既有形状一致);ai_summary 留空。
   formulas 没有标题 / 原编号列:两者与 notes 一起写进 cert_notes(「标题:… ;原编号:… ;…」),并进 revisions 元数据。
   公开页(formulas 列表 / 详情 / sitemap / ai/search / kb-index / oem / chain / i18n)全部 WHERE status IN ('sample','active'),imported 行不外露(2026-09-17 已逐处核过)。 */
async function opImportFormula(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator'); if (deny) return deny;
  const category = str(b.category, 40), format = str(b.format, 40);
  if (!category || !format) return json({ ok: false, msg: '品类与剂型必填' }, 400);
  const title = str(b.title, 120), orig_code = str(b.orig_code, 40), notes = str(b.notes, 1000), benefits = str(b.benefits, 200);
  const raw = Array.isArray(b.rows) ? b.rows : [];
  if (!raw.length) return json({ ok: false, msg: '配方表是空的' }, 400);
  if (raw.length > 80) return json({ ok: false, msg: `一张配方表最多 80 行,当前 ${raw.length} 行` }, 400);
  const rows: (OcrRow & { source: string })[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] ?? {};
    const name = str(r.name, 120), inci = str(r.inci, 160).toUpperCase();
    if (!name && !inci) return json({ ok: false, msg: `第 ${i + 1} 行原料名与 INCI 都为空,请填一个或删掉该行` }, 400);
    const pct = num(r.pct);
    if (pct === null || !Number.isFinite(pct) || pct < 0 || pct > 100) return json({ ok: false, msg: `第 ${i + 1} 行(${name || inci})的比例要填 0–100 的数字` }, 400);
    rows.push({ phase: str(r.phase, 40), name: name || inci, inci, pct, purpose: str(r.purpose, 120), source: r.source === 'manual' ? 'manual' : 'ocr' });
  }
  const total = rows.reduce((a, r) => a + r.pct!, 0);
  if (Math.abs(total - 100) > 0.5) return json({ ok: false, msg: `比例合计 ${total.toFixed(2)}%,请先在表里改齐` }, 400);

  const actives = rows.filter((r) => r.inci && r.pct! <= 5).slice(0, 8).map((r) => ({ name: r.name, inci: r.inci, pct: `${r.pct}%` }));
  const cert_notes = [title && `标题:${title}`, orig_code && `原编号:${orig_code}`, notes].filter(Boolean).join(';') || null;
  const stmts = (code: string) => [
    c.db.prepare(
      `INSERT INTO formulas (code, category, format, benefits, actives_json, markets, cert_notes, status, updated_at)
       VALUES (?,?,?,?,?,'',?,'imported',datetime('now')) RETURNING id`,
    ).bind(code, category, format, benefits, JSON.stringify(actives), cert_notes),
    // 明细的 formula_id 用子查询拿:D1 batch 里前一句的 RETURNING 绑不到后一句
    ...rows.map((r, i) => c.db.prepare(
      `INSERT INTO formula_recipes (formula_id, phase, seq, name, inci, pct, purpose, source) SELECT id, ?, ?, ?, ?, ?, ?, ? FROM formulas WHERE code=?`,
    ).bind(r.phase, i + 1, r.name, r.inci, r.pct, r.purpose, r.source, code)),
  ];
  // 编号 MAX+1 不在事务里,两人同时导入会撞 UNIQUE:重算一次再插(同 createProject)
  let code = await nextImportCode(c.db);
  let res: D1Result[];
  try { res = await c.db.batch(stmts(code)); }
  catch (e) {
    if (!isUnique(e)) throw e;
    code = await nextImportCode(c.db);
    try { res = await c.db.batch(stmts(code)); } catch (e2) { if (isUnique(e2)) return json({ ok: false, msg: '编号冲突,请重试' }, 409); throw e2; }
  }
  const formula_id = (res[0].results[0] as { id: number }).id;
  // 只记元数据:原料与比例一个字都不进 revisions(3.4)
  await logRevision(c.db, 'formulas', formula_id, null, null, { action: 'import_formula', code, category, format, rows: rows.length, title: title || null, orig_code: orig_code || null }, c.sess.uid);
  return json({ ok: true, formula_id, code });
}

/* ── 原料库 lab_materials(创始人 2026-09-18:「还有要可以改配方的原料,多选原料和价格」「晚点资料就会导入」)──
   价格只认导入 / 人工填,不编(09-17「原料价格:明天看看资料库应该是有的,没有就需要另外安排人维护」)。读:任一实验室角色;写:chief / formulator / boss;
   purchasing / finance 只改价相关几列并做两级确认(09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」) */
const MAT_TEXT = ['code', 'name_zh', 'trade_name', 'inci', 'supplier', 'cas', 'function_zh', 'price_unit', 'price_at', 'moq', 'origin', 'note'] as const;
const MAT_NUM = ['use_min', 'use_max', 'price', 'lead_days'] as const;
type MatRec = Record<string, string | number | null>;
/** 一行原料输入 → 白名单字段(只含给了值的键);错了返回提示串。inci_key = factKey(inci 第一个成分),与 ingredient_facts 同口径 */
function normMaterial(raw: any): MatRec | string {
  if (!raw || typeof raw !== 'object') return '每行要是对象';
  const rec: MatRec = {};
  for (const k of MAT_TEXT) if (raw[k] !== undefined && raw[k] !== null) rec[k] = str(raw[k], k === 'note' ? 500 : 200);
  for (const k of MAT_NUM) if (raw[k] !== undefined) { const v = num(raw[k]); if (v !== null && !Number.isFinite(v)) return `${k} 要是数字`; rec[k] = k === 'lead_days' && v !== null ? Math.round(v) : v; }
  if (Array.isArray(raw.tags)) rec.tags = JSON.stringify(raw.tags.map((t: unknown) => str(t, 30)).filter(Boolean).slice(0, 20));
  if (raw.status !== undefined) { const s = str(raw.status, 10); if (!['active', 'off'].includes(s)) return 'status 只能是 active / off'; rec.status = s; }
  if ('inci' in rec) { rec.inci = String(rec.inci).toUpperCase(); rec.inci_key = factKey(String(rec.inci).split(/[,，]/)[0]); }
  if (rec.price !== undefined && rec.price !== null && (rec.price as number) < 0) return '价格不能是负数';
  return rec;
}
async function opMaterials(c: Ctx, b: any) {
  const q = str(b.q, 80), like = `%${q}%`;
  const limit = Math.min(50, Math.max(1, Number(b.limit) || 20));
  const status = ['active', 'off', 'all'].includes(b.status) ? b.status : 'active';
  const rs = await c.db.prepare(
    `SELECT id,code,name_zh,trade_name,inci,supplier,use_min,use_max,price,price_unit,price_at,price_status,status FROM lab_materials
     WHERE (?='all' OR status=?) AND (?='' OR name_zh LIKE ? OR trade_name LIKE ? OR inci LIKE ? OR supplier LIKE ? OR code LIKE ?)
     ORDER BY (price IS NULL), name_zh LIMIT ?`,   // 有价的排前:选原料时先看得见能算成本的
  ).bind(status, status, q, like, like, like, like, like, limit).all();
  const rows = rs.results ?? [];
  return json({ ok: true, rows: canCost(c.sess.lab_role) ? rows : rows.map((r: any) => stripCost(r)) });   // 无价角色连接口都不给价(15:5x 创始人)
}
/** 采购 / 财务在原料库里只能碰这几列(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」);其它字段悄悄忽略,不报错 */
const MAT_PRICE_ONLY = ['price', 'price_unit', 'price_at', 'moq', 'lead_days', 'supplier', 'note'];
/** 改价一律退回待确认(谁改的都一样,采购确认后财务再确认):UPDATE 里多这一段,同时清掉两级确认人 / 时间 */
const RESET_STATUS = `price_status='draft', price_confirmed_by=NULL, price_confirmed_at=NULL, finance_confirmed_by=NULL, finance_confirmed_at=NULL`;
async function opMaterialSave(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator', 'boss', 'purchasing', 'finance'); if (deny) return deny;
  const rec = normMaterial(b.row ?? b);
  if (typeof rec === 'string') return json({ ok: false, msg: rec }, 400);
  if (['purchasing', 'finance'].includes(c.sess.lab_role ?? '')) for (const k of Object.keys(rec)) if (!MAT_PRICE_ONLY.includes(k)) delete rec[k];
  rec.updated_by = c.sess.email;
  const id = Number(b.id) || 0;
  if (id) {
    const keys = Object.keys(rec);
    if (!keys.length) return json({ ok: false, msg: '没有改动' }, 400);
    // 价真变了才退回 draft(页面整行 POST,改个备注也会带上 price;拿旧价比一下,别把财务确认白白冲掉)
    const old = await c.db.prepare(`SELECT price FROM lab_materials WHERE id=?`).bind(id).first<{ price: number | null }>();
    if (!old) return json({ ok: false, msg: '原料不存在' }, 404);
    const priceChanged = 'price' in rec && (rec.price ?? null) !== (old.price ?? null);
    const r = await c.db.prepare(`UPDATE lab_materials SET ${keys.map((k) => `${k}=?`).join(',')}, ${priceChanged ? RESET_STATUS + ',' : ''} updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...keys.map((k) => rec[k]), id).run();
    if (!r.meta.changes) return json({ ok: false, msg: '原料不存在' }, 404);
    return json({ ok: true, id, price_status: priceChanged ? 'draft' : undefined });
  }
  if (!rec.name_zh || !rec.inci) return json({ ok: false, msg: '原料名和 INCI 必填' }, 400);   // 采购 / 财务被白名单删掉了名字与 INCI,新增自然落这里
  const keys = Object.keys(rec);
  const r = await c.db.prepare(`INSERT INTO lab_materials (${keys.join(',')}) VALUES (${ph(keys.length)}) RETURNING id`).bind(...keys.map((k) => rec[k])).first<{ id: number }>();
  return json({ ok: true, id: r?.id });
}
/** 批量 upsert ≤500 行:code 非空按 code 合并,否则按 (name_zh+inci);表小,一次读索引再分 INSERT / UPDATE,50 句一个 batch */
async function opMaterialImport(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator', 'boss'); if (deny) return deny;
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return json({ ok: false, msg: 'rows 为空' }, 400);
  if (rows.length > 500) return json({ ok: false, msg: '一次最多 500 行' }, 400);
  const ex = (await c.db.prepare(`SELECT id,code,name_zh,inci,price FROM lab_materials ORDER BY id LIMIT 20000`).all<{ id: number; code: string | null; name_zh: string; inci: string; price: number | null }>()).results ?? [];
  const byCode = new Map(ex.filter((r) => r.code).map((r) => [r.code as string, r.id]));
  const byName = new Map(ex.map((r) => [`${r.name_zh}\n${(r.inci || '').toUpperCase()}`, r.id]));
  const oldPrice = new Map(ex.map((r) => [r.id, r.price ?? null]));   // 导入改了价同样退回待确认(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」)
  const stmts: D1PreparedStatement[] = []; let inserted = 0, updated = 0, skipped = 0; const errors: string[] = [];
  rows.forEach((raw: any, i: number) => {
    const rec = normMaterial(raw);
    if (typeof rec === 'string' || !rec.name_zh || !rec.inci) { skipped++; if (errors.length < 10) errors.push(`第 ${i + 1} 行:${typeof rec === 'string' ? rec : '缺原料名或 INCI'}`); return; }
    rec.updated_by = c.sess.email;
    const nk = `${rec.name_zh}\n${rec.inci}`;
    const hit = (rec.code ? byCode.get(String(rec.code)) : undefined) ?? byName.get(nk);
    const keys = Object.keys(rec);
    if (hit === -1) { skipped++; return; }   // 同一批里重复
    if (hit) { const reset = 'price' in rec && (rec.price ?? null) !== oldPrice.get(hit); stmts.push(c.db.prepare(`UPDATE lab_materials SET ${keys.map((k) => `${k}=?`).join(',')}, ${reset ? RESET_STATUS + ',' : ''} updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...keys.map((k) => rec[k]), hit)); updated++; }
    else { stmts.push(c.db.prepare(`INSERT INTO lab_materials (${keys.join(',')}) VALUES (${ph(keys.length)})`).bind(...keys.map((k) => rec[k]))); inserted++; byName.set(nk, -1); if (rec.code) byCode.set(String(rec.code), -1); }
  });
  for (let i = 0; i < stmts.length; i += 50) await c.db.batch(stmts.slice(i, i + 50));
  await logRevision(c.db, 'lab_materials', 0, null, null, { action: 'import', inserted, updated, skipped }, c.sess.uid);
  return json({ ok: true, inserted, updated, skipped, errors });
}
async function opMaterialDelete(c: Ctx, b: any) {
  const deny = requireLab(c, 'chief', 'formulator', 'boss'); if (deny) return deny;
  const id = Number(b.id) || 0;
  if (!id) return json({ ok: false, msg: '缺 id' }, 400);
  const r = await c.db.prepare(`UPDATE lab_materials SET status='off', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(c.sess.email, id).run();   // 不物理删:历史版本的 material_id 还指着它
  return r.meta.changes ? json({ ok: true, id }) : json({ ok: false, msg: '原料不存在' }, 404);
}
/** 两级确认(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」):{id, level:'purchasing'|'finance'}。
 *  采购级 purchasing / boss / chief 可点,财务级 finance / boss 可点;财务确认必须已采购确认;无价不能确认;记 who / when;返回整行 */
async function opMaterialConfirm(c: Ctx, b: any) {
  const level = b.level === 'finance' ? 'finance' : b.level === 'purchasing' ? 'purchasing' : '';
  if (!level) return json({ ok: false, msg: 'level 只能是 purchasing / finance' }, 400);
  const deny = level === 'purchasing' ? requireLab(c, 'purchasing', 'boss', 'chief') : requireLab(c, 'finance', 'boss'); if (deny) return deny;
  const id = Number(b.id) || 0;
  if (!id) return json({ ok: false, msg: '缺 id' }, 400);
  const cur = await c.db.prepare(`SELECT price, price_status FROM lab_materials WHERE id=? AND status='active'`).bind(id).first<{ price: number | null; price_status: string | null }>();
  if (!cur) return json({ ok: false, msg: '原料不存在或已停用' }, 404);
  if (cur.price == null) return json({ ok: false, msg: '这条还没有价,先填价再确认' }, 400);
  if (level === 'finance' && cur.price_status !== 'purchasing_confirmed') return json({ ok: false, msg: '要先由采购确认,财务才能确认' }, 400);
  if (level === 'purchasing' && cur.price_status === 'finance_confirmed') return json({ ok: false, msg: '已是财务确认价;要改价请直接改,会自动退回待确认' }, 400);
  const set = level === 'purchasing'
    ? `price_status='purchasing_confirmed', price_confirmed_by=?, price_confirmed_at=datetime('now')`
    : `price_status='finance_confirmed', finance_confirmed_by=?, finance_confirmed_at=datetime('now')`;
  await c.db.prepare(`UPDATE lab_materials SET ${set}, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(c.sess.email, c.sess.email, id).run();
  await logRevision(c.db, 'lab_materials', id, null, { price_status: cur.price_status }, { action: 'confirm', level, price: cur.price }, c.sess.uid);
  const row = await c.db.prepare(`SELECT * FROM lab_materials WHERE id=?`).bind(id).first();
  return json({ ok: true, row });
}
