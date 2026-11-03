/**
 * 配方实验室 v0 —— 纯函数 + 只读 D1(2026-09-17 创始人:「功能上强大,使用上要简单」)。
 *
 * 这个文件只做五件事,`api/admin/formula-lab.ts` 只做编排、页面只做渲染:
 *  ① 权限投影 redact():**唯一脱敏点**。SSR 页与接口返回体都经它;前台配方页 v1 接入时也复用它,不另写一套。
 *  ② 模型侧 resolveSide():左右两栏写死到 deepseek / dashscope,没 key 就兜底到商汤两行并标「临时免费模型」。
 *  ③ 专家召集 convene():按席位表取 3–5 位,主答 / 防腐 / 稳定性永不被挤。
 *  ④ 上下文装载 loadContext() + 提示词 buildMessages():服务端代查库,模型不发起调用(v0 无 tool calling)。
 *  ⑤ 闸门 gate():模型输出逐行对库、对目录、对负面清单,红黄标记;红项采纳时剔除。
 *  ⑥ 会诊网关(v0.1,创始人 05:4x:「需求经过一个网关到达专家,再进行分解分析,而不是实验室工程师去选专家」):
 *     roster() 名册 → buildGatewayMessages() 总控拆题 → gateGateway() 与规则席位取并集 → buildExpertMessages() 逐位审核
 *     → buildSynthesisMessages() 汇总(= buildMessages 加一段会诊意见)。formula_runs.step 多了 gateway / expert 两种行。
 *  ⑦ 对话入口与三张卡(2026-09-17 11:1x「人只说话,系统干活」):buildBriefMessages()/normBrief() 从一句话提需求单;
 *     buildReviewMessages()/normReview() 李总工(side J,step='review')逐项对比刘 / 黄两版并给采纳建议。
 *
 * 写库一律不在这里(nextProjectCode 也只 SELECT,INSERT 在接口层)。
 */
import zh from './formula-lab-zh.json';
import { inciKey } from './inci-key';
import { factKey } from './decoder';   // ingredient_facts.inci_key 口径(去括号、大写、空白压一格、去首尾句点),与 inciKey 不同
import { loadProvider, type Provider } from './fleet';

/* ── 中文映射(单一来源 formula-lab-zh.json,TS 与 Python 共读)──────────────────────── */
const CAT_ZH = zh.CAT_ZH as Record<string, string>;
const FORMAT_ZH = zh.FORMAT_ZH as Record<string, string>;
const BENEFIT_ZH = zh.BENEFIT_ZH as Record<string, string>;
/** 剂型中文;缺项显示原码 + 「(待译)」,不阻塞 —— 新剂型出现时只改 JSON */
export const fmtZh = (f: string): string => FORMAT_ZH[f] ?? `${f}(待译)`;
export const catZh = (c: string): string => CAT_ZH[c] ?? `${c}(待译)`;
/** 功效标签中文;缺项原样显示(功效标签本就是自由词) */
export const benefitZh = (b: string): string => BENEFIT_ZH[b] ?? b;
/** 目标市场六个可勾项,值 = regulations.id(线上 42 行里没有 apac,所以拆成 jp / kr / asean) */
export const MARKET_ZH: Record<string, string> = { cn: '中国', eu: '欧盟', us: '美国', jp: '日本', kr: '韩国', asean: '东南亚(东盟)' };
export const COST_BAND_ZH: Record<string, string> = { low: '经济', mid: '中档', high: '高端' };
export const PROJECT_STATUS_ZH: Record<string, string> = { open: '进行中', sampling: '打版中', final: '定稿' };
export const VERSION_STATUS_ZH: Record<string, string> = { draft: '草案', sampled: '已打版', final: '定稿' };
/** 原料行 source 码(5.4)的中文;base:SR-1101 显示「基底 SR-1101」,认不出的原样显示 */
export const SOURCE_ZH: Record<string, string> = { estimate: '估算', ingredients: '库内原料', catalog: '目录', water: '水' };
export const sourceZh = (s: string | null | undefined): string => {
  const x = String(s ?? '').trim();
  if (!x) return '—';
  return x.startsWith('base:') ? `基底 ${x.slice(5)}` : SOURCE_ZH[x] ?? x;
};

/* ── 类型 ───────────────────────────────────────────────────────────────────── */
export type Step = 'recommend' | 'generate';
/** 会诊阶段 = 汇总行落在哪一步;网关行 / 专家行自己不是 Step,只在 input_json.meta.stage 记它 */
export type Stage = Step;
/** formula_runs.step 的全部取值:两步汇总行 + 网关行 + 专家行 + 李总工点评行(review,side='J')+ 拍照识别行(ocr,side='L',project_id 可为 0) */
export type RunStep = Step | 'gateway' | 'expert' | 'review' | 'ocr';
/** L 刘总工 / R 黄总工 出方案;J 李总工只点评两版,不出方案 */
export type Side = 'L' | 'R' | 'J';
export type Tier = '①' | '②' | '③';

/** formula_projects 一行(2.1) */
export type ProjectRow = {
  id: number; code: string; customer: string | null; category: string; format: string; claims: string;
  markets: string; constraints_json: string; cost_band: string | null; brief: string | null; status: string;
  owner_uid: number | null; created_at: string; updated_at: string;
};
/** 需求单硬约束(constraints_json 解析后) */
export type Constraints = {
  halal?: boolean; vegan?: boolean; fragrance_free?: boolean; no_mit_cmit?: boolean; preservative_free?: boolean;
  ph_low?: number | null; ph_high?: number | null; other?: string;
  all_green?: boolean;   // 总工 09-17:「客户都要求全绿合规,按照美丽修行那种标准确认」—— 任一红黄成分闸门不过
  esg?: boolean;         // 创始人 09-18:「开发部需要符合 ESG 规范全绿的配方」—— esg_rules 四支柱闸门(任务 G)
};
/** formula_runs 一行;input_json / raw_text 可被 redact 删掉。gateway_run_id:专家行与汇总行指向网关行(0081),v0 老行为 null */
export type RunRow = {
  id: number; project_id: number; step: RunStep; round: number; side: string; attempt: number;
  provider_id: string | null; model: string | null; is_free: number; experts: string; prompt_hash: string | null;
  input_json?: string | null; raw_text?: string | null; output_json: string | null; gate_json: string | null;
  ok: number; err: string | null; ms: number | null; tokens_in: number | null; tokens_out: number | null;
  chosen: number; uid: number | null; created_at: string; gateway_run_id?: number | null;
};
/** formula_versions 一行;recipe_json / gate_json / base_codes / rationale_json 可被 redact 删掉 */
export type VersionRow = {
  id: number; project_id: number; version_no: number; parent_version_id: number | null; source_run_id: number;
  base_codes?: string; recipe_json?: string | null; rationale_json?: string | null; gate_json?: string | null;
  status: string; created_by: number | null; created_at: string;
};
/** formula_versions.recipe_json 的一行(2.2);唯一含比例的地方 */
export type RecipeRow = {
  seq: string; phase: string; name: string; inci: string;
  pct_low: number | null; pct_high: number | null; pct: number | null;
  purpose: string; tier: Tier; source: string; flag: 'yellow' | null; catalog_no: string | null;
  green?: Green | null; irr?: number | null; com?: number | null;
  material_id?: number | null; price?: number | null; price_at?: string | null;   // lab_materials 快照(创始人 09-18「多选原料和价格」):保存版本时写死,不回查
  price_status?: PriceStatus | null;   // 快照时的确认档(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」):只有 finance_confirmed 当准数
};
/** lab_materials.price_status 三档(0091):待确认 → 采购已确认 → 财务已确认;改价一律退回 draft */
export type PriceStatus = 'draft' | 'purchasing_confirmed' | 'finance_confirmed';
export const PRICE_STATUS_ZH: Record<PriceStatus, string> = { draft: '待确认', purchasing_confirmed: '采购已确认', finance_confirmed: '财务已确认' };
/** 版本成本汇总(挂 gate_json.cost)。创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」:
 *  cost 只按 finance_confirmed 行累加(准数);cost_all 连待确认价一起算(非准数,页面标明);confirmed / unconfirmed 是两类行数;missing 仍是无价(或无 pct)行 */
export type CostSummary = { cost: number | null; cost_all: number | null; missing: number; n: number; confirmed: number; unconfirmed: number };
/** ingredient_facts.rating 三色 */
export type Green = 'green' | 'yellow' | 'red';

/** 推荐步模型输出(5.4) */
export type PickOut = {
  code: string; why: string; why_tier: Tier; combo: string; expected: string; expected_tier: Tier;
  selling: string[]; risks: { text: string; tier: Tier }[]; verify: string[];
};
export type RecommendOut = { picks: PickOut[]; notes?: string };
/** 生成步的一味原料;gate 之后多出 seq / key / matched_by / catalog_no / flag */
export type Material = {
  seq?: string; name: string; inci: string; pct: number | null; pct_low: number | null; pct_high: number | null;
  purpose: string; tier: Tier; source: string;
  key?: string; matched_by?: 'water' | 'ingredients' | 'catalog' | null; catalog_no?: string | null;
  flag?: 'yellow' | 'red' | null; flag_note?: string;
  green?: Green | null; irr?: number | null; com?: number | null;   // ingredient_facts 评级(美丽修行口径);无 facts 行为 null
};
export type GenerateOut = {
  name: string; system_type: string;
  phases: { phase: string; materials: Material[] }[];
  process: { step: number; text: string; tier: Tier }[];
  ph_window: { low: number; high: number; tier: Tier };
  efficacy_logic: { claim: string; because: string; tier: Tier }[];
  selling_points: { text: string; tier: Tier }[];
  risks: { text: string; tier: Tier }[];
  verify: { text: string; how: string; tier: Tier }[];
  unlisted: { name: string; why: string }[];
  decisions_for_customer: string[];
};

export type GateItem = { seq: string; reason: string; note?: string };
/** formula_runs.gate_json */
export type GateJson = { red: GateItem[]; yellow: GateItem[]; dropped: string[]; tiers: Record<Tier, number>; esg?: EsgCheck | null };   // esg:草稿闸门顺带的四支柱结果,页面显示(任务 G)

/* ── ESG 四支柱(创始人 09-18;规则表 esg_rules 由任务 R 建,这里只按契约编码)──────── */
export type EsgPillar = 'regulatory' | 'environment' | 'social' | 'safety';
export type EsgRule = {
  id: number; standard: string; pillar: EsgPillar; scope: string; applies: string;
  match_type: 'key' | 'prefix' | 'contains' | 'regex' | 'tag' | 'registry'; pattern: string; severity: 'red' | 'yellow';
  title_zh: string; reason_zh: string; basis: string; basis_url: string | null; effective_from: string | null; limit_pct: number | null; note: string | null; active: number;
};
export type EsgHit = {
  seq: string; inci: string; pct: number | null; pillar: EsgPillar; severity: 'red' | 'yellow'; rule_id: number;
  title_zh: string; reason_zh: string; basis: string; basis_url: string | null;
  limit?: { max: number | null; note: string; exceeds: boolean | null };
};
export type EsgCheck = {
  standard: string; checked_at: string; form: 'rinse-off' | 'leave-on'; markets: string[];
  pass: boolean | null;   // null = esg_rules 表还不存在(迁移未跑),不拦
  pillars: Record<EsgPillar, { status: Green; n: number }>;
  hits: EsgHit[];
  alternatives: Record<string, { inci_key: string; name_zh: string; functions_zh: string }[]>;
};

/* ── 会诊网关(v0.1)的 JSON ── */
/** 名册一行:expert_skills kind='expert' 全部 40 位(不限 for_lab,网关自己判谁该介入) */
export type RosterRow = { slug: string; title: string; domain: string; triggers: string };
/** 网关给某位专家的席位:slug + 他要回答的一句话 */
export type Seat = { slug: string; question: string };
/** 网关行 output_json(gateGateway 之后:slug 已校验、规则席位已并入、must ≤9) */
export type GatewayOut = {
  analysis: { system_type_hint: string; sub_questions: { topic: string; question: string }[] };
  must: Seat[]; optional: Seat[]; notes?: string;
};
/** 网关行 input_json.meta;expert / synthesize 两个 op 都从这里取阶段、基底、轮次与席位。
 *  candidate_codes:网关与各专家看到的候选全集;汇总步的闸门按它判「候选外」—— 汇总提示词为塞会诊意见会把候选裁到 10,不能拿裁后的名单去剔专家点名的 code */
export type GatewayMeta = { stage: Stage; base_codes: string[]; round: number; must: string[]; optional: string[]; convened: string[]; dropped: string[]; candidate_codes?: string[] };
/** 专家行 output_json。stance 四值:支持 / 有条件支持 / 反对 / 不适用(模型写了别的原样留,不替它改口) */
export type ExpertOut = {
  stance: string;
  points: { text: string; tier: Tier }[]; risks: { text: string; tier: Tier }[];
  red_lines: string[]; must_verify: string[];
  numbers: { what: string; value: string; source: string; tier: Tier }[];
  /** generate 才有;进汇总提示词,不直接进相表(仍由汇总模型写 phases、再过 gate) */
  suggestions_for_recipe?: { name: string; inci: string; pct_low: number | null; pct_high: number | null; purpose: string; source: string; tier: Tier }[];
};

/** 李总工点评行 output_json(step='review')。recommendation 三选一;merge 时 merge_plan 写取谁的哪几行(生成阶段 seq,推荐阶段 code) */
export type ReviewOut = {
  summary: string;
  comparison: { aspect: string; liu: string; huang: string; verdict: string; tier: Tier }[];
  recommendation: 'liu' | 'huang' | 'merge';
  merge_plan: { take_from: 'liu' | 'huang'; rows: string[]; why: string }[];
  red_yellow_notes: string[]; next_steps: string[]; tier: Tier;
};
/** op:'brief' 从一句话提取出的需求单;category / format 为 null 时接口回 ask 追问,不建项目 */
export type BriefOut = {
  customer: string | null; category: string | null; format: string | null; claims: string; markets: string[];
  constraints: Constraints; cost_band: string | null; brief: string; ask: string;
};

export type IngredientRow = {
  slug: string; inci: string; name_zh: string; functions: string; use_level: string | null; ph_range: string | null;
  incompatible: string | null; stability: string | null; market_cn: string | null; market_eu: string | null;
  market_us: string | null; cost_band: string | null; confidence: string;
};
export type CatalogRow = { inci_key: string; no: string; name_zh: string; max_leave: string | null; max_rinse: string | null };
export type CandidateRow = {
  code: string; category: string; format: string; benefits: string; actives_json: string; texture: string | null;
  ph: string | null; preservative: string | null; reg_class: string | null; markets: string | null; cost_band: string | null; s: number;
};
export type ExpertRow = { slug: string; title: string; domain: string; core: string };
export type WikiRow = { slug: string; title: string; body_md: string };
export type RegRow = { id: string; country_zh: string; entry_zh: string | null; safety_zh: string | null; labeling_zh: string | null; lists_zh: string | null };

/** 写进 formula_runs.input_json.meta 的那一段;retry 时靠它重建闸门上下文 */
export type LabMeta = {
  step: Step; project_id: number; code: string; category: string; format: string; markets: string;
  base_codes: string[]; experts: string[]; notes: string[]; candidate_codes: string[]; all_green?: boolean;
  esg?: boolean; vegan?: boolean;   // ESG 闸门开关与纯素(任务 G;vegan=false 时动物来源只黄不红)
  budget: { chars: number; limit: number; dropped: string[] };
};
/** loadContext 的返回;ingredients_all 是 149 行内存表,只给 gate 用,不进 input_json */
export type LabContext = {
  step: Step; project: ProjectRow; constraints: Constraints;
  experts: ExpertRow[]; candidates: CandidateRow[]; bases: Record<string, unknown>[];
  ingredients: IngredientRow[]; catalog: CatalogRow[]; wiki: WikiRow[]; regulations: RegRow[];
  meta: LabMeta; ingredients_all: IngredientRow[];
  not_green: string[];   // all_green 时:库内原料里 facts 评红黄的,进提示词「不得使用」列表
  esg_red: string[];     // all_green / esg 时:目标市场下会判红的规则 title_zh 去重 ≤15,进提示词硬要求段(任务 G)
  market_ref: string;    // 市场验证参考块(≤600 字;表空则空串)
};
/** gate 只需要 meta 里三个字段 + 149 行内存表;LabContext 结构上满足它,retry 时用 `{ meta: input_json.meta, ingredients_all: await loadIngredients(db) }` 拼一个 */
export type GateCtx = { meta: Pick<LabMeta, 'format' | 'markets' | 'candidate_codes' | 'all_green' | 'esg' | 'vegan'>; ingredients_all: IngredientRow[] };

