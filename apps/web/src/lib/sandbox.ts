/**
 * 推演沙盘 v0(2026-09-18 创始人:「1 省算力,2 推演,是不是很像我们 SueAI 的多专家探讨」「你需要把这些机制用于帛卉的规划上」)。
 *
 * 吸收 MiroFish 的五步机制:材料 → 实体关系 → 差异化 Agent → 多轮互动 → 报告。改成我们自己的,不是抄(创始人铁令):
 *   · 材料不是网页,是库里的真数:market_product_inci × market_products 的高频成分(频率≠销量)、ingredient_facts 红黄、esg_rules 目标市场要点;
 *   · Agent 不是随机人格:监管审评员 / 竞争对手配方总工 的 persona 直接取 expert_skills 的角色专家口径(core 前 600 字);
 *   · 省算力:第 2 轮起只喂上一轮摘要(每条 ≤80 字)不喂全文;每个 Agent 一次 chat ≤400 token;整轮 8 个并行。
 * 所有 SQL 参数绑定;表缺失一律 try/catch 成空,不阻塞推演。
 * 每一步都是独立函数,接口按 sandbox_runs.step 分步推进(Worker 单请求有时限,一次跑完 3 轮 × 8 人会超时)。
 */
import { chat, loadFleet, type ChatResult, type Provider } from './fleet';
import { parseJson } from './formula-lab';   // 剥 ```json 围栏 + 首尾花括号,已在配方实验室验证过一批模型
import { MARKET } from './decoder';

/* ── 类型 ── */
export type Relation = { a: string; rel: string; b: string };
export type Entities = {
  brands: string[]; ingredients: string[]; channels: string[]; consumer_segments: string[];
  regulators: string[]; competitors: string[]; events: string[]; relations: Relation[];
};
export type Agent = {
  name: string; role: string; stance_seed: string; cares: string[]; style: string;
  /** 分配到的实体子集(MiroFish 里叫 memory:每个 Agent 只知道自己那一摊,差异化由此而来) */
  memory: string[];
  /** 角色专家口径(expert_skills.core 前 600 字);只有监管审评员与竞争对手配方总工有 */
  persona?: string;
};
export type Stance = '支持' | '观望' | '反对';
export type Turn = { agent: string; stance: Stance; statement: string; ask: string; shift: string };
export type Evidence = { round: number; agent: string; quote: string };
export type Report = {
  summary: string;
  outcomes: { claim: string; probability: '高' | '中' | '低'; supporters: string[]; opponents: string[]; evidence: Evidence[] }[];
  risks: { risk: string; source_agent: string; round: number }[];
  opportunities: { opportunity: string; source_agent: string; round: number }[];
  what_to_change: string[];
  confidence: number;
  confidence_reason: string;
};
export type RunRow = {
  id: number; title: string; brief: string; market: string; category: string;
  entities_json: string | null; agents_json: string | null; rounds: number; step: string;
  transcript_json: string | null; report_json: string | null; status: string;
  tokens_in: number; tokens_out: number; error: string | null; created_by: string | null; created_at: string; finished_at: string | null;
};
/** 一步的产物:写回哪几列 + 本步 tokens */
export type StepOut = { patch: Record<string, unknown>; tokens: { in: number; out: number } };

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const arr = (v: unknown, n = 12, len = 60): string[] => (Array.isArray(v) ? v : []).map((x) => clip(typeof x === 'string' ? x : (x as any)?.name ?? JSON.stringify(x), len)).filter(Boolean).slice(0, n);
const usage = (r: ChatResult) => ({ in: r.usage?.in ?? 0, out: r.usage?.out ?? 0 });
const marketZh = (m: string) => MARKET[m]?.[0] ?? m.toUpperCase();

/** 舰队:providers 表 enabled + 有 key + 能文本的,按档位排;chat() 自己逐家降级 */
async function fleetOf(env: any, db: D1Database): Promise<Provider[]> {
  return (await loadFleet(db, env)).filter((p) => p.text !== false);
}

