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
  /** 是否具备出图能力 */
  image?: boolean;
  video?: boolean;
  free?: boolean;
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
        `SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free
           FROM providers WHERE enabled = 1 ORDER BY tier, id`,
      )
      .all<{
        id: string; label: string; base_url: string; model: string; api_keys: string;
        tier: number; can_image: number; can_video: number; can_vision: number;
        vision_model: string | null; is_free: number;
      }>();

    const list: Provider[] = (results ?? [])
      .map((r) => ({
        id: r.id,
        label: r.label,
        tier: r.tier,
        base: r.base_url.replace(/\/+$/, ''),
        model: r.model,
        keys: (r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
        image: !!r.can_image,
        video: !!r.can_video,
        vision: !!r.can_vision,
        // 视觉模型往往和文本模型不是同一个;没单独填就退回文本模型试
        visionModel: r.vision_model || r.model,
        free: !!r.is_free,
      }))
      // 没填 key 的供应商不入列 —— 留在库里是为了保留配置,但不参与降级链,
      // 否则每次调用都要先失败一遍才轮到下一家,白白多几秒延迟。
      .filter((p) => p.keys.length > 0);

    return list.length ? list : buildFleet(env);
  } catch {
    return buildFleet(env);
  }
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

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  ms: number;
}

/**
 * 对话补全 —— 分档降级的唯一入口。
 * 第 1 档失败(限流/超时/报错)自动切第 2 档,全部失败才抛错。
 * 失败原因逐条收集后一起抛,便于一次看清是"都限流了"还是"key 全错了"。
 */
export async function chat(
  env: FleetEnv,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { temperature?: number; maxTokens?: number; json?: boolean; fleet?: Provider[] } = {},
): Promise<ChatResult> {
  // 优先用调用方传入的舰队(通常来自 loadFleet 读库);没传才回退环境变量
  const fleet = opts.fleet ?? buildFleet(env);
  if (!fleet.length) throw new Error('[fleet] 未配置任何模型 key');

  const errs: string[] = [];
  for (const p of fleet) {
    const t0 = Date.now();
    try {
      const r = await fetch(endpoint(p.base, 'chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: opts.temperature ?? 0.3,
          max_tokens: opts.maxTokens ?? 1200,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) { errs.push(`${p.id}:${r.status}`); continue; }
      const d = (await r.json()) as any;
      const text = d?.choices?.[0]?.message?.content ?? '';
      if (!text) { errs.push(`${p.id}:空响应`); continue; }
      return { text, provider: p.id, model: p.model, ms: Date.now() - t0 };
    } catch (e) {
      errs.push(`${p.id}:${e instanceof Error ? e.message.slice(0, 40) : '异常'}`);
    }
  }
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
  opts: { system?: string; json?: boolean; maxTokens?: number; fleet?: Provider[] } = {},
): Promise<ChatResult> {
  const pool = (opts.fleet ?? buildFleet(env)).filter((p) => p.vision);
  if (!pool.length) throw new Error('[fleet] 没有配置具备读图能力的模型');

  const errs: string[] = [];
  for (const p of pool) {
    const t0 = Date.now();
    try {
      const messages: any[] = [];
      if (opts.system) messages.push({ role: 'system', content: opts.system });
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      });
      const r = await fetch(endpoint(p.base, 'chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` },
        body: JSON.stringify({
          model: p.visionModel ?? p.model,
          messages,
          temperature: 0.2,
          max_tokens: opts.maxTokens ?? 900,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) { errs.push(`${p.id}:${r.status}`); continue; }
      const d = (await r.json()) as any;
      const text = d?.choices?.[0]?.message?.content ?? '';
      if (!text) { errs.push(`${p.id}:空响应`); continue; }
      return { text, provider: p.id, model: p.visionModel ?? p.model, ms: Date.now() - t0 };
    } catch (e) {
      errs.push(`${p.id}:${e instanceof Error ? e.message.slice(0, 40) : '异常'}`);
    }
  }
  throw new Error(`[fleet] 视觉模型全部不可用 → ${errs.join(' | ')}`);
}

export async function image(env: FleetEnv, prompt: string, fleet?: Provider[]): Promise<string[]> {
  const p = (fleet ?? buildFleet(env)).find((x) => x.image);
  if (!p) throw new Error('[fleet] 当前舰队无出图能力(需配置 Agnes)');
  const r = await fetch(endpoint(p.base, 'images/generations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(p)}` },
    body: JSON.stringify({ prompt, n: 2, size: '1024x1024' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`[fleet] 出图失败 ${r.status}:${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as any;
  return (d?.data ?? []).map((x: any) => x.url).filter(Boolean);
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
      note = r.ok ? '正常' : `HTTP ${r.status}`;
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
