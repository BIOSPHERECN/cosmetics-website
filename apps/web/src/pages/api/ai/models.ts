import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 可用模型清单（2026-10-30）—— 给前端渲染成**方块卡片**，不是下拉框。
 *
 * 数据来源两处，合并成一个扁平列表：
 *   ① design_providers 表：管理员配置的模型（加一行就出现在卡片里）
 *   ② providers 表：模型舰队里已配 key 的出图/读图模型（兜底，保证没配置时也有卡片）
 *
 * 返回字段刻意保持中性：id / label / task / ready / source，
 * 前端只负责把它画成卡片，不关心它来自哪张表。
 */
const json = (b: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', ...headers } });

/* 5 分钟进程内 memo —— 避免每次 /design 页加载都全表扫两张表 (成本#2 C2 审核) */
let memo: { data: any; expires: number } | null = null;
const TTL = 300_000;

export interface ModelCard {
  id: string;
  label: string;
  task: 'image' | 'video' | 'vision';
  tasks: string[];
  ready: boolean;
  missing?: string[];
  source: 'config' | 'fleet';
  note?: string | null;
}

export const GET: APIRoute = async () => {
  if (memo && Date.now() < memo.expires) return json({ ok: true, models: memo.data });

  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, models: [] });

  const models: ModelCard[] = [];
  const seen = new Set<string>();

  /* ① 配置化模型 */
  try {
    const { results } = await db.prepare(
      `SELECT id,label,tasks,kind,api_key,note FROM design_providers WHERE enabled=1 ORDER BY rowid`,
    ).all<any>();
    for (const r of results ?? []) {
      const tasks = String(r.tasks || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const task: ModelCard['task'] = tasks.some((t: string) => t.endsWith('v')) ? 'video'
        : tasks.some((t: string) => t === 'i2i') ? 'image' : 'image';
      models.push({
        id: String(r.id), label: String(r.label || r.id), task, tasks,
        ready: !!String(r.api_key || '').trim(),
        missing: String(r.api_key || '').trim() ? [] : [`${r.id}.api_key`],
        source: 'config', note: r.note ?? null,
      });
      seen.add(String(r.id));
    }
  } catch { /* 表不存在时静默降级 */ }

  /* ② 舰队里已配 key 的出图 / 读图模型 */
  try {
    const { results } = await db.prepare(
      `SELECT id,label,model,can_image,can_vision FROM providers
        WHERE enabled=1 AND api_keys<>'' AND (can_image=1 OR can_vision=1) ORDER BY tier`,
    ).all<any>();
    for (const r of results ?? []) {
      if (seen.has(String(r.id))) continue;
      models.push({
        id: String(r.id), label: String(r.label || r.model || r.id),
        task: r.can_image ? 'image' : 'vision',
        tasks: r.can_image ? ['t2i'] : ['vision'],
        ready: true, source: 'fleet', note: r.model ?? null,
      });
      seen.add(String(r.id));
    }
  } catch { /* 同上 */ }

  memo = { data: models, expires: Date.now() + TTL };
  return json({ ok: true, models });
};
