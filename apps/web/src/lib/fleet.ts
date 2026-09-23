/**
 * 模型舰队网关 —— 骨架借鉴古方线 _fleet.py 的成熟做法,搬到 Worker 上。
 *
 * 沿用的四点(都是踩过坑才有的):
 *  ① **key 池轮询**:同一家配多个 key,轮着用,单 key 限流不影响整体;
 *  ② **分档降级**:第 1 档挂了自动切第 2 档,调用方完全不感知;
 *  ③ **用量计**:每次调用记账,便于看清哪家在扛量、哪家在空转;
 *  ④ **base 已含 /v1 就绝不再拼**:古方线曾因写成 `{BASE}/v2/chat/completions`
 *     形成双路径 404,整批 0 产出空转。这里统一在拼接处做一次断言。
 *
 * 讯飞已退役(2026-08 起收费),不再进入舰队。
 *
 * 所有厂商都走 OpenAI 兼容形状,所以加一家新模型 = 在 PROVIDERS 里加一行,
 * 业务代码一行不改。
 */

export interface Provider {
  /**
   * 接口方言。绝大多数厂商都照抄 OpenAI 的形状,所以默认 'openai';
   * Anthropic 是个例外,而且不是小差异:
   *   路径     /v1/messages          不是 /v1/chat/completions
   *   鉴权     x-api-key             不是 Authorization: Bearer
   *   版本头   anthropic-version     必带,不带直接 400
   *   system   顶层单独一个字段       不是 messages 里的一条
   *   max_tokens 必填                 不填直接 400
   *   返回     content[].text         不是 choices[0].message.content
   * 六处都不一样,拿 OpenAI 那套去调只会得到一串 400。
   */
  dialect?: 'openai' | 'anthropic';
  /** 能否读图(图生文)。与 image(文生图)是两种能力,别混用 */
  vision?: boolean;
  /** 视觉模型名,通常与文本模型不同 */
  visionModel?: string;
  id: string;
  label: string;
  /** 优先级,数字小的先用 */
  tier: number;
  /** base 必须已含 /v1;拼接时只加 /chat/completions */
  base: string;
  /** key 池,逗号分隔多个 */
  keys: string[];
  model: string;
  /** 能否做文本对话;生图/生视频专用行为 false,文本循环直接跳过(打它们只会换来 400 白烧子请求) */
  text?: boolean;
  /** 是否具备出图能力 */
  image?: boolean;
  video?: boolean;
  free?: boolean;
  /** 每百万 tokens 单价(人民币,providers.price_in/out,2026-09-18 治理层);空则 ai_runs.cost_est 记 NULL,不编数字 */
  priceIn?: number | null;
  priceOut?: number | null;
}

export interface FleetEnv {
  [k: string]: unknown;
}

/**
 * 免费池的六家 —— 以创始人核定的真源为准。
 * 讯飞**不在**免费池名单里(2026-08 起收费),已彻底移除,不再作为任何一档。
 *
 * 六家全部走 OpenAI 兼容形状,所以能共用同一个调用函数。
 * 分档依据不是"谁更好",而是**配额与稳定性**:
 *   免费额度大且稳的排前面,出图/出视频独家的单列一档保底。
 * 这样任何一家限流,后面五家顶上 —— 这就是"不死锁一个 AI"的具体实现。
 */