/* ── 权限 ───────────────────────────────────────────────────────────────────── */
/** 能看比例(相表 / recipe_json / 提示词):总工、配方师、老板。admin 且 lab_role 为空看不到 —— 创始人已定 3 */
export const canRecipe = (r?: string | null): boolean => ['chief', 'formulator', 'boss'].includes(r ?? '');
/** 能看原料单价 / 配方成本:创始人 09-18 15:5x「原料成本不可以公开,只有技术研发部和财务、老板看到」→ 总工、配方师(研发)、老板、财务;
 *  采购要录价、做采购确认,原料库里也给它看(本职),但配方成本页它进不去(canRecipe 不含 purchasing)。销售 / 打版员 / 编辑 / 只读一律不见价 */
export const canCost = (r?: string | null): boolean => ['chief', 'formulator', 'boss', 'finance', 'purchasing'].includes(r ?? '');
/** 无价视图:把价格相关列整段剥掉(接口与页面 data-row 共用,DOM 里也不留) */
const COST_KEYS = ['price', 'price_unit', 'price_at', 'price_status', 'price_confirmed_by', 'price_confirmed_at', 'finance_confirmed_by', 'finance_confirmed_at'];
export function stripCost<T extends Record<string, any>>(row: T): T {
  const o: Record<string, any> = { ...row };
  for (const k of COST_KEYS) delete o[k];
  return o as T;
}
/** 能填打版结果:总工、配方师、打版员(打版员只能走这一个 op) */
export const canFeedback = (r?: string | null): boolean => ['chief', 'formulator', 'sampler'].includes(r ?? '');
/** 能写(建单 / 推荐 / 生成 / 采纳 / 改比例):总工、配方师 */
export const canWrite = (r?: string | null): boolean => ['chief', 'formulator'].includes(r ?? '');
/** 能改原料库(价 / 供应商 / 交期 / 备注):总工、配方师、老板 + 采购、财务 —— 采购 / 财务只有这一处可写,不进配方(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」) */
export const canMaterial = (r?: string | null): boolean => ['chief', 'formulator', 'boss', 'purchasing', 'finance'].includes(r ?? '');
/** 能点「采购确认」(purchasing / boss / chief)或「财务确认」(finance / boss);接口 material_confirm 与 materials 页共用 */
export const canConfirmPrice = (r: string | null | undefined, level: 'purchasing' | 'finance'): boolean =>
  (level === 'purchasing' ? ['purchasing', 'boss', 'chief'] : ['finance', 'boss']).includes(r ?? '');

export function parseConstraints(s: string | null | undefined): Constraints {
  const o = safeJson<Record<string, unknown>>(s, {});
  const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    halal: !!o.halal, vegan: !!o.vegan, fragrance_free: !!o.fragrance_free, no_mit_cmit: !!o.no_mit_cmit,
    preservative_free: !!o.preservative_free, ph_low: num(o.ph_low), ph_high: num(o.ph_high),
    other: o.other ? String(o.other).slice(0, 500) : '',
    all_green: !!o.all_green,
    esg: !!o.esg,
  };
}

/** JSON.parse 不抛;坏串返回 fallback。库里的 *_json 列全经它 */
export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/**
 * 字段级脱敏 —— 3.4 表的落地。视图按 lab_role 分四档:
 *   chief / formulator / boss  全;
 *   sales                      需求单只 品类/剂型/功效/市场;推荐卡只 expected+selling;草案只 名称/体系/功效逻辑/卖点;版本只 版本号/状态/时间;
 *   sampler                    需求单只 项目号/品类/剂型;推荐与草案不渲染(返回 null);版本卡多一份工艺步骤(只引用 seq);
 *   NULL(含两位 admin)        同 sales。
 * id / status / created_at 这类元数据各档都留 —— 页面要靠它们拼链接与状态,本身不含配方信息。
 */
export function redact(labRole: string | null | undefined, kind: 'project', row: ProjectRow): Partial<ProjectRow>;
export function redact(labRole: string | null | undefined, kind: 'run', row: RunRow): RunRow | null;
export function redact(labRole: string | null | undefined, kind: 'version', row: VersionRow): VersionRow;
export function redact(labRole: string | null | undefined, kind: 'project' | 'run' | 'version', row: any): any {
  const role = labRole ?? '';
  if (canRecipe(role)) return row;
  const sampler = role === 'sampler';

  if (kind === 'project') {
    const p = row as ProjectRow;
    const base = { id: p.id, code: p.code, category: p.category, format: p.format, status: p.status, created_at: p.created_at, updated_at: p.updated_at };
    return sampler ? base : { ...base, claims: p.claims, markets: p.markets };
  }

  if (kind === 'run') {
    if (sampler) return null;                                   // 打版员不渲染推荐栏与生成栏
    // 网关行 / 专家行:专家意见含建议原料与用量(suggestions_for_recipe / numbers),属 recipe 字段组,非 canRecipe 一律不渲染;
    // 页面给 sales / NULL 只显示「本轮会诊:M 位专家参与」,那个 M 从汇总行的 experts 列数,不用这两种行
    if (row.step === 'gateway' || row.step === 'expert' || row.step === 'ocr') return null;   // ocr 行 output_json 是整张配方表原文
    const r = { ...(row as RunRow) };
    delete r.input_json;                                        // meta 里有比例区间与维基页
    delete r.raw_text;
    const out = safeJson<any>(r.output_json, null);
    if (out) {
      // 李总工点评:业务只见结论一句 + 采纳谁;逐项对比与合并方案引用相表行号,属 recipe 字段组
      r.output_json = JSON.stringify(r.step === 'review'
        ? { summary: out.summary, recommendation: out.recommendation, tier: out.tier }
        : r.step === 'recommend'
        ? { picks: (Array.isArray(out.picks) ? out.picks : []).map((p: PickOut) => ({ expected: p.expected, expected_tier: p.expected_tier, selling: p.selling })) }
        : { name: out.name, system_type: out.system_type, efficacy_logic: out.efficacy_logic, selling_points: out.selling_points });
    }
    // 闸门明细里有原料名(「库内未找到:卡波姆 940」),非 canRecipe 只留计数
    const g = safeJson<GateJson>(r.gate_json, null);
    if (g) r.gate_json = JSON.stringify({ red: (g.red ?? []).length, yellow: (g.yellow ?? []).length, dropped: (g.dropped ?? []).length, tiers: g.tiers });
    return r;
  }

  const v = { ...(row as VersionRow) };
  delete v.recipe_json;
  delete v.gate_json;
  delete v.base_codes;                                          // 基底是 formulas.code,业务不出 code
  if (sampler) {
    const rat = safeJson<any>(v.rationale_json, null);
    v.rationale_json = rat?.process ? JSON.stringify({ process: rat.process }) : null;   // 工艺只引用 seq,无原料名
  } else {
    delete v.rationale_json;
  }
  return v;
}

/* ── 模型侧(4.1)──────────────────────────────────────────────────────────── */
/**
 * 左右两栏写死,不做设置页。兜底为什么写死到商汤两行而不是「舰队第一家」:
 * 线上 enabled=1 按 tier 排前 4 家全是 Agnes,Worker 出口被封(fleet.ts:224「3ms 即 429」),
 * chat() 对 HTTP 非 2xx 不判死、试 4 家即停,整队交给它必抛错。写死还保证左右永远不是同一家。
 */
export const LAB_SIDES: Record<Side, { id: string; alt?: string; label: string; fallback: string; persona: string }> = {
  L: { id: 'deepseek',  label: 'DeepSeek 官方',     fallback: 'sensenova-ds',   persona: '刘总工' },  // 兜底:token.sensenova.cn/v1 · deepseek-v4-pro
  R: { id: 'dashscope', label: '通义千问 DashScope', fallback: 'sensenova',      persona: '黄总工' },  // 兜底:token.sensenova.cn/v1 · glm-5.2
  // 李总工是独立审核者,不能与刘 / 黄同一家:anthropic 没 key 试 openai,都没有兜底商汤 kimi-k3(fleet.ts 对 kimi- 固定 temperature=1)
  J: { id: 'anthropic', alt: 'openai', label: 'Anthropic Claude', fallback: 'sensenova-kimi', persona: '李总工' },
};

/** 页面只显示 persona(人名),不显示模型名;模型名留在 formula_runs.provider_id / model。is_free=1 时卡角小字「测试通道」 */
export type SideProvider = { p: Provider; is_free: 0 | 1; label: string; persona: string };
/** 每次请求都查库,后台填了 key 立即切换,无需重部署。整条链都没 key 返回 null → 接口 503 */
export async function resolveSide(db: D1Database, side: Side): Promise<SideProvider | null> {
  const s = LAB_SIDES[side];
  for (const id of [s.id, s.alt].filter(Boolean) as string[]) {
    const paid = await loadProvider(db, id);
    if (paid) return { p: paid, is_free: 0, label: id === s.id ? s.label : paid.label, persona: s.persona };
  }
  const free = await loadProvider(db, s.fallback);
  if (free) return { p: free, is_free: 1, label: `临时免费模型 · ${free.label}`, persona: s.persona };
  return null;
}

/* ── 编号(2.3)────────────────────────────────────────────────────────────── */
/**
 * 项目号 YYMM-NNN,北京时间(固定 +8,无夏令时)。取 MAX+1 而不是 COUNT+1 —— 删过一单后 COUNT+1 永远撞 UNIQUE。
 * 并发撞 UNIQUE 的重算由接口层做(INSERT 抛错后再调一次本函数,再撞报「编号冲突,请重试」)。
 */
export async function nextProjectCode(db: D1Database): Promise<string> {
  const ym = new Date(Date.now() + 8 * 3600_000).toISOString().slice(2, 7).replace('-', '');
  const r = await db.prepare(`SELECT MAX(code) m FROM formula_projects WHERE code LIKE ?`).bind(`${ym}-%`).first<{ m: string | null }>();
  const n = r?.m ? Number(r.m.slice(-3)) + 1 : 1;
  return `${ym}-${String(n || 1).padStart(3, '0')}`;
}

/* ── 专家召集(5.1)────────────────────────────────────────────────────────── */
const S = (x: string) => `bohui-${x}`;   // expert_skills.slug 保留 bohui- 前缀
const REG_BY_MARKET: Record<string, string> = {
  cn: 'regulatory-china', eu: 'regulatory-eu', us: 'regulatory-us-na',
  jp: 'regulatory-apac-emerging', kr: 'regulatory-apac-emerging', asean: 'regulatory-apac-emerging',
};
/* 触发词表,取自各 SKILL.md「何时召集」段。改词只改这里 */
const HIT = {
  safety: /儿童|婴幼儿|婴儿|眼周|新原料/,
  nmpa: /祛斑|美白|防晒|防脱/,
  botanical: /植物|草本|天然|有机|植萃/,
  fragrance: /香精|加香|留香|精油/,
  packaging: /包材|软管|泵头/,
};
const AQUEOUS = ['serum', 'essence', 'ampoule', 'toner', 'mist', 'gel', 'mask', 'sleeping-mask', 'jelly-mask', 'hair-essence'];
const SURFACTANT = ['foam', 'cleansing-gel', 'shampoo', 'scrub', 'cleanser', 'body-wash'];
const ANHYDROUS = ['oil', 'balm', 'stick', 'powder'];
/** 补位序(5.1):不足 3 位时按序补;convene 与 gateGateway 共用 */
const FILL = ['stability-shelf-life', 'formulation-actives-efficacy', 'regulatory-china'];
/** 淋洗剂型:限量用 max_rinse,其余用 max_leave(5.5) */
export const RINSE = new Set(['cleansing-gel', 'foam', 'shampoo', 'scrub', 'body-wash', 'mouthwash', 'cleanser']);

export const splitList = (s: string | null | undefined): string[] =>
  String(s ?? '').split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean);

/**
 * 按席位表收集候选席(小号先留),取前 5;不足 3 位按补位序补。
 * 返回带 bohui- 前缀的 slug,直接进 `WHERE slug IN (…)`;notes 进 input_json.meta.notes 与栏底显示。
 */
export function convene(project: Pick<ProjectRow, 'category' | 'format' | 'claims' | 'markets' | 'brief' | 'cost_band' | 'constraints_json'>, step: Step): { slugs: string[]; notes: string[] } {
  const c = parseConstraints(project.constraints_json);
  const cat = project.category, fmt = project.format;
  const markets = splitList(project.markets);
  const text = `${project.claims ?? ''} ${project.brief ?? ''} ${c.other ?? ''}`;
  const seats: string[] = [];
  const notes: string[] = [];
  const add = (slug: string) => { if (!seats.includes(slug)) seats.push(slug); };

  // 1 主答(必有)
  if (cat === 'makeup') add('color-cosmetics-lip-base');
  else if (cat === 'suncare' || fmt.startsWith('sun-')) add('sunscreen-spf-systems');
  else if (['sheet-mask', 'eye-patch'].includes(fmt)) add('sheet-mask-substrate');
  else if (SURFACTANT.includes(fmt) || cat === 'cleansing') add('cleansing-surfactant-systems');
  else if (AQUEOUS.includes(fmt) || cat === 'oral') { add('formulation-aqueous-serum'); if (cat === 'oral') notes.push('无口腔专家,由水剂专家主答'); }
  else add('formulation-emulsion');
  // 2 防腐(含水剂型固定席;kids 品类无论剂型都保证在场)
  if (!ANHYDROUS.includes(fmt) || c.preservative_free || c.no_mit_cmit || cat === 'kids') add('micro-preservation');
  // 3 稳定性(generate 固定席)
  if (step === 'generate') add('stability-shelf-life');
  // 4 法规官第 1 位(按勾选顺序)
  const regs = [...new Set(markets.map((m) => REG_BY_MARKET[m]).filter(Boolean))];
  if (regs[0]) add(regs[0]);
  // 5 安全评估
  if (cat === 'kids' || HIT.safety.test(text)) add('safety-assessor-toxicology');
  // 6 功效
  if (splitList(project.claims).length) add('formulation-actives-efficacy');
  // 7 法规官第 2 位;第三个及以后不召
  if (regs[1]) add(regs[1]);
  if (regs.length > 2) notes.push(`第三市场起未召法规官:${regs.slice(2).join(',')}`);
  // 8–13
  if (markets.includes('cn') && HIT.nmpa.test(project.claims ?? '')) add('nmpa-reviewer-perspective');
  if (c.halal || c.vegan) add('ethics-sustainability-claims');
  if (HIT.botanical.test(project.claims ?? '')) add('botanical-actives-claims');
  if (HIT.fragrance.test(text)) add('fragrance-development');
  if (HIT.packaging.test(project.brief ?? '')) add('packaging-compatibility');
  if (project.cost_band === 'low') add('cost-formulation-structure');
  // 补位
  for (const s of FILL) if (seats.length < 3) add(s);

  const picked = seats.slice(0, 5);
  if (seats.length > 5) notes.push(`席位已满,未召:${seats.slice(5).join(',')}`);
  return { slugs: picked.map(S), notes };
}
/* ── 候选与上下文(5.2)────────────────────────────────────────────────────── */
/**
 * 需求单的功效词 → 检索词:中文原词 + 反查 BENEFIT_ZH 得到的英文码。
 * formulas.benefits / ingredients.functions 存的是英文码(hydrating,barrier),中文词直接 LIKE 打不中。
 */
export function claimTerms(claims: string | null | undefined): string[] {
  const out: string[] = [];
  for (const w of splitList(claims)) {
    out.push(w);
    for (const [code, z] of Object.entries(BENEFIT_ZH)) if (w.includes(z) || z.includes(w)) out.push(code);
  }
  return [...new Set(out)].slice(0, 8);
}