/* ── ① 材料:库里真数装上下文(各 ≤300 字;表缺失即空)── */
export type Material = { top: string; flags: string; esg: string };
export async function loadMaterial(db: D1Database, market: string, category: string): Promise<Material> {
  const m: Material = { top: '', flags: '', esg: '' };
  const EXC = ['WATER', 'AQUA', 'EAU', 'AQUA/WATER', 'WATER/AQUA', 'GLYCERIN', 'GLYCERINE'];   // 同 market-structure.astro:不排水/甘油前两名永远是它们
  try {
    // 查询先量行数(记忆):kr×精华 ≈ 391 款 × ~30 行 ≈ 1.2 万关系行,带 LIMIT 一次扫;category 用 instr 容忍「精华」对「精华液」
    const W = [`COALESCE(p.inci,'')<>''`], B: unknown[] = [];
    if (market) { W.push('p.country=?'); B.push(market); }
    if (category) { W.push('instr(COALESCE(p.cat_zh,\'\'), ?)>0'); B.push(category); }
    const rows = (await db.prepare(
      `SELECT i.inci_key k, COUNT(DISTINCT i.product_id) n FROM market_product_inci i JOIN market_products p ON p.id=i.product_id
        WHERE ${W.join(' AND ')} AND i.inci_key NOT IN (${EXC.map(() => '?').join(',')}) GROUP BY i.inci_key ORDER BY n DESC LIMIT 10`,
    ).bind(...B, ...EXC).all<{ k: string; n: number }>()).results ?? [];
    const total = (await db.prepare(`SELECT COUNT(*) n FROM market_products p WHERE ${W.join(' AND ')}`).bind(...B).first<{ n: number }>())?.n ?? 0;
    if (rows.length) {
      const facts = (await db.prepare(`SELECT inci_key, name_zh, rating FROM ingredient_facts WHERE inci_key IN (${rows.map(() => '?').join(',')})`)
        .bind(...rows.map((r) => r.k)).all<{ inci_key: string; name_zh: string | null; rating: string | null }>().catch(() => ({ results: [] as any[] }))).results ?? [];
      const F = new Map(facts.map((f) => [f.inci_key, f]));
      m.top = clip(`${marketZh(market)}${category ? '·' + category : ''} 有公开全成分 ${total} 款;高频成分 Top10(出现款数,频率≠销量):` +
        rows.map((r) => `${r.k}${F.get(r.k)?.name_zh ? '(' + F.get(r.k)!.name_zh + ')' : ''} ${r.n}`).join('、'), 300);
      const bad = facts.filter((f) => f.rating === 'red' || f.rating === 'yellow');
      m.flags = clip(bad.length ? `Top10 里红黄评级:` + bad.map((f) => `${f.inci_key} ${f.rating === 'red' ? '红' : '黄'}`).join('、') : 'Top10 无红黄评级成分', 300);
    }
  } catch { /* 0088 / 0083 未灌 → 空,不阻塞 */ }
  try {
    // esg_rules.scope 是逗号市场码或 ALL;只取目标市场判红的标题(formula-lab.ts loadContext 同口径)
    const rs = (await db.prepare(`SELECT scope, pillar, title_zh FROM esg_rules WHERE active=1 AND severity='red' LIMIT 200`).all<{ scope: string; pillar: string; title_zh: string }>()).results ?? [];
    const on = rs.filter((r) => { const sc = String(r.scope ?? 'ALL').toLowerCase().split(',').map((x) => x.trim()); return sc.includes('all') || sc.includes(market.toLowerCase()); });
    m.esg = clip(on.length ? `${marketZh(market)} ESG 判红要点:` + [...new Set(on.map((r) => `${r.title_zh}[${r.pillar}]`))].slice(0, 12).join('、') : '', 300);
  } catch { /* 0089 未灌 → 空 */ }
  return m;
}