const FREE_POOL: Omit<Provider, 'keys'>[] = [
  { id: 'cerebras', label: 'Cerebras', tier: 1, base: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b', free: true },
  { id: 'nvidia', label: 'NVIDIA NIM', tier: 2, base: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct', free: true },
  { id: 'siliconflow', label: '硅基流动', tier: 3, base: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct', free: true },
  { id: 'zhipu', label: '智谱 GLM', tier: 4, base: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash', free: true },
  { id: 'sensenova', label: '商汤日日新', tier: 5, base: 'https://api.sensenova.cn/compatible-mode/v1',
    model: 'SenseChat-5', free: true },
  // Agnes 排最后不是因为差,而是它独家承担出图/出视频 ——
  // 把它的额度留给图像链路,文本尽量让前五家扛。
  { id: 'agnes', label: 'Agnes AI', tier: 6, base: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-2.0-flash', image: true, video: true, free: true },
];

/** 付费兜底:免费池全挂了才用。配了才入列,不配就当不存在 */
const PAID_POOL: Omit<Provider, 'keys'>[] = [
  // Anthropic 排在付费池最前:免费池在中日韩之外的小语种上已经露底
  // (泰语把面霜说成沥青、越南语语法对意思错),那不是提示词能救的,是模型能力的边。
  // 它同时具备读图,所以测肤那条链也能一起换掉 —— 目前只有 Agnes 能读图。
  { id: 'anthropic', label: 'Anthropic Claude', tier: 15, base: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5', dialect: 'anthropic', vision: true, visionModel: 'claude-sonnet-5' },
  { id: 'deepseek', label: 'DeepSeek', tier: 20, base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', tier: 21, base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
];

/**
 * 从环境变量装配舰队。约定:每家的 key 放 `{ID大写}_KEY`,多个 key 用逗号分隔。
 * base 也可用 `{ID大写}_BASE` 覆盖(厂商换域名时不必改代码)。
 * 只有配了 key 的才入列 —— 没配的直接不存在,而不是入列后每次调用都失败一遍。
 */
export function buildFleet(env: FleetEnv): Provider[] {
  const pool = (v?: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...FREE_POOL, ...PAID_POOL]
    .map((p) => {
      const up = p.id.toUpperCase();
      const keys = pool(env[`${up}_KEY`]);
      const base = String(env[`${up}_BASE`] ?? p.base).replace(/\/+$/, '');
      return { ...p, base, keys };
    })
    .filter((p) => p.keys.length > 0)
    .sort((a, b) => a.tier - b.tier);
}

/**
 * 从数据库装配舰队 —— **这是正式路径**。
 *
 * 为什么不用环境变量:加一家模型要改配置、重部署,那不叫驾驭模型。
 * 存库之后,运营在后台点几下就能加一家、换一家、调档位、临时停用,
 * 前台下一次请求立刻生效。
 *
 * 环境变量保留为**兜底**:数据库里一个可用供应商都没有时才回退,
 * 保证冷启动或库出问题时 AI 功能不至于整个失联。
 */
export async function loadFleet(db: D1Database | undefined, env: FleetEnv): Promise<Provider[]> {
  if (!db) return buildFleet(env);
  try {
    const { results } = await db
      .prepare(
        `SELECT id,label,base_url,model,api_keys,tier,can_text,can_image,can_video,can_vision,vision_model,is_free,dialect,price_in,price_out
           FROM providers WHERE enabled = 1 ORDER BY tier, id`,
      )
      .all<{
        id: string; label: string; base_url: string; model: string; api_keys: string;
        tier: number; can_text: number | null; can_image: number; can_video: number; can_vision: number;
        vision_model: string | null; is_free: number; dialect: string | null; price_in: number | null; price_out: number | null;
      }>();

    const list: Provider[] = (results ?? [])
      .map((r) => ({
        id: r.id,
        label: r.label,
        tier: r.tier,
        base: r.base_url.replace(/\/+$/, ''),
        model: r.model,
        keys: (r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
        text: r.can_text === null || r.can_text === undefined ? true : !!r.can_text,
        image: !!r.can_image,
        video: !!r.can_video,
        vision: !!r.can_vision,
        // 视觉模型往往和文本模型不是同一个;没单独填就退回文本模型试
        visionModel: r.vision_model || r.model,
        free: !!r.is_free,
        dialect: (r.dialect === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
        priceIn: r.price_in ?? null, priceOut: r.price_out ?? null,
      }))
      // 没填 key 的供应商不入列 —— 留在库里是为了保留配置,但不参与降级链,
      // 否则每次调用都要先失败一遍才轮到下一家,白白多几秒延迟。
      .filter((p) => p.keys.length > 0);

    return list.length ? list : buildFleet(env);
  } catch {
    return buildFleet(env);
  }
}

/**
 * 把付费供应商排到前面 —— 给**面向客户**的接口用。
 *
 * 为什么(2026-09-09):外部调研把这条线划得很清楚 ——
 *   「请求是你们员工发出的 → 可以用免费层;请求是客户发出的 → 必须付费 API。」
 * 理由有两条,都不是理论:
 *   ① ToS:多数厂商的免费层写明限于「原型 / 开发 / 评估」,
 *      拿去服务真实终端用户属于生产商用,一旦被判违规是**随时断供**;
 *   ② 没有 SLA:免费层限速、下线、换模型都不通知。我们已经吃过
 *      agnes「rate limit for free users」的 429。
 *
 * 现状(2026-09-09 实测):11 家在册里 10 家 is_free=1 ——
 * 也就是说站上所有对客 AI 现在都跑在免费层上。这个函数不会凭空变出付费额度,
 * 它做的是**把顺序先摆对**:哪天后台填进一把付费 key,对客流量当天就换过去,
 * 免费层自动退成兜底,不用再改一行代码。
 *
 * 内部用途(翻译回填、视觉分类、后台工具)不该调这个 —— 那些本来就该用免费层。
 */
export function paidFirst(fleet: Provider[]): Provider[] {
  return [...fleet].sort((a, b) => {
    const af = a.free ? 1 : 0;
    const bf = b.free ? 1 : 0;
    if (af !== bf) return af - bf;      // 付费在前
    return (a.tier ?? 99) - (b.tier ?? 99);  // 同档内仍按原来的 tier
  });
}

/** 轮询游标。Worker 实例会被回收,所以这只是"尽量均摊",不追求严格公平 */
const cursor = new Map<string, number>();
function pickKey(p: Provider): string {
  const i = (cursor.get(p.id) ?? 0) % p.keys.length;
  cursor.set(p.id, i + 1);
  return p.keys[i];
}

/**
 * 拼接端点 —— 血泪防线。
 * base 已含 /v1 时再拼 /v2 会形成 `/v1/v2/...` 双路径,服务端 404,
 * 而调用方只会看到"没产出",很难查。这里显式断言。
 */
function endpoint(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  if (/\/v\d$/.test(b) && /^v\d\//.test(p)) {
    throw new Error(`[fleet] base 已含版本号(${b}),path 不可再带版本号(${p})`);
  }
  return `${b}/${p}`;
}

/**
 * ★ 推理模型的 token 下限 ★(2026-09-02 实测,影响全线)
 *
 * Agnes 2.x 是推理模型:它先花 token「想」,再输出正文。
 * max_tokens 给到 200 时,额度全被思考吃掉,返回 `finish_reason: "length"`
 * 且 **content 为空字符串** —— 不是报错,是安静地什么都不说。
 * 于是调用方拿到空文本,却看不出任何异常(实测 200→空,1200→5 秒返回完整 JSON)。
 *
 * 所以这里给所有调用兜一个下限:宁可多花几百 token,不要静默空转。
 */
const MIN_TOKENS = 1200;

/**
 * 本次 Worker 调用内的"死名单"(2026-09-02 教训):
 * Agnes 对 Worker 出口 IP 做边缘封禁时,每次请求 3ms 即 429 —— 不花时间,但**每次都花一个子请求名额**。
 * 免费档 Worker 单次调用只有 50 个子请求;chat() 每次尝试要挨个打 8 家,3 次重试就是 24 个,
 * 采集线光第一篇就把额度烧光,后面全部「Too many subrequests」。
 * 所以:同一次调用里,某家一旦 429/5xx/超时,后续直接跳过,不再白打。
 * 模块级 Set 在 Worker 里的生命周期就是"这一次调用附近",正好当作调用内缓存,不需要更精细。
 */
const deadAt = new Map<string, number>();
const DEAD_TTL = 5 * 60_000;   // 同一个 isolate 会服务多次请求,判死 5 分钟后重新给机会
const isDead = (id: string) => { const t = deadAt.get(id); return !!t && Date.now() - t < DEAD_TTL; };
const markDead = (id: string, status: number | string) => {
  if (status === 429 || status === 403 || status === 'abort' || (typeof status === 'number' && status >= 500)) deadAt.set(id, Date.now());
};

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  ms: number;
  /** 上游返回的 usage(2026-09-17 配方实验室要记 tokens_in/out);厂商不给就是 null。可选,现有调用方不受影响 */
  usage?: { in: number | null; out: number | null };
}

/** 落 ai_runs 用的可选参数(2026-09-18 治理层,GPT 原则:每次 AI 调用记 model+prompt 版本+输入哈希+tokens+耗时)。
    db 不传时从 env.DB 取(Worker 里 env 就是 cloudflare:workers 的 env);两者都没有就不记。 */
export type RunOpts = {
  promptKey?: string; promptVersion?: number;
  entity?: { type: string; id: string | number };
  inputHash?: string;
  db?: D1Database;
};

/** 一次调用一行 ai_runs。best-effort:没库、没表、写失败全部吞掉,永不抛、永不影响调用方;
    必须 await(先 return 再写,Worker 会把请求截断,行就丢了)。cost_est 只在 providers 填了单价时算。 */
async function logRun(env: FleetEnv, o: RunOpts, r: {
  provider?: Provider | null; model?: string | null; tokensIn?: number | null; tokensOut?: number | null;
  ms: number; ok: boolean; error?: string | null;
}): Promise<void> {
  try {
    const db = o.db ?? ((env as any).DB as D1Database | undefined);
    if (!db) return;
    const p = r.provider ?? null;
    const cost = p && p.priceIn != null && p.priceOut != null && r.tokensIn != null && r.tokensOut != null
      ? (r.tokensIn * p.priceIn) / 1e6 + (r.tokensOut * p.priceOut) / 1e6 : null;
    await db.prepare(
      `INSERT INTO ai_runs (prompt_key, prompt_version, provider, model, entity_type, entity_id, input_hash, tokens_in, tokens_out, cost_est, latency_ms, ok, error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      o.promptKey ?? null, o.promptVersion ?? (o.promptKey ? 1 : null), p?.id ?? null, r.model ?? null,
      o.entity?.type ?? null, o.entity?.id != null ? String(o.entity.id) : null, o.inputHash ?? null,
      r.tokensIn ?? null, r.tokensOut ?? null, cost, r.ms, r.ok ? 1 : 0, r.error ? r.error.slice(0, 200) : null,
    ).run();
  } catch { /* 记录失败不影响业务 */ }
}

/**
 * 对话补全 —— 分档降级的唯一入口。
 * 第 1 档失败(限流/超时/报错)自动切第 2 档,全部失败才抛错。
 * 失败原因逐条收集后一起抛,便于一次看清是"都限流了"还是"key 全错了"。
 */
export async function chat(
  env: FleetEnv,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  // timeoutMs:线上默认 45 秒(访客等不了更久),但选型评测要给大模型冷启动留时间 ——
  // NVIDIA 免费层的 DeepSeek V4 / gpt-oss-120b 首次调用要 60 秒以上才吐第一个字,
  // 用 45 秒去量它们,量到的是"冷启动快不快",不是"翻得好不好"。
  opts: { temperature?: number; maxTokens?: number; json?: boolean; fleet?: Provider[]; timeoutMs?: number; think?: boolean } & RunOpts = {},
): Promise<ChatResult> {
  // 优先用调用方传入的舰队(通常来自 loadFleet 读库);没传才回退环境变量
  const fleet = opts.fleet ?? buildFleet(env);
  if (!fleet.length) throw new Error('[fleet] 未配置任何模型 key');
  const tAll = Date.now();   // 整次调用耗时(含降级),最终失败行记它

  const errs: string[] = [];
  /* 每次最多只试 4 家活的:免费档 Worker 单次调用 50 次子请求,
     8 家挨个打一轮就是 8 次,3 次重试 24 次 —— 一篇稿就把额度烧光。4 家够降级用了。 */
  let tried = 0;
  /* 09-21 04:5x 商汤 4 个变体(sensenova / -ds / -dsflash / -kimi)共用一个 token plan:额度尽是整家尽,4 个变体各试 4 把 key 就把「最多 4 家」名额烧光,永远轮不到 Agnes。
     同家(id 首段)一旦全 key 429/402,本次调用里兄弟直接跳过,不占名额。 */
  const deadFamilies = new Set<string>(); const fam = (id: string) => id.split('-')[0];
  for (const p of fleet) {
    if (p.text === false) continue;                      // 生图/生视频行不做文本
    if (isDead(p.id)) { errs.push(`${p.id}:近5分钟已判死,跳过`); continue; }
    if (deadFamilies.has(fam(p.id))) { errs.push(`${p.id}:同家额度尽,跳过`); continue; }
    if (tried >= 4) { errs.push(`${p.id}:本次已试 4 家,停`); break; }
    tried += 1;
    const t0 = Date.now();
    try {
      const anthropic = p.dialect === 'anthropic';

      let url: string, headers: Record<string, string>, body: unknown;
      if (anthropic) {
        // system 必须从 messages 里拎出来放顶层 —— 留在 messages 里会被当成一条普通对话,
        // 那些"只输出 JSON""不要加价格"的硬规则就从指令降级成了建议。
        const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
        const turns = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
        url = endpoint(p.base, 'messages');
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': pickKey(p),
          'anthropic-version': '2023-06-01',
        };
        body = {
          model: p.model,
          max_tokens: Math.max(opts.maxTokens ?? 1200, MIN_TOKENS),   // 必填,不是可选
          temperature: opts.temperature ?? 0.3,
          ...(sys ? { system: sys } : {}),
          // 要 JSON 时预填一个左花括号:模型只能接着往下写,
          // 没有机会先来一句「好的,这是您要的 JSON:」再开始 —— 那句话会让解析直接失败。
          messages: opts.json ? [...turns, { role: 'assistant', content: '{' }] : turns,
        };
      } else {
        url = endpoint(p.base, 'chat/completions');
        headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` };
        /* 2026-09-17 配方实验室李总工兜底走商汤 kimi-k3:该网关的 Kimi 只认 temperature=1(别的值 400),
           且与 glm / deepseek-v4 一样是推理模型,思考要按同一对参数关掉 */
        const kimi = /^kimi-/.test(p.model);
        body = {
          model: p.model,
          messages,
          temperature: kimi ? 1 : (opts.temperature ?? 0.3),
          max_tokens: Math.max(opts.maxTokens ?? 1200, MIN_TOKENS),
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          /* Agnes 3.0 是推理模型,思考默认关:2026-09-10 实测不开 1.1–2.0s、开了 3–7s,
             国际端点开思考 37s+。对客路径要的是秒回;要深想的离线任务传 opts.think=true。 */
          ...(/^agnes-3/.test(p.model) ? { chat_template_kwargs: { enable_thinking: opts.think === true } } : {}),
          /* 2026-09-17 02:3x 配方实验室实测:商汤网关上的 glm-5.2 与 deepseek-v4-pro 也是推理模型,默认开思考 ——
             max_tokens 3000 / 6000 全被 reasoning 吃光,content 为空、finish=length,50–104 秒后回「空响应」。
             chat_template_kwargs 对它们只是「少想一点」(小提示词 49 tokens,大提示词照样想满 6000);
             真正关掉的是 reasoning_effort:'none' + thinking:{type:'disabled'} 一起给(单给 thinking 会 400
             「only be disabled when reasoning effort is none」):实测 reasoning 0、GLM 大提示词 48 秒出 5KB JSON。 */
          ...((kimi || /^(glm-|deepseek-v4)/.test(p.model)) && opts.think !== true ? { reasoning_effort: 'none', thinking: { type: 'disabled' } } : {}),
        };
      }

      /* 2026-09-17 11:5x 创始人:「注册一批 key 要能自动切换」。同一家配了多把 key 时,
         429 / 402 / 403(限流、额度尽、被拒)先换下一把 key 重发,全试完才跳下一家;
         其他状态码(400 参数错、404 模型名错)换 key 也没用,直接跳。 */
      let r: Response | null = null;
      for (let k = 0; k < Math.max(1, p.keys.length); k++) {
        if (k > 0) {
          const key = pickKey(p);
          if (anthropic) headers['x-api-key'] = key; else headers.Authorization = `Bearer ${key}`;
        }
        r = await fetch(url, {
          method: 'POST', headers, body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
        });
        if (r.ok || ![429, 402, 403].includes(r.status)) break;
        const why0 = (await r.text().catch(() => '')).replace(/\s+/g, ' ');
        errs.push(`${p.id}:key${k + 1} ${r.status} ${why0.slice(0, 60)}`);
        if (r.status === 402 || /exhausted|insufficient|quota|余额|欠费/i.test(why0)) deadFamilies.add(fam(p.id));
        r = null;
      }
      if (!r) { if (deadFamilies.has(fam(p.id))) tried -= 1; continue; }   // 额度尽的不算「试过一家」,把名额留给下一家
      if (!r.ok) {
        // 带上响应体的头一段:光有状态码查不出是 key 错、模型名错还是余额没了
        const why = await r.text().catch(() => '');
        errs.push(`${p.id}:${r.status} ${why.replace(/\s+/g, ' ').slice(0, 90)}`);
        continue;
      }
      const d = (await r.json()) as any;
      let text = anthropic
        ? (Array.isArray(d?.content) ? d.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('') : '')
        : (d?.choices?.[0]?.message?.content ?? '');
      // 预填的那个左花括号不会出现在返回里,得自己补回去
      if (anthropic && opts.json && text && !text.trimStart().startsWith('{')) text = '{' + text;
      if (!text) { errs.push(`${p.id}:空响应`); markDead(p.id, 429); if (isDead(p.id)) tried -= 1; continue; }
      // OpenAI 形状是 prompt_tokens / completion_tokens,Anthropic 是 input_tokens / output_tokens,两种都认
      const usage = {
        in: d?.usage?.prompt_tokens ?? d?.usage?.input_tokens ?? null,
        out: d?.usage?.completion_tokens ?? d?.usage?.output_tokens ?? null,
      };
      const ms = Date.now() - t0;
      await logRun(env, opts, { provider: p, model: p.model, tokensIn: usage.in, tokensOut: usage.out, ms, ok: true });   // 治理层:成功一行
      return { text, provider: p.id, model: p.model, ms, usage };
    } catch (e) {
      errs.push(`${p.id}:${e instanceof Error ? e.message.slice(0, 40) : '异常'}`);
      markDead(p.id, 'abort');
    }
  }
  await logRun(env, opts, { ms: Date.now() - tAll, ok: false, error: errs.join(' | ') });   // 治理层:最终失败也留行(错误前 200 字)
  throw new Error(`[fleet] 全部模型不可用 → ${errs.join(' | ')}`);
}

/** 出图。目前只有 Agnes 具备,没有则明确报错而不是静默返回空 */
/**
 * 读图 —— 把一张图 + 一段提问交给视觉模型,拿回文本。
 *
 * 走 OpenAI 的多模态消息格式(content 是数组),目前国内外主流兼容接口都认这个。
 * 只在具备 vision 能力的供应商之间降级 —— 让纯文本模型去读图只会白等一次超时。
 */
export async function vision(
  env: FleetEnv,
  imageDataUrl: string,
  prompt: string,
  opts: { system?: string; json?: boolean; maxTokens?: number; fleet?: Provider[] } & RunOpts = {},
): Promise<ChatResult> {
  const pool = (opts.fleet ?? buildFleet(env)).filter((p) => p.vision);
  if (!pool.length) throw new Error('[fleet] 没有配置具备读图能力的模型');
  const tAll = Date.now();

  const errs: string[] = [];
  for (const p of pool) {
    const t0 = Date.now();
    try {
      const anthropic = p.dialect === 'anthropic';
      let url: string, headers: Record<string, string>, body: unknown;

      if (anthropic) {
        // 图片不走 data: URL,要拆成 media_type + 纯 base64 两段分开传
        const m = /^data:([^;,]+);base64,(.+)$/s.exec(imageDataUrl);
        if (!m) { errs.push(`${p.id}:图片不是 base64 的 data URL`); continue; }
        url = endpoint(p.base, 'messages');
        headers = { 'Content-Type': 'application/json', 'x-api-key': pickKey(p), 'anthropic-version': '2023-06-01' };
        body = {
          model: p.visionModel ?? p.model,
          max_tokens: Math.max(opts.maxTokens ?? 900, MIN_TOKENS),
          temperature: 0.2,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [
            { role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
              { type: 'text', text: prompt },
            ] },
            ...(opts.json ? [{ role: 'assistant', content: '{' }] : []),
          ],
        };
      } else {
        const messages: any[] = [];
        if (opts.system) messages.push({ role: 'system', content: opts.system });
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        });
        url = endpoint(p.base, 'chat/completions');
        headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` };
        body = {
          model: p.visionModel ?? p.model,
          messages,
          temperature: 0.2,
          max_tokens: Math.max(opts.maxTokens ?? 900, MIN_TOKENS),
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        };
      }

      const r = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) {
        const why = await r.text().catch(() => '');
        errs.push(`${p.id}:${r.status} ${why.replace(/\s+/g, ' ').slice(0, 80)}`);
        continue;
      }
      const d = (await r.json()) as any;
      let text = anthropic
        ? (Array.isArray(d?.content) ? d.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('') : '')
        : (d?.choices?.[0]?.message?.content ?? '');
      if (anthropic && opts.json && text && !text.trimStart().startsWith('{')) text = '{' + text;
      if (!text) { errs.push(`${p.id}:空响应`); markDead(p.id, 429); continue; }
      const usage = { in: d?.usage?.prompt_tokens ?? d?.usage?.input_tokens ?? null, out: d?.usage?.completion_tokens ?? d?.usage?.output_tokens ?? null };
      const ms = Date.now() - t0, model = p.visionModel ?? p.model;
      await logRun(env, opts, { provider: p, model, tokensIn: usage.in, tokensOut: usage.out, ms, ok: true });   // 治理层
      return { text, provider: p.id, model, ms, usage };
    } catch (e) {
      errs.push(`${p.id}:${e instanceof Error ? e.message.slice(0, 40) : '异常'}`);
      markDead(p.id, 'abort');
    }
  }
  await logRun(env, opts, { ms: Date.now() - tAll, ok: false, error: errs.join(' | ') });   // 治理层
  throw new Error(`[fleet] 视觉模型全部不可用 → ${errs.join(' | ')}`);
}

export async function image(env: FleetEnv, prompt: string, fleet?: Provider[], opts: RunOpts = {}): Promise<string[]> {
  const p = (fleet ?? buildFleet(env)).find((x) => x.image);
  if (!p) throw new Error('[fleet] 当前舰队无出图能力(需配置 Agnes)');
  const t0 = Date.now();
  /* ★ n 必须为 1 ★(2026-09-02 实测)
     Agnes 出图接口对 n>1 直接 400:「n must be 1 when using text image queue」。
     此前写死 n:2,于是**每一次出图都静默失败** —— 而调用方 catch 掉异常只
     显示"没有图",没人知道是参数问题。要两张就并发调两次,一张失败另一张仍在。 */
  const key = pickKey(p);
  const once = async (): Promise<string[]> => {
    const r = await fetch(endpoint(p.base, 'images/generations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // 商汤 U1.5 / U1 Fast(2026-09-18 接入,创始人:「商汤还有其他的模型,你也要接入」):同一 images/generations 形状,
      // 但默认返回 b64_json 且默认打水印;U1 Fast 只认 2K 尺寸常量;拿 url(24h/1h 临时链接)由调用方转存 R2。
      body: JSON.stringify(/sensenova/.test(p.base) || /^sensenova-/.test(p.model)
        ? { model: p.model, prompt, n: 1, size: /u1-fast/.test(p.model) ? '2048x2048' : '1024x1024', response_format: 'url', watermark: false }
        : { model: p.model, prompt, n: 1, size: '1024x1024' }),
      signal: AbortSignal.timeout(/sensenova/.test(p.base) ? 180_000 : 120_000),
    });
    if (!r.ok) throw new Error(`[fleet] 出图失败 ${r.status}:${(await r.text()).slice(0, 160)}`);
    const d = (await r.json()) as any;
    return (d?.data ?? []).map((x: any) => x.url || (x.b64_json ? `data:image/png;base64,${x.b64_json}` : null)).filter(Boolean);
  };
  /* 只出一张,并对 429 退避重试一次 —— Agnes 的出图接口前面挂着 Cloudflare 限流
     (实测并发两张必 429 / code 1015,连续调用也会撞上)。
     一张稳过 > 两张常挂:客户要的是"看到方向",不是选美。 */
  // 治理层:出图没有 tokens,只记 provider / 耗时 / 成败(2026-09-18)
  try {
    let urls: string[];
    try {
      urls = await once();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/429|1015/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 4000));
      urls = await once();
    }
    await logRun(env, opts, { provider: p, model: p.model, ms: Date.now() - t0, ok: true });
    return urls;
  } catch (e) {
    await logRun(env, opts, { provider: p, model: p.model, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/**
 * HTTP 状态码 → 人话(创始人 2026-09-02:「模型返回429是什么?写个错误代码的代表」)。
 *
 * 后台体检以前只显示裸状态码,运营看到「HTTP 429」不知道该充值、该等、还是该改配置 ——
 * 而这四种情况的处置完全不同。码仍然保留在括号里,方便对着厂商文档查。
 */
function httpNote(status: number): string {
  const map: Record<number, string> = {
    400: '请求格式不对(多半是模型名或参数写错)',
    401: '密钥无效或已撤销 —— 需要重新填 key',
    402: '额度用尽 —— 需要充值或申请提额',
    403: '密钥没有这个模型的权限',
    404: '接口地址或模型名不存在(接口地址要填到 /v1 为止,别多拼版本号)',
    408: '厂商侧超时',
    413: '请求体过大',
    422: '参数不被这个模型接受',
    429: '调用太频繁或额度到顶 —— 免费档常见,等一会儿再试;持续 429 就是额度问题',
    500: '厂商服务器出错(不是我们的问题)',
    502: '厂商网关错误',
    503: '厂商服务暂时不可用',
    504: '厂商网关超时 —— 跨境线路慢时常见',
  };
  return `${map[status] ?? '异常'}(HTTP ${status})`;
}

/** 舰队体检 —— 后台「模型」页用。只报状态,不回显任何 key */
export async function health(env: FleetEnv, fleet?: Provider[]): Promise<
  { id: string; label: string; tier: number; keys: number; free: boolean; ok: boolean; ms: number; note: string }[]
> {
  const out = [];
  for (const p of (fleet ?? buildFleet(env))) {
    const t0 = Date.now();
    let ok = false, note = '';
    try {
      const r = await fetch(endpoint(p.base, 'chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` },
        body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
        signal: AbortSignal.timeout(20_000),
      });
      ok = r.ok;
      note = r.ok ? '正常' : httpNote(r.status);
      /* 生图/生视频模型用聊天接口探活必然 400「is an image/video model」——
         这不是坏,是通道活着且鉴权通过(2026-09-01 实测)。按就绪算。 */
      if (!ok && r.status === 400) {
        const t = await r.text().catch(() => '');
        if (/is an (image|video) model/i.test(t)) { ok = true; note = '通道就绪(生成型模型)'; }
      }
    } catch (e) {
      note = e instanceof Error ? e.message.slice(0, 40) : '连接失败';
    }
    out.push({
      id: p.id, label: p.label, tier: p.tier, keys: p.keys.length,
      free: !!p.free, ok, ms: Date.now() - t0, note,
    });
  }
  return out;
}

/**
 * 取单家供应商,**不看 enabled**(2026-09-17 配方实验室)。
 *
 * 为什么不走 loadFleet:实验室左右两栏要写死到 deepseek / dashscope 两行,而这两行永远保持 enabled=0
 * (enabled=1 会把它们混进翻译、询盘等对客链路的降级链)。key 为空返回 null,由调用方决定兜底到哪一行。
 * SELECT 与 map 与 loadFleet 同一段,只是少了 WHERE enabled=1。
 */
export async function loadProvider(db: D1Database, id: string): Promise<Provider | null> {
  const r = await db.prepare(
    `SELECT id,label,base_url,model,api_keys,tier,can_text,can_image,can_video,can_vision,vision_model,is_free,dialect,price_in,price_out
       FROM providers WHERE id = ?`).bind(id).first<any>();
  if (!r) return null;
  const keys = String(r.api_keys || '').split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean);
  if (!keys.length) return null;
  return {
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model, keys,
    text: r.can_text === null || r.can_text === undefined ? true : !!r.can_text,
    image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
    visionModel: r.vision_model || r.model, free: !!r.is_free,
    dialect: (r.dialect === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
    priceIn: r.price_in ?? null, priceOut: r.price_out ?? null,
  };
}