/**
 * 推荐候选,独立函数 —— 明天只换它的 SQL 到 formula_recipes。
 * LIKE 打分照 api/ai/search.ts:43:每个检索词对 benefits / actives_json 各一项 CASE 累加。
 * 剂型打不中(手填剂型)→ 只按品类筛并 note。
 */
export async function candidates(db: D1Database, project: Pick<ProjectRow, 'category' | 'format' | 'claims'>): Promise<{ rows: CandidateRow[]; note: string | null }> {
  const ts = claimTerms(project.claims);
  const score = ts.length
    ? ['benefits', 'actives_json'].map((c) => ts.map(() => `(CASE WHEN ${c} LIKE ? THEN 1 ELSE 0 END)`).join('+')).join('+')
    : '0';
  const binds = ts.length ? [...ts, ...ts].map((t) => `%${t}%`) : [];
  const q = (byFormat: boolean) => db.prepare(
    `SELECT code,category,format,benefits,actives_json,texture,ph,preservative,reg_class,markets,cost_band, ${score} s
       FROM formulas WHERE status IN ('sample','active') AND category=? AND (format=? OR ?=1)
       ORDER BY s DESC, code LIMIT 20`)
    .bind(...binds, project.category, project.format, byFormat ? 0 : 1).all<CandidateRow>();
  let rows = (await q(true)).results ?? [];
  let note: string | null = null;
  if (!rows.length) { rows = (await q(false)).results ?? []; note = '剂型未匹配,按品类筛'; }
  return { rows, note };
}

/** ingredients 149 行一次读进内存;gate 与 loadContext 共用,retry 时接口层单独调一次 */
export async function loadIngredients(db: D1Database): Promise<IngredientRow[]> {
  const r = await db.prepare(
    `SELECT slug,inci,name_zh,functions,use_level,ph_range,incompatible,stability,market_cn,market_eu,market_us,cost_band,confidence
       FROM ingredients`).all<IngredientRow>();
  return r.results ?? [];
}

/** 上下文字符预算(一处常量)。商汤 GLM-5.2 / DeepSeek V4 Pro 窗口未在仓库记录,45k 是估计上限 */
export const BUDGET = 45_000;
const CORE_MAX = 2_949;
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');

/* ── 紧凑序列化(任务 C,2026-09-18 创始人「1 省算力」;吸收提示词压缩机制:JSON / 键值对改竖线表,答案不变)──
   compact():首行列名、后续每行只写值、竖线分隔;空 / null 不写占位符(空单元 = 无);数字去尾零最多 3 位小数;
   值里的竖线换 /、换行压空格,不然行列错位。stripMd():去 markdown 装饰符(# > ** [](链接) ``` ---)与空行,只动符号不动字。
   量化见 tools/lab/ctx-measure.py。*/
const cell = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Number(v.toFixed(3)));
  const t = String(v).trim();
  return /^-?\d+\.\d{4,}$/.test(t) ? String(Number(Number(t).toFixed(3))) : t.replace(/\s*\|\s*/g, '/').replace(/\s*\n+\s*/g, ' ');
};
export type CompactCol<T> = string | [string, (r: T) => unknown];
/** 竖线表:cols 是列名(取同名字段)或 [列名, 取值函数];rows 空则只剩表头行 */
export function compact<T extends Record<string, any>>(rows: T[], cols: CompactCol<T>[]): string {
  const head = cols.map((c) => (typeof c === 'string' ? c : c[0])).join('|');
  const get = cols.map((c) => (typeof c === 'string' ? (r: T) => r[c] : c[1]));
  return [head, ...rows.map((r) => get.map((g) => cell(g(r))).join('|'))].join('\n');
}
export function stripMd(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/```[a-zA-Z]*[ \t]*\n?/g, '')               // 围栏符号去掉,内容留
    .replace(/^#{1,6}[ \t]+/gm, '')                      // 标题井号
    .replace(/^[ \t]*>[ \t]?/gm, '')                     // 引用符
    .replace(/^[ \t]*(?:-{3,}|\*{3,})[ \t]*$/gm, '')     // 分隔线
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')                 // 粗体
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')         // 链接只留文字
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
/** 表格约定句:三种提示词(汇总 / 网关 / 专家)硬规则末尾都带 */
const TABLE_NOTE = '资料表格为竖线 | 分隔,首行是列名,空单元表示无。';
const reEsc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 专家 core 进提示词:去装饰符;首行若与职称重复、以及与 TIER_NOTE 相同的两句(system 头已带一次)去掉 —— 重复内容不是字段内容 */
const expertBlock = (e: ExpertRow): string => {
  const lines = stripMd(e.core).split('\n').filter((l, i) => !(i === 0 && l.trim() === e.title) && !/^角色专家,不是真人。判断句尾的|^涉及法规处一律注明「以最新官方文本为准」。$/.test(l.trim()));
  return `## 专家:${e.title}(${e.domain})\n${lines.join('\n')}`;
};
/** 维基页进提示词:去装饰符;首行「# 标题」与块标题重复,去掉 */
const wikiBlock = (w: WikiRow): string =>
  `## ${w.slug.startsWith('format/') ? '剂型维基' : '原料维基'}:${w.title}\n${stripMd(w.body_md).replace(new RegExp(`^${reEsc(w.title)}\n`), '')}`;

/** buildMessages 的追加段:system 尾部加一段、user 在需求单之后插一块。汇总步用它塞「会诊意见」;预算裁剪时一并计入 */
export type MessageExtra = { system?: string; user?: string };

/**
 * 装载 5.2 各块;超预算按序裁:维基页(先原料页后剂型页)→ 候选(丢到 10)→ 库内原料(丢到 12)→ 专家(第 5 席往前,不动 1/2/3)。
 * 需求单永不裁。实际字符数与被裁项写进 meta.budget。两栏共用同一份结果。
 * opts.extra:汇总步把会诊意见块传进来(自身已按 SYNTH_EXTRA_BUDGET 封顶),预算按含它的总长算;有 extra 时不裁候选 —— 专家意见点名的 code 得留在【候选】里,不然汇总模型被硬规则 1 拦住不敢选。
 * opts.lite:网关 / 专家两个 op 用;它们的提示词不用规则席位 core 与维基页,也各有自己的预算,跳过那两次查询与裁剪循环(15 位专家 × 7 次查询纯浪费)。
 */
export async function loadContext(db: D1Database, project: ProjectRow, step: Step, baseCodes: string[] = [], opts: { extra?: MessageExtra; lite?: boolean } = {}): Promise<LabContext> {
  const { extra, lite } = opts;
  const constraints = parseConstraints(project.constraints_json);
  const { slugs, notes } = convene(project, step);
  const markets = splitList(project.markets);
  const base_codes = [...new Set(baseCodes.map((x) => String(x).trim()).filter(Boolean))].slice(0, 3);

  // 专家 core(按召集顺序排,SQL 的 IN 不保序);lite 不读
  const exp = lite ? [] : (await db.prepare(`SELECT slug,title,domain,core FROM expert_skills WHERE slug IN (${ph(slugs.length)})`).bind(...slugs).all<ExpertRow>()).results ?? [];
  const experts = lite ? [] : slugs.map((s) => exp.find((e) => e.slug === s)).filter(Boolean).map((e) => ({ ...e, core: e.core.slice(0, CORE_MAX) }));
  if (!lite && experts.length < slugs.length) notes.push(`专家未入库:${slugs.filter((s) => !exp.some((e) => e.slug === s)).join(',')}`);

  const ingredients_all = await loadIngredients(db);
  let cands: CandidateRow[] = [], bases: Record<string, unknown>[] = [], ingredients: IngredientRow[] = [], catalog: CatalogRow[] = [];
  const wikiSlugs = [`format/${project.format}`];

  if (step === 'recommend') {
    const c = await candidates(db, project);
    cands = c.rows;
    if (c.note) notes.push(c.note);
  } else {
    if (base_codes.length) {
      bases = (await db.prepare(`SELECT * FROM formulas WHERE status IN ('sample','active') AND code IN (${ph(base_codes.length)})`).bind(...base_codes).all<Record<string, unknown>>()).results ?? [];
    }
    // 库内原料:functions 命中功效词 ∪ 基底 actives 的 inci_key 命中
    const terms = claimTerms(project.claims);
    const baseKeys = new Set<string>();
    for (const b of bases) for (const a of safeJson<any[]>(String(b.actives_json ?? ''), [])) { const k = inciKey(a?.inci); if (k) baseKeys.add(k); }
    ingredients = ingredients_all.filter((g) => baseKeys.has(inciKey(g.inci)) || terms.some((t) => g.functions.includes(t))).slice(0, 25);
    const keys = [...new Set(ingredients.map((g) => inciKey(g.inci)).filter(Boolean))];
    if (keys.length) {
      catalog = (await db.prepare(`SELECT inci_key,no,name_zh,max_leave,max_rinse FROM inci_catalog WHERE registry='cn-nmpa-2021' AND inci_key IN (${ph(keys.length)})`).bind(...keys).all<CatalogRow>()).results ?? [];
    }
    // 基底活性物对应的原料维基页 ≤2 张
    for (const g of ingredients_all) if (baseKeys.has(inciKey(g.inci)) && wikiSlugs.length < 3) wikiSlugs.push(`ingredient/${g.slug}`);
  }

  const wk = lite ? [] : (await db.prepare(`SELECT slug,title,body_md FROM wiki_pages WHERE slug IN (${ph(wikiSlugs.length)})`).bind(...wikiSlugs).all<WikiRow>()).results ?? [];
  const wiki = wikiSlugs.map((s) => wk.find((w) => w.slug === s)).filter(Boolean);
  const cut = (s: string | null) => (s ? String(s).slice(0, 600) : null);
  const regulations = markets.length
    ? ((await db.prepare(`SELECT id,country_zh,entry_zh,safety_zh,labeling_zh,lists_zh FROM regulations WHERE id IN (${ph(markets.length)})`).bind(...markets).all<RegRow>()).results ?? [])
        .map((r) => ({ ...r, entry_zh: cut(r.entry_zh), safety_zh: cut(r.safety_zh), labeling_zh: cut(r.labeling_zh), lists_zh: cut(r.lists_zh) }))
    : [];

  // 全绿标:库内原料里 facts 评红黄的列进「不得使用」;市场验证参考只给刘/黄总工(lite = 网关 / 专家不送,省 token)
  let not_green: string[] = [];
  if (constraints.all_green && ingredients.length) {
    const fk = [...new Set(ingredients.map((g) => factKey(g.inci)).filter(Boolean))];
    const rows = (await db.prepare(`SELECT inci_key,rating FROM ingredient_facts WHERE rating IN ('red','yellow') AND inci_key IN (${ph(fk.length)})`).bind(...fk).all<{ inci_key: string; rating: string }>()).results ?? [];
    not_green = rows.map((r) => `${r.inci_key}(${r.rating === 'red' ? '红' : '黄'})`);
  }
  const market_ref = lite ? '' : (await marketRef(db, project)).text;
  // ESG 硬要求段素材:目标市场下会判红的规则标题(esg_rules 表未建时 catch 成空,不阻塞出方案)
  let esg_red: string[] = [];
  if (constraints.all_green || constraints.esg) {
    const codes = marketsToCodes(project.markets);
    const rs = await db.prepare(`SELECT scope,title_zh FROM esg_rules WHERE active=1 AND severity='red' LIMIT 200`).all<{ scope: string; title_zh: string }>().then((r) => r.results ?? []).catch(() => []);
    esg_red = [...new Set(rs.filter((r) => scopeOn(r.scope, codes)).map((r) => r.title_zh).filter(Boolean))].slice(0, 15);
  }

  const ctx: LabContext = {
    step, project, constraints, experts, candidates: cands, bases, ingredients, catalog, wiki, regulations, ingredients_all, not_green, esg_red, market_ref,
    meta: {
      step, project_id: project.id, code: project.code, category: project.category, format: project.format, markets: project.markets,
      base_codes, experts: slugs, notes, candidate_codes: cands.map((c) => c.code), all_green: !!constraints.all_green,
      esg: !!constraints.esg, vegan: !!constraints.vegan,
      budget: { chars: 0, limit: BUDGET, dropped: [] },
    },
  };

  // 预算裁剪:每裁一刀重算一次(buildMessages 是纯函数,算得起);lite 不裁(网关 / 专家各有自己的预算)
  const size = () => buildMessages(step, ctx, extra).reduce((n, m) => n + m.content.length, 0);
  const dropped = ctx.meta.budget.dropped;
  let chars = lite ? 0 : size();
  while (chars > BUDGET) {
    const ing = ctx.wiki.findIndex((w) => w.slug.startsWith('ingredient/'));
    if (ing >= 0) { dropped.push(`wiki:${ctx.wiki[ing].slug}`); ctx.wiki.splice(ing, 1); }
    else if (ctx.wiki.length) { dropped.push(`wiki:${ctx.wiki[0].slug}`); ctx.wiki.splice(0, 1); }
    else if (!extra && ctx.candidates.length > 10) { dropped.push(`candidate:${ctx.candidates.pop()!.code}`); }
    else if (ctx.ingredients.length > 12) { dropped.push(`ingredient:${ctx.ingredients.pop()!.slug}`); }
    else if (ctx.experts.length > 3) { dropped.push(`expert:${ctx.experts.pop()!.slug}`); }
    else break;                                                 // 需求单永不裁
    chars = size();
  }
  ctx.meta.candidate_codes = ctx.candidates.map((c) => c.code);
  ctx.meta.experts = ctx.experts.map((e) => e.slug);
  ctx.meta.budget.chars = chars;
  return ctx;
}

/* ── 提示词(5.3)─────────────────────────────────────────────────────────── */
/** 认知三档固定原句;汇总 system 与每位专家的 system 都原样带 */
const TIER_NOTE = `## 认知三档(固定原句)
> 角色专家,不是真人。判断句尾的 ①公开常识 / ②经验推演 / ③存疑 是认知分层,不许把 ②③ 当 ① 用。
> 涉及法规处一律注明「以最新官方文本为准」。`;

const SYSTEM_HEAD = `你是帛卉化妆品实验室的配方会诊系统,由下列角色专家共同作答。

## 会诊规则(固定)
裁决分歧顺序不可交换:目标市场法规限量 > 安全评估结论 > 功效依据可得性 > 成本 > 肤感/外观;落后一位的诉求只能在前一位留下的空间里取值,每次取舍写下理由。
单一口径:稳定性条件与放行判据以稳定性与货架期专家为准(离心不合格即退回配方);防腐强度与挑战测试以微生物与防腐专家为准(防腐余量不可交易);vegan/cruelty-free/绿色宣称以伦理与可持续宣称专家为准;宣称能不能说以对应地区法规官为准。

${TIER_NOTE}

## 硬规则
1. 配方号只能从【候选】里选(推荐步);原料只能用【库内原料】【基底】【维基页】里出现过的名称或 INCI,每行必须给 INCI 名;清单外的原料只能放进 unlisted 并写明为什么需要,不得写进 phases。
2. 数字(用量、pH、限量)优先引用【库内原料】【目录】【基底】给出的值并写 source;资料里没有而配方必须有的基础料(水、多元醇、增稠等)可以给区间,但 source 必须写 "estimate"、tier 只能是 ② 或 ③,这些行会被标黄由总工核;资料里没有的判断写「待查」,不许编。
3. 每条判断对象带 tier 字段:"①" 公开常识 / "②" 经验推演 / "③" 存疑。
4. 只输出一个 JSON 对象,不加围栏、不加前言。
5. 工艺步骤(process)只引用相名与序号(如「A-1 ~ A-4 加热至 75℃」「B 相加入 A 相」),不写原料名——打版员按序号称量。
6. 不输出任何原料单价或配方成本数字(成本档只按 low / mid / high 讲结构);成本由系统按财务确认价计算 —— 2026-09-18 创始人:「价格由财务和采购确认,我们不可以瞎编」。
7. ${TABLE_NOTE}`;