/* ── ② 实体关系抽取 ── */
export async function extractEntities(env: any, db: D1Database, brief: string, market: string, category: string, runId: number): Promise<StepOut & { entities: Entities }> {
  const mat = await loadMaterial(db, market, category);
  const messages = [
    { role: 'system' as const, content: `你是帛卉(化妆品 OEM/ODM 工厂)的市场情报分析员。把议题拆成实体与关系,只输出 JSON,不解释。
硬规则:只从议题与「库内材料」里抽,没有的不编,对应数组留空;不得用「品牌A」「某竞品」这类占位;品牌/竞品只写议题或材料里出现的;成分写 INCI 名;relations 每条 {a,rel,b} 用中文短语。
形状:{"brands":[],"ingredients":[],"channels":[],"consumer_segments":[],"regulators":[],"competitors":[],"events":[],"relations":[{"a":"","rel":"","b":""}]}
每个数组 ≤8 项,每项 ≤30 字;consumer_segments 至少 2 个(推演要按人群分 Agent)。` },
    { role: 'user' as const, content: `议题:${brief}\n目标市场:${marketZh(market)}(${market});品类:${category || '未定'}\n\n库内材料(真数):\n${[mat.top, mat.flags, mat.esg].filter(Boolean).join('\n') || '(该市场×品类暂无库内统计)'}` },
  ];
  const r = await chat(env, messages, { fleet: await fleetOf(env, db), json: true, temperature: 0.2, maxTokens: 900, timeoutMs: 60_000, promptKey: 'SANDBOX-ENTITY', entity: { type: 'sandbox_run', id: runId }, db });
  const o = parseJson(r.text) ?? {};
  const entities: Entities = {
    brands: arr(o.brands, 8), ingredients: arr(o.ingredients, 8), channels: arr(o.channels, 8), consumer_segments: arr(o.consumer_segments, 8),
    regulators: arr(o.regulators, 8), competitors: arr(o.competitors, 8), events: arr(o.events, 8),
    relations: (Array.isArray(o.relations) ? o.relations : []).map((x: any) => ({ a: clip(x?.a, 30), rel: clip(x?.rel, 30), b: clip(x?.b, 30) })).filter((x: Relation) => x.a && x.b).slice(0, 12),
  };
  return { entities, patch: { entities_json: JSON.stringify(entities) }, tokens: usage(r) };
}

