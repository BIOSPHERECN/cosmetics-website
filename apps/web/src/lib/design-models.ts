/**
 * 设计任务模型适配层（2026-10-29）。
 *
 * 目的：把「业务要什么图/视频」和「用哪个模型」解耦。
 * 以后接入新模型（商汤新版本、Liblib、LibTV、可灵、即梦…）只在这里加一条注册，
 * 业务端点（/api/ai/ecom-set、/api/ai/video…）不用改。
 *
 * 任务类型：
 *   t2i       文生图
 *   i2i       图生图（上传产品图 → 换场景/换风格）
 *   t2v       文生视频
 *   i2v       图生视频（产品图 → 动态展示）
 *   upscale   高清放大
 *   bgremove  去背景
 *   vectorize 位图转矢量
 *
 * 约定：run() 返回**结果 URL 数组**（临时链接由调用方负责转存）；失败抛错，由端点统一兜底。
 */

export type DesignTask = 't2i' | 'i2i' | 't2v' | 'i2v' | 'upscale' | 'bgremove' | 'vectorize';

export const TASK_LABEL: Record<DesignTask, string> = {
  t2i: '文生图', i2i: '图生图', t2v: '文生视频', i2v: '图生视频',
  upscale: '高清放大', bgremove: '去背景', vectorize: '转矢量',
};

export interface DesignRequest {
  task: DesignTask;
  prompt?: string;
  /** i2i / i2v / upscale / bgremove / vectorize 的输入图（公开可访问 URL 或 data URI） */
  imageUrl?: string;
  /** t2v / i2v 时长（秒） */
  duration?: number;
  aspect?: '1:1' | '16:9' | '9:16' | '4:3';
  n?: number;
}