const SHAPE: Record<Step, string> = {
  recommend: `{"picks":[{"code":"SR-1101","why":"为什么推荐","why_tier":"②","combo":"组合逻辑","expected":"预期功效","expected_tier":"①","selling":["卖点1","卖点2"],"risks":[{"text":"风险","tier":"③"}],"verify":["需验证项"]}],"notes":"整体说明"}
picks 最多 8 条(材料够时的上限,不够就少给),code 只能来自【候选】。**字数硬限**(创始人:「文字太多没时间看」):why / combo / expected 各 ≤ 30 字一句话;selling 最多 3 条、每条 ≤ 12 字;risks 最多 2 条、每条 ≤ 20 字;verify 最多 2 条、每条 ≤ 15 字;不写套话,不重复需求单。`,
  generate: `{"name":"配方名","system_type":"O/W | W/O | 水剂 | 无水 | 表活体系",
"phases":[{"phase":"A 水相","materials":[{"name":"甘油","inci":"GLYCERIN","pct":4,"pct_low":3,"pct_high":5,"purpose":"保湿剂","tier":"①","source":"base:SR-1101 | ingredients | catalog | estimate"}]}],
"process":[{"step":1,"text":"A-1 ~ A-4 加热至 75℃ 搅拌至均一","tier":"②"}],
"ph_window":{"low":5.0,"high":6.0,"tier":"②"},
"efficacy_logic":[{"claim":"宣称","because":"依据","tier":"②"}],
"selling_points":[{"text":"卖点","tier":"②"}],
"risks":[{"text":"风险","tier":"③"}],
"verify":[{"text":"验证项","how":"怎么验","tier":"②"}],
"unlisted":[{"name":"清单外原料","why":"为什么需要"}],
"decisions_for_customer":["需客户拍板的事"]}
**每个原料必须给完整比例 pct(定值,不是只给区间;创始人:「每个都需要有完整比例,有完整的就可以交给打版员」),全部 pct 相加必须正好 100,水相用 pct 补足到 100**;pct_low/pct_high 是可选的合理区间。**字数硬限**:efficacy_logic 最多 3 条、claim ≤ 8 字、because ≤ 25 字;selling_points 最多 3 条、每条 ≤ 12 字;risks 最多 3 条、每条 ≤ 20 字;verify 最多 3 条、text ≤ 12 字、how ≤ 15 字;process 每步 ≤ 25 字;decisions_for_customer 最多 2 条。`,
};

const nz = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const constraintsZh = (c: Constraints): string => {
  const out: string[] = [];
  if (c.halal) out.push('清真'); if (c.vegan) out.push('纯素'); if (c.fragrance_free) out.push('无香');
  if (c.no_mit_cmit) out.push('无 MIT/CMIT'); if (c.preservative_free) out.push('无防腐'); if (c.all_green) out.push('全绿标'); if (c.esg) out.push('ESG 全绿');
  if (c.ph_low != null || c.ph_high != null) out.push(`pH ${nz(c.ph_low)}–${nz(c.ph_high)}`);
  if (c.other) out.push(c.other);
  return out.length ? out.join(';') : '无';
};
const activesLine = (s: unknown) => safeJson<any[]>(String(s ?? ''), []).map((a) => `${a?.name ?? ''}(${a?.inci ?? ''} ${a?.pct ?? ''})`).join(' / ');

/** 需求单块(user 第一块;网关 / 专家 / 汇总三种提示词共用,永不裁) */
const briefBlock = (ctx: Pick<LabContext, 'project' | 'constraints'>): string => {
  const p = ctx.project;
  return `## 需求单\n客户:${nz(p.customer)} 品类:${catZh(p.category)}(${p.category}) 剂型:${fmtZh(p.format)}(${p.format}) ` +
    `目标功效:${nz(p.claims)} 目标市场:${splitList(p.markets).map((m) => MARKET_ZH[m] ?? m).join('、') || '—'} ` +
    `硬约束:${constraintsZh(ctx.constraints)} 成本档:${p.cost_band ? `${COST_BAND_ZH[p.cost_band] ?? p.cost_band}(${p.cost_band})` : '—'} 客户与竞品参考:${nz(p.brief)}`;
};
/** 资料块:recommend 候选;generate 基底 + 库内原料 + 目录。专家提示词按预算裁过的子集也走它 */
const dataBlocks = (step: Step, d: Pick<LabContext, 'candidates' | 'bases' | 'ingredients' | 'catalog'>): string[] => {
  if (step === 'recommend') return [
    `## 候选(只能从这里选 code)\n` + compact(d.candidates, ['code', 'category', 'format', 'benefits', ['actives(name+inci+pct)', (c) => activesLine(c.actives_json)], 'texture', 'ph', 'preservative', 'reg_class', 'markets', 'cost_band']),
  ];
  // 基底:列 = 各行非空键的并集(id / ai_summary / updated_at 不进),键名只写一次
  const skip = new Set(['id', 'ai_summary', 'updated_at']);
  const baseCols = [...new Set(d.bases.flatMap((b) => Object.keys(b).filter((k) => !skip.has(k) && b[k] !== null && b[k] !== '')))];
  return [
    `## 基底(勾选的库内示例配方,可整体沿用其体系)\n` + compact(d.bases, baseCols.map((k) => (k === 'actives_json' ? [k, (b) => activesLine(b[k])] : k) as CompactCol<Record<string, unknown>>)),
    `## 库内原料(优先从这里取)\n` + compact(d.ingredients, ['inci', ['中文名', (g) => g.name_zh], ['常见用量', (g) => g.use_level], ['pH范围', (g) => g.ph_range],
      ['配伍禁忌', (g) => (g.incompatible ?? '').slice(0, 200)], ['稳定性', (g) => (g.stability ?? '').slice(0, 200)],
      ['中国/欧盟/美国', (g) => [g.market_cn, g.market_eu, g.market_us].map((x) => x || '—').join('/')], ['成本档', (g) => g.cost_band], ['可信度', (g) => g.confidence]]),
    `## 目录(中国《已使用化妆品原料目录(2021年版)》)\n` + compact(d.catalog, ['inci_key', ['序号', (c) => c.no], ['标准中文名', (c) => c.name_zh], ['驻留类最高历史用量%', (c) => c.max_leave], ['淋洗类最高历史用量%', (c) => c.max_rinse]]),
  ];
};
const regBlock = (r: RegRow): string => `## 目标市场法规要点:${r.country_zh}\n备案路径:${nz(stripMd(r.entry_zh))}\n安全:${nz(stripMd(r.safety_zh))}\n标签:${nz(stripMd(r.labeling_zh))}\n清单:${nz(stripMd(r.lists_zh))}`;

/** 两侧共用同一对象;system 装规则 + 专家 + 维基 + 法规 + 形状,user 装需求单 + 资料行。extra:汇总步追加的会诊意见(system 段 + user 块,插在需求单之后) */
export function buildMessages(step: Step, ctx: LabContext, extra?: MessageExtra): { role: 'system' | 'user'; content: string }[] {
  const sys: string[] = [SYSTEM_HEAD];
  if (extra?.system) sys.push(extra.system);
  for (const e of ctx.experts) sys.push(expertBlock(e));
  for (const w of ctx.wiki) sys.push(wikiBlock(w));
  for (const r of ctx.regulations) sys.push(regBlock(r));
  // 总工 09-17:「输出的配方,现在客户都要求全绿合规,按照美丽修行那种标准确认」
  if (ctx.constraints.all_green) sys.push(`## 硬要求:全绿标\n所有原料须为绿标(无欧盟附录限用、无禁用、无 26 致敏香精、低刺激低致痘),任一红/黄标原料会被闸门整栏退回${ctx.not_green.length ? `;不得使用:${ctx.not_green.join('、')}` : ''}。`);
  // 创始人 09-18「符合 ESG 规范全绿」:目标市场下会判红的成分类别(esg_rules 取 title_zh)直接写进硬要求
  if (ctx.constraints.all_green || ctx.constraints.esg) sys.push(`## 硬要求:ESG 全绿(法规 / 环境 / 社会 / 安全四支柱)\n不得使用${ctx.esg_red.length ? `:${ctx.esg_red.join('、')}` : '目标市场禁用成分、塑料微珠、环状硅氧烷 D4/D5/D6、PFAS、珊瑚礁不友好 UV 滤剂、三氯生'};限量成分须给出用量并低于限量;动物来源、云母、棕榈衍生物需在 risks 里注明来源核实 / 证书要求。`);
  sys.push(`## 输出 JSON 形状\n${SHAPE[step]}`);

  const user: string[] = [briefBlock(ctx)];
  if (extra?.user) user.push(extra.user);
  if (ctx.market_ref) user.push(ctx.market_ref);   // GPT 设计包原则:频率 ≠ 销量;别家配方只作结构参考
  user.push(...dataBlocks(step, ctx));
  return [{ role: 'system', content: sys.join('\n\n') }, { role: 'user', content: user.join('\n\n') }];
}