/* ── ③ 8 个差异化 Agent(角色专家口径)── */
const EXPERT_SLUG: Record<string, { slug: string; domain: string }> = {
  '监管审评员': { slug: 'bohui-nmpa-reviewer-perspective', domain: '法规' },
  '竞争对手配方总工': { slug: 'bohui-formulation-actives-efficacy', domain: '配方' },
};
export async function buildAgents(db: D1Database, e: Entities): Promise<Agent[]> {
  const seg = e.consumer_segments.length >= 2 ? e.consumer_segments.slice(0, 2) : ['敏感肌', '成分党'];   // 抽不出人群就用两类最常见的
  const pick = (...xs: string[][]) => [...new Set(xs.flat())].slice(0, 8);   // 每个 Agent 只分到自己那摊实体:差异化来自信息不对称
  const base: Omit<Agent, 'persona'>[] = [
    { name: '品牌方创始人', role: '要在这个市场把这款卖出去的人', stance_seed: '支持', cares: ['差异化卖点', '毛利', '上市节奏'], style: '进取,先讲机会再讲风险', memory: pick(e.brands, e.channels, e.events) },
    { name: '采购总监', role: '管原料与包材成本、交期、起订量', stance_seed: '观望', cares: ['原料成本与供应稳定', '包材起订量', '交期'], style: '算账,每句话带一个数量或前提', memory: pick(e.ingredients, e.competitors) },
    { name: '渠道买手', role: '决定上不上架、给不给位置', stance_seed: '观望', cares: ['价格带是否好卖', '同类已有几款', '退货与差评'], style: '直接,拿同类比价', memory: pick(e.channels, e.brands, e.competitors) },
    { name: 'KOL 评测博主', role: '替粉丝试用并公开评价', stance_seed: '观望', cares: ['肤感与即时体验', '成分表能不能讲故事', '是否有争议成分'], style: '口语,爱举成分例子', memory: pick(e.ingredients, e.consumer_segments) },
    { name: '监管审评员', role: '从审评席上找最可能被打回的那几处', stance_seed: '反对', cares: ['宣称有没有证据', '成分是否在目标市场受限', '标签与备案一致'], style: '逐条挑刺,只认证据', memory: pick(e.regulators, e.ingredients, e.events) },
    { name: '竞争对手配方总工', role: '同赛道对手的研发负责人,判断这配方好不好抄、有没有护城河', stance_seed: '反对', cares: ['活性物浓度与递送', '稳定性', '与我方现有产品的差距'], style: '技术口吻,指出配方漏洞', memory: pick(e.ingredients, e.competitors) },
    { name: `消费者·${seg[0]}`, role: `${seg[0]} 人群的典型买家`, stance_seed: '观望', cares: ['会不会刺激', '值不值这个价', '别人怎么说'], style: '第一人称,说自己的顾虑', memory: pick([seg[0]], e.ingredients.slice(0, 4), e.channels.slice(0, 2)) },
    { name: `消费者·${seg[1]}`, role: `${seg[1]} 人群的典型买家`, stance_seed: '支持', cares: ['成分表排位', '性价比', '有没有更好的替代'], style: '第一人称,爱对比', memory: pick([seg[1]], e.ingredients, e.competitors.slice(0, 2)) },
  ];
  // 角色专家口径:两位专业 Agent 的 persona 取 expert_skills.core 前 600 字;slug 找不到就取同 domain 的第一位 —— 与 MiroFish「随机人格」的差别就在这里
  const personas = new Map<string, string>();
  try {
    for (const [name, { slug, domain }] of Object.entries(EXPERT_SLUG)) {
      const row = await db.prepare(`SELECT core FROM expert_skills WHERE slug=? LIMIT 1`).bind(slug).first<{ core: string }>()
        ?? await db.prepare(`SELECT core FROM expert_skills WHERE kind='expert' AND instr(domain, ?)>0 ORDER BY for_lab DESC, slug LIMIT 1`).bind(domain).first<{ core: string }>();
      if (row?.core) personas.set(name, row.core.slice(0, 600));
    }
  } catch { /* expert_skills 未灌 → 无 persona,仍用 role 文本 */ }
  return base.map((a) => ({ ...a, persona: personas.get(a.name) }));
}

/* ── ④ 一轮互动:8 个 Agent 并行 ── */
const STANCES: Stance[] = ['支持', '观望', '反对'];
const summarize = (t: Turn) => `${t.agent}[${t.stance}]:${clip(t.statement, 80)}`;   // 第 2 轮起只给这个,不给全文(省 token)