export interface DesignProvider {
  id: string;
  label: string;
  tasks: DesignTask[];
  /** 密钥/地址是否齐备 */
  ready(env: any): boolean;
  /** 缺什么（给端点返回可读提示） */
  missing(env: any): string[];
  run(env: any, req: DesignRequest): Promise<string[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ────────────────────────── 文生图：复用 fleet ──────────────────────────
   密钥在 D1 providers 表里（sensenova-u1.5-lite 为 tier 1，agnes 为兜底），
   这里只做一层转接，不另建一套密钥来源 —— 否则两处配置必然漂移。*/
const fleetT2i: DesignProvider = {
  id: 'fleet-t2i',
  label: '模型舰队（文生图）',
  tasks: ['t2i'],
  ready(env) { return !!env?.DB; },
  missing(env) { return this.ready(env) ? [] : ['DB']; },
  async run(env, req) {
    if (req.task !== 't2i') throw new Error('fleet-t2i 只支持文生图');
    const { loadFleet, paidFirst, image } = await import('./fleet');
    const fleet = paidFirst(await loadFleet(env?.DB, env)).filter((p: any) => p.image && p.keys?.length);
    if (!fleet.length) throw new Error('舰队里没有可用的出图模型');
    const urls = await image(env, req.prompt ?? '', fleet as any, {} as any);
    return urls;
  },
};

/* ────────────────────────── 视频：Seedance（火山引擎） ──────────────────────────
   2026-10-30 新增。同类工具站已接入 Seedance 2.0（字节跳动 / 火山引擎方舟），
   说明这条视频链路是可用且成本可接受的，所以我们按正式 provider 接，不再只留占位。

   接入方式（火山引擎方舟「内容生成任务」异步接口）：
     1) wrangler secret put ARK_API_KEY          （火山引擎方舟 API Key）
     2) 可选 ARK_BASE（默认 https://ark.cn-beijing.volces.com/api/v3）
     3) 可选 SEEDANCE_MODEL（默认 doubao-seedance-1-0-pro-250528，
        升级到 2.0 时只改这个环境变量，不动代码）
   流程：POST /contents/generations/tasks → 轮询 GET /contents/generations/tasks/{id}。 */
const seedance: DesignProvider = {
  id: 'seedance',
  label: 'Seedance（火山引擎）',
  tasks: ['t2v', 'i2v'],
  ready(env) { return !!env?.ARK_API_KEY; },
  missing(env) { return this.ready(env) ? [] : ['ARK_API_KEY']; },
  async run(env, req) {
    if (!this.ready(env)) throw new Error('Seedance 未接入：缺少 ARK_API_KEY');
    const key = env.ARK_API_KEY;
    const base = (env?.ARK_BASE || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
    const model = env?.SEEDANCE_MODEL || 'doubao-seedance-1-0-pro-250528';
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

    const content: any[] = [{ type: 'text', text: req.prompt ?? '' }];
    if (req.task === 'i2v') {
      if (!req.imageUrl) throw new Error('图生视频需要 imageUrl');
      content.push({ type: 'image_url', image_url: { url: req.imageUrl } });
    }
    const body: Record<string, unknown> = { model, content };
    if (req.duration) body.duration = req.duration;
    if (req.aspect) body.ratio = req.aspect;

    const sub = await fetch(`${base}/contents/generations/tasks`, {
      method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    if (!sub.ok) throw new Error(`seedance 提交失败 ${sub.status}:${(await sub.text().catch(() => '')).slice(0, 140)}`);
    const sj: any = await sub.json();
    const id = sj?.id || sj?.task_id;
    if (!id) throw new Error('seedance 未返回任务 id');

    /* 轮询：40 次 × 3 秒 = 120 秒上限（Worker 单请求硬限制内） */
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const st = await fetch(`${base}/contents/generations/tasks/${id}`, { headers: H, signal: AbortSignal.timeout(30_000) });
      if (!st.ok) continue;
      const sj2: any = await st.json();
      const status = String(sj2?.status ?? '');
      if (status === 'succeeded') {
        const url = sj2?.content?.video_url || sj2?.content?.[0]?.video_url || sj2?.video_url;
        if (url) return [url];
        throw new Error('seedance 成功但未返回视频地址');
      }
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(`seedance 任务失败:${sj2?.error?.message || status}`);
      }
    }
    throw new Error('seedance 轮询超时（120s）');
  },
};

/* ────────────────────────── 视频：LibTV（预留） ──────────────────────────
   2026-10-29 预留接口。当前**未接入**，端点会返回 need:'config'，不会假装能出视频。
   接入步骤（拿到 LibTV 文档后只改这一处）：
     1. wrangler secret put LIBTV_API_KEY
     2. 可选 LIBTV_BASE（默认 https://api.libtv.com/v1）、LIBTV_MODEL
     3. 若其请求/响应形状与下面的 OpenAI 兼容形状不同，只改本 run() 的 body 与解析。
   设计上按「提交任务 → 轮询拿结果」两步走：多数视频模型是异步的，同步接口很少。*/
const libtv: DesignProvider = {
  id: 'libtv',
  label: 'LibTV 视频',
  tasks: ['t2v', 'i2v'],
  ready(env) { return !!env?.LIBTV_API_KEY; },
  missing(env) { return this.ready(env) ? [] : ['LIBTV_API_KEY']; },
  async run(env, req) {
    if (!this.ready(env)) throw new Error('LibTV 未接入：缺少 LIBTV_API_KEY');
    const key = env.LIBTV_API_KEY;
    const base = (env?.LIBTV_BASE || 'https://api.libtv.com/v1').replace(/\/+$/, '');
    const model = env?.LIBTV_MODEL || 'libtv-v1';
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt ?? '',
      duration: req.duration ?? 5,
      aspect_ratio: req.aspect ?? '1:1',
    };
    if (req.task === 'i2v') {
      if (!req.imageUrl) throw new Error('图生视频需要 imageUrl');
      body.image_url = req.imageUrl;
    }

    const submit = await fetch(`${base}/videos/generations`, {
      method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    if (!submit.ok) throw new Error(`libtv submit ${submit.status}:${(await submit.text().catch(() => '')).slice(0, 140)}`);
    const sj: any = await submit.json();
    const immediate = (sj?.data ?? []).map((x: any) => x.url).filter(Boolean);
    if (immediate.length) return immediate;

    const jobId = sj?.id || sj?.task_id || sj?.data?.[0]?.id;
    if (!jobId) throw new Error('libtv 未返回任务 id');
    /* 轮询：最多 40 次 × 3 秒 = 120 秒（Worker 单请求硬上限内） */
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const st = await fetch(`${base}/videos/generations/${jobId}`, { headers: H, signal: AbortSignal.timeout(30_000) });
      if (!st.ok) continue;
      const sj2: any = await st.json();
      const status = String(sj2?.status ?? '');
      const urls = (sj2?.data ?? sj2?.output?.urls ?? []).map((x: any) => (typeof x === 'string' ? x : x?.url)).filter(Boolean);
      if (['succeeded', 'success', 'completed', 'done'].includes(status) && urls.length) return urls;
      if (['failed', 'error', 'canceled'].includes(status)) throw new Error(`libtv 任务失败:${sj2?.error ?? status}`);
    }
    throw new Error('libtv 轮询超时（120s）');
  },
};

/** 注册表 —— 新增模型只在这里加一行 */
const REGISTRY: DesignProvider[] = [fleetT2i, seedance, libtv];

/* ────────────────────────── 配置化 provider（网关式） ──────────────────────────
   2026-10-30：目标「有 key 就能接」——加一行配置即生效，不改代码、不重新部署逻辑。
   表 design_providers：
     id / label / tasks(逗号分隔) / kind / base_url / model / api_key / extra_json / enabled
   kind 支持：
     openai-images  POST {base}/images/generations，取 data[].url
     ark-tasks      火山引擎方舟异步任务：POST /contents/generations/tasks → 轮询
     openai-video   通用异步：POST /videos/generations → 轮询
   密钥存表里（与既有的 providers 表同一做法），不写进代码。 */
function makeGeneric(row: any): DesignProvider {
  const tasks = String(row.tasks || '').split(',').map((s: string) => s.trim()).filter(Boolean) as DesignTask[];
  return {
    id: String(row.id),
    label: String(row.label || row.id),
    tasks,
    ready() { return !!String(row.api_key || '').trim(); },
    missing() { return this.ready() ? [] : [`${row.id}.api_key`]; },
    async run(_env, req) {
      const key = String(row.api_key || '').trim();
      if (!key) throw new Error(`${row.id} 未配置 api_key`);
      const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      const base = String(row.base_url || '').replace(/\/+$/, '');
      let extra: Record<string, unknown> = {};
      try { extra = JSON.parse(row.extra_json || '{}') || {}; } catch { extra = {}; }

      if (row.kind === 'openai-images') {
        const r = await fetch(`${base}/images/generations`, {
          method: 'POST', headers: H, signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({ model: row.model, prompt: req.prompt ?? '', n: 1, size: '1024x1024', response_format: 'url', ...extra }),
        });
        if (!r.ok) throw new Error(`${row.id} ${r.status}:${(await r.text().catch(() => '')).slice(0, 140)}`);
        const d: any = await r.json();
        return (d?.data ?? []).map((x: any) => x.url || (x.b64_json ? `data:image/png;base64,${x.b64_json}` : '')).filter(Boolean);
      }

      if (row.kind === 'ark-tasks' || row.kind === 'openai-video') {
        const isArk = row.kind === 'ark-tasks';
        const submitPath = isArk ? '/contents/generations/tasks' : '/videos/generations';
        const statusPath = (tid: string) => (isArk ? `/contents/generations/tasks/${tid}` : `/videos/generations/${tid}`);
        let body: Record<string, unknown>;
        if (isArk) {
          const content: any[] = [{ type: 'text', text: req.prompt ?? '' }];
          if (req.imageUrl) content.push({ type: 'image_url', image_url: { url: req.imageUrl } });
          body = { model: row.model, content, ...extra };
        } else {
          body = { model: row.model, prompt: req.prompt ?? '', ...(req.imageUrl ? { image_url: req.imageUrl } : {}), ...extra };
        }
        if (req.duration) body.duration = req.duration;
        if (req.aspect) body.ratio = req.aspect;

        const sub = await fetch(`${base}${submitPath}`, {
          method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
        });
        if (!sub.ok) throw new Error(`${row.id} 提交 ${sub.status}:${(await sub.text().catch(() => '')).slice(0, 140)}`);
        const sj: any = await sub.json();
        const tid = sj?.id || sj?.task_id || sj?.data?.[0]?.id;
        if (!tid) throw new Error(`${row.id} 未返回任务 id`);

        /* 成本纪律(2026-11-02 审核):40×3s=120s 太长,改 20 次指数退避(1s→4s 封顶,总等待约 75s) */
        for (let i = 0; i < 20; i++) {
          await sleep(Math.min(1000 * Math.pow(2, i), 4000));
          const st = await fetch(`${base}${statusPath(tid)}`, { headers: H, signal: AbortSignal.timeout(30_000) });
          if (!st.ok) continue;
          const sj2: any = await st.json();
          const status = String(sj2?.status ?? '').toLowerCase();
          const url = sj2?.content?.video_url || sj2?.content?.[0]?.video_url || sj2?.video_url || sj2?.data?.[0]?.url;
          if (url && ['succeeded', 'success', 'completed', 'done'].includes(status)) return [url];
          if (['failed', 'cancelled', 'error'].includes(status)) throw new Error(`${row.id} 任务失败:${sj2?.error?.message || status}`);
        }
        throw new Error(`${row.id} 轮询超时（约 75s）`);
      }
      throw new Error(`未知 kind: ${row.kind}`);
    },
  };
}

/** 从 design_providers 表加载启用的配置化 provider（失败不影响内置） */
async function loadConfigured(env: any): Promise<DesignProvider[]> {
  const db = env?.DB;
  if (!db) return [];
  try {
    const { results } = await db.prepare(
      `SELECT id,label,tasks,kind,base_url,model,api_key,extra_json FROM design_providers WHERE enabled=1 ORDER BY rowid`,
    ).all();
    return (results ?? []).map(makeGeneric);
  } catch { return []; }
}

/** 全部 provider：配置化在前（后加的优先），内置在后 */
async function allProviders(env: any): Promise<DesignProvider[]> {
  return [...(await loadConfigured(env)), ...REGISTRY];
}

export async function providersFor(task: DesignTask, env: any): Promise<DesignProvider[]> {
  return (await allProviders(env)).filter((p) => p.tasks.includes(task));
}

export async function pickProvider(task: DesignTask, env: any): Promise<DesignProvider | null> {
  const list = await providersFor(task, env);
  return list.find((p) => p.ready(env)) ?? null;
}

/** 给前端/后台看的「当前能做什么」清单 —— 不撒谎：没配就是 ready:false */
export async function capabilities(env: any): Promise<{ task: DesignTask; label: string; providers: { id: string; label: string; ready: boolean; missing: string[] }[] }[]> {
  const all = await allProviders(env);
  const tasks: DesignTask[] = ['t2i', 'i2i', 't2v', 'i2v', 'upscale', 'bgremove', 'vectorize'];
  return tasks.map((task) => ({
    task,
    label: TASK_LABEL[task],
    providers: all.filter((p) => p.tasks.includes(task)).map((p) => ({ id: p.id, label: p.label, ready: p.ready(env), missing: p.missing(env) })),
  }));
}

/** 统一执行入口：选到能用的 provider 就跑，否则抛可读错误 */
export async function runDesign(env: any, req: DesignRequest): Promise<{ provider: string; urls: string[] }> {
  const p = await pickProvider(req.task, env);
  if (!p) {
    const missing = (await providersFor(req.task, env)).flatMap((x) => x.missing(env));
    throw new Error(`没有可用的「${TASK_LABEL[req.task]}」模型${missing.length ? `（缺 ${missing.join('/')}）` : ''}`);
  }
  const urls = await p.run(env, req);
  return { provider: p.id, urls };
}