/** sha256(system + '\n' + user) 十六进制;两栏同值即同题 */
export async function promptHash(messages: { role: string; content: string }[]): Promise<string> {
  const s = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') + '\n' + messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 先剥 ```json 围栏(照 translate.ts:366),再取首尾花括号之间(照 inquiry-ai.ts:32);失败返回 null,不自动重发 */
export function parseJson(raw: string): Record<string, any> | null {
  let s = String(raw ?? '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

/* ── 闸门(5.5)─────────────────────────────────────────────────────────────── */
const TIERS: Tier[] = ['①', '②', '③'];
const isWater = (name: string, key: string) => /^(去离子|纯化|纯净|纯)?水$/.test(name.trim()) || ['WATER', 'AQUA', 'AQUA WATER', 'WATER AQUA'].includes(key);

/**
 * 三档归一:tier 字段认 ①②③;缺失时认正文句尾的 ①②③;都没有 → 记 ③ 并进 yellow「未标档 · path」。
 * 返回归一后的档,调用方顺手计数。
 */
function fixTier(o: any, tierKey: string, textKeys: string[], path: string, g: GateJson): Tier {
  let t = TIERS.find((x) => String(o?.[tierKey] ?? '').includes(x));
  if (!t) for (const k of textKeys) { const m = /[①②③]+$/.exec(String(o?.[k] ?? '').trim()); if (m) { t = m[0].slice(-1) as Tier; break; } }
  if (!t) { t = '③'; g.yellow.push({ seq: path, reason: '未标档' }); }
  if (o && typeof o === 'object') o[tierKey] = t;
  g.tiers[t] += 1;
  return t;
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * 闸门。返回清洗后的输出(推荐:候选外 code 已剔;生成:每味原料带 seq/matched_by/catalog_no/flag)与 gate_json。
 * `ok=false` 只在推荐步 picks 为空时;生成步红项也返回 ok=true,由页面红标、adopt 时剔除。
 * 查库两次:cn-nmpa-2021(未在内存命中的 key)与 cn-stsc(全部 key,仅 markets 含 cn)。
 */
export async function gate(db: D1Database, step: Step, out: Record<string, any>, g: GateCtx): Promise<{ ok: boolean; out: RecommendOut | GenerateOut; gate: GateJson; msg?: string }> {
  const gj: GateJson = { red: [], yellow: [], dropped: [], tiers: { '①': 0, '②': 0, '③': 0 } };

  if (step === 'recommend') {
    const set = new Set(g.meta.candidate_codes);
    const seen = new Set<string>();
    const picks: PickOut[] = [];
    for (const p of Array.isArray(out.picks) ? out.picks : []) {
      const code = String(p?.code ?? '').trim();
      if (!set.has(code)) { gj.dropped.push(code || '(空)'); continue; }
      if (seen.has(code)) continue;
      seen.add(code);
      const i = picks.length;
      fixTier(p, 'why_tier', ['why'], `picks[${i}].why`, gj);
      fixTier(p, 'expected_tier', ['expected'], `picks[${i}].expected`, gj);
      p.selling = Array.isArray(p.selling) ? p.selling : []; p.verify = Array.isArray(p.verify) ? p.verify : [];
      p.risks = (Array.isArray(p.risks) ? p.risks : []).map((r: any, j: number) => { const o = typeof r === 'string' ? { text: r } : (r ?? {}); fixTier(o, 'tier', ['text'], `picks[${i}].risks[${j}]`, gj); return o; });
      picks.push(p as PickOut);
    }
    return { ok: picks.length > 0, out: { picks, notes: out.notes ? String(out.notes) : undefined }, gate: gj };
  }

  // ── generate ──
  const o = out as GenerateOut;
  o.phases = (Array.isArray(o.phases) ? o.phases : []).map((p: any, i: number) => ({ phase: String(p?.phase ?? `${String.fromCharCode(65 + i)} 相`), materials: Array.isArray(p?.materials) ? p.materials : [] }));
  const mats: (Material & { green_fn?: string; green_zh?: string })[] = [];
  // 相字母取相名首字母;撞了(「A 水相」「A' 后添加」、英文 Aqueous/Active)退回索引字母 ——
  // seq 是下游唯一定位键(toRecipe 剔红、opEdit 改行、打版员称量),两相同号会把好行连坐剔掉、改错行。
  const used = new Set<string>();
  o.phases.forEach((p, i) => {
    let letter = /^[A-Za-z]/.test(p.phase.trim()) ? p.phase.trim()[0].toUpperCase() : String.fromCharCode(65 + i);
    for (let k = i; used.has(letter); k++) letter = String.fromCharCode(65 + k);   // 索引字母也可能被前面的相占了,往后找到空位为止
    used.add(letter);
    p.materials.forEach((m: Material, j: number) => {
      m.seq = `${letter}-${j + 1}`;
      m.name = String(m.name ?? '').trim(); m.inci = String(m.inci ?? '').trim();
      m.pct_low = num(m.pct_low); m.pct_high = num(m.pct_high);
      m.source = String(m.source ?? '').trim();
      m.key = inciKey(m.inci || m.name);
      m.flag = null; m.matched_by = null; m.catalog_no = null;
      fixTier(m, 'tier', ['purpose'], m.seq, gj);
      mats.push(m);
    });
  });

  // 原料匹配:水放行 → 内存 ingredients → cn-nmpa-2021 一次 IN 查
  const byKey = new Map<string, IngredientRow>(); const byName = new Map<string, IngredientRow>();
  for (const r of g.ingredients_all) { const k = inciKey(r.inci); if (k) byKey.set(k, r); byName.set(r.name_zh, r); }
  const keys = [...new Set(mats.map((m) => m.key).filter(Boolean))];
  const nmpa = new Map<string, CatalogRow>();
  if (keys.length) {
    const rows = (await db.prepare(`SELECT inci_key,no,name_zh,max_leave,max_rinse FROM inci_catalog WHERE registry='cn-nmpa-2021' AND inci_key IN (${ph(keys.length)})`).bind(...keys).all<CatalogRow>()).results ?? [];
    for (const r of rows) if (!nmpa.has(r.inci_key)) nmpa.set(r.inci_key, r);   // 同 key 多序号取第一条
  }
  const stsc = new Map<string, { no: string; note: string | null }[]>();
  if (keys.length && splitList(g.meta.markets).includes('cn')) {
    const rows = (await db.prepare(`SELECT inci_key,no,note FROM inci_catalog WHERE registry='cn-stsc' AND inci_key IN (${ph(keys.length)})`).bind(...keys).all<{ inci_key: string; no: string; note: string | null }>()).results ?? [];
    for (const r of rows) stsc.set(r.inci_key, [...(stsc.get(r.inci_key) ?? []), r]);
  }
  const limitCol = RINSE.has(g.meta.format) ? 'max_rinse' : 'max_leave';
  const yellow = (m: Material, reason: string, note?: string) => { if (m.flag !== 'red') m.flag = 'yellow'; m.flag_note = [m.flag_note, reason].filter(Boolean).join(';'); gj.yellow.push({ seq: m.seq!, reason, ...(note ? { note } : {}) }); };
  const red = (m: Material, reason: string, note?: string) => { m.flag = 'red'; m.flag_note = [m.flag_note, reason].filter(Boolean).join(';'); gj.red.push({ seq: m.seq!, reason, ...(note ? { note } : {}) }); };

  let sumLow = 0, sumHigh = 0, hasWater = false;
  for (const m of mats) {
    const cat = nmpa.get(m.key!);
    if (isWater(m.name, m.key!)) { m.matched_by = 'water'; hasWater = true; }
    else if (byKey.has(m.key!) || byName.has(m.name)) { m.matched_by = 'ingredients'; m.catalog_no = cat?.no ?? null; }
    else if (cat) { m.matched_by = 'catalog'; m.catalog_no = cat.no; }
    else red(m, `库内未找到:${m.name || m.inci}`);

    // 估算:source='estimate',或没写 source 但只靠目录命中(库里没这味料的用量依据);水是平衡相,不用总工核
    if (m.matched_by !== 'water' && (m.source === 'estimate' || (!m.source && m.matched_by === 'catalog'))) {
      if (m.tier === '①') { gj.tiers['①'] -= 1; gj.tiers['②'] += 1; m.tier = '②'; }
      yellow(m, '估算区间,需总工核');
    }
    // cn 负面清单:按 no 前缀判,不解析 note 数值
    for (const h of stsc.get(m.key!) ?? []) {
      const pre = /^CN-(\d{3})\//.exec(h.no)?.[1];
      if (pre === '109' || pre === '110') red(m, `禁用(${h.no})`, h.note ?? undefined);
      else if (pre === '111') yellow(m, `限用(${h.no})`, h.note ?? undefined);
      else if (pre && pre >= '112' && pre <= '115') yellow(m, `准用,限量见 note(${h.no})`, h.note ?? undefined);
    }
    // 限量:超目录最高历史使用量
    const lim = num(cat?.[limitCol] ?? cat?.[limitCol === 'max_rinse' ? 'max_leave' : 'max_rinse']);
    if (lim !== null && m.pct_high !== null && m.pct_high > lim) yellow(m, `超目录最高历史使用量 ${lim}%`);
    // 区间自身
    if (m.pct_low === null || m.pct_high === null || m.pct_low > m.pct_high) yellow(m, '用量区间缺失或上下颠倒');
    else if (m.matched_by !== 'water') { sumLow += m.pct_low; sumHigh += m.pct_high; }
  }
  // 完整比例(创始人 12:5x:每个原料必须有定值,Σ = 100):缺 pct 黄牌;Σpct 偏离 100 超过 0.5 黄牌,水行自动补平
  {
    let sumPct = 0, missing = 0, waterRow: any = null;
    for (const m of mats) {
      const raw: unknown = (m as any).pct;
      const v = raw === undefined || raw === null || raw === '' ? null : Number(raw);
      m.pct = v !== null && Number.isFinite(v) ? v : null;
      if (m.pct === null) { missing++; if (m.matched_by === 'water') waterRow = m; else yellow(m, '缺完整比例 pct'); }
      else sumPct += m.pct;
    }
    if (waterRow && missing === 1) { waterRow.pct = Math.round((100 - sumPct) * 100) / 100; sumPct = 100; missing = 0; }
    if (mats.length && !missing && Math.abs(sumPct - 100) > 0.5) gj.yellow.push({ seq: 'phases', reason: `完整比例合计 ${sumPct.toFixed(2)}%,应为 100%` });
  }
  // 全绿标(总工 09-17「按照美丽修行那种标准确认」):每行挂 facts 评级;项目要求全绿时任一红黄行整栏不过,并给同功能绿标替代
  await rateMaterials(db, mats);
  let msg: string | undefined;
  if (g.meta.all_green) {
    const bad = mats.filter((m) => m.green === 'yellow' || m.green === 'red');
    if (bad.length) {
      const lines: string[] = [];
      for (const m of bad) {
        const first = (m.green_fn ?? '').split(/[,;·]/)[0]?.trim() ?? '';
        const alt = await greenAlts(db, first, factKey(m.inci || m.name));   // 与 esgCheck 共用同一条替代查询(任务 G)
        const altS = alt.length ? `替代:${alt.map((a) => `${a.name_zh || a.inci_key}(${a.inci_key})`).join(' / ')}` : '';
        const lv = m.green === 'red' ? '红' : '黄';
        red(m, `非绿标(${lv}):${m.green_zh || '—'}`, altS || undefined);
        lines.push(`${m.name || m.inci} · ${lv} · ${m.green_zh || '—'}${altS ? ' · ' + altS : ''}`);
      }
      msg = `全绿标不通过,${bad.length} 项红/黄:` + lines.join(';');
    }
  }
  // ESG 四支柱(创始人 09-18):all_green / esg 项目红行整栏退回;其它项目也算,只挂 gate_json.esg 给页面看,不拦
  {
    const fmt = g.meta.format;
    const esg = await esgCheck(db, mats.map((m) => ({ seq: m.seq!, inci: m.inci, name: m.name, pct: m.pct ?? m.pct_high ?? null })), {
      markets: marketsToCodes(g.meta.markets), form: formatToForm(fmt), sunscreen: SUN.test(fmt), strict: !!(g.meta.all_green || g.meta.esg), vegan: !!g.meta.vegan,
    });
    gj.esg = esg;
    if ((g.meta.all_green || g.meta.esg) && esg.pass === false) {
      const nRed = esg.hits.filter((h) => h.severity === 'red').length, nYel = esg.hits.length - nRed;
      for (const h of esg.hits) { const m = mats.find((x) => x.seq === h.seq); if (!m) continue; if (h.severity === 'red') red(m, `ESG:${h.title_zh}(${h.basis})`); else yellow(m, `ESG:${h.title_zh}(${h.basis})`); }
      msg = [msg, `ESG 不通过:${nRed} 项红,${nYel} 项黄`].filter(Boolean).join(';');
    }
  }
  // 配比闭合:水按平衡(有水行只要 Σlow ≤ 100;无水行要 Σlow ≤ 100 ≤ Σhigh)
  if (mats.length && (sumLow > 100 || (!hasWater && sumHigh < 100))) gj.yellow.push({ seq: 'phases', reason: `配比不闭合:Σpct_low ${sumLow.toFixed(2)} / Σpct_high ${sumHigh.toFixed(2)}${hasWater ? '(水按平衡)' : ''}` });

  // 其余判断对象的三档
  o.process = (Array.isArray(o.process) ? o.process : []).map((s: any, i: number) => { const x = typeof s === 'string' ? { step: i + 1, text: s } : (s ?? {}); fixTier(x, 'tier', ['text'], `process[${i}]`, gj); return x; });
  o.ph_window = o.ph_window && typeof o.ph_window === 'object' ? o.ph_window : { low: null, high: null } as any;
  fixTier(o.ph_window, 'tier', [], 'ph_window', gj);
  const arr = (k: 'efficacy_logic' | 'selling_points' | 'risks' | 'verify', textKeys: string[]) => {
    (o as any)[k] = (Array.isArray((o as any)[k]) ? (o as any)[k] : []).map((s: any, i: number) => { const x = typeof s === 'string' ? { [textKeys[0]]: s } : (s ?? {}); fixTier(x, 'tier', textKeys, `${k}[${i}]`, gj); return x; });
  };
  arr('efficacy_logic', ['because', 'claim']); arr('selling_points', ['text']); arr('risks', ['text']); arr('verify', ['text', 'how']);
  // unlisted:每条红,整段不可采纳
  o.unlisted = (Array.isArray(o.unlisted) ? o.unlisted : []).map((u: any) => (typeof u === 'string' ? { name: u, why: '' } : { name: String(u?.name ?? ''), why: String(u?.why ?? '') }));
  o.unlisted.forEach((u, i) => gj.red.push({ seq: `unlisted[${i}]`, reason: `清单外原料:${u.name}`, note: u.why || undefined }));
  o.decisions_for_customer = Array.isArray(o.decisions_for_customer) ? o.decisions_for_customer.map(String) : [];
  o.name = String(o.name ?? '').trim(); o.system_type = String(o.system_type ?? '').trim();
  return { ok: !msg, out: o, gate: gj, msg };
}

/**
 * 采纳:草案相表 → recipe_json 行数组(2.2)。红项(未匹配 / 禁用)剔除并返回 dropped 供写进 version.gate_json.dropped;
 * 黄项原样保留带 flag(黄牌要人签是备案步规则,草案阶段只显示)。pct 采纳时为 null,op:'edit' 才填。
 */
export function toRecipe(out: GenerateOut, g: GateJson): { rows: RecipeRow[]; dropped: GateItem[] } {
  const reds = new Set(g.red.map((r) => r.seq));
  const rows: RecipeRow[] = [], dropped: GateItem[] = [];
  for (const p of out.phases ?? []) for (const m of p.materials ?? []) {
    if (reds.has(m.seq!)) { dropped.push(...g.red.filter((r) => r.seq === m.seq)); continue; }
    rows.push({ seq: m.seq!, phase: p.phase, name: m.name, inci: m.inci, pct_low: m.pct_low, pct_high: m.pct_high, pct: m.pct ?? null,
      purpose: String(m.purpose ?? ''), tier: m.tier, source: m.source, flag: m.flag === 'yellow' ? 'yellow' : null, catalog_no: m.catalog_no ?? null,
      green: m.green ?? null, irr: m.irr ?? null, com: m.com ?? null });
  }
  return { rows, dropped };
}

/* ── 全绿标评级 + 市场验证参考(任务 L)──────────────────────────────────────── */
/** 每行按 factKey(inci) 一次 IN 查 ingredient_facts,挂 green / irr / com(gate 与 opEdit 共用;无 facts 行 null)。green_fn / green_zh 只给 gate 拼原因,不入库 */
export async function rateMaterials<T extends { inci: string; name?: string }>(db: D1Database, rows: T[]): Promise<(T & { green?: Green | null; irr?: number | null; com?: number | null; green_fn?: string; green_zh?: string })[]> {
  const keys = [...new Set(rows.map((m) => factKey(m.inci || m.name || '')).filter(Boolean))];
  type Fact = { inci_key: string; rating: string; irritancy: number | null; comedogenic: number | null; functions: string | null; functions_zh: string | null };
  const facts = new Map<string, Fact>();
  if (keys.length) {
    const rs = (await db.prepare(`SELECT inci_key,rating,irritancy,/* 致痘分只出有文献出处的(09-24 W1:公司库 118 条带 comedogenic_src) */ CASE WHEN comedogenic_src <> '' THEN comedogenic END AS comedogenic,functions,functions_zh FROM ingredient_facts WHERE inci_key IN (${ph(keys.length)})`).bind(...keys).all<Fact>()).results ?? [];
    for (const r of rs) facts.set(r.inci_key, r);
  }
  for (const m of rows as any[]) {
    const f = facts.get(factKey(m.inci || m.name || ''));
    m.green = f && ['green', 'yellow', 'red'].includes(f.rating) ? (f.rating as Green) : null;
    m.irr = f?.irritancy ?? null; m.com = f?.comedogenic ?? null;
    if (f) { m.green_fn = f.functions ?? ''; m.green_zh = f.functions_zh ?? ''; }
  }
  return rows as any;
}

/** 原料库定价(创始人 09-18「多选原料和价格」;价格只认导入 / 人工填,不编):
 *  已带 material_id 的行按 id 取;其余按 inci_key(=factKey(inci 第一个成分))取 lab_materials 里 active 且有价的一条并挂上 material_id ——
 *  同 inci 多供应商时财务已确认的优先,其次最低价(创始人 09-18 12:5x「价格由财务和采购确认,我们不可以瞎编」:只有 finance_confirmed 当准数)。
 *  返回带 price / price_at / price_status / material_id 的行 + 汇总:cost 只累加财务确认行,cost_all 连待确认一起,missing 是无价 / 无 pct 行 */
export async function priceMaterials<T extends { inci: string; name?: string; pct?: number | null; material_id?: number | null }>(db: D1Database, rows: T[]): Promise<{ rows: (T & { material_id: number | null; price: number | null; price_at: string | null; price_status: PriceStatus | null })[]; summary: CostSummary }> {
  type Mat = { id: number; inci_key: string; price: number | null; price_at: string | null; price_status: PriceStatus | null };
  const keyOf = (m: { inci: string; name?: string }) => factKey((m.inci || m.name || '').split(/[,，]/)[0]);
  const ids = [...new Set(rows.map((m) => Number(m.material_id)).filter((x) => Number.isFinite(x) && x > 0))];
  const byId = new Map<number, Mat>();
  if (ids.length) for (const r of (await db.prepare(`SELECT id,inci_key,price,price_at,price_status FROM lab_materials WHERE status='active' AND id IN (${ph(ids.length)})`).bind(...ids).all<Mat>()).results ?? []) byId.set(r.id, r);
  const keys = [...new Set(rows.filter((m) => !byId.has(Number(m.material_id))).map(keyOf).filter(Boolean))];
  const byKey = new Map<string, Mat>();   // ORDER BY 财务确认优先、再最低价,首见即取
  if (keys.length) for (const r of (await db.prepare(`SELECT id,inci_key,price,price_at,price_status FROM lab_materials WHERE status='active' AND price IS NOT NULL AND inci_key IN (${ph(keys.length)}) ORDER BY (price_status='finance_confirmed') DESC, price ASC`).bind(...keys).all<Mat>()).results ?? []) if (!byKey.has(r.inci_key)) byKey.set(r.inci_key, r);
  let cost = 0, pending = 0, missing = 0, confirmed = 0, unconfirmed = 0;
  for (const m of rows as any[]) {
    const f = byId.get(Number(m.material_id)) ?? byKey.get(keyOf(m)) ?? null;
    m.material_id = f?.id ?? null; m.price = f?.price ?? null; m.price_at = f?.price_at ?? null; m.price_status = f?.price_status ?? null;
    const pct = m.pct === null || m.pct === undefined ? null : Number(m.pct);
    if (m.price === null || pct === null || !Number.isFinite(pct)) missing++;
    else if (m.price_status === 'finance_confirmed') { confirmed++; cost += pct / 100 * m.price; }
    else { unconfirmed++; pending += pct / 100 * m.price; }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { rows: rows as any, summary: { cost: confirmed ? r2(cost) : null, cost_all: confirmed + unconfirmed ? r2(cost + pending) : null, missing, n: rows.length, confirmed, unconfirmed } };
}

/** 同功能绿标替代:functions 首标签 LIKE,排除自己;avoidTag 给出时再排除 tags 含该标签的(gate 全绿块与 esgCheck 共用) */
export async function greenAlts(db: D1Database, first: string, selfKey: string, avoidTag = ''): Promise<{ inci_key: string; name_zh: string; functions_zh: string }[]> {
  if (!first) return [];
  const rs = (await db.prepare(`SELECT inci_key,name_zh,functions_zh FROM ingredient_facts WHERE rating='green' AND functions LIKE ? AND inci_key<>? AND (?='' OR IFNULL(tags,'') NOT LIKE ?) ORDER BY rowid LIMIT 3`)
    .bind(`${first}%`, selfKey, avoidTag, `%"${avoidTag}"%`).all<{ inci_key: string; name_zh: string | null; functions_zh: string | null }>()).results ?? [];
  return rs.map((a) => ({ inci_key: a.inci_key, name_zh: a.name_zh ?? '', functions_zh: a.functions_zh ?? '' }));
}

/* ── ESG 四支柱闸门(任务 G;创始人 09-18「符合 ESG 规范全绿」)────────────────────── */
/** 淋洗剂型:洁面 / 洗发 / 护发素 / 沐浴 / 牙膏 / 洗手 / 磨砂 / 卸妆(契约剂型表);其余驻留 */
const RINSE_ESG = new Set([...RINSE, 'toothpaste', 'tooth-tablet', 'tooth-strip', 'gum-powder', 'conditioner', 'hair-mask', 'kids-shampoo', 'kids-wash', 'cleansing-oil', 'micellar']);
/** 防晒剂型:算驻留,且 applies='sunscreen' 规则生效 */
const SUN = /^(sun-|spf$)/;
export const formatToForm = (format: string): 'rinse-off' | 'leave-on' => (RINSE_ESG.has(format) ? 'rinse-off' : 'leave-on');
/** project.markets(逗号串,码或中文)→ 规则 scope 码 */
const MARKET_CODE: Record<string, string> = { 中国: 'cn', 欧盟: 'eu', 美国: 'us', 日本: 'jp', 韩国: 'kr', 东南亚: 'asean', 东盟: 'asean', 巴西: 'br', 加拿大: 'ca', 法国: 'fr' };
export const marketsToCodes = (markets: string | null | undefined): string[] =>
  [...new Set(splitList(markets).map((m) => MARKET_CODE[m] ?? m.toLowerCase()).filter((m) => /^[a-z-]+$/.test(m)))];
/** scope='ALL' 永远生效;否则逗号码与目标市场有交集;us-* 州码在目标含 us 时也算(契约) */
const scopeOn = (scope: string | null | undefined, codes: string[]): boolean => {
  const sc = splitList(scope).map((x) => x.toLowerCase());
  return !sc.length || sc.includes('all') || sc.some((x) => codes.includes(x) || (x.startsWith('us-') && codes.includes('us')));
};
/** note 里抽百分数:恰好一个 → 限量;多个或带条件 → null(整段给人看,判「需人工核」);形如「1%」「1,0 %」「(a) 2.0%」 */
const pctFromNote = (note: string | null | undefined): number | null => {
  const ms = [...String(note ?? '').matchAll(/(\d+[.,]\d*|\d+)\s*%/g)].map((m) => Number(m[1].replace(',', '.')));
  return ms.length === 1 && Number.isFinite(ms[0]) ? ms[0] : null;
};
const SEV: Record<Green, number> = { green: 0, yellow: 1, red: 2 };
/**
 * ESG 四支柱核查:一次读 esg_rules(≤200 行内存匹配),tag 走 ingredient_facts.tags 一次 IN 查,registry 走 inci_catalog 一次 IN 查。
 * 表不存在(迁移未跑)→ pass:null、hits 空,不抛。红 = 禁用 / 超限量 / 客户标准排除;黄 = 限量内 / 需声明 / 需证书 / 需人工核。
 */
export async function esgCheck(db: D1Database, rows: { seq: string; inci: string; name?: string; pct: number | null }[],
  opts: { markets: string[]; form: 'rinse-off' | 'leave-on'; sunscreen?: boolean; strict?: boolean; vegan?: boolean }): Promise<EsgCheck> {
  const p0 = () => ({ status: 'green' as Green, n: 0 });
  const out: EsgCheck = { standard: 'bohui-esg-v1', checked_at: new Date().toISOString(), form: opts.form, markets: opts.markets, pass: null,
    pillars: { regulatory: p0(), environment: p0(), social: p0(), safety: p0() }, hits: [], alternatives: {} };
  let rules: EsgRule[];
  try { rules = (await db.prepare(`SELECT * FROM esg_rules WHERE active=1 LIMIT 200`).all<EsgRule>()).results ?? []; } catch { return out; }   // 表缺失:pass:null 不拦
  if (rules[0]?.standard) out.standard = rules[0].standard;
  // scope / applies / 严格档 先筛一遍
  rules = rules.filter((r) => scopeOn(r.scope, opts.markets)
    && (!r.applies || r.applies === 'all' || r.applies === opts.form || (r.applies === 'sunscreen' && !!opts.sunscreen))
    && (opts.strict || !String(r.note ?? '').includes('严格档')));
  const mats = rows.map((r) => ({ ...r, key: factKey(r.inci || r.name || ''), pct: r.pct === null || r.pct === undefined || !Number.isFinite(Number(r.pct)) ? null : Number(r.pct) })).filter((r) => r.key);
  const keys = [...new Set(mats.map((m) => m.key))];
  type Fact = { inci_key: string; tags: string | null; functions: string | null };
  const facts = new Map<string, Fact>();   // tags 给 tag 规则,functions 给替代查询,所以总查
  const cat = new Map<string, { registry: string; no: string; note: string | null }[]>();
  if (keys.length) {
    const fs = (await db.prepare(`SELECT inci_key,tags,functions FROM ingredient_facts WHERE inci_key IN (${ph(keys.length)})`).bind(...keys).all<Fact>()).results ?? [];
    for (const f of fs) facts.set(f.inci_key, f);
    if (rules.some((r) => r.match_type === 'registry')) {
      const rs = (await db.prepare(`SELECT inci_key,registry,no,note FROM inci_catalog WHERE registry<>'cn-nmpa-2021' AND inci_key IN (${ph(keys.length)})`).bind(...keys).all<{ inci_key: string; registry: string; no: string; note: string | null }>()).results ?? [];
      for (const r of rs) cat.set(r.inci_key, [...(cat.get(r.inci_key) ?? []), r]);
    }
  }
  const tagsOf = (k: string): string[] => safeJson<string[]>(facts.get(k)?.tags, []).map(String);
  const hitTag = new Map<string, string>();   // seq → 命中的 tag(替代查询排除同标签)
  for (const m of mats) for (const r of rules) {
    const pat = String(r.pattern ?? '').trim(); if (!pat) continue;
    let ok = false, limitNote: string | null = null;
    switch (r.match_type) {
      case 'key': ok = factKey(pat) === m.key; break;
      case 'prefix': ok = m.key.startsWith(pat.toUpperCase()); break;
      case 'contains': ok = m.key.includes(pat.toUpperCase()); break;
      case 'regex': try { ok = new RegExp(pat, 'i').test(m.key); } catch { ok = false; } break;
      case 'tag': ok = tagsOf(m.key).includes(pat); if (ok) hitTag.set(m.seq, pat); break;
      case 'registry': { const h = (cat.get(m.key) ?? []).find((c) => `${c.registry}:${c.no}`.startsWith(pat)); if (h) { ok = true; limitNote = h.note ?? ''; } break; }
    }
    if (!ok) continue;
    let sev = r.severity, title = r.title_zh ?? '';
    const reason = r.reason_zh ?? '';
    // 纯素未要求:动物来源只黄不红(契约)
    if (sev === 'red' && r.pillar === 'social' && !opts.vegan && /动物|纯素/.test(`${title}${reason}${r.note ?? ''}`)) sev = 'yellow';
    // 州级规则(us-ca / us-hi …)标出来(契约:us 目标市场时给出但标「州级」)
    if (splitList(r.scope).some((x) => x.toLowerCase().startsWith('us-'))) title = `${title}(州级)`;
    const hit: EsgHit = { seq: m.seq, inci: m.inci || m.name || m.key, pct: m.pct, pillar: r.pillar, severity: sev, rule_id: r.id, title_zh: title, reason_zh: reason, basis: r.basis ?? '', basis_url: r.basis_url ?? null };
    // 限量核算:规则 limit_pct 优先,其次目录 note / 规则 note 抽百分数;超 → 升红「超限量」,未超 → 黄,抽不出 → 黄「需人工核」
    if (sev === 'yellow' && (r.limit_pct != null || limitNote !== null || /%/.test(r.note ?? ''))) {
      const noteTxt = limitNote || r.note || '';
      const max = r.limit_pct ?? pctFromNote(noteTxt);
      const exceeds = max !== null && m.pct !== null ? m.pct > max : null;
      hit.limit = { max, note: noteTxt.slice(0, 300), exceeds };
      if (exceeds === true) { hit.severity = 'red'; hit.title_zh = `超限量 ${max}%:${title}`; }
      else if (exceeds === false) hit.reason_zh = `${reason}(限量 ${max}% 内,注意标签措辞)`;
      else hit.reason_zh = `${reason}(限量需人工核:${noteTxt.slice(0, 120) || '未抽出百分数'})`;
    }
    out.hits.push(hit);
  }
  for (const h of out.hits) { const p = out.pillars[h.pillar]; p.n++; if (SEV[h.severity] > SEV[p.status]) p.status = h.severity; }
  out.pass = !out.hits.some((h) => h.severity === 'red');
  // 替代:每个红黄行按 functions 首标签找绿标(≤3),tag 命中时再排除同标签
  for (const seq of new Set(out.hits.map((h) => h.seq))) {
    const m = mats.find((x) => x.seq === seq); if (!m) continue;
    const first = (facts.get(m.key)?.functions ?? '').split(/[,;·]/)[0]?.trim() ?? '';
    const alt = await greenAlts(db, first, m.key, hitTag.get(seq) ?? '');
    if (alt.length) out.alternatives[seq] = alt;
  }
  return out;
}

/** 剂型码 → market_products 的品类值(库里 cat_zh 有 2751 行为 NULL、cat 列才是中文,两列 COALESCE);对不上的剂型回落到品类 */
const MARKET_CAT: [RegExp, string[]][] = [
  [/serum|essence|ampoule|toner|mist|spray/, ['精华', '水/乳液']], [/cream|balm|sleeping/, ['面霜']], [/^lotion$/, ['乳液', '水/乳液']],
  [/cleans|foam|micellar|scrub|^cleanser$/, ['洁面']], [/mask|patch|mud|jelly/, ['面膜']], [/sun|spf/, ['防晒']],
  [/shampoo/, ['洗发', '洗发护发']], [/conditioner|hair/, ['护发素', '护发', '洗发护发']], [/body|wash/, ['身体乳', '身体']],
  [/tooth|mouth|oral|gum/, ['牙膏', '口腔']], [/lip|gloss/, ['口红']], [/foundation|cushion|concealer|powder/, ['粉底', '彩妆']],
];
const MARKET_CAT_BY_CATEGORY: Record<string, string[]> = { skincare: ['护肤'], body: ['身体'], makeup: ['彩妆'], oral: ['口腔'], cleansing: ['洁面'], suncare: ['防晒'], haircare: ['洗发护发'], kids: ['儿童'], fragrance: ['香水'] };
/** 项目市场 → market_products.country;cn 库里没有,asean 归 gl;全对不上就不按国家筛 */
const MARKET_COUNTRY: Record<string, string> = { eu: 'eu', us: 'us', jp: 'jp', kr: 'kr', asean: 'gl' };
/** 出现频率排除的基础成分(水 / 多元醇 / 常规防腐 / 螯合 / 调 pH,款款都有,进 Top 没信息量) */
const MARKET_BASE = ['WATER', 'AQUA', 'GLYCERIN', 'BUTYLENE GLYCOL', 'PHENOXYETHANOL', '1,2-HEXANEDIOL', 'PROPANEDIOL', 'ETHYLHEXYLGLYCERIN', 'DISODIUM EDTA', 'SODIUM HYDROXIDE'];
export type MarketRefRow = { k: string; n: number; pct: number };
/**
 * 市场验证参考:同品类公开全成分里出现频率 Top 15(GPT 设计包原则:频率 ≠ 销量;INCI 顺序 ≠ 精确浓度)。
 * market_product_inci 由主线 A 任务全量灌入,09-18 尚为空 → rows 空、text 空串;表不存在同样吞成空。
 */
export async function marketRef(db: D1Database, project: Pick<ProjectRow, 'category' | 'format' | 'markets'>): Promise<{ rows: MarketRefRow[]; total: number; cats: string[]; text: string }> {
  const cats = MARKET_CAT.find(([re]) => re.test(project.format))?.[1] ?? MARKET_CAT_BY_CATEGORY[project.category] ?? ['其他'];
  const countries = [...new Set(splitList(project.markets).map((m) => MARKET_COUNTRY[m]).filter(Boolean))];
  const where = `COALESCE(p.cat_zh,p.cat) IN (${ph(cats.length)})${countries.length ? ` AND p.country IN (${ph(countries.length)})` : ''}`;
  try {
    const [tq, rq] = await db.batch([
      db.prepare(`SELECT COUNT(*) n FROM market_products p WHERE ${where} AND p.inci IS NOT NULL AND p.inci<>''`).bind(...cats, ...countries),
      db.prepare(`SELECT i.inci_key k, COUNT(DISTINCT i.product_id) n FROM market_product_inci i JOIN market_products p ON p.id=i.product_id WHERE ${where} AND i.inci_key NOT IN (${ph(MARKET_BASE.length)}) GROUP BY i.inci_key ORDER BY n DESC LIMIT 15`).bind(...cats, ...countries, ...MARKET_BASE),
    ]);
    const total = Number((tq.results?.[0] as any)?.n ?? 0);
    const rows = ((rq.results ?? []) as { k: string; n: number }[]).map((r) => ({ k: r.k, n: r.n, pct: total ? Math.round((r.n / total) * 1000) / 10 : 0 }));
    if (!rows.length) return { rows, total, cats, text: '' };
    const text = `## 市场验证参考(同品类公开全成分的出现频率,不是销量;别家配方只作结构参考,不得照抄)\n${cats.join('/')} · ${countries.length ? countries.join('/') : '全部市场'} · ${total} 款:` +
      rows.map((r) => `${r.k} ${r.n}款(${r.pct}%)`).join(';');
    return { rows, total, cats, text: text.slice(0, 600) };
  } catch { return { rows: [], total: 0, cats, text: '' }; }   // 表不存在 / 列缺:块为空,不拦生成
}

/* ── 会诊网关(v0.1)───────────────────────────────────────────────────────── */
/**
 * 名册(40 位 expert,不限 for_lab —— 谁该介入由总控判)+ 总控 core。
 * core 从「## 已知缺口」起截掉:那段写着安全评估员 / 香精 / 面膜等「还没建」,库里早已有,留着总控就不召他们;
 * 它后面那份名册也是触发词截断版,由 rows 拼的整表代替。
 */
export async function roster(db: D1Database): Promise<{ panel: string; rows: RosterRow[] }> {
  const [p, r] = await db.batch([
    db.prepare(`SELECT core FROM expert_skills WHERE slug='bohui-expert-panel'`),
    db.prepare(`SELECT slug,title,domain,triggers FROM expert_skills WHERE kind='expert' ORDER BY domain, slug`),
  ]);
  const core = String((p.results?.[0] as { core?: string } | undefined)?.core ?? '');
  const cut = core.indexOf('## 已知缺口');
  return { panel: stripMd(cut > 0 ? core.slice(0, cut) : core), rows: (r.results ?? []) as RosterRow[] };
}

const GATEWAY_HEAD = `## 你的任务:会诊总控(不是专家本人)
实验室工程师不选专家,由你按需求单从下方名册召集。做三件事:
1. 拆题:把需求拆成 3–8 个子问题,每条写 topic(落在哪个域)与 question(一句话,能直接问出口);
2. 定席:必审 must 5–9 位、旁听 optional 0–6 位;slug 只能从名册原样抄;每位一句他必须回答的问题(不同专家问不同的事,别抄同一句)。
   主答配方专家、防腐、稳定性、目标市场法规官这类固定席位系统会自动并入,你按题召集就行,不用为凑数塞人;故意召集会有异议的组合 —— 只叫同意的人等于没会诊。
3. 给 system_type_hint:O/W | W/O | 水剂 | 无水 | 表活体系 | 待定。
只输出一个 JSON 对象,不加围栏、不加前言。`;
const GATEWAY_SHAPE = `{"analysis":{"system_type_hint":"水剂","sub_questions":[{"topic":"防腐","question":"无 MIT/CMIT 且 pH 5 的水剂,防腐体系怎么配"}]},"must":[{"slug":"bohui-micro-preservation","question":"这个 pH 与约束下防腐体系怎么配、挑战测试怎么做"}],"optional":[{"slug":"bohui-packaging-compatibility","question":"…"}],"notes":"整体判断"}`;

/** 网关提示词:system = 总控 core + 任务 + 整份名册 + 形状;user = 需求单 + 本阶段(recommend 报候选 code;generate 附基底行) */
export function buildGatewayMessages(ctx: LabContext, r: { panel: string; rows: RosterRow[] }): { role: 'system' | 'user'; content: string }[] {
  const sys = [
    r.panel, GATEWAY_HEAD,
    `## 专家名册(${TABLE_NOTE})\n` + compact(r.rows, ['slug', ['职称', (x) => x.title], ['域', (x) => x.domain], ['何时召集', (x) => stripMd(x.triggers).replace(/\s+/g, ' ')]]),
    `## 输出 JSON 形状\n${GATEWAY_SHAPE}`,
  ];
  const user = [
    briefBlock(ctx),
    `## 本阶段\n` + (ctx.step === 'recommend'
      ? `推荐基底:从库内 ${ctx.candidates.length} 条示例配方里挑可沿用的体系(候选:${ctx.meta.candidate_codes.join(', ') || '—'})`
      : `生成配方草案,基底:${ctx.meta.base_codes.join(', ') || '—'}`),
  ];
  if (ctx.step === 'generate' && ctx.bases.length) user.push(dataBlocks('generate', { ...ctx, ingredients: [], catalog: [] })[0]);
  return [{ role: 'system', content: sys.join('\n\n') }, { role: 'user', content: user.join('\n\n') }];
}

const DEFAULT_Q = '按你的判断口径审这份需求单:给出立场、风险、红线与必须验证项';
/**
 * 网关输出校验:slug ⊆ 名册(不在的记 dropped;模型抄短名漏了 bohui- 前缀的先补上再认);与规则 convene() 的席位取并集,规则席位排最前;
 * must 上限 9(超出的降到 optional 最前);optional 上限 6(免费模型串行每位约 45 秒,15 位就是页面承诺的 5–10 分钟上限);must 不足 3 按补位序补。
 * 问题:网关给了就用,没给用 DEFAULT_Q。
 */
export function gateGateway(out: Record<string, any>, rows: RosterRow[], convened: string[]): { out: GatewayOut; dropped: string[] } {
  const known = new Set(rows.map((x) => x.slug));
  const dropped: string[] = [];
  const norm = (raw: string) => (raw && !raw.startsWith('bohui-') && known.has(`bohui-${raw}`) ? `bohui-${raw}` : raw);
  const seats = (v: unknown): Seat[] => (Array.isArray(v) ? v : [])
    .map((s: any) => ({ slug: norm(String(s?.slug ?? '').trim()), question: String(s?.question ?? '').trim().slice(0, 400) }))
    .filter((s) => { if (!s.slug) return false; if (known.has(s.slug)) return true; dropped.push(s.slug); return false; });
  const gwMust = seats(out.must), gwOpt = seats(out.optional);
  const q = new Map<string, string>();
  for (const s of [...gwMust, ...gwOpt]) if (s.question && !q.has(s.slug)) q.set(s.slug, s.question);

  const must: string[] = [];
  for (const s of [...convened, ...gwMust.map((s) => s.slug)]) if (!must.includes(s)) must.push(s);
  let optional = [...new Set(gwOpt.map((s) => s.slug))].filter((s) => !must.includes(s));
  if (must.length > 9) optional = [...must.splice(9), ...optional];
  for (const s of FILL.map(S)) if (must.length < 3 && !must.includes(s)) { must.push(s); optional = optional.filter((x) => x !== s); }
  optional = optional.slice(0, 6);   // 溢出的必审席已排在 optional 最前,先保住它们

  const a = out.analysis && typeof out.analysis === 'object' ? out.analysis : {};
  const sub = (Array.isArray(a.sub_questions) ? a.sub_questions : [])
    .map((x: any) => ({ topic: String(x?.topic ?? '').trim().slice(0, 80), question: String(x?.question ?? '').trim().slice(0, 400) }))
    .filter((x: { question: string }) => x.question).slice(0, 12);
  const seat = (slug: string): Seat => ({ slug, question: q.get(slug) || DEFAULT_Q });
  return {
    out: {
      analysis: { system_type_hint: String(a.system_type_hint ?? '待定').trim().slice(0, 40) || '待定', sub_questions: sub },
      must: must.map(seat), optional: optional.map(seat), notes: out.notes ? String(out.notes).slice(0, 1000) : undefined,
    },
    dropped,
  };
}

const EXPERT_RULES = `${TIER_NOTE}

## 硬规则
1. 你只答会诊总控交给你的问题与你职责内的事;不在你的域里的,stance 写「不适用」并说明。
2. 数字(用量、pH、限量、天数)与原料只准来自下方资料(候选 / 基底 / 库内原料 / 目录 / 法规要点),每个数字写 source;资料里没有的写「待查」,不许编。没发给你法规要点的,法规限量与宣称边界一律写「待查」—— 那是对应市场法规官的席位,汇总时以他为准。
3. 每条判断带 tier:"①" 公开常识 / "②" 经验推演 / "③" 存疑。
4. 只输出一个 JSON 对象,不加围栏、不加前言。
5. ${TABLE_NOTE}`;
/** hasReg:只有法规官拿到法规行,source 示例才列「法规:中国」;别的专家看不到法规块,示例里不引导他写法规来源 */
const EXPERT_SHAPE = (stage: Stage, hasReg: boolean) =>
  `{"stance":"支持 | 有条件支持 | 反对 | 不适用","points":[{"text":"判断","tier":"②"}],"risks":[{"text":"风险","tier":"③"}],"red_lines":["不可交易的红线"],"must_verify":["必须验证项"],` +
  `"numbers":[{"what":"甘油用量","value":"3–5%","source":"ingredients | catalog | base:SR-1101 | ${hasReg ? '法规:中国 | ' : ''}待查","tier":"①"}]` +
  (stage === 'generate' ? `,"suggestions_for_recipe":[{"name":"甘油","inci":"GLYCERIN","pct_low":3,"pct_high":5,"purpose":"保湿剂","source":"ingredients | catalog | base:SR-1101","tier":"①"}]}` : '}');

/** 每位专家的字符预算;超出按 5.2 的顺序裁:候选(丢到 10)→ 库内原料(丢到 12,目录随之收窄)。需求单、core、问题永不裁 */
export const EXPERT_BUDGET = 20_000;
/**
 * 专家提示词。system = 该专家 core(全文,≤2,958)+ 认知三档 + 硬规则 + 他对应市场的法规行(只有法规官有;席位表 REG_BY_MARKET 反查)+ 形状;
 * user = 需求单 + 网关给他的问题(附总控拆解供参照)+ 资料块(recommend 候选;generate 基底 + 库内原料 + 目录)。
 * 资料块用 ctx 的副本裁,不动共享的 ctx。
 */
export function buildExpertMessages(e: ExpertRow, question: string, ctx: LabContext, gw?: GatewayOut): { messages: { role: 'system' | 'user'; content: string }[]; dropped: string[] } {
  const stage = ctx.step;
  const short = e.slug.replace(/^bohui-/, '');
  const regs = ctx.regulations.filter((r) => REG_BY_MARKET[r.id] === short);
  const sys = [expertBlock(e), EXPERT_RULES, ...regs.map(regBlock), `## 输出 JSON 形状\n${EXPERT_SHAPE(stage, regs.length > 0)}`].join('\n\n');
  const d = { candidates: [...ctx.candidates], bases: ctx.bases, ingredients: [...ctx.ingredients], catalog: [...ctx.catalog] };
  const subs = gw?.analysis.sub_questions ?? [];
  const build = () => {
    const user = [
      briefBlock(ctx),
      `## 会诊总控交给你的问题\n${question}` + (subs.length ? `\n\n总控拆解的子问题(供参照,只答与你相关的):\n${subs.map((s) => `- ${s.topic}:${s.question}`).join('\n')}` : ''),
      ...dataBlocks(stage, d),
    ];
    return [{ role: 'system' as const, content: sys }, { role: 'user' as const, content: user.join('\n\n') }];
  };
  const dropped: string[] = [];
  let messages = build();
  while (messages.reduce((n, m) => n + m.content.length, 0) > EXPERT_BUDGET) {
    if (d.candidates.length > 10) dropped.push(`candidate:${d.candidates.pop()!.code}`);
    else if (d.ingredients.length > 12) { const g = d.ingredients.pop()!; dropped.push(`ingredient:${g.slug}`); const k = inciKey(g.inci); d.catalog = d.catalog.filter((c) => c.inci_key !== k); }
    else break;
    messages = build();
  }
  return { messages, dropped };
}

/** 专家输出归一:tier 认 ①②③ 否则 ③;每段截长;generate 才留 suggestions_for_recipe。stance 空写「未表态」,写了别的原样留 */
export function normExpert(out: Record<string, any>, stage: Stage): ExpertOut {
  const tier = (o: any): Tier => TIERS.find((t) => String(o?.tier ?? '').includes(t)) ?? '③';
  const tt = (v: unknown) => (Array.isArray(v) ? v : []).map((x: any) => { const o = typeof x === 'string' ? { text: x } : (x ?? {}); return { text: String(o.text ?? '').trim().slice(0, 500), tier: tier(o) }; }).filter((x) => x.text);
  const ss = (v: unknown) => (Array.isArray(v) ? v : []).map((x: any) => String(typeof x === 'string' ? x : x?.text ?? '').trim().slice(0, 500)).filter(Boolean);
  const o: ExpertOut = {
    stance: String(out.stance ?? '').trim().slice(0, 20) || '未表态',
    points: tt(out.points), risks: tt(out.risks), red_lines: ss(out.red_lines), must_verify: ss(out.must_verify),
    numbers: (Array.isArray(out.numbers) ? out.numbers : []).map((x: any) => ({
      what: String(x?.what ?? '').trim().slice(0, 120), value: String(x?.value ?? '').trim().slice(0, 120), source: String(x?.source ?? '待查').trim().slice(0, 80) || '待查', tier: tier(x),
    })).filter((x) => x.what),
  };
  if (stage === 'generate') o.suggestions_for_recipe = (Array.isArray(out.suggestions_for_recipe) ? out.suggestions_for_recipe : []).map((x: any) => ({
    name: String(x?.name ?? '').trim().slice(0, 80), inci: String(x?.inci ?? '').trim().slice(0, 120), pct_low: num(x?.pct_low), pct_high: num(x?.pct_high),
    purpose: String(x?.purpose ?? '').trim().slice(0, 120), source: String(x?.source ?? 'estimate').trim().slice(0, 80) || 'estimate', tier: tier(x),
  })).filter((x) => x.name || x.inci);
  return o;
}

const SYNTH_HEAD = `## 汇总者
你是汇总者:user 里的【会诊意见】是会诊总控的拆解与各位专家的意见。按裁决顺序(法规 > 安全 > 功效 > 成本 > 肤感)合并;专家之间冲突处,写明按谁裁决、为什么;不得引入专家未提及且资料里没有的原料或数字;缺席专家的席位留空,不替他作答。仍按下方「输出 JSON 形状」输出。`;

/** 会诊意见块自己的字符预算。宽档每位上限约 24k(points/risks 8×500 + red_lines 6×500 + must_verify 8×500 + numbers 10×330 + 建议原料 15×420),15 位实测 45–120k,
 *  叠在 40k 的生成提示词上就把 BUDGET 顶穿。超出按序:整段丢旁听(只留必审)→ 每位逐档收窄(CAPS)→ 仍超就硬截并注明 */
export const SYNTH_EXTRA_BUDGET = 18_000;
/** 每位条数档:[points/risks/must_verify 条数 n(red_lines、numbers 各 n+2), 建议原料条数] */
const SYNTH_CAPS: [number, number][] = [[8, 15], [4, 8], [2, 4], [1, 2]];
type SynthExpert = { title: string; domain: string; must?: boolean; out: ExpertOut };
/**
 * 汇总步追加段(buildSynthesisMessages = buildMessages(stage, ctx, buildSynthesisExtra(…)));先算它再 loadContext(…, { extra }),预算才含会诊意见。
 * must 标 false 的是旁听席,超预算时先被整段丢掉(丢了在块尾记一行,汇总模型知道谁没进来)。
 */
export function buildSynthesisExtra(gw: GatewayOut, experts: SynthExpert[], missing: string[]): MessageExtra {
  const render = (xs: SynthExpert[], [n, sugg]: [number, number], omitted: SynthExpert[]) => {
    const L = (items: { text: string; tier: Tier }[]) => items.slice(0, n).map((x) => `- ${x.text} ${x.tier}`).join('\n');
    // 缺席 / 未列入两行放在专家段前面:硬截时也不会被切掉
    const parts = [
      `## 会诊意见\n### 总控拆解(体系猜测:${gw.analysis.system_type_hint})\n` + gw.analysis.sub_questions.map((s) => `- ${s.topic}:${s.question}`).join('\n') + (gw.notes ? `\n总控备注:${gw.notes}` : ''),
    ];
    if (missing.length) parts.push(`### 缺席(未回复,席位留空):${missing.join('、')}`);
    if (omitted.length) parts.push(`### 旁听意见因篇幅未列入:${omitted.map((e) => `${e.title}(立场:${e.out.stance})`).join('、')}`);
    for (const e of xs) {
      const o = e.out;
      const s = [`### ${e.title}(${e.domain})· 立场:${o.stance}`];
      if (o.points.length) s.push(`判断:\n${L(o.points)}`);
      if (o.risks.length) s.push(`风险:\n${L(o.risks)}`);
      if (o.red_lines.length) s.push(`红线:${o.red_lines.slice(0, n + 2).join(';')}`);
      if (o.must_verify.length) s.push(`必须验证:${o.must_verify.slice(0, n).join(';')}`);
      if (o.numbers.length) s.push(`数字:\n${o.numbers.slice(0, n + 2).map((x) => `- ${x.what}:${x.value}(来源 ${x.source})${x.tier}`).join('\n')}`);
      if (o.suggestions_for_recipe?.length) s.push(`建议原料(name | inci | 区间% | 用途 | 来源 | 档):\n${o.suggestions_for_recipe.slice(0, sugg).map((m) => `- ${m.name} | ${m.inci} | ${nz(m.pct_low)}–${nz(m.pct_high)} | ${m.purpose} | ${m.source} | ${m.tier}`).join('\n')}`);
      parts.push(s.join('\n'));
    }
    return parts.join('\n\n');
  };
  let xs = experts, omitted: SynthExpert[] = [];
  let user = render(xs, SYNTH_CAPS[0], omitted);
  if (user.length > SYNTH_EXTRA_BUDGET && xs.some((e) => e.must === false)) { omitted = xs.filter((e) => e.must === false); xs = xs.filter((e) => e.must !== false); user = render(xs, SYNTH_CAPS[0], omitted); }
  for (let i = 1; user.length > SYNTH_EXTRA_BUDGET && i < SYNTH_CAPS.length; i++) user = render(xs, SYNTH_CAPS[i], omitted);
  if (user.length > SYNTH_EXTRA_BUDGET) user = user.slice(0, SYNTH_EXTRA_BUDGET) + '\n\n(会诊意见超预算,已截断;完整意见见会诊记录)';   // 9 位都顶格写才会到这里
  return { system: SYNTH_HEAD, user };
}
export const buildSynthesisMessages = (stage: Stage, ctx: LabContext, extra: MessageExtra) => buildMessages(stage, ctx, extra);

/* ── 对话入口 op:'brief'(2026-09-17 11:1x 创始人否定表单:「人只说话,系统干活」)──────────────── */
const BRIEF_SHAPE = `{"customer":null,"category":"skincare","format":"serum","claims":"保湿,舒缓","markets":["cn"],"constraints":{"halal":false,"vegan":false,"fragrance_free":false,"no_mit_cmit":false,"preservative_free":false,"ph_low":null,"ph_high":null,"other":""},"cost_band":null,"ask":""}`;
/**
 * 提取需求单的提示词。cats / fmts 是 formulas 里实际存在的码(接口层 GROUP BY 查出来),模型只能从中选;
 * 列表附中文名,模型才能把「精华」对到 serum。判不出品类或剂型时 ask 写一句追问,接口据此不建项目。
 */
export function buildBriefMessages(text: string, cats: string[], fmts: string[]): { role: 'system' | 'user'; content: string }[] {
  const sys = `## 你的任务:从一句话里提取需求单
实验室工程师用一句话说要做什么,你把它整理成需求单 JSON。只提取话里有的,没说的留 null / 空 / false;不要替客户补需求、不要推断没说的约束。
品类码只能取(码=中文):${cats.map((c) => `${c}=${catZh(c)}`).join('、')};对不上写 null。
剂型码只能取(码=中文):${fmts.map((f) => `${f}=${fmtZh(f)}`).join('、')};对不上写 null。
markets 只认 cn(中国) eu(欧盟) us(美国) jp(日本) kr(韩国) asean(东南亚),没说默认 ["cn"]。
cost_band:low(经济)/ mid(中档)/ high(高端),没说 null。
constraints:halal 清真、vegan 纯素、fragrance_free 无香、no_mit_cmit 无 MIT/CMIT、preservative_free 无防腐、ph_low/ph_high 数字、other 其他硬要求原话。
claims:目标功效,中文逗号分隔。customer:客户名或客户行业,没说 null。
category 或 format 判不出时,ask 写一句中文追问,只问缺的那项并举 2–3 个例子;都判得出 ask 留空串。
只输出一个 JSON 对象,不加围栏、不加前言。

## 输出 JSON 形状
${BRIEF_SHAPE}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: `## 原话\n${text}` }];
}

/** 提取结果归一:码只认实际存在的;markets 只认六项默认 cn;constraints 走 parseConstraints;ask 缺时按缺项拼一句 */
const ESG_RE = /ESG|全绿|美丽修行|clean|纯净/i;
export function normBrief(out: Record<string, any>, text: string, cats: string[], fmts: string[]): BriefOut {
  const pick = (v: unknown, list: string[]) => { const s = String(v ?? '').trim(); return list.includes(s) ? s : null; };
  const category = pick(out.category, cats), format = pick(out.format, fmts);
  const claims = Array.isArray(out.claims) ? out.claims.map(String) : splitList(String(out.claims ?? ''));
  const markets = (Array.isArray(out.markets) ? out.markets.map(String) : splitList(String(out.markets ?? ''))).filter((m) => m in MARKET_ZH);
  const cost = String(out.cost_band ?? '').trim();
  const miss = [category ? '' : '品类', format ? '' : '剂型'].filter(Boolean);
  let ask = String(out.ask ?? '').trim().slice(0, 300);
  if (miss.length && !ask) ask = `请补充${miss.join('与')}(如 ${!category ? cats.slice(0, 3).map(catZh).join(' / ') : fmts.slice(0, 3).map(fmtZh).join(' / ')})`;
  return {
    customer: String(out.customer ?? '').trim().slice(0, 200) || null, category, format,
    claims: claims.join(',').slice(0, 500), markets: markets.length ? [...new Set(markets)] : ['cn'],
    constraints: parseConstraints(JSON.stringify({ ...(out.constraints && typeof out.constraints === 'object' ? out.constraints : {}), all_green: ESG_RE.test(text), esg: ESG_RE.test(text) })),   // 原话里提「全绿 / 美丽修行 / ESG / clean / 纯净」即全绿 + ESG 要求,不靠模型判(任务 G)
    cost_band: cost in COST_BAND_ZH ? cost : null, brief: text, ask: miss.length ? ask : '',
  };
}

/* ── 李总工点评 op:'review'(side='J',step='review')──────────────────────────────────── */
const REVIEW_HEAD = `## 你是李总工:独立审核者
两版方案分别出自刘总工与黄总工,你不是他们中的任何一位,不替任何一方补写、不出第三版。你的工作是逐项对比、说清各自优缺点、给出采纳建议,让实验室工程师能直接决定用谁。

${TIER_NOTE}

## 硬规则
1. 只评两版里有的内容与【会诊意见】里专家已提到的事;不得引入两版与会诊意见都没有的原料、数字或宣称。
2. comparison 固定七项、顺序不变:体系 / 防腐 / 稳定 / 法规 / 功效 / 成本 / 肤感;每项写刘版怎样(liu)、黄版怎样(huang)、结论(verdict)与 tier;两版都没涉及的项写「两版均未涉及」。「成本」只比原料档次与用量结构,不写单价与成本数字(创始人 09-18:「价格由财务和采购确认,我们不可以瞎编」)。
3. red_yellow_notes:两版闸门标出的红项(不可采纳)与黄项(需总工核)逐条点评,说清该剔、该核还是可放行。
4. recommendation 三选一:liu / huang / merge;merge 时 merge_plan 逐条写 take_from(liu / huang)、rows(取该版的哪几行:生成阶段写相表行号如 A-1,推荐阶段写配方号)与 why。
5. 缺席专家的席位写明「缺席」,不代拟其意见;法规处一律注明「以最新官方文本为准」。
6. 只输出一个 JSON 对象,不加围栏、不加前言。

## 输出 JSON 形状
{"summary":"一句总评","comparison":[{"aspect":"体系","liu":"刘版怎样","huang":"黄版怎样","verdict":"结论","tier":"②"}],"recommendation":"liu | huang | merge","merge_plan":[{"take_from":"liu","rows":["A-1","B-2"],"why":"为什么"}],"red_yellow_notes":["点评"],"next_steps":["下一步"],"tier":"②"}`;

/** 每版方案进点评提示词的字符上限;两版 + 会诊意见(SYNTH_EXTRA_BUDGET)+ 需求单 ≈ 45k,与 BUDGET 同量级 */
export const REVIEW_VERSION_BUDGET = 12_000;
const fl = (m: Pick<Material, 'flag' | 'flag_note'>) => (m.flag ? `【${m.flag === 'red' ? '红' : '黄'}:${m.flag_note ?? ''}】` : '');
/** 一版方案渲染成文本:推荐 = 每张卡一行;生成 = 相表逐行(带 seq / 区间 / 来源 / 红黄)+ 工艺 + pH + 功效逻辑 + 卖点 + 风险 + 清单外 */
export function renderVersion(stage: Stage, out: RecommendOut | GenerateOut, g: GateJson | null): string {
  const T = (xs: { text: string; tier: Tier }[] | undefined) => (xs ?? []).map((x) => `- ${x.text} ${x.tier}`).join('\n');
  const parts: string[] = [];
  if (stage === 'recommend') {
    const o = out as RecommendOut;
    parts.push(`推荐基底(code | 为什么 | 组合逻辑 | 预期功效 | 卖点 | 风险):\n` + (o.picks ?? []).map((p) =>
      `- ${p.code} | ${p.why} ${p.why_tier} | ${p.combo} | ${p.expected} ${p.expected_tier} | ${(p.selling ?? []).join(';')} | ${(p.risks ?? []).map((r) => `${r.text} ${r.tier}`).join(';')}`).join('\n'));
    if (o.notes) parts.push(`整体说明:${o.notes}`);
  } else {
    const o = out as GenerateOut;
    parts.push(`配方名:${o.name} 体系:${o.system_type} pH 窗口:${nz(o.ph_window?.low)}–${nz(o.ph_window?.high)} ${o.ph_window?.tier ?? ''}`);
    parts.push(`相表(行号 | 名称 | INCI | 区间% | 用途 | 来源 | 档 | 闸门):\n` + (o.phases ?? []).map((p) => `${p.phase}\n` + (p.materials ?? []).map((m) =>
      `- ${m.seq} | ${m.name} | ${m.inci} | ${nz(m.pct_low)}–${nz(m.pct_high)} | ${m.purpose} | ${m.source} | ${m.tier} ${fl(m)}`).join('\n')).join('\n'));
    if (o.process?.length) parts.push(`工艺:\n${o.process.map((s) => `- ${s.step}. ${s.text} ${s.tier}`).join('\n')}`);
    if (o.efficacy_logic?.length) parts.push(`功效逻辑:\n${o.efficacy_logic.map((x) => `- ${x.claim}:${x.because} ${x.tier}`).join('\n')}`);
    if (o.selling_points?.length) parts.push(`卖点:\n${T(o.selling_points)}`);
    if (o.risks?.length) parts.push(`风险:\n${T(o.risks)}`);
    if (o.verify?.length) parts.push(`验证:\n${o.verify.map((x) => `- ${x.text}(${x.how})${x.tier}`).join('\n')}`);
    if (o.unlisted?.length) parts.push(`清单外原料(红,不可采纳):${o.unlisted.map((u) => `${u.name}(${u.why})`).join(';')}`);
    if (o.decisions_for_customer?.length) parts.push(`需客户拍板:${o.decisions_for_customer.join(';')}`);
  }
  if (g) parts.push(`闸门:红 ${g.red.length} 项(${g.red.map((x) => `${x.seq} ${x.reason}`).join(';') || '无'});黄 ${g.yellow.length} 项(${g.yellow.map((x) => `${x.seq} ${x.reason}`).join(';') || '无'});三档 ①${g.tiers['①']} ②${g.tiers['②']} ③${g.tiers['③']}`);
  const s = parts.join('\n\n');
  return s.length > REVIEW_VERSION_BUDGET ? s.slice(0, REVIEW_VERSION_BUDGET) + '\n(超预算已截断)' : s;
}

/**
 * 李总工提示词。system = 审核者口径(不复用刘 / 黄的 SYSTEM_HEAD 与专家人格)+ 三档 + 硬规则 + 形状;
 * user = 需求单 + 阶段 + 刘版 + 黄版 + 会诊意见(buildSynthesisExtra 的 user 块,已按 SYNTH_EXTRA_BUDGET 封顶;没有专家意见时省略)。
 */
export function buildReviewMessages(ctx: Pick<LabContext, 'project' | 'constraints'>, stage: Stage, liu: string, huang: string, consult?: string): { role: 'system' | 'user'; content: string }[] {
  const user = [
    briefBlock(ctx),
    `## 本阶段\n${stage === 'recommend' ? '推荐基底(两版各自从库里挑的示例配方)' : '配方草案(两版各自的相表与工艺)'}`,
    `## 刘总工方案\n${liu}`, `## 黄总工方案\n${huang}`,
  ];
  if (consult) user.push(consult);
  return [{ role: 'system', content: REVIEW_HEAD }, { role: 'user', content: user.join('\n\n') }];
}

const ASPECTS = ['体系', '防腐', '稳定', '法规', '功效', '成本', '肤感'];
/** 点评输出归一:七项按固定顺序补齐(模型漏的写「未评」);recommendation 认中英文,认不出按 merge;tier 认 ①②③ 否则 ③ */
export function normReview(out: Record<string, any>): ReviewOut {
  const tier = (o: any): Tier => TIERS.find((t) => String(o?.tier ?? '').includes(t)) ?? '③';
  const s = (v: unknown, n = 600) => String(v ?? '').trim().slice(0, n);
  const who = (v: unknown, dflt: 'liu' | 'huang' | 'merge'): 'liu' | 'huang' | 'merge' => {
    const x = String(v ?? '').toLowerCase();
    return /liu|刘/.test(x) ? 'liu' : /huang|黄/.test(x) ? 'huang' : /merge|合并/.test(x) ? 'merge' : dflt;
  };
  const cmp = Array.isArray(out.comparison) ? out.comparison : [];
  const comparison = ASPECTS.map((aspect) => {
    const c = cmp.find((x: any) => String(x?.aspect ?? '').includes(aspect)) ?? {};
    return { aspect, liu: s(c.liu) || '未评', huang: s(c.huang) || '未评', verdict: s(c.verdict) || '未评', tier: tier(c) };
  });
  const ss = (v: unknown) => (Array.isArray(v) ? v : []).map((x: any) => s(typeof x === 'string' ? x : x?.text, 500)).filter(Boolean).slice(0, 20);
  return {
    summary: s(out.summary, 1000) || '(未给总评)', comparison,
    recommendation: who(out.recommendation, 'merge'),
    merge_plan: (Array.isArray(out.merge_plan) ? out.merge_plan : []).map((m: any) => ({
      take_from: who(m?.take_from, 'liu') === 'huang' ? 'huang' as const : 'liu' as const,
      rows: (Array.isArray(m?.rows) ? m.rows : splitList(String(m?.rows ?? ''))).map((r: unknown) => s(r, 40)).filter(Boolean).slice(0, 60),
      why: s(m?.why, 500),
    })).filter((m: { rows: string[]; why: string }) => m.rows.length || m.why).slice(0, 20),
    red_yellow_notes: ss(out.red_yellow_notes), next_steps: ss(out.next_steps), tier: tier(out),
  };
}

/* ── 拍照识别 op:'ocr' 与老配方导入 op:'import_formula'(2026-09-17 创始人:「拍照上传转文字录入」「把原有的一些资料拍照导入」)── */
/** 识别出的配方表一行;pct 识不清写 null,行号进 OcrRecipe.unsure */
export type OcrRow = { phase: string; name: string; inci: string; pct: number | null; purpose: string };
export type OcrRecipe = { rows: OcrRow[]; title: string; notes: string; unsure: number[] };
export type OcrMode = 'text' | 'recipe';

/** 视觉模型提示词。text:按原顺序抄字;recipe:识成 JSON 表(比例识不清写 null,不许猜数) */
export const OCR_PROMPT: Record<OcrMode, { system: string; user: string }> = {
  text: {
    system: '你是文字识别员。把图里的文字按原来的阅读顺序逐行抄出来:中文照抄中文,英文 / 数字 / 符号照抄原文,不翻译、不总结、不补充、不解释;表格按行输出,同一行的格用「 | 」分隔;看不清的字写「□」。只输出抄出的文字,不加前言。',
    user: '把这张图里的文字抄出来。',
  },
  recipe: {
    system: `你是化妆品配方表识别员。图里是一张配方表(手写或打印),把它识成 JSON:
{"title":"表头写的配方名或编号,没有留空串","rows":[{"phase":"相(如 A / B / A 水相;没有留空串)","name":"原料名(中文或商品名,照抄)","inci":"INCI 名(大写英文;表里没写就按原料名给出标准 INCI,不确定留空串)","pct":4.5,"purpose":"用途(表里有就抄,没有留空串)"}],"notes":"看不清或有疑问的地方,一句话"}
规则:每一行原料一条;pct 是质量百分比数字,表里写 q.s. / 加至 100 / 余量 的水行也要把它算出来写数字(100 减其余行之和);识不清的比例写 null,绝不猜数;看不清的字写「□」;不许合并行、不许漏行、不许自己加行。只输出一个 JSON 对象,不加围栏、不加前言。`,
    user: '识别这张配方表。',
  },
};

const OCR_MAX_ROWS = 80;
/** 识别结果归一:行截 80、字段截长、INCI 大写;pct 非数 → null 并记行号(1 起);Σpct 与 100 差 > 0.5 写进 notes(有 null 行时不算差) */
export function normOcrRecipe(out: Record<string, any>): OcrRecipe {
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const unsure: number[] = [];
  const rows: OcrRow[] = (Array.isArray(out.rows) ? out.rows : []).slice(0, OCR_MAX_ROWS).map((r: any, i: number) => {
    const raw = typeof r?.pct === 'string' ? r.pct.replace(/[%％\s]/g, '') : r?.pct;
    const pct = raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw)) ? null : Math.round(Number(raw) * 1000) / 1000;
    if (pct === null || pct < 0 || pct > 100) unsure.push(i + 1);
    return { phase: s(r?.phase, 40), name: s(r?.name, 120), inci: s(r?.inci, 160).toUpperCase(), pct: pct !== null && pct >= 0 && pct <= 100 ? pct : null, purpose: s(r?.purpose, 120) };
  }).filter((r: OcrRow) => r.name || r.inci);
  const notes: string[] = [s(out.notes, 500)].filter(Boolean);
  if (rows.length && !unsure.length) {
    const sum = rows.reduce((a, r) => a + (r.pct ?? 0), 0);
    if (Math.abs(sum - 100) > 0.5) notes.push(`比例合计 ${sum.toFixed(2)}%,与 100% 差 ${(sum - 100).toFixed(2)}%`);
  } else if (unsure.length) notes.push(`第 ${unsure.join('、')} 行比例识不清,请核对`);
  return { rows, title: s(out.title, 120), notes: notes.join(';'), unsure };
}

/** 导入编号 IMP-YYMM-NNN(北京时间),与 nextProjectCode 同一取法:MAX+1,撞 UNIQUE 由接口层重算 */
export async function nextImportCode(db: D1Database): Promise<string> {
  const ym = new Date(Date.now() + 8 * 3600_000).toISOString().slice(2, 7).replace('-', '');
  const r = await db.prepare(`SELECT MAX(code) m FROM formulas WHERE code LIKE ?`).bind(`IMP-${ym}-%`).first<{ m: string | null }>();
  const n = r?.m ? Number(r.m.slice(-3)) + 1 : 1;
  return `IMP-${ym}-${String(n || 1).padStart(3, '0')}`;
}