export async function runRound(env: any, db: D1Database, run: RunRow, r: number): Promise<StepOut> {
  const agents = JSON.parse(run.agents_json ?? '[]') as Agent[];
  const transcript = JSON.parse(run.transcript_json ?? '[]') as Turn[][];
  const prev = transcript[r - 2] ?? [];   // r 从 1 起
  const prevText = prev.length ? `上一轮(第 ${r - 1} 轮)各方发言摘要:\n${prev.map(summarize).join('\n')}` : '这是第 1 轮,还没有人发言。';
  const fleet = await fleetOf(env, db);
  const results = await Promise.all(agents.map(async (a): Promise<{ t: Turn; u: { in: number; out: number } }> => {
    const mine = prev.find((t) => t.agent === a.name);
    const messages = [
      { role: 'system' as const, content: `你在扮演推演沙盘里的「${a.name}」:${a.role}。说话风格:${a.style}。你最关心:${a.cares.join('、')}。初始立场:${a.stance_seed}。
${a.persona ? `你的专业口径(必须遵守):${a.persona}\n` : ''}你只知道这些事实(你的记忆):${a.memory.join('、') || '(无)'}。
硬规则:只输出 JSON {"stance":"支持|观望|反对","statement":"≤120 字","ask":"≤60 字 向某一方提一个问题","shift":"立场是否变化及原因 ≤40 字,没变写 不变"};
不得预测销量数字、不得说必然爆品;不知道的事说不知道,不编数据;立场可以因别人的发言改变,改了要说原因。` },
      { role: 'user' as const, content: `议题:${run.brief}\n目标市场:${marketZh(run.market)};品类:${run.category || '未定'}\n第 ${r}/${run.rounds} 轮。\n${prevText}${mine ? `\n你上一轮的立场:${mine.stance};你上一轮说:${clip(mine.statement, 80)}` : ''}\n现在轮到你发言。` },
    ];
    try {
      const res = await chat(env, messages, { fleet, json: true, temperature: 0.7, maxTokens: 400, timeoutMs: 45_000, promptKey: 'SANDBOX-AGENT', entity: { type: 'sandbox_run', id: run.id }, db });
      const o = parseJson(res.text) ?? {};
      const st = STANCES.find((s) => String(o.stance ?? '').includes(s)) ?? (mine?.stance ?? (a.stance_seed as Stance));
      return { t: { agent: a.name, stance: st, statement: clip(o.statement, 120) || '(未表态)', ask: clip(o.ask, 60), shift: clip(o.shift, 40) || '不变' }, u: usage(res) };
    } catch (e) {
      // 单个 Agent 失败不拖垮整轮:记「缺席」,报告阶段会看到;不代拟发言(记忆:缺席不代拟)
      return { t: { agent: a.name, stance: mine?.stance ?? (a.stance_seed as Stance), statement: `(本轮缺席:${clip(e instanceof Error ? e.message : String(e), 60)})`, ask: '', shift: '不变' }, u: { in: 0, out: 0 } };
    }
  }));
  transcript[r - 1] = results.map((x) => x.t);
  return {
    patch: { transcript_json: JSON.stringify(transcript) },
    tokens: results.reduce((s, x) => ({ in: s.in + x.u.in, out: s.out + x.u.out }), { in: 0, out: 0 }),
  };
}

/* ── ⑤ 报告 ── */
export async function report(env: any, db: D1Database, run: RunRow): Promise<StepOut & { report: Report }> {
  const transcript = JSON.parse(run.transcript_json ?? '[]') as Turn[][];
  const lines = transcript.map((turns, i) => `第 ${i + 1} 轮\n` + turns.map((t) => `- ${t.agent}[${t.stance}${t.shift && t.shift !== '不变' ? ' · ' + t.shift : ''}]:${t.statement}${t.ask ? ' 问:' + t.ask : ''}`).join('\n')).join('\n\n');
  const messages = [
    { role: 'system' as const, content: `你是帛卉推演沙盘的报告员。根据下面的多轮发言记录写结论,只输出 JSON。
硬规则:①不得预测销量数字;②不得说「必然爆品」「一定成功」;③每条结论(outcomes / risks / opportunities)必须引用 transcript 里真实出现的发言:evidence 的 quote 取自原句(≤60 字),round 与 agent 必须对得上;④没人说过的事不得写;⑤频率不是销量。
形状:{"summary":"≤200 字","outcomes":[{"claim":"","probability":"高|中|低","supporters":["Agent 名"],"opponents":["Agent 名"],"evidence":[{"round":1,"agent":"","quote":""}]}] 最多 6 条,
"risks":[{"risk":"","source_agent":"","round":1}],"opportunities":[{"opportunity":"","source_agent":"","round":1}],
"what_to_change":["配方/包装/定价/宣称 的具体建议,≤5 条,每条 ≤60 字"],"confidence":0到1的小数,"confidence_reason":"一句原因(如:两位专业 Agent 缺席则低)"}` },
    { role: 'user' as const, content: `议题:${run.brief}\n目标市场:${marketZh(run.market)};品类:${run.category || '未定'};共 ${transcript.length} 轮。\n\n发言记录:\n${lines}` },
  ];
  const r = await chat(env, messages, { fleet: await fleetOf(env, db), json: true, temperature: 0.2, maxTokens: 1500, timeoutMs: 90_000, promptKey: 'SANDBOX-REPORT', entity: { type: 'sandbox_run', id: run.id }, db });
  const o = parseJson(r.text);
  if (!o) throw new Error('报告 JSON 解析失败:' + clip(r.text, 120));
  const names = new Set((JSON.parse(run.agents_json ?? '[]') as Agent[]).map((a) => a.name));
  const ev = (v: unknown): Evidence[] => (Array.isArray(v) ? v : []).map((x: any) => ({ round: Number(x?.round) || 0, agent: clip(x?.agent, 30), quote: clip(x?.quote, 60) })).filter((x) => x.quote).slice(0, 4);
  const prob = (p: unknown): '高' | '中' | '低' => (['高', '中', '低'] as const).find((x) => String(p ?? '').includes(x)) ?? '中';
  const rep: Report = {
    summary: clip(o.summary, 200),
    // 无证据引用的结论直接丢:硬规则③在代码里再兜一次,模型没引用就不进报告
    outcomes: (Array.isArray(o.outcomes) ? o.outcomes : []).map((x: any) => ({ claim: clip(x?.claim, 80), probability: prob(x?.probability), supporters: arr(x?.supporters, 8, 30).filter((n) => names.has(n)), opponents: arr(x?.opponents, 8, 30).filter((n) => names.has(n)), evidence: ev(x?.evidence) }))
      .filter((x: any) => x.claim && x.evidence.length).slice(0, 6),
    risks: (Array.isArray(o.risks) ? o.risks : []).map((x: any) => ({ risk: clip(x?.risk, 80), source_agent: clip(x?.source_agent, 30), round: Number(x?.round) || 0 })).filter((x: any) => x.risk).slice(0, 8),
    opportunities: (Array.isArray(o.opportunities) ? o.opportunities : []).map((x: any) => ({ opportunity: clip(x?.opportunity, 80), source_agent: clip(x?.source_agent, 30), round: Number(x?.round) || 0 })).filter((x: any) => x.opportunity).slice(0, 8),
    what_to_change: arr(o.what_to_change, 5, 60),
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0)),
    confidence_reason: clip(o.confidence_reason, 80),
  };
  return { report: rep, patch: { report_json: JSON.stringify(rep) }, tokens: usage(r) };
}

/* ── 步进表:new→entities→agents→round1…roundN→report→done ── */
export function nextStep(step: string, rounds: number): string {
  if (step === 'new') return 'entities';
  if (step === 'entities') return 'agents';
  if (step === 'agents') return 'round1';
  const m = /^round(\d+)$/.exec(step);
  if (m) return Number(m[1]) < rounds ? `round${Number(m[1]) + 1}` : 'report';
  if (step === 'report') return 'done';
  return 'done';
}
/** 中文进度文案(页面进度条) */
export function stepZh(step: string, rounds: number): string {
  const m = /^round(\d+)$/.exec(step);
  return step === 'new' ? '待开始' : step === 'entities' ? '实体关系已抽取' : step === 'agents' ? 'Agent 已就位' : m ? `第 ${m[1]}/${rounds} 轮已完成` : step === 'report' ? '报告已生成' : step === 'done' ? '完成' : step;
}
